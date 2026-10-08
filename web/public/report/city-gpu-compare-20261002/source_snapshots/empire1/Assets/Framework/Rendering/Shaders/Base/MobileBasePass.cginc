// Upgrade NOTE: replaced tex2D unity_Lightmap with UNITY_SAMPLE_TEX2D

#ifndef MOBILE_BASE_PASS_CGINC_
#define MOBILE_BASE_PASS_CGINC_

#include "Utils.cginc"
#include "Common.cginc"
#include "Shadow.cginc"
#ifdef PLANAR_SHADOW_MAP_ON
#include "PlanarShadowBase.cginc"
#endif
#include "../Base/Lighting.cginc"
#include "LightingTangentSpace.cginc"
#include "BRDF.cginc"
#include "PlanarReflection.cginc"
#include "IndirectLighting.cginc"
#include "../Debug/FullScreenDebug.cginc"

float4 Persp2Orgho(float4 worldPosWithOffset);

#if T2SDF_DDGI_ON
#include "../Base/DDGICommon.cginc"
#endif

VertexShaderOutput MobileBasePassVertex(VertexShaderInput v)
{
    VertexShaderOutput o;
    UNITY_SETUP_INSTANCE_ID(v);

#ifdef RECAL_TANGENT
    v.Tangent = half4(1, 0, 0, -1);
    half3 B = cross(v.Tangent.xyz, v.Normal.xyz);
    v.Tangent.xyz = cross(v.Normal.xyz, B);
#endif

#ifdef CUSTOM_DATA_ON
    o.CustomData = v.CustomData;
#endif

    // Modify local position...
#ifdef IMPOSTER_ON
    ImposterVSLocalParam imposterParam;
    VSLocalMaterialInputParameter localParams = GET_VS_LOCAL_MATERIAL_INPUT_PARAMETER(v, imposterParam);
    v.Normal.xyz = imposterParam.NewLocalNormal;
    v.Tangent.xyz = imposterParam.NewLocalTangent;
#else
    VSLocalMaterialInputParameter localParams = GET_VS_LOCAL_MATERIAL_INPUT_PARAMETER(v);

#endif

#ifdef ANIM_ORIG_VPOS
    o.VertexPos = v.Vertex;
#endif
    
    v.Vertex = localParams.NewLocalPosition;
    #ifdef GRASS_INSTANCE_ON
    v.Normal.xyz = localParams.NewLocalNormal;
    v.Tangent.xyz = localParams.NewLocalTangent;
    v.VertexColor = localParams.NewVertexColor;
    #endif
#ifndef ANIM_ORIG_VPOS
#ifdef VERTEX_POS_ON
    o.VertexPos = v.Vertex;
#endif
#endif
#if defined(FAKE_IMPOSTER_ROLE_ON)
    v.UV0.xy = localParams.uv;
#endif

#ifdef BILLBOARD_FACING_CAMERA
    float4 worldPos = BillboardFacingCamera(v.Vertex, v.Normal.xyz, v.Tangent.xyz);
#else
    // Calculate the vertex parameters.
    float4 worldPos = mul(unity_ObjectToWorld, v.Vertex);
#endif
    
#ifdef PLANNER_SHADOW 
    // shadow for fx effect
    worldPos.y = _GroundHeight;
#endif
    // Must be uniform scaling.
    // [2019/10/16]:eranzhao, should use full precision here, fix the display bug when use scaling.
    float3 worldNormal = SafeNormalize(mul(unity_ObjectToWorld, float4(v.Normal.xyz, 0)).xyz);
    float3 worldTangent = SafeNormalize(mul(unity_ObjectToWorld, float4(v.Tangent.xyz, 0)).xyz);
    float tangentSign = v.Tangent.w;
    float3x3 tangentToWorld = CreateTangentToWorld(worldNormal, worldTangent, tangentSign);
    
    VertexShaderMaterialParameter matParam;
    matParam.WorldPosition = worldPos.xyz;
    matParam.TangentToWorld = tangentToWorld;
    matParam.TimeInput = _Time;
    
    // Calculate custom vertex shader material input parameters.
#ifdef IMPOSTER_ON
    VSMaterialInputParameter parameter = GET_VS_MATERIAL_INPUT_PARAMETER(v, matParam, imposterParam);
#else
    VSMaterialInputParameter parameter = GET_VS_MATERIAL_INPUT_PARAMETER(v, matParam);
#endif

    float4 worldPosWithOffset = worldPos;
    worldPosWithOffset.xyz += parameter.WorldPositionOffset.xyz;

    // Construct VS output.
    // 需要抠出来不做TAA的东西，需要禁用抖动
#if defined(TAA_DISABLED)
    o.Position = mul(_NonJitteredViewProjMatrix, worldPosWithOffset);
#elif defined(MUI_FX)
    o.Position = Persp2Orgho(worldPosWithOffset);
#else
    o.Position = mul(UNITY_MATRIX_VP, worldPosWithOffset);
#endif
    o.AbsoluteWorldPositionAndUV0X    = float4(worldPosWithOffset.xyz, v.UV0.x);
    o.WorldPositionNoOffsetsAndUV0Y   = float4(worldPos.xyz, v.UV0.y);
    o.VertexColor                     = v.VertexColor;

#ifdef PIN_ON_NEARPLANE
    #if defined(UNITY_REVERSED_Z)
        o.Position.z = 0.99 * o.Position.w;
    #else
        o.Position.z = 0.01;
    #endif
#endif

#ifdef USE_TANGENT_SPACE_LIGHTING
    float3x3 worldToTangent = transpose(tangentToWorld);
    o.TangentHAndUV1X                 = half4(GetTangentH(worldToTangent, worldPosWithOffset.xyz), v.UV1.x);
    o.TangentLAndUV1Y                 = half4(GetTangentL(worldToTangent), v.UV1.y);
    o.WorldNormal                     = worldNormal;
#else
    o.TangentToWorld0AndUV1X          = half4(tangentToWorld[0].xyz, v.UV1.x);
    o.TangentToWorld1AndUV1Y          = half4(tangentToWorld[1].xyz, v.UV1.y);
    o.TangentToWorld2                 = tangentToWorld[2].xyz;
#endif

#if defined(SHADOWMAP_FUNC_ON)
    #ifdef SHADOW_MAP_ON
        #if defined (FOLIAGE_ANIMATION_ON) || (NEW_FOLIAGE_ANIMATION) || (IMPOSTER_ON)
            o.ShadowCoords = mul(CachedShadow_ProjectViewMat, float4(worldPos.xyz, 1.0));
        #else
            o.ShadowCoords = mul(CachedShadow_ProjectViewMat, float4(worldPosWithOffset.xyz, 1.0));
        #endif
    #endif
    #if defined(PLANAR_SHADOW_MAP_ON)
        o.PlanarShadowCoords = CalculatePlanarShadowCoord(half4(worldPosWithOffset.xyz,1));
    #endif
#endif

#ifdef PROJECTED_POS_ON
    o.ProjectedPos = ComputeScreenPos(o.Position);
    o.ProjectedPos.z = -mul(UNITY_MATRIX_V, half4(worldPosWithOffset.xyz, 1.0)).z;
#endif

#if defined(FOG_FUNC_ON) && FOG_ON
    BNS_TRANSFER_FOG(o, worldPosWithOffset.xyz);
#endif
#if defined(LOBBY_FOG_FUNC_ON)
    LOBBY_TRANSFER_FOG(o, worldPosWithOffset.xyz);
#endif

#ifndef PIXEL_SH_ON
    // Use vertex sh instead to save performance.
    o.VertexSH = max(half3(0, 0, 0), TBUShadeSH9(half4(worldNormal.xyz, 1.0)));
#endif

#ifdef LIGHTMAP_ON
    o.LightMapUV = v.UV1 * unity_LightmapST.xy + unity_LightmapST.zw;
#endif

    // Transfer custom parameters.
    TRANSFER_EXT_PARAMS(parameter, o);

    UNITY_TRANSFER_INSTANCE_ID(v, o);


#if defined(PLATFORM_SUPPORTS_PRIMITIVE_ID_IN_PIXEL_SHADER) && defined(SHADERPASS_FULL_SCREEN_DEBUG) 
    if (_DebugMode == DEBUG_VIEW_MESH_DENSITY)
    {
        IncrementVertexDensityCounter(o.Position );
    }
#endif

#ifdef WEATHER_SPLIT_ON
    if(_WeatherSplitOn)
    {
        float2 uv = worldPosWithOffset.xz / _TerrainValidSize + 0.5;
        o.WeatherSplitParams = tex2Dlod(_WeatherSplitTex, half4(uv, 0, 0));
    }
#endif

    #ifdef GI_IN_VERTEX
    o.GIColor = half4(0,0,0,0);
    #if (T2SDF_DDGI_ON) && (GI_ON)
    o.GIColor = ApplyVolumeLightingContributionVertex(worldPosWithOffset, worldNormal);
    #endif
    #endif
    return o;
}

// 为了避免重复写入，prez这里imageblock就不写了
half4 MobileBasePassDepth(VertexShaderOutput input
#ifdef SEMANTIC_VFACE_ON
  , float VFace : VFACE
#endif
#if defined(DEPTH_FETCH_ON_ANDROID)
  , in float depth : SV_DepthFetch
#endif
#if defined(FAKE_IMPOSTER_PREZ_ON)
  , float outDepth : SV_Depth
#endif
) : SV_Target
{

    UNITY_SETUP_INSTANCE_ID(input);

    // Unpack input parameters from packed data.
    FragmentShaderInput i = DecodeFromVertexShaderOutput(input);


#ifdef SEMANTIC_VFACE_ON
    i.VFace = VFace;
#endif

#if defined(DEPTH_FETCH_ON_ANDROID)
    i.depth = depth;
#endif


#ifdef IMPOSTER_ON
    ImposterFSLocalParam imposterParam;
    i.WorldPositionNoOffsets.xyz += CalcImposterWorldPositionOffset(i, imposterParam);
    FSMaterialInputParameter parameter = GET_FS_MATERIAL_INPUT_PARAMETER(i, imposterParam);
#else
    // Get the custom material parameter.
    FSMaterialInputParameter parameter = GET_FS_MATERIAL_INPUT_PARAMETER(i);
#endif

    // Fix the parameters.
    CalcFSMaterialInput(parameter);

#ifdef ALPHA_TEST_ON
    #ifdef ALPHA_TO_COVERAGE
        #if defined(ALPHA_TO_COVERAGE_FUNC_ON)
            // Do nothing...
        #else
            clip(parameter.OpacityMask - parameter.OpacityMaskClipValue);
        #endif
    #else
        clip(parameter.OpacityMask - parameter.OpacityMaskClipValue);
    #endif
#endif

#ifdef FAKE_IMPOSTER_PREZ_ON
    float4 tempViewPos = mul(unity_MatrixVP, float4(i.AbsoluteWorldPosition, 1));
    #if defined (SHADER_API_GLCORE) || (SHADER_API_GLES) || (SHADER_API_GLES3)
        outDepth = tempViewPos.z / tempViewPos.w * 0.5f + 0.5f;
    #elif defined (UNITY_REVERSED_Z)
        outDepth = tempViewPos.z / tempViewPos.w;
    #else
        outDepth = tempViewPos.z / tempViewPos.w * 0.5f + 0.5f;
    #endif
#endif
    
    return 1.0;
}
struct FragIn
{
    #if defined(DEPTH_FETCH_ON_ANDROID)
    float depth : SV_DepthFetch;
    #endif
#if defined(DEPTH_FETCH_ON_IOS)
    #if defined(IMAGEBLOCK_DEPTH_READ)
    float inDepth : CoLoR1; 
    #endif
#endif
};

struct FragOut
{
    #ifndef OIT_ON
    half4 outColor : SV_TARGET0;
    #endif

#if defined(DEPTH_FETCH_ON_IOS)
    #ifndef DISABLE_IMAGEBLOCK_DEPTH
    float outDepth : CoLoR1;
    #endif
    #if TAA_DISABLED
    float motionVectorMask : CoLoR2;
        #ifdef GI_DEBUG_ON
        half4 debugGI : CoLoR3;
        #endif
    #else
        #ifdef GI_DEBUG_ON
        half4 debugGI : CoLoR2;
        #endif
    #endif
    #ifdef OIT_ON
       half4 OITColor : CoLoR0;
       half4 OITAlpha : CoLoR1;
    #endif
#else
    #if TAA_DISABLED
        float motionVectorMask : SV_TARGET1;
    #ifdef GI_DEBUG_ON
        half4 debugGI : SV_Target2;
    #endif
    #else
    #ifdef GI_DEBUG_ON
        half4 debugGI : SV_Target1;
    #endif
    #endif
    #ifdef OIT_ON
       half4 OITColor : SV_Target0;
       half4 OITAlpha : SV_Target1;
    #endif
#endif

    
};

void MobileBasePassFragment(VertexShaderOutput input
#if defined(PLATFORM_SUPPORTS_PRIMITIVE_ID_IN_PIXEL_SHADER)
, uint pid : SV_PrimitiveID
#endif
#ifdef SEMANTIC_VFACE_ON
, float VFace : VFACE
#endif
, in FragIn fragIn, out FragOut fragOut)
{
    UNITY_SETUP_INSTANCE_ID(input);
    
#if defined(PLATFORM_SUPPORTS_PRIMITIVE_ID_IN_PIXEL_SHADER) && defined(SHADERPASS_FULL_SCREEN_DEBUG) 
    if (_DebugMode == DEBUG_VIEW_QUAD_OVERDRAW)
    {
        uint2 rtPosition = (uint2)input.Position.xy;
        uint2 screenPosition = (uint2)(rtPosition / _ScreenSize.zw * _ScreenSize.xy);
        IncrementQuadOverdrawCounter(screenPosition, pid);
    }
#endif
    //--------------------------------------------------------------------------
    // Calculate base parameters.
    
    // Unpack input parameters from packed data.
    FragmentShaderInput i = DecodeFromVertexShaderOutput(input); 
    
#ifdef SEMANTIC_VFACE_ON
    i.VFace = VFace;
#endif

#if defined(DEPTH_FETCH_ON_ANDROID)
    i.depth = fragIn.depth;
#endif

// felixhao : 暂时不允许同时读写，会产生同步，应该也没有类似的需求
#if defined(DEPTH_FETCH_ON_IOS)
    #if defined(IMAGEBLOCK_DEPTH_READ)
    i.depth = fragIn.inDepth;
    #else
    #ifndef DISABLE_IMAGEBLOCK_DEPTH
    if(_ZWrite)
        fragOut.outDepth = input.Position.z;
    #endif
    #endif
#endif
    
#ifdef IMPOSTER_ON
    ImposterFSLocalParam imposterParam; 
    i.WorldPositionNoOffsets.xyz += CalcImposterWorldPositionOffset(i, imposterParam);
    FSMaterialInputParameter parameter = GET_FS_MATERIAL_INPUT_PARAMETER(i, imposterParam);
#else
    // Get the custom material parameter.
    FSMaterialInputParameter parameter = GET_FS_MATERIAL_INPUT_PARAMETER(i);
#endif
    // Fix the parameters.
    CalcFSMaterialInput(parameter);

    
#ifdef FAKE_IMPOSTER_ROLE_ON
    #ifdef ALPHA_TEST_ON
        clip(parameter.OpacityMask - parameter.OpacityMaskClipValue);
    #endif

    #if defined(FOG_FUNC_ON) && FOG_ON
        BNS_APPLY_FOG(input, parameter.BaseColor, i.AbsoluteWorldPosition.xyz);
    #endif
    #if defined(LOBBY_FOG_FUNC_ON)
        LOBBY_APPLY_FOG(input, parameter.BaseColor, i.AbsoluteWorldPosition.xyz);
    #endif

    #ifndef OIT_ON
    fragOut.outColor =  half4(parameter.BaseColor * (0.5f + i.lumin / 3.8f), 1.0f);
    #endif
    return;
#endif
    
#if	defined(LOOK_DEV)
	if (_DebugMode == DEBUG_VIEW_GRAY_ALBEDO)
	{
		parameter.BaseColor.rgb = 0.2176;
	}
#endif
    
#ifdef ALPHA_TEST_ON
    #ifdef ALPHA_TO_COVERAGE
        #if defined(ALPHA_TO_COVERAGE_FUNC_ON)
            // Do nothing...
        #else
            clip(parameter.OpacityMask - parameter.OpacityMaskClipValue);
        #endif
    #else
        clip(parameter.OpacityMask - parameter.OpacityMaskClipValue);
    #endif
#endif

#ifdef SEMANTIC_VFACE_ON
#ifdef DOUBLESIDELIGHT_ON
    parameter.Normal *= VFace;
#endif
#endif

#ifdef IMPOSTER_ON
    half3 worldNormal = SafeNormalize(mul(unity_ObjectToWorld, float4(parameter.Normal.xyz, 0)).xyz);
#elif USE_TANGENT_SPACE_LIGHTING
    // Do nothing...
    half3 worldNormal = i.WorldNormal.xyz;
#else
    half3 worldNormal = SafeNormalize(i.TangentToWorld[0].xyz * parameter.Normal.x + i.TangentToWorld[1].xyz * parameter.Normal.y + i.TangentToWorld[2].xyz * parameter.Normal.z);
#endif
    half3 cameraVector = SafeNormalize(_WorldSpaceCameraPos.xyz - i.AbsoluteWorldPosition.xyz);

#ifdef PLANAR_REFLECTION_CLIP
    // If is rendering target for planar reflection, should check the world position that should
    // not under the planar plane.
    // In UE4, they use alpha to control.
    clip(CheckIsUnderPlanarReflectionPlane(i.AbsoluteWorldPosition.xyz));
#endif

    // ---------------------------------------------------------------
    // Shadow
    half shadow = 1;

    #if defined(SHADOWMAP_FUNC_ON)
    # ifdef SHADOW_MAP_ON
    shadow = SampleShadow(i.ShadowCoords,i.AbsoluteWorldPosition.xyz);
    # endif

    # ifdef PLANAR_SHADOW_MAP_ON
    shadow = min(SamplePlanarShadow(i.PlanarShadowCoords,i.AbsoluteWorldPosition.xyz),shadow);
    #endif
    #endif


    #ifdef CLOUD_SHADOW_ON
    //  Cloud Shadow
    half cloudShadow = GetCloudShadow(i.AbsoluteWorldPosition.xyz);
    cloudShadow = CloudShadowEnable ? cloudShadow : 1.0;   
    shadow = min(shadow, cloudShadow);
    #endif

#ifdef MARMOSET_LIGHTING_ON
    half3 diffuseColor = parameter.BaseColor;
    half3 reflectivity = parameter.Reflectivity;
#else
    #ifdef NON_METAL
        half3 diffuseColor = parameter.BaseColor;
        half3 reflectivity = DIELECTRIC_SPEC.rgb;
    #elif LIGHTING_HQ
        half3 diffuseColor = parameter.BaseColor - parameter.BaseColor * parameter.Metallic;
    #else
        half dielectricSpecular = 0.08 * parameter.Specular;
        half3 diffuseColor = parameter.BaseColor - parameter.BaseColor * parameter.Metallic;    // 1 mad
        half3 reflectivity = (dielectricSpecular - dielectricSpecular * parameter.Metallic) + parameter.BaseColor * parameter.Metallic;    // 2 mad
    #endif  //!NON_METAL
#endif //!MARMOSET_LIGHTING_ON


    half NoV = 1.0;

#ifdef FULLY_ROUGH
    // Factors derived from EnvBRDFApprox( reflectivity, 1, 1 ) == reflectivity * 0.4524 - 0.0024
    diffuseColor += reflectivity * 0.45;
    half3 specularColor = 0;
#elif USE_TANGENT_SPACE_LIGHTING
    //  [2021/03/04]eranzhao: Support tangent space lighting.
    half3 specularColor = 0.08 * parameter.Specular;
#else
    NoV = dot(worldNormal, cameraVector);

    #ifdef NON_METAL
        half3 specularColor = EnvBRDFApproxNonmetal(parameter.Roughness, NoV);
    #elif LIGHTING_HQ
        half3 specularColor = (0.04 - 0.04 * parameter.Metallic) + parameter.BaseColor * parameter.Metallic;
        half3 Preintegrated_DGF = EnvBRDFApprox(specularColor, parameter.Roughness, NoV);
    #else
        half3 specularColor = EnvBRDFApprox(reflectivity, parameter.Roughness, NoV);
    #endif
#endif  //!FULLY_ROUGH
    
    half3 color = 0;
    
    //--------------------------------------------------------------------------
    // Lightmap, for indirect diffuse only.
    half irradiance = 1;

    //--------------------------------------------------------------------------
    // Diffuse from SH. Disable when use lightmap, in general.
    #ifdef LIGHTMAP_ON
    
            float3 lightMapColor = GetLightmapColor(input.LightMapUV);
            #if LIGHTING_TwoSided
            if(VFace < 0)
            {
                lightMapColor *= _BackFaceGIIntensity * _BackFaceGITintColor;
            }
            #endif
            //poggyzhu baked directional map diffuse
            #if LIGHTMAPIND_ON
            float4 lightMapDir = UNITY_SAMPLE_TEX2D_SAMPLER(unity_LightmapInd, unity_Lightmap, input.LightMapUV);
            half LightMapNoL = dot(worldNormal, lightMapDir.xyz - 0.5) + 0.5;
            LightMapNoL = LightMapNoL / max(1e-4h, lightMapDir.w);
            #if BAKEDSPE_ON
            half3 BakedSpe = GetBakedLightingSpe(cameraVector, worldNormal, specularColor, parameter.Roughness, lightMapDir);
            half SpeNoL = saturate(dot(worldNormal, SafeNormalize(lightMapDir.xyz * 2 - 1)));
            color = LightMapNoL * (lightMapColor * diffuseColor) + SpeNoL * BakedSpe * lightMapColor;
            #else
            color = LightMapNoL * lightMapColor * diffuseColor;
            #endif
            #else
            color = lightMapColor * diffuseColor;
            #endif
    
    #elif LIGHTPROBE_ON
            float3 SHCol = TBUShadeSH9_Lightprobe(half4(worldNormal, 1));
            color += diffuseColor * SHCol;
                
    #elif DIFFUSE_SH_ON
        #if !defined(T2SDF_DDGI_ON) || !defined(GI_ON)
            float3 diffuseSH = 0;
            #ifndef PIXEL_SH_ON
                diffuseSH = i.VertexSH;
            #elif SIMPLE_SKY_COLOR_ON
                // Just use sky color instead of SH, to save ALUs.
                diffuseSH = GetSkyColor();
            #else
                diffuseSH = max(half3(0, 0, 0), TBUShadeSH9(half4(worldNormal.xyz, 1.0)));
               
            #endif
            #ifndef MARMOSET_LIGHTING_ON
                #ifndef EFFECT_DIFFUSE_SH
                    // [2020/09/27]eranzhao: Get the irradiance from SH, to solve the contrast problem.
		            #ifndef SHADER_LOD
                        irradiance = saturate(GetLuminance(diffuseSH) * InvAvgBrightness);
                    #elif SHADER_LOD > 200
                        irradiance = saturate(GetLuminance(diffuseSH) * InvAvgBrightness);
                    #else
                        //骁龙660上FX2SolidMeshDissolveClipAnim使用InvAvgBrightness导致黑屏
                        irradiance = saturate(GetLuminance(diffuseSH));
                    #endif
            	#else
                    irradiance = saturate(GetLuminance(diffuseSH));
            	#endif
	        #endif
        
            color += diffuseSH * diffuseColor * IndirectDiffuseTintColor.xyz;
        #endif
    #endif
    //---------------------------------------------------------------------------
   // GI
#if T2SDF_DDGI_ON
    #if GI_ON
    half4 giColor;
    #if!GI_IN_VERTEX
        #ifdef GI_SHADOW_DISABLE  
        giColor = ApplyVolumeLightingContribution(i.AbsoluteWorldPosition, worldNormal, diffuseColor, shadow);
        #else
        giColor = ApplyVolumeLightingContribution(i.AbsoluteWorldPosition, worldNormal, diffuseColor);
        #endif
    #else
        giColor = i.GIColor;
        giColor.rgb *= diffuseColor;
    #endif
    // compute SH Blend
    half3 diffuseSH =
        #ifndef PIXEL_SH_ON
        i.VertexSH;
        #elif SIMPLE_SKY_COLOR_ON
            GetSkyColor();
        #else
            max(half3(0, 0, 0), TBUShadeSH9(half4(worldNormal.xyz, 1.0)));
        #endif
    irradiance = saturate(GetLuminance(diffuseSH) * InvAvgBrightness);
    half3 Diffuse =  diffuseSH * diffuseColor * IndirectDiffuseTintColor.xyz;
    parameter.GI = lerp(Diffuse, giColor.rgb, giColor.a);
    color += parameter.GI;
    #ifdef GI_DEBUG_ON
    fragOut.debugGI.xyz = giColor.rgb / diffuseColor;
    fragOut.debugGI.w = giColor.a;
    #endif
    
    #endif 
#endif
    
    //---------------------------------------------------------------------------
    // Indirect specular from reflection probe.
    half3 specularIBL  = 0.0;
#ifdef SPECULAR_REFLECTION_ON
    // Calculate the reflection vector.
    half3 reflVec; 
    #ifndef ANISO_FABRIC
    reflVec = SafeNormalize(reflect(-cameraVector, worldNormal));
    #else
    reflVec =  SafeNormalize(GetAnisoModifiedReflVec(-cameraVector, worldNormal, parameter.WorldBitangent, parameter.Anisotropy));
    #endif
    #if  MATCAP_ON
    specularIBL = parameter.MatCapColor;
    #else
    specularIBL = GetSpecularReflection(parameter.Roughness, parameter.Metallic, parameter.AmbientOcclusion, reflVec);
    #endif
    //--------------------------------------------------------------------------
    // Planar Reflection.
#ifndef SCREEN_SPACE_REFLECTION_ON
#if defined(PLANAR_REFLECTION_FUNC_ON)
    #ifdef PLANAR_REFLECTION_ON
    #if PROJECTED_POS_ON
        #ifdef REFLECTION_DISTORTION
            half4 planarReflection = GetSSPR(i.ProjectedPos.xy / i.ProjectedPos.w, parameter.Roughness, parameter.ReflectionOffset);
        #else
            half4 planarReflection = GetSSPR(i.ProjectedPos.xy / i.ProjectedPos.w, parameter.Roughness);
        #endif
    #else
        #ifdef REFLECTION_DISTORTION
            half4 planarReflection = GetPlanarReflection(i.AbsoluteWorldPosition.xyz, worldNormal.xyz, parameter.Roughness, parameter.ReflectionOffset);
        #else
            half4 planarReflection = GetPlanarReflection(i.AbsoluteWorldPosition.xyz, worldNormal.xyz, parameter.Roughness);
        #endif
    #endif
        specularIBL = lerp(specularIBL, planarReflection.xyz, planarReflection.a);
    #endif
#endif //!PLANAR_REFLECTION_FUNC_ON
#endif
    
//[2023/02] nannzzhao: SSR
#if defined(SCREEN_SPACE_REFLECTION_ON) && (PROJECTED_POS_ON)
    half2 screenUV =  i.ProjectedPos.xy / i.ProjectedPos.w;
    #ifdef REFLECTION_DISTORTION
        half4 ssrColor = GetSSR(screenUV, parameter.Roughness, parameter.ReflectionOffset);
    #else
        half4 ssrColor = GetSSR(screenUV, parameter.Roughness);
    #endif
    //specularIBL += ssrColor.xyz * ssrColor.a;
    specularIBL = specularIBL * (1 - ssrColor.a) + ssrColor.xyz * ssrColor.a;
#endif

#if LIGHTING_HQ
	color += specularIBL * Preintegrated_DGF * irradiance * IndirectSpecularTintColor.xyz;
#else
	color += specularIBL * specularColor * irradiance * IndirectSpecularTintColor.xyz;
#endif   

#endif

#ifndef MATERIAL_UNLIT
     
    // Shadow.

#if defined(SET_SHADOW_AMOUNT)
    SET_SHADOW_AMOUNT;
#endif

// #if defined(SHADOWMASK_ON) && defined(LIGHTMAP_ON) 
//     fixed4 rawOcclusionMask = UNITY_SAMPLE_TEX2D(unity_ShadowMask, input.LightMapUV);
//     fixed shadowMask = saturate(dot(rawOcclusionMask, unity_OcclusionMaskSelector));
//     shadow = min(shadow,shadowMask);
// #endif

    //--------------------------------------------------------------------------
    // Directional lights.

    half3 dirLight=0;
    // [2021/03/04]eranzhao: Support tangent space lighting
#ifdef USE_TANGENT_SPACE_LIGHTING
     dirLight = GetDirectionalLightingTangentSpace(i, parameter, diffuseColor, specularColor);
#elif defined(FUR_VERTEX_LIGHTING_ON)
     dirLight = parameter.VertexDirLighting;
#else
    BRDFInputParameter brdfInput;
    brdfInput.diffuseColor = diffuseColor;
    brdfInput.specularColor = specularColor;
    brdfInput.roughness = parameter.Roughness;
    brdfInput.worldNormal = worldNormal;
    brdfInput.cameraVector = cameraVector;
    brdfInput.lightDirection = 0;
    brdfInput.lightColor = 0;
    brdfInput.NoV = NoV;
    //brdfInput.metallic = parameter.Metallic;
# if defined (LIGHTING_ANISO) || (LIGHTING_SSS) || (LIGHTING_IRIS) || (LIGHTING_BAKE) || (LIGHTING_CONTROL) || (LIGHTING_RIM) || (LIGHTING_GI_CONTROL) || (LIGHTING_SEC_ANISO) || (MARMOSET_LIGHTING_ON) || (APPLY_FAKE_SPECULAR_AMPLIFY) || (WATER_DYNAMITE_SHADOW_ON) || (LIGHITNG_FABRIC)  || (LIGHTING_FUR_ON)
    BRDF_TRANSFER_EXT_PARAMS(parameter, brdfInput);
# endif
    // if(_WeatherSplitOn)
    //     brdfInput.lightColor.r = i.WeatherSplitParams.r;
    #if !FULL_LIGHTMAP
        #if !LIGHTMAPIND_ON
            dirLight = GetDirectionalLighting(brdfInput);
        #endif
    #endif
#endif
    
#ifdef WATER_DYNAMITE_SHADOW_ON
    CachedShadow_ShadowAmount *= brdfInput.customShadowAmount;
#endif
    half3 shadowedDirLight = dirLight * shadow;
    
    color += lerp(dirLight, shadowedDirLight, CachedShadow_ShadowAmount);

#if defined(LIGHTING_NIGHT_ROLE)
    color += LightingNightRole(brdfInput) * NightDegree;
#endif

#if defined(ADDITIVE_LIGHT_FUNC_ON)
    //--------------------------------------------------------------------------
    // Forward Plus Rendering Path use uniform additional lights, see Lighting.cginc for details
#if defined(FORWARD_PLUS_ON)
    float2 normalizedScreenUV =(input.Position.xy * _RcpScreenSizeFp.zw);
    #ifndef POINT_LIGHTS_TOGGLE
        color += GetAdditionalLightingFp(brdfInput, i.AbsoluteWorldPosition.xyz, worldNormal.xyz, normalizedScreenUV, _LightLayerMask);
    #else 
        // TODO: tmp solution while additional light shadow is not support, remove when added
        color += _PointLightFactor * GetAdditionalLightingFp(brdfInput, i.AbsoluteWorldPosition.xyz, worldNormal.xyz, normalizedScreenUV, _LightLayerMask);
    #endif
#else
    //--------------------------------------------------------------------------
    // Point lights 
    #ifdef POINT_LIGHTS_ON
        #ifndef POINT_LIGHTS_TOGGLE
            // TODO(eranzhao): add point light shadow.
            color += GetPointLighting(brdfInput, i.AbsoluteWorldPosition.xyz,_LightLayerMask);
        #else 
            // TODO: tmp solution while point light shadow is not support, remove when added
            color += _PointLightFactor * GetPointLighting(brdfInput, i.AbsoluteWorldPosition.xyz,_LightLayerMask);
        #endif
    #endif

    //--------------------------------------------------------------------------
    // Spot lights 
    #ifdef SPOT_LIGHTS_ON
        #ifndef POINT_LIGHTS_TOGGLE
            color += GetSpotLighting(brdfInput, i.AbsoluteWorldPosition.xyz, worldNormal.xyz, _LightLayerMask);
        #else 
            // TODO: tmp solution while spot light shadow is not support, remove when added
            color += _PointLightFactor * GetSpotLighting(brdfInput, i.AbsoluteWorldPosition.xyz, worldNormal.xyz, _LightLayerMask);
        #endif
    #endif
    
#endif //!FORWARD_PLUS_ON
#endif //!ADDITIVE_LIGHT_FUNC_ON

#endif //!MATERIAL_UNLIT
     
#ifndef MATERIAL_UNLIT
   color *= parameter.AmbientOcclusion;
#endif

    half vertexAOControl = parameter.VertexOcclusionIntensity; 

#ifndef DISABLE_VERTEX_AO
    // [2019/10/21]eranzhao: Fix the bright pixel by staturate the vertex color.
    half vertexColorAlpha = i.VertexColor.a;
    color *= lerp(saturate(vertexColorAlpha*vertexColorAlpha), 1.0, vertexAOControl);
#endif

#ifdef SHADOWMAP_FUNC_ON
    #if defined (FUR_SHADOW_ON) && (SHADOW_MAP_ON)
    half3 shadowedEmissiveLight = parameter.EmissiveColor * shadow;
    parameter.EmissiveColor = lerp(parameter.EmissiveColor, shadowedEmissiveLight, CachedShadow_ShadowAmount);
    #endif
#endif
    //--------------------------------------------------------------------------
    // Emissive.
    color += parameter.EmissiveColor;
    
    // War fog.
// #if defined(WAR_FOG_ON)
// 
//     //color *= GetWarFog(i.AbsoluteWorldPosition.xyz);
//     color.rgb = ApplyWarFog(i.AbsoluteWorldPosition.xyz, color.rgb);
// #endif
    
    //--------------------------------------------------------------------------
    // Fog.
#if defined(FOG_FUNC_ON) && FOG_ON
    BNS_APPLY_FOG(input, color, i.AbsoluteWorldPosition.xyz);
#endif
#if defined(LOBBY_FOG_FUNC_ON)
	LOBBY_APPLY_FOG(input, color, i.AbsoluteWorldPosition.xyz);
#endif
    //--------------------------------------------------------------------------
    // Blend operations.

    half4 ret;

//alpha定义taa行为：
//alpha < 1    Only CameraMotionVector
//alpha == 1.5 PerObjectMotionVector
//alpha == 2.5 DisableTAA
 
#ifdef ALPHA_BLEND_ON
    ret = half4(color, parameter.Opacity);
#elif defined(ALPHA_TO_COVERAGE) && defined(ALPHA_TO_COVERAGE_FUNC_ON)
    ret = half4(color, parameter.OpacityMask);
#else
    ret = half4(color, 1);
#endif

#if TAA_DISABLED     // 抠出来不做TAA的物体，CameraMotionVector和TAAPass都过滤掉，所以也不用jitter
    fragOut.motionVectorMask = 1;
#endif

#ifdef OIT_ON
    half OITAlphaParam =  parameter.OIT.r;  
    half viewZ = parameter.OIT.g;
    half3 C = color *  OITAlphaParam;
 
    half OITWeight = w(viewZ, OITAlphaParam);
    fragOut.OITColor = float4(C, OITAlphaParam) * OITWeight;
    fragOut.OITAlpha = parameter.Opacity;
    return;
#endif
    
    FINALIZE_COLOR_FUNCTION(i, parameter, ret);

    //LookDev Properties
#if !MATERIAL_UNLIT && defined(LOOK_DEV) 

#ifndef LOD_DEBUG_OFF
    float distance = 0;
    float4 lodDistance = 0;
    float3 worldPos = unity_ObjectToWorld._14_24_34;
    lodDistance = _HeightLODDistance;
    float3 viewDir = worldPos.xyz - _WorldSpaceCameraPos.xyz;
    distance = sqrt(dot(viewDir,viewDir));
    
    int lod = 0; // 0-1-2-3
    lod = distance > lodDistance.x ? 0 : 0;
    lod = distance > lodDistance.y ? 1 : lod;
    lod = distance > lodDistance.z ? 2 : lod;
    lod = distance > lodDistance.w ? 3 : lod;

    lod = DebugMeshLODEnable == 0 ? lod : clamp(lod + DebugMeshLODOffset,0, DebugMeshLODMax);
#endif

    half3 lookdevRet = ret * _LookDevToggle1.x;
    lookdevRet += parameter.BaseColor * _LookDevToggle1.y   //Albdeo
                                + parameter.Roughness * _LookDevToggle1.z//Roughness
                                + parameter.Metallic * _LookDevToggle1.w//Metal
                                + parameter.AmbientOcclusion * _LookDevToggle2.x//AO
                                +  (worldNormal + 0.5) * _LookDevToggle2.y //Normal
                                +i.VertexColor.rgb * _LookDevToggle2.z//Vertex Color
                                +i.VertexColor.aaa * _LookDevToggle2.w//Vertex AO
                                + dirLight * _LookDevToggle3.y//Dir Light
                                + parameter.EmissiveColor * _LookDevToggle3.z // emissive
                                + specularIBL * _LookDevToggle3.w // emissive
    
                                ;

#ifndef LOD_DEBUG_OFF
    lookdevRet += half3(1,1,1) * half3(lod == 0,lod == 1,lod == 2) * _LookDevToggle3.x; // LOD;
#endif

                                
    ret.rgb =lookdevRet;

#endif

    #ifdef DebugParams
        half4 outputData = OutputDebugData(
            NoV,
            worldNormal,
            float4(0.1f, -10.2f, 0.3f, 0.4f),
            i.UV0,
            float2(0.5f, 0.5f),
            fontSizeInFS,
            4);
    
        if(outputData.a > 0.9f)
        {
            #ifndef OIT_ON
            fragOut.outColor = outputData;
            #endif
            return;
            
        }
    #endif

    #ifndef OIT_ON
    fragOut.outColor = ret;
    #endif
    return ;
}

float4 Persp2Orgho(float4 worldPosWithOffset)
{
    // float w = _ScreenParams.x;
    // float h = _ScreenParams.y;
    
    // 窄边100
    float w = lerp(100, _ScreenParams.x / _ScreenParams.y * 100, step(_ScreenParams.y, _ScreenParams.x));
    float h = lerp(_ScreenParams.y / _ScreenParams.x * 100, 100, step(_ScreenParams.y, _ScreenParams.x));

    float left = -w / 2;
    float right = w / 2;
    float bottom = -h / 2;
    float top = h / 2;
    float near = _ProjectionParams.y;
    float far = 10000; // _ProjectionParams.z;

    float4x4 m;
    m[0] = float4(2.0 / (right - left), 0.0, 0.0, 0.0);
    m[1] = float4(0.0, 2.0 / (top - bottom), 0.0, 0.0);
    m[2] = float4(0.0, 0.0, -2.0 / (far - near), 0.0);
    m[3] = float4(-(right + left) / (right - left), -(top + bottom) / (top - bottom), -(far + near) / (far - near), 1.0);

    float4 ret = mul(m, mul(UNITY_MATRIX_V, float4(worldPosWithOffset.xyz, 1.0)));
    ret.w = 1;

    return ret;
}

#endif //!MOBILE_BASE_PASS_CGINC_

// Flush Shader...add lines...
// -----------
