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
    float _BuildBlurSize ;
    float _RoadBlurSize ;
    float _RoadStartBlurSize ;
    float _BuildGradientInten ;
    float _RoadGradientInten ;
    float _RoadStartGradientInten ;
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
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    half u_xlat16_0;
    float4 u_xlat1;
    half4 u_xlat16_1;
    float4 u_xlat2;
    float2 u_xlat3;
    half u_xlat16_3;
    half u_xlat16_6;
    u_xlat0 = fma(float4(FGlobals._RoadBlurSize), float4(0.0, 0.00183333328, 0.00216666656, 0.0), input.TEXCOORD0.xyxy);
    u_xlat16_6 = _MainTex.sample(sampler_MainTex, u_xlat0.zw, level(0.0)).x;
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, u_xlat0.xy, level(0.0)).x;
    u_xlat3.x = float(u_xlat16_6) * FGlobals._RoadGradientInten;
    u_xlat0.x = fma(float(u_xlat16_0), FGlobals._RoadGradientInten, u_xlat3.x);
    u_xlat1 = fma(float4(FGlobals._RoadBlurSize), float4(0.0, -0.00200000009, -0.00183333328, 0.0), input.TEXCOORD0.xyxy);
    u_xlat16_3 = _MainTex.sample(sampler_MainTex, u_xlat1.xy, level(0.0)).x;
    u_xlat16_6 = _MainTex.sample(sampler_MainTex, u_xlat1.zw, level(0.0)).x;
    u_xlat0.x = fma(float(u_xlat16_3), FGlobals._RoadGradientInten, u_xlat0.x);
    u_xlat0.x = fma(float(u_xlat16_6), FGlobals._RoadGradientInten, u_xlat0.x);
    u_xlat1 = fma(float4(FGlobals._RoadBlurSize), float4(0.00166666671, 0.00150000001, -0.00133333332, 0.00116666663), input.TEXCOORD0.xyxy);
    u_xlat3.x = float(_MainTex.sample(sampler_MainTex, u_xlat1.xy, level(0.0)).x);
    u_xlat3.y = float(_MainTex.sample(sampler_MainTex, u_xlat1.zw, level(0.0)).x);
    u_xlat3.xy = u_xlat3.xy * float2(FGlobals._RoadGradientInten);
    u_xlat0.x = fma(u_xlat3.x, 0.75, u_xlat0.x);
    u_xlat0.x = fma(u_xlat3.y, 0.75, u_xlat0.x);
    u_xlat1 = fma(float4(FGlobals._RoadBlurSize), float4(0.00200000009, -0.00200000009, -0.00216666656, -0.00183333328), input.TEXCOORD0.xyxy);
    u_xlat3.x = float(_MainTex.sample(sampler_MainTex, u_xlat1.xy, level(0.0)).x);
    u_xlat3.y = float(_MainTex.sample(sampler_MainTex, u_xlat1.zw, level(0.0)).x);
    u_xlat3.xy = u_xlat3.xy * float2(FGlobals._RoadGradientInten);
    u_xlat0.x = fma(u_xlat3.x, 0.75, u_xlat0.x);
    u_xlat0.x = fma(u_xlat3.y, 0.75, u_xlat0.x);
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, input.TEXCOORD0.xy, level(0.0));
    output.SV_Target0.x = half(fma(float(u_xlat16_1.x), 0.300000012, u_xlat0.x));
    output.SV_Target0.x = clamp(output.SV_Target0.x, 0.0h, 1.0h);
    u_xlat0 = fma(float4(FGlobals._BuildBlurSize), float4(0.0, 0.00183333328, 0.00216666656, 0.0), input.TEXCOORD0.xyxy);
    u_xlat0.z = float(_MainTex.sample(sampler_MainTex, u_xlat0.zw, level(0.0)).y);
    u_xlat0.x = float(_MainTex.sample(sampler_MainTex, u_xlat0.xy, level(0.0)).y);
    u_xlat0.xy = (-u_xlat0.xz) + float2(1.0, 1.0);
    u_xlat3.x = u_xlat0.y * FGlobals._BuildGradientInten;
    u_xlat0.x = fma(u_xlat0.x, FGlobals._BuildGradientInten, u_xlat3.x);
    u_xlat2 = fma(float4(FGlobals._BuildBlurSize), float4(0.0, -0.00200000009, -0.00183333328, 0.0), input.TEXCOORD0.xyxy);
    u_xlat3.x = float(_MainTex.sample(sampler_MainTex, u_xlat2.xy, level(0.0)).y);
    u_xlat3.y = float(_MainTex.sample(sampler_MainTex, u_xlat2.zw, level(0.0)).y);
    u_xlat3.xy = (-u_xlat3.xy) + float2(1.0, 1.0);
    u_xlat0.x = fma(u_xlat3.x, FGlobals._BuildGradientInten, u_xlat0.x);
    u_xlat0.x = fma(u_xlat3.y, FGlobals._BuildGradientInten, u_xlat0.x);
    output.SV_Target0.y = half((-u_xlat0.x) + float(u_xlat16_1.y));
    output.SV_Target0.y = clamp(output.SV_Target0.y, 0.0h, 1.0h);
    u_xlat0 = fma(float4(FGlobals._RoadStartBlurSize), float4(0.0, 0.00183333328, 0.00216666656, 0.0), input.TEXCOORD0.xyxy);
    u_xlat16_6 = _MainTex.sample(sampler_MainTex, u_xlat0.zw, level(0.0)).z;
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, u_xlat0.xy, level(0.0)).z;
    u_xlat3.x = float(u_xlat16_6) * FGlobals._RoadStartGradientInten;
    u_xlat0.x = fma(float(u_xlat16_0), FGlobals._RoadStartGradientInten, u_xlat3.x);
    u_xlat2 = fma(float4(FGlobals._RoadStartBlurSize), float4(0.0, -0.00200000009, -0.00183333328, 0.0), input.TEXCOORD0.xyxy);
    u_xlat16_3 = _MainTex.sample(sampler_MainTex, u_xlat2.xy, level(0.0)).z;
    u_xlat16_6 = _MainTex.sample(sampler_MainTex, u_xlat2.zw, level(0.0)).z;
    u_xlat0.x = fma(float(u_xlat16_3), FGlobals._RoadStartGradientInten, u_xlat0.x);
    u_xlat0.x = fma(float(u_xlat16_6), FGlobals._RoadStartGradientInten, u_xlat0.x);
    output.SV_Target0.z = half(fma(float(u_xlat16_1.z), 0.300000012, u_xlat0.x));
    output.SV_Target0.z = clamp(output.SV_Target0.z, 0.0h, 1.0h);
    output.SV_Target0.w = u_xlat16_1.w;
    return output;
}
