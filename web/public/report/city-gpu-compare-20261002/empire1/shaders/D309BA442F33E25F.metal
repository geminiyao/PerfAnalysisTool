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
struct UnityPerMaterial_Type
{
    half4 _MainTex_ST ;
    half _ColorIntensity ;
    half _TextureLodBias ;
};

struct Mtl_FragmentIn
{
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    half4 TEXCOORD7 [[ user(TEXCOORD7) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_TARGET0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    half3 u_xlat16_0;
    half3 u_xlat16_1;
    u_xlat16_0.x = input.TEXCOORD3.w;
    u_xlat16_0.y = input.TEXCOORD4.w;
    u_xlat16_0.xy = fma(u_xlat16_0.xy, UnityPerMaterial._MainTex_ST.xy, UnityPerMaterial._MainTex_ST.zw);
    u_xlat16_1.xyz = _MainTex.sample(sampler_MainTex, float2(u_xlat16_0.xy)).xyz;
    u_xlat16_0.xyz = u_xlat16_1.xyz + half3(-1.0, -1.0, -1.0);
    u_xlat16_0.xyz = fma(half3(UnityPerMaterial._ColorIntensity), u_xlat16_0.xyz, half3(1.0, 1.0, 1.0));
    output.SV_TARGET0.xyz = fma(u_xlat16_0.xyz, input.TEXCOORD7.www, input.TEXCOORD7.xyz);
    output.SV_TARGET0.w = half(1.0);
    return output;
}
