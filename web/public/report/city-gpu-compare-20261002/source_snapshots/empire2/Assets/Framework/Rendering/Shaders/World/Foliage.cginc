#ifndef FOLIAGE_CGINC
#define FOLIAGE_CGINC

#define SET_SHADOW_AMOUNT  CachedShadow_ShadowAmount *= _ShadowAmount;

#if defined(AOE_HUE_VARIATION) && defined(SNOW_VARIATION)

	#define DCL_EXT_PARAMS \
					half    HueVariationAmount;\
					half3    SnowVariation;

	#define DCL_VSOUT_EXT_PARAMS \
					half    HueVariationAmount : TEXCOORD9;\
					half3   SnowVariation : TEXCOORD10;

	#define TRANSFER_EXT_PARAMS(a, b) \
					b.HueVariationAmount = a.HueVariationAmount;\
					b.SnowVariation = a.SnowVariation;

#elif defined(AOE_HUE_VARIATION) 

	#define DCL_EXT_PARAMS \
					half    HueVariationAmount;

	#define DCL_VSOUT_EXT_PARAMS \
					half    HueVariationAmount : TEXCOORD9;

	#define TRANSFER_EXT_PARAMS(a, b) \
					b.HueVariationAmount = a.HueVariationAmount;

#elif defined(SNOW_VARIATION) 

	#define DCL_EXT_PARAMS \
						half3    SnowVariation;

	#define DCL_VSOUT_EXT_PARAMS \
						half3    SnowVariation : TEXCOORD9;

	#define TRANSFER_EXT_PARAMS(a, b) \
						b.SnowVariation = a.SnowVariation;

#endif

#ifdef SHADOW_TINT_COLOR_ON
    #define FS_INPUT_EXT_PARAMS \
        half3 ShadowTintColor;
#endif

// #if (SHADER_LOD > 200)
#define GET_VS_MATERIAL_INPUT_PARAMETER(i,j) GetVSMaterialInputParameterFunc(i,j)
// #endif
#ifdef ANIM_INST_ON
#define GET_VS_LOCAL_MATERIAL_INPUT_PARAMETER(i) GetVSLocalMaterialInputParameterFunc(i)
#endif
#define GET_FS_MATERIAL_INPUT_PARAMETER(i) GetFSMaterialInputParameter(i)
#include "../Base/Common.cginc"
#include "../Base/InstanceBuffers.cginc"
#include "../Base/WeatherAndNight.cginc"
#include "../Base/FoliageAnimation.cginc"
#ifdef ANIM_INST_ON
#include "../Base/AnimatorInstance.cginc"
#endif
#ifdef USE_VERTEX_ANIM
    #include "../Base/VertexAnim.cginc"
#endif

#ifdef DECAL_PROJECT
    #include "../Terrain/VTCommon.cginc"
#endif

#ifdef AOE_HUE_VARIATION
void AppleHueVariation(inout half4 albedo, half hueVariation) {
    half3 shiftedColor = lerp(albedo.rgb, _HueVariation.rgb, hueVariation);
    #ifdef WORLDPOS_HUE_VARIATION
        shiftedColor = lerp(shiftedColor.rgb, _HueVariation.rgb, hueVariation);
    #endif
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

#ifdef WORLDPOS_HUE_VARIATION
void AppleWorldPosHueVariation(inout half4 albedo, half hueVariation, half4 hueTex) {
    half3 shiftedColor = lerp(albedo.rgb, hueTex.rgb, hueVariation);
    //half3 shiftedColor = lerp(albedo.rgb, hueTex.rgb * _HueVariation.rgb, hueVariation);
    
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

float Remap(float value, float min1, float max1, float min2, float max2)
{
    return (min2 + (value - min1) * (max2 - min2) / (max1 - min1));
}


VSMaterialInputParameter GetVSMaterialInputParameterFunc(VertexShaderInput input, VertexShaderMaterialParameter parameter)
{
    VSMaterialInputParameter o = (VSMaterialInputParameter)0;

    half3 worldNormal = parameter.TangentToWorld[2];

#if defined(FOLIAGE_ANIMATION_ON) || defined(AOE_HUE_VARIATION) || defined(SNOW_VARIATION)
    float variationAmount = frac(unity_ObjectToWorld[0].w + unity_ObjectToWorld[1].w + unity_ObjectToWorld[2].w);
    float variation = variationAmount * _WaveVariation;
#endif

#ifdef DECAL_PROJECT
    TerrainVTResult vtResult = SampleFromVTByWorldPos(parameter.WorldPosition);
    float worldOffsetY = vtResult.worldY - parameter.WorldPosition.y;
#endif
    
#if SHADER_LOD > 200
#ifndef ANIM_INST_ON
    #ifdef FOLIAGE_ANIMATION_ON
    #   ifdef FOLIAGE_ANIMATION_SIMPLE
        o.WorldPositionOffset.xyz = ApplyBlendingSimple(parameter.TimeInput,parameter.WorldPosition, input.VertexColor, _BendScale, variation);
    #   else
        o.WorldPositionOffset.xyz = ApplyBlendingNew(parameter.TimeInput,parameter.WorldPosition, worldNormal, input.VertexColor, _BendScale, _BranchAmp, _DetailFreq, _DetailAmp, variation);
    #   endif
    #endif

    #ifdef NEW_FOLIAGE_ANIMATION
        // VG-compatible: derive the per-instance object world position from
        // InstanceLocalToWorld (== unity_ObjectToWorld on the normal path,
        // == per-instance LocalToWorld on the VG DirectDraw path). This keeps
        // the per-plant phase variation (_Variation) correct under
        // DrawMeshInstancedIndirect where unity_ObjectToWorld is NOT per-instance.
        float3 objWS = float3(parameter.InstanceLocalToWorld[0][3], parameter.InstanceLocalToWorld[1][3], parameter.InstanceLocalToWorld[2][3]);
        o.WorldPositionOffset.xyz = FoliageAnim(parameter.TimeInput, input.VertexColor.xyz, parameter.WorldPosition, objWS);
    #endif
#endif
#endif

#ifdef SNOW_VARIATION
	half factor = frac(variationAmount + _SnowVariation) - 0.5;
	o.SnowVariation = half3(_SnowLevel + factor * 0.05, _SnowNoise + factor, _SnowIntensity - _SnowIntensity * factor);
#endif 

#ifdef AOE_HUE_VARIATION
    variationAmount += frac(input.Vertex.x + input.Normal.y + input.Normal.x) * 0.5 - 0.3;
    o.HueVariationAmount = saturate(variationAmount * _HueVariation.a);
#endif

#ifdef DECAL_PROJECT
    // 先贴地
    o.WorldPositionOffset.y += worldOffsetY * _TERRAIN_VT_HEIGHT_SCALE;

    // 再补偿体积，原地旋转缩放后的y值：localPos * worldRS，不考虑worldT
    float3x3 tmpM = unity_ObjectToWorld;
    o.WorldPositionOffset.y += mul(tmpM, input.Vertex).y * _TERRAIN_VT_HEIGHT_SCALE;
#endif
    
    return o;
}

/////////////////////////////////////////////////////////////////
// Animator Instance.
#ifdef ANIM_INST_ON
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
FSMaterialInputParameter GetFSMaterialInputParameter(FragmentShaderInput i)
{
    half2 uv = TRANSFORM_TEX(i.UV0, _MainTex);

    half4 albedo = Tex2Dbias(_MainTex, uv, GlobalTextureLodBias + _TextureLodBias);
// #if (SHADER_LOD > 200)
#ifdef AOE_HUE_VARIATION
#ifndef WORLDPOS_HUE_VARIATION
    AppleHueVariation(albedo, i.HueVariationAmount);
#endif
#endif


#ifdef WORLDPOS_HUE_VARIATION
    half2 uvHue = i.AbsoluteWorldPosition.xz/_MapResolution;
    half4 hueTex = Tex2Dbias(_HueTex, uvHue, GlobalTextureLodBias);
    AppleWorldPosHueVariation(albedo, _PosHueScale, hueTex);

#endif


// #endif //(SHADER_LOD > 200)

    FSMaterialInputParameter o = GetDefaultFSMaterialInputParameter();
    o.BaseColor = albedo.xyz * _TintColorHDR.xyz;
#ifdef VERTICAL_COLOR_TINT_ON
    half verticalColorMask  = Remap(i.AbsoluteWorldPosition.y, _VerticalRangeBeginOffset, max(_VerticalRangeBeginOffset, _VerticalRangeEndOffset) + 0.01, 0, 1);
    verticalColorMask = pow(verticalColorMask, _VerticalRangePower);
    o.BaseColor = lerp(o.BaseColor, o.BaseColor * _VerticalTintColor.rgb, saturate(verticalColorMask));
#endif
    
#if ALPHA_TO_COVERAGE
#if defined(ALPHA_TO_COVERAGE_FUNC_ON)
    o.OpacityMask = FixAlphaToCoverage(albedo.w, _OpacityMaskClipValue, uv, _MainTex_TexelSize, _MipScale);
#else
    // o.OpacityMask = albedo.w;
    o.OpacityMask = FixAlphaToCoverage(albedo.w, _OpacityMaskClipValue, uv, _MainTex_TexelSize, _MipScale);
#endif
#else
    o.OpacityMask = albedo.w;
#endif
    o.OpacityMaskClipValue = _OpacityMaskClipValue;

#ifdef UNIFORM_TRANSPARENT_ON
    o.Opacity *= UNITY_ACCESS_INSTANCED_PROP(TransparentProps, _TransparentParam).x;
#endif

	//_RoughnessMax = lerp(_RoughnessMax, _RoughnessMin, RainDegree);



    half4 normalRoughnessAO = Tex2Dbias(_NormalTex, uv, GlobalTextureLodBias + _TextureLodBias);
#if (SHADER_LOD > 100)
    o.Normal = GetNormal(normalRoughnessAO.xy);
    o.AmbientOcclusion = normalRoughnessAO.w;
	//o.Roughness = lerp(_RoughnessMin, _RoughnessMax, normalRoughnessAO.z);
#ifdef WEATHER_SPLIT_ON
    if (_WeatherSplitOn)
    {
        //o.Roughness = normalRoughnessAO.z * dot(_RoughnessScale.xyz, i.WeatherSplitParams.yzw);
        half SunDegree = i.WeatherSplitParams.z < i.WeatherSplitParams.w ? i.WeatherSplitParams.y : (1 - i.WeatherSplitParams.z * RainDegreeScale);;
        o.Roughness = normalRoughnessAO.z * dot(_RoughnessScale.xyz, half3(SunDegree, i.WeatherSplitParams.z * RainDegreeScale, i.WeatherSplitParams.w));
    }
    else
#endif
    {
        //o.Roughness = normalRoughnessAO.z * dot(_RoughnessScale.xyz, WeatherVector);
        half SunDegree = WeatherVector.y < WeatherVector.z ? WeatherVector.x : (1 - WeatherVector.y * RainDegreeScale);
        o.Roughness = normalRoughnessAO.z * dot(_RoughnessScale.xyz, half3(SunDegree, WeatherVector.y * RainDegreeScale, WeatherVector.z));
    }
	
#endif

#ifdef SNOW_ON
#ifdef SNOW_VARIATION
	_SnowLevel = i.SnowVariation.x;
	_SnowNoise = i.SnowVariation.y;
	_SnowIntensity = i.SnowVariation.z;
#endif

	half snowMask = SnowMaskFoliage(i, o.Normal, normalRoughnessAO.z);

// #ifndef  SHOW_SNOW_DIRECTLY
    if(_ShowSnowDirectly < 1)
#ifdef WEATHER_SPLIT_ON
        if(_WeatherSplitOn)
            snowMask *= i.WeatherSplitParams.w;
        else
#endif
            snowMask *= SnowDegree;
        
// #endif
    //o.Roughness *= 1.0 - snowMask + _SnowRoughness * snowMask;
    o.Roughness *= 1.0 - snowMask + _RoughnessScale.w * snowMask;
    o.BaseColor = lerp(o.BaseColor, _SnowColor.xyz, snowMask);
#endif
#ifdef WEATHER_SEASON_ON

    half seasonMask = SeasonMaskFoliage(i, o.Normal, normalRoughnessAO.z, _SeasonOcclusion);

    int seasonIdx = WeatherSeason; // 0-none; 1-sp;2-su;3-au;4-wi;
    #ifndef DISABLE_SEASON_CHAGNE
    half3 seasonTint = seasonIdx <= 1.0 ? (1.0).xxx/*_SpringTintColor.xyz*/ : (seasonIdx <= 2.0 ? _SummerTintColor : (seasonIdx <= 3.0 ? _AutumnTintColor : (1.0).xxx /*冬天tintColor snow部分已经计算*/));
    half saturateChange =  seasonIdx <= 1.0 ? 1.0 /*_SpringSaturation*/ : (seasonIdx <= 2.0 ? _SummerSaturation : (seasonIdx <= 3.0 ? _AutumnSaturation : 1 /*冬天tintColor snow部分已经计算*/));
    half lightnessChange =  seasonIdx <= 1.0 ? 0.0 /*_Springlightnesss*/ : (seasonIdx <= 2.0 ? _SummerLightness : (seasonIdx <= 3.0 ? _AutumnLightness : 0/*冬天tintColor snow部分已经计算*/));
    half h, s, l;
    calculateHSL(linear2rgb(o.BaseColor), h, s, l);
    half3 hslBaseColor = half3(h, s, l);
    half3 newHSL = hslBaseColor;
    // WeatherSeason: 0/1 = Spring, 2 = Summer, 3 = Autumn, 4 = Winter
    newHSL.x = seasonIdx <= 1.0 ? h /*frac(h + _SpringHueChange)*/ : (seasonIdx <= 2.0 ? frac(h + _SummerHueChange)  : (seasonIdx <= 3.0 ? frac(h + _AutumnHueChange) : h /*冬天tintColor snow部分已经计算*/));
    
    half3 adjColor = max(0.0, hsl2rgb(newHSL));
    adjColor = LightnessShift(adjColor, lightnessChange);
    adjColor = rgb2linear(adjColor);
    adjColor = SimpleSaturation(adjColor, saturateChange);
    adjColor *= seasonTint;

    o.BaseColor = lerp(o.BaseColor, adjColor, seasonMask);

    #ifdef DEBUG_SEASON_MASK
    {
        o.BaseColor = seasonMask.xxx;
        o.EmissiveColor = 0;
        o.Roughness = 1;
    }
    #endif

    #ifdef DEBUG_SEASON_COLOR
    {
        o.BaseColor = adjColor;
        o.EmissiveColor = 0;
        o.Roughness = 1;
    }
    #endif
    #endif
#endif
    o.Metallic = 0;
    o.VertexOcclusionIntensity = _VertexOcclusionIntensity;

    #ifdef SHADOW_TINT_COLOR_ON
    o.ShadowTintColor = _ShadowTintColor.xyz;
    #endif
    return o;
}

#include "../Base/MobileBasePass.cginc"

#endif //!FOLIAGE_CGINC
