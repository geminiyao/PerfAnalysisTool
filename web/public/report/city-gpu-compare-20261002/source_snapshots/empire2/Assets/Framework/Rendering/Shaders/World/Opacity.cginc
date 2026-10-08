#ifndef _OPACITY_CGINC
#define _OPACITY_CGINC

// Macros in this file:
// VERTEX_ANIM_ON
// ANIM_INST_ON
// BAKE_ON
// FX_MASK_ON
// TEAMCOLOR_ON
// TEAMMASK_ON
// USE_LOGO_TEX
// _CUSTOM_LOGO_COL_ON
// TEX_TRANSPARENT_ON
// UNIFORM_TRANSPARENT_ON
// TEX_EMISSIVE_ON
// AO_IN_EMISSIVE_TEX
// DECAL_ON

// TEXT_TEXTURE_ON
// ROLE_FX_ON



#ifdef DECAL_PROJECT
half _DECAL_PROJECT_OFFSET;
float4 _VTFollowOffset;
#endif

#if defined(DECAL_PROJECT) || defined(_HEIGHTBLEND_ON)
#include "../Terrain/VTCommon.cginc"
#endif

#ifdef PLANAR_REFLECTION_STRENGTH_ON
#define FS_INPUT_EXT_PARAMS \
half2 ReflectionMask;
#endif

// #ifdef VERTEX_ANIM_ON || DECAL_PROJECT 
#if defined (VERTEX_ANIM_ON) || defined (DECAL_PROJECT)
    #define GET_VS_MATERIAL_INPUT_PARAMETER(i,j) GetVSMaterialInputParameter(i,j)
#endif

#if defined(ANIM_INST_ON) || defined(USE_VERTEX_ANIM)
    #define GET_VS_LOCAL_MATERIAL_INPUT_PARAMETER(i) GetVSLocalMaterialInputParameterFunc(i)
#endif

#define GET_FS_MATERIAL_INPUT_PARAMETER(i) GetFSMaterialInputParameter(i)


#if defined(DECAL_PROJECT) || defined(_HEIGHTBLEND_ON)
#include "../Terrain/VTCommon.cginc"
// #include "Projector/DepthRayMarching.cginc"
#endif

#include "../Base/Common.cginc"
#include "../Base/WeatherAndNight.cginc"
#include "../Base/InstanceBuffers.cginc"
#ifdef ANIM_INST_ON
    #include "../Base/AnimatorInstance.cginc"
#endif


#ifdef USE_VERTEX_ANIM
    #include "../Base/VertexAnim.cginc"
#endif

#ifdef RAIN_EFFECT_ON
#include "../Base/RainyPuddleInclude.cginc"
#endif

// #ifdef ROLE_FX_ON
// #include "../Base/RoleFX.cginc"
// #endif

/////////////////////////////////////////////////////////////////
// Animator Instance.
#if defined(ANIM_INST_ON) || defined(USE_VERTEX_ANIM)
VSLocalMaterialInputParameter GetVSLocalMaterialInputParameterFunc(inout VertexShaderInput input)
{
    VSLocalMaterialInputParameter o;
    #ifdef USE_VERTEX_ANIM
        o.NewLocalPosition = VertexAnim(input);
    #else
        o.NewLocalPosition = Skinning(input);
    #endif
    
    return o;
}
#endif

/////////////////////////////////////////////////////////////////
// Saturate Color.

#ifdef _SATURATION_ON
inline half3 SaturateColor(half3 inColor)
{
    half grayscale = dot(half3(0.21, 0.71, 0.07), inColor);
    inColor = lerp(inColor, half3(grayscale, grayscale, grayscale), _Saturation);
    return inColor;
}
#endif

/////////////////////////////////////////////////////////////////
// Vertex Animation.

#if defined(VERTEX_ANIM_ON) || defined (DECAL_PROJECT)

#if defined(VERTEX_ANIM_ON) 
half3 VertexAnimationTexture(float numberTargets, float time, float2 uv)
{
    float index = floor(time);
    float factor = frac(time);
    float anim1 = (index - 0.5) / numberTargets;
    float anim2 = (index - 1.5) / numberTargets;
    float4 uv1 = float4(uv.x, anim1, 0, 0);
    float4 uv2 = float4(uv.x, anim2, 0, 0);
    float3 offset1 = tex2Dlod(_MorphTex, uv1).xyz;
    float3 offset2 = tex2Dlod(_MorphTex, uv2).xyz;
    float3 offsetLerp = lerp(offset1, offset2, factor);
    half3 worldPosOffset = mul((float3x3)unity_ObjectToWorld, offsetLerp * 0.01);
    return worldPosOffset;
}
#endif

#ifdef WAVE_ANIM_ON
half3 VertexWaveNoise(float2 timeInput, float3 vertexpos, float2 uv)
{
    float4 uv2 = float4(uv * _NoiseTilling + timeInput.x * _Speed, 0, 0);
    float noise = tex2Dlod(_NoiseTex, uv2).x;
    float3 wave_ref = float3(vertexpos.x*0.5 + 0.5, vertexpos.y / 10, vertexpos.z *0.5 + 0.5);
    float origin_mask = smoothstep(1 - _EndPoint, 1 -_StartPoint,  dot(wave_ref, _WaveOrientation.xyz));
    float wave_mask = origin_mask * _WaveOrientation.w + (1 - origin_mask) *  (1 - _WaveOrientation.w);

    float x_value = dot(_WaveOrientation.xyz, vertexpos.xyz);
    float local_z = vertexpos.z + ((cos(x_value * _Frequency + timeInput.y * _Speed) + _ZOffset) * _Amplitude + noise * _NoiseStrength) * wave_mask * (1-_WaveOrientation.z);
    float local_x = vertexpos.x + (cos(x_value * _Frequency + timeInput.y * _Speed) * _Amplitude + noise * _NoiseStrength) * wave_mask * (1-_WaveOrientation.x);
    float local_y = vertexpos.y + (cos(x_value * _Frequency + timeInput.y * _Speed) * _Amplitude + noise * _NoiseStrength) * wave_mask * (1-_WaveOrientation.y);
    
    float3 outvertexpos = float3(local_x,local_y,local_z);
  
    half3 worldPosOffset = mul((float3x3)unity_ObjectToWorld, outvertexpos * 0.01);
    return worldPosOffset;


}
#endif

VSMaterialInputParameter GetVSMaterialInputParameter(VertexShaderInput input, VertexShaderMaterialParameter parameter)
{
    VSMaterialInputParameter o = DefaultVSMaterialInputParameterFunc(input, parameter);

    float2 uv = float2(input.UV1.x, 0);

#ifdef DECAL_PROJECT
    // 使用 per-instance LocalToWorld（由调用方填入 matParam.InstanceLocalToWorld；
    // 传统路径 = unity_ObjectToWorld，VG DirectDraw 路径 = instanceData.LocalToWorld）。
    // 不要直接用 unity_ObjectToWorld，否则在 VG DrawMeshInstancedIndirect 下拿到的不是 per-instance 矩阵。
    float4x4 _decalProjectL2W = parameter.InstanceLocalToWorld;
    #ifdef UNIFIED_VT_OFFSET_ON
        // 整 mesh 共用一个采样点：以 GameObject 世界原点采样一次 VT 高度，
        // 所有顶点共享同一 Y 偏移，避免逐顶点贴地造成的 mesh 形变。
        // 注意：后续会再叠加 mul(_decalProjectL2W, input.Vertex).y 作为"体积补偿"项，
        // 在原 per-vertex 公式中，该补偿恰好与逐顶点的 (vtResult.worldY - parameter.WorldPosition.y)
        // 内部抵消一份顶点局部 Y；而本分支的 worldOffsetY 已经是"GO原点贴地差值"，不再需要额外的
        // 体积补偿。这里预先扣掉一份 mul(worldRS, localPos).y，使最终 ΔY = vtResult.worldY -
        // sampleWorldPos.y + _DECAL_PROJECT_OFFSET，整 mesh 作为刚体平移到 GO 原点对应的地面。
        // _VTFollowOffset.xyz 作为本地空间偏移，经 RS 矩阵转换到世界空间，自动跟随 GO 的旋转缩放。
        float3 sampleWorldPos = float3(_decalProjectL2W._m03, _decalProjectL2W._m13, _decalProjectL2W._m23) + mul((float3x3)_decalProjectL2W, _VTFollowOffset.xyz);
        TerrainVTResult vtResult = SampleFromVTByWorldPos(sampleWorldPos);
        float3x3 _unifiedVTOffset_RS = (float3x3)_decalProjectL2W;
        float worldOffsetY = vtResult.worldY - sampleWorldPos.y - mul(_unifiedVTOffset_RS, input.Vertex.xyz).y;
    #else
        // 原行为：逐顶点采样 VT 高度
        TerrainVTResult vtResult = SampleFromVTByWorldPos(parameter.WorldPosition);
        float worldOffsetY = vtResult.worldY - parameter.WorldPosition.y;
    #endif

    // DepthTexture方案，临时，后续替换为VT方案
    // float groundY = getGroundPositionAdaptive(parameter.WorldPosition, UNITY_MATRIX_VP, _InvVP).y;
    // float worldOffsetY = groundY - parameter.WorldPosition.y;
#endif

#ifdef VERTEX_ANIM_ON    
    
    #ifdef WAVE_ANIM_ON
        o.WorldPositionOffset = VertexWaveNoise(parameter.TimeInput.xy, input.Vertex.xyz,input.UV1.xy);
    #else
        #ifdef VERTEX_ANIMATION_MANUAL_MODE
        float time = _FrameTime;
        #else
        float time = parameter.TimeInput.y * _FrameRate;
        float variationAmount = frac(unity_ObjectToWorld[0].w + unity_ObjectToWorld[1].w + unity_ObjectToWorld[2].w);
        float variation = variationAmount * _FrameNum;
        time += variation;
        #endif
        half3 worldPosOffset = VertexAnimationTexture(_FrameNum, time, uv);
        o.WorldPositionOffset = worldPosOffset;
    #endif

#endif
    
#ifdef DECAL_PROJECT
    // 先贴地
    o.WorldPositionOffset.y += (worldOffsetY + _DECAL_PROJECT_OFFSET) * _TERRAIN_VT_HEIGHT_SCALE;

    // 再补偿体积，原地旋转缩放后的y值：localPos * worldRS，不考虑worldT
    // 这里继续用 per-instance LocalToWorld（_decalProjectL2W 在前面已经赋值），
    // 与 UNIFIED_VT_OFFSET_ON 分支预扣的 mul(_unifiedVTOffset_RS, input.Vertex).y 形成抵消，
    // 使整 mesh 实现刚体平移；非 UNIFIED 分支下则是逐顶点贴地后的体积补偿。
    float3x3 tmpM = (float3x3)_decalProjectL2W;
    o.WorldPositionOffset.y += mul(tmpM, input.Vertex.xyz).y * _TERRAIN_VT_HEIGHT_SCALE;
#endif
    
    return o;
}

#endif

/////////////////////////////////////////////////////////////////
// Material input.
float2 RotateUV(float2 texcoord, float theta)
{
    float2 sc;
    sincos(theta * 3.141592653, sc.x, sc.y);
    float2 uv = texcoord - 0.5;
    float2 rotateduv;
    rotateduv.x = dot(uv, float2(sc.y, -sc.x));
    rotateduv.y = dot(uv, sc.xy);
    rotateduv += 0.5;
    return rotateduv;
}

#ifdef WORLDPOS_HUE_VARIATION
void AppleWorldPosHueVariation(inout half4 albedo, half hueVariation, half4 hueTex) {
    half3 shiftedColor = lerp(albedo.rgb, hueTex.rgb, hueVariation);
    
    #if SHADER_LOD > 200
    half maxBase = max(albedo.r, max(albedo.g, albedo.b));
    half newMaxBase = max(shiftedColor.r, max(shiftedColor.g, shiftedColor.b));
    maxBase /= newMaxBase;
    maxBase = maxBase * 0.5 + 0.5;
    shiftedColor.rgb *= maxBase;
    #endif
    albedo.rgb = saturate(shiftedColor);
}
#endif

FSMaterialInputParameter GetFSMaterialInputParameter(FragmentShaderInput i)
{
    FSMaterialInputParameter o = GetDefaultFSMaterialInputParameter();

#ifdef USE_LOGO_TEX
    half2 uv_logo = TRANSFORM_TEX(i.UV1, _LogoTex);
    half4 customUVTransform = UNITY_ACCESS_INSTANCED_PROP(CustomUVTransformProps, _CustomUVTransform);
    uv_logo = uv_logo * customUVTransform.xy + customUVTransform.zw;

    half4 logoTex = Tex2Dbias(_LogoTex, uv_logo, _TextureLodBias);
    half logoMask = logoTex.a;    
#endif

        half2 uv = TRANSFORM_TEX(i.UV0, _MainTex);
#ifdef CUSTOM_UV_TRANSFORM_ON
    half4 customUVTransform = UNITY_ACCESS_INSTANCED_PROP(CustomUVTransformProps, _CustomUVTransform);
    uv = uv * customUVTransform.xy + customUVTransform.zw;
#endif
    half4 highlightColor = UNITY_ACCESS_INSTANCED_PROP(ColorProps, _HighlightColor);
    half4 albedoTex = Tex2Dbias(_MainTex, uv, _TextureLodBias);

#ifdef MODEL_FONT_TEXT
    half fontDistance = tex2D(_FontTex, i.FontTexUV.xy).a;
    half4 fontCurveTex = tex2D(_CurveTex, i.FontCurveTexUV.xy);
    half4 fontOutlineTex = tex2D(_CurveOutlineTex, i.FontCurveTexUV.zw);

    half fontIntensity = smoothstep(_FontEdgeCenter - _FontEdge, _FontEdgeCenter + _FontEdge, fontDistance);
    half4 fontColor = lerp(fontOutlineTex, fontCurveTex, fontIntensity);

    half fontOutlineIntensity = smoothstep(_FontEdgeCenter - _CurveOutlineWidth - _FontEdge,
        _FontEdgeCenter - _CurveOutlineWidth + _FontEdge, fontDistance);
    albedoTex.xyz = lerp(albedoTex.xyz, fontColor.xyz, fontOutlineIntensity);
#endif

#ifdef _SATURATION_ON
    albedoTex.rgb = SaturateColor(albedoTex.rgb);
#endif

#if (SHADER_LOD > 100)
    #ifdef FX_MASK_ON 
        half3 FXColor = albedoTex.xyz * albedoTex.w ;
        half2 main_offset = frac(half2(_FXTexOffsetX, _FXTexOffsetY) * _Time.y);
        half2 uvFx = TRANSFORM_TEX(i.UV1, _FXTex) + main_offset;
        half4 fxBakeTex = Tex2Dbias(_FXTex, uvFx, _TextureLodBias);
        FXColor *= fxBakeTex.r * fxBakeTex.a * _FXColorHDR.xyz;
    #endif
    #ifdef BAKE_ON
        #ifndef USE_ECS_ANIM
            #ifndef USE_LOGO_TEX
                half2 uv1 = TRANSFORM_TEX(i.UV1, _BakingTex);
            #else
                half2 uv1 = uv;
            #endif
        #else
            half2 uv1 = TRANSFORM_TEX(i.UV1, _BakingTex);
        #endif

        // [lydiabxwang] FX Highlight area is marked as 1 in albedoTex.w
        half4 bakeTex = Tex2Dbias(_BakingTex, uv1, _TextureLodBias);
        half4 bake = bakeTex;
            
        //#ifndef BAKE_BLEND_ON
            bake.xyz  = bake.xyz * (1 - bake.a * _BakingAOStrength);
            bake.xyz = lerp(half3(0, 0, 0), half3(1, 1, 1), bake.xyz * albedoTex.xyz * _BakingGIStrength);
        //#else
        //    bake.a = bake.a;
        //    bake.xyz = lerp((0.5f).xxx, bake.xyz * _BakingTintColor.xyz * _BakingGIStrength, _BakingContrast);
        //#endif
        #ifdef FX_MASK_ON 
            FXColor *= bakeTex.xyz;
        #endif
    #endif
#endif
#if (SHADER_LOD > 100) || defined(REQURE_NORMALMAP_LOW_LOD)
    half4 normalRoughnessMetallic = Tex2Dbias(_NormalTex, uv, _TextureLodBias);
    
    #if defined(MODEL_FONT_TEXT) && defined(MODEL_FONT_TEXT_NORMAL_SUPPORT)
    half4 curveNormalRoughnessMetallic = tex2D(_CurveNormalTex, i.FontCurveTexUV.xy);
    half4 curveOutlineNormalRoughnessMetallic = tex2D(_CurveOutlineNormalTex, i.FontCurveTexUV.zw);

    float4 curveNormal = lerp(curveOutlineNormalRoughnessMetallic, curveNormalRoughnessMetallic, fontIntensity);
    normalRoughnessMetallic = lerp(normalRoughnessMetallic, curveNormal, fontOutlineIntensity);
    #endif
    
    // shawnai mountain detail
    #ifdef DETAIL_ON
        half2 uvDetail = i.UV0 * _DetailTexParams.xy;
        half4 normalDetail = Tex2Dbias(_DetailTex, uvDetail, _TextureLodBias);
        
        half3 normal;
        if (normalRoughnessMetallic.z < _DetailTexParams.w) {
            half4 normalCombine = half4(normalDetail.xy, normalRoughnessMetallic.xy);
            normalCombine = normalCombine * 2.0 - 1.0;
            normal.xy = _DetailTexParams.z * normalCombine.xy + normalCombine.zw;
            normal.y = -normal.y;
            normal.z = sqrt(1.0 - saturate(dot(normal.xy, normal.xy)));
        }
        else {
            normal = GetNormal(normalRoughnessMetallic.xy);
        }
    #else
        half3 normal = GetNormal(normalRoughnessMetallic.xy);
    #endif
#else
    half3 normal = o.Normal;
#endif

    //--------------------------------------------------------------------------
    // Base Color

    // nannzzhao: add world space hue variation
    #ifdef WORLDPOS_HUE_VARIATION
    half2 uvHue = i.AbsoluteWorldPosition.xz/_MapResolution;
    half4 hueTex = Tex2Dbias(_HueTex, uvHue, GlobalTextureLodBias);
    AppleWorldPosHueVariation(albedoTex, _PosHueScale, hueTex);
    #endif

    
#ifdef TEAMCOLOR_ON
    half3 baseColor = albedoTex.xyz * _TintColorHDR.xyz;
    #ifdef TEAMMASK_ON
        half4 teamColor = UNITY_ACCESS_INSTANCED_PROP(ColorProps, _TeamColor);
        half teamMask = albedoTex.w;
        #ifdef TEAMMASK_TEX_ON
        teamMask = Tex2Dbias(_TeamMaskTex, uv, _TextureLodBias).r;
        #endif
        half3 teamColorTarget = teamColor.rgb * _TeamColorIntensity;
        teamColorTarget *= lerp(1.0, GetLuminance(baseColor), _TeamColorGrayscaleBlend);
    
        if (_TeamColorReplace > 0.5)
        {
            o.BaseColor = lerp(baseColor, teamColorTarget, teamColor.a * (1 - teamMask)) + highlightColor.rgb;
        }
        else
        {
        o.BaseColor = baseColor * lerp(1, teamColorTarget, min(1,(1 - teamMask)* _TeamMaskScale)) + highlightColor.rgb;
        }
        #ifdef USE_LOGO_TEX
            logoTex.rgb *= lerp(teamColor.rgb, _LogoTeamColor.rgb, _EnableLogoCol);
        #endif
    #endif
#else
    o.BaseColor = albedoTex.xyz * _TintColorHDR.xyz + highlightColor.rgb;


#endif

// [felixhao] insert text color here
#ifdef TEXT_TEXTURE_ON
            // 把字显示到模型上的功能
            half4 rect0 = UNITY_ACCESS_INSTANCED_PROP(TextUVProps, _TextUVRect0);
    half4 rect1 = UNITY_ACCESS_INSTANCED_PROP(TextUVProps, _TextUVRect1);
    half4 realSize0 = UNITY_ACCESS_INSTANCED_PROP(TextRealSizesProps, _TextRealSize0);
    half4 realSize1 = UNITY_ACCESS_INSTANCED_PROP(TextRealSizesProps, _TextRealSize1);

    // 通过rect1的宽度是不是0来判断是一个字还是两个字
    half useTwoText = rect1.z != 0;
    // 如果两个字的话，为了不溢出模型，比单字的情况缩小一倍
    half twoTextScale = useTwoText ? 1.2 : 0.7;
    // 计算uv偏移
    half2 textUV = (i.UV0 + _TextUVModify.xy - 0.5) * _TextUVModify.zw * twoTextScale + 0.5; // uv - > 0~1
    
    // 判断是左边的字还是右边的字
    half rightText = useTwoText && textUV.x > 0.5;
    half4 uvRect = rightText ? rect1 : rect0;
    half textOffset = rightText ? -0.45: 0.45;
    half4 realSize = rightText ? realSize1 : realSize0;
    // uv偏移到两边
    textUV.x += textOffset * useTwoText;

    // 这个z上乘了一个正负号来判断字是不是躺倒的，将xy转置
    if(uvRect.z < 0)
    {
        textUV = textUV.yx;
        uvRect.z = -uvRect.z;
        realSize.zw = realSize.wz;
        realSize.xy = realSize.yx;
    }

    // 按照字体真实大小缩放
    textUV = (textUV - realSize.xy) / max(0.001,realSize.zw);

    half clip0 = all(textUV > 0 && textUV < 1);
    // return float4(clip0,clip0,0,1);

    half2 center = uvRect.xy;
    half2 scale = uvRect.zw;
    // 字体在fontTexture中的uv偏移
    textUV = (textUV - 0.5) * scale.xy * float2(1,-1);
    // 文字uv外的部分切掉，防止把旁边的字画进来
    half clip = all(scale.xy - abs(textUV.xy * 2.0) > 0);
    half textAlpha = Tex2D(_GlobalTextTexture,textUV + center).a * clip;
    o.BaseColor = lerp(o.BaseColor, float3(1,1,1), textAlpha);
#endif


#ifdef NIGHT_EMISSIVE_COLOR
    // o.BaseColor *= (1.0 - i.VertexColor.r) * _NightColor.xyz * _NightColorIntensity + i.VertexColor.r;
#ifdef ANIM_INST_ON
    o.EmissiveColor += GetNightEmissiveColor(o.BaseColor, i.VertexColor.b);
#else
    #ifdef ANIM_NIGHT_EMISSIVE_COLOR_LOD
    o.EmissiveColor += GetNightEmissiveColor(o.BaseColor, i.VertexColor.b); //动画物体LOD100无动画，但仍需顶点色b通道读取正确的夜晚自发光
    #else
    o.EmissiveColor += GetNightEmissiveColor(o.BaseColor, i.VertexColor.r);
    #endif
#endif
#endif

#ifdef SNOW_ON
    #if (SHADER_LOD <= 100) && !defined(REQURE_NORMALMAP_LOW_LOD)
    half4 normalRoughnessMetallic = tex2Dbias(_NormalTex, half4(uv,0,1));
    #endif

    #ifdef METALTOSNOW_ON
    half snowMask = normalRoughnessMetallic.w * _SnowIntensity;
    #else
    half snowMask = SnowMask(i, normal, normalRoughnessMetallic.z);
    snowMask = saturate(snowMask);
    #endif

    if (_ShowSnowDirectly < 1)
    #ifdef WEATHER_SPLIT_ON
        if(_WeatherSplitOn)
            snowMask *= i.WeatherSplitParams.w;
        else
    #endif
            snowMask *= SnowDegree;
	    
#	ifdef METALTOSNOW_ON
    _NonSnowCol.rgb = half3(1,1,1) - _NonSnowCol.rgb;
    #ifdef WEATHER_SPLIT_ON
    if(_WeatherSplitOn)
        o.BaseColor += o.BaseColor * (1-snowMask) * i.WeatherSplitParams.w * _NonSnowCol * _SnowInvIntensity;//METALTOSNOW_ON状态下起效的非雪区域亮度微调
    else
    #endif
        o.BaseColor += o.BaseColor * (1-snowMask) * SnowDegree * _NonSnowCol * _SnowInvIntensity;//METALTOSNOW_ON状态下起效的非雪区域亮度微调
    
    o.BaseColor = clamp(o.BaseColor, 0, 1);
#	endif
    
    o.BaseColor = lerp(o.BaseColor, _SnowColor.xyz, snowMask);
#endif

    // #if OccDissove
    //     o.BaseColor = _MainCharPos.xyz;
    // #endif
    
    //--------------------------------------------------------------------------
    // Normal
#if _HEIGHTBLEND_ON
    // WORLD_NORMAL 模式下，MobileBasePass 期望 o.Normal 是世界空间法线
    o.Normal = SafeNormalize(
        i.TangentToWorld[0].xyz * normal.x +
        i.TangentToWorld[1].xyz * normal.y +
        i.TangentToWorld[2].xyz * normal.z);
#else
    o.Normal = normal;
#endif

    //--------------------------------------------------------------------------
    // Ambient Occlusion
    o.AmbientOcclusion = 1.0;
// #if (SHADER_LOD <= 100)
//     o.AmbientOcclusion = i.VertexColor.a;
// #endif
#if defined(TEAMMASK_ON) || defined(TEX_TRANSPARENT_ON)
    // o.AmbientOcclusion = 1.0;
#else
    #ifndef FX_MASK_ON
    o.AmbientOcclusion *= albedoTex.w;
    #endif
#endif
#if (SHADER_LOD > 100)
    #ifdef BAKE_ON
    o.AmbientOcclusion *= lerp(1.0, bake.a, _BakingAOStrength);
    #endif
#endif

    //--------------------------------------------------------------------------
    // Roughness & Metallic


	//_RoughnessMax = lerp(_RoughnessMax, _RoughnessMin, RainDegree);

#if (SHADER_LOD > 100)
    //o.Roughness = lerp(_RoughnessMin, _RoughnessMax, normalRoughnessMetallic.z);
    #ifdef WEATHER_SPLIT_ON
    if (_WeatherSplitOn)
    {
        //o.Roughness = normalRoughnessMetallic.z * dot(_RoughnessScale.xyz, i.WeatherSplitParams.yzw);
        half SunDegree = i.WeatherSplitParams.z < i.WeatherSplitParams.w ? i.WeatherSplitParams.y : (1 - i.WeatherSplitParams.z * RainDegreeScale);
        o.Roughness = normalRoughnessMetallic.z * dot(_RoughnessScale.xyz, half3(SunDegree, i.WeatherSplitParams.z * RainDegreeScale, i.WeatherSplitParams.w));
    }
    else
    #endif
    {
        //o.Roughness = normalRoughnessMetallic.z * dot(_RoughnessScale.xyz, WeatherVector);
        half SunDegree = WeatherVector.y < WeatherVector.z ? WeatherVector.x : (1 - WeatherVector.y * RainDegreeScale);
        o.Roughness = normalRoughnessMetallic.z * dot(_RoughnessScale.xyz, half3(SunDegree, WeatherVector.y * RainDegreeScale, WeatherVector.z));
    }
	
    // Decal 默认拿 albedo.r 凑金属度，因为 _NormalTex.a 被 METALTOSNOW_ON 征用成了雪遮罩。
    // 声明 METALLIC_IN_NORMAL_ALPHA 表示该通道未被征用，金属度回归 _NormalTex.a。
    #if defined(DECAL_ON) && !defined(METALLIC_IN_NORMAL_ALPHA)
    o.Metallic = clamp(albedoTex.r*_Metallic.x + _Metallic.y,_Metallic.z, _Metallic.w);
    #else
    o.Metallic = normalRoughnessMetallic.w;
    #endif
    #ifdef SNOW_ON
    half snowMaskInv = 1.0 - snowMask;
    //o.Roughness *= snowMaskInv + _SnowRoughness * snowMask;
    o.Roughness *= snowMaskInv + _RoughnessScale.w * snowMask;
    o.Metallic *= snowMaskInv;
    #endif
#else
    #if defined(METALLIC_IN_NORMAL_ALPHA)
    // LOD100 平时不采样 _NormalTex，这里为金属度单独取一次
    o.Metallic = tex2Dbias(_NormalTex, half4(uv, 0, 1)).w;
    o.Roughness = _Roughness;
    #elif defined(SNOW_ON) && !defined(DECAL_ON)
    o.Metallic = normalRoughnessMetallic.w;
    o.Roughness = normalRoughnessMetallic.z;
    #else
    o.Metallic = clamp(albedoTex.r*_Metallic.x + _Metallic.y,_Metallic.z, _Metallic.w);
    o.Roughness = _Roughness;
    #endif
#endif

    half3 cameraVector = SafeNormalize(_WorldSpaceCameraPos.xyz - i.AbsoluteWorldPosition.xyz);
#ifdef RAIN_EFFECT_ON
    #if (SHADER_LOD > 100)
    half3 rainNormal = GetDoubleRainyNormal(i.AbsoluteWorldPosition);
    #else
    half3 rainNormal = half3(0,0,1);
    #endif

    half accumulatedWater = 0;
    half rainPuddleDegree = 1.0;
    #ifdef RAIN_PUDDLE_ON
        rainPuddleDegree = RainDegree;
    #endif
    #if defined(RAIN_PUDDLE_MASK_ON)
        accumulatedWater = GetAccumulatedWater(i.UV0, _TextureLodBias, rainPuddleDegree);
    #else
        accumulatedWater = GetAccumulatedWater(1.0-normalRoughnessMetallic.z, rainPuddleDegree);
    #endif
        half3 puddleWaterColor = o.BaseColor * _PuddleWaterTintColor.xyz;
        o.BaseColor = lerp(o.BaseColor, puddleWaterColor, accumulatedWater);
        o.Roughness = lerp(o.Roughness, _PuddleWaterRoughness, accumulatedWater);
        o.Metallic = lerp(o.Metallic, _PuddleWaterMetallic, accumulatedWater);
        o.Normal = lerp(o.Normal, rainNormal, accumulatedWater); 
        o.Specular = lerp(o.Specular, _PuddleWaterSpec, accumulatedWater); // Default specular is 0.5

    #ifdef CUSTOM_RAIN_REFLECTION_ON
        #if USE_TANGENT_SPACE_LIGHTING
        half3 reflNormalWS  = i.WorldNormal.xyz;
        #else
        half3 reflNormalWS = SafeNormalize(i.TangentToWorld[0].xyz * rainNormal.x + i.TangentToWorld[1].xyz * rainNormal.y + i.TangentToWorld[2].xyz * rainNormal.z);
        #endif
        half3 customIBL = GetCustomReflection(reflNormalWS, cameraVector);
        #ifdef MATCAP_ON
            o.MatCapColor= lerp(0, customIBL, accumulatedWater);
        #endif

        #ifdef REFLECTION_DISTORTION
        float2 distortionUV = rainNormal.xy;
        o.ReflectionOffset = distortionUV * _ReflectionDistortion;
        #endif
    #endif

#endif
    //--------------------------------------------------------------------------
    // Emissive Color
    
#if (SHADER_LOD > 100)
    #ifdef BAKE_ON
    o.EmissiveColor += bake.xyz;
    #endif
    #ifdef FX_MASK_ON
    o.EmissiveColor += FXColor.xyz;
    #endif

#ifdef TEX_EMISSIVE_ON
    #ifdef AO_IN_EMISSIVE_TEX
        half4 emissiveMap = Tex2Dbias(_EmissiveTex, uv, _TextureLodBias);
        o.EmissiveColor += emissiveMap.xyz * _EmissiveColor.xyz * _EmissiveIntensity;
        o.AmbientOcclusion *= lerp(1.0, emissiveMap.w, _BakingAOStrength);
    #else
        o.EmissiveColor += Tex2Dbias(_EmissiveTex, uv, _TextureLodBias).xyz * _EmissiveColor.xyz * _EmissiveIntensity;
    #endif
#endif
#endif

    
#if USE_TANGENT_SPACE_LIGHTING
        half NoV = 1 - dot(cameraVector, i.WorldNormal.xyz);
#else
        half NoV = 1 - dot(cameraVector, i.TangentToWorld[2].xyz);
#endif
// #if defined(ROLE_FX_ON) && defined(VERTEX_POS_ON)
//     o.EmissiveColor += VertexPosFlow(i.VertexPos.xyz,i.AbsoluteWorldPosition.xyz);
// #endif

#ifdef RIM_COLOR_ON
    half4 rimColor = UNITY_ACCESS_INSTANCED_PROP(ColorProps2, _Rim);
    NoV = clamp(NoV,0,1);
    NoV = Pow3(NoV);

    o.EmissiveColor += NoV * rimColor.w * rimColor.xyz;
#endif

    #if defined (MATCAP_ON) && !defined(CUSTOM_RAIN_REFLECTION_ON)
    half3 u = SafeNormalize(mul(UNITY_MATRIX_V, half4(i.AbsoluteWorldPosition,1)).xyz);
    half3 worldNormal = half3(0,1,0);
    #if USE_TANGENT_SPACE_LIGHTING
        worldNormal = i.WorldNormal.xyz;
    #else
        worldNormal = i.TangentToWorld[2].xyz;
    #endif
    half3 n = SafeNormalize(mul(UNITY_MATRIX_V, half4(worldNormal,0)).xyz);
    half3 r = reflect(u, n);
    half m = 0.5 * rsqrt(r.x*r.x + r.y*r.y + (r.z+1.0)*(r.z+1.0));
    half2 matcapuv = r.xy * m + 0.5;
    half3 matcap = Tex2Dbias(_MatcapTex, matcapuv, _TextureLodBias).xyz * _MatcapStrength;
    // o.BaseColor += matcap * o.Metallic * o.BaseColor;
    o.MatCapColor = matcap * (1 - o.Roughness);
    #endif
    //---------------------------------武器-------------------------------------
    #if WEAPON_EFFECT
    half4 weapontex =  Tex2D(_WeaponTex, i.UV0);
    half2 wpnoiseuv = TRANSFORM_TEX(i.UV0, _WeaponNoise);
    half4 weaponnoise =  Tex2D(_WeaponNoise, wpnoiseuv);
    half flow = RotateUV(i.UV0.xy, _FlowRotate).y;//frac(i.UV0.y * _FlowNum);
    half flowtime = frac(_Time.y * _FlowSpeed);
    flow = smoothstep(flowtime, flowtime + _FlowShappen, flow) - smoothstep(flowtime + _FlowWeight, flowtime + _FlowWeight + _FlowShappen, flow);
    half wpnoise = lerp(_WpNoiseMin, _WpNoiseMax,weaponnoise.x);
    flow = lerp(wpnoise * (flow + _WpNoiseIntensity / _WpemissiveIntensity * 10) * (sin(_Time.y * 2) *0.5 + 0.5), 1, pow(flow, 2.2));
    //flow = lerp(1, (saturate(weaponnoise.y * 2) - flow), step(flow, 0.5));
    o.EmissiveColor += flow * weapontex.x * _WpemissiveColor * _WpemissiveIntensity * _IsWeapon;
    #endif



    //--------------------------------------------------------------------------

    //--------------------------------------------------------------------------
    // Vertex Occlusion Intensity
    o.VertexOcclusionIntensity = _VertexOcclusionIntensity;

#if _HEIGHTBLEND_ON
    #if defined(USE_TERRAIN_VT_UNIFORM_BRANCH)
    UNITY_BRANCH
    if (_UseTerrainVT > 0.5)
    #endif
    {
        half3 heightblend_world_normal = o.Normal;
        TerrainVTResult vtResult = SampleFromVTByWorldPos(i.AbsoluteWorldPosition);
        float height = vtResult.worldY;
        float height_mask = saturate((i.AbsoluteWorldPosition.y - height) * _HeightBlendRange - _HeightBlendOffset);
        half blend_mask = saturate(max(0, height_mask));
        o.BaseColor = lerp(vtResult.albedo, o.BaseColor, blend_mask);
        o.Normal = lerp(vtResult.normal, heightblend_world_normal, blend_mask);
        o.AmbientOcclusion = lerp(vtResult.ao, o.AmbientOcclusion, blend_mask);
        o.Roughness = lerp(vtResult.roughness, o.Roughness, blend_mask);
        o.Metallic = lerp(vtResult.metallic, o.Metallic, blend_mask);
        o.VertexOcclusionIntensity = 1;

        #if _PREVIEHEIGHTWRANGE_ON
        #define MATERIAL_UNLIT 1
        o.BaseColor = 0;
        o.EmissiveColor = blend_mask;
        #endif
    }
#endif


    //--------------------------------------------------------------------------
    // Opacity
    o.Opacity = 1;

#ifdef TEX_TRANSPARENT_ON
    #if defined (TEX_TRANSPARENT_ALPHA_CONTROL)
        half alphaControl = albedoTex.w * _AlphaStrength;
        o.Opacity *= alphaControl;
    #else
        o.Opacity *= albedoTex.w;
    #endif
#elif defined(USE_EXPLICIT_ALPHA)
    o.Opacity *= _AlphaControl;
#endif

#if defined(PLANAR_REFLECTION_STRENGTH_ON)
    o.ReflectionMask = half2(1.0, _PRStrength);
#endif
#ifdef DECAL_ON
    o.Opacity *= i.VertexColor.a;
    #ifdef DECAL_NOISE_MASK_TEX_ON
    float2 decalNoiseMaskUV = i.AbsoluteWorldPosition.xz * _DecalNoiseMaskScaleOffset.xy + _DecalNoiseMaskScaleOffset.zw;
    half decalNoiseMask = tex2D(_DecalNoiseMask, decalNoiseMaskUV).r;
    o.Opacity *= decalNoiseMask;
    #endif

#endif


#ifdef UNIFORM_TRANSPARENT_ON
    o.Opacity *= UNITY_ACCESS_INSTANCED_PROP(TransparentProps, _TransparentParam).x;
#endif
    
    #if OccDissove
    o.OpacityMask = 1;
    o.OpacityMaskClipValue = 0.5;

    #ifdef ALPHA_TEST_ON
    o.OpacityMask = albedoTex.w;
    o.OpacityMaskClipValue = _OpacityMaskClipValue;
    #endif
    half2 dissovenoiseuv = TRANSFORM_TEX(i.UV0, _DissoveMap);
    half Noise = Tex2Dbias(_DissoveMap, dissovenoiseuv, _TextureLodBias);
    Noise = Noise * 2 - 1;
    float3 CharCameraPos = _MainCharPos.xyz - _WorldSpaceCameraPos.xyz;
    float3 ViewPos = i.AbsoluteWorldPosition.xyz - _WorldSpaceCameraPos.xyz;
    //o.ProjectedPos.z = -mul(UNITY_MATRIX_V, half4(worldPosWithOffset.xyz, 1.0)).z;
    float ScreenCharCameraPosZ = -mul(UNITY_MATRIX_VP, half4(_MainCharPos.xyz, 1.0)).z;
    float ScreenViewPosZ = -mul(UNITY_MATRIX_VP, half4(i.AbsoluteWorldPosition.xyz, 1.0)).z;
    
    if(ScreenCharCameraPosZ - _DepthOffset * 0.000001 > ScreenViewPosZ)
       // if(_MainCharPos.x - _DepthOffset  < i.AbsoluteWorldPosition.x && _MainCharPos.z + _DepthOffset > i.AbsoluteWorldPosition.z && _MainCharPos.y < i.AbsoluteWorldPosition.y)
    {
        half VoC = dot(ViewPos, CharCameraPos);
        half r0 = dot(CharCameraPos, CharCameraPos);
        VoC = VoC / r0;
        half3 NewCharPos = VoC * CharCameraPos + _WorldSpaceCameraPos.xyz;
        half3 r1 = min(CharCameraPos, _WorldSpaceCameraPos.xyz);
        half3 r2 = max(CharCameraPos, _WorldSpaceCameraPos.xyz);
        NewCharPos = max(NewCharPos, r1);
        NewCharPos = min(r2, NewCharPos);
        NewCharPos = -NewCharPos + i.AbsoluteWorldPosition.xyz;
        half Occ = dot(NewCharPos, NewCharPos);
        Occ = sqrt(Occ);
        Noise = Noise + 0.5 + Occ;
        Noise = saturate(Noise /  _MainCharPos.w);

        o.OpacityMask = o.OpacityMask * Noise;
    }
   
    #else
    #ifdef ALPHA_TEST_ON
    o.OpacityMask = albedoTex.w;
    o.OpacityMaskClipValue = _OpacityMaskClipValue;
    #endif
    #endif
    
#ifdef USE_LOGO_TEX
    o.BaseColor = lerp(o.BaseColor, logoTex.rgb, logoMask);
#endif

#if (PREVIEW_WAVE_ANIM_ON && WAVE_ANIM_ON)
    #define MATERIAL_UNLIT 1
    o.BaseColor = 0;
    o.Normal = 0;
    o.AmbientOcclusion = 1;
    o.Metallic = 0;
    o.Roughness = 1;
    float3 wave_ref = float3(i.VertexPos.x*0.5+0.5, i.VertexPos.y / 10, i.VertexPos.z *0.5+0.5);
    float origin_mask = smoothstep(1 - _EndPoint, 1 -_StartPoint,  dot(_WaveOrientation.xyz,wave_ref));
    float wave_mask = origin_mask * _WaveOrientation.w  + (1 - origin_mask) * ( 1 - _WaveOrientation.w);
    o.EmissiveColor =  wave_mask;
#endif


    return o;
}

#include "../Base/MobileBasePass.cginc"

#endif //!_OPACITY_CGINC
