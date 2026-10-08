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
    float4 _TransparentParam ;
    float _AlphaBlend ;
    half _ExposureValue ;
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
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _EmissiveTex [[ texture(1) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    half4 u_xlat16_0;
    float3 u_xlat1;
    half3 u_xlat16_1;
    bool2 u_xlatb1;
    float3 u_xlat2;
    bool3 u_xlatb2;
    float3 u_xlat3;
    half3 u_xlat16_4;
    half3 u_xlat16_5;
    float2 u_xlat12;
    float u_xlat18;
    bool u_xlatb18;
    half u_xlat16_22;
    u_xlat0.x = input.TEXCOORD0.w;
    u_xlat0.y = input.TEXCOORD1.w;
    u_xlat0.xy = u_xlat0.xy + float2(-0.5, -0.5);
    u_xlat12.x = FGlobals._Time.y * FGlobals._MainTexRotatorSpeed;
    u_xlat12.x = fma(FGlobals._MainTexRotator, 3.14159274, u_xlat12.x);
    u_xlat1.x = sin(u_xlat12.x);
    u_xlat2.x = cos(u_xlat12.x);
    u_xlat3.x = (-u_xlat1.x);
    u_xlat3.y = u_xlat2.x;
    u_xlat3.z = u_xlat1.x;
    u_xlat1.y = dot(u_xlat0.yx, u_xlat3.yz);
    u_xlat1.x = dot(u_xlat0.yx, u_xlat3.xy);
    u_xlat0.xy = u_xlat1.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._MainTex_ST.xy, FGlobals._MainTex_ST.zw);
    u_xlat12.xy = FGlobals._Time.yy * float2(FGlobals._MainTexOffsetX, FGlobals._MainTexOffsetY);
    u_xlat12.xy = fract(u_xlat12.xy);
    u_xlat0.xy = u_xlat12.xy + u_xlat0.xy;
    u_xlat1.xy = input.TEXCOORD9.xy / input.TEXCOORD9.ww;
    u_xlat1.xy = fma(u_xlat1.xy, FGlobals._MainTex_ST.xy, FGlobals._MainTex_ST.zw);
    u_xlat12.xy = u_xlat12.xy + u_xlat1.xy;
    u_xlat12.xy = (-u_xlat0.xy) + u_xlat12.xy;
    u_xlat0.xy = fma(float2(FGlobals._SampleMode), u_xlat12.xy, u_xlat0.xy);
    u_xlat12.xy = fract(u_xlat0.xy);
    u_xlatb1.xy = (float2(FGlobals._MainTex_Wrap)>=float2(0.5, 1.5));
    u_xlat1.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb1.xy));
    u_xlatb2.xyz = (float3(0.5, 1.5, 2.5)>=float3(FGlobals._MainTex_Wrap));
    u_xlat2.xyz = select(float3(0.0, 0.0, 0.0), float3(1.0, 1.0, 1.0), bool3(u_xlatb2.xyz));
    u_xlat1.xy = u_xlat1.xy * u_xlat2.yz;
    u_xlat12.xy = u_xlat12.xy * u_xlat1.xx;
    u_xlat12.xy = fma(u_xlat2.xx, u_xlat0.xy, u_xlat12.xy);
    u_xlat0.xy = u_xlat0.xy;
    u_xlat0.xy = clamp(u_xlat0.xy, 0.0f, 1.0f);
    u_xlat0.xy = fma(u_xlat1.yy, u_xlat0.xy, u_xlat12.xy);
    u_xlat16_1.xyz = _EmissiveTex.sample(sampler_EmissiveTex, u_xlat0.xy).xyz;
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, u_xlat0.xy);
    u_xlat16_4.xyz = log2(u_xlat16_0.xyz);
    u_xlat16_4.xyz = u_xlat16_4.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_4.xyz = exp2(u_xlat16_4.xyz);
    u_xlat0.xyz = float3(u_xlat16_4.xyz) * float3(FGlobals._MainTexIntensity);
    u_xlat2.xyz = fma(FGlobals._EmissiveColor.xyz, float3(FGlobals._EmissiveIntensity), (-u_xlat0.xyz));
    u_xlat0.xyz = fma(float3(u_xlat16_1.xyz), u_xlat2.xyz, u_xlat0.xyz);
    u_xlat0.xyz = u_xlat0.xyz * float3(input.TEXCOORD2.xyz);
    u_xlat0.xyz = float3(u_xlat16_0.www) * u_xlat0.xyz;
    u_xlat0.w = float(u_xlat16_0.w) * FGlobals._AlphaBlend;
    u_xlat0 = u_xlat0 * FGlobals._TintColor;
    u_xlat18 = u_xlat0.w * float(input.TEXCOORD2.w);
    u_xlat18 = u_xlat18 * FGlobals._FinalAlpha;
    u_xlat18 = u_xlat18 * FGlobals._TransparentParam.x;
    output.SV_Target0.w = half(u_xlat18);
    u_xlat0.xyz = u_xlat0.xyz * FGlobals._TintColor.www;
    u_xlat0.xyz = u_xlat0.xyz * float3(input.TEXCOORD2.www);
    u_xlat1.xyz = u_xlat0.xyz * u_xlat0.xyz;
    u_xlatb18 = FGlobals._SrcColorOn==half(0.0);
    u_xlat0.xyz = (bool(u_xlatb18)) ? u_xlat0.xyz : u_xlat1.xyz;
    u_xlat0.xyz = u_xlat0.xyz * FGlobals._TransparentParam.xxx;
    u_xlat0.xyz = u_xlat0.xyz * float3(FGlobals._FinalAlpha);
    u_xlat16_4.xyz = half3(u_xlat0.xyz / float3(FGlobals._ExposureValue));
    u_xlat16_5.xyz = FGlobals.gLightBuffer[11].yyy * FGlobals.gLightBuffer[12].xyz;
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(0.200000003, 0.200000003, 0.200000003);
    u_xlat16_5.xyz = log2(u_xlat16_5.xyz);
    u_xlat16_22 = half(FGlobals._AdaptionBias + 0.100000001);
    u_xlat16_22 = u_xlat16_22 * half(2.20000005);
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(u_xlat16_22);
    u_xlat16_5.xyz = exp2(u_xlat16_5.xyz);
    output.SV_Target0.xyz = u_xlat16_4.xyz * u_xlat16_5.xyz;
    return output;
}
