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
    half _ExposureValue ;
    half4 _EmissiveTex_ST ;
    half4 _TintColor ;
    half4 _ExtraColor ;
    float _GLOBAL_SKILL_ALPHA ;
    float _adjustToggle ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_TARGET0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_EmissiveTex [[ sampler (0) ]],
    texture2d<half, access::sample > _EmissiveTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float2 u_xlat0;
    half4 u_xlat16_0;
    half3 u_xlat16_1;
    float u_xlat4;
    half u_xlat16_7;
    u_xlat0.x = input.TEXCOORD0.w;
    u_xlat0.y = input.TEXCOORD1.w;
    u_xlat16_1.xy = half2(fma(u_xlat0.xy, float2(FGlobals._EmissiveTex_ST.xy), float2(FGlobals._EmissiveTex_ST.zw)));
    u_xlat16_0 = _EmissiveTex.sample(sampler_EmissiveTex, float2(u_xlat16_1.xy));
    u_xlat16_1.xyz = log2(u_xlat16_0.xyz);
    u_xlat16_7 = u_xlat16_0.w * input.TEXCOORD2.w;
    u_xlat0.xy = float2(u_xlat16_7) * float2(FGlobals._adjustToggle, FGlobals._GLOBAL_SKILL_ALPHA);
    u_xlat16_1.xyz = u_xlat16_1.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_1.xyz = exp2(u_xlat16_1.xyz);
    u_xlat16_1.xyz = u_xlat16_1.xyz * FGlobals._TintColor.xyz;
    u_xlat16_1.xyz = u_xlat16_1.xyz * input.TEXCOORD2.xyz;
    u_xlat16_1.xyz = u_xlat16_1.xyz * FGlobals._ExtraColor.xyz;
    output.SV_TARGET0.xyz = u_xlat16_1.xyz / half3(FGlobals._ExposureValue);
    u_xlat4 = (-FGlobals._adjustToggle) + 1.0;
    u_xlat0.x = fma(u_xlat0.y, u_xlat4, u_xlat0.x);
    output.SV_TARGET0.w = half(u_xlat0.x);
    return output;
}
