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
    half4 gLightBuffer [115];
    half4 PlanarReflectionPlane ;
    half4 _MainTex_ST ;
    half _ReflectionColorScale ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]] ;
};

struct Mtl_FragmentOut
{
    float4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    half3 u_xlat16_0;
    bool u_xlatb0;
    half3 u_xlat16_1;
    half2 u_xlat16_2;
    half3 u_xlat16_4;
    u_xlat0.xyz = input.TEXCOORD0.xyz;
    u_xlat0.w = -1.0;
    u_xlat16_1.x = half(dot(float4(FGlobals.PlanarReflectionPlane), u_xlat0));
    u_xlat16_1.x = u_xlat16_1.x + half(0.00999999978);
    u_xlatb0 = u_xlat16_1.x<half(0.0);
    if(((int(u_xlatb0) * int(0xffffffffu)))!=0){discard_fragment();}
    u_xlat16_0.x = dot(input.TEXCOORD3.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.0));
    u_xlat16_1.x = max(u_xlat16_0.x, half(0.200000003));
    u_xlat16_0.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_4.xyz = half3(input.TEXCOORD8.xyz * float3(FGlobals.gLightBuffer[9].xyz));
    u_xlat16_1.xyz = fma(u_xlat16_0.xyz, u_xlat16_1.xxx, u_xlat16_4.xyz);
    u_xlat0.x = input.TEXCOORD0.w;
    u_xlat0.y = input.TEXCOORD1.w;
    u_xlat16_2.xy = half2(fma(u_xlat0.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw)));
    u_xlat16_0.xyz = _MainTex.sample(sampler_MainTex, float2(u_xlat16_2.xy)).xyz;
    u_xlat16_1.xyz = u_xlat16_0.xyz * u_xlat16_1.xyz;
    u_xlat16_1.xyz = u_xlat16_1.xyz * half3(FGlobals._ReflectionColorScale);
    output.SV_Target0.xyz = float3(u_xlat16_1.xyz);
    output.SV_Target0.w = 1.0;
    return output;
}
