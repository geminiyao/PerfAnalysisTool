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
    float4 _MainColor ;
    float4 _TintColor ;
    float _ColorIntensity ;
    float _AlphaBlend ;
    float4 _dissTex_ST ;
    float _Diss_EdgeSharp ;
    float _DissEdgeWidth ;
    float4 _DissEdgeColor ;
    float _Diss_Edge_Strength ;
    float _DissDirFactor ;
    float _Diss_Direction ;
};

struct Mtl_FragmentIn
{
    half4 COLOR0 [[ user(COLOR0) ]] ;
    float4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    float4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    float4 TEXCOORD5 [[ user(TEXCOORD5) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_dissTex [[ sampler (1) ]],
    sampler sampler_AlphaMask [[ sampler (2) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _AlphaMask [[ texture(1) ]] ,
    texture2d<half, access::sample > _dissTex [[ texture(2) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    float4 u_xlat1;
    half u_xlat16_1;
    float2 u_xlat2;
    half4 u_xlat16_2;
    half3 u_xlat16_3;
    float2 u_xlat4;
    half u_xlat16_4;
    float u_xlat8;
    float u_xlat13;
    u_xlat0.xy = input.TEXCOORD5.yz + float2(-0.5, -0.5);
    u_xlat8 = FGlobals._Diss_Direction * 0.0174532942;
    u_xlat1.x = sin(u_xlat8);
    u_xlat2.x = cos(u_xlat8);
    u_xlat2.y = u_xlat1.x;
    u_xlat0.x = dot(u_xlat0.xy, u_xlat2.xy);
    u_xlat0.x = u_xlat0.x + 0.5;
    u_xlat4.xy = fma(input.TEXCOORD3.zw, FGlobals._dissTex_ST.xy, FGlobals._dissTex_ST.zw);
    u_xlat16_4 = _dissTex.sample(sampler_dissTex, u_xlat4.xy).x;
    u_xlat0.x = fma(float(u_xlat16_4), u_xlat0.x, (-float(u_xlat16_4)));
    u_xlat0.x = fma(FGlobals._DissDirFactor, u_xlat0.x, float(u_xlat16_4));
    u_xlat4.x = fma(input.TEXCOORD5.x, 2.0, -1.0);
    u_xlat0.x = (-u_xlat4.x) + u_xlat0.x;
    u_xlat4.x = (-FGlobals._Diss_EdgeSharp) + 1.0;
    u_xlat4.x = fma(u_xlat4.x, 1.5, -1.0);
    u_xlat8 = (-u_xlat4.x) + u_xlat0.x;
    u_xlat0.x = u_xlat0.x + (-FGlobals._DissEdgeWidth);
    u_xlat0.x = (-u_xlat4.x) + u_xlat0.x;
    u_xlat4.x = fma(u_xlat4.x, -2.0, 1.0);
    u_xlat4.x = float(1.0) / u_xlat4.x;
    u_xlat0.x = u_xlat4.x * u_xlat0.x;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat4.x = u_xlat4.x * u_xlat8;
    u_xlat4.x = clamp(u_xlat4.x, 0.0f, 1.0f);
    u_xlat8 = fma(u_xlat4.x, -2.0, 3.0);
    u_xlat4.x = u_xlat4.x * u_xlat4.x;
    u_xlat0.y = u_xlat4.x * u_xlat8;
    u_xlat8 = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = fma((-u_xlat8), u_xlat0.x, u_xlat0.y);
    u_xlat0.x = u_xlat0.x * FGlobals._Diss_Edge_Strength;
    u_xlat0 = u_xlat0.xyxx * FGlobals._DissEdgeColor.xwyz;
    u_xlat16_3.xyz = log2(input.COLOR0.xyz);
    u_xlat16_3.xyz = u_xlat16_3.xyz * half3(0.454545468, 0.454545468, 0.454545468);
    u_xlat16_3.xyz = exp2(u_xlat16_3.xyz);
    u_xlat1.xyz = FGlobals._MainColor.xyz * FGlobals._TintColor.xyz;
    u_xlat16_2 = _MainTex.sample(sampler_MainTex, input.TEXCOORD3.xy);
    u_xlat1.xyz = u_xlat1.xyz * float3(u_xlat16_2.xyz);
    u_xlat13 = float(u_xlat16_2.w) * FGlobals._MainColor.w;
    u_xlat13 = u_xlat13 * float(input.COLOR0.w);
    u_xlat13 = u_xlat13 * FGlobals._TintColor.w;
    u_xlat1.xyz = float3(u_xlat16_3.xyz) * u_xlat1.xyz;
    u_xlat0.xzw = fma(u_xlat1.xyz, float3(FGlobals._ColorIntensity), u_xlat0.xzw);
    u_xlat16_1 = _AlphaMask.sample(sampler_AlphaMask, input.TEXCOORD4.zw).x;
    u_xlat4.x = u_xlat0.y * float(u_xlat16_1);
    u_xlat4.x = u_xlat13 * u_xlat4.x;
    u_xlat1.xyz = u_xlat4.xxx * u_xlat0.xzw;
    u_xlat1.w = u_xlat4.x * FGlobals._AlphaBlend;
    output.SV_Target0 = half4(u_xlat1);
    return output;
}
