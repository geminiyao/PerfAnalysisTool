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
    float4 _BloomThresholdTexelSize ;
    float _BloomThreshold ;
};

struct Mtl_FragmentIn
{
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    texture2d<float, access::sample > _MainTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    float4 u_xlat1;
    float4 u_xlat2;
    float4 u_xlat3;
    float4 u_xlat4;
    float4 u_xlat5;
    float4 u_xlat6;
    float4 u_xlat7;
    float4 u_xlat8;
    float4 u_xlat9;
    float2 u_xlat20;
    float2 u_xlat21;
    u_xlat0 = fma(input.TEXCOORD0.xyxy, FGlobals._BloomThresholdTexelSize.zwzw, float4(-0.5, -0.5, -1.5, -1.5));
    u_xlat20.xy = floor(u_xlat0.zw);
    u_xlat0.xy = fract(u_xlat0.xy);
    u_xlat1.xy = u_xlat20.xy + float2(1.0, 1.0);
    u_xlat1.xy = max(u_xlat1.xy, float2(0.0, 0.0));
    u_xlat21.xy = FGlobals._BloomThresholdTexelSize.zw + float2(-1.0, -1.0);
    u_xlat1.xy = min(u_xlat21.xy, u_xlat1.xy);
    u_xlat1.xy = u_xlat1.xy + float2(0.5, 0.5);
    u_xlat1.xy = u_xlat1.xy * FGlobals._BloomThresholdTexelSize.xy;
    u_xlat2.xyz = _MainTex.sample(sampler_MainTex, u_xlat1.xy, level(0.0)).xyz;
    u_xlat2.xyz = max(u_xlat2.xyz, float3(0.0, 0.0, 0.0));
    u_xlat1.x = dot(u_xlat2.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat1.x = u_xlat1.x + (-FGlobals._BloomThreshold);
    u_xlat3.w = u_xlat1.x * 0.5;
    u_xlat3.w = clamp(u_xlat3.w, 0.0f, 1.0f);
    u_xlat3.xyz = u_xlat2.xyz * u_xlat3.www;
    u_xlat2 = u_xlat20.xyxy + float4(1.0, 0.0, 0.0, 1.0);
    u_xlat20.xy = max(u_xlat20.xy, float2(0.0, 0.0));
    u_xlat20.xy = min(u_xlat21.xy, u_xlat20.xy);
    u_xlat20.xy = u_xlat20.xy + float2(0.5, 0.5);
    u_xlat20.xy = u_xlat20.xy * FGlobals._BloomThresholdTexelSize.xy;
    u_xlat4.xyz = _MainTex.sample(sampler_MainTex, u_xlat20.xy, level(0.0)).xyz;
    u_xlat4.xyz = max(u_xlat4.xyz, float3(0.0, 0.0, 0.0));
    u_xlat2 = max(u_xlat2, float4(0.0, 0.0, 0.0, 0.0));
    u_xlat2 = min(u_xlat21.xyxy, u_xlat2);
    u_xlat2 = u_xlat2 + float4(0.5, 0.5, 0.5, 0.5);
    u_xlat2 = u_xlat2 * FGlobals._BloomThresholdTexelSize.xyxy;
    u_xlat5.xyz = _MainTex.sample(sampler_MainTex, u_xlat2.zw, level(0.0)).xyz;
    u_xlat2.xyz = _MainTex.sample(sampler_MainTex, u_xlat2.xy, level(0.0)).xyz;
    u_xlat2.xyz = max(u_xlat2.xyz, float3(0.0, 0.0, 0.0));
    u_xlat5.xyz = max(u_xlat5.xyz, float3(0.0, 0.0, 0.0));
    u_xlat20.x = dot(u_xlat5.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat6.w = u_xlat20.x * 0.5;
    u_xlat6.w = clamp(u_xlat6.w, 0.0f, 1.0f);
    u_xlat6.xyz = u_xlat5.xyz * u_xlat6.www;
    u_xlat3 = u_xlat3 + (-u_xlat6);
    u_xlat3 = fma(u_xlat0.xxxx, u_xlat3, u_xlat6);
    u_xlat20.x = dot(u_xlat2.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat5.w = u_xlat20.x * 0.5;
    u_xlat5.w = clamp(u_xlat5.w, 0.0f, 1.0f);
    u_xlat5.xyz = u_xlat2.xyz * u_xlat5.www;
    u_xlat20.x = dot(u_xlat4.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat2.w = u_xlat20.x * 0.5;
    u_xlat2.w = clamp(u_xlat2.w, 0.0f, 1.0f);
    u_xlat2.xyz = u_xlat2.www * u_xlat4.xyz;
    u_xlat4 = (-u_xlat2) + u_xlat5;
    u_xlat2 = fma(u_xlat0.xxxx, u_xlat4, u_xlat2);
    u_xlat3 = (-u_xlat2) + u_xlat3;
    u_xlat2 = fma(u_xlat0.yyyy, u_xlat3, u_xlat2);
    u_xlat3 = fma(input.TEXCOORD0.xyxy, FGlobals._BloomThresholdTexelSize.zwzw, float4(0.5, -1.5, -1.5, 0.5));
    u_xlat3 = floor(u_xlat3);
    u_xlat4 = u_xlat3 + float4(1.0, 1.0, 1.0, 0.0);
    u_xlat4 = max(u_xlat4, float4(0.0, 0.0, 0.0, 0.0));
    u_xlat4 = min(u_xlat21.xyxy, u_xlat4);
    u_xlat4 = u_xlat4 + float4(0.5, 0.5, 0.5, 0.5);
    u_xlat4 = u_xlat4 * FGlobals._BloomThresholdTexelSize.xyxy;
    u_xlat5.xyz = _MainTex.sample(sampler_MainTex, u_xlat4.xy, level(0.0)).xyz;
    u_xlat4.xyz = _MainTex.sample(sampler_MainTex, u_xlat4.zw, level(0.0)).xyz;
    u_xlat4.xyz = max(u_xlat4.xyz, float3(0.0, 0.0, 0.0));
    u_xlat5.xyz = max(u_xlat5.xyz, float3(0.0, 0.0, 0.0));
    u_xlat20.x = dot(u_xlat5.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat6.w = u_xlat20.x * 0.5;
    u_xlat6.w = clamp(u_xlat6.w, 0.0f, 1.0f);
    u_xlat6.xyz = u_xlat5.xyz * u_xlat6.www;
    u_xlat5 = u_xlat3.xyxy + float4(1.0, 0.0, 0.0, 1.0);
    u_xlat5 = max(u_xlat5, float4(0.0, 0.0, 0.0, 0.0));
    u_xlat5 = min(u_xlat21.xyxy, u_xlat5);
    u_xlat5 = u_xlat5 + float4(0.5, 0.5, 0.5, 0.5);
    u_xlat5 = u_xlat5 * FGlobals._BloomThresholdTexelSize.xyxy;
    u_xlat7.xyz = _MainTex.sample(sampler_MainTex, u_xlat5.zw, level(0.0)).xyz;
    u_xlat5.xyz = _MainTex.sample(sampler_MainTex, u_xlat5.xy, level(0.0)).xyz;
    u_xlat5.xyz = max(u_xlat5.xyz, float3(0.0, 0.0, 0.0));
    u_xlat7.xyz = max(u_xlat7.xyz, float3(0.0, 0.0, 0.0));
    u_xlat20.x = dot(u_xlat7.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat8.w = u_xlat20.x * 0.5;
    u_xlat8.w = clamp(u_xlat8.w, 0.0f, 1.0f);
    u_xlat8.xyz = u_xlat7.xyz * u_xlat8.www;
    u_xlat6 = u_xlat6 + (-u_xlat8);
    u_xlat6 = fma(u_xlat0.xxxx, u_xlat6, u_xlat8);
    u_xlat20.x = dot(u_xlat5.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat7.w = u_xlat20.x * 0.5;
    u_xlat7.w = clamp(u_xlat7.w, 0.0f, 1.0f);
    u_xlat7.xyz = u_xlat5.xyz * u_xlat7.www;
    u_xlat5 = max(u_xlat3, float4(0.0, 0.0, 0.0, 0.0));
    u_xlat3 = u_xlat3.zwzw + float4(0.0, 1.0, 1.0, 1.0);
    u_xlat3 = max(u_xlat3, float4(0.0, 0.0, 0.0, 0.0));
    u_xlat3 = min(u_xlat21.xyxy, u_xlat3);
    u_xlat3 = u_xlat3 + float4(0.5, 0.5, 0.5, 0.5);
    u_xlat3 = u_xlat3 * FGlobals._BloomThresholdTexelSize.xyxy;
    u_xlat5 = min(u_xlat21.xyxy, u_xlat5);
    u_xlat5 = u_xlat5 + float4(0.5, 0.5, 0.5, 0.5);
    u_xlat5 = u_xlat5 * FGlobals._BloomThresholdTexelSize.xyxy;
    u_xlat8.xyz = _MainTex.sample(sampler_MainTex, u_xlat5.xy, level(0.0)).xyz;
    u_xlat5.xyz = _MainTex.sample(sampler_MainTex, u_xlat5.zw, level(0.0)).xyz;
    u_xlat5.xyz = max(u_xlat5.xyz, float3(0.0, 0.0, 0.0));
    u_xlat8.xyz = max(u_xlat8.xyz, float3(0.0, 0.0, 0.0));
    u_xlat20.x = dot(u_xlat8.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat9.w = u_xlat20.x * 0.5;
    u_xlat9.w = clamp(u_xlat9.w, 0.0f, 1.0f);
    u_xlat9.xyz = u_xlat8.xyz * u_xlat9.www;
    u_xlat7 = u_xlat7 + (-u_xlat9);
    u_xlat7 = fma(u_xlat0.xxxx, u_xlat7, u_xlat9);
    u_xlat6 = u_xlat6 + (-u_xlat7);
    u_xlat6 = fma(u_xlat0.yyyy, u_xlat6, u_xlat7);
    u_xlat2 = u_xlat2 + u_xlat6;
    u_xlat20.x = dot(u_xlat4.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat6.w = u_xlat20.x * 0.5;
    u_xlat6.w = clamp(u_xlat6.w, 0.0f, 1.0f);
    u_xlat6.xyz = u_xlat4.xyz * u_xlat6.www;
    u_xlat20.x = dot(u_xlat5.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat4.w = u_xlat20.x * 0.5;
    u_xlat4.w = clamp(u_xlat4.w, 0.0f, 1.0f);
    u_xlat4.xyz = u_xlat4.www * u_xlat5.xyz;
    u_xlat5 = (-u_xlat4) + u_xlat6;
    u_xlat4 = fma(u_xlat0.xxxx, u_xlat5, u_xlat4);
    u_xlat5.xyz = _MainTex.sample(sampler_MainTex, u_xlat3.zw, level(0.0)).xyz;
    u_xlat3.xyz = _MainTex.sample(sampler_MainTex, u_xlat3.xy, level(0.0)).xyz;
    u_xlat3.xyz = max(u_xlat3.xyz, float3(0.0, 0.0, 0.0));
    u_xlat5.xyz = max(u_xlat5.xyz, float3(0.0, 0.0, 0.0));
    u_xlat20.x = dot(u_xlat5.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat6.w = u_xlat20.x * 0.5;
    u_xlat6.w = clamp(u_xlat6.w, 0.0f, 1.0f);
    u_xlat6.xyz = u_xlat5.xyz * u_xlat6.www;
    u_xlat20.x = dot(u_xlat3.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat5.w = u_xlat20.x * 0.5;
    u_xlat5.w = clamp(u_xlat5.w, 0.0f, 1.0f);
    u_xlat5.xyz = u_xlat3.xyz * u_xlat5.www;
    u_xlat3 = (-u_xlat5) + u_xlat6;
    u_xlat3 = fma(u_xlat0.xxxx, u_xlat3, u_xlat5);
    u_xlat3 = (-u_xlat4) + u_xlat3;
    u_xlat3 = fma(u_xlat0.yyyy, u_xlat3, u_xlat4);
    u_xlat2 = u_xlat2 + u_xlat3;
    u_xlat20.xy = fma(input.TEXCOORD0.xy, FGlobals._BloomThresholdTexelSize.zw, float2(0.5, 0.5));
    u_xlat20.xy = floor(u_xlat20.xy);
    u_xlat1.xy = u_xlat20.xy + float2(1.0, 1.0);
    u_xlat1.xy = max(u_xlat1.xy, float2(0.0, 0.0));
    u_xlat1.xy = min(u_xlat21.xy, u_xlat1.xy);
    u_xlat1.xy = u_xlat1.xy + float2(0.5, 0.5);
    u_xlat1.xy = u_xlat1.xy * FGlobals._BloomThresholdTexelSize.xy;
    u_xlat3.xyz = _MainTex.sample(sampler_MainTex, u_xlat1.xy, level(0.0)).xyz;
    u_xlat3.xyz = max(u_xlat3.xyz, float3(0.0, 0.0, 0.0));
    u_xlat1.x = dot(u_xlat3.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat1.x = u_xlat1.x + (-FGlobals._BloomThreshold);
    u_xlat4.w = u_xlat1.x * 0.5;
    u_xlat4.w = clamp(u_xlat4.w, 0.0f, 1.0f);
    u_xlat4.xyz = u_xlat3.xyz * u_xlat4.www;
    u_xlat3 = u_xlat20.xyxy + float4(1.0, 0.0, 0.0, 1.0);
    u_xlat20.xy = max(u_xlat20.xy, float2(0.0, 0.0));
    u_xlat20.xy = min(u_xlat21.xy, u_xlat20.xy);
    u_xlat20.xy = u_xlat20.xy + float2(0.5, 0.5);
    u_xlat20.xy = u_xlat20.xy * FGlobals._BloomThresholdTexelSize.xy;
    u_xlat5.xyz = _MainTex.sample(sampler_MainTex, u_xlat20.xy, level(0.0)).xyz;
    u_xlat5.xyz = max(u_xlat5.xyz, float3(0.0, 0.0, 0.0));
    u_xlat3 = max(u_xlat3, float4(0.0, 0.0, 0.0, 0.0));
    u_xlat1 = min(u_xlat21.xyxy, u_xlat3);
    u_xlat1 = u_xlat1 + float4(0.5, 0.5, 0.5, 0.5);
    u_xlat1 = u_xlat1 * FGlobals._BloomThresholdTexelSize.xyxy;
    u_xlat3.xyz = _MainTex.sample(sampler_MainTex, u_xlat1.zw, level(0.0)).xyz;
    u_xlat1.xyz = _MainTex.sample(sampler_MainTex, u_xlat1.xy, level(0.0)).xyz;
    u_xlat1.xyz = max(u_xlat1.xyz, float3(0.0, 0.0, 0.0));
    u_xlat3.xyz = max(u_xlat3.xyz, float3(0.0, 0.0, 0.0));
    u_xlat20.x = dot(u_xlat3.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat6.w = u_xlat20.x * 0.5;
    u_xlat6.w = clamp(u_xlat6.w, 0.0f, 1.0f);
    u_xlat6.xyz = u_xlat3.xyz * u_xlat6.www;
    u_xlat3 = u_xlat4 + (-u_xlat6);
    u_xlat3 = fma(u_xlat0.xxxx, u_xlat3, u_xlat6);
    u_xlat20.x = dot(u_xlat1.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat4.w = u_xlat20.x * 0.5;
    u_xlat4.w = clamp(u_xlat4.w, 0.0f, 1.0f);
    u_xlat4.xyz = u_xlat1.xyz * u_xlat4.www;
    u_xlat20.x = dot(u_xlat5.xyz, float3(0.300000012, 0.589999974, 0.109999999));
    u_xlat20.x = u_xlat20.x + (-FGlobals._BloomThreshold);
    u_xlat1.w = u_xlat20.x * 0.5;
    u_xlat1.w = clamp(u_xlat1.w, 0.0f, 1.0f);
    u_xlat1.xyz = u_xlat1.www * u_xlat5.xyz;
    u_xlat4 = (-u_xlat1) + u_xlat4;
    u_xlat1 = fma(u_xlat0.xxxx, u_xlat4, u_xlat1);
    u_xlat3 = (-u_xlat1) + u_xlat3;
    u_xlat0 = fma(u_xlat0.yyyy, u_xlat3, u_xlat1);
    u_xlat0 = u_xlat0 + u_xlat2;
    u_xlat0 = u_xlat0 * float4(0.25, 0.25, 0.25, 0.25);
    u_xlat0.xyz = max(u_xlat0.xyz, float3(0.0, 0.0, 0.0));
    output.SV_Target0 = half4(u_xlat0);
    return output;
}
