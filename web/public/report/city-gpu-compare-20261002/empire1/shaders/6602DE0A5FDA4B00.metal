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
    half4 gLightBuffer [115];
    half _ExposureValue ;
    float4 _MainTex_ST ;
    float4 _TintColor ;
    float _AlphaBlend ;
    float _FinalAlpha ;
    float _MainTexOffsetX ;
    float _MainTexOffsetY ;
    float _MainTexRotator ;
    float4 _TwistTex_ST ;
    float _TwistOffsetX ;
    float _TwistOffsetY ;
    float _TwistRotator ;
    float _TwistIntensity ;
    float4 _AlphaMask_ST ;
    float _AlphaMaskRotator ;
    half4 _ExtraColor ;
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
    sampler sampler_TwistTex [[ sampler (1) ]],
    sampler sampler_AlphaMask [[ sampler (2) ]],
    texture2d<half, access::sample > _TwistTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _MainTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _AlphaMask [[ texture(2) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    half3 u_xlat16_0;
    float2 u_xlat1;
    half4 u_xlat16_1;
    float3 u_xlat2;
    float3 u_xlat3;
    half3 u_xlat16_4;
    float2 u_xlat10;
    float u_xlat15;
    half u_xlat16_19;
    u_xlat0.xy = FGlobals._Time.yy * float2(FGlobals._TwistOffsetX, FGlobals._TwistOffsetY);
    u_xlat0.xy = fract(u_xlat0.xy);
    u_xlat10.x = FGlobals._TwistRotator * 3.14159274;
    u_xlat1.x = sin(u_xlat10.x);
    u_xlat2.x = cos(u_xlat10.x);
    u_xlat3.x = (-u_xlat1.x);
    u_xlat3.y = u_xlat2.x;
    u_xlat3.z = u_xlat1.x;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat10.xy = u_xlat1.xy + float2(-0.5, -0.5);
    u_xlat1.x = dot(u_xlat10.yx, u_xlat3.xy);
    u_xlat1.y = dot(u_xlat10.yx, u_xlat3.yz);
    u_xlat1.xy = u_xlat1.xy + float2(0.5, 0.5);
    u_xlat1.xy = fma(u_xlat1.xy, FGlobals._TwistTex_ST.xy, FGlobals._TwistTex_ST.zw);
    u_xlat0.xy = u_xlat0.xy + u_xlat1.xy;
    u_xlat16_0.xy = _TwistTex.sample(sampler_TwistTex, u_xlat0.xy).xy;
    u_xlat16_4.xy = fma(u_xlat16_0.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat0.x = FGlobals._MainTexRotator * 3.14159274;
    u_xlat1.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat2.x = (-u_xlat0.x);
    u_xlat2.y = u_xlat1.x;
    u_xlat2.z = u_xlat0.x;
    u_xlat0.y = dot(u_xlat10.yx, u_xlat2.yz);
    u_xlat0.x = dot(u_xlat10.yx, u_xlat2.xy);
    u_xlat0.xy = u_xlat0.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._MainTex_ST.xy, FGlobals._MainTex_ST.zw);
    u_xlat1.xy = FGlobals._Time.yy * float2(FGlobals._MainTexOffsetX, FGlobals._MainTexOffsetY);
    u_xlat1.xy = fract(u_xlat1.xy);
    u_xlat0.xy = u_xlat0.xy + u_xlat1.xy;
    u_xlat0.xy = fma(float2(u_xlat16_4.xy), float2(FGlobals._TwistIntensity), u_xlat0.xy);
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, u_xlat0.xy);
    u_xlat16_4.xyz = log2(u_xlat16_1.xyz);
    u_xlat16_4.xyz = u_xlat16_4.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_4.xyz = exp2(u_xlat16_4.xyz);
    u_xlat0.x = FGlobals._AlphaMaskRotator * 3.14159274;
    u_xlat1.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat2.x = (-u_xlat0.x);
    u_xlat2.y = u_xlat1.x;
    u_xlat2.z = u_xlat0.x;
    u_xlat0.y = dot(u_xlat10.yx, u_xlat2.yz);
    u_xlat0.x = dot(u_xlat10.yx, u_xlat2.xy);
    u_xlat0.xy = u_xlat0.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._AlphaMask_ST.xy, FGlobals._AlphaMask_ST.zw);
    u_xlat16_0.x = _AlphaMask.sample(sampler_AlphaMask, u_xlat0.xy).x;
    u_xlat16_19 = log2(u_xlat16_0.x);
    u_xlat16_19 = u_xlat16_19 * half(2.20000005);
    u_xlat16_19 = exp2(u_xlat16_19);
    u_xlat16_0.xyz = half3(u_xlat16_19) * u_xlat16_4.xyz;
    u_xlat0.w = float(u_xlat16_1.w) * float(u_xlat16_19);
    u_xlat16_0.xyz = u_xlat16_0.xyz * input.TEXCOORD2.xyz;
    u_xlat0.xyz = u_xlat0.www * float3(u_xlat16_0.xyz);
    u_xlat0 = u_xlat0 * FGlobals._TintColor;
    u_xlat15 = u_xlat0.w * float(input.TEXCOORD2.w);
    u_xlat15 = u_xlat15 * FGlobals._FinalAlpha;
    u_xlat1.xy = float2(u_xlat15) * float2(FGlobals._adjustToggle, FGlobals._GLOBAL_SKILL_ALPHA);
    u_xlat0.xyz = u_xlat0.xyz * FGlobals._TintColor.www;
    u_xlat0.xyz = u_xlat0.xyz * float3(input.TEXCOORD2.www);
    u_xlat16_4.x = FGlobals.gLightBuffer[11].y * FGlobals.gLightBuffer[12].x;
    u_xlat16_4.x = u_xlat16_4.x * half(0.166666672);
    u_xlat16_4.x = log2(u_xlat16_4.x);
    u_xlat16_4.x = u_xlat16_4.x * half(0.449999988);
    u_xlat16_4.x = exp2(u_xlat16_4.x);
    u_xlat0.xyz = u_xlat0.xyz * float3(u_xlat16_4.xxx);
    u_xlat15 = (-FGlobals._adjustToggle) + 1.0;
    u_xlat15 = fma(u_xlat1.y, u_xlat15, u_xlat1.x);
    u_xlat0.xyz = float3(u_xlat15) * u_xlat0.xyz;
    u_xlat15 = u_xlat15 * FGlobals._AlphaBlend;
    output.SV_TARGET0.w = half(u_xlat15);
    u_xlat16_4.xyz = half3(u_xlat0.xyz * float3(FGlobals._ExtraColor.xyz));
    output.SV_TARGET0.xyz = u_xlat16_4.xyz / half3(FGlobals._ExposureValue);
    return output;
}
