#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float4 hlslcc_mtx4x4unity_ObjectToWorld [4];
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    float4 _MainTex_TexelSize ;
};

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    float2 TEXCOORD0 [[ attribute(1) ]] ;
};

struct Mtl_VertexOut
{
    float4 mtl_Position [[ position ]];
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]];
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]];
    float4 TEXCOORD2 [[ user(TEXCOORD2) ]];
    float4 TEXCOORD3 [[ user(TEXCOORD3) ]];
    float4 TEXCOORD4 [[ user(TEXCOORD4) ]];
    float4 TEXCOORD5 [[ user(TEXCOORD5) ]];
    float4 TEXCOORD6 [[ user(TEXCOORD6) ]];
    float4 TEXCOORD7 [[ user(TEXCOORD7) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    float4 u_xlat1;
    u_xlat0 = input.POSITION0.yyyy * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat0 = u_xlat0 + VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[3];
    u_xlat1 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat1);
    output.mtl_Position = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat0.wwww, u_xlat1);
    output.TEXCOORD0.zw = fma(VGlobals._MainTex_TexelSize.xy, float2(0.169145375, 2.63457584), input.TEXCOORD0.xy);
    output.TEXCOORD0.xy = input.TEXCOORD0.xy;
    output.TEXCOORD1.xy = fma(VGlobals._MainTex_TexelSize.xy, float2(1.29549432, 2.30028152), input.TEXCOORD0.xy);
    output.TEXCOORD1.zw = fma(VGlobals._MainTex_TexelSize.xy, float2(2.16525459, 1.51038837), input.TEXCOORD0.xy);
    output.TEXCOORD2.xy = fma(VGlobals._MainTex_TexelSize.xy, float2(2.60615993, 0.42134425), input.TEXCOORD0.xy);
    output.TEXCOORD2.zw = fma(VGlobals._MainTex_TexelSize.xy, float2(2.53088355, -0.751152158), input.TEXCOORD0.xy);
    output.TEXCOORD3.xy = fma(VGlobals._MainTex_TexelSize.xy, float2(1.9543345, -1.77487373), input.TEXCOORD0.xy);
    output.TEXCOORD3.zw = fma(VGlobals._MainTex_TexelSize.xy, float2(0.990705848, -2.44705987), input.TEXCOORD0.xy);
    output.TEXCOORD4.xy = fma(VGlobals._MainTex_TexelSize.xy, float2(-0.169144258, -2.63457608), input.TEXCOORD0.xy);
    output.TEXCOORD4.zw = fma(VGlobals._MainTex_TexelSize.xy, float2(-1.29549372, -2.30028176), input.TEXCOORD0.xy);
    output.TEXCOORD5.xy = fma(VGlobals._MainTex_TexelSize.xy, float2(-2.16525435, -1.51038873), input.TEXCOORD0.xy);
    output.TEXCOORD5.zw = fma(VGlobals._MainTex_TexelSize.xy, float2(-2.60615969, -0.421345294), input.TEXCOORD0.xy);
    output.TEXCOORD6.xy = fma(VGlobals._MainTex_TexelSize.xy, float2(-2.53088355, 0.7511518), input.TEXCOORD0.xy);
    output.TEXCOORD6.zw = fma(VGlobals._MainTex_TexelSize.xy, float2(-1.95433521, 1.77487302), input.TEXCOORD0.xy);
    output.TEXCOORD7.xy = fma(VGlobals._MainTex_TexelSize.xy, float2(-0.990706265, 2.44705987), input.TEXCOORD0.xy);
    output.TEXCOORD7.zw = float2(0.0, 0.0);
    return output;
}
