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
    half _OpacityMaskClipValue ;
    half _MipScale ;
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
    half2 u_xlat16_1;
    float u_xlat2;
    half u_xlat16_3;
    float2 u_xlat4;
    half2 u_xlat16_5;
    u_xlat0.x = input.TEXCOORD0.w;
    u_xlat0.y = input.TEXCOORD1.w;
    u_xlat0.xy = fma(u_xlat0.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw));
    u_xlat16_1.xy = half2(u_xlat0.xy * float2(FGlobals._MainTex_TexelSize.zw));
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, u_xlat0.xy).w;
    u_xlat16_5.xy = dfdx(u_xlat16_1.xy);
    u_xlat16_1.xy = dfdy(u_xlat16_1.xy);
    u_xlat16_1.x = dot(u_xlat16_1.xy, u_xlat16_1.xy);
    u_xlat16_3 = dot(u_xlat16_5.xy, u_xlat16_5.xy);
    u_xlat16_1.x = max(u_xlat16_1.x, u_xlat16_3);
    u_xlat16_1.x = log2(u_xlat16_1.x);
    u_xlat16_1.x = u_xlat16_1.x * half(0.5);
    u_xlat16_1.x = max(u_xlat16_1.x, half(0.0));
    u_xlat16_1.x = fma(u_xlat16_1.x, FGlobals._MipScale, half(1.0));
    u_xlat2 = float(u_xlat16_0) * float(u_xlat16_1.x);
    u_xlat16_0 = fma(u_xlat16_0, u_xlat16_1.x, (-FGlobals._OpacityMaskClipValue));
    u_xlat4.x = dfdx(u_xlat2);
    u_xlat2 = dfdy(u_xlat2);
    u_xlat2 = abs(u_xlat2) + abs(u_xlat4.x);
    u_xlat2 = max(u_xlat2, 9.99999975e-05);
    u_xlat0.x = float(u_xlat16_0) / u_xlat2;
    u_xlat0.x = u_xlat0.x + 0.5;
    u_xlat16_1.x = half(u_xlat0.x + (-float(FGlobals._OpacityMaskClipValue)));
    u_xlatb0 = u_xlat16_1.x<half(0.0);
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
