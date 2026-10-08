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
    half4 _MainTex_TexelSize ;
    half4 _TintColorHDR ;
    half4 _RoughnessScale ;
    half _OpacityMaskClipValue ;
    half _MipScale ;
    half _VertexOcclusionIntensity ;
    half4 _SnowColor ;
    half _SnowLevel ;
    half _SnowNoise ;
    half _SnowNoiseInvert ;
    half _SnowIntensity ;
    half _SnowWetness ;
    half _SnowOcclusion ;
    half _ShowSnowDirectly ;
    float _ShadowAmount ;
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
    half3 u_xlat16_1;
    float4 u_xlat2;
    half4 u_xlat16_2;
    bool2 u_xlatb2;
    half4 u_xlat16_3;
    half3 u_xlat16_4;
    half4 u_xlat16_5;
    half3 u_xlat16_6;
    bool2 u_xlatb7;
    half u_xlat16_8;
    half u_xlat16_13;
    half3 u_xlat16_14;
    bool2 u_xlatb18;
    half2 u_xlat16_19;
    half u_xlat16_21;
    float u_xlat24;
    half u_xlat16_24;
    half u_xlat10_24;
    bool u_xlatb24;
    float u_xlat25;
    half u_xlat16_25;
    half u_xlat10_25;
    bool u_xlatb25;
    float u_xlat26;
    bool u_xlatb26;
    half u_xlat16_28;
    u_xlat16_0.x = dot(input.TEXCOORD3.xyz, input.TEXCOORD3.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * input.TEXCOORD3.xyz;
    u_xlat16_24 = dot(input.TEXCOORD4.xyz, input.TEXCOORD4.xyz);
    u_xlat16_24 = max(u_xlat16_24, half(0.00100000005));
    u_xlat16_24 = rsqrt(u_xlat16_24);
    u_xlat16_1.xyz = half3(u_xlat16_24) * input.TEXCOORD4.xyz;
    u_xlat2.x = input.TEXCOORD0.w;
    u_xlat2.y = input.TEXCOORD1.w;
    u_xlat16_3.xy = half2(fma(u_xlat2.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw)));
    u_xlat16_2 = _MainTex.sample(sampler_MainTex, float2(u_xlat16_3.xy));
    u_xlat16_4.xyz = u_xlat16_2.xyz * FGlobals._TintColorHDR.xyz;
    u_xlat16_19.xy = u_xlat16_3.xy * FGlobals._MainTex_TexelSize.zw;
    u_xlat16_5.xy = dfdx(u_xlat16_19.xy);
    u_xlat16_19.xy = dfdy(u_xlat16_19.xy);
    u_xlat16_28 = dot(u_xlat16_5.xy, u_xlat16_5.xy);
    u_xlat16_19.x = dot(u_xlat16_19.xy, u_xlat16_19.xy);
    u_xlat16_19.x = max(u_xlat16_19.x, u_xlat16_28);
    u_xlat16_19.x = log2(u_xlat16_19.x);
    u_xlat16_19.x = u_xlat16_19.x * half(0.5);
    u_xlat16_19.x = max(u_xlat16_19.x, half(0.0));
    u_xlat16_19.x = fma(u_xlat16_19.x, FGlobals._MipScale, half(1.0));
    u_xlat24 = float(u_xlat16_2.w) * float(u_xlat16_19.x);
    u_xlat16_25 = fma(u_xlat16_2.w, u_xlat16_19.x, (-FGlobals._OpacityMaskClipValue));
    u_xlat26 = dfdx(u_xlat24);
    u_xlat24 = dfdy(u_xlat24);
    u_xlat24 = abs(u_xlat24) + abs(u_xlat26);
    u_xlat24 = max(u_xlat24, 9.99999975e-05);
    u_xlat24 = float(u_xlat16_25) / u_xlat24;
    u_xlat24 = u_xlat24 + 0.5;
    u_xlat16_3 = _NormalTex.sample(sampler_NormalTex, float2(u_xlat16_3.xy));
    u_xlat16_28 = u_xlat16_3.z + u_xlat16_3.z;
    u_xlat16_5.xy = fma(u_xlat16_3.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_5.z = (-u_xlat16_5.y);
    u_xlat16_13 = dot(u_xlat16_5.xz, u_xlat16_5.xz);
    u_xlat16_13 = min(u_xlat16_13, half(1.0));
    u_xlat16_13 = (-u_xlat16_13) + half(1.0);
    u_xlat16_5.w = sqrt(u_xlat16_13);
    u_xlatb25 = half(0.0)!=FGlobals._WeatherSplitOn;
    u_xlatb26 = input.TEXCOORD20.z<input.TEXCOORD20.w;
    u_xlat16_14.yz = input.TEXCOORD20.zw * half2(0.5, 1.0);
    u_xlat16_13 = fma((-input.TEXCOORD20.z), half(0.5), half(1.0));
    u_xlat16_14.x = (u_xlatb26) ? input.TEXCOORD20.y : u_xlat16_13;
    u_xlat16_13 = dot(FGlobals._RoughnessScale.xyz, u_xlat16_14.xyz);
    u_xlat16_13 = u_xlat16_3.z * u_xlat16_13;
    u_xlatb26 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_14.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_6.x = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_14.x = (u_xlatb26) ? FGlobals.gLightBuffer[8].x : u_xlat16_6.x;
    u_xlat16_6.x = dot(FGlobals._RoughnessScale.xyz, u_xlat16_14.xyz);
    u_xlat16_6.x = u_xlat16_3.z * u_xlat16_6.x;
    u_xlat16_13 = (u_xlatb25) ? u_xlat16_13 : u_xlat16_6.x;
    u_xlat16_6.x = input.TEXCOORD5.y + (-FGlobals._SnowLevel);
    u_xlat16_6.x = u_xlat16_6.x / FGlobals._SnowWetness;
    u_xlat16_6.x = clamp(u_xlat16_6.x, 0.0h, 1.0h);
    u_xlat16_14.x = u_xlat16_3.z + FGlobals._SnowNoiseInvert;
    u_xlat16_28 = fma((-u_xlat16_28), FGlobals._SnowNoiseInvert, u_xlat16_14.x);
    u_xlat16_28 = log2(u_xlat16_28);
    u_xlat16_28 = u_xlat16_28 * FGlobals._SnowNoise;
    u_xlat16_28 = exp2(u_xlat16_28);
    u_xlat16_28 = u_xlat16_28 * FGlobals._SnowIntensity;
    u_xlat16_28 = u_xlat16_28 * u_xlat16_6.x;
    u_xlat16_6.x = log2(input.TEXCOORD2.w);
    u_xlat16_6.x = u_xlat16_6.x * FGlobals._SnowOcclusion;
    u_xlat16_6.x = exp2(u_xlat16_6.x);
    u_xlat16_28 = u_xlat16_28 * u_xlat16_6.x;
    u_xlat16_28 = clamp(u_xlat16_28, 0.0h, 1.0h);
    u_xlatb26 = FGlobals._ShowSnowDirectly<half(1.0);
    u_xlat16_6.x = u_xlat16_28 * input.TEXCOORD20.w;
    u_xlat16_14.x = u_xlat16_28 * FGlobals.gLightBuffer[8].z;
    u_xlat16_6.x = (u_xlatb25) ? u_xlat16_6.x : u_xlat16_14.x;
    u_xlat16_28 = (u_xlatb26) ? u_xlat16_6.x : u_xlat16_28;
    u_xlat16_6.x = (-u_xlat16_28) + half(1.0);
    u_xlat16_6.x = fma(FGlobals._RoughnessScale.w, u_xlat16_28, u_xlat16_6.x);
    u_xlat16_13 = u_xlat16_13 * u_xlat16_6.x;
    u_xlat16_6.xyz = fma((-u_xlat16_2.xyz), FGlobals._TintColorHDR.xyz, FGlobals._SnowColor.xyz);
    u_xlat16_4.xyz = fma(half3(u_xlat16_28), u_xlat16_6.xyz, u_xlat16_4.xyz);
    u_xlat16_28 = max(u_xlat16_13, half(0.119999997));
    u_xlat16_28 = min(u_xlat16_28, half(1.0));
    u_xlat16_13 = half(u_xlat24 + (-float(FGlobals._OpacityMaskClipValue)));
    u_xlatb24 = u_xlat16_13<half(0.0);
    if(((int(u_xlatb24) * int(0xffffffffu)))!=0){discard_fragment();}
    u_xlatb24 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb24){
        u_xlat2.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat24 = min(u_xlat2.z, 0.999000013);
        u_xlat24 = u_xlat24 + FGlobals.gShadowParams0[4].z;
        u_xlat24 = (-u_xlat24) + 1.0;
        u_xlat10_25 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat2.xy, saturate(u_xlat24), level(0.0)));
        u_xlatb18.xy = (float2(1.0, 1.0)<u_xlat2.xy);
        u_xlatb18.x = u_xlatb18.y || u_xlatb18.x;
        u_xlatb7.xy = (u_xlat2.xy<float2(0.0, 0.0));
        u_xlatb26 = u_xlatb7.y || u_xlatb7.x;
        u_xlatb18.x = u_xlatb26 || u_xlatb18.x;
        u_xlat16_13 = (u_xlatb18.x) ? half(1.0) : half(0.0);
        u_xlat16_13 = half(max(float(u_xlat10_25), float(u_xlat16_13)));
        u_xlatb25 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb25){
            u_xlat2.xy = fma(u_xlat2.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_24 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat2.xy, saturate(u_xlat24), level(0.0)));
            u_xlatb18.xy = (float2(1.0, 1.0)<u_xlat2.xy);
            u_xlatb25 = u_xlatb18.y || u_xlatb18.x;
            u_xlatb2.xy = (u_xlat2.xy<float2(0.0, 0.0));
            u_xlatb2.x = u_xlatb2.y || u_xlatb2.x;
            u_xlatb25 = u_xlatb25 || u_xlatb2.x;
            u_xlat16_6.x = (u_xlatb25) ? half(1.0) : half(0.0);
            u_xlat16_6.x = half(max(float(u_xlat10_24), float(u_xlat16_6.x)));
            u_xlat16_13 = min(u_xlat16_13, u_xlat16_6.x);
        }
        u_xlatb24 = input.TEXCOORD0.y<-30.0;
        u_xlat16_13 = (u_xlatb24) ? half(1.0) : u_xlat16_13;
    } else {
        u_xlat16_13 = half(1.0);
    }
    u_xlat2 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat2 = fma(u_xlat2, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat2 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat2);
    u_xlat16_24 = CloudTex.sample(samplerCloudTex, u_xlat2.xy).y;
    u_xlat16_25 = CloudTex.sample(samplerCloudTex, u_xlat2.zw).w;
    u_xlat16_6.x = u_xlat16_25 * half(0.5);
    u_xlat16_6.x = fma(u_xlat16_24, half(0.5), u_xlat16_6.x);
    u_xlat16_24 = fma((-u_xlat16_6.x), u_xlat16_6.x, u_xlat16_6.x);
    u_xlat25 = fma((-float(u_xlat16_6.x)), float(u_xlat16_6.x), FGlobals.CloudParam.y);
    u_xlat16_24 = half(1.0) / u_xlat16_24;
    u_xlat24 = float(u_xlat16_24) * u_xlat25;
    u_xlat24 = clamp(u_xlat24, 0.0f, 1.0f);
    u_xlat25 = fma(u_xlat24, -2.0, 3.0);
    u_xlat24 = u_xlat24 * u_xlat24;
    u_xlat24 = u_xlat24 * u_xlat25;
    u_xlat24 = fma((-u_xlat24), FGlobals.CloudParam.z, 1.0);
    u_xlat24 = clamp(u_xlat24, 0.0f, 1.0f);
    u_xlatb25 = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_6.x = (u_xlatb25) ? half(u_xlat24) : half(1.0);
    u_xlat16_13 = min(u_xlat16_13, u_xlat16_6.x);
    u_xlat2.xyz = float3(u_xlat16_4.xyz) * input.TEXCOORD8.xyz;
    u_xlat24 = FGlobals._ShadowAmount * FGlobals.gShadowParams0[5].z;
    u_xlat16_6.x = dot(u_xlat16_5.xzw, u_xlat16_1.xyz);
    u_xlat16_6.x = clamp(u_xlat16_6.x, 0.0h, 1.0h);
    u_xlat16_5.x = dot(u_xlat16_5.xzw, u_xlat16_0.xyz);
    u_xlat16_5.x = clamp(u_xlat16_5.x, 0.0h, 1.0h);
    u_xlat16_0.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_6.xyz = u_xlat16_6.xxx * u_xlat16_0.xyz;
    u_xlat16_21 = fma(u_xlat16_28, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_5.x), u_xlat16_5.x, half(1.0));
    u_xlat16_28 = u_xlat16_28 * u_xlat16_28;
    u_xlat16_8 = u_xlat16_28 * u_xlat16_5.x;
    u_xlat16_0.x = fma(u_xlat16_8, u_xlat16_8, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_28 / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_21;
    u_xlat16_0.xyz = fma(u_xlat16_0.xxx, half3(0.0399999991, 0.0399999991, 0.0399999991), u_xlat16_4.xyz);
    u_xlat16_0.xyz = u_xlat16_0.xyz * u_xlat16_6.xyz;
    u_xlat16_1.xyz = fma(u_xlat16_0.xyz, half3(u_xlat16_13), (-u_xlat16_0.xyz));
    u_xlat0.xyz = fma(float3(u_xlat24), float3(u_xlat16_1.xyz), float3(u_xlat16_0.xyz));
    u_xlat0.xyz = fma(u_xlat2.xyz, float3(FGlobals.gLightBuffer[9].xyz), u_xlat0.xyz);
    u_xlat16_4.xyz = half3(float3(u_xlat16_3.www) * u_xlat0.xyz);
    u_xlat16_28 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_28 = min(u_xlat16_28, half(1.0));
    u_xlat16_5.x = (-u_xlat16_28) + half(1.0);
    u_xlat16_28 = fma(FGlobals._VertexOcclusionIntensity, u_xlat16_5.x, u_xlat16_28);
    u_xlat16_4.xyz = half3(u_xlat16_28) * u_xlat16_4.xyz;
    output.SV_TARGET0.xyz = fma(u_xlat16_4.xyz, input.TEXCOORD7.www, input.TEXCOORD7.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
