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
    half _WeatherSplitOn ;
    float4 CloudSpeed ;
    float4 CloudParam ;
    float4 CloudOffset ;
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
    half4 TEXCOORD20 [[ user(TEXCOORD20) ]] ;
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
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(2) ]],
    const constant ColorPropsArray_Type* UnityInstancing_ColorProps [[ buffer(3) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_NormalTex [[ sampler (1) ]],
    sampler samplerCloudTex [[ sampler (2) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(1) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(2) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(3) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(4) ]] ,
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
    float3 u_xlat2;
    half4 u_xlat16_2;
    bool2 u_xlatb2;
    half3 u_xlat16_3;
    float4 u_xlat4;
    half3 u_xlat16_4;
    bool2 u_xlatb4;
    half4 u_xlat16_5;
    half3 u_xlat16_6;
    half3 u_xlat16_7;
    half3 u_xlat16_8;
    half3 u_xlat16_11;
    half u_xlat16_13;
    half3 u_xlat16_14;
    bool u_xlatb18;
    half u_xlat16_21;
    float u_xlat25;
    half u_xlat16_25;
    half u_xlat10_25;
    bool u_xlatb25;
    half u_xlat16_27;
    u_xlati0 = int(input.SV_InstanceID0) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlat16_8.x = dot(input.TEXCOORD3.xyz, input.TEXCOORD3.xyz);
    u_xlat16_8.x = max(u_xlat16_8.x, half(0.00100000005));
    u_xlat16_8.x = rsqrt(u_xlat16_8.x);
    u_xlat16_8.xyz = u_xlat16_8.xxx * input.TEXCOORD3.xyz;
    u_xlat16_1.x = dot(input.TEXCOORD4.xyz, input.TEXCOORD4.xyz);
    u_xlat16_1.x = max(u_xlat16_1.x, half(0.00100000005));
    u_xlat16_1.x = rsqrt(u_xlat16_1.x);
    u_xlat16_1.xyz = u_xlat16_1.xxx * input.TEXCOORD4.xyz;
    u_xlat2.x = input.TEXCOORD0.w;
    u_xlat2.y = input.TEXCOORD1.w;
    u_xlat16_3.xy = half2(fma(u_xlat2.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw)));
    u_xlati0 = u_xlati0 << 0x1;
    u_xlat16_2 = _MainTex.sample(sampler_MainTex, float2(u_xlat16_3.xy));
    u_xlat16_4.xyz = _NormalTex.sample(sampler_NormalTex, float2(u_xlat16_3.xy)).xyz;
    u_xlat16_3.x = u_xlat16_4.z + u_xlat16_4.z;
    u_xlat16_5.xy = fma(u_xlat16_4.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_5.z = (-u_xlat16_5.y);
    u_xlat16_11.x = dot(u_xlat16_5.xz, u_xlat16_5.xz);
    u_xlat16_11.x = min(u_xlat16_11.x, half(1.0));
    u_xlat16_11.x = (-u_xlat16_11.x) + half(1.0);
    u_xlat16_5.w = sqrt(u_xlat16_11.x);
    u_xlat16_11.xyz = half3(fma(float3(u_xlat16_2.xyz), float3(FGlobals._TintColorHDR.xyz), UnityInstancing_ColorProps[u_xlati0 / 2]._HighlightColor.xyz));
    u_xlat16_13 = (-input.TEXCOORD2.z) + half(1.0);
    u_xlat16_6.x = u_xlat16_13 * FGlobals.gLightBuffer[8].w;
    u_xlat16_13 = fma((-u_xlat16_13), FGlobals.gLightBuffer[8].w, half(1.0));
    u_xlat16_14.xyz = fma(u_xlat16_6.xxx, FGlobals._NightColorHDR.xyz, half3(u_xlat16_13));
    u_xlat16_7.xyz = fma(u_xlat16_11.xyz, half3(-2.0, -2.0, -2.0), half3(1.0, 1.0, 1.0));
    u_xlat16_11.xyz = fma(u_xlat16_6.xxx, u_xlat16_7.xyz, u_xlat16_11.xyz);
    u_xlat16_7.xyz = u_xlat16_14.xyz * u_xlat16_11.xyz;
    u_xlat16_13 = input.TEXCOORD5.y + (-FGlobals._SnowLevel);
    u_xlat16_13 = u_xlat16_13 / FGlobals._SnowWetness;
    u_xlat16_13 = clamp(u_xlat16_13, 0.0h, 1.0h);
    u_xlat16_6.x = u_xlat16_4.z + FGlobals._SnowNoiseInvert;
    u_xlat16_3.x = fma((-u_xlat16_3.x), FGlobals._SnowNoiseInvert, u_xlat16_6.x);
    u_xlat16_3.x = log2(u_xlat16_3.x);
    u_xlat16_3.x = u_xlat16_3.x * FGlobals._SnowNoise;
    u_xlat16_3.x = exp2(u_xlat16_3.x);
    u_xlat16_3.x = u_xlat16_3.x * FGlobals._SnowIntensity;
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_13;
    u_xlat16_3.x = clamp(u_xlat16_3.x, 0.0h, 1.0h);
    u_xlatb0 = FGlobals._ShowSnowDirectly<half(1.0);
    u_xlatb25 = half(0.0)!=FGlobals._WeatherSplitOn;
    u_xlat16_13 = u_xlat16_3.x * input.TEXCOORD20.w;
    u_xlat16_6.x = u_xlat16_3.x * FGlobals.gLightBuffer[8].z;
    u_xlat16_13 = (u_xlatb25) ? u_xlat16_13 : u_xlat16_6.x;
    u_xlat16_3.x = (u_xlatb0) ? u_xlat16_13 : u_xlat16_3.x;
    u_xlat16_11.xyz = fma((-u_xlat16_11.xyz), u_xlat16_14.xyz, FGlobals._SnowColor.xyz);
    u_xlat16_11.xyz = fma(u_xlat16_3.xxx, u_xlat16_11.xyz, u_xlat16_7.xyz);
    u_xlatb0 = input.TEXCOORD20.z<input.TEXCOORD20.w;
    u_xlat16_14.yz = input.TEXCOORD20.zw * half2(0.5, 1.0);
    u_xlat16_13 = fma((-input.TEXCOORD20.z), half(0.5), half(1.0));
    u_xlat16_14.x = (u_xlatb0) ? input.TEXCOORD20.y : u_xlat16_13;
    u_xlat16_13 = dot(FGlobals._RoughnessScale.xyz, u_xlat16_14.xyz);
    u_xlat16_13 = u_xlat16_4.z * u_xlat16_13;
    u_xlatb0 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_14.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_6.x = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_14.x = (u_xlatb0) ? FGlobals.gLightBuffer[8].x : u_xlat16_6.x;
    u_xlat16_6.x = dot(FGlobals._RoughnessScale.xyz, u_xlat16_14.xyz);
    u_xlat16_6.x = u_xlat16_4.z * u_xlat16_6.x;
    u_xlat16_13 = (u_xlatb25) ? u_xlat16_13 : u_xlat16_6.x;
    u_xlat16_6.x = (-u_xlat16_3.x) + half(1.0);
    u_xlat16_3.x = fma(FGlobals._RoughnessScale.w, u_xlat16_3.x, u_xlat16_6.x);
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_13;
    u_xlat16_3.x = max(u_xlat16_3.x, half(0.119999997));
    u_xlat16_3.x = min(u_xlat16_3.x, half(1.0));
    u_xlatb0 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb0){
        u_xlat2.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat0.x = min(u_xlat2.z, 0.999000013);
        u_xlat0.x = u_xlat0.x + FGlobals.gShadowParams0[4].z;
        u_xlat0.x = (-u_xlat0.x) + 1.0;
        u_xlat10_25 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat2.xy, saturate(u_xlat0.x), level(0.0)));
        u_xlatb4.xy = (float2(1.0, 1.0)<u_xlat2.xy);
        u_xlatb18 = u_xlatb4.y || u_xlatb4.x;
        u_xlatb4.xy = (u_xlat2.xy<float2(0.0, 0.0));
        u_xlatb4.x = u_xlatb4.y || u_xlatb4.x;
        u_xlatb18 = u_xlatb18 || u_xlatb4.x;
        u_xlat16_13 = (u_xlatb18) ? half(1.0) : half(0.0);
        u_xlat16_13 = half(max(float(u_xlat10_25), float(u_xlat16_13)));
        u_xlatb25 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb25){
            u_xlat2.xy = fma(u_xlat2.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_0 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat2.xy, saturate(u_xlat0.x), level(0.0)));
            u_xlatb4.xy = (float2(1.0, 1.0)<u_xlat2.xy);
            u_xlatb25 = u_xlatb4.y || u_xlatb4.x;
            u_xlatb2.xy = (u_xlat2.xy<float2(0.0, 0.0));
            u_xlatb2.x = u_xlatb2.y || u_xlatb2.x;
            u_xlatb25 = u_xlatb25 || u_xlatb2.x;
            u_xlat16_6.x = (u_xlatb25) ? half(1.0) : half(0.0);
            u_xlat16_6.x = half(max(float(u_xlat10_0), float(u_xlat16_6.x)));
            u_xlat16_13 = min(u_xlat16_13, u_xlat16_6.x);
        }
        u_xlatb0 = input.TEXCOORD0.y<-30.0;
        u_xlat16_13 = (u_xlatb0) ? half(1.0) : u_xlat16_13;
    } else {
        u_xlat16_13 = half(1.0);
    }
    u_xlat4 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat4 = fma(u_xlat4, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat4 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat4);
    u_xlat16_0.x = CloudTex.sample(samplerCloudTex, u_xlat4.xy).y;
    u_xlat16_25 = CloudTex.sample(samplerCloudTex, u_xlat4.zw).w;
    u_xlat16_6.x = u_xlat16_25 * half(0.5);
    u_xlat16_6.x = fma(u_xlat16_0.x, half(0.5), u_xlat16_6.x);
    u_xlat16_0.x = fma((-u_xlat16_6.x), u_xlat16_6.x, u_xlat16_6.x);
    u_xlat25 = fma((-float(u_xlat16_6.x)), float(u_xlat16_6.x), FGlobals.CloudParam.y);
    u_xlat16_0.x = half(1.0) / u_xlat16_0.x;
    u_xlat0.x = float(u_xlat16_0.x) * u_xlat25;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat25 = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat25;
    u_xlat0.x = fma((-u_xlat0.x), FGlobals.CloudParam.z, 1.0);
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlatb25 = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_6.x = (u_xlatb25) ? half(u_xlat0.x) : half(1.0);
    u_xlat16_13 = min(u_xlat16_13, u_xlat16_6.x);
    u_xlat2.xyz = float3(u_xlat16_11.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_6.x = dot(u_xlat16_5.xzw, u_xlat16_1.xyz);
    u_xlat16_6.x = clamp(u_xlat16_6.x, 0.0h, 1.0h);
    u_xlat16_5.x = dot(u_xlat16_5.xzw, u_xlat16_8.xyz);
    u_xlat16_5.x = clamp(u_xlat16_5.x, 0.0h, 1.0h);
    u_xlat16_0.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_6.xyz = u_xlat16_6.xxx * u_xlat16_0.xyz;
    u_xlat16_21 = fma(u_xlat16_3.x, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_5.x), u_xlat16_5.x, half(1.0));
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_3.x;
    u_xlat16_8.x = u_xlat16_3.x * u_xlat16_5.x;
    u_xlat16_0.x = fma(u_xlat16_8.x, u_xlat16_8.x, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_3.x / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_21;
    u_xlat16_0.xyz = fma(u_xlat16_0.xxx, half3(0.0399999991, 0.0399999991, 0.0399999991), u_xlat16_11.xyz);
    u_xlat16_0.xyz = u_xlat16_0.xyz * u_xlat16_6.xyz;
    u_xlat16_1.xyz = fma(u_xlat16_0.xyz, half3(u_xlat16_13), (-u_xlat16_0.xyz));
    u_xlat0.xyz = fma(FGlobals.gShadowParams0[5].zzz, float3(u_xlat16_1.xyz), float3(u_xlat16_0.xyz));
    u_xlat0.xyz = fma(u_xlat2.xyz, float3(FGlobals.gLightBuffer[9].xyz), u_xlat0.xyz);
    u_xlat16_3.xyz = half3(float3(u_xlat16_2.www) * u_xlat0.xyz);
    u_xlat16_27 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_27 = min(u_xlat16_27, half(1.0));
    u_xlat16_5.x = (-u_xlat16_27) + half(1.0);
    u_xlat16_27 = fma(FGlobals._VertexOcclusionIntensity, u_xlat16_5.x, u_xlat16_27);
    u_xlat16_3.xyz = half3(u_xlat16_27) * u_xlat16_3.xyz;
    output.SV_TARGET0.xyz = fma(u_xlat16_3.xyz, input.TEXCOORD7.www, input.TEXCOORD7.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
