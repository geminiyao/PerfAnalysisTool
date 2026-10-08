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
    int _VT_RootSize ;
    int _VT_MaxVTMip ;
    float4 _VT_TerrainTileInfo ;
    float4 _VT_TerrainInfo ;
    float4 _VT_TerrainHeightInfo ;
    half _SpecCubeLodSteps ;
    half _SpecCubePower ;
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
    half4 _SnowColor ;
    half _SnowLevel ;
    half _SnowNoise ;
    half _SnowNoiseInvert ;
    half _SnowIntensity ;
    half _SnowWetness ;
    half _SnowOcclusion ;
    half _ShowSnowDirectly ;
    half4 _NightColorHDR ;
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
    float4 TEXCOORD9 [[ user(TEXCOORD9) ]] ;
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]] ;
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]]  [[ flat ]];
};

struct Mtl_FragmentOut
{
    half4 SV_TARGET0 [[ color(xlt_remap_o[0]) ]];
    float SV_Target1 [[ color(xlt_remap_o[1]) ]];
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
    sampler samplerCloudTex [[ sampler (2) ]],
    sampler sampler_VT_IndexTex [[ sampler (3) ]],
    sampler sampler_2DSpecCube0 [[ sampler (4) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(1) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(2) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(3) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(4) ]] ,
    texture2d<half, access::sample > BnSFog_FogMaskTex [[ texture(5) ]] ,
    texture2d<half, access::sample > _VT_IndexTex [[ texture(6) ]] ,
    texture2d_array<half, access::sample > _VT_WorldYTex [[ texture(7) ]] ,
    texture2d<half, access::sample > _2DSpecCube0 [[ texture(8) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_linear_clamp_compare_sampler(compare_func::greater_equal,filter::linear,mip_filter::nearest,address::clamp_to_edge);
    constexpr sampler BnsFog_LinearClampSampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    constexpr sampler vt_linear_clamp_sampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float4 u_xlat0;
    half4 u_xlat16_0;
    int u_xlati0;
    bool u_xlatb0;
    float3 u_xlat1;
    half4 u_xlat16_1;
    float3 u_xlat2;
    half4 u_xlat16_2;
    bool3 u_xlatb2;
    half3 u_xlat16_3;
    float4 u_xlat4;
    half4 u_xlat16_4;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    half3 u_xlat16_7;
    float3 u_xlat8;
    half u_xlat16_8;
    float3 u_xlat9;
    bool u_xlatb9;
    half3 u_xlat16_10;
    float3 u_xlat11;
    float3 u_xlat12;
    half3 u_xlat16_12;
    bool u_xlatb12;
    float3 u_xlat13;
    half3 u_xlat16_14;
    float u_xlat15;
    half u_xlat16_15;
    half3 u_xlat16_17;
    half3 u_xlat16_19;
    float u_xlat20;
    bool2 u_xlatb20;
    float u_xlat21;
    bool2 u_xlatb21;
    float u_xlat24;
    half u_xlat16_24;
    bool u_xlatb24;
    half u_xlat16_27;
    half2 u_xlat16_29;
    float u_xlat32;
    int2 u_xlati32;
    uint u_xlatu32;
    bool2 u_xlatb32;
    bool2 u_xlatb33;
    float u_xlat36;
    float u_xlat38;
    half u_xlat16_38;
    half u_xlat10_38;
    uint u_xlatu38;
    bool u_xlatb38;
    half u_xlat16_39;
    half u_xlat16_41;
    half u_xlat16_42;
    half u_xlat16_43;
    float u_xlat44;
    u_xlati0 = int(input.SV_InstanceID0) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat12.xy = fma(u_xlat1.xy, float2(UnityPerMaterial._MainTex_ST.xy), float2(UnityPerMaterial._MainTex_ST.zw));
    u_xlati0 = u_xlati0 << 0x1;
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, u_xlat12.xy);
    u_xlat16_2 = _NormalTex.sample(sampler_NormalTex, u_xlat12.xy);
    u_xlat16_3.x = u_xlat16_2.z + u_xlat16_2.z;
    u_xlat16_4.yz = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_4.xw = (-u_xlat16_4.zz);
    u_xlat16_15 = dot(u_xlat16_4.yw, u_xlat16_4.yw);
    u_xlat16_15 = min(u_xlat16_15, half(1.0));
    u_xlat16_15 = (-u_xlat16_15) + half(1.0);
    u_xlat16_15 = sqrt(u_xlat16_15);
    u_xlat16_5.xyz = half3(fma(float3(u_xlat16_1.xyz), float3(UnityPerMaterial._TintColorHDR.xyz), UnityInstancing_ColorProps.ColorPropsArray[u_xlati0 / 2]._HighlightColor.xyz));
    u_xlat16_27 = (-input.TEXCOORD2.x) + half(1.0);
    u_xlat16_27 = u_xlat16_27 * FGlobals.gLightBuffer[8].w;
    u_xlat16_6.xyz = half3(u_xlat16_27) * UnityPerMaterial._NightColorHDR.xyz;
    u_xlat16_27 = input.TEXCOORD5.y + (-UnityPerMaterial._SnowLevel);
    u_xlat16_27 = u_xlat16_27 / UnityPerMaterial._SnowWetness;
    u_xlat16_27 = clamp(u_xlat16_27, 0.0h, 1.0h);
    u_xlat16_39 = u_xlat16_2.z + UnityPerMaterial._SnowNoiseInvert;
    u_xlat16_3.x = fma((-u_xlat16_3.x), UnityPerMaterial._SnowNoiseInvert, u_xlat16_39);
    u_xlat16_3.x = log2(u_xlat16_3.x);
    u_xlat16_3.x = u_xlat16_3.x * UnityPerMaterial._SnowNoise;
    u_xlat16_3.x = exp2(u_xlat16_3.x);
    u_xlat16_3.x = u_xlat16_3.x * UnityPerMaterial._SnowIntensity;
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_27;
    u_xlat16_3.x = clamp(u_xlat16_3.x, 0.0h, 1.0h);
    u_xlatb0 = UnityPerMaterial._ShowSnowDirectly<half(1.0);
    u_xlat16_27 = u_xlat16_3.x * FGlobals.gLightBuffer[8].z;
    u_xlat16_3.x = (u_xlatb0) ? u_xlat16_27 : u_xlat16_3.x;
    u_xlat16_7.xyz = (-u_xlat16_5.xyz) + UnityPerMaterial._SnowColor.xyz;
    u_xlat16_5.xyz = fma(u_xlat16_3.xxx, u_xlat16_7.xyz, u_xlat16_5.xyz);
    u_xlatb0 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_19.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_27 = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_19.x = (u_xlatb0) ? FGlobals.gLightBuffer[8].x : u_xlat16_27;
    u_xlat16_27 = dot(UnityPerMaterial._RoughnessScale.xyz, u_xlat16_19.xyz);
    u_xlat16_27 = u_xlat16_2.z * u_xlat16_27;
    u_xlat16_39 = (-u_xlat16_3.x) + half(1.0);
    u_xlat16_3.x = fma(UnityPerMaterial._RoughnessScale.w, u_xlat16_3.x, u_xlat16_39);
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_27;
    u_xlat16_27 = u_xlat16_2.w * u_xlat16_39;
    u_xlat16_3.x = max(u_xlat16_3.x, half(0.119999997));
    u_xlat16_3.x = min(u_xlat16_3.x, half(1.0));
    u_xlat16_4.xzw = u_xlat16_4.xxx * input.TEXCOORD4.xyz;
    u_xlat16_4.xyz = fma(input.TEXCOORD3.xyz, u_xlat16_4.yyy, u_xlat16_4.xzw);
    u_xlat16_4.xyz = fma(input.TEXCOORD5.xyz, half3(u_xlat16_15), u_xlat16_4.xyz);
    u_xlat16_0.x = dot(u_xlat16_4.xyz, u_xlat16_4.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * u_xlat16_4.xyz;
    u_xlat1.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat36 = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat36 = max(u_xlat36, 0.00100000005);
    u_xlat36 = rsqrt(u_xlat36);
    u_xlat2.xyz = float3(u_xlat36) * u_xlat1.xyz;
    u_xlatb38 = 0.0>=FGlobals.gShadowParams0[5].z;
    if(u_xlatb38){
        u_xlat16_15 = half(1.0);
    }
    if(!u_xlatb38){
        u_xlat8.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlatb38 = 0.5<FGlobals.gPlanarShadowEnabled;
        u_xlat44 = input.TEXCOORD0.y + 100.0;
        u_xlat44 = u_xlat44 / FGlobals.gPlanarShadowParams.y;
        u_xlat44 = u_xlat44 + FGlobals._PlanarShadowDepthBias;
        u_xlatb9 = FGlobals.gPlanarShadowEnabled<0.5;
        u_xlat21 = min(u_xlat8.z, 0.999000013);
        u_xlat32 = (u_xlatb9) ? u_xlat21 : u_xlat8.z;
        u_xlat32 = (u_xlatb38) ? u_xlat44 : u_xlat32;
        u_xlat9.x = u_xlat32 + FGlobals.gShadowParams0[4].z;
        u_xlat21 = (-u_xlat9.x) + 1.0;
        u_xlat9.x = (u_xlatb38) ? u_xlat9.x : u_xlat21;
        u_xlat9.x = float(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat8.xy, saturate(u_xlat9.x), level(0.0)));
        u_xlatb21.xy = (u_xlat8.xy<float2(0.0, 0.0));
        u_xlatb21.x = u_xlatb21.y || u_xlatb21.x;
        u_xlatb33.xy = (float2(1.0, 1.0)<u_xlat8.xy);
        u_xlatb33.x = u_xlatb33.y || u_xlatb33.x;
        u_xlatb21.x = u_xlatb33.x || u_xlatb21.x;
        u_xlat16_39 = (u_xlatb21.x) ? half(1.0) : half(u_xlat9.x);
        u_xlatb9 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb9){
            if(u_xlatb38){
                u_xlat9.x = (-input.TEXCOORD0.y) + FGlobals.gPlanarShadowParams.x;
                u_xlat9.x = u_xlat9.x / float(FGlobals.gLightBuffer[11].y);
                u_xlat4.xyz = fma(float3(FGlobals.gLightBuffer[11].xyz), u_xlat9.xxx, input.TEXCOORD0.xyz);
                u_xlat4.w = 1.0;
                u_xlat9.x = dot(FGlobals.gShadowParams0[0], u_xlat4);
                u_xlat9.y = dot(FGlobals.gShadowParams0[1], u_xlat4);
                u_xlat9.z = dot(FGlobals.gShadowParams0[3], u_xlat4);
                u_xlat16_7.xyz = half3(u_xlat9.xyz * float3(0.5, 0.5, 0.5));
                u_xlat16_10.x = u_xlat16_7.z + u_xlat16_7.x;
                u_xlat16_10.y = half(fma(float(u_xlat16_7.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_7.z)));
                u_xlat44 = u_xlat44 * u_xlat9.z;
                u_xlat9.xy = float2(u_xlat16_10.xy) / u_xlat9.zz;
                u_xlat32 = u_xlat44 / u_xlat9.z;
            } else {
                u_xlat9.xy = fma(u_xlat8.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            }
            u_xlat8.x = u_xlat32 + FGlobals.gShadowParams0[4].z;
            u_xlat20 = (-u_xlat8.x) + 1.0;
            u_xlat8.x = (u_xlatb38) ? u_xlat8.x : u_xlat20;
            u_xlat8.x = float(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat9.xy, saturate(u_xlat8.x), level(0.0)));
            u_xlatb20.xy = (u_xlat9.xy<float2(0.0, 0.0));
            u_xlatb20.x = u_xlatb20.y || u_xlatb20.x;
            u_xlatb32.xy = (float2(1.0, 1.0)<u_xlat9.xy);
            u_xlatb32.x = u_xlatb32.y || u_xlatb32.x;
            u_xlatb20.x = u_xlatb32.x || u_xlatb20.x;
            u_xlat16_41 = (u_xlatb20.x) ? half(1.0) : half(u_xlat8.x);
            u_xlat16_39 = min(u_xlat16_39, u_xlat16_41);
        }
        u_xlat38 = (u_xlatb38) ? -100.0 : -30.0;
        u_xlatb38 = input.TEXCOORD0.y<u_xlat38;
        u_xlat16_8 = u_xlat16_39 + half(-1.0);
        u_xlat8.x = fma(FGlobals.gShadowParams0[5].z, float(u_xlat16_8), 1.0);
        u_xlat15 = (u_xlatb38) ? 1.0 : u_xlat8.x;
        u_xlat16_15 = half(u_xlat15);
    }
    u_xlatb38 = 0.0<FGlobals.CloudParam.w;
    if(u_xlatb38){
        u_xlat4 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
        u_xlat4 = fma(u_xlat4, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
        u_xlat4 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat4);
        u_xlat16_38 = CloudTex.sample(samplerCloudTex, u_xlat4.xy).y;
        u_xlat16_8 = CloudTex.sample(samplerCloudTex, u_xlat4.zw).w;
        u_xlat16_39 = u_xlat16_8 * half(0.5);
        u_xlat16_39 = fma(u_xlat16_38, half(0.5), u_xlat16_39);
        u_xlat16_38 = fma((-u_xlat16_39), u_xlat16_39, u_xlat16_39);
        u_xlat8.x = fma((-float(u_xlat16_39)), float(u_xlat16_39), FGlobals.CloudParam.y);
        u_xlat16_38 = half(1.0) / u_xlat16_38;
        u_xlat38 = float(u_xlat16_38) * u_xlat8.x;
        u_xlat38 = clamp(u_xlat38, 0.0f, 1.0f);
        u_xlat8.x = fma(u_xlat38, -2.0, 3.0);
        u_xlat38 = u_xlat38 * u_xlat38;
        u_xlat38 = u_xlat38 * u_xlat8.x;
        u_xlat38 = fma((-u_xlat38), FGlobals.CloudParam.z, 1.0);
        u_xlat38 = clamp(u_xlat38, 0.0f, 1.0f);
        u_xlat16_15 = half(min(u_xlat38, float(u_xlat16_15)));
    }
    u_xlat16_7.xyz = fma((-u_xlat16_5.xyz), half3(u_xlat16_27), u_xlat16_5.xyz);
    u_xlat16_39 = fma((-u_xlat16_27), half(0.0399999991), half(0.0399999991));
    u_xlat16_5.xyz = fma(u_xlat16_5.xyz, half3(u_xlat16_27), half3(u_xlat16_39));
    u_xlat16_39 = dot(float3(u_xlat16_0.xyz), u_xlat2.xyz);
    u_xlat16_4 = fma(u_xlat16_3.xxxx, half4(-1.0, -0.0274999999, -0.572000027, 0.0219999999), half4(1.0, 0.0425000004, 1.03999996, -0.0399999991));
    u_xlat16_41 = u_xlat16_4.x * u_xlat16_4.x;
    u_xlat16_42 = u_xlat16_39 * half(-9.27999973);
    u_xlat16_42 = exp2(u_xlat16_42);
    u_xlat16_41 = min(u_xlat16_41, u_xlat16_42);
    u_xlat16_41 = fma(u_xlat16_41, u_xlat16_4.x, u_xlat16_4.y);
    u_xlat16_10.xy = fma(half2(u_xlat16_41), half2(-1.03999996, 1.03999996), u_xlat16_4.zw);
    u_xlat16_41 = u_xlat16_5.y * half(50.0);
    u_xlat16_41 = clamp(u_xlat16_41, 0.0h, 1.0h);
    u_xlat16_41 = u_xlat16_41 * u_xlat16_10.y;
    u_xlat16_5.xyz = fma(u_xlat16_5.xyz, u_xlat16_10.xxx, half3(u_xlat16_41));
    u_xlat16_41 = dot(float3(0.212500006, 0.715399981, 0.0720999986), input.TEXCOORD8.xyz);
    u_xlat16_41 = u_xlat16_41 * FGlobals.gLightBuffer[10].w;
    u_xlat16_41 = clamp(u_xlat16_41, 0.0h, 1.0h);
    u_xlat8.xyz = float3(u_xlat16_7.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_42 = dot((-u_xlat2.xyz), float3(u_xlat16_0.xyz));
    u_xlat16_42 = u_xlat16_42 + u_xlat16_42;
    u_xlat16_10.xyz = half3(fma(float3(u_xlat16_0.xyz), (-float3(u_xlat16_42)), (-u_xlat2.xyz)));
    u_xlat16_2.x = dot(u_xlat16_10.xyz, u_xlat16_10.xyz);
    u_xlat16_2.x = max(u_xlat16_2.x, half(0.00100000005));
    u_xlat16_2.x = rsqrt(u_xlat16_2.x);
    u_xlat16_2.xyz = u_xlat16_2.xxx * u_xlat16_10.xyz;
    u_xlat16_42 = fma((-u_xlat16_3.x), half(0.699999988), half(1.70000005));
    u_xlat16_42 = u_xlat16_3.x * u_xlat16_42;
    u_xlatb38 = half(0.0)<FGlobals._SpecCubeLodSteps;
    u_xlat16_43 = (u_xlatb38) ? FGlobals._SpecCubeLodSteps : half(6.0);
    u_xlat16_42 = u_xlat16_42 * u_xlat16_43;
    u_xlat16_43 = fma(u_xlat16_2.y, half(8.0), half(8.0));
    u_xlat16_43 = sqrt(u_xlat16_43);
    u_xlat16_10.xy = u_xlat16_2.xz / half2(u_xlat16_43);
    u_xlat16_10.xy = u_xlat16_10.xy + half2(0.5, 0.5);
    u_xlat16_2.xyz = _2DSpecCube0.sample(sampler_2DSpecCube0, float2(u_xlat16_10.xy), level(float(u_xlat16_42))).xyz;
    u_xlat16_10.xyz = u_xlat16_2.xyz * half3(FGlobals._SpecCubePower);
    u_xlat16_42 = (-u_xlat16_3.x) + half(1.0);
    u_xlat16_42 = u_xlat16_42 * u_xlat16_42;
    u_xlat16_27 = u_xlat16_27 * u_xlat16_42;
    u_xlat16_42 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_27 = fma(u_xlat16_27, u_xlat16_42, u_xlat16_1.w);
    u_xlat16_10.xyz = half3(u_xlat16_27) * u_xlat16_10.xyz;
    u_xlat16_10.xyz = u_xlat16_5.xyz * u_xlat16_10.xyz;
    u_xlat16_10.xyz = half3(u_xlat16_41) * u_xlat16_10.xyz;
    u_xlat16_10.xyz = u_xlat16_10.xyz * FGlobals.gLightBuffer[10].xyz;
    u_xlat16_10.xyz = half3(fma(u_xlat8.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_10.xyz)));
    u_xlat2.x = input.TEXCOORD9.x / input.TEXCOORD9.w;
    u_xlat16_14.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat1.xyz = fma(u_xlat1.xyz, float3(u_xlat36), float3(FGlobals.gLightBuffer[14].xyz));
    u_xlat36 = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat36 = max(u_xlat36, 0.00100000005);
    u_xlat36 = rsqrt(u_xlat36);
    u_xlat1.xyz = float3(u_xlat36) * u_xlat1.xyz;
    u_xlat16_27 = dot(u_xlat16_0.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_27 = max(u_xlat16_27, half(0.0));
    u_xlat0.x = dot(float3(u_xlat16_0.xyz), u_xlat1.xyz);
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlatb12 = u_xlat16_39>=half(0.0);
    u_xlat16_39 = (u_xlatb12) ? half(1.0) : half(0.0);
    u_xlat16_41 = half(u_xlat2.x + -0.5);
    u_xlat16_41 = fma((-FGlobals.gLightBuffer[14].w), abs(u_xlat16_41), half(1.0));
    u_xlat16_41 = u_xlat16_41 * FGlobals.gLightBuffer[13].w;
    u_xlat16_41 = max(u_xlat16_41, half(0.0));
    u_xlat16_41 = u_xlat16_41 + half(1.0);
    u_xlat16_39 = u_xlat16_39 * u_xlat16_41;
    u_xlat16_12.xyz = u_xlat16_14.xyz * half3(u_xlat16_27);
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(u_xlat16_39);
    u_xlat16_27 = fma(u_xlat16_3.x, half(0.25), half(0.25));
    u_xlat1.x = fma((-u_xlat0.x), u_xlat0.x, 1.0);
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_3.x;
    u_xlat0.x = u_xlat0.x * float(u_xlat16_3.x);
    u_xlat0.x = fma(u_xlat0.x, u_xlat0.x, u_xlat1.x);
    u_xlat0.x = float(u_xlat16_3.x) / u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = min(u_xlat0.x, 128.0);
    u_xlat0.x = u_xlat0.x * float(u_xlat16_27);
    u_xlat1.xyz = fma(float3(u_xlat16_5.xyz), u_xlat0.xxx, float3(u_xlat16_7.xyz));
    u_xlat0.xyz = float3(u_xlat16_12.xyz) * u_xlat1.xyz;
    u_xlat16_3.xyz = half3(fma(u_xlat0.xyz, float3(u_xlat16_15), float3(u_xlat16_10.xyz)));
    u_xlat16_3.xyz = u_xlat16_1.www * u_xlat16_3.xyz;
    u_xlat16_39 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_39 = min(u_xlat16_39, half(1.0));
    u_xlat16_5.x = (-u_xlat16_39) + half(1.0);
    u_xlat16_39 = fma(UnityPerMaterial._VertexOcclusionIntensity, u_xlat16_5.x, u_xlat16_39);
    u_xlat16_3.xyz = fma(u_xlat16_3.xyz, half3(u_xlat16_39), u_xlat16_6.xyz);
    u_xlat0.xyz = input.TEXCOORD0.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
    u_xlat1.x = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat13.x = max(u_xlat1.x, 0.00100000005);
    u_xlat13.x = rsqrt(u_xlat13.x);
    u_xlat13.xyz = u_xlat0.xyz * u_xlat13.xxx;
    u_xlat1.x = sqrt(u_xlat1.x);
    u_xlat16_39 = half(u_xlat1.x + (-float(FGlobals.gFogParams[1].z)));
    u_xlat16_39 = max(u_xlat16_39, half(0.0));
    u_xlatb2.xyz = (half3(0.5, 0.5, 0.5)<FGlobals.gFogParams[7].wzx);
    u_xlatb38 = u_xlatb2.y || u_xlatb2.x;
    if(u_xlatb38){
        u_xlat8.xy = input.TEXCOORD0.xz + (-FGlobals._VT_TerrainInfo.zw);
        u_xlat8.xy = u_xlat8.xy * FGlobals._VT_TerrainInfo.yy;
        u_xlat8.xy = clamp(u_xlat8.xy, 0.0f, 1.0f);
        u_xlat16_38 = _VT_IndexTex.sample(sampler_VT_IndexTex, u_xlat8.xy, level(0.0)).x;
        u_xlat38 = fma(float(u_xlat16_38), 255.0, 0.5);
        u_xlatu38 = uint(u_xlat38);
        u_xlatu32 = u_xlatu38 & 0x7fu;
        u_xlat9.z = float(u_xlatu32);
        u_xlatu38 = u_xlatu38 >> 0x7u;
        u_xlat38 = float(u_xlatu38);
        u_xlati32.xy = int2(FGlobals._VT_TerrainTileInfo.yz);
        u_xlati32.x = (-u_xlati32.y) + u_xlati32.x;
        u_xlati32.x = 0x1 << u_xlati32.x;
        u_xlat32 = float(u_xlati32.x);
        u_xlat11.xy = float2(int2(FGlobals._VT_RootSize, FGlobals._VT_MaxVTMip));
        u_xlat8.xy = u_xlat8.xy * u_xlat11.xx;
        u_xlat11.xz = u_xlat8.xy / float2(u_xlat32);
        u_xlat11.xz = floor(u_xlat11.xz);
        u_xlat8.xy = fma((-u_xlat11.xz), float2(u_xlat32), u_xlat8.xy);
        u_xlat9.xy = u_xlat8.xy / float2(u_xlat32);
        u_xlat9.xy = clamp(u_xlat9.xy, 0.0f, 1.0f);
        u_xlat38 = min(u_xlat38, u_xlat11.y);
        u_xlat10_38 = half(_VT_WorldYTex.sample(vt_linear_clamp_sampler, u_xlat9.xy, round(u_xlat9.z), level(u_xlat38)).x);
        u_xlat8.x = (-FGlobals._VT_TerrainHeightInfo.x) + FGlobals._VT_TerrainHeightInfo.y;
        u_xlat38 = fma(float(u_xlat10_38), u_xlat8.x, FGlobals._VT_TerrainHeightInfo.x);
        u_xlat38 = u_xlat38 + FGlobals._VT_TerrainHeightInfo.w;
        u_xlat38 = max(u_xlat38, -1000000.0);
        u_xlat38 = min(u_xlat38, 1000000.0);
    } else {
        u_xlat38 = 0.0;
    }
    u_xlat16_5.x = FGlobals.gFogParams[0].w + FGlobals.gFogParams[1].x;
    u_xlat8.x = (-u_xlat38) + input.TEXCOORD0.y;
    u_xlat0.w = u_xlat8.x + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = dot(u_xlat0.xzw, u_xlat0.xzw);
    u_xlat0.x = sqrt(u_xlat0.x);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlat24 = (u_xlatb2.x) ? u_xlat0.w : u_xlat0.y;
    u_xlat16_39 = (u_xlatb2.x) ? half(u_xlat0.x) : u_xlat16_39;
    u_xlat16_17.x = half(float(FGlobals.gFogParams[1].z) / u_xlat1.x);
    u_xlat16_17.x = clamp(u_xlat16_17.x, 0.0h, 1.0h);
    u_xlat0.x = fma(u_xlat24, float(u_xlat16_17.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[0].x));
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[1].w);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_17.x = (-u_xlat16_17.x) + half(1.0);
    u_xlat24 = u_xlat24 * float(u_xlat16_17.x);
    u_xlat24 = u_xlat24 * float(FGlobals.gFogParams[1].w);
    u_xlat24 = max(u_xlat24, -64.0);
    u_xlat24 = min(u_xlat24, -0.00100000005);
    u_xlat36 = exp2((-u_xlat24));
    u_xlat36 = (-u_xlat36) + 1.0;
    u_xlat36 = u_xlat36 / u_xlat24;
    u_xlatb24 = 0.00999999978<(-u_xlat24);
    u_xlat24 = (u_xlatb24) ? u_xlat36 : 0.693147004;
    u_xlat0.x = u_xlat24 * u_xlat0.x;
    u_xlat16_39 = half(u_xlat0.x * (-float(u_xlat16_39)));
    u_xlat16_39 = u_xlat16_5.x * u_xlat16_39;
    u_xlat16_39 = u_xlat16_39 * FGlobals.gFogParams[0].y;
    u_xlat16_39 = exp2(u_xlat16_39);
    u_xlat16_39 = max(u_xlat16_39, FGlobals.gFogParams[0].z);
    u_xlat16_17.x = dot(float3(FGlobals.gLightBuffer[11].xyz), u_xlat13.xyz);
    u_xlat16_6.xyz = FGlobals.gFogParams[0].www * FGlobals.gFogParams[2].xyz;
    u_xlat16_29.x = fma(u_xlat16_17.x, u_xlat16_17.x, half(1.0));
    u_xlat16_7.xyz = FGlobals.gFogParams[1].xxx * FGlobals.gFogParams[3].xyz;
    u_xlat16_29.y = fma((-FGlobals.gFogParams[1].y), FGlobals.gFogParams[1].y, half(1.0));
    u_xlat16_0.xz = u_xlat16_29.xy * half2(0.0596831031, 0.119366206);
    u_xlat16_10.xy = fma(FGlobals.gFogParams[1].yy, FGlobals.gFogParams[1].yy, half2(1.0, 2.0));
    u_xlat16_17.x = dot(u_xlat16_17.xx, FGlobals.gFogParams[1].yy);
    u_xlat16_17.x = (-u_xlat16_17.x) + u_xlat16_10.x;
    u_xlat16_17.x = log2(abs(u_xlat16_17.x));
    u_xlat16_17.x = u_xlat16_17.x * half(-1.5);
    u_xlat16_17.x = exp2(u_xlat16_17.x);
    u_xlat16_24 = u_xlat16_0.z * u_xlat16_17.x;
    u_xlat16_24 = u_xlat16_29.x * u_xlat16_24;
    u_xlat16_24 = u_xlat16_24 / u_xlat16_10.y;
    u_xlat16_17.xyz = half3(u_xlat16_24) * u_xlat16_7.xyz;
    u_xlat16_7.xyz = FGlobals.gLightBuffer[12].xyz * FGlobals.gFogParams[2].www;
    u_xlat16_17.xyz = fma(u_xlat16_6.xyz, u_xlat16_0.xxx, u_xlat16_17.xyz);
    u_xlat16_17.xyz = u_xlat16_17.xyz * u_xlat16_7.xyz;
    u_xlat16_5.xyz = u_xlat16_17.xyz / u_xlat16_5.xxx;
    u_xlat16_41 = (-u_xlat16_39) + half(1.0);
    u_xlat16_5.xyz = half3(u_xlat16_41) * u_xlat16_5.xyz;
    u_xlat0.x = u_xlat38 + float(FGlobals.gFogParams[3].w);
    u_xlat0.x = (u_xlatb2.y) ? u_xlat0.x : float(FGlobals.gFogParams[3].w);
    u_xlat16_41 = half(u_xlat1.x + (-float(FGlobals.gFogParams[5].y)));
    u_xlat16_41 = max(u_xlat16_41, half(0.0));
    u_xlat16_6.x = half(float(FGlobals.gFogParams[5].y) / u_xlat1.x);
    u_xlat16_6.x = clamp(u_xlat16_6.x, 0.0h, 1.0h);
    u_xlat24 = fma(u_xlat0.y, float(u_xlat16_6.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = (-u_xlat0.x) + u_xlat24;
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[5].z);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_6.x = (-u_xlat16_6.x) + half(1.0);
    u_xlat12.x = u_xlat0.y * float(u_xlat16_6.x);
    u_xlat12.x = u_xlat12.x * float(FGlobals.gFogParams[5].z);
    u_xlat12.x = max(u_xlat12.x, -64.0);
    u_xlat12.x = min(u_xlat12.x, -0.00100000005);
    u_xlat24 = exp2((-u_xlat12.x));
    u_xlat24 = (-u_xlat24) + 1.0;
    u_xlat24 = u_xlat24 / u_xlat12.x;
    u_xlatb12 = 0.00999999978<(-u_xlat12.x);
    u_xlat12.x = (u_xlatb12) ? u_xlat24 : 0.693147004;
    u_xlat0.x = u_xlat12.x * u_xlat0.x;
    u_xlat16_41 = half(u_xlat0.x * (-float(u_xlat16_41)));
    u_xlat16_41 = u_xlat16_41 * FGlobals.gFogParams[4].w;
    u_xlat16_41 = exp2(u_xlat16_41);
    u_xlat16_41 = max(u_xlat16_41, FGlobals.gFogParams[5].x);
    u_xlat16_0.xy = max(FGlobals.gFogParams[9].xy, half2(9.99999975e-05, 9.99999975e-05));
    u_xlat24 = u_xlat1.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat16_0.xy = half2(1.0, 1.0) / u_xlat16_0.xy;
    u_xlat0.x = float(u_xlat16_0.x) * u_xlat24;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat24 = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat24;
    u_xlat24 = u_xlat1.x + (-float(FGlobals.gFogParams[5].y));
    u_xlat12.x = float(u_xlat16_0.y) * u_xlat24;
    u_xlat12.x = clamp(u_xlat12.x, 0.0f, 1.0f);
    u_xlat24 = fma(u_xlat12.x, -2.0, 3.0);
    u_xlat12.x = u_xlat12.x * u_xlat12.x;
    u_xlat12.x = u_xlat12.x * u_xlat24;
    u_xlat16_5.xyz = half3(u_xlat0.xxx * float3(u_xlat16_5.xyz));
    u_xlat16_24 = u_xlat16_39 + half(-1.0);
    u_xlat0.x = fma(u_xlat0.x, float(u_xlat16_24), 1.0);
    u_xlat16_24 = u_xlat16_41 + half(-1.0);
    u_xlat12.x = fma(u_xlat12.x, float(u_xlat16_24), 1.0);
    u_xlat16_39 = half((-u_xlat12.x) + 1.0);
    u_xlat16_5.xyz = half3(u_xlat12.xxx * float3(u_xlat16_5.xyz));
    u_xlat16_1.xyz = fma(FGlobals.gFogParams[4].xyz, half3(u_xlat16_39), u_xlat16_5.xyz);
    u_xlat16_1.w = half(u_xlat0.x * u_xlat12.x);
    if(u_xlatb2.z){
        u_xlat16_5.xy = half2(fma(input.TEXCOORD0.xz, float2(FGlobals.gFogParams[8].xy), float2(FGlobals.gFogParams[8].zw)));
        u_xlat16_39 = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_5.xy), level(0.0)).x;
        u_xlat16_39 = log2(u_xlat16_39);
        u_xlat16_39 = u_xlat16_39 * FGlobals.gFogParams[7].y;
        u_xlat16_39 = exp2(u_xlat16_39);
        u_xlat16_5.x = half(fma((-u_xlat12.x), u_xlat0.x, 1.0));
        u_xlat16_1.w = fma(u_xlat16_39, u_xlat16_5.x, u_xlat16_1.w);
        u_xlat16_1.xyz = fma(half3(u_xlat16_39), (-u_xlat16_1.xyz), u_xlat16_1.xyz);
    }
    u_xlatb0 = half(0.0)<FGlobals._ScreenCenterFogParams0.z;
    u_xlat12.xyz = input.TEXCOORD0.yyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1].xyw;
    u_xlat12.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0].xyw, input.TEXCOORD0.xxx, u_xlat12.xyz);
    u_xlat12.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2].xyw, input.TEXCOORD0.zzz, u_xlat12.xyz);
    u_xlat12.xyz = u_xlat12.xyz + UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3].xyw;
    u_xlat12.xy = u_xlat12.xy / u_xlat12.zz;
    u_xlat12.xy = fma(u_xlat12.xy, float2(0.5, 0.5), float2(0.5, 0.5));
    u_xlat16_2.xy = FGlobals._ScreenCenterFogParams1.xy + half2(0.5, 0.5);
    u_xlat12.xy = u_xlat12.xy + (-float2(u_xlat16_2.xy));
    u_xlat12.x = dot(u_xlat12.xy, u_xlat12.xy);
    u_xlat12.x = sqrt(u_xlat12.x);
    u_xlat16_39 = half(u_xlat12.x + (-float(FGlobals._ScreenCenterFogParams0.x)));
    u_xlat16_5.x = half(1.0) / FGlobals._ScreenCenterFogParams0.y;
    u_xlat16_39 = u_xlat16_39 * u_xlat16_5.x;
    u_xlat16_39 = clamp(u_xlat16_39, 0.0h, 1.0h);
    u_xlat16_5.x = fma(u_xlat16_39, half(-2.0), half(3.0));
    u_xlat16_39 = u_xlat16_39 * u_xlat16_39;
    u_xlat16_39 = fma((-u_xlat16_5.x), u_xlat16_39, half(1.0));
    u_xlat16_5.x = u_xlat16_39 * FGlobals._ScreenCenterFogParams0.z;
    u_xlat16_39 = fma((-u_xlat16_39), FGlobals._ScreenCenterFogParams0.z, half(1.0));
    u_xlat16_2.xyz = u_xlat16_1.xyz * half3(u_xlat16_39);
    u_xlat16_39 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_2.w = fma(u_xlat16_5.x, u_xlat16_39, u_xlat16_1.w);
    u_xlat16_0 = (bool(u_xlatb0)) ? u_xlat16_2 : u_xlat16_1;
    output.SV_TARGET0.xyz = fma(u_xlat16_3.xyz, u_xlat16_0.www, u_xlat16_0.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
