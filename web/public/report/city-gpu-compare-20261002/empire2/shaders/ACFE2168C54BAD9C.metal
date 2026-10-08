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
    half4 _MainTex_ST ;
    half4 _TintColorHDR ;
    half4 _RoughnessScale ;
    half _VertexOcclusionIntensity ;
    half _RoleBackLightIntensity ;
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

struct ColorProps2Array_Type
{
    float4 _Rim ;
    float4 _Reversed2 ;
};

struct UnityInstancing_ColorProps2_Type
{
    ColorProps2Array_Type ColorProps2Array [128];
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
    float SV_Target1 [[ color(xlt_remap_o[1]) ]];
    float SV_Target2 [[ color(xlt_remap_o[2]) ]];
};

constexpr sampler _mtl_xl_shadow_sampler(address::clamp_to_edge, filter::linear, compare_func::greater_equal);
fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(2) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(3) ]],
    constant UnityInstancing_ColorProps_Type& UnityInstancing_ColorProps [[ buffer(4) ]],
    constant UnityInstancing_ColorProps2_Type& UnityInstancing_ColorProps2 [[ buffer(5) ]],
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
    float2 u_xlat1;
    half4 u_xlat16_1;
    float u_xlat2;
    half4 u_xlat16_2;
    float u_xlat3;
    half4 u_xlat16_3;
    half4 u_xlat16_4;
    half3 u_xlat16_5;
    float3 u_xlat6;
    half3 u_xlat16_6;
    bool3 u_xlatb6;
    float4 u_xlat7;
    half3 u_xlat16_7;
    float2 u_xlat8;
    half3 u_xlat16_8;
    float3 u_xlat9;
    bool2 u_xlatb9;
    float3 u_xlat10;
    half3 u_xlat16_11;
    half3 u_xlat16_12;
    half3 u_xlat16_13;
    half3 u_xlat16_14;
    half3 u_xlat16_15;
    float3 u_xlat16;
    half u_xlat16_16;
    bool u_xlatb16;
    float3 u_xlat18;
    half3 u_xlat16_18;
    half3 u_xlat16_19;
    half3 u_xlat16_21;
    half u_xlat16_22;
    float u_xlat32;
    half u_xlat16_32;
    bool u_xlatb32;
    float u_xlat34;
    bool u_xlatb34;
    half u_xlat16_35;
    half2 u_xlat16_37;
    float u_xlat40;
    int2 u_xlati40;
    uint u_xlatu40;
    float2 u_xlat41;
    bool2 u_xlatb41;
    float u_xlat48;
    half u_xlat16_51;
    half u_xlat16_52;
    half u_xlat16_53;
    float u_xlat54;
    half u_xlat16_54;
    half u_xlat10_54;
    uint u_xlatu54;
    bool u_xlatb54;
    float u_xlat56;
    bool u_xlatb56;
    half u_xlat16_59;
    u_xlati0 = int(input.SV_InstanceID0) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat16.xy = fma(u_xlat1.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw));
    u_xlati0 = u_xlati0 << 0x1;
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, u_xlat16.xy);
    u_xlat16_2 = _NormalTex.sample(sampler_NormalTex, u_xlat16.xy);
    u_xlat16_3.yz = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_3.xw = (-u_xlat16_3.zz);
    u_xlat16_35 = dot(u_xlat16_3.yw, u_xlat16_3.yw);
    u_xlat16_35 = min(u_xlat16_35, half(1.0));
    u_xlat16_35 = (-u_xlat16_35) + half(1.0);
    u_xlat16_35 = sqrt(u_xlat16_35);
    u_xlat16_4.xyz = half3(fma(float3(u_xlat16_1.xyz), float3(FGlobals._TintColorHDR.xyz), UnityInstancing_ColorProps.ColorPropsArray[u_xlati0 / 2]._HighlightColor.xyz));
    u_xlatb16 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_21.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_51 = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_21.x = (u_xlatb16) ? FGlobals.gLightBuffer[8].x : u_xlat16_51;
    u_xlat16_51 = dot(FGlobals._RoughnessScale.xyz, u_xlat16_21.xyz);
    u_xlat16_51 = u_xlat16_2.z * u_xlat16_51;
    u_xlat16.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat1.x = dot(u_xlat16.xyz, u_xlat16.xyz);
    u_xlat1.x = max(u_xlat1.x, 0.00100000005);
    u_xlat2 = rsqrt(u_xlat1.x);
    u_xlat6.xyz = u_xlat16.xyz * float3(u_xlat2);
    u_xlat16_52 = dot(u_xlat6.xyz, float3(input.TEXCOORD5.xyz));
    u_xlat16_52 = (-u_xlat16_52) + half(1.0);
    u_xlat16_52 = clamp(u_xlat16_52, 0.0h, 1.0h);
    u_xlat16_5.x = u_xlat16_52 * u_xlat16_52;
    u_xlat16_52 = u_xlat16_52 * u_xlat16_5.x;
    u_xlat16_52 = half(float(u_xlat16_52) * UnityInstancing_ColorProps2.ColorProps2Array[u_xlati0 / 2]._Rim.w);
    u_xlat16_5.xyz = half3(float3(u_xlat16_52) * UnityInstancing_ColorProps2.ColorProps2Array[u_xlati0 / 2]._Rim.xyz);
    u_xlat16_51 = max(u_xlat16_51, half(0.119999997));
    u_xlat16_51 = min(u_xlat16_51, half(1.0));
    u_xlat16_7.xyz = u_xlat16_3.xxx * input.TEXCOORD4.xyz;
    u_xlat16_7.xyz = fma(input.TEXCOORD3.xyz, u_xlat16_3.yyy, u_xlat16_7.xyz);
    u_xlat16_3.xyz = fma(input.TEXCOORD5.xyz, half3(u_xlat16_35), u_xlat16_7.xyz);
    u_xlat16_0.x = dot(u_xlat16_3.xyz, u_xlat16_3.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_8.xyz = u_xlat16_0.xxx * u_xlat16_3.xyz;
    u_xlatb0 = 0.0>=FGlobals.gShadowParams0[5].z;
    if(u_xlatb0){
        u_xlat16_3.x = half(1.0);
    }
    if(!u_xlatb0){
        u_xlat9.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlatb0 = 0.5<FGlobals.gPlanarShadowEnabled;
        u_xlat18.x = input.TEXCOORD0.y + 100.0;
        u_xlat18.x = u_xlat18.x / FGlobals.gPlanarShadowParams.y;
        u_xlatb34 = FGlobals.gPlanarShadowEnabled<0.5;
        u_xlat54 = min(u_xlat9.z, 0.999000013);
        u_xlat34 = (u_xlatb34) ? u_xlat54 : u_xlat9.z;
        u_xlat34 = (u_xlatb0) ? u_xlat18.x : u_xlat34;
        u_xlat54 = u_xlat34 + FGlobals.gShadowParams0[4].z;
        u_xlat56 = (-u_xlat54) + 1.0;
        u_xlat54 = (u_xlatb0) ? u_xlat54 : u_xlat56;
        u_xlat54 = float(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat9.xy, saturate(u_xlat54), level(0.0)));
        u_xlatb41.xy = (u_xlat9.xy<float2(0.0, 0.0));
        u_xlatb56 = u_xlatb41.y || u_xlatb41.x;
        u_xlatb41.xy = (float2(1.0, 1.0)<u_xlat9.xy);
        u_xlatb41.x = u_xlatb41.y || u_xlatb41.x;
        u_xlatb56 = u_xlatb56 || u_xlatb41.x;
        u_xlat16_19.x = (u_xlatb56) ? half(1.0) : half(u_xlat54);
        u_xlatb54 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb54){
            if(u_xlatb0){
                u_xlat54 = (-input.TEXCOORD0.y) + FGlobals.gPlanarShadowParams.x;
                u_xlat54 = u_xlat54 / float(FGlobals.gLightBuffer[11].y);
                u_xlat7.xyz = fma(float3(FGlobals.gLightBuffer[11].xyz), float3(u_xlat54), input.TEXCOORD0.xyz);
                u_xlat7.w = 1.0;
                u_xlat10.x = dot(FGlobals.gShadowParams0[0], u_xlat7);
                u_xlat10.y = dot(FGlobals.gShadowParams0[1], u_xlat7);
                u_xlat10.z = dot(FGlobals.gShadowParams0[3], u_xlat7);
                u_xlat16_11.xyz = half3(u_xlat10.xyz * float3(0.5, 0.5, 0.5));
                u_xlat16_12.x = u_xlat16_11.z + u_xlat16_11.x;
                u_xlat16_12.y = half(fma(float(u_xlat16_11.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_11.z)));
                u_xlat18.x = u_xlat18.x * u_xlat10.z;
                u_xlat41.xy = float2(u_xlat16_12.xy) / u_xlat10.zz;
                u_xlat34 = u_xlat18.x / u_xlat10.z;
            } else {
                u_xlat41.xy = fma(u_xlat9.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            }
            u_xlat18.x = u_xlat34 + FGlobals.gShadowParams0[4].z;
            u_xlat34 = (-u_xlat18.x) + 1.0;
            u_xlat18.x = (u_xlatb0) ? u_xlat18.x : u_xlat34;
            u_xlat18.x = float(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat41.xy, saturate(u_xlat18.x), level(0.0)));
            u_xlatb9.xy = (u_xlat41.xy<float2(0.0, 0.0));
            u_xlatb34 = u_xlatb9.y || u_xlatb9.x;
            u_xlatb9.xy = (float2(1.0, 1.0)<u_xlat41.xy);
            u_xlatb54 = u_xlatb9.y || u_xlatb9.x;
            u_xlatb34 = u_xlatb34 || u_xlatb54;
            u_xlat16_35 = (u_xlatb34) ? half(1.0) : half(u_xlat18.x);
            u_xlat16_19.x = min(u_xlat16_35, u_xlat16_19.x);
        }
        u_xlat0.x = (u_xlatb0) ? -100.0 : -30.0;
        u_xlatb0 = input.TEXCOORD0.y<u_xlat0.x;
        u_xlat16_18.x = u_xlat16_19.x + half(-1.0);
        u_xlat18.x = fma(FGlobals.gShadowParams0[5].z, float(u_xlat16_18.x), 1.0);
        u_xlat3 = (u_xlatb0) ? 1.0 : u_xlat18.x;
        u_xlat16_3.x = half(u_xlat3);
    }
    u_xlatb0 = 0.0<FGlobals.CloudParam.w;
    if(u_xlatb0){
        u_xlat7 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
        u_xlat7 = fma(u_xlat7, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
        u_xlat7 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat7);
        u_xlat16_0.x = CloudTex.sample(samplerCloudTex, u_xlat7.xy).y;
        u_xlat16_18.x = CloudTex.sample(samplerCloudTex, u_xlat7.zw).w;
        u_xlat16_19.x = u_xlat16_18.x * half(0.5);
        u_xlat16_19.x = fma(u_xlat16_0.x, half(0.5), u_xlat16_19.x);
        u_xlat16_0.x = fma((-u_xlat16_19.x), u_xlat16_19.x, u_xlat16_19.x);
        u_xlat18.x = fma((-float(u_xlat16_19.x)), float(u_xlat16_19.x), FGlobals.CloudParam.y);
        u_xlat16_0.x = half(1.0) / u_xlat16_0.x;
        u_xlat0.x = float(u_xlat16_0.x) * u_xlat18.x;
        u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
        u_xlat18.x = fma(u_xlat0.x, -2.0, 3.0);
        u_xlat0.x = u_xlat0.x * u_xlat0.x;
        u_xlat0.x = u_xlat0.x * u_xlat18.x;
        u_xlat0.x = fma((-u_xlat0.x), FGlobals.CloudParam.z, 1.0);
        u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
        u_xlat16_3.x = half(min(u_xlat0.x, float(u_xlat16_3.x)));
    }
    u_xlat16_11.xyz = fma((-u_xlat16_4.xyz), u_xlat16_2.www, u_xlat16_4.xyz);
    u_xlat16_19.x = fma((-u_xlat16_2.w), half(0.0399999991), half(0.0399999991));
    u_xlat16_12.xyz = fma(u_xlat16_4.xyz, u_xlat16_2.www, u_xlat16_19.xxx);
    u_xlat16_19.x = dot(float3(u_xlat16_8.xyz), u_xlat6.xyz);
    u_xlat16_4 = fma(half4(u_xlat16_51), half4(-1.0, -0.0274999999, -0.572000027, 0.0219999999), half4(1.0, 0.0425000004, 1.03999996, -0.0399999991));
    u_xlat16_35 = u_xlat16_4.x * u_xlat16_4.x;
    u_xlat16_53 = u_xlat16_19.x * half(-9.27999973);
    u_xlat16_53 = exp2(u_xlat16_53);
    u_xlat16_35 = min(u_xlat16_35, u_xlat16_53);
    u_xlat16_35 = fma(u_xlat16_35, u_xlat16_4.x, u_xlat16_4.y);
    u_xlat16_13.xy = fma(half2(u_xlat16_35), half2(-1.03999996, 1.03999996), u_xlat16_4.zw);
    u_xlat16_35 = u_xlat16_12.y * half(50.0);
    u_xlat16_35 = clamp(u_xlat16_35, 0.0h, 1.0h);
    u_xlat16_35 = u_xlat16_35 * u_xlat16_13.y;
    u_xlat16_12.xyz = fma(u_xlat16_12.xyz, u_xlat16_13.xxx, half3(u_xlat16_35));
    u_xlat16_35 = dot(float3(0.212500006, 0.715399981, 0.0720999986), input.TEXCOORD8.xyz);
    u_xlat16_35 = u_xlat16_35 * FGlobals.gLightBuffer[10].w;
    u_xlat16_35 = clamp(u_xlat16_35, 0.0h, 1.0h);
    u_xlat9.xyz = float3(u_xlat16_11.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_53 = dot((-u_xlat6.xyz), float3(u_xlat16_8.xyz));
    u_xlat16_53 = u_xlat16_53 + u_xlat16_53;
    u_xlat16_13.xyz = half3(fma(float3(u_xlat16_8.xyz), (-float3(u_xlat16_53)), (-u_xlat6.xyz)));
    u_xlat16_0.x = dot(u_xlat16_13.xyz, u_xlat16_13.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_6.xyz = u_xlat16_0.xxx * u_xlat16_13.xyz;
    u_xlat16_53 = fma((-u_xlat16_51), half(0.699999988), half(1.70000005));
    u_xlat16_53 = u_xlat16_51 * u_xlat16_53;
    u_xlatb0 = half(0.0)<FGlobals._SpecCubeLodSteps;
    u_xlat16_59 = (u_xlatb0) ? FGlobals._SpecCubeLodSteps : half(6.0);
    u_xlat16_53 = u_xlat16_53 * u_xlat16_59;
    u_xlat16_59 = fma(u_xlat16_6.y, half(8.0), half(8.0));
    u_xlat16_59 = sqrt(u_xlat16_59);
    u_xlat16_13.xy = u_xlat16_6.xz / half2(u_xlat16_59);
    u_xlat16_13.xy = u_xlat16_13.xy + half2(0.5, 0.5);
    u_xlat16_6.xyz = _2DSpecCube0.sample(sampler_2DSpecCube0, float2(u_xlat16_13.xy), level(float(u_xlat16_53))).xyz;
    u_xlat16_13.xyz = u_xlat16_6.xyz * half3(FGlobals._SpecCubePower);
    u_xlat16_53 = (-u_xlat16_51) + half(1.0);
    u_xlat16_59 = u_xlat16_2.w * u_xlat16_53;
    u_xlat16_53 = u_xlat16_53 * u_xlat16_59;
    u_xlat16_59 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_53 = fma(u_xlat16_53, u_xlat16_59, u_xlat16_1.w);
    u_xlat16_13.xyz = half3(u_xlat16_53) * u_xlat16_13.xyz;
    u_xlat16_13.xyz = u_xlat16_12.xyz * u_xlat16_13.xyz;
    u_xlat16_13.xyz = half3(u_xlat16_35) * u_xlat16_13.xyz;
    u_xlat16_14.xyz = u_xlat16_13.xyz * FGlobals.gLightBuffer[10].xyz;
    u_xlat16_14.xyz = half3(fma(u_xlat9.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_14.xyz)));
    u_xlat16_18.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_15.xyz = half3(fma(u_xlat16.xyz, float3(u_xlat2), float3(FGlobals.gLightBuffer[11].xyz)));
    u_xlat16_0.x = dot(u_xlat16_15.xyz, u_xlat16_15.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_6.xyz = u_xlat16_0.xxx * u_xlat16_15.xyz;
    u_xlat16_0.x = dot(u_xlat16_8.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.0));
    u_xlat16_35 = dot(u_xlat16_8.xyz, u_xlat16_6.xyz);
    u_xlat16_35 = max(u_xlat16_35, half(0.0));
    u_xlatb6.x = u_xlat16_19.x>=half(0.0);
    u_xlat16_19.x = (u_xlatb6.x) ? half(1.0) : half(0.0);
    u_xlat16_12.xyz = u_xlat16_12.xyz * u_xlat16_19.xxx;
    u_xlat16_19.x = fma(u_xlat16_51, half(0.25), half(0.25));
    u_xlat16_6.x = fma((-u_xlat16_35), u_xlat16_35, half(1.0));
    u_xlat16_51 = u_xlat16_51 * u_xlat16_51;
    u_xlat16_22 = u_xlat16_51 * u_xlat16_35;
    u_xlat16_6.x = fma(u_xlat16_22, u_xlat16_22, u_xlat16_6.x);
    u_xlat16_6.x = u_xlat16_51 / u_xlat16_6.x;
    u_xlat16_6.x = u_xlat16_6.x * u_xlat16_6.x;
    u_xlat16_6.x = min(u_xlat16_6.x, half(128.0));
    u_xlat16_6.x = u_xlat16_19.x * u_xlat16_6.x;
    u_xlat16_6.xyz = fma(u_xlat16_12.xyz, u_xlat16_6.xxx, u_xlat16_11.xyz);
    u_xlat16_6.xyz = u_xlat16_0.xxx * u_xlat16_6.xyz;
    u_xlat16_18.xyz = u_xlat16_18.xyz * u_xlat16_6.xyz;
    u_xlat16_14.xyz = fma(u_xlat16_18.xyz, u_xlat16_3.xxx, u_xlat16_14.xyz);
    u_xlat16_15.xyz = half3(fma(u_xlat16.xyz, float3(u_xlat2), float3(FGlobals.gLightBuffer[16].xyz)));
    u_xlat16_0.x = dot(u_xlat16_15.xyz, u_xlat16_15.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * u_xlat16_15.xyz;
    u_xlat16_3.x = dot(u_xlat16_8.xyz, FGlobals.gLightBuffer[16].xyz);
    u_xlat16_3.z = dot(u_xlat16_8.xyz, u_xlat16_0.xyz);
    u_xlat16_3.xz = max(u_xlat16_3.xz, half2(0.0, 0.0));
    u_xlat16_0.x = fma((-u_xlat16_3.z), u_xlat16_3.z, half(1.0));
    u_xlat16_16 = u_xlat16_51 * u_xlat16_3.z;
    u_xlat16_0.x = fma(u_xlat16_16, u_xlat16_16, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_51 / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_19.x;
    u_xlat16_0.xyz = fma(u_xlat16_12.xyz, u_xlat16_0.xxx, u_xlat16_11.xyz);
    u_xlat16_3.xyz = u_xlat16_3.xxx * u_xlat16_0.xyz;
    u_xlat16_12.xyz = FGlobals.gLightBuffer[17].www * FGlobals.gLightBuffer[17].xyz;
    u_xlat16_0.xyz = u_xlat16_3.xyz * u_xlat16_12.xyz;
    u_xlat16_0.xyz = fma(u_xlat16_0.xyz, FGlobals.gLightBuffer[8].www, u_xlat16_14.xyz);
    u_xlat16_3.x = dot(u_xlat16_8.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_3.x = (-u_xlat16_3.x);
    u_xlat16_3.x = clamp(u_xlat16_3.x, 0.0h, 1.0h);
    u_xlat16_19.xyz = half3(float3(u_xlat16_11.xyz) * input.TEXCOORD8.xyz);
    u_xlat16_19.xyz = u_xlat16_3.xxx * u_xlat16_19.xyz;
    u_xlat16_19.xyz = fma(u_xlat16_19.xyz, half3(FGlobals._RoleBackLightIntensity), u_xlat16_0.xyz);
    u_xlat16_11.xyz = u_xlat16_3.xxx * u_xlat16_13.xyz;
    u_xlat16_3.xyz = fma(u_xlat16_11.xyz, half3(FGlobals._RoleBackLightIntensity), u_xlat16_19.xyz);
    u_xlat16_3.xyz = u_xlat16_1.www * u_xlat16_3.xyz;
    u_xlat16_51 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_51 = min(u_xlat16_51, half(1.0));
    u_xlat16_53 = (-u_xlat16_51) + half(1.0);
    u_xlat16_51 = fma(FGlobals._VertexOcclusionIntensity, u_xlat16_53, u_xlat16_51);
    u_xlat16_3.xyz = fma(u_xlat16_3.xyz, half3(u_xlat16_51), u_xlat16_5.xyz);
    u_xlat0.xyz = input.TEXCOORD0.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
    u_xlat2 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat18.x = max(u_xlat2, 0.00100000005);
    u_xlat18.x = rsqrt(u_xlat18.x);
    u_xlat18.xyz = u_xlat0.xyz * u_xlat18.xxx;
    u_xlat2 = sqrt(u_xlat2);
    u_xlat16_51 = half(u_xlat2 + (-float(FGlobals.gFogParams[1].z)));
    u_xlat16_51 = max(u_xlat16_51, half(0.0));
    u_xlatb6.xyz = (half3(0.5, 0.5, 0.5)<FGlobals.gFogParams[7].wzx);
    u_xlatb54 = u_xlatb6.y || u_xlatb6.x;
    if(u_xlatb54){
        u_xlat8.xy = input.TEXCOORD0.xz + (-FGlobals._VT_TerrainInfo.zw);
        u_xlat8.xy = u_xlat8.xy * FGlobals._VT_TerrainInfo.yy;
        u_xlat8.xy = clamp(u_xlat8.xy, 0.0f, 1.0f);
        u_xlat16_54 = _VT_IndexTex.sample(sampler_VT_IndexTex, u_xlat8.xy, level(0.0)).x;
        u_xlat54 = fma(float(u_xlat16_54), 255.0, 0.5);
        u_xlatu54 = uint(u_xlat54);
        u_xlatu40 = u_xlatu54 & 0x7fu;
        u_xlat9.z = float(u_xlatu40);
        u_xlatu54 = u_xlatu54 >> 0x7u;
        u_xlat54 = float(u_xlatu54);
        u_xlati40.xy = int2(FGlobals._VT_TerrainTileInfo.yz);
        u_xlati40.x = (-u_xlati40.y) + u_xlati40.x;
        u_xlati40.x = 0x1 << u_xlati40.x;
        u_xlat40 = float(u_xlati40.x);
        u_xlat10.xy = float2(int2(FGlobals._VT_RootSize, FGlobals._VT_MaxVTMip));
        u_xlat8.xy = u_xlat8.xy * u_xlat10.xx;
        u_xlat10.xz = u_xlat8.xy / float2(u_xlat40);
        u_xlat10.xz = floor(u_xlat10.xz);
        u_xlat8.xy = fma((-u_xlat10.xz), float2(u_xlat40), u_xlat8.xy);
        u_xlat9.xy = u_xlat8.xy / float2(u_xlat40);
        u_xlat9.xy = clamp(u_xlat9.xy, 0.0f, 1.0f);
        u_xlat54 = min(u_xlat54, u_xlat10.y);
        u_xlat10_54 = half(_VT_WorldYTex.sample(vt_linear_clamp_sampler, u_xlat9.xy, round(u_xlat9.z), level(u_xlat54)).x);
        u_xlat8.x = (-FGlobals._VT_TerrainHeightInfo.x) + FGlobals._VT_TerrainHeightInfo.y;
        u_xlat54 = fma(float(u_xlat10_54), u_xlat8.x, FGlobals._VT_TerrainHeightInfo.x);
        u_xlat54 = u_xlat54 + FGlobals._VT_TerrainHeightInfo.w;
        u_xlat54 = max(u_xlat54, -1000000.0);
        u_xlat54 = min(u_xlat54, 1000000.0);
    } else {
        u_xlat54 = 0.0;
    }
    u_xlat16_5.x = FGlobals.gFogParams[0].w + FGlobals.gFogParams[1].x;
    u_xlat8.x = (-u_xlat54) + input.TEXCOORD0.y;
    u_xlat0.w = u_xlat8.x + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = dot(u_xlat0.xzw, u_xlat0.xzw);
    u_xlat0.x = sqrt(u_xlat0.x);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlat32 = (u_xlatb6.x) ? u_xlat0.w : u_xlat0.y;
    u_xlat16_51 = (u_xlatb6.x) ? half(u_xlat0.x) : u_xlat16_51;
    u_xlat16_21.x = half(float(FGlobals.gFogParams[1].z) / u_xlat2);
    u_xlat16_21.x = clamp(u_xlat16_21.x, 0.0h, 1.0h);
    u_xlat0.x = fma(u_xlat32, float(u_xlat16_21.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[0].x));
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[1].w);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_21.x = (-u_xlat16_21.x) + half(1.0);
    u_xlat32 = u_xlat32 * float(u_xlat16_21.x);
    u_xlat32 = u_xlat32 * float(FGlobals.gFogParams[1].w);
    u_xlat32 = max(u_xlat32, -64.0);
    u_xlat32 = min(u_xlat32, -0.00100000005);
    u_xlat48 = exp2((-u_xlat32));
    u_xlat48 = (-u_xlat48) + 1.0;
    u_xlat48 = u_xlat48 / u_xlat32;
    u_xlatb32 = 0.00999999978<(-u_xlat32);
    u_xlat32 = (u_xlatb32) ? u_xlat48 : 0.693147004;
    u_xlat0.x = u_xlat32 * u_xlat0.x;
    u_xlat16_51 = half(u_xlat0.x * (-float(u_xlat16_51)));
    u_xlat16_51 = u_xlat16_5.x * u_xlat16_51;
    u_xlat16_51 = u_xlat16_51 * FGlobals.gFogParams[0].y;
    u_xlat16_51 = exp2(u_xlat16_51);
    u_xlat16_51 = max(u_xlat16_51, FGlobals.gFogParams[0].z);
    u_xlat16_21.x = dot(float3(FGlobals.gLightBuffer[11].xyz), u_xlat18.xyz);
    u_xlat16_11.xyz = FGlobals.gFogParams[0].www * FGlobals.gFogParams[2].xyz;
    u_xlat16_37.x = fma(u_xlat16_21.x, u_xlat16_21.x, half(1.0));
    u_xlat16_12.xyz = FGlobals.gFogParams[1].xxx * FGlobals.gFogParams[3].xyz;
    u_xlat16_37.y = fma((-FGlobals.gFogParams[1].y), FGlobals.gFogParams[1].y, half(1.0));
    u_xlat16_0.xz = u_xlat16_37.xy * half2(0.0596831031, 0.119366206);
    u_xlat16_13.xy = fma(FGlobals.gFogParams[1].yy, FGlobals.gFogParams[1].yy, half2(1.0, 2.0));
    u_xlat16_21.x = dot(u_xlat16_21.xx, FGlobals.gFogParams[1].yy);
    u_xlat16_21.x = (-u_xlat16_21.x) + u_xlat16_13.x;
    u_xlat16_21.x = log2(abs(u_xlat16_21.x));
    u_xlat16_21.x = u_xlat16_21.x * half(-1.5);
    u_xlat16_21.x = exp2(u_xlat16_21.x);
    u_xlat16_32 = u_xlat16_0.z * u_xlat16_21.x;
    u_xlat16_32 = u_xlat16_37.x * u_xlat16_32;
    u_xlat16_32 = u_xlat16_32 / u_xlat16_13.y;
    u_xlat16_21.xyz = half3(u_xlat16_32) * u_xlat16_12.xyz;
    u_xlat16_12.xyz = FGlobals.gLightBuffer[12].xyz * FGlobals.gFogParams[2].www;
    u_xlat16_21.xyz = fma(u_xlat16_11.xyz, u_xlat16_0.xxx, u_xlat16_21.xyz);
    u_xlat16_21.xyz = u_xlat16_21.xyz * u_xlat16_12.xyz;
    u_xlat16_5.xyz = u_xlat16_21.xyz / u_xlat16_5.xxx;
    u_xlat16_53 = (-u_xlat16_51) + half(1.0);
    u_xlat16_5.xyz = half3(u_xlat16_53) * u_xlat16_5.xyz;
    u_xlat0.x = u_xlat54 + float(FGlobals.gFogParams[3].w);
    u_xlat0.x = (u_xlatb6.y) ? u_xlat0.x : float(FGlobals.gFogParams[3].w);
    u_xlat16_53 = half(u_xlat2 + (-float(FGlobals.gFogParams[5].y)));
    u_xlat16_53 = max(u_xlat16_53, half(0.0));
    u_xlat16_11.x = half(float(FGlobals.gFogParams[5].y) / u_xlat2);
    u_xlat16_11.x = clamp(u_xlat16_11.x, 0.0h, 1.0h);
    u_xlat32 = fma(u_xlat0.y, float(u_xlat16_11.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = (-u_xlat0.x) + u_xlat32;
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[5].z);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_11.x = (-u_xlat16_11.x) + half(1.0);
    u_xlat16.x = u_xlat0.y * float(u_xlat16_11.x);
    u_xlat16.x = u_xlat16.x * float(FGlobals.gFogParams[5].z);
    u_xlat16.x = max(u_xlat16.x, -64.0);
    u_xlat16.x = min(u_xlat16.x, -0.00100000005);
    u_xlat32 = exp2((-u_xlat16.x));
    u_xlat32 = (-u_xlat32) + 1.0;
    u_xlat32 = u_xlat32 / u_xlat16.x;
    u_xlatb16 = 0.00999999978<(-u_xlat16.x);
    u_xlat16.x = (u_xlatb16) ? u_xlat32 : 0.693147004;
    u_xlat0.x = u_xlat16.x * u_xlat0.x;
    u_xlat16_53 = half(u_xlat0.x * (-float(u_xlat16_53)));
    u_xlat16_53 = u_xlat16_53 * FGlobals.gFogParams[4].w;
    u_xlat16_53 = exp2(u_xlat16_53);
    u_xlat16_53 = max(u_xlat16_53, FGlobals.gFogParams[5].x);
    u_xlat16_0.xy = max(FGlobals.gFogParams[9].xy, half2(9.99999975e-05, 9.99999975e-05));
    u_xlat32 = u_xlat2 + (-float(FGlobals.gFogParams[1].z));
    u_xlat16_0.xy = half2(1.0, 1.0) / u_xlat16_0.xy;
    u_xlat0.x = float(u_xlat16_0.x) * u_xlat32;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat32 = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat32;
    u_xlat32 = u_xlat2 + (-float(FGlobals.gFogParams[5].y));
    u_xlat16.x = float(u_xlat16_0.y) * u_xlat32;
    u_xlat16.x = clamp(u_xlat16.x, 0.0f, 1.0f);
    u_xlat32 = fma(u_xlat16.x, -2.0, 3.0);
    u_xlat16.x = u_xlat16.x * u_xlat16.x;
    u_xlat16.x = u_xlat16.x * u_xlat32;
    u_xlat16_5.xyz = half3(u_xlat0.xxx * float3(u_xlat16_5.xyz));
    u_xlat16_32 = u_xlat16_51 + half(-1.0);
    u_xlat0.x = fma(u_xlat0.x, float(u_xlat16_32), 1.0);
    u_xlat16_32 = u_xlat16_53 + half(-1.0);
    u_xlat16.x = fma(u_xlat16.x, float(u_xlat16_32), 1.0);
    u_xlat16_51 = half((-u_xlat16.x) + 1.0);
    u_xlat16_5.xyz = half3(u_xlat16.xxx * float3(u_xlat16_5.xyz));
    u_xlat16_1.xyz = fma(FGlobals.gFogParams[4].xyz, half3(u_xlat16_51), u_xlat16_5.xyz);
    u_xlat16_1.w = half(u_xlat0.x * u_xlat16.x);
    if(u_xlatb6.z){
        u_xlat16_5.xy = half2(fma(input.TEXCOORD0.xz, float2(FGlobals.gFogParams[8].xy), float2(FGlobals.gFogParams[8].zw)));
        u_xlat16_51 = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_5.xy), level(0.0)).x;
        u_xlat16_51 = log2(u_xlat16_51);
        u_xlat16_51 = u_xlat16_51 * FGlobals.gFogParams[7].y;
        u_xlat16_51 = exp2(u_xlat16_51);
        u_xlat16_5.x = half(fma((-u_xlat16.x), u_xlat0.x, 1.0));
        u_xlat16_1.w = fma(u_xlat16_51, u_xlat16_5.x, u_xlat16_1.w);
        u_xlat16_1.xyz = fma(half3(u_xlat16_51), (-u_xlat16_1.xyz), u_xlat16_1.xyz);
    }
    u_xlatb0 = half(0.0)<FGlobals._ScreenCenterFogParams0.z;
    u_xlat16.xyz = input.TEXCOORD0.yyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1].xyw;
    u_xlat16.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0].xyw, input.TEXCOORD0.xxx, u_xlat16.xyz);
    u_xlat16.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2].xyw, input.TEXCOORD0.zzz, u_xlat16.xyz);
    u_xlat16.xyz = u_xlat16.xyz + UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3].xyw;
    u_xlat16.xy = u_xlat16.xy / u_xlat16.zz;
    u_xlat16.xy = fma(u_xlat16.xy, float2(0.5, 0.5), float2(0.5, 0.5));
    u_xlat16_2.xy = FGlobals._ScreenCenterFogParams1.xy + half2(0.5, 0.5);
    u_xlat16.xy = u_xlat16.xy + (-float2(u_xlat16_2.xy));
    u_xlat16.x = dot(u_xlat16.xy, u_xlat16.xy);
    u_xlat16.x = sqrt(u_xlat16.x);
    u_xlat16_51 = half(u_xlat16.x + (-float(FGlobals._ScreenCenterFogParams0.x)));
    u_xlat16_5.x = half(1.0) / FGlobals._ScreenCenterFogParams0.y;
    u_xlat16_51 = u_xlat16_51 * u_xlat16_5.x;
    u_xlat16_51 = clamp(u_xlat16_51, 0.0h, 1.0h);
    u_xlat16_5.x = fma(u_xlat16_51, half(-2.0), half(3.0));
    u_xlat16_51 = u_xlat16_51 * u_xlat16_51;
    u_xlat16_51 = fma((-u_xlat16_5.x), u_xlat16_51, half(1.0));
    u_xlat16_5.x = u_xlat16_51 * FGlobals._ScreenCenterFogParams0.z;
    u_xlat16_51 = fma((-u_xlat16_51), FGlobals._ScreenCenterFogParams0.z, half(1.0));
    u_xlat16_2.xyz = u_xlat16_1.xyz * half3(u_xlat16_51);
    u_xlat16_51 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_2.w = fma(u_xlat16_5.x, u_xlat16_51, u_xlat16_1.w);
    u_xlat16_0 = (bool(u_xlatb0)) ? u_xlat16_2 : u_xlat16_1;
    output.SV_TARGET0.xyz = fma(u_xlat16_3.xyz, u_xlat16_0.www, u_xlat16_0.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    output.SV_Target2 = 1.0;
    return output;
}
