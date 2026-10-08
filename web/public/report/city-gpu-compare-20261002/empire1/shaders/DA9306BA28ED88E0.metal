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
    half _ExposureValue ;
    float4 _MainTex_ST ;
    float4 _TintColor ;
    float _AlphaBlend ;
    float _MainTexOffsetX ;
    float _MainTexOffsetY ;
    float _MainTexRotator ;
    float _WaterSurfacePos ;
    float _GLOBAL_SKILL_ALPHA ;
    float _adjustToggle ;
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
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float3 u_xlat0;
    half4 u_xlat16_0;
    float3 u_xlat1;
    float u_xlat2;
    float3 u_xlat3;
    half3 u_xlat16_4;
    float3 u_xlat5;
    half3 u_xlat16_5;
    float u_xlat6;
    bool u_xlatb6;
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
    u_xlat16_4.xyz = log2(u_xlat16_0.xyz);
    u_xlat0.x = float(u_xlat16_0.w) * FGlobals._TintColor.w;
    u_xlat0.x = u_xlat0.x * float(input.TEXCOORD2.w);
    u_xlat16_4.xyz = u_xlat16_4.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_4.xyz = exp2(u_xlat16_4.xyz);
    u_xlat16_5.xyz = u_xlat16_4.xyz * input.TEXCOORD2.xyz;
    u_xlat5.xyz = float3(u_xlat16_5.xyz) * FGlobals._TintColor.xyz;
    u_xlat1.x = input.TEXCOORD0.y + FGlobals._WaterSurfacePos;
    u_xlat6 = u_xlat1.x * u_xlat1.x;
    u_xlat6 = rsqrt(u_xlat6);
    u_xlat1.x = u_xlat6 * u_xlat1.x;
    u_xlatb6 = 0.0<u_xlat1.x;
    u_xlat0.x = u_xlat0.x * u_xlat1.x;
    u_xlat1.xz = u_xlat0.xx * float2(FGlobals._adjustToggle, FGlobals._GLOBAL_SKILL_ALPHA);
    u_xlat0.xyz = select(float3(0.0, 0.0, 0.0), u_xlat5.xyz, bool3(bool3(u_xlatb6)));
    u_xlat15 = (-FGlobals._adjustToggle) + 1.0;
    u_xlat15 = fma(u_xlat1.z, u_xlat15, u_xlat1.x);
    u_xlat0.xyz = float3(u_xlat15) * u_xlat0.xyz;
    u_xlat15 = u_xlat15 * FGlobals._AlphaBlend;
    output.SV_TARGET0.w = half(u_xlat15);
    output.SV_TARGET0.xyz = half3(u_xlat0.xyz / float3(FGlobals._ExposureValue));
    return output;
}
