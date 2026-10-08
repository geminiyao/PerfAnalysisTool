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
    half4 _Tex_HDR ;
    half4 _Tint ;
    half _Exposure ;
    float _Rotation ;
};

struct Mtl_FragmentIn
{
    float3 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
    half SV_Target1 [[ color(xlt_remap_o[1]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(0) ]],
    sampler sampler_Tex [[ sampler (0) ]],
    texturecube<half, access::sample > _Tex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    half4 u_xlat16_0;
    half3 u_xlat16_1;
    u_xlat16_0 = _Tex.sample(sampler_Tex, input.TEXCOORD0.xyz);
    u_xlat16_1.x = u_xlat16_0.w + half(-1.0);
    u_xlat16_1.x = fma(UnityPerMaterial._Tex_HDR.w, u_xlat16_1.x, half(1.0));
    u_xlat16_1.x = log2(u_xlat16_1.x);
    u_xlat16_1.x = u_xlat16_1.x * UnityPerMaterial._Tex_HDR.y;
    u_xlat16_1.x = exp2(u_xlat16_1.x);
    u_xlat16_1.x = u_xlat16_1.x * UnityPerMaterial._Tex_HDR.x;
    u_xlat16_1.xyz = u_xlat16_0.xyz * u_xlat16_1.xxx;
    u_xlat16_1.xyz = u_xlat16_1.xyz * UnityPerMaterial._Tint.xyz;
    u_xlat16_1.xyz = u_xlat16_1.xyz * half3(UnityPerMaterial._Exposure);
    output.SV_Target0.xyz = u_xlat16_1.xyz * half3(4.5947938, 4.5947938, 4.5947938);
    output.SV_Target0.w = half(1.0);
    output.SV_Target1 = half(0.0);
    return output;
}
