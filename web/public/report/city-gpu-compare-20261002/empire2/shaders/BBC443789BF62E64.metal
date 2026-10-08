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
    float4 gPlanarShadowParams ;
    float4 gPlanarShadowCasterBiasParams ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
};

struct Mtl_FragmentOut
{
    float4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
    float mtl_Depth [[ depth(any) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float2 u_xlat0;
    half u_xlat16_0;
    bool u_xlatb0;
    half u_xlat16_1;
    float u_xlat2;
    float2 u_xlat4;
    u_xlat0.x = input.TEXCOORD0.w;
    u_xlat0.y = input.TEXCOORD1.w;
    u_xlat0.xy = fma(u_xlat0.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw));
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, u_xlat0.xy).w;
    u_xlat16_1 = u_xlat16_0 + half(-0.330000013);
    u_xlatb0 = u_xlat16_1<half(0.0);
    if(((int(u_xlatb0) * int(0xffffffffu)))!=0){discard_fragment();}
    output.SV_Target0 = float4(1.0, 1.0, 1.0, 1.0);
    u_xlat0.x = input.TEXCOORD0.y + 100.0;
    u_xlat0.x = u_xlat0.x / FGlobals.gPlanarShadowParams.y;
    u_xlat2 = dfdx(u_xlat0.x);
    u_xlat4.x = dfdy(u_xlat0.x);
    u_xlat2 = max(abs(u_xlat4.x), abs(u_xlat2));
    u_xlat4.xy = max(FGlobals.gPlanarShadowCasterBiasParams.xy, float2(0.0, 0.0));
    u_xlat2 = u_xlat4.x * u_xlat2;
    u_xlat2 = min(u_xlat4.y, u_xlat2);
    output.mtl_Depth = (-u_xlat2) + u_xlat0.x;
    return output;
}
