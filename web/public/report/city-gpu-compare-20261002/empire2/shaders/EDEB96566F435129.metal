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
    half _VignetteIntensity ;
    half3 _BloomColor ;
};

struct Mtl_FragmentIn
{
    half4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    half4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_DownTex [[ sampler (1) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _DownTex [[ texture(1) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float u_xlat0;
    half3 u_xlat16_0;
    half3 u_xlat16_1;
    half3 u_xlat16_2;
    half u_xlat16_11;
    u_xlat16_0.xyz = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD0.xy)).xyz;
    u_xlat16_1.xyz = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD1.xy)).xyz;
    u_xlat16_0.xyz = u_xlat16_0.xyz + u_xlat16_1.xyz;
    u_xlat16_1.xyz = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD1.zw)).xyz;
    u_xlat16_0.xyz = u_xlat16_0.xyz + u_xlat16_1.xyz;
    u_xlat16_1.xyz = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD2.xy)).xyz;
    u_xlat16_0.xyz = u_xlat16_0.xyz + u_xlat16_1.xyz;
    u_xlat16_1.xyz = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD2.zw)).xyz;
    u_xlat16_0.xyz = u_xlat16_0.xyz + u_xlat16_1.xyz;
    u_xlat16_1.xyz = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD3.xy)).xyz;
    u_xlat16_0.xyz = u_xlat16_0.xyz + u_xlat16_1.xyz;
    u_xlat16_1.xyz = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD3.zw)).xyz;
    u_xlat16_0.xyz = u_xlat16_0.xyz + u_xlat16_1.xyz;
    u_xlat16_2.xyz = u_xlat16_0.xyz * half3(0.142857149, 0.142857149, 0.142857149);
    u_xlat16_0.xyz = _DownTex.sample(sampler_DownTex, float2(input.TEXCOORD0.xy)).xyz;
    u_xlat16_2.xyz = fma(u_xlat16_2.xyz, FGlobals._BloomColor.xxyz.yzw, u_xlat16_0.xyz);
    u_xlat16_2.xyz = u_xlat16_2.xyz * half3(0.200000003, 0.200000003, 0.200000003);
    u_xlat16_0.xy = input.TEXCOORD0.zw * half2(FGlobals._VignetteIntensity);
    u_xlat16_0.x = dot(u_xlat16_0.xy, u_xlat16_0.xy);
    u_xlat0 = float(u_xlat16_0.x) + 1.0;
    u_xlat0 = float(1.0) / float(u_xlat0);
    u_xlat16_11 = half(u_xlat0 * u_xlat0);
    output.SV_Target0.xyz = half3(u_xlat16_11) * u_xlat16_2.xyz;
    output.SV_Target0.w = u_xlat16_11;
    return output;
}
