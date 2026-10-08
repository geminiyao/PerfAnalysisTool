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
    float4 _FXTex_ST ;
    float _FXTexOffsetX ;
    float _FXTexOffsetY ;
    float _FXTexRotator ;
    float4 _FXColor ;
    float _FXColorIntensity ;
    float _EdgeWidth ;
    float _DissolveStartOffset ;
    float _Dissolve ;
    float _DissolveEdgeColor ;
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
    sampler sampler_FXTex [[ sampler (1) ]],
    sampler sampler_TwistTex [[ sampler (2) ]],
    sampler sampler_AlphaMask [[ sampler (3) ]],
    texture2d<half, access::sample > _TwistTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _MainTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _AlphaMask [[ texture(2) ]] ,
    texture2d<half, access::sample > _FXTex [[ texture(3) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float3 u_xlat0;
    half2 u_xlat16_0;
    float4 u_xlat1;
    half4 u_xlat16_1;
    float4 u_xlat2;
    half4 u_xlat16_2;
    float3 u_xlat3;
    bool u_xlatb3;
    float3 u_xlat4;
    half3 u_xlat16_5;
    float3 u_xlat6;
    half u_xlat16_6;
    float3 u_xlat8;
    half u_xlat16_8;
    float2 u_xlat12;
    float2 u_xlat15;
    float u_xlat18;
    half u_xlat16_23;
    u_xlat0.xy = FGlobals._Time.yy * float2(FGlobals._TwistOffsetX, FGlobals._TwistOffsetY);
    u_xlat0.xy = fract(u_xlat0.xy);
    u_xlat12.x = FGlobals._TwistRotator * 3.14159274;
    u_xlat1.x = sin(u_xlat12.x);
    u_xlat2.x = cos(u_xlat12.x);
    u_xlat3.x = (-u_xlat1.x);
    u_xlat3.y = u_xlat2.x;
    u_xlat3.z = u_xlat1.x;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat12.xy = u_xlat1.xy + float2(-0.5, -0.5);
    u_xlat1.x = dot(u_xlat12.yx, u_xlat3.xy);
    u_xlat1.y = dot(u_xlat12.yx, u_xlat3.yz);
    u_xlat1.xy = u_xlat1.xy + float2(0.5, 0.5);
    u_xlat1.xy = fma(u_xlat1.xy, FGlobals._TwistTex_ST.xy, FGlobals._TwistTex_ST.zw);
    u_xlat0.xy = u_xlat0.xy + u_xlat1.xy;
    u_xlat16_0.xy = _TwistTex.sample(sampler_TwistTex, u_xlat0.xy).xy;
    u_xlat16_1 = fma(u_xlat16_0.xyxy, half4(2.0, 2.0, 2.0, 2.0), half4(-1.0, -1.0, -1.0, -1.0));
    u_xlat0.x = FGlobals._MainTexRotator * 3.14159274;
    u_xlat2.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat3.x = (-u_xlat0.x);
    u_xlat3.y = u_xlat2.x;
    u_xlat3.z = u_xlat0.x;
    u_xlat0.y = dot(u_xlat12.yx, u_xlat3.yz);
    u_xlat0.x = dot(u_xlat12.yx, u_xlat3.xy);
    u_xlat0.xy = u_xlat0.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._MainTex_ST.xy, FGlobals._MainTex_ST.zw);
    u_xlat2.xy = FGlobals._Time.yy * float2(FGlobals._MainTexOffsetX, FGlobals._MainTexOffsetY);
    u_xlat2.xy = fract(u_xlat2.xy);
    u_xlat2.xy = u_xlat0.xy + u_xlat2.xy;
    u_xlat0.x = FGlobals._FXTexRotator * 3.14159274;
    u_xlat3.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat4.x = (-u_xlat0.x);
    u_xlat4.y = u_xlat3.x;
    u_xlat4.z = u_xlat0.x;
    u_xlat15.y = dot(u_xlat12.yx, u_xlat4.yz);
    u_xlat15.x = dot(u_xlat12.yx, u_xlat4.xy);
    u_xlat0.xy = u_xlat15.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._FXTex_ST.xy, FGlobals._FXTex_ST.zw);
    u_xlat3.xy = FGlobals._Time.yy * float2(FGlobals._FXTexOffsetX, FGlobals._FXTexOffsetY);
    u_xlat3.xy = fract(u_xlat3.xy);
    u_xlat2.zw = u_xlat0.xy + u_xlat3.xy;
    u_xlat1 = fma(float4(u_xlat16_1), float4(FGlobals._TwistIntensity), u_xlat2);
    u_xlat16_2 = _MainTex.sample(sampler_MainTex, u_xlat1.xy);
    u_xlat16_0.x = _FXTex.sample(sampler_FXTex, u_xlat1.zw).x;
    u_xlat16_5.xyz = log2(u_xlat16_2.xyz);
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_5.xyz = exp2(u_xlat16_5.xyz);
    u_xlat6.x = FGlobals._AlphaMaskRotator * 3.14159274;
    u_xlat2.x = sin(u_xlat6.x);
    u_xlat3.x = cos(u_xlat6.x);
    u_xlat4.x = (-u_xlat2.x);
    u_xlat4.y = u_xlat3.x;
    u_xlat4.z = u_xlat2.x;
    u_xlat2.y = dot(u_xlat12.yx, u_xlat4.yz);
    u_xlat2.x = dot(u_xlat12.yx, u_xlat4.xy);
    u_xlat6.xy = u_xlat2.xy + float2(0.5, 0.5);
    u_xlat6.xy = fma(u_xlat6.xy, FGlobals._AlphaMask_ST.xy, FGlobals._AlphaMask_ST.zw);
    u_xlat16_6 = _AlphaMask.sample(sampler_AlphaMask, u_xlat6.xy).x;
    u_xlat16_23 = log2(u_xlat16_6);
    u_xlat16_23 = u_xlat16_23 * half(2.20000005);
    u_xlat16_23 = exp2(u_xlat16_23);
    u_xlat6.xyz = float3(u_xlat16_23) * float3(u_xlat16_5.xyz);
    u_xlat16_2.x = u_xlat16_2.w * u_xlat16_23;
    u_xlat16_8 = (-u_xlat16_0.x) + half(0.5);
    u_xlat0.x = fma(float(u_xlat16_8), FGlobals._DissolveStartOffset, float(u_xlat16_0.x));
    u_xlat0.x = u_xlat0.x + (-FGlobals._Dissolve);
    u_xlat0.x = u_xlat0.x * FGlobals._EdgeWidth;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat8.x = (-u_xlat0.x) + 1.0;
    u_xlat8.xyz = u_xlat8.xxx * FGlobals._FXColor.xyz;
    u_xlat8.xyz = fma(u_xlat8.xyz, float3(FGlobals._FXColorIntensity), u_xlat6.xyz);
    u_xlatb3 = 0.0<FGlobals._DissolveEdgeColor;
    u_xlat6.xyz = (bool(u_xlatb3)) ? u_xlat8.xyz : u_xlat6.xyz;
    u_xlat6.xyz = u_xlat0.xxx * u_xlat6.xyz;
    u_xlat0.x = u_xlat0.x * float(u_xlat16_2.x);
    u_xlat6.xyz = u_xlat6.xyz * float3(input.TEXCOORD2.xyz);
    u_xlat6.xyz = u_xlat0.xxx * u_xlat6.xyz;
    u_xlat0.x = u_xlat0.x * FGlobals._TintColor.w;
    u_xlat0.x = u_xlat0.x * float(input.TEXCOORD2.w);
    u_xlat0.x = u_xlat0.x * FGlobals._FinalAlpha;
    u_xlat2.xy = u_xlat0.xx * float2(FGlobals._adjustToggle, FGlobals._GLOBAL_SKILL_ALPHA);
    u_xlat0.xyz = u_xlat6.xyz * FGlobals._TintColor.xyz;
    u_xlat0.xyz = u_xlat0.xyz * FGlobals._TintColor.www;
    u_xlat0.xyz = u_xlat0.xyz * float3(input.TEXCOORD2.www);
    u_xlat16_5.x = FGlobals.gLightBuffer[11].y * FGlobals.gLightBuffer[12].x;
    u_xlat16_5.x = u_xlat16_5.x * half(0.166666672);
    u_xlat16_5.x = log2(u_xlat16_5.x);
    u_xlat16_5.x = u_xlat16_5.x * half(0.449999988);
    u_xlat16_5.x = exp2(u_xlat16_5.x);
    u_xlat0.xyz = u_xlat0.xyz * float3(u_xlat16_5.xxx);
    u_xlat18 = (-FGlobals._adjustToggle) + 1.0;
    u_xlat18 = fma(u_xlat2.y, u_xlat18, u_xlat2.x);
    u_xlat0.xyz = float3(u_xlat18) * u_xlat0.xyz;
    u_xlat18 = u_xlat18 * FGlobals._AlphaBlend;
    output.SV_TARGET0.w = half(u_xlat18);
    u_xlat16_5.xyz = half3(u_xlat0.xyz * float3(FGlobals._ExtraColor.xyz));
    output.SV_TARGET0.xyz = u_xlat16_5.xyz / half3(FGlobals._ExposureValue);
    return output;
}
