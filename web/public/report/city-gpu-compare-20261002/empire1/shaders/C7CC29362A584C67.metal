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
    half4 _MainTex_TexelSize ;
    half4 _BlurOffsets ;
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
    half4 u_xlat16_0;
    half4 u_xlat16_1;
    half3 u_xlat16_2;
    half3 u_xlat16_3;
    half4 u_xlat16_4;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    half3 u_xlat16_7;
    u_xlat16_0.z = half(0.0);
    u_xlat16_0.xy = FGlobals._MainTex_TexelSize.xy * FGlobals._BlurOffsets.xy;
    u_xlat16_0.w = (-u_xlat16_0.x);
    u_xlat16_1 = u_xlat16_0.wzxy + input.TEXCOORD0.xyxy;
    u_xlat16_2.xyz = _MainTex.sample(sampler_MainTex, float2(u_xlat16_1.xy)).xyz;
    u_xlat16_3.xyz = _MainTex.sample(sampler_MainTex, float2(u_xlat16_1.zw)).xyz;
    u_xlat16_1 = u_xlat16_0.xzzy + input.TEXCOORD0.xyxy;
    u_xlat16_4 = fma(u_xlat16_0.zyxy, half4(1.0, -1.0, 1.0, -1.0), input.TEXCOORD0.xyxy);
    u_xlat16_0.xy = fma(u_xlat16_0.xy, half2(-1.0, 1.0), input.TEXCOORD0.xy);
    u_xlat16_5.xyz = _MainTex.sample(sampler_MainTex, float2(u_xlat16_0.xy)).xyz;
    u_xlat16_6.xyz = _MainTex.sample(sampler_MainTex, float2(u_xlat16_1.xy)).xyz;
    u_xlat16_7.xyz = _MainTex.sample(sampler_MainTex, float2(u_xlat16_1.zw)).xyz;
    u_xlat16_2.xyz = u_xlat16_2.xyz + u_xlat16_6.xyz;
    u_xlat16_2.xyz = u_xlat16_7.xyz + u_xlat16_2.xyz;
    u_xlat16_6.xyz = _MainTex.sample(sampler_MainTex, float2(u_xlat16_4.xy)).xyz;
    u_xlat16_7.xyz = _MainTex.sample(sampler_MainTex, float2(u_xlat16_4.zw)).xyz;
    u_xlat16_2.xyz = u_xlat16_2.xyz + u_xlat16_6.xyz;
    u_xlat16_0.xyz = u_xlat16_2.xyz * half3(0.118000001, 0.118000001, 0.118000001);
    u_xlat16_2.xyz = _MainTex.sample(sampler_MainTex, float2(input.TEXCOORD0.xy)).xyz;
    u_xlat16_0.xyz = fma(u_xlat16_2.xyz, half3(0.148000002, 0.148000002, 0.148000002), u_xlat16_0.xyz);
    u_xlat16_1.xy = fma((-FGlobals._MainTex_TexelSize.xy), FGlobals._BlurOffsets.xy, input.TEXCOORD0.xy);
    u_xlat16_2.xyz = _MainTex.sample(sampler_MainTex, float2(u_xlat16_1.xy)).xyz;
    u_xlat16_2.xyz = u_xlat16_2.xyz + u_xlat16_3.xyz;
    u_xlat16_2.xyz = u_xlat16_7.xyz + u_xlat16_2.xyz;
    u_xlat16_2.xyz = u_xlat16_5.xyz + u_xlat16_2.xyz;
    output.SV_Target0.xyz = fma(u_xlat16_2.xyz, half3(0.0949999988, 0.0949999988, 0.0949999988), u_xlat16_0.xyz);
    output.SV_Target0.w = half(1.0);
    return output;
}
