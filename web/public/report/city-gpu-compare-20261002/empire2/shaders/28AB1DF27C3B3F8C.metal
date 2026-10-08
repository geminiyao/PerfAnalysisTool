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
    half4 gLightBuffer [116];
    float4 _TransparentParam ;
    float _AlphaBlend ;
    float4 _MainTex_ST ;
    float _MainTex_Wrap ;
    float4 _TintColor ;
    float _FinalAlpha ;
    float _MainTexOffsetX ;
    float _MainTexOffsetY ;
    float _MainTexRotator ;
    float _MainTexRotatorSpeed ;
    float _MainTexIntensity ;
    half _SampleMode ;
    float4 _EmissiveColor ;
    float _EmissiveIntensity ;
    float4 _AlphaMask_ST ;
    float _AlphaTex_Wrap ;
    float4 _AlphaMaskChannel ;
    float _AlphaMaskRotator ;
    float _AlphaTexOffsetX ;
    float _AlphaTexOffsetY ;
    float _AlphaMaskRotatorSpeed ;
    float _AlphaMaskIntensity ;
    half _OnlyAffectColor ;
    float _AdaptionBias ;
    half _SrcColorOn ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    float4 TEXCOORD9 [[ user(TEXCOORD9) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_EmissiveTex [[ sampler (1) ]],
    sampler sampler_AlphaMask [[ sampler (2) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _EmissiveTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _AlphaMask [[ texture(2) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float3 u_xlat0;
    half4 u_xlat16_0;
    float3 u_xlat1;
    half4 u_xlat16_1;
    float3 u_xlat2;
    half3 u_xlat16_2;
    bool3 u_xlatb2;
    half3 u_xlat16_3;
    float3 u_xlat4;
    bool2 u_xlatb4;
    float3 u_xlat5;
    bool3 u_xlatb5;
    float u_xlat6;
    float3 u_xlat7;
    float3 u_xlat8;
    float2 u_xlat16;
    float2 u_xlat17;
    bool2 u_xlatb17;
    bool u_xlatb24;
    half u_xlat16_27;
    u_xlat0.x = FGlobals._Time.y * FGlobals._MainTexRotatorSpeed;
    u_xlat0.x = fma(FGlobals._MainTexRotator, 3.14159274, u_xlat0.x);
    u_xlat1.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat2.x = (-u_xlat0.x);
    u_xlat2.y = u_xlat1.x;
    u_xlat2.z = u_xlat0.x;
    u_xlat0.x = input.TEXCOORD0.w;
    u_xlat0.y = input.TEXCOORD1.w;
    u_xlat0.xy = u_xlat0.xy + float2(-0.5, -0.5);
    u_xlat1.x = dot(u_xlat0.yx, u_xlat2.xy);
    u_xlat1.y = dot(u_xlat0.yx, u_xlat2.yz);
    u_xlat16.xy = u_xlat1.xy + float2(0.5, 0.5);
    u_xlat16.xy = fma(u_xlat16.xy, FGlobals._MainTex_ST.xy, FGlobals._MainTex_ST.zw);
    u_xlat1.xy = FGlobals._Time.yy * float2(FGlobals._MainTexOffsetX, FGlobals._MainTexOffsetY);
    u_xlat1.xy = fract(u_xlat1.xy);
    u_xlat16.xy = u_xlat16.xy + u_xlat1.xy;
    u_xlat17.xy = input.TEXCOORD9.xy / input.TEXCOORD9.ww;
    u_xlat17.xy = fma(u_xlat17.xy, FGlobals._MainTex_ST.xy, FGlobals._MainTex_ST.zw);
    u_xlat1.xy = u_xlat1.xy + u_xlat17.xy;
    u_xlat1.xy = (-u_xlat16.xy) + u_xlat1.xy;
    u_xlat16.xy = fma(float2(FGlobals._SampleMode), u_xlat1.xy, u_xlat16.xy);
    u_xlat1.xy = fract(u_xlat16.xy);
    u_xlatb17.xy = (float2(FGlobals._MainTex_Wrap)>=float2(0.5, 1.5));
    u_xlat17.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb17.xy));
    u_xlatb2.xyz = (float3(0.5, 1.5, 2.5)>=float3(FGlobals._MainTex_Wrap));
    u_xlat2.xyz = select(float3(0.0, 0.0, 0.0), float3(1.0, 1.0, 1.0), bool3(u_xlatb2.xyz));
    u_xlat17.xy = u_xlat17.xy * u_xlat2.yz;
    u_xlat1.xy = u_xlat1.xy * u_xlat17.xx;
    u_xlat1.xy = fma(u_xlat2.xx, u_xlat16.xy, u_xlat1.xy);
    u_xlat16.xy = u_xlat16.xy;
    u_xlat16.xy = clamp(u_xlat16.xy, 0.0f, 1.0f);
    u_xlat16.xy = fma(u_xlat17.yy, u_xlat16.xy, u_xlat1.xy);
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, u_xlat16.xy);
    u_xlat16_2.xyz = _EmissiveTex.sample(sampler_EmissiveTex, u_xlat16.xy).xyz;
    u_xlat16_3.xyz = log2(u_xlat16_1.xyz);
    u_xlat16_3.xyz = u_xlat16_3.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_3.xyz = exp2(u_xlat16_3.xyz);
    u_xlat1.xyz = float3(u_xlat16_3.xyz) * float3(FGlobals._MainTexIntensity);
    u_xlat4.xyz = FGlobals._Time.yyy * float3(FGlobals._AlphaMaskRotatorSpeed, FGlobals._AlphaTexOffsetX, FGlobals._AlphaTexOffsetY);
    u_xlat16.x = fma(FGlobals._AlphaMaskRotator, 3.14159274, u_xlat4.x);
    u_xlat4.xy = fract(u_xlat4.yz);
    u_xlat5.x = sin(u_xlat16.x);
    u_xlat6 = cos(u_xlat16.x);
    u_xlat7.x = (-u_xlat5.x);
    u_xlat7.y = u_xlat6;
    u_xlat7.z = u_xlat5.x;
    u_xlat5.y = dot(u_xlat0.yx, u_xlat7.yz);
    u_xlat5.x = dot(u_xlat0.yx, u_xlat7.xy);
    u_xlat0.xy = u_xlat5.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._AlphaMask_ST.xy, FGlobals._AlphaMask_ST.zw);
    u_xlat0.xy = u_xlat4.xy + u_xlat0.xy;
    u_xlat16.xy = fract(u_xlat0.xy);
    u_xlatb4.xy = (float2(FGlobals._AlphaTex_Wrap)>=float2(0.5, 1.5));
    u_xlat4.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb4.xy));
    u_xlatb5.xyz = (float3(0.5, 1.5, 2.5)>=float3(FGlobals._AlphaTex_Wrap));
    u_xlat5.xyz = select(float3(0.0, 0.0, 0.0), float3(1.0, 1.0, 1.0), bool3(u_xlatb5.xyz));
    u_xlat4.xy = u_xlat4.xy * u_xlat5.yz;
    u_xlat16.xy = u_xlat16.xy * u_xlat4.xx;
    u_xlat16.xy = fma(u_xlat5.xx, u_xlat0.xy, u_xlat16.xy);
    u_xlat0.xy = u_xlat0.xy;
    u_xlat0.xy = clamp(u_xlat0.xy, 0.0f, 1.0f);
    u_xlat0.xy = fma(u_xlat4.yy, u_xlat0.xy, u_xlat16.xy);
    u_xlat16_0 = _AlphaMask.sample(sampler_AlphaMask, u_xlat0.xy);
    u_xlat0.x = dot(float4(u_xlat16_0), FGlobals._AlphaMaskChannel);
    u_xlat8.xyz = u_xlat0.xxx * u_xlat1.xyz;
    u_xlat0.x = u_xlat0.x * float(u_xlat16_1.w);
    u_xlat0.x = u_xlat0.x * FGlobals._AlphaMaskIntensity;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat8.xyz = u_xlat8.xyz * float3(FGlobals._AlphaMaskIntensity);
    u_xlat1.xyz = fma(FGlobals._EmissiveColor.xyz, float3(FGlobals._EmissiveIntensity), (-u_xlat8.xyz));
    u_xlat8.xyz = fma(float3(u_xlat16_2.xyz), u_xlat1.xyz, u_xlat8.xyz);
    u_xlat8.xyz = u_xlat8.xyz * float3(input.TEXCOORD2.xyz);
    u_xlat1.x = (-u_xlat0.x) + 1.0;
    u_xlat0.x = fma(float(FGlobals._OnlyAffectColor), u_xlat1.x, u_xlat0.x);
    u_xlat8.xyz = u_xlat0.xxx * u_xlat8.xyz;
    u_xlat0.x = u_xlat0.x * FGlobals._AlphaBlend;
    u_xlat0.x = u_xlat0.x * FGlobals._TintColor.w;
    u_xlat0.x = u_xlat0.x * float(input.TEXCOORD2.w);
    u_xlat0.x = u_xlat0.x * FGlobals._FinalAlpha;
    u_xlat0.x = u_xlat0.x * FGlobals._TransparentParam.x;
    output.SV_Target0.w = half(u_xlat0.x);
    u_xlat0.xyz = u_xlat8.xyz * FGlobals._TintColor.xyz;
    u_xlat0.xyz = u_xlat0.xyz * FGlobals._TintColor.www;
    u_xlat0.xyz = u_xlat0.xyz * float3(input.TEXCOORD2.www);
    u_xlat1.xyz = u_xlat0.xyz * u_xlat0.xyz;
    u_xlatb24 = FGlobals._SrcColorOn==half(0.0);
    u_xlat0.xyz = (bool(u_xlatb24)) ? u_xlat0.xyz : u_xlat1.xyz;
    u_xlat0.xyz = u_xlat0.xyz * FGlobals._TransparentParam.xxx;
    u_xlat0.xyz = u_xlat0.xyz * float3(FGlobals._FinalAlpha);
    u_xlat16_3.xyz = FGlobals.gLightBuffer[11].yyy * FGlobals.gLightBuffer[12].xyz;
    u_xlat16_3.xyz = u_xlat16_3.xyz * half3(0.200000003, 0.200000003, 0.200000003);
    u_xlat16_3.xyz = log2(u_xlat16_3.xyz);
    u_xlat16_27 = half(FGlobals._AdaptionBias + 0.100000001);
    u_xlat16_27 = u_xlat16_27 * half(2.20000005);
    u_xlat16_3.xyz = u_xlat16_3.xyz * half3(u_xlat16_27);
    u_xlat16_3.xyz = exp2(u_xlat16_3.xyz);
    output.SV_Target0.xyz = half3(u_xlat0.xyz * float3(u_xlat16_3.xyz));
    return output;
}
