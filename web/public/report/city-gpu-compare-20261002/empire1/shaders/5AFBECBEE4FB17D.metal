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
    half4 _OutlineColor ;
};

struct Mtl_FragmentIn
{
    half4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    half4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
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
    half2 u_xlat16_1;
    float u_xlat2;
    half u_xlat16_2;
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD0.xy)).x;
    u_xlat16_2 = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD0.zw)).x;
    u_xlat16_1.xy = fma(half2(u_xlat16_2), half2(-2.0, 0.0), (-half2(u_xlat16_0)));
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD1.xy)).x;
    u_xlat16_1.xy = fma(half2(u_xlat16_0), half2(-1.0, 1.0), u_xlat16_1.xy);
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD1.zw)).x;
    u_xlat16_1.xy = fma(half2(u_xlat16_0), half2(0.0, -2.0), u_xlat16_1.xy);
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD2.zw)).x;
    u_xlat16_1.xy = fma(half2(u_xlat16_0), half2(0.0, 2.0), u_xlat16_1.xy);
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD3.xy)).x;
    u_xlat16_1.xy = fma(half2(u_xlat16_0), half2(1.0, -1.0), u_xlat16_1.xy);
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD3.zw)).x;
    u_xlat16_1.xy = fma(half2(u_xlat16_0), half2(2.0, 0.0), u_xlat16_1.xy);
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD4.xy)).x;
    u_xlat16_1.xy = half2(u_xlat16_0) + u_xlat16_1.xy;
    u_xlat16_1.x = dot(u_xlat16_1.xy, u_xlat16_1.xy);
    u_xlat16_1.x = sqrt(u_xlat16_1.x);
    u_xlatb0 = u_xlat16_1.x>=half(0.200000003);
    output.SV_Target0.xyz = u_xlat16_1.xxx * FGlobals._OutlineColor.xyz;
    u_xlat2 = float(FGlobals._OutlineColor.w) * 0.699999988;
    output.SV_Target0.w = (u_xlatb0) ? half(u_xlat2) : half(0.0);
    return output;
}
