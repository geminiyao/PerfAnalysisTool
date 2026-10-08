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
    float4 _DownTex_TexelSize ;
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
    output.TEXCOORD0 = fma(VGlobals._DownTex_TexelSize.xyxy, float4(0.334824055, 1.27682924, 1.20702457, 0.534314215), input.TEXCOORD0.xyxy);
    output.TEXCOORD1 = fma(VGlobals._DownTex_TexelSize.xyxy, float4(1.17031121, -0.610550404, 0.252329737, -1.29565811), input.TEXCOORD0.xyxy);
    output.TEXCOORD2 = fma(VGlobals._DownTex_TexelSize.xyxy, float4(-0.855660915, -1.00510919, -1.31932187, 0.042307131), input.TEXCOORD0.xyxy);
    output.TEXCOORD3.xy = fma(VGlobals._DownTex_TexelSize.xy, float2(-0.789506853, 1.05786538), input.TEXCOORD0.xy);
    output.TEXCOORD3.zw = input.TEXCOORD0.xy;
    output.TEXCOORD4 = fma(VGlobals._MainTex_TexelSize.xyxy, float4(0.334824055, 1.27682924, 1.20702457, 0.534314215), input.TEXCOORD0.xyxy);
    output.TEXCOORD5 = fma(VGlobals._MainTex_TexelSize.xyxy, float4(1.17031121, -0.610550404, 0.252329737, -1.29565811), input.TEXCOORD0.xyxy);
    output.TEXCOORD6 = fma(VGlobals._MainTex_TexelSize.xyxy, float4(-0.855660915, -1.00510919, -1.31932187, 0.042307131), input.TEXCOORD0.xyxy);
    output.TEXCOORD7.xy = fma(VGlobals._MainTex_TexelSize.xy, float2(-0.789506853, 1.05786538), input.TEXCOORD0.xy);
    output.TEXCOORD7.zw = float2(0.0, 0.0);
    return output;
}
