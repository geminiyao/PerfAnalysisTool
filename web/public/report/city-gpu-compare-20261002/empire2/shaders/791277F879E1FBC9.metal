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
    float4 gPlanarShadowParams ;
    float4 gPlanarShadowCasterBiasParams ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
};

struct Mtl_FragmentOut
{
    float4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
    float mtl_Depth [[ depth(any) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float u_xlat0;
    float u_xlat1;
    float2 u_xlat2;
    output.SV_Target0 = float4(1.0, 1.0, 1.0, 1.0);
    u_xlat0 = input.TEXCOORD0.y + 100.0;
    u_xlat0 = u_xlat0 / FGlobals.gPlanarShadowParams.y;
    u_xlat1 = dfdx(u_xlat0);
    u_xlat2.x = dfdy(u_xlat0);
    u_xlat1 = max(abs(u_xlat2.x), abs(u_xlat1));
    u_xlat2.xy = max(FGlobals.gPlanarShadowCasterBiasParams.xy, float2(0.0, 0.0));
    u_xlat1 = u_xlat2.x * u_xlat1;
    u_xlat1 = min(u_xlat2.y, u_xlat1);
    output.mtl_Depth = (-u_xlat1) + u_xlat0;
    return output;
}
