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
    half2 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    sampler sampler_MainTex [[ sampler (0) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float u_xlat0;
    bool u_xlatb0;
    u_xlat0 = float(_MainTex.sample(sampler_MainTex, float2(input.TEXCOORD0.xy)).w);
    u_xlatb0 = 0.5<u_xlat0;
    output.SV_Target0.xyz = (bool(u_xlatb0)) ? half3(1.0, 1.0, 1.0) : half3(0.0, 0.0, 0.0);
    output.SV_Target0.w = half(1.0);
    return output;
}
