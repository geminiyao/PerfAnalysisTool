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
    half4 _EmissiveTex_ST ;
    half _DarkAlpha ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_EmissiveTex [[ sampler (0) ]],
    texture2d<half, access::sample > _EmissiveTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float2 u_xlat0;
    half3 u_xlat16_0;
    half3 u_xlat16_1;
    u_xlat0.x = input.TEXCOORD0.w;
    u_xlat0.y = input.TEXCOORD1.w;
    u_xlat16_1.xy = half2(fma(u_xlat0.xy, float2(FGlobals._EmissiveTex_ST.xy), float2(FGlobals._EmissiveTex_ST.zw)));
    u_xlat16_0.xyz = _EmissiveTex.sample(sampler_EmissiveTex, float2(u_xlat16_1.xy)).xyz;
    u_xlat16_1.x = (-FGlobals._DarkAlpha) + half(1.0);
    u_xlat16_1.xyz = u_xlat16_0.xyz * u_xlat16_1.xxx;
    u_xlat16_1.xyz = log2(u_xlat16_1.xyz);
    u_xlat16_1.xyz = u_xlat16_1.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    output.SV_Target0.xyz = exp2(u_xlat16_1.xyz);
    output.SV_Target0.w = half(0.0);
    return output;
}
