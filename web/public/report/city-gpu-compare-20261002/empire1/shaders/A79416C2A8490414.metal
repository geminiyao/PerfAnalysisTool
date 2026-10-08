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
    float4 _Time ;
    float4 _MainTex_ST ;
    float4 _TintColor ;
    float4 _MainColor ;
    float _ColorIntensity ;
    float _AlphaBlend ;
    float _MainTexOffsetX ;
    float _MainTexOffsetY ;
    float _MainTexRotator ;
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
    float SV_Target1 [[ color(xlt_remap_o[1]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float3 u_xlat0;
    half4 u_xlat16_0;
    float4 u_xlat1;
    float u_xlat2;
    float3 u_xlat3;
    half3 u_xlat16_4;
    float2 u_xlat10;
    float u_xlat15;
    u_xlat0.x = input.TEXCOORD0.w;
    u_xlat0.y = input.TEXCOORD1.w;
    u_xlat0.xy = u_xlat0.xy + float2(-0.5, -0.5);
    u_xlat10.x = FGlobals._MainTexRotator * 3.14159274;
    u_xlat1.x = sin(u_xlat10.x);
    u_xlat2 = cos(u_xlat10.x);
    u_xlat3.x = (-u_xlat1.x);
    u_xlat3.y = u_xlat2;
    u_xlat3.z = u_xlat1.x;
    u_xlat1.y = dot(u_xlat0.yx, u_xlat3.yz);
    u_xlat1.x = dot(u_xlat0.yx, u_xlat3.xy);
    u_xlat0.xy = u_xlat1.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._MainTex_ST.xy, FGlobals._MainTex_ST.zw);
    u_xlat10.xy = FGlobals._Time.yy * float2(FGlobals._MainTexOffsetX, FGlobals._MainTexOffsetY);
    u_xlat10.xy = fract(u_xlat10.xy);
    u_xlat0.xy = u_xlat10.xy + u_xlat0.xy;
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, u_xlat0.xy);
    u_xlat16_4.xyz = log2(input.TEXCOORD2.xyz);
    u_xlat16_4.xyz = u_xlat16_4.xyz * half3(0.454545468, 0.454545468, 0.454545468);
    u_xlat16_4.xyz = exp2(u_xlat16_4.xyz);
    u_xlat16_0.xyz = u_xlat16_0.xyz * u_xlat16_4.xyz;
    u_xlat0.xyz = float3(u_xlat16_0.xyz) * float3(FGlobals._ColorIntensity);
    u_xlat1 = FGlobals._TintColor * FGlobals._MainColor;
    u_xlat0.xyz = u_xlat0.xyz * u_xlat1.xyz;
    u_xlat15 = float(u_xlat16_0.w) * u_xlat1.w;
    u_xlat15 = u_xlat15 * float(input.TEXCOORD2.w);
    u_xlat1.xyz = float3(u_xlat15) * u_xlat0.xyz;
    u_xlat1.w = u_xlat15 * FGlobals._AlphaBlend;
    output.SV_TARGET0 = half4(u_xlat1);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
