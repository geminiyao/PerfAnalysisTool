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
    half _OpacityMaskClipValue ;
};

struct Mtl_FragmentIn
{
    half2 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    half u_xlat16_0;
    bool u_xlatb0;
    half u_xlat16_1;
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD0.xy)).w;
    u_xlat16_1 = fma((-FGlobals._OpacityMaskClipValue), half(0.100000001), u_xlat16_0);
    u_xlatb0 = u_xlat16_1<half(0.0);
    if(((int(u_xlatb0) * int(0xffffffffu)))!=0){discard_fragment();}
    output.SV_Target0 = half4(1.0, 1.0, 1.0, 1.0);
    return output;
}
