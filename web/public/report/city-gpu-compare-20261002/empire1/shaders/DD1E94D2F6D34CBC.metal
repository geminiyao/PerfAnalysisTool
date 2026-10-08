#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float4 _ProjectionParams ;
    float4 hlslcc_mtx4x4unity_ObjectToWorld [4];
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    half4 _MainTex_TexelSize ;
};

struct Mtl_VertexIn
{
    half4 POSITION0 [[ attribute(0) ]] ;
    half2 TEXCOORD0 [[ attribute(1) ]] ;
};

struct Mtl_VertexOut
{
    float4 mtl_Position [[ position ]];
    half4 TEXCOORD0 [[ user(TEXCOORD0) ]];
    half4 TEXCOORD1 [[ user(TEXCOORD1) ]];
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]];
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]];
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]];
    half4 TEXCOORD5 [[ user(TEXCOORD5) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    float4 u_xlat1;
    u_xlat0 = float4(input.POSITION0.yyyy) * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0], float4(input.POSITION0.xxxx), u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2], float4(input.POSITION0.zzzz), u_xlat0);
    u_xlat0 = u_xlat0 + VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[3];
    u_xlat1 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat1);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat0.wwww, u_xlat1);
    output.mtl_Position = u_xlat0;
    output.TEXCOORD0 = fma(VGlobals._MainTex_TexelSize.xyxy, half4(-1.0, -1.0, 0.0, -1.0), input.TEXCOORD0.xyxy);
    output.TEXCOORD1 = fma(VGlobals._MainTex_TexelSize.xyxy, half4(1.0, -1.0, -1.0, 0.0), input.TEXCOORD0.xyxy);
    output.TEXCOORD2 = fma(VGlobals._MainTex_TexelSize.xyxy, half4(0.0, 0.0, 1.0, 0.0), input.TEXCOORD0.xyxy);
    output.TEXCOORD3 = fma(VGlobals._MainTex_TexelSize.xyxy, half4(-1.0, 1.0, 0.0, 1.0), input.TEXCOORD0.xyxy);
    output.TEXCOORD4.xy = input.TEXCOORD0.xy + VGlobals._MainTex_TexelSize.xy;
    u_xlat1.x = u_xlat0.y * VGlobals._ProjectionParams.x;
    u_xlat1.w = u_xlat1.x * 0.5;
    u_xlat1.xz = u_xlat0.xw * float2(0.5, 0.5);
    u_xlat0.xy = u_xlat1.zz + u_xlat1.xw;
    output.TEXCOORD5 = half4(u_xlat0);
    return output;
}
