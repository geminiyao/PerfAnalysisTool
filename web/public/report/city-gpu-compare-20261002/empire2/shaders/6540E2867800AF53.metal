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
    float4 _Time ;
    float3 _WorldSpaceCameraPos ;
    float4 _ProjectionParams ;
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    half4 _MainTex_ST ;
    half4 _TintColorHDR ;
    half4 _RoughnessScale ;
    half4 _BakingTex_ST ;
    half _BakingGIStrength ;
    half _BakingAOStrength ;
    half _TeamColorIntensity ;
    half _TeamMaskScale ;
    half _TeamColorReplace ;
    half _TeamColorGrayscaleBlend ;
    half4 _NightColorHDR ;
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
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]] ;
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
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(1) ]],
    constant UnityInstancing_ColorProps_Type& UnityInstancing_ColorProps [[ buffer(2) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_NormalTex [[ sampler (1) ]],
    sampler sampler_BakingTex [[ sampler (2) ]],
    sampler samplerCloudTex [[ sampler (3) ]],
    sampler sampler_VT_IndexTex [[ sampler (4) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _BakingTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(2) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(3) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(4) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(5) ]] ,
    texture2d<half, access::sample > BnSFog_FogMaskTex [[ texture(6) ]] ,
    texture2d<half, access::sample > _VT_IndexTex [[ texture(7) ]] ,
    texture2d_array<half, access::sample > _VT_WorldYTex [[ texture(8) ]] ,
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
    float u_xlat1;
    half4 u_xlat16_1;
    float4 u_xlat2;
    half4 u_xlat16_2;
    bool3 u_xlatb2;
    float4 u_xlat3;
    half4 u_xlat16_3;
    bool2 u_xlatb3;
    half4 u_xlat16_4;
    half3 u_xlat16_5;
    half4 u_xlat16_6;
    half3 u_xlat16_7;
    half3 u_xlat16_8;
    half3 u_xlat16_9;
    float3 u_xlat10;
    float3 u_xlat11;
    float3 u_xlat12;
    half3 u_xlat16_12;
    bool u_xlatb12;
    float3 u_xlat13;
    bool2 u_xlatb14;
    bool2 u_xlatb15;
    half3 u_xlat16_18;
    half3 u_xlat16_20;
    float u_xlat24;
    half u_xlat16_24;
    bool u_xlatb24;
    float u_xlat26;
    float u_xlat27;
    int2 u_xlati27;
    uint u_xlatu27;
    half2 u_xlat16_30;
    float u_xlat36;
    float u_xlat37;
    half u_xlat16_37;
    bool u_xlatb37;
    float u_xlat38;
    half u_xlat16_38;
    half u_xlat10_38;
    uint u_xlatu38;
    bool u_xlatb38;
    half u_xlat16_41;
    half u_xlat16_42;
    float u_xlat43;
    half u_xlat16_43;
    u_xlati0 = int(input.SV_InstanceID0) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlat16_12.x = dot(input.TEXCOORD3.xyz, input.TEXCOORD3.xyz);
    u_xlat16_12.x = max(u_xlat16_12.x, half(0.00100000005));
    u_xlat16_12.x = rsqrt(u_xlat16_12.x);
    u_xlat16_12.xyz = u_xlat16_12.xxx * input.TEXCOORD3.xyz;
    u_xlat16_1.x = dot(input.TEXCOORD4.xyz, input.TEXCOORD4.xyz);
    u_xlat16_1.x = max(u_xlat16_1.x, half(0.00100000005));
    u_xlat16_1.x = rsqrt(u_xlat16_1.x);
    u_xlat16_1.xyz = u_xlat16_1.xxx * input.TEXCOORD4.xyz;
    u_xlat2.x = input.TEXCOORD0.w;
    u_xlat2.y = input.TEXCOORD1.w;
    u_xlat2.xy = fma(u_xlat2.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw));
    u_xlati0 = u_xlati0 << 0x1;
    u_xlat16_3 = _MainTex.sample(sampler_MainTex, u_xlat2.xy);
    u_xlat16_4.x = input.TEXCOORD3.w;
    u_xlat16_4.y = input.TEXCOORD4.w;
    u_xlat16_4.xy = fma(u_xlat16_4.xy, FGlobals._BakingTex_ST.xy, FGlobals._BakingTex_ST.zw);
    u_xlat16_4 = _BakingTex.sample(sampler_BakingTex, float2(u_xlat16_4.xy));
    u_xlat16_5.x = fma((-u_xlat16_4.w), FGlobals._BakingAOStrength, half(1.0));
    u_xlat16_5.xyz = u_xlat16_4.xyz * u_xlat16_5.xxx;
    u_xlat16_5.xyz = u_xlat16_3.xyz * u_xlat16_5.xyz;
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(FGlobals._BakingGIStrength);
    u_xlat16_2.xyz = _NormalTex.sample(sampler_NormalTex, u_xlat2.xy).xyz;
    u_xlat16_6.xy = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_6.z = (-u_xlat16_6.y);
    u_xlat16_41 = dot(u_xlat16_6.xz, u_xlat16_6.xz);
    u_xlat16_41 = min(u_xlat16_41, half(1.0));
    u_xlat16_41 = (-u_xlat16_41) + half(1.0);
    u_xlat16_6.w = sqrt(u_xlat16_41);
    u_xlat16_7.xyz = u_xlat16_3.xyz * FGlobals._TintColorHDR.xyz;
    u_xlat16_8.xyz = half3(float3(FGlobals._TeamColorIntensity) * UnityInstancing_ColorProps.ColorPropsArray[u_xlati0 / 2]._TeamColor.xyz);
    u_xlat16_41 = dot(half3(0.212500006, 0.715399981, 0.0720999986), u_xlat16_7.xyz);
    u_xlat16_41 = u_xlat16_41 + half(-1.0);
    u_xlat16_41 = fma(FGlobals._TeamColorGrayscaleBlend, u_xlat16_41, half(1.0));
    u_xlatb37 = half(0.5)<FGlobals._TeamColorReplace;
    u_xlat16_18.x = (-u_xlat16_3.w) + half(1.0);
    u_xlat16_43 = half(float(u_xlat16_18.x) * UnityInstancing_ColorProps.ColorPropsArray[u_xlati0 / 2]._TeamColor.w);
    u_xlat16_9.xyz = fma(u_xlat16_8.xyz, half3(u_xlat16_41), (-u_xlat16_7.xyz));
    u_xlat16_9.xyz = fma(half3(u_xlat16_43), u_xlat16_9.xyz, u_xlat16_7.xyz);
    u_xlat16_9.xyz = half3(float3(u_xlat16_9.xyz) + UnityInstancing_ColorProps.ColorPropsArray[u_xlati0 / 2]._HighlightColor.xyz);
    u_xlat16_18.x = u_xlat16_18.x * FGlobals._TeamMaskScale;
    u_xlat16_18.x = min(u_xlat16_18.x, half(1.0));
    u_xlat16_8.xyz = fma(u_xlat16_8.xyz, half3(u_xlat16_41), half3(-1.0, -1.0, -1.0));
    u_xlat16_8.xyz = fma(u_xlat16_18.xxx, u_xlat16_8.xyz, half3(1.0, 1.0, 1.0));
    u_xlat16_7.xyz = half3(fma(float3(u_xlat16_7.xyz), float3(u_xlat16_8.xyz), UnityInstancing_ColorProps.ColorPropsArray[u_xlati0 / 2]._HighlightColor.xyz));
    u_xlat16_7.xyz = (bool(u_xlatb37)) ? u_xlat16_9.xyz : u_xlat16_7.xyz;
    u_xlat16_41 = (-input.TEXCOORD2.x) + half(1.0);
    u_xlat16_41 = u_xlat16_41 * FGlobals.gLightBuffer[8].w;
    u_xlat16_18.x = u_xlat16_4.w + half(-1.0);
    u_xlat16_18.x = fma(FGlobals._BakingAOStrength, u_xlat16_18.x, half(1.0));
    u_xlatb0 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_20.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_43 = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_20.x = (u_xlatb0) ? FGlobals.gLightBuffer[8].x : u_xlat16_43;
    u_xlat16_43 = dot(FGlobals._RoughnessScale.xyz, u_xlat16_20.xyz);
    u_xlat16_43 = u_xlat16_2.z * u_xlat16_43;
    u_xlat16_5.xyz = fma(half3(u_xlat16_41), FGlobals._NightColorHDR.xyz, u_xlat16_5.xyz);
    u_xlat16_41 = max(u_xlat16_43, half(0.119999997));
    u_xlat16_41 = min(u_xlat16_41, half(1.0));
    u_xlatb0 = 0.0>=FGlobals.gShadowParams0[5].z;
    if(u_xlatb0){
        u_xlat16_43 = half(1.0);
    }
    if(!u_xlatb0){
        u_xlat2.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlatb0 = 0.5<FGlobals.gPlanarShadowEnabled;
        u_xlat37 = input.TEXCOORD0.y + 100.0;
        u_xlat37 = u_xlat37 / FGlobals.gPlanarShadowParams.y;
        u_xlat37 = u_xlat37 + FGlobals._PlanarShadowDepthBias;
        u_xlatb38 = FGlobals.gPlanarShadowEnabled<0.5;
        u_xlat3.x = min(u_xlat2.z, 0.999000013);
        u_xlat26 = (u_xlatb38) ? u_xlat3.x : u_xlat2.z;
        u_xlat26 = (u_xlatb0) ? u_xlat37 : u_xlat26;
        u_xlat38 = u_xlat26 + FGlobals.gShadowParams0[4].z;
        u_xlat3.x = (-u_xlat38) + 1.0;
        u_xlat38 = (u_xlatb0) ? u_xlat38 : u_xlat3.x;
        u_xlat38 = float(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat2.xy, saturate(u_xlat38), level(0.0)));
        u_xlatb3.xy = (u_xlat2.xy<float2(0.0, 0.0));
        u_xlatb3.x = u_xlatb3.y || u_xlatb3.x;
        u_xlatb15.xy = (float2(1.0, 1.0)<u_xlat2.xy);
        u_xlatb15.x = u_xlatb15.y || u_xlatb15.x;
        u_xlatb3.x = u_xlatb15.x || u_xlatb3.x;
        u_xlat16_8.x = (u_xlatb3.x) ? half(1.0) : half(u_xlat38);
        u_xlatb38 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb38){
            if(u_xlatb0){
                u_xlat38 = (-input.TEXCOORD0.y) + FGlobals.gPlanarShadowParams.x;
                u_xlat38 = u_xlat38 / float(FGlobals.gLightBuffer[11].y);
                u_xlat3.xyz = fma(float3(FGlobals.gLightBuffer[11].xyz), float3(u_xlat38), input.TEXCOORD0.xyz);
                u_xlat3.w = 1.0;
                u_xlat10.x = dot(FGlobals.gShadowParams0[0], u_xlat3);
                u_xlat10.y = dot(FGlobals.gShadowParams0[1], u_xlat3);
                u_xlat10.z = dot(FGlobals.gShadowParams0[3], u_xlat3);
                u_xlat16_20.xyz = half3(u_xlat10.xyz * float3(0.5, 0.5, 0.5));
                u_xlat16_9.x = u_xlat16_20.z + u_xlat16_20.x;
                u_xlat16_9.y = half(fma(float(u_xlat16_20.y), FGlobals._ProjectionParams.x, float(u_xlat16_20.z)));
                u_xlat37 = u_xlat37 * u_xlat10.z;
                u_xlat3.xy = float2(u_xlat16_9.xy) / u_xlat10.zz;
                u_xlat26 = u_xlat37 / u_xlat10.z;
            } else {
                u_xlat3.xy = fma(u_xlat2.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            }
            u_xlat37 = u_xlat26 + FGlobals.gShadowParams0[4].z;
            u_xlat2.x = (-u_xlat37) + 1.0;
            u_xlat37 = (u_xlatb0) ? u_xlat37 : u_xlat2.x;
            u_xlat37 = float(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat3.xy, saturate(u_xlat37), level(0.0)));
            u_xlatb2.xy = (u_xlat3.xy<float2(0.0, 0.0));
            u_xlatb2.x = u_xlatb2.y || u_xlatb2.x;
            u_xlatb14.xy = (float2(1.0, 1.0)<u_xlat3.xy);
            u_xlatb14.x = u_xlatb14.y || u_xlatb14.x;
            u_xlatb2.x = u_xlatb14.x || u_xlatb2.x;
            u_xlat16_20.x = (u_xlatb2.x) ? half(1.0) : half(u_xlat37);
            u_xlat16_8.x = min(u_xlat16_20.x, u_xlat16_8.x);
        }
        u_xlat0.x = (u_xlatb0) ? -100.0 : -30.0;
        u_xlatb0 = input.TEXCOORD0.y<u_xlat0.x;
        u_xlat16_37 = u_xlat16_8.x + half(-1.0);
        u_xlat37 = fma(FGlobals.gShadowParams0[5].z, float(u_xlat16_37), 1.0);
        u_xlat43 = (u_xlatb0) ? 1.0 : u_xlat37;
        u_xlat16_43 = half(u_xlat43);
    }
    u_xlatb0 = 0.0<FGlobals.CloudParam.w;
    if(u_xlatb0){
        u_xlat2 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
        u_xlat2 = fma(u_xlat2, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
        u_xlat2 = fma((-FGlobals.CloudSpeed), FGlobals._Time.xxxx, u_xlat2);
        u_xlat16_0.x = CloudTex.sample(samplerCloudTex, u_xlat2.xy).y;
        u_xlat16_37 = CloudTex.sample(samplerCloudTex, u_xlat2.zw).w;
        u_xlat16_8.x = u_xlat16_37 * half(0.5);
        u_xlat16_8.x = fma(u_xlat16_0.x, half(0.5), u_xlat16_8.x);
        u_xlat16_0.x = fma((-u_xlat16_8.x), u_xlat16_8.x, u_xlat16_8.x);
        u_xlat37 = fma((-float(u_xlat16_8.x)), float(u_xlat16_8.x), FGlobals.CloudParam.y);
        u_xlat16_0.x = half(1.0) / u_xlat16_0.x;
        u_xlat0.x = float(u_xlat16_0.x) * u_xlat37;
        u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
        u_xlat37 = fma(u_xlat0.x, -2.0, 3.0);
        u_xlat0.x = u_xlat0.x * u_xlat0.x;
        u_xlat0.x = u_xlat0.x * u_xlat37;
        u_xlat0.x = fma((-u_xlat0.x), FGlobals.CloudParam.z, 1.0);
        u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
        u_xlat16_43 = half(min(u_xlat0.x, float(u_xlat16_43)));
    }
    u_xlat2.xyz = float3(u_xlat16_7.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_8.x = dot(u_xlat16_6.xzw, u_xlat16_1.xyz);
    u_xlat16_8.x = clamp(u_xlat16_8.x, 0.0h, 1.0h);
    u_xlat16_6.x = dot(u_xlat16_6.xzw, u_xlat16_12.xyz);
    u_xlat16_6.x = clamp(u_xlat16_6.x, 0.0h, 1.0h);
    u_xlat16_0.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_8.xyz = u_xlat16_8.xxx * u_xlat16_0.xyz;
    u_xlat16_30.x = fma(u_xlat16_41, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_6.x), u_xlat16_6.x, half(1.0));
    u_xlat16_41 = u_xlat16_41 * u_xlat16_41;
    u_xlat16_12.x = u_xlat16_41 * u_xlat16_6.x;
    u_xlat16_0.x = fma(u_xlat16_12.x, u_xlat16_12.x, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_41 / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_30.x;
    u_xlat16_0.xyz = fma(u_xlat16_0.xxx, half3(0.0399999991, 0.0399999991, 0.0399999991), u_xlat16_7.xyz);
    u_xlat16_0.xyz = u_xlat16_0.xyz * u_xlat16_8.xyz;
    u_xlat16_6.xzw = half3(u_xlat16_43) * u_xlat16_0.xyz;
    u_xlat16_6.xzw = half3(fma(u_xlat2.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_6.xzw)));
    u_xlat16_5.xyz = fma(u_xlat16_6.xzw, u_xlat16_18.xxx, u_xlat16_5.xyz);
    u_xlat0.xyz = input.TEXCOORD0.xyz + (-FGlobals._WorldSpaceCameraPos.xyzx.xyz);
    u_xlat1 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat13.x = max(u_xlat1, 0.00100000005);
    u_xlat13.x = rsqrt(u_xlat13.x);
    u_xlat13.xyz = u_xlat0.xyz * u_xlat13.xxx;
    u_xlat1 = sqrt(u_xlat1);
    u_xlat16_41 = half(u_xlat1 + (-float(FGlobals.gFogParams[1].z)));
    u_xlat16_41 = max(u_xlat16_41, half(0.0));
    u_xlatb2.xyz = (half3(0.5, 0.5, 0.5)<FGlobals.gFogParams[7].wzx);
    u_xlatb38 = u_xlatb2.y || u_xlatb2.x;
    if(u_xlatb38){
        u_xlat3.xy = input.TEXCOORD0.xz + (-FGlobals._VT_TerrainInfo.zw);
        u_xlat3.xy = u_xlat3.xy * FGlobals._VT_TerrainInfo.yy;
        u_xlat3.xy = clamp(u_xlat3.xy, 0.0f, 1.0f);
        u_xlat16_38 = _VT_IndexTex.sample(sampler_VT_IndexTex, u_xlat3.xy, level(0.0)).x;
        u_xlat38 = fma(float(u_xlat16_38), 255.0, 0.5);
        u_xlatu38 = uint(u_xlat38);
        u_xlatu27 = u_xlatu38 & 0x7fu;
        u_xlat10.z = float(u_xlatu27);
        u_xlatu38 = u_xlatu38 >> 0x7u;
        u_xlat38 = float(u_xlatu38);
        u_xlati27.xy = int2(FGlobals._VT_TerrainTileInfo.yz);
        u_xlati27.x = (-u_xlati27.y) + u_xlati27.x;
        u_xlati27.x = 0x1 << u_xlati27.x;
        u_xlat27 = float(u_xlati27.x);
        u_xlat11.xy = float2(int2(FGlobals._VT_RootSize, FGlobals._VT_MaxVTMip));
        u_xlat3.xy = u_xlat3.xy * u_xlat11.xx;
        u_xlat11.xz = u_xlat3.xy / float2(u_xlat27);
        u_xlat11.xz = floor(u_xlat11.xz);
        u_xlat3.xy = fma((-u_xlat11.xz), float2(u_xlat27), u_xlat3.xy);
        u_xlat10.xy = u_xlat3.xy / float2(u_xlat27);
        u_xlat10.xy = clamp(u_xlat10.xy, 0.0f, 1.0f);
        u_xlat38 = min(u_xlat38, u_xlat11.y);
        u_xlat10_38 = half(_VT_WorldYTex.sample(vt_linear_clamp_sampler, u_xlat10.xy, round(u_xlat10.z), level(u_xlat38)).x);
        u_xlat3.x = (-FGlobals._VT_TerrainHeightInfo.x) + FGlobals._VT_TerrainHeightInfo.y;
        u_xlat38 = fma(float(u_xlat10_38), u_xlat3.x, FGlobals._VT_TerrainHeightInfo.x);
        u_xlat38 = u_xlat38 + FGlobals._VT_TerrainHeightInfo.w;
        u_xlat38 = max(u_xlat38, -1000000.0);
        u_xlat38 = min(u_xlat38, 1000000.0);
    } else {
        u_xlat38 = 0.0;
    }
    u_xlat16_6.x = FGlobals.gFogParams[0].w + FGlobals.gFogParams[1].x;
    u_xlat3.x = (-u_xlat38) + input.TEXCOORD0.y;
    u_xlat0.w = u_xlat3.x + (-FGlobals._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = dot(u_xlat0.xzw, u_xlat0.xzw);
    u_xlat0.x = sqrt(u_xlat0.x);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlat24 = (u_xlatb2.x) ? u_xlat0.w : u_xlat0.y;
    u_xlat16_41 = (u_xlatb2.x) ? half(u_xlat0.x) : u_xlat16_41;
    u_xlat16_18.x = half(float(FGlobals.gFogParams[1].z) / u_xlat1);
    u_xlat16_18.x = clamp(u_xlat16_18.x, 0.0h, 1.0h);
    u_xlat0.x = fma(u_xlat24, float(u_xlat16_18.x), FGlobals._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[0].x));
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[1].w);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_18.x = (-u_xlat16_18.x) + half(1.0);
    u_xlat24 = u_xlat24 * float(u_xlat16_18.x);
    u_xlat24 = u_xlat24 * float(FGlobals.gFogParams[1].w);
    u_xlat24 = max(u_xlat24, -64.0);
    u_xlat24 = min(u_xlat24, -0.00100000005);
    u_xlat36 = exp2((-u_xlat24));
    u_xlat36 = (-u_xlat36) + 1.0;
    u_xlat36 = u_xlat36 / u_xlat24;
    u_xlatb24 = 0.00999999978<(-u_xlat24);
    u_xlat24 = (u_xlatb24) ? u_xlat36 : 0.693147004;
    u_xlat0.x = u_xlat24 * u_xlat0.x;
    u_xlat16_41 = half(u_xlat0.x * (-float(u_xlat16_41)));
    u_xlat16_41 = u_xlat16_6.x * u_xlat16_41;
    u_xlat16_41 = u_xlat16_41 * FGlobals.gFogParams[0].y;
    u_xlat16_41 = exp2(u_xlat16_41);
    u_xlat16_41 = max(u_xlat16_41, FGlobals.gFogParams[0].z);
    u_xlat16_18.x = dot(float3(FGlobals.gLightBuffer[11].xyz), u_xlat13.xyz);
    u_xlat16_7.xyz = FGlobals.gFogParams[0].www * FGlobals.gFogParams[2].xyz;
    u_xlat16_30.x = fma(u_xlat16_18.x, u_xlat16_18.x, half(1.0));
    u_xlat16_8.xyz = FGlobals.gFogParams[1].xxx * FGlobals.gFogParams[3].xyz;
    u_xlat16_30.y = fma((-FGlobals.gFogParams[1].y), FGlobals.gFogParams[1].y, half(1.0));
    u_xlat16_0.xz = u_xlat16_30.xy * half2(0.0596831031, 0.119366206);
    u_xlat16_9.xy = fma(FGlobals.gFogParams[1].yy, FGlobals.gFogParams[1].yy, half2(1.0, 2.0));
    u_xlat16_18.x = dot(u_xlat16_18.xx, FGlobals.gFogParams[1].yy);
    u_xlat16_18.x = (-u_xlat16_18.x) + u_xlat16_9.x;
    u_xlat16_18.x = log2(abs(u_xlat16_18.x));
    u_xlat16_18.x = u_xlat16_18.x * half(-1.5);
    u_xlat16_18.x = exp2(u_xlat16_18.x);
    u_xlat16_24 = u_xlat16_0.z * u_xlat16_18.x;
    u_xlat16_24 = u_xlat16_30.x * u_xlat16_24;
    u_xlat16_24 = u_xlat16_24 / u_xlat16_9.y;
    u_xlat16_18.xyz = half3(u_xlat16_24) * u_xlat16_8.xyz;
    u_xlat16_8.xyz = FGlobals.gLightBuffer[12].xyz * FGlobals.gFogParams[2].www;
    u_xlat16_18.xyz = fma(u_xlat16_7.xyz, u_xlat16_0.xxx, u_xlat16_18.xyz);
    u_xlat16_18.xyz = u_xlat16_18.xyz * u_xlat16_8.xyz;
    u_xlat16_6.xyz = u_xlat16_18.xyz / u_xlat16_6.xxx;
    u_xlat16_42 = (-u_xlat16_41) + half(1.0);
    u_xlat16_6.xyz = half3(u_xlat16_42) * u_xlat16_6.xyz;
    u_xlat0.x = u_xlat38 + float(FGlobals.gFogParams[3].w);
    u_xlat0.x = (u_xlatb2.y) ? u_xlat0.x : float(FGlobals.gFogParams[3].w);
    u_xlat16_42 = half(u_xlat1 + (-float(FGlobals.gFogParams[5].y)));
    u_xlat16_42 = max(u_xlat16_42, half(0.0));
    u_xlat16_7.x = half(float(FGlobals.gFogParams[5].y) / u_xlat1);
    u_xlat16_7.x = clamp(u_xlat16_7.x, 0.0h, 1.0h);
    u_xlat24 = fma(u_xlat0.y, float(u_xlat16_7.x), FGlobals._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = (-u_xlat0.x) + u_xlat24;
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[5].z);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_7.x = (-u_xlat16_7.x) + half(1.0);
    u_xlat12.x = u_xlat0.y * float(u_xlat16_7.x);
    u_xlat12.x = u_xlat12.x * float(FGlobals.gFogParams[5].z);
    u_xlat12.x = max(u_xlat12.x, -64.0);
    u_xlat12.x = min(u_xlat12.x, -0.00100000005);
    u_xlat24 = exp2((-u_xlat12.x));
    u_xlat24 = (-u_xlat24) + 1.0;
    u_xlat24 = u_xlat24 / u_xlat12.x;
    u_xlatb12 = 0.00999999978<(-u_xlat12.x);
    u_xlat12.x = (u_xlatb12) ? u_xlat24 : 0.693147004;
    u_xlat0.x = u_xlat12.x * u_xlat0.x;
    u_xlat16_42 = half(u_xlat0.x * (-float(u_xlat16_42)));
    u_xlat16_42 = u_xlat16_42 * FGlobals.gFogParams[4].w;
    u_xlat16_42 = exp2(u_xlat16_42);
    u_xlat16_42 = max(u_xlat16_42, FGlobals.gFogParams[5].x);
    u_xlat16_0.xy = max(FGlobals.gFogParams[9].xy, half2(9.99999975e-05, 9.99999975e-05));
    u_xlat24 = u_xlat1 + (-float(FGlobals.gFogParams[1].z));
    u_xlat16_0.xy = half2(1.0, 1.0) / u_xlat16_0.xy;
    u_xlat0.x = float(u_xlat16_0.x) * u_xlat24;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat24 = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat24;
    u_xlat24 = u_xlat1 + (-float(FGlobals.gFogParams[5].y));
    u_xlat12.x = float(u_xlat16_0.y) * u_xlat24;
    u_xlat12.x = clamp(u_xlat12.x, 0.0f, 1.0f);
    u_xlat24 = fma(u_xlat12.x, -2.0, 3.0);
    u_xlat12.x = u_xlat12.x * u_xlat12.x;
    u_xlat12.x = u_xlat12.x * u_xlat24;
    u_xlat16_6.xyz = half3(u_xlat0.xxx * float3(u_xlat16_6.xyz));
    u_xlat16_24 = u_xlat16_41 + half(-1.0);
    u_xlat0.x = fma(u_xlat0.x, float(u_xlat16_24), 1.0);
    u_xlat16_24 = u_xlat16_42 + half(-1.0);
    u_xlat12.x = fma(u_xlat12.x, float(u_xlat16_24), 1.0);
    u_xlat16_41 = half((-u_xlat12.x) + 1.0);
    u_xlat16_6.xyz = half3(u_xlat12.xxx * float3(u_xlat16_6.xyz));
    u_xlat16_1.xyz = fma(FGlobals.gFogParams[4].xyz, half3(u_xlat16_41), u_xlat16_6.xyz);
    u_xlat16_1.w = half(u_xlat0.x * u_xlat12.x);
    if(u_xlatb2.z){
        u_xlat16_6.xy = half2(fma(input.TEXCOORD0.xz, float2(FGlobals.gFogParams[8].xy), float2(FGlobals.gFogParams[8].zw)));
        u_xlat16_41 = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_6.xy), level(0.0)).x;
        u_xlat16_41 = log2(u_xlat16_41);
        u_xlat16_41 = u_xlat16_41 * FGlobals.gFogParams[7].y;
        u_xlat16_41 = exp2(u_xlat16_41);
        u_xlat16_6.x = half(fma((-u_xlat12.x), u_xlat0.x, 1.0));
        u_xlat16_1.w = fma(u_xlat16_41, u_xlat16_6.x, u_xlat16_1.w);
        u_xlat16_1.xyz = fma(half3(u_xlat16_41), (-u_xlat16_1.xyz), u_xlat16_1.xyz);
    }
    u_xlatb0 = half(0.0)<FGlobals._ScreenCenterFogParams0.z;
    u_xlat12.xyz = input.TEXCOORD0.yyy * FGlobals.hlslcc_mtx4x4unity_MatrixVP[1].xyw;
    u_xlat12.xyz = fma(FGlobals.hlslcc_mtx4x4unity_MatrixVP[0].xyw, input.TEXCOORD0.xxx, u_xlat12.xyz);
    u_xlat12.xyz = fma(FGlobals.hlslcc_mtx4x4unity_MatrixVP[2].xyw, input.TEXCOORD0.zzz, u_xlat12.xyz);
    u_xlat12.xyz = u_xlat12.xyz + FGlobals.hlslcc_mtx4x4unity_MatrixVP[3].xyw;
    u_xlat12.xy = u_xlat12.xy / u_xlat12.zz;
    u_xlat12.xy = fma(u_xlat12.xy, float2(0.5, 0.5), float2(0.5, 0.5));
    u_xlat16_2.xy = FGlobals._ScreenCenterFogParams1.xy + half2(0.5, 0.5);
    u_xlat12.xy = u_xlat12.xy + (-float2(u_xlat16_2.xy));
    u_xlat12.x = dot(u_xlat12.xy, u_xlat12.xy);
    u_xlat12.x = sqrt(u_xlat12.x);
    u_xlat16_41 = half(u_xlat12.x + (-float(FGlobals._ScreenCenterFogParams0.x)));
    u_xlat16_6.x = half(1.0) / FGlobals._ScreenCenterFogParams0.y;
    u_xlat16_41 = u_xlat16_41 * u_xlat16_6.x;
    u_xlat16_41 = clamp(u_xlat16_41, 0.0h, 1.0h);
    u_xlat16_6.x = fma(u_xlat16_41, half(-2.0), half(3.0));
    u_xlat16_41 = u_xlat16_41 * u_xlat16_41;
    u_xlat16_41 = fma((-u_xlat16_6.x), u_xlat16_41, half(1.0));
    u_xlat16_6.x = u_xlat16_41 * FGlobals._ScreenCenterFogParams0.z;
    u_xlat16_41 = fma((-u_xlat16_41), FGlobals._ScreenCenterFogParams0.z, half(1.0));
    u_xlat16_2.xyz = u_xlat16_1.xyz * half3(u_xlat16_41);
    u_xlat16_41 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_2.w = fma(u_xlat16_6.x, u_xlat16_41, u_xlat16_1.w);
    u_xlat16_0 = (bool(u_xlatb0)) ? u_xlat16_2 : u_xlat16_1;
    output.SV_TARGET0.xyz = fma(u_xlat16_5.xyz, u_xlat16_0.www, u_xlat16_0.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
