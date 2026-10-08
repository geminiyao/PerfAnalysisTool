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
    sampler sampler_SunMergeTex [[ sampler (2) ]],
    sampler sampler_PostBlurMask [[ sampler (3) ]],
    sampler sampler_PostBlurTex [[ sampler (4) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _SunMergeTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _ColorLutTex [[ texture(2) ]] ,
    texture2d<half, access::sample > _PostBlurTex [[ texture(3) ]] ,
    texture2d<half, access::sample > _PostBlurMask [[ texture(4) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float2 u_xlat0;
    half u_xlat16_0;
    bool2 u_xlatb0;
    half4 u_xlat16_1;
    half4 u_xlat16_2;
    half4 u_xlat16_3;
    half3 u_xlat16_4;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    half3 u_xlat16_8;
    half u_xlat16_9;
    half3 u_xlat16_11;
    float2 u_xlat12;
    half u_xlat16_20;
    u_xlat0.xy = (-FGlobals._PostBlurUVRect.xy) + FGlobals._PostBlurUVRect.zw;
    u_xlat12.xy = input.TEXCOORD0.xy + (-FGlobals._PostBlurUVRect.xy);
    u_xlat0.xy = u_xlat12.xy / u_xlat0.xy;
    u_xlat16_0 = _PostBlurMask.sample(sampler_PostBlurMask, u_xlat0.xy).w;
    u_xlat16_1.x = u_xlat16_0;
    u_xlat16_1.x = clamp(u_xlat16_1.x, 0.0h, 1.0h);
    u_xlat0.xy = (-input.TEXCOORD0.xy) + FGlobals._PostBlurUVRect.zw;
    u_xlat0.xy = u_xlat0.xy * u_xlat12.xy;
    u_xlatb0.xy = (u_xlat0.xy>=float2(0.0, 0.0));
    u_xlat0.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb0.xy));
    u_xlat0.x = u_xlat0.x * float(u_xlat16_1.x);
    u_xlat0.x = u_xlat0.y * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * FGlobals._PostBlurAlpha;
    u_xlat16_6.xyz = _PostBlurTex.sample(sampler_PostBlurTex, input.TEXCOORD0.xy).xyz;
    u_xlat16_1 = _SunMergeTex.sample(sampler_SunMergeTex, input.TEXCOORD0.xy);
    u_xlat16_2.xyz = fma(u_xlat16_6.xyz, u_xlat16_1.www, u_xlat16_1.xyz);
    u_xlat16_6.xyz = fma(u_xlat16_2.xyz, half3(FGlobals._ExposureValue), half3(0.00266771927, 0.00266771927, 0.00266771927));
    u_xlat16_6.xyz = log2(u_xlat16_6.xyz);
    u_xlat16_6.xyz = fma(u_xlat16_6.xyz, half3(0.0714285746, 0.0714285746, 0.0714285746), half3(0.610726953, 0.610726953, 0.610726953));
    u_xlat16_6.xyz = clamp(u_xlat16_6.xyz, 0.0h, 1.0h);
    u_xlat16_2.yw = u_xlat16_6.zy * half2(31.0, 0.96875);
    u_xlat16_3.x = floor(u_xlat16_2.y);
    u_xlat16_2.yz = fma(u_xlat16_6.xy, half2(0.96875, 0.96875), half2(0.015625, 0.015625));
    u_xlat16_9 = fma(u_xlat16_6.z, half(31.0), (-u_xlat16_3.x));
    u_xlat16_8.x = u_xlat16_2.y + u_xlat16_3.x;
    u_xlat16_2.x = u_xlat16_8.x * half(0.03125);
    u_xlat16_8.xz = u_xlat16_2.xw + half2(0.03125, 0.015625);
    u_xlat16_6.xyz = _ColorLutTex.sample(sampler_ColorLutTex, float2(u_xlat16_2.xz)).xyz;
    u_xlat16_4.xyz = _ColorLutTex.sample(sampler_ColorLutTex, float2(u_xlat16_8.xz)).xyz;
    u_xlat16_2.xyz = (-u_xlat16_6.xyz) + u_xlat16_4.xyz;
    u_xlat16_2.xyz = fma(half3(u_xlat16_9), u_xlat16_2.xyz, u_xlat16_6.xyz);
    u_xlat16_3 = _MainTex.sample(sampler_MainTex, input.TEXCOORD0.xy);
    u_xlat16_5.xyz = fma(u_xlat16_3.xyz, u_xlat16_1.www, u_xlat16_1.xyz);
    output.SV_Target0.w = u_xlat16_3.w;
    u_xlat16_6.xyz = fma(u_xlat16_5.xyz, half3(FGlobals._ExposureValue), half3(0.00266771927, 0.00266771927, 0.00266771927));
    u_xlat16_6.xyz = log2(u_xlat16_6.xyz);
    u_xlat16_6.xyz = fma(u_xlat16_6.xyz, half3(0.0714285746, 0.0714285746, 0.0714285746), half3(0.610726953, 0.610726953, 0.610726953));
    u_xlat16_6.xyz = clamp(u_xlat16_6.xyz, 0.0h, 1.0h);
    u_xlat16_1.yw = u_xlat16_6.zy * half2(31.0, 0.96875);
    u_xlat16_20 = floor(u_xlat16_1.y);
    u_xlat16_1.yz = fma(u_xlat16_6.xy, half2(0.96875, 0.96875), half2(0.015625, 0.015625));
    u_xlat16_5.x = fma(u_xlat16_6.z, half(31.0), (-u_xlat16_20));
    u_xlat16_20 = u_xlat16_1.y + u_xlat16_20;
    u_xlat16_1.x = u_xlat16_20 * half(0.03125);
    u_xlat16_11.xy = u_xlat16_1.xw + half2(0.03125, 0.015625);
    u_xlat16_6.xyz = _ColorLutTex.sample(sampler_ColorLutTex, float2(u_xlat16_1.xz)).xyz;
    u_xlat16_4.xyz = _ColorLutTex.sample(sampler_ColorLutTex, float2(u_xlat16_11.xy)).xyz;
    u_xlat16_11.xyz = (-u_xlat16_6.xyz) + u_xlat16_4.xyz;
    u_xlat16_5.xyz = fma(u_xlat16_5.xxx, u_xlat16_11.xyz, u_xlat16_6.xyz);
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(1.04999995, 1.04999995, 1.04999995);
    u_xlat16_2.xyz = fma(u_xlat16_2.xyz, half3(1.04999995, 1.04999995, 1.04999995), (-u_xlat16_5.xyz));
    output.SV_Target0.xyz = half3(fma(u_xlat0.xxx, float3(u_xlat16_2.xyz), float3(u_xlat16_5.xyz)));
    return output;
}
