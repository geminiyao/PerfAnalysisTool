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
    half4 _TextureSampleAdd ;
};

struct Mtl_FragmentIn
{
    half4 COLOR0 [[ user(COLOR0) ]] ;
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    half2 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    float2 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_AlphaTex [[ sampler (1) ]],
    sampler sampler_FadeTex [[ sampler (2) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _AlphaTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _FadeTex [[ texture(2) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    half4 u_xlat16_0;
    half4 u_xlat16_1;
    half3 u_xlat16_2;
    u_xlat16_0 = _AlphaTex.sample(sampler_AlphaTex, input.TEXCOORD0.xy);
    u_xlat16_0 = u_xlat16_0 + half4(1.0, 1.0, 1.0, 0.0);
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, input.TEXCOORD0.xy);
    u_xlat16_1 = u_xlat16_1 + FGlobals._TextureSampleAdd;
    u_xlat16_0 = u_xlat16_0 + (-u_xlat16_1);
    u_xlat16_0 = fma(input.TEXCOORD2.yyyy, u_xlat16_0, u_xlat16_1);
    u_xlat16_1 = u_xlat16_0 * input.COLOR0;
    u_xlat16_2.x = dot(u_xlat16_1.xyz, half3(0.153999999, 0.494899988, 0.0496999994));
    u_xlat16_2.xyz = fma((-u_xlat16_0.xyz), input.COLOR0.xyz, u_xlat16_2.xxx);
    output.SV_Target0.xyz = fma(input.TEXCOORD2.xxx, u_xlat16_2.xyz, u_xlat16_1.xyz);
    u_xlat16_2.x = u_xlat16_1.w * half(-0.100000024);
    u_xlat16_2.x = fma(input.TEXCOORD2.x, u_xlat16_2.x, u_xlat16_1.w);
    u_xlat16_0.x = _FadeTex.sample(sampler_FadeTex, input.TEXCOORD3.xy).w;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_2.x;
    output.SV_Target0.w = u_xlat16_0.x;
    return output;
}
