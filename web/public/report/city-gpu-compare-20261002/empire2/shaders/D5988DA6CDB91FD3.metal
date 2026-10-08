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
#ifndef XLT_REMAP_I
	#define XLT_REMAP_I {0, 1, 2, 3, 4, 5, 6, 7}
#endif
constexpr constant uint xlt_remap_i[] = XLT_REMAP_I;
struct FGlobals_Type
{
    float4 _ZBufferParams ;
    half4 gLightBuffer [116];
    half4 _EmissiveTex_ST ;
    half4 _TintColor ;
    half _InvFade ;
    float _AdaptionBias ;
    half4 _ExtraColor ;
    float _GLOBAL_SKILL_ALPHA ;
    float _adjustToggle ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    float4 TEXCOORD9 [[ user(TEXCOORD9) ]] ;
    float SV_Target1 [[ color(xlt_remap_i[1]) ]] ;
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
    half3 u_xlat16_0;
    float2 u_xlat1;
    half4 u_xlat16_1;
    half3 u_xlat16_2;
    float u_xlat7;
    half u_xlat16_9;
    u_xlat16_0.xyz = FGlobals.gLightBuffer[11].yyy * FGlobals.gLightBuffer[12].xyz;
    u_xlat16_0.xyz = u_xlat16_0.xyz * half3(0.200000003, 0.200000003, 0.200000003);
    u_xlat16_0.xyz = log2(u_xlat16_0.xyz);
    u_xlat16_9 = half(FGlobals._AdaptionBias + 0.100000001);
    u_xlat16_9 = u_xlat16_9 * half(2.20000005);
    u_xlat16_0.xyz = u_xlat16_0.xyz * half3(u_xlat16_9);
    u_xlat16_0.xyz = exp2(u_xlat16_0.xyz);
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat1.xy = fma(u_xlat1.xy, float2(FGlobals._EmissiveTex_ST.xy), float2(FGlobals._EmissiveTex_ST.zw));
    u_xlat16_1 = _EmissiveTex.sample(sampler_EmissiveTex, u_xlat1.xy);
    u_xlat16_2.xyz = log2(u_xlat16_1.xyz);
    u_xlat16_9 = u_xlat16_1.w * input.TEXCOORD2.w;
    u_xlat16_2.xyz = u_xlat16_2.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_2.xyz = exp2(u_xlat16_2.xyz);
    u_xlat16_0.xyz = u_xlat16_0.xyz * u_xlat16_2.xyz;
    u_xlat16_0.xyz = u_xlat16_0.xyz * FGlobals._TintColor.xyz;
    u_xlat16_0.xyz = u_xlat16_0.xyz * input.TEXCOORD2.xyz;
    output.SV_TARGET0.xyz = u_xlat16_0.xyz * FGlobals._ExtraColor.xyz;
    u_xlat1.x = fma(FGlobals._ZBufferParams.z, input.SV_Target1, FGlobals._ZBufferParams.w);
    u_xlat1.x = float(1.0) / u_xlat1.x;
    u_xlat1.x = u_xlat1.x + (-input.TEXCOORD9.z);
    u_xlat1.x = u_xlat1.x * float(FGlobals._InvFade);
    u_xlat1.x = clamp(u_xlat1.x, 0.0f, 1.0f);
    u_xlat1.x = float(u_xlat16_9) * u_xlat1.x;
    u_xlat1.xy = u_xlat1.xx * float2(FGlobals._adjustToggle, FGlobals._GLOBAL_SKILL_ALPHA);
    u_xlat7 = (-FGlobals._adjustToggle) + 1.0;
    u_xlat1.x = fma(u_xlat1.y, u_xlat7, u_xlat1.x);
    output.SV_TARGET0.w = half(u_xlat1.x);
    return output;
}
