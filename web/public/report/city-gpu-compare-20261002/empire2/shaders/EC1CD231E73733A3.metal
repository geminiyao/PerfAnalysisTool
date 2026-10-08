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
struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    float4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    float4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    float4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    float4 TEXCOORD5 [[ user(TEXCOORD5) ]] ;
    float4 TEXCOORD6 [[ user(TEXCOORD6) ]] ;
    float4 TEXCOORD7 [[ user(TEXCOORD7) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    sampler sampler_MainTex [[ sampler (0) ]],
    texture2d<float, access::sample > _MainTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float3 u_xlat0;
    float3 u_xlat1;
    u_xlat0.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD0.zw).xyz;
    u_xlat0.xyz = u_xlat0.xyz * float3(0.0666666701, 0.0666666701, 0.0666666701);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD0.xy).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD1.xy).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD1.zw).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD2.xy).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD2.zw).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD3.xy).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD3.zw).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD4.xy).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD4.zw).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD5.xy).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD5.zw).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD6.xy).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD6.zw).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, input.TEXCOORD7.xy).xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, float3(0.0666666701, 0.0666666701, 0.0666666701), u_xlat0.xyz);
    u_xlat0.xyz = max(u_xlat0.xyz, float3(0.0, 0.0, 0.0));
    u_xlat0.xyz = min(u_xlat0.xyz, float3(32.0, 32.0, 32.0));
    output.SV_Target0.xyz = half3(u_xlat0.xyz);
    output.SV_Target0.w = half(0.0);
    return output;
}
