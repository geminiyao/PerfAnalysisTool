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
    half4 _MainTex_ST ;
    half4 _TintColorHDR ;
    half4 _RoughnessScale ;
    half4 _BakingTex_ST ;
    half _BakingGIStrength ;
    half _BakingAOStrength ;
    half4 _SnowColor ;
    half _SnowLevel ;
    half _SnowNoise ;
    half _SnowNoiseInvert ;
    half _SnowIntensity ;
    half _SnowWetness ;
    half _ShowSnowDirectly ;
    half4 _NightColorHDR ;
    half4 gLightBuffer [115];
    float4 gShadowParams0 [6];
    half gShadowmapFuncEnabled ;
    half gShadowEnableDynamicShadow ;
    float4 CloudSpeed ;
    float4 CloudParam ;
    float4 CloudOffset ;
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
    ColorPropsArray_Type ColorPropsArray [2];
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    half3 TEXCOORD5 [[ user(TEXCOORD5) ]] ;
    half4 TEXCOORD7 [[ user(TEXCOORD7) ]] ;
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
    const constant ColorPropsArray_Type* UnityInstancing_ColorProps [[ buffer(2) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_NormalTex [[ sampler (1) ]],
    sampler sampler_BakingTex [[ sampler (2) ]],
    sampler samplerCloudTex [[ sampler (3) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _BakingTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(2) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(3) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(4) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(5) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_linear_clamp_compare_sampler(compare_func::greater_equal,filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float3 u_xlat0;
    half3 u_xlat16_0;
    half u_xlat10_0;
    int u_xlati0;
    bool u_xlatb0;
    half3 u_xlat16_1;
    float4 u_xlat2;
    half4 u_xlat16_2;
    bool2 u_xlatb2;
    half3 u_xlat16_3;
    half4 u_xlat16_4;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    bool2 u_xlatb6;
    half4 u_xlat16_7;
    half3 u_xlat16_8;
    half3 u_xlat16_9;
    half3 u_xlat16_10;
    half3 u_xlat16_13;
    half u_xlat16_17;
    half3 u_xlat16_18;
    bool2 u_xlatb22;
    half2 u_xlat16_23;
    half u_xlat16_27;
    float u_xlat31;
    half u_xlat16_31;
    half u_xlat10_31;
    bool u_xlatb31;
    bool u_xlatb32;
    half u_xlat16_35;
    u_xlati0 = int(input.SV_InstanceID0) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlat16_10.x = dot(input.TEXCOORD3.xyz, input.TEXCOORD3.xyz);
    u_xlat16_10.x = max(u_xlat16_10.x, half(0.00100000005));
    u_xlat16_10.x = rsqrt(u_xlat16_10.x);
    u_xlat16_10.xyz = u_xlat16_10.xxx * input.TEXCOORD3.xyz;
    u_xlat16_1.x = dot(input.TEXCOORD4.xyz, input.TEXCOORD4.xyz);
    u_xlat16_1.x = max(u_xlat16_1.x, half(0.00100000005));
    u_xlat16_1.x = rsqrt(u_xlat16_1.x);
    u_xlat16_1.xyz = u_xlat16_1.xxx * input.TEXCOORD4.xyz;
    u_xlat2.x = input.TEXCOORD0.w;
    u_xlat2.y = input.TEXCOORD1.w;
    u_xlat16_3.xy = half2(fma(u_xlat2.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw)));
    u_xlati0 = u_xlati0 << 0x1;
    u_xlat16_2 = _MainTex.sample(sampler_MainTex, float2(u_xlat16_3.xy));
    u_xlat16_4.x = input.TEXCOORD3.w;
    u_xlat16_4.y = input.TEXCOORD4.w;
    u_xlat16_23.xy = fma(u_xlat16_4.xy, FGlobals._BakingTex_ST.xy, FGlobals._BakingTex_ST.zw);
    u_xlat16_4 = _BakingTex.sample(sampler_BakingTex, float2(u_xlat16_23.xy));
    u_xlat16_23.x = fma((-u_xlat16_4.w), FGlobals._BakingAOStrength, half(1.0));
    u_xlat16_5.xyz = u_xlat16_23.xxx * u_xlat16_4.xyz;
    u_xlat16_5.xyz = u_xlat16_2.xyz * u_xlat16_5.xyz;
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(FGlobals._BakingGIStrength);
    u_xlat16_6.xyz = _NormalTex.sample(sampler_NormalTex, float2(u_xlat16_3.xy)).xyz;
    u_xlat16_3.x = u_xlat16_6.z + u_xlat16_6.z;
    u_xlat16_7.xy = fma(u_xlat16_6.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_7.z = (-u_xlat16_7.y);
    u_xlat16_13.x = dot(u_xlat16_7.xz, u_xlat16_7.xz);
    u_xlat16_13.x = min(u_xlat16_13.x, half(1.0));
    u_xlat16_13.x = (-u_xlat16_13.x) + half(1.0);
    u_xlat16_7.w = sqrt(u_xlat16_13.x);
    u_xlat16_13.xyz = half3(fma(float3(u_xlat16_2.xyz), float3(FGlobals._TintColorHDR.xyz), UnityInstancing_ColorProps[u_xlati0 / 2]._HighlightColor.xyz));
    u_xlat16_35 = (-input.TEXCOORD2.x) + half(1.0);
    u_xlat16_17 = u_xlat16_35 * FGlobals.gLightBuffer[8].w;
    u_xlat16_35 = fma((-u_xlat16_35), FGlobals.gLightBuffer[8].w, half(1.0));
    u_xlat16_8.xyz = fma(half3(u_xlat16_17), FGlobals._NightColorHDR.xyz, half3(u_xlat16_35));
    u_xlat16_9.xyz = fma(u_xlat16_13.xyz, half3(-2.0, -2.0, -2.0), half3(1.0, 1.0, 1.0));
    u_xlat16_13.xyz = fma(half3(u_xlat16_17), u_xlat16_9.xyz, u_xlat16_13.xyz);
    u_xlat16_9.xyz = u_xlat16_8.xyz * u_xlat16_13.xyz;
    u_xlat16_35 = input.TEXCOORD5.y + (-FGlobals._SnowLevel);
    u_xlat16_35 = u_xlat16_35 / FGlobals._SnowWetness;
    u_xlat16_35 = clamp(u_xlat16_35, 0.0h, 1.0h);
    u_xlat16_17 = u_xlat16_6.z + FGlobals._SnowNoiseInvert;
    u_xlat16_3.x = fma((-u_xlat16_3.x), FGlobals._SnowNoiseInvert, u_xlat16_17);
    u_xlat16_3.x = log2(u_xlat16_3.x);
    u_xlat16_3.x = u_xlat16_3.x * FGlobals._SnowNoise;
    u_xlat16_3.x = exp2(u_xlat16_3.x);
    u_xlat16_3.x = u_xlat16_3.x * FGlobals._SnowIntensity;
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_35;
    u_xlat16_3.x = clamp(u_xlat16_3.x, 0.0h, 1.0h);
    u_xlatb0 = FGlobals._ShowSnowDirectly<half(1.0);
    u_xlat16_35 = u_xlat16_3.x * FGlobals.gLightBuffer[8].z;
    u_xlat16_3.x = (u_xlatb0) ? u_xlat16_35 : u_xlat16_3.x;
    u_xlat16_13.xyz = fma((-u_xlat16_13.xyz), u_xlat16_8.xyz, FGlobals._SnowColor.xyz);
    u_xlat16_13.xyz = fma(u_xlat16_3.xxx, u_xlat16_13.xyz, u_xlat16_9.xyz);
    u_xlat16_35 = u_xlat16_4.w + half(-1.0);
    u_xlat16_35 = fma(FGlobals._BakingAOStrength, u_xlat16_35, half(1.0));
    u_xlat16_35 = u_xlat16_2.w * u_xlat16_35;
    u_xlatb0 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_18.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_17 = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_18.x = (u_xlatb0) ? FGlobals.gLightBuffer[8].x : u_xlat16_17;
    u_xlat16_17 = dot(FGlobals._RoughnessScale.xyz, u_xlat16_18.xyz);
    u_xlat16_17 = u_xlat16_6.z * u_xlat16_17;
    u_xlat16_8.x = (-u_xlat16_3.x) + half(1.0);
    u_xlat16_3.x = fma(FGlobals._RoughnessScale.w, u_xlat16_3.x, u_xlat16_8.x);
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_17;
    u_xlat16_3.x = max(u_xlat16_3.x, half(0.119999997));
    u_xlat16_3.x = min(u_xlat16_3.x, half(1.0));
    u_xlatb0 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb0){
        u_xlat2.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat0.x = min(u_xlat2.z, 0.999000013);
        u_xlat0.x = u_xlat0.x + FGlobals.gShadowParams0[4].z;
        u_xlat0.x = (-u_xlat0.x) + 1.0;
        u_xlat10_31 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat2.xy, saturate(u_xlat0.x), level(0.0)));
        u_xlatb22.xy = (float2(1.0, 1.0)<u_xlat2.xy);
        u_xlatb22.x = u_xlatb22.y || u_xlatb22.x;
        u_xlatb6.xy = (u_xlat2.xy<float2(0.0, 0.0));
        u_xlatb32 = u_xlatb6.y || u_xlatb6.x;
        u_xlatb22.x = u_xlatb32 || u_xlatb22.x;
        u_xlat16_17 = (u_xlatb22.x) ? half(1.0) : half(0.0);
        u_xlat16_17 = half(max(float(u_xlat10_31), float(u_xlat16_17)));
        u_xlatb31 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb31){
            u_xlat2.xy = fma(u_xlat2.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_0 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat2.xy, saturate(u_xlat0.x), level(0.0)));
            u_xlatb22.xy = (float2(1.0, 1.0)<u_xlat2.xy);
            u_xlatb31 = u_xlatb22.y || u_xlatb22.x;
            u_xlatb2.xy = (u_xlat2.xy<float2(0.0, 0.0));
            u_xlatb2.x = u_xlatb2.y || u_xlatb2.x;
            u_xlatb31 = u_xlatb31 || u_xlatb2.x;
            u_xlat16_8.x = (u_xlatb31) ? half(1.0) : half(0.0);
            u_xlat16_8.x = half(max(float(u_xlat10_0), float(u_xlat16_8.x)));
            u_xlat16_17 = min(u_xlat16_17, u_xlat16_8.x);
        }
        u_xlatb0 = input.TEXCOORD0.y<-30.0;
        u_xlat16_17 = (u_xlatb0) ? half(1.0) : u_xlat16_17;
    } else {
        u_xlat16_17 = half(1.0);
    }
    u_xlat2 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat2 = fma(u_xlat2, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat2 = fma((-FGlobals.CloudSpeed), FGlobals._Time.xxxx, u_xlat2);
    u_xlat16_0.x = CloudTex.sample(samplerCloudTex, u_xlat2.xy).y;
    u_xlat16_31 = CloudTex.sample(samplerCloudTex, u_xlat2.zw).w;
    u_xlat16_8.x = u_xlat16_31 * half(0.5);
    u_xlat16_8.x = fma(u_xlat16_0.x, half(0.5), u_xlat16_8.x);
    u_xlat16_0.x = fma((-u_xlat16_8.x), u_xlat16_8.x, u_xlat16_8.x);
    u_xlat31 = fma((-float(u_xlat16_8.x)), float(u_xlat16_8.x), FGlobals.CloudParam.y);
    u_xlat16_0.x = half(1.0) / u_xlat16_0.x;
    u_xlat0.x = float(u_xlat16_0.x) * u_xlat31;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat31 = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat31;
    u_xlat0.x = fma((-u_xlat0.x), FGlobals.CloudParam.z, 1.0);
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlatb31 = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_8.x = (u_xlatb31) ? half(u_xlat0.x) : half(1.0);
    u_xlat16_17 = min(u_xlat16_17, u_xlat16_8.x);
    u_xlat2.xyz = float3(u_xlat16_13.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_8.x = dot(u_xlat16_7.xzw, u_xlat16_1.xyz);
    u_xlat16_8.x = clamp(u_xlat16_8.x, 0.0h, 1.0h);
    u_xlat16_7.x = dot(u_xlat16_7.xzw, u_xlat16_10.xyz);
    u_xlat16_7.x = clamp(u_xlat16_7.x, 0.0h, 1.0h);
    u_xlat16_0.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_8.xyz = u_xlat16_8.xxx * u_xlat16_0.xyz;
    u_xlat16_27 = fma(u_xlat16_3.x, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_7.x), u_xlat16_7.x, half(1.0));
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_3.x;
    u_xlat16_10.x = u_xlat16_3.x * u_xlat16_7.x;
    u_xlat16_0.x = fma(u_xlat16_10.x, u_xlat16_10.x, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_3.x / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_27;
    u_xlat16_0.xyz = fma(u_xlat16_0.xxx, half3(0.0399999991, 0.0399999991, 0.0399999991), u_xlat16_13.xyz);
    u_xlat16_0.xyz = u_xlat16_0.xyz * u_xlat16_8.xyz;
    u_xlat16_1.xyz = fma(u_xlat16_0.xyz, half3(u_xlat16_17), (-u_xlat16_0.xyz));
    u_xlat0.xyz = fma(FGlobals.gShadowParams0[5].zzz, float3(u_xlat16_1.xyz), float3(u_xlat16_0.xyz));
    u_xlat0.xyz = fma(u_xlat2.xyz, float3(FGlobals.gLightBuffer[9].xyz), u_xlat0.xyz);
    u_xlat16_3.xyz = half3(fma(u_xlat0.xyz, float3(u_xlat16_35), float3(u_xlat16_5.xyz)));
    output.SV_TARGET0.xyz = fma(u_xlat16_3.xyz, input.TEXCOORD7.www, input.TEXCOORD7.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
