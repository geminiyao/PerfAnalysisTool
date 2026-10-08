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
};

struct Mtl_FragmentIn
{
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_ColorLutTex [[ sampler (0) ]],
    sampler sampler_MainTex [[ sampler (1) ]],
    sampler sampler_SunMergeTex [[ sampler (2) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _SunMergeTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _ColorLutTex [[ texture(2) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    half4 u_xlat16_0;
    half4 u_xlat16_1;
    half4 u_xlat16_2;
    half3 u_xlat16_3;
    half u_xlat16_6;
    u_xlat16_0 = _SunMergeTex.sample(sampler_SunMergeTex, input.TEXCOORD0.xy);
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, input.TEXCOORD0.xy);
    u_xlat16_2.xyz = fma(u_xlat16_1.xyz, u_xlat16_0.www, u_xlat16_0.xyz);
    output.SV_Target0.w = u_xlat16_1.w;
    u_xlat16_0.xyz = fma(u_xlat16_2.xyz, half3(FGlobals._ExposureValue), half3(0.00266771927, 0.00266771927, 0.00266771927));
    u_xlat16_0.xyz = log2(u_xlat16_0.xyz);
    u_xlat16_0.xyz = fma(u_xlat16_0.xyz, half3(0.0714285746, 0.0714285746, 0.0714285746), half3(0.610726953, 0.610726953, 0.610726953));
    u_xlat16_0.xyz = clamp(u_xlat16_0.xyz, 0.0h, 1.0h);
    u_xlat16_1.yw = u_xlat16_0.zy * half2(31.0, 0.96875);
    u_xlat16_2.x = floor(u_xlat16_1.y);
    u_xlat16_1.yz = fma(u_xlat16_0.xy, half2(0.96875, 0.96875), half2(0.015625, 0.015625));
    u_xlat16_6 = fma(u_xlat16_0.z, half(31.0), (-u_xlat16_2.x));
    u_xlat16_2.x = u_xlat16_1.y + u_xlat16_2.x;
    u_xlat16_1.x = u_xlat16_2.x * half(0.03125);
    u_xlat16_2.xz = u_xlat16_1.xw + half2(0.03125, 0.015625);
    u_xlat16_0.xyz = _ColorLutTex.sample(sampler_ColorLutTex, float2(u_xlat16_1.xz)).xyz;
    u_xlat16_3.xyz = _ColorLutTex.sample(sampler_ColorLutTex, float2(u_xlat16_2.xz)).xyz;
    u_xlat16_2.xzw = (-u_xlat16_0.xyz) + u_xlat16_3.xyz;
    u_xlat16_2.xyz = fma(half3(u_xlat16_6), u_xlat16_2.xzw, u_xlat16_0.xyz);
    output.SV_Target0.xyz = u_xlat16_2.xyz * half3(1.04999995, 1.04999995, 1.04999995);
    return output;
}
