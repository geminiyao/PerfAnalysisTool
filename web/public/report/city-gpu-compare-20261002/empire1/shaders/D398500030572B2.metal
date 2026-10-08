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
    half _Intensity ;
    half4 _TintColorHDR ;
    half4 _SecondTintColorHDR ;
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
    half4 gLightBuffer [115];
    float4 gShadowParams0 [6];
    half gShadowmapFuncEnabled ;
    half gShadowEnableDynamicShadow ;
    half _WeatherSplitOn ;
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
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_NormalTex [[ sampler (1) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(1) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(2) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(3) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_linear_clamp_compare_sampler(compare_func::greater_equal,filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float3 u_xlat0;
    half3 u_xlat16_0;
    half3 u_xlat16_1;
    float2 u_xlat2;
    half4 u_xlat16_2;
    half4 u_xlat16_3;
    float3 u_xlat4;
    half4 u_xlat16_4;
    bool2 u_xlatb4;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    float u_xlat7;
    half4 u_xlat16_7;
    bool2 u_xlatb9;
    half u_xlat16_10;
    half3 u_xlat16_13;
    half u_xlat16_15;
    half3 u_xlat16_18;
    half2 u_xlat16_23;
    bool u_xlatb24;
    half u_xlat16_25;
    float u_xlat30;
    half u_xlat16_30;
    half u_xlat10_30;
    bool u_xlatb30;
    half u_xlat16_31;
    half u_xlat10_31;
    bool u_xlatb31;
    half u_xlat16_33;
    half u_xlat16_35;
    u_xlat16_0.x = dot(input.TEXCOORD3.xyz, input.TEXCOORD3.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * input.TEXCOORD3.xyz;
    u_xlat16_30 = dot(input.TEXCOORD4.xyz, input.TEXCOORD4.xyz);
    u_xlat16_30 = max(u_xlat16_30, half(0.00100000005));
    u_xlat16_30 = rsqrt(u_xlat16_30);
    u_xlat16_1.xyz = half3(u_xlat16_30) * input.TEXCOORD4.xyz;
    u_xlat2.x = input.TEXCOORD0.w;
    u_xlat2.y = input.TEXCOORD1.w;
    u_xlat16_3.xy = half2(fma(u_xlat2.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw)));
    u_xlat16_2 = _MainTex.sample(sampler_MainTex, float2(u_xlat16_3.xy));
    u_xlat16_2 = u_xlat16_2 * half4(FGlobals._Intensity);
    u_xlat16_4 = _NormalTex.sample(sampler_NormalTex, float2(u_xlat16_3.xy));
    u_xlat16_5.xyz = (-FGlobals._TintColorHDR.xyz) + FGlobals._SecondTintColorHDR.xyz;
    u_xlat16_5.xyz = fma(u_xlat16_5.xyz, half3(0.5, 0.5, 0.5), FGlobals._TintColorHDR.xyz);
    u_xlat16_6.xyz = u_xlat16_2.xyz * u_xlat16_5.xyz;
    u_xlat16_3.xy = u_xlat16_3.xy * FGlobals._MainTex_TexelSize.zw;
    u_xlat16_23.xy = dfdx(u_xlat16_3.xy);
    u_xlat16_3.xy = dfdy(u_xlat16_3.xy);
    u_xlat16_23.x = dot(u_xlat16_23.xy, u_xlat16_23.xy);
    u_xlat16_3.x = dot(u_xlat16_3.xy, u_xlat16_3.xy);
    u_xlat16_3.x = max(u_xlat16_3.x, u_xlat16_23.x);
    u_xlat16_3.x = log2(u_xlat16_3.x);
    u_xlat16_3.x = u_xlat16_3.x * half(0.5);
    u_xlat16_3.x = max(u_xlat16_3.x, half(0.0));
    u_xlat16_3.x = fma(u_xlat16_3.x, FGlobals._MipScale, half(1.0));
    u_xlat30 = float(u_xlat16_2.w) * float(u_xlat16_3.x);
    u_xlat16_31 = fma(u_xlat16_2.w, u_xlat16_3.x, (-FGlobals._OpacityMaskClipValue));
    u_xlat7 = dfdx(u_xlat30);
    u_xlat30 = dfdy(u_xlat30);
    u_xlat30 = abs(u_xlat30) + abs(u_xlat7);
    u_xlat30 = max(u_xlat30, 9.99999975e-05);
    u_xlat30 = float(u_xlat16_31) / u_xlat30;
    u_xlat30 = u_xlat30 + 0.5;
    u_xlat16_3.x = u_xlat16_4.z + u_xlat16_4.z;
    u_xlat16_7.xy = fma(u_xlat16_4.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_7.z = (-u_xlat16_7.y);
    u_xlat16_13.x = dot(u_xlat16_7.xz, u_xlat16_7.xz);
    u_xlat16_13.x = min(u_xlat16_13.x, half(1.0));
    u_xlat16_13.x = (-u_xlat16_13.x) + half(1.0);
    u_xlat16_7.w = sqrt(u_xlat16_13.x);
    u_xlatb31 = half(0.0)!=FGlobals._WeatherSplitOn;
    u_xlatb4.x = input.TEXCOORD20.z<input.TEXCOORD20.w;
    u_xlat16_13.yz = input.TEXCOORD20.zw * half2(0.5, 1.0);
    u_xlat16_35 = fma((-input.TEXCOORD20.z), half(0.5), half(1.0));
    u_xlat16_13.x = (u_xlatb4.x) ? input.TEXCOORD20.y : u_xlat16_35;
    u_xlat16_13.x = dot(FGlobals._RoughnessScale.xyz, u_xlat16_13.xyz);
    u_xlatb4.x = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_18.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_23.x = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_18.x = (u_xlatb4.x) ? FGlobals.gLightBuffer[8].x : u_xlat16_23.x;
    u_xlat16_13.y = dot(FGlobals._RoughnessScale.xyz, u_xlat16_18.xyz);
    u_xlat16_13.xy = u_xlat16_13.xy * u_xlat16_4.zz;
    u_xlat16_13.x = (u_xlatb31) ? u_xlat16_13.x : u_xlat16_13.y;
    u_xlat16_23.x = input.TEXCOORD5.y + (-FGlobals._SnowLevel);
    u_xlat16_23.x = u_xlat16_23.x / FGlobals._SnowWetness;
    u_xlat16_23.x = clamp(u_xlat16_23.x, 0.0h, 1.0h);
    u_xlat16_33 = u_xlat16_4.z + FGlobals._SnowNoiseInvert;
    u_xlat16_3.x = fma((-u_xlat16_3.x), FGlobals._SnowNoiseInvert, u_xlat16_33);
    u_xlat16_3.x = log2(u_xlat16_3.x);
    u_xlat16_3.x = u_xlat16_3.x * FGlobals._SnowNoise;
    u_xlat16_3.x = exp2(u_xlat16_3.x);
    u_xlat16_3.x = u_xlat16_3.x * FGlobals._SnowIntensity;
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_23.x;
    u_xlat16_23.x = log2(input.TEXCOORD2.w);
    u_xlat16_23.x = u_xlat16_23.x * FGlobals._SnowOcclusion;
    u_xlat16_23.x = exp2(u_xlat16_23.x);
    u_xlat16_3.x = u_xlat16_23.x * u_xlat16_3.x;
    u_xlat16_3.x = clamp(u_xlat16_3.x, 0.0h, 1.0h);
    u_xlat16_23.x = u_xlat16_3.x * input.TEXCOORD20.w;
    u_xlat16_3.x = u_xlat16_3.x * FGlobals.gLightBuffer[8].z;
    u_xlat16_3.x = (u_xlatb31) ? u_xlat16_23.x : u_xlat16_3.x;
    u_xlat16_23.x = (-u_xlat16_3.x) + half(1.0);
    u_xlat16_23.x = fma(FGlobals._RoughnessScale.w, u_xlat16_3.x, u_xlat16_23.x);
    u_xlat16_13.x = u_xlat16_23.x * u_xlat16_13.x;
    u_xlat16_5.xyz = fma((-u_xlat16_2.xyz), u_xlat16_5.xyz, FGlobals._SnowColor.xyz);
    u_xlat16_3.xzw = fma(u_xlat16_3.xxx, u_xlat16_5.xyz, u_xlat16_6.xyz);
    u_xlat16_13.x = max(u_xlat16_13.x, half(0.119999997));
    u_xlat16_13.x = min(u_xlat16_13.x, half(1.0));
    u_xlat16_5.x = half(u_xlat30 + (-float(FGlobals._OpacityMaskClipValue)));
    u_xlatb30 = u_xlat16_5.x<half(0.0);
    if(((int(u_xlatb30) * int(0xffffffffu)))!=0){discard_fragment();}
    u_xlatb30 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb30){
        u_xlat4.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat30 = min(u_xlat4.z, 0.999000013);
        u_xlat30 = u_xlat30 + FGlobals.gShadowParams0[4].z;
        u_xlat30 = (-u_xlat30) + 1.0;
        u_xlat10_31 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat4.xy, saturate(u_xlat30), level(0.0)));
        u_xlatb9.xy = (float2(1.0, 1.0)<u_xlat4.xy);
        u_xlatb24 = u_xlatb9.y || u_xlatb9.x;
        u_xlatb9.xy = (u_xlat4.xy<float2(0.0, 0.0));
        u_xlatb9.x = u_xlatb9.y || u_xlatb9.x;
        u_xlatb24 = u_xlatb24 || u_xlatb9.x;
        u_xlat16_5.x = (u_xlatb24) ? half(1.0) : half(0.0);
        u_xlat16_5.x = half(max(float(u_xlat10_31), float(u_xlat16_5.x)));
        u_xlatb31 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb31){
            u_xlat4.xy = fma(u_xlat4.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_30 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat4.xy, saturate(u_xlat30), level(0.0)));
            u_xlatb9.xy = (float2(1.0, 1.0)<u_xlat4.xy);
            u_xlatb31 = u_xlatb9.y || u_xlatb9.x;
            u_xlatb4.xy = (u_xlat4.xy<float2(0.0, 0.0));
            u_xlatb4.x = u_xlatb4.y || u_xlatb4.x;
            u_xlatb31 = u_xlatb31 || u_xlatb4.x;
            u_xlat16_15 = (u_xlatb31) ? half(1.0) : half(0.0);
            u_xlat16_15 = half(max(float(u_xlat10_30), float(u_xlat16_15)));
            u_xlat16_5.x = min(u_xlat16_5.x, u_xlat16_15);
        }
        u_xlatb30 = input.TEXCOORD0.y<-30.0;
        u_xlat16_5.x = (u_xlatb30) ? half(1.0) : u_xlat16_5.x;
    } else {
        u_xlat16_5.x = half(1.0);
    }
    u_xlat4.xyz = float3(u_xlat16_3.xzw) * input.TEXCOORD8.xyz;
    u_xlat16_15 = dot(u_xlat16_7.xzw, u_xlat16_1.xyz);
    u_xlat16_15 = clamp(u_xlat16_15, 0.0h, 1.0h);
    u_xlat16_25 = dot(u_xlat16_7.xzw, u_xlat16_0.xyz);
    u_xlat16_25 = clamp(u_xlat16_25, 0.0h, 1.0h);
    u_xlat16_0.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_6.xyz = half3(u_xlat16_15) * u_xlat16_0.xyz;
    u_xlat16_15 = fma(u_xlat16_13.x, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_25), u_xlat16_25, half(1.0));
    u_xlat16_13.x = u_xlat16_13.x * u_xlat16_13.x;
    u_xlat16_10 = u_xlat16_13.x * u_xlat16_25;
    u_xlat16_0.x = fma(u_xlat16_10, u_xlat16_10, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_13.x / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_15;
    u_xlat16_0.xyz = fma(u_xlat16_0.xxx, half3(0.0399999991, 0.0399999991, 0.0399999991), u_xlat16_3.xzw);
    u_xlat16_0.xyz = u_xlat16_0.xyz * u_xlat16_6.xyz;
    u_xlat16_1.xyz = fma(u_xlat16_0.xyz, u_xlat16_5.xxx, (-u_xlat16_0.xyz));
    u_xlat0.xyz = fma(FGlobals.gShadowParams0[5].zzz, float3(u_xlat16_1.xyz), float3(u_xlat16_0.xyz));
    u_xlat0.xyz = fma(u_xlat4.xyz, float3(FGlobals.gLightBuffer[9].xyz), u_xlat0.xyz);
    u_xlat16_3.xyz = half3(float3(u_xlat16_4.www) * u_xlat0.xyz);
    u_xlat16_33 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_33 = min(u_xlat16_33, half(1.0));
    u_xlat16_5.x = (-u_xlat16_33) + half(1.0);
    u_xlat16_33 = fma(FGlobals._VertexOcclusionIntensity, u_xlat16_5.x, u_xlat16_33);
    u_xlat16_3.xyz = half3(u_xlat16_33) * u_xlat16_3.xyz;
    output.SV_TARGET0.xyz = fma(u_xlat16_3.xyz, input.TEXCOORD7.www, input.TEXCOORD7.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
