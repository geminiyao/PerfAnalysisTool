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
    half4 _LineMaskVector ;
    float OutlineBaseHeight ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    half2 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_OutlineMask [[ sampler (0) ]],
    texture2d<half, access::sample > _OutlineMask [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float u_xlat0;
    half4 u_xlat16_0;
    bool u_xlatb0;
    half u_xlat16_1;
    u_xlat16_0 = _OutlineMask.sample(sampler_OutlineMask, float2(input.TEXCOORD1.xy));
    u_xlat16_1 = dot(FGlobals._LineMaskVector, u_xlat16_0);
    u_xlat16_1 = u_xlat16_1 + half(-1.0);
    u_xlatb0 = u_xlat16_1<half(0.0);
    if(((int(u_xlatb0) * int(0xffffffffu)))!=0){discard_fragment();}
    u_xlat0 = input.TEXCOORD0.y + (-FGlobals.OutlineBaseHeight);
    u_xlatb0 = u_xlat0<0.0;
    if(((int(u_xlatb0) * int(0xffffffffu)))!=0){discard_fragment();}
    output.SV_Target0 = half4(1.0, 1.0, 1.0, 1.0);
    return output;
}
