#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

#ifndef XLT_REMAP_O
	#define XLT_REMAP_O {0, 1, 2, 3, 4, 5, 6, 7}
#endif
constexpr constant uint xlt_remap_o[] = XLT_REMAP_O;
struct FGlobals_Type
{
    float _PlanarShadowDepthBias ;
    int _VT_RootSize ;
    int _VT_MaxVTMip ;
    float4 _VT_TerrainTileInfo ;
    float4 _VT_TerrainInfo ;
    float4 _VT_TerrainHeightInfo ;
    half4 gLightBuffer [116];
    half4 gFogParams [10];
    float4 gShadowParams0 [7];
    float gPlanarShadowEnabled ;
    half gShadowEnableDynamicShadow ;
    float4 gPlanarShadowParams ;
    float4 CloudSpeed ;
    float4 CloudParam ;
    float4 CloudOffset ;
    half4 _ScreenCenterFogParams0 ;
    half4 _ScreenCenterFogParams1 ;
    half4 _CustomReflCube_HDR ;
    half _CustomReflCubePower ;
    half _PuddleMaskSpread ;
    half _PuddleMaskContrast ;
    half _PuddleMaskIntensity ;
    half _PuddleWaterMetallic ;
    half _PuddleWaterRoughness ;
    half _PuddleWaterSpec ;
    half4 _PuddleWaterTintColor ;
    half4 _RainNormalUVScaleVector ;
    half4 _RainNormalDir ;
    half _RainNormalIntensity ;
};

struct UnityPerCamera_Type
{
    float4 _Time ;
    float4 _SinTime ;
    float4 _CosTime ;
    float4 unity_DeltaTime ;
    float3 _WorldSpaceCameraPos ;
    float4 _ProjectionParams ;
    float4 _ScreenParams ;
    float4 _ZBufferParams ;
    float4 unity_OrthoParams ;
};

struct UnityPerFrame_Type
{
    half4 glstate_lightmodel_ambient ;
    half4 unity_AmbientSky ;
    half4 unity_AmbientEquator ;
    half4 unity_AmbientGround ;
    half4 unity_IndirectSpecColor ;
    float4 hlslcc_mtx4x4glstate_matrix_projection [4];
    float4 hlslcc_mtx4x4unity_MatrixV [4];
    float4 hlslcc_mtx4x4unity_MatrixInvV [4];
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    int unity_StereoEyeIndex ;
    half4 unity_ShadowColor ;
};

struct UnityPerMaterial_Type
{
    half4 _MainTex_ST ;
    half4 _TintColorHDR ;
    half4 _RoughnessScale ;
    half _Roughness ;
    half4 _Metallic ;
    half _TextureLodBias ;
    half _VertexOcclusionIntensity ;
    half _MatcapStrength ;
    half _SnowInvIntensity ;
    half4 _NonSnowCol ;
    half4 _SnowColor ;
    half _SnowLevel ;
    half _SnowNoise ;
    half _SnowNoiseInvert ;
    half _SnowIntensity ;
    half _SnowWetness ;
    half _SnowOcclusion ;
    half _ShowSnowDirectly ;
    half4 _WeaponNoise_ST ;
    half4 _WpemissiveColor ;
    half _WpemissiveIntensity ;
    half _IsWeapon ;
    half _FlowSpeed ;
    half _FlowShappen ;
    half _FlowWeight ;
    half _FlowRotate ;
    half _WpNoiseMin ;
    half _WpNoiseMax ;
    half _WpNoiseIntensity ;
    half _AlphaControl ;
    half _PRStrength ;
    half _ReflectionDistortion ;
};

struct UnityDrawCallInfo_Type
{
    int unity_BaseInstanceID ;
    int unity_InstanceCount ;
};

struct ColorPropsArray_Type
{
    float4 _TeamColor ;
    float4 _HighlightColor ;
};

struct UnityInstancing_ColorProps_Type
{
    ColorPropsArray_Type ColorPropsArray [128];
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    half3 TEXCOORD5 [[ user(TEXCOORD5) ]] ;
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]] ;
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]] ;
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]]  [[ flat ]];
};

struct Mtl_FragmentOut
{
    half4 SV_TARGET0 [[ color(xlt_remap_o[0]) ]];
};

constexpr sampler _mtl_xl_shadow_sampler(address::clamp_to_edge, filter::linear, compare_func::greater_equal);
fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(2) ]],
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(3) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(4) ]],
    constant UnityInstancing_ColorProps_Type& UnityInstancing_ColorProps [[ buffer(5) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_NormalTex [[ sampler (1) ]],
    sampler sampler_VT_IndexTex [[ sampler (2) ]],
    sampler samplerCloudTex [[ sampler (3) ]],
    sampler sampler_CustomReflCube [[ sampler (4) ]],
    sampler sampler_RainNormalMap [[ sampler (5) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _RainNormalMap [[ texture(2) ]] ,
    texturecube<half, access::sample > _CustomReflCube [[ texture(3) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(4) ]] ,
    texture2d<half, access::sample > _VT_IndexTex [[ texture(5) ]] ,
    texture2d_array<half, access::sample > _VT_WorldYTex [[ texture(6) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(7) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(8) ]] ,
    texture2d<half, access::sample > BnSFog_FogMaskTex [[ texture(9) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler vt_linear_clamp_sampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    constexpr sampler shadow_linear_clamp_compare_sampler(compare_func::greater_equal,filter::linear,mip_filter::nearest,address::clamp_to_edge);
    constexpr sampler BnsFog_LinearClampSampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 u_xlat0;
    half4 u_xlat16_0;
    int u_xlati0;
    bool u_xlatb0;
    float3 u_xlat1;
    half4 u_xlat16_1;
    float3 u_xlat2;
    half4 u_xlat16_2;
    float u_xlat3;
    half4 u_xlat16_3;
    half3 u_xlat16_4;
    half3 u_xlat16_5;
    float4 u_xlat6;
    half4 u_xlat16_6;
    half3 u_xlat16_7;
    half3 u_xlat16_8;
    float3 u_xlat9;
    half3 u_xlat16_9;
    bool3 u_xlatb9;
    half3 u_xlat16_10;
    float3 u_xlat11;
    bool2 u_xlatb11;
    float3 u_xlat12;
    float3 u_xlat13;
    float3 u_xlat14;
    half3 u_xlat16_14;
    bool u_xlatb14;
    float3 u_xlat16;
    half u_xlat16_16;
    half u_xlat16_17;
    half3 u_xlat16_18;
    half3 u_xlat16_19;
    bool2 u_xlatb23;
    bool2 u_xlatb25;
    float u_xlat28;
    half u_xlat16_28;
    bool u_xlatb28;
    half u_xlat16_31;
    half2 u_xlat16_32;
    half u_xlat16_33;
    float u_xlat37;
    float u_xlat39;
    int2 u_xlati39;
    uint u_xlatu39;
    float u_xlat42;
    float u_xlat43;
    half u_xlat16_43;
    bool u_xlatb43;
    float u_xlat44;
    half u_xlat16_44;
    half u_xlat16_45;
    half u_xlat16_46;
    half u_xlat16_47;
    half u_xlat16_50;
    float u_xlat51;
    half u_xlat16_51;
    half u_xlat10_51;
    uint u_xlatu51;
    bool u_xlatb51;
    u_xlati0 = int(input.SV_InstanceID0) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat14.xy = fma(u_xlat1.xy, float2(UnityPerMaterial._MainTex_ST.xy), float2(UnityPerMaterial._MainTex_ST.zw));
    u_xlati0 = u_xlati0 << 0x1;
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, u_xlat14.xy);
    u_xlat16_2 = _NormalTex.sample(sampler_NormalTex, u_xlat14.xy);
    u_xlat16_3.xy = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_3.z = (-u_xlat16_3.y);
    u_xlat16_17 = dot(u_xlat16_3.xz, u_xlat16_3.xz);
    u_xlat16_17 = min(u_xlat16_17, half(1.0));
    u_xlat16_17 = (-u_xlat16_17) + half(1.0);
    u_xlat16_3.w = sqrt(u_xlat16_17);
    u_xlat16_4.xyz = half3(fma(float3(u_xlat16_1.xyz), float3(UnityPerMaterial._TintColorHDR.xyz), UnityInstancing_ColorProps.ColorPropsArray[u_xlati0 / 2]._HighlightColor.xyz));
    u_xlat16_17 = u_xlat16_2.w * UnityPerMaterial._SnowIntensity;
    u_xlatb0 = UnityPerMaterial._ShowSnowDirectly<half(1.0);
    u_xlat16_46 = u_xlat16_17 * FGlobals.gLightBuffer[8].z;
    u_xlat16_17 = (u_xlatb0) ? u_xlat16_46 : u_xlat16_17;
    u_xlat16_5.xyz = (-UnityPerMaterial._NonSnowCol.xyz) + half3(1.0, 1.0, 1.0);
    u_xlat16_46 = (-u_xlat16_17) + half(1.0);
    u_xlat16_6.xyz = half3(u_xlat16_46) * u_xlat16_4.xyz;
    u_xlat16_6.xyz = u_xlat16_6.xyz * FGlobals.gLightBuffer[8].zzz;
    u_xlat16_5.xyz = u_xlat16_5.xyz * u_xlat16_6.xyz;
    u_xlat16_4.xyz = fma(u_xlat16_5.xyz, half3(UnityPerMaterial._SnowInvIntensity), u_xlat16_4.xyz);
    u_xlat16_4.xyz = clamp(u_xlat16_4.xyz, 0.0h, 1.0h);
    u_xlat16_5.xyz = (-u_xlat16_4.xyz) + UnityPerMaterial._SnowColor.xyz;
    u_xlat16_4.xyz = fma(half3(u_xlat16_17), u_xlat16_5.xyz, u_xlat16_4.xyz);
    u_xlatb0 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_19.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_5.x = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_19.x = (u_xlatb0) ? FGlobals.gLightBuffer[8].x : u_xlat16_5.x;
    u_xlat16_5.x = dot(UnityPerMaterial._RoughnessScale.xyz, u_xlat16_19.xyz);
    u_xlat16_5.x = u_xlat16_2.z * u_xlat16_5.x;
    u_xlat16_19.x = fma(u_xlat16_1.x, UnityPerMaterial._Metallic.x, UnityPerMaterial._Metallic.y);
    u_xlat16_19.x = max(u_xlat16_19.x, UnityPerMaterial._Metallic.z);
    u_xlat16_19.x = min(u_xlat16_19.x, UnityPerMaterial._Metallic.w);
    u_xlat16_17 = fma(UnityPerMaterial._RoughnessScale.w, u_xlat16_17, u_xlat16_46);
    u_xlat16_33 = u_xlat16_17 * u_xlat16_5.x;
    u_xlat16_47 = u_xlat16_46 * u_xlat16_19.x;
    u_xlat0.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat42 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat42 = max(u_xlat42, 0.00100000005);
    u_xlat42 = rsqrt(u_xlat42);
    u_xlat1.xyz = float3(u_xlat42) * u_xlat0.xyz;
    u_xlat6 = float4(FGlobals._RainNormalDir) * UnityPerCamera._Time.yyyy;
    u_xlat6 = fma(input.TEXCOORD0.xzxz, float4(FGlobals._RainNormalUVScaleVector), u_xlat6);
    u_xlat16_2.xy = _RainNormalMap.sample(sampler_RainNormalMap, u_xlat6.xy).xy;
    u_xlat16_7.xy = _RainNormalMap.sample(sampler_RainNormalMap, u_xlat6.zw).xy;
    u_xlat16_6.xy = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_6.z = half(-1.0);
    u_xlat16_8.xy = fma(u_xlat16_7.xy, half2(2.0, 2.0), u_xlat16_6.xz);
    u_xlat16_6.w = (-u_xlat16_6.y);
    u_xlat16_8.z = (-u_xlat16_8.y);
    u_xlat16_7.xy = u_xlat16_6.zw + u_xlat16_8.xz;
    u_xlat16_7.xy = u_xlat16_7.xy;
    u_xlat16_7.z = half(0.0);
    u_xlat16_8.xyz = fma(half3(FGlobals._RainNormalIntensity), u_xlat16_7.xyz, half3(0.0, 0.0, 1.0));
    u_xlat16_2.x = dot(u_xlat16_8.xyz, u_xlat16_8.xyz);
    u_xlat16_2.x = rsqrt(u_xlat16_2.x);
    u_xlat16_9.xyz = u_xlat16_2.xxx * u_xlat16_8.xyz;
    u_xlat16_50 = (-u_xlat16_2.z) + half(1.0);
    u_xlat16_50 = fma(FGlobals._PuddleMaskSpread, half(1.89999998), u_xlat16_50);
    u_xlat16_50 = u_xlat16_50 + half(-1.20000005);
    u_xlat16_10.x = FGlobals._PuddleMaskContrast + half(1.0);
    u_xlat16_16 = (-u_xlat16_10.x) + half(1.0);
    u_xlat16_16 = u_xlat16_16 * half(0.5);
    u_xlat16_16 = u_xlat16_50 * u_xlat16_16;
    u_xlat16_16 = fma(u_xlat16_10.x, u_xlat16_50, u_xlat16_16);
    u_xlat16_50 = u_xlat16_16 * FGlobals._PuddleMaskIntensity;
    u_xlat16_50 = clamp(u_xlat16_50, 0.0h, 1.0h);
    u_xlat16_10.xyz = fma(u_xlat16_4.xyz, FGlobals._PuddleWaterTintColor.xyz, (-u_xlat16_4.xyz));
    u_xlat16_4.xyz = fma(half3(u_xlat16_50), u_xlat16_10.xyz, u_xlat16_4.xyz);
    u_xlat16_17 = fma((-u_xlat16_5.x), u_xlat16_17, FGlobals._PuddleWaterRoughness);
    u_xlat16_17 = fma(u_xlat16_50, u_xlat16_17, u_xlat16_33);
    u_xlat16_46 = fma((-u_xlat16_19.x), u_xlat16_46, FGlobals._PuddleWaterMetallic);
    u_xlat16_46 = fma(u_xlat16_50, u_xlat16_46, u_xlat16_47);
    u_xlat16_5.xyz = fma(u_xlat16_8.xyz, u_xlat16_2.xxx, (-u_xlat16_3.xzw));
    u_xlat16_3.xzw = fma(half3(u_xlat16_50), u_xlat16_5.xyz, u_xlat16_3.xzw);
    u_xlat16_5.x = FGlobals._PuddleWaterSpec + half(-0.5);
    u_xlat16_5.x = fma(u_xlat16_50, u_xlat16_5.x, half(0.5));
    u_xlat16_19.xyz = u_xlat16_9.yyy * input.TEXCOORD4.xyz;
    u_xlat16_19.xyz = fma(input.TEXCOORD3.xyz, u_xlat16_9.xxx, u_xlat16_19.xyz);
    u_xlat16_19.xyz = fma(input.TEXCOORD5.xyz, u_xlat16_9.zzz, u_xlat16_19.xyz);
    u_xlat16_2.x = dot(u_xlat16_19.xyz, u_xlat16_19.xyz);
    u_xlat16_2.x = max(u_xlat16_2.x, half(0.00100000005));
    u_xlat16_2.x = rsqrt(u_xlat16_2.x);
    u_xlat16_2.xyz = u_xlat16_2.xxx * u_xlat16_19.xyz;
    u_xlat16_19.x = dot((-u_xlat1.xyz), float3(u_xlat16_2.xyz));
    u_xlat16_19.x = u_xlat16_19.x + u_xlat16_19.x;
    u_xlat16_19.xyz = half3(fma(float3(u_xlat16_2.xyz), (-float3(u_xlat16_19.xxx)), (-u_xlat1.xyz)));
    u_xlat16_8.x = dot(u_xlat16_19.xyz, u_xlat16_19.xyz);
    u_xlat16_8.x = rsqrt(u_xlat16_8.x);
    u_xlat16_19.xyz = u_xlat16_19.xyz * u_xlat16_8.xxx;
    u_xlat16_2 = _CustomReflCube.sample(sampler_CustomReflCube, float3(u_xlat16_19.xyz));
    u_xlat16_19.x = u_xlat16_2.w + half(-1.0);
    u_xlat16_19.x = fma(FGlobals._CustomReflCube_HDR.w, u_xlat16_19.x, half(1.0));
    u_xlat16_19.x = log2(u_xlat16_19.x);
    u_xlat16_19.x = u_xlat16_19.x * FGlobals._CustomReflCube_HDR.y;
    u_xlat16_19.x = exp2(u_xlat16_19.x);
    u_xlat16_19.x = u_xlat16_19.x * FGlobals._CustomReflCube_HDR.x;
    u_xlat16_19.xyz = u_xlat16_2.xyz * u_xlat16_19.xxx;
    u_xlat16_19.xyz = u_xlat16_19.xyz * half3(FGlobals._CustomReflCubePower);
    u_xlat16_19.xyz = u_xlat16_19.xyz * half3(u_xlat16_50);
    output.SV_TARGET0.w = u_xlat16_1.w * input.TEXCOORD2.w;
    u_xlat16_17 = max(u_xlat16_17, half(0.119999997));
    u_xlat16_17 = min(u_xlat16_17, half(1.0));
    u_xlat16_8.xyz = u_xlat16_3.zzz * input.TEXCOORD4.xyz;
    u_xlat16_8.xyz = fma(input.TEXCOORD3.xyz, u_xlat16_3.xxx, u_xlat16_8.xyz);
    u_xlat16_3.xzw = fma(input.TEXCOORD5.xyz, u_xlat16_3.www, u_xlat16_8.xyz);
    u_xlat16_43 = dot(u_xlat16_3.xzw, u_xlat16_3.xzw);
    u_xlat16_43 = max(u_xlat16_43, half(0.00100000005));
    u_xlat16_43 = rsqrt(u_xlat16_43);
    u_xlat16_2.xyz = half3(u_xlat16_43) * u_xlat16_3.xzw;
    u_xlatb43 = 0.0>=FGlobals.gShadowParams0[5].z;
    if(u_xlatb43){
        u_xlat16_3.x = half(1.0);
    }
    if(!u_xlatb43){
        u_xlat9.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlatb43 = 0.5<FGlobals.gPlanarShadowEnabled;
        u_xlat44 = input.TEXCOORD0.y + 100.0;
        u_xlat44 = u_xlat44 / FGlobals.gPlanarShadowParams.y;
        u_xlat44 = u_xlat44 + FGlobals._PlanarShadowDepthBias;
        u_xlatb51 = FGlobals.gPlanarShadowEnabled<0.5;
        u_xlat11.x = min(u_xlat9.z, 0.999000013);
        u_xlat37 = (u_xlatb51) ? u_xlat11.x : u_xlat9.z;
        u_xlat37 = (u_xlatb43) ? u_xlat44 : u_xlat37;
        u_xlat51 = u_xlat37 + FGlobals.gShadowParams0[4].z;
        u_xlat11.x = (-u_xlat51) + 1.0;
        u_xlat51 = (u_xlatb43) ? u_xlat51 : u_xlat11.x;
        u_xlat51 = float(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat9.xy, saturate(u_xlat51), level(0.0)));
        u_xlatb11.xy = (u_xlat9.xy<float2(0.0, 0.0));
        u_xlatb11.x = u_xlatb11.y || u_xlatb11.x;
        u_xlatb25.xy = (float2(1.0, 1.0)<u_xlat9.xy);
        u_xlatb25.x = u_xlatb25.y || u_xlatb25.x;
        u_xlatb11.x = u_xlatb25.x || u_xlatb11.x;
        u_xlat16_31 = (u_xlatb11.x) ? half(1.0) : half(u_xlat51);
        u_xlatb51 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb51){
            if(u_xlatb43){
                u_xlat51 = (-input.TEXCOORD0.y) + FGlobals.gPlanarShadowParams.x;
                u_xlat51 = u_xlat51 / float(FGlobals.gLightBuffer[11].y);
                u_xlat6.xyz = fma(float3(FGlobals.gLightBuffer[11].xyz), float3(u_xlat51), input.TEXCOORD0.xyz);
                u_xlat6.w = 1.0;
                u_xlat11.x = dot(FGlobals.gShadowParams0[0], u_xlat6);
                u_xlat11.y = dot(FGlobals.gShadowParams0[1], u_xlat6);
                u_xlat11.z = dot(FGlobals.gShadowParams0[3], u_xlat6);
                u_xlat16_8.xyz = half3(u_xlat11.xyz * float3(0.5, 0.5, 0.5));
                u_xlat16_10.x = u_xlat16_8.z + u_xlat16_8.x;
                u_xlat16_10.y = half(fma(float(u_xlat16_8.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_8.z)));
                u_xlat44 = u_xlat44 * u_xlat11.z;
                u_xlat11.xy = float2(u_xlat16_10.xy) / u_xlat11.zz;
                u_xlat37 = u_xlat44 / u_xlat11.z;
            } else {
                u_xlat11.xy = fma(u_xlat9.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            }
            u_xlat44 = u_xlat37 + FGlobals.gShadowParams0[4].z;
            u_xlat9.x = (-u_xlat44) + 1.0;
            u_xlat44 = (u_xlatb43) ? u_xlat44 : u_xlat9.x;
            u_xlat44 = float(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat11.xy, saturate(u_xlat44), level(0.0)));
            u_xlatb9.xy = (u_xlat11.xy<float2(0.0, 0.0));
            u_xlatb9.x = u_xlatb9.y || u_xlatb9.x;
            u_xlatb23.xy = (float2(1.0, 1.0)<u_xlat11.xy);
            u_xlatb23.x = u_xlatb23.y || u_xlatb23.x;
            u_xlatb9.x = u_xlatb23.x || u_xlatb9.x;
            u_xlat16_45 = (u_xlatb9.x) ? half(1.0) : half(u_xlat44);
            u_xlat16_31 = min(u_xlat16_45, u_xlat16_31);
        }
        u_xlat43 = (u_xlatb43) ? -100.0 : -30.0;
        u_xlatb43 = input.TEXCOORD0.y<u_xlat43;
        u_xlat16_44 = u_xlat16_31 + half(-1.0);
        u_xlat44 = fma(FGlobals.gShadowParams0[5].z, float(u_xlat16_44), 1.0);
        u_xlat3 = (u_xlatb43) ? 1.0 : u_xlat44;
        u_xlat16_3.x = half(u_xlat3);
    }
    u_xlatb43 = 0.0<FGlobals.CloudParam.w;
    if(u_xlatb43){
        u_xlat6 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
        u_xlat6 = fma(u_xlat6, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
        u_xlat6 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat6);
        u_xlat16_43 = CloudTex.sample(samplerCloudTex, u_xlat6.xy).y;
        u_xlat16_44 = CloudTex.sample(samplerCloudTex, u_xlat6.zw).w;
        u_xlat16_31 = u_xlat16_44 * half(0.5);
        u_xlat16_31 = fma(u_xlat16_43, half(0.5), u_xlat16_31);
        u_xlat16_43 = fma((-u_xlat16_31), u_xlat16_31, u_xlat16_31);
        u_xlat44 = fma((-float(u_xlat16_31)), float(u_xlat16_31), FGlobals.CloudParam.y);
        u_xlat16_43 = half(1.0) / u_xlat16_43;
        u_xlat43 = float(u_xlat16_43) * u_xlat44;
        u_xlat43 = clamp(u_xlat43, 0.0f, 1.0f);
        u_xlat44 = fma(u_xlat43, -2.0, 3.0);
        u_xlat43 = u_xlat43 * u_xlat43;
        u_xlat43 = u_xlat43 * u_xlat44;
        u_xlat43 = fma((-u_xlat43), FGlobals.CloudParam.z, 1.0);
        u_xlat43 = clamp(u_xlat43, 0.0f, 1.0f);
        u_xlat16_3.x = half(min(u_xlat43, float(u_xlat16_3.x)));
    }
    u_xlat16_31 = u_xlat16_5.x * half(0.0799999982);
    u_xlat16_8.xyz = fma((-u_xlat16_4.xyz), half3(u_xlat16_46), u_xlat16_4.xyz);
    u_xlat16_31 = fma((-u_xlat16_31), u_xlat16_46, u_xlat16_31);
    u_xlat16_4.xyz = fma(u_xlat16_4.xyz, half3(u_xlat16_46), half3(u_xlat16_31));
    u_xlat16_31 = dot(float3(u_xlat16_2.xyz), u_xlat1.xyz);
    u_xlat16_1 = fma(half4(u_xlat16_17), half4(-1.0, -0.0274999999, -0.572000027, 0.0219999999), half4(1.0, 0.0425000004, 1.03999996, -0.0399999991));
    u_xlat16_45 = u_xlat16_1.x * u_xlat16_1.x;
    u_xlat16_46 = u_xlat16_31 * half(-9.27999973);
    u_xlat16_46 = exp2(u_xlat16_46);
    u_xlat16_45 = min(u_xlat16_45, u_xlat16_46);
    u_xlat16_45 = fma(u_xlat16_45, u_xlat16_1.x, u_xlat16_1.y);
    u_xlat16_10.xy = fma(half2(u_xlat16_45), half2(-1.03999996, 1.03999996), u_xlat16_1.zw);
    u_xlat16_45 = u_xlat16_4.y * half(50.0);
    u_xlat16_45 = clamp(u_xlat16_45, 0.0h, 1.0h);
    u_xlat16_45 = u_xlat16_45 * u_xlat16_10.y;
    u_xlat16_4.xyz = fma(u_xlat16_4.xyz, u_xlat16_10.xxx, half3(u_xlat16_45));
    u_xlat16_45 = dot(float3(0.212500006, 0.715399981, 0.0720999986), input.TEXCOORD8.xyz);
    u_xlat16_45 = u_xlat16_45 * FGlobals.gLightBuffer[10].w;
    u_xlat16_45 = clamp(u_xlat16_45, 0.0h, 1.0h);
    u_xlat9.xyz = float3(u_xlat16_8.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_5.xyz = u_xlat16_4.xyz * u_xlat16_19.xyz;
    u_xlat16_5.xyz = half3(u_xlat16_45) * u_xlat16_5.xyz;
    u_xlat16_5.xyz = u_xlat16_5.xyz * FGlobals.gLightBuffer[10].xyz;
    u_xlat16_5.xyz = half3(fma(u_xlat9.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_5.xyz)));
    u_xlat16_9.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat0.xyz = fma(u_xlat0.xyz, float3(u_xlat42), float3(FGlobals.gLightBuffer[13].xyz));
    u_xlat42 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat42 = max(u_xlat42, 0.00100000005);
    u_xlat42 = rsqrt(u_xlat42);
    u_xlat0.xyz = float3(u_xlat42) * u_xlat0.xyz;
    u_xlat16_45 = dot(u_xlat16_2.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_45 = max(u_xlat16_45, half(0.0));
    u_xlat0.x = dot(float3(u_xlat16_2.xyz), u_xlat0.xyz);
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlatb14 = u_xlat16_31>=half(0.0);
    u_xlat16_31 = (u_xlatb14) ? half(1.0) : half(0.0);
    u_xlat16_14.xyz = half3(u_xlat16_45) * u_xlat16_9.xyz;
    u_xlat16_4.xyz = u_xlat16_4.xyz * half3(u_xlat16_31);
    u_xlat16_31 = fma(u_xlat16_17, half(0.25), half(0.25));
    u_xlat2.x = fma((-u_xlat0.x), u_xlat0.x, 1.0);
    u_xlat16_17 = u_xlat16_17 * u_xlat16_17;
    u_xlat0.x = u_xlat0.x * float(u_xlat16_17);
    u_xlat0.x = fma(u_xlat0.x, u_xlat0.x, u_xlat2.x);
    u_xlat0.x = float(u_xlat16_17) / u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = min(u_xlat0.x, 128.0);
    u_xlat0.x = u_xlat0.x * float(u_xlat16_31);
    u_xlat2.xyz = fma(float3(u_xlat16_4.xyz), u_xlat0.xxx, float3(u_xlat16_8.xyz));
    u_xlat0.xyz = float3(u_xlat16_14.xyz) * u_xlat2.xyz;
    u_xlat16_3.xyz = half3(fma(u_xlat0.xyz, float3(u_xlat16_3.xxx), float3(u_xlat16_5.xyz)));
    u_xlat16_45 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_45 = min(u_xlat16_45, half(1.0));
    u_xlat16_4.x = (-u_xlat16_45) + half(1.0);
    u_xlat16_45 = fma(UnityPerMaterial._VertexOcclusionIntensity, u_xlat16_4.x, u_xlat16_45);
    u_xlat16_3.xyz = half3(u_xlat16_45) * u_xlat16_3.xyz;
    u_xlat0.xyz = input.TEXCOORD0.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
    u_xlat2.x = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat16.x = max(u_xlat2.x, 0.00100000005);
    u_xlat16.x = rsqrt(u_xlat16.x);
    u_xlat16.xyz = u_xlat0.xyz * u_xlat16.xxx;
    u_xlat2.x = sqrt(u_xlat2.x);
    u_xlat16_45 = half(u_xlat2.x + (-float(FGlobals.gFogParams[1].z)));
    u_xlat16_45 = max(u_xlat16_45, half(0.0));
    u_xlatb9.xyz = (half3(0.5, 0.5, 0.5)<FGlobals.gFogParams[7].wzx);
    u_xlatb51 = u_xlatb9.y || u_xlatb9.x;
    if(u_xlatb51){
        u_xlat11.xy = input.TEXCOORD0.xz + (-FGlobals._VT_TerrainInfo.zw);
        u_xlat11.xy = u_xlat11.xy * FGlobals._VT_TerrainInfo.yy;
        u_xlat11.xy = clamp(u_xlat11.xy, 0.0f, 1.0f);
        u_xlat16_51 = _VT_IndexTex.sample(sampler_VT_IndexTex, u_xlat11.xy, level(0.0)).x;
        u_xlat51 = fma(float(u_xlat16_51), 255.0, 0.5);
        u_xlatu51 = uint(u_xlat51);
        u_xlatu39 = u_xlatu51 & 0x7fu;
        u_xlat12.z = float(u_xlatu39);
        u_xlatu51 = u_xlatu51 >> 0x7u;
        u_xlat51 = float(u_xlatu51);
        u_xlati39.xy = int2(FGlobals._VT_TerrainTileInfo.yz);
        u_xlati39.x = (-u_xlati39.y) + u_xlati39.x;
        u_xlati39.x = 0x1 << u_xlati39.x;
        u_xlat39 = float(u_xlati39.x);
        u_xlat13.xy = float2(int2(FGlobals._VT_RootSize, FGlobals._VT_MaxVTMip));
        u_xlat11.xy = u_xlat11.xy * u_xlat13.xx;
        u_xlat13.xz = u_xlat11.xy / float2(u_xlat39);
        u_xlat13.xz = floor(u_xlat13.xz);
        u_xlat11.xy = fma((-u_xlat13.xz), float2(u_xlat39), u_xlat11.xy);
        u_xlat12.xy = u_xlat11.xy / float2(u_xlat39);
        u_xlat12.xy = clamp(u_xlat12.xy, 0.0f, 1.0f);
        u_xlat51 = min(u_xlat51, u_xlat13.y);
        u_xlat10_51 = half(_VT_WorldYTex.sample(vt_linear_clamp_sampler, u_xlat12.xy, round(u_xlat12.z), level(u_xlat51)).x);
        u_xlat11.x = (-FGlobals._VT_TerrainHeightInfo.x) + FGlobals._VT_TerrainHeightInfo.y;
        u_xlat51 = fma(float(u_xlat10_51), u_xlat11.x, FGlobals._VT_TerrainHeightInfo.x);
        u_xlat51 = u_xlat51 + FGlobals._VT_TerrainHeightInfo.w;
        u_xlat51 = max(u_xlat51, -1000000.0);
        u_xlat51 = min(u_xlat51, 1000000.0);
    } else {
        u_xlat51 = 0.0;
    }
    u_xlat16_4.x = FGlobals.gFogParams[0].w + FGlobals.gFogParams[1].x;
    u_xlat11.x = (-u_xlat51) + input.TEXCOORD0.y;
    u_xlat0.w = u_xlat11.x + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = dot(u_xlat0.xzw, u_xlat0.xzw);
    u_xlat0.x = sqrt(u_xlat0.x);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlat28 = (u_xlatb9.x) ? u_xlat0.w : u_xlat0.y;
    u_xlat16_45 = (u_xlatb9.x) ? half(u_xlat0.x) : u_xlat16_45;
    u_xlat16_18.x = half(float(FGlobals.gFogParams[1].z) / u_xlat2.x);
    u_xlat16_18.x = clamp(u_xlat16_18.x, 0.0h, 1.0h);
    u_xlat0.x = fma(u_xlat28, float(u_xlat16_18.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[0].x));
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[1].w);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_18.x = (-u_xlat16_18.x) + half(1.0);
    u_xlat28 = u_xlat28 * float(u_xlat16_18.x);
    u_xlat28 = u_xlat28 * float(FGlobals.gFogParams[1].w);
    u_xlat28 = max(u_xlat28, -64.0);
    u_xlat28 = min(u_xlat28, -0.00100000005);
    u_xlat42 = exp2((-u_xlat28));
    u_xlat42 = (-u_xlat42) + 1.0;
    u_xlat42 = u_xlat42 / u_xlat28;
    u_xlatb28 = 0.00999999978<(-u_xlat28);
    u_xlat28 = (u_xlatb28) ? u_xlat42 : 0.693147004;
    u_xlat0.x = u_xlat28 * u_xlat0.x;
    u_xlat16_45 = half(u_xlat0.x * (-float(u_xlat16_45)));
    u_xlat16_45 = u_xlat16_4.x * u_xlat16_45;
    u_xlat16_45 = u_xlat16_45 * FGlobals.gFogParams[0].y;
    u_xlat16_45 = exp2(u_xlat16_45);
    u_xlat16_45 = max(u_xlat16_45, FGlobals.gFogParams[0].z);
    u_xlat16_18.x = dot(float3(FGlobals.gLightBuffer[11].xyz), u_xlat16.xyz);
    u_xlat16_5.xyz = FGlobals.gFogParams[0].www * FGlobals.gFogParams[2].xyz;
    u_xlat16_32.x = fma(u_xlat16_18.x, u_xlat16_18.x, half(1.0));
    u_xlat16_8.xyz = FGlobals.gFogParams[1].xxx * FGlobals.gFogParams[3].xyz;
    u_xlat16_32.y = fma((-FGlobals.gFogParams[1].y), FGlobals.gFogParams[1].y, half(1.0));
    u_xlat16_0.xz = u_xlat16_32.xy * half2(0.0596831031, 0.119366206);
    u_xlat16_10.xy = fma(FGlobals.gFogParams[1].yy, FGlobals.gFogParams[1].yy, half2(1.0, 2.0));
    u_xlat16_18.x = dot(u_xlat16_18.xx, FGlobals.gFogParams[1].yy);
    u_xlat16_18.x = (-u_xlat16_18.x) + u_xlat16_10.x;
    u_xlat16_18.x = log2(abs(u_xlat16_18.x));
    u_xlat16_18.x = u_xlat16_18.x * half(-1.5);
    u_xlat16_18.x = exp2(u_xlat16_18.x);
    u_xlat16_28 = u_xlat16_0.z * u_xlat16_18.x;
    u_xlat16_28 = u_xlat16_32.x * u_xlat16_28;
    u_xlat16_28 = u_xlat16_28 / u_xlat16_10.y;
    u_xlat16_18.xyz = half3(u_xlat16_28) * u_xlat16_8.xyz;
    u_xlat16_8.xyz = FGlobals.gLightBuffer[12].xyz * FGlobals.gFogParams[2].www;
    u_xlat16_18.xyz = fma(u_xlat16_5.xyz, u_xlat16_0.xxx, u_xlat16_18.xyz);
    u_xlat16_18.xyz = u_xlat16_18.xyz * u_xlat16_8.xyz;
    u_xlat16_4.xyz = u_xlat16_18.xyz / u_xlat16_4.xxx;
    u_xlat16_46 = (-u_xlat16_45) + half(1.0);
    u_xlat16_4.xyz = half3(u_xlat16_46) * u_xlat16_4.xyz;
    u_xlat0.x = u_xlat51 + float(FGlobals.gFogParams[3].w);
    u_xlat0.x = (u_xlatb9.y) ? u_xlat0.x : float(FGlobals.gFogParams[3].w);
    u_xlat16_46 = half(u_xlat2.x + (-float(FGlobals.gFogParams[5].y)));
    u_xlat16_46 = max(u_xlat16_46, half(0.0));
    u_xlat16_5.x = half(float(FGlobals.gFogParams[5].y) / u_xlat2.x);
    u_xlat16_5.x = clamp(u_xlat16_5.x, 0.0h, 1.0h);
    u_xlat28 = fma(u_xlat0.y, float(u_xlat16_5.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = (-u_xlat0.x) + u_xlat28;
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[5].z);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_5.x = (-u_xlat16_5.x) + half(1.0);
    u_xlat14.x = u_xlat0.y * float(u_xlat16_5.x);
    u_xlat14.x = u_xlat14.x * float(FGlobals.gFogParams[5].z);
    u_xlat14.x = max(u_xlat14.x, -64.0);
    u_xlat14.x = min(u_xlat14.x, -0.00100000005);
    u_xlat28 = exp2((-u_xlat14.x));
    u_xlat28 = (-u_xlat28) + 1.0;
    u_xlat28 = u_xlat28 / u_xlat14.x;
    u_xlatb14 = 0.00999999978<(-u_xlat14.x);
    u_xlat14.x = (u_xlatb14) ? u_xlat28 : 0.693147004;
    u_xlat0.x = u_xlat14.x * u_xlat0.x;
    u_xlat16_46 = half(u_xlat0.x * (-float(u_xlat16_46)));
    u_xlat16_46 = u_xlat16_46 * FGlobals.gFogParams[4].w;
    u_xlat16_46 = exp2(u_xlat16_46);
    u_xlat16_46 = max(u_xlat16_46, FGlobals.gFogParams[5].x);
    u_xlat16_0.xy = max(FGlobals.gFogParams[9].xy, half2(9.99999975e-05, 9.99999975e-05));
    u_xlat28 = u_xlat2.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat16_0.xy = half2(1.0, 1.0) / u_xlat16_0.xy;
    u_xlat0.x = float(u_xlat16_0.x) * u_xlat28;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat28 = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat28;
    u_xlat28 = u_xlat2.x + (-float(FGlobals.gFogParams[5].y));
    u_xlat14.x = float(u_xlat16_0.y) * u_xlat28;
    u_xlat14.x = clamp(u_xlat14.x, 0.0f, 1.0f);
    u_xlat28 = fma(u_xlat14.x, -2.0, 3.0);
    u_xlat14.x = u_xlat14.x * u_xlat14.x;
    u_xlat14.x = u_xlat14.x * u_xlat28;
    u_xlat16_4.xyz = half3(u_xlat0.xxx * float3(u_xlat16_4.xyz));
    u_xlat16_28 = u_xlat16_45 + half(-1.0);
    u_xlat0.x = fma(u_xlat0.x, float(u_xlat16_28), 1.0);
    u_xlat16_28 = u_xlat16_46 + half(-1.0);
    u_xlat14.x = fma(u_xlat14.x, float(u_xlat16_28), 1.0);
    u_xlat16_45 = half((-u_xlat14.x) + 1.0);
    u_xlat16_4.xyz = half3(u_xlat14.xxx * float3(u_xlat16_4.xyz));
    u_xlat16_1.xyz = fma(FGlobals.gFogParams[4].xyz, half3(u_xlat16_45), u_xlat16_4.xyz);
    u_xlat16_1.w = half(u_xlat0.x * u_xlat14.x);
    if(u_xlatb9.z){
        u_xlat16_4.xy = half2(fma(input.TEXCOORD0.xz, float2(FGlobals.gFogParams[8].xy), float2(FGlobals.gFogParams[8].zw)));
        u_xlat16_45 = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_4.xy), level(0.0)).x;
        u_xlat16_45 = log2(u_xlat16_45);
        u_xlat16_45 = u_xlat16_45 * FGlobals.gFogParams[7].y;
        u_xlat16_45 = exp2(u_xlat16_45);
        u_xlat16_4.x = half(fma((-u_xlat14.x), u_xlat0.x, 1.0));
        u_xlat16_1.w = fma(u_xlat16_45, u_xlat16_4.x, u_xlat16_1.w);
        u_xlat16_1.xyz = fma(half3(u_xlat16_45), (-u_xlat16_1.xyz), u_xlat16_1.xyz);
    }
    u_xlatb0 = half(0.0)<FGlobals._ScreenCenterFogParams0.z;
    u_xlat14.xyz = input.TEXCOORD0.yyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1].xyw;
    u_xlat14.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0].xyw, input.TEXCOORD0.xxx, u_xlat14.xyz);
    u_xlat14.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2].xyw, input.TEXCOORD0.zzz, u_xlat14.xyz);
    u_xlat14.xyz = u_xlat14.xyz + UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3].xyw;
    u_xlat14.xy = u_xlat14.xy / u_xlat14.zz;
    u_xlat14.xy = fma(u_xlat14.xy, float2(0.5, 0.5), float2(0.5, 0.5));
    u_xlat16_2.xy = FGlobals._ScreenCenterFogParams1.xy + half2(0.5, 0.5);
    u_xlat14.xy = u_xlat14.xy + (-float2(u_xlat16_2.xy));
    u_xlat14.x = dot(u_xlat14.xy, u_xlat14.xy);
    u_xlat14.x = sqrt(u_xlat14.x);
    u_xlat16_45 = half(u_xlat14.x + (-float(FGlobals._ScreenCenterFogParams0.x)));
    u_xlat16_4.x = half(1.0) / FGlobals._ScreenCenterFogParams0.y;
    u_xlat16_45 = u_xlat16_45 * u_xlat16_4.x;
    u_xlat16_45 = clamp(u_xlat16_45, 0.0h, 1.0h);
    u_xlat16_4.x = fma(u_xlat16_45, half(-2.0), half(3.0));
    u_xlat16_45 = u_xlat16_45 * u_xlat16_45;
    u_xlat16_45 = fma((-u_xlat16_4.x), u_xlat16_45, half(1.0));
    u_xlat16_4.x = u_xlat16_45 * FGlobals._ScreenCenterFogParams0.z;
    u_xlat16_45 = fma((-u_xlat16_45), FGlobals._ScreenCenterFogParams0.z, half(1.0));
    u_xlat16_2.xyz = u_xlat16_1.xyz * half3(u_xlat16_45);
    u_xlat16_45 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_2.w = fma(u_xlat16_4.x, u_xlat16_45, u_xlat16_1.w);
    u_xlat16_0 = (bool(u_xlatb0)) ? u_xlat16_2 : u_xlat16_1;
    output.SV_TARGET0.xyz = fma(u_xlat16_3.xyz, u_xlat16_0.www, u_xlat16_0.xyz);
    return output;
}
