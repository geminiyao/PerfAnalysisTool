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
    float4 _PostBlurUVRect ;
    float _PostBlurAlpha ;
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
    sampler sampler_PostBlurMask [[ sampler (2) ]],
    sampler sampler_PostBlurTex [[ sampler (3) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _ColorLutTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _PostBlurTex [[ texture(2) ]] ,
    texture2d<half, access::sample > _PostBlurMask [[ texture(3) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float2 u_xlat0;
    half u_xlat16_0;
    bool2 u_xlatb0;
    half4 u_xlat16_1;
    half4 u_xlat16_2;
    half3 u_xlat16_3;
    half3 u_xlat16_4;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    half u_xlat16_7;
    float2 u_xlat10;
    half u_xlat16_16;
    u_xlat0.xy = (-FGlobals._PostBlurUVRect.xy) + FGlobals._PostBlurUVRect.zw;
    u_xlat10.xy = input.TEXCOORD0.xy + (-FGlobals._PostBlurUVRect.xy);
    u_xlat0.xy = u_xlat10.xy / u_xlat0.xy;
    u_xlat16_0 = _PostBlurMask.sample(sampler_PostBlurMask, u_xlat0.xy).w;
    u_xlat16_1.x = u_xlat16_0;
    u_xlat16_1.x = clamp(u_xlat16_1.x, 0.0h, 1.0h);
    u_xlat0.xy = (-input.TEXCOORD0.xy) + FGlobals._PostBlurUVRect.zw;
    u_xlat0.xy = u_xlat0.xy * u_xlat10.xy;
    u_xlatb0.xy = (u_xlat0.xy>=float2(0.0, 0.0));
    u_xlat0.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb0.xy));
    u_xlat0.x = u_xlat0.x * float(u_xlat16_1.x);
    u_xlat0.x = u_xlat0.y * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * FGlobals._PostBlurAlpha;
    u_xlat16_5.xyz = _PostBlurTex.sample(sampler_PostBlurTex, input.TEXCOORD0.xy).xyz;
    u_xlat16_5.xyz = fma(u_xlat16_5.xyz, half3(FGlobals._ExposureValue), half3(0.00266771927, 0.00266771927, 0.00266771927));
    u_xlat16_5.xyz = log2(u_xlat16_5.xyz);
    u_xlat16_5.xyz = fma(u_xlat16_5.xyz, half3(0.0714285746, 0.0714285746, 0.0714285746), half3(0.610726953, 0.610726953, 0.610726953));
    u_xlat16_5.xyz = clamp(u_xlat16_5.xyz, 0.0h, 1.0h);
    u_xlat16_1.yw = u_xlat16_5.zy * half2(31.0, 0.96875);
    u_xlat16_2.x = floor(u_xlat16_1.y);
    u_xlat16_1.yz = fma(u_xlat16_5.xy, half2(0.96875, 0.96875), half2(0.015625, 0.015625));
    u_xlat16_7 = fma(u_xlat16_5.z, half(31.0), (-u_xlat16_2.x));
    u_xlat16_6.x = u_xlat16_1.y + u_xlat16_2.x;
    u_xlat16_1.x = u_xlat16_6.x * half(0.03125);
    u_xlat16_6.xz = u_xlat16_1.xw + half2(0.03125, 0.015625);
    u_xlat16_5.xyz = _ColorLutTex.sample(sampler_ColorLutTex, float2(u_xlat16_1.xz)).xyz;
    u_xlat16_3.xyz = _ColorLutTex.sample(sampler_ColorLutTex, float2(u_xlat16_6.xz)).xyz;
    u_xlat16_1.xyz = (-u_xlat16_5.xyz) + u_xlat16_3.xyz;
    u_xlat16_1.xyz = fma(half3(u_xlat16_7), u_xlat16_1.xyz, u_xlat16_5.xyz);
    u_xlat16_2 = _MainTex.sample(sampler_MainTex, input.TEXCOORD0.xy);
    u_xlat16_5.xyz = fma(u_xlat16_2.xyz, half3(FGlobals._ExposureValue), half3(0.00266771927, 0.00266771927, 0.00266771927));
    output.SV_Target0.w = u_xlat16_2.w;
    u_xlat16_5.xyz = log2(u_xlat16_5.xyz);
    u_xlat16_5.xyz = fma(u_xlat16_5.xyz, half3(0.0714285746, 0.0714285746, 0.0714285746), half3(0.610726953, 0.610726953, 0.610726953));
    u_xlat16_5.xyz = clamp(u_xlat16_5.xyz, 0.0h, 1.0h);
    u_xlat16_2.yz = fma(u_xlat16_5.xy, half2(0.96875, 0.96875), half2(0.015625, 0.015625));
    u_xlat16_4.xy = u_xlat16_5.yz * half2(0.96875, 31.0);
    u_xlat16_16 = floor(u_xlat16_4.y);
    u_xlat16_2.w = u_xlat16_4.x;
    u_xlat16_4.x = u_xlat16_2.y + u_xlat16_16;
    u_xlat16_16 = fma(u_xlat16_5.z, half(31.0), (-u_xlat16_16));
    u_xlat16_2.x = u_xlat16_4.x * half(0.03125);
    u_xlat16_4.xy = u_xlat16_2.xw + half2(0.03125, 0.015625);
    u_xlat16_5.xyz = _ColorLutTex.sample(sampler_ColorLutTex, float2(u_xlat16_2.xz)).xyz;
    u_xlat16_3.xyz = _ColorLutTex.sample(sampler_ColorLutTex, float2(u_xlat16_4.xy)).xyz;
    u_xlat16_4.xyz = (-u_xlat16_5.xyz) + u_xlat16_3.xyz;
    u_xlat16_4.xyz = fma(half3(u_xlat16_16), u_xlat16_4.xyz, u_xlat16_5.xyz);
    u_xlat16_4.xyz = u_xlat16_4.xyz * half3(1.04999995, 1.04999995, 1.04999995);
    u_xlat16_1.xyz = fma(u_xlat16_1.xyz, half3(1.04999995, 1.04999995, 1.04999995), (-u_xlat16_4.xyz));
    output.SV_Target0.xyz = half3(fma(u_xlat0.xxx, float3(u_xlat16_1.xyz), float3(u_xlat16_4.xyz)));
    return output;
}
