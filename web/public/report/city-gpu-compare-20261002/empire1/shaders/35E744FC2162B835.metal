#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float4 _ScreenParams ;
    float4 hlslcc_mtx4x4unity_ObjectToWorld [4];
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
};

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    float2 TEXCOORD0 [[ attribute(1) ]] ;
};

struct Mtl_VertexOut
{
    float4 mtl_Position [[ position ]];
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]];
    float2 TEXCOORD1 [[ user(TEXCOORD1) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    float3 u_xlat1;
    float2 u_xlat4;
    u_xlat0 = input.POSITION0.yyyy * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat0 = u_xlat0 + VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[3];
    u_xlat1.xyz = u_xlat0.yyy * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1].xyw;
    u_xlat1.xyz = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0].xyw, u_xlat0.xxx, u_xlat1.xyz);
    u_xlat0.xyz = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2].xyw, u_xlat0.zzz, u_xlat1.xyz);
    u_xlat0.xyz = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[3].xyw, u_xlat0.www, u_xlat0.xyz);
    output.mtl_Position.xyw = u_xlat0.xyz;
    output.mtl_Position.z = 0.0;
    u_xlat4.x = 1.0;
    u_xlat1.x = float(1.0) / VGlobals._ScreenParams.x;
    u_xlat4.y = u_xlat1.x * VGlobals._ScreenParams.y;
    u_xlat0.xy = u_xlat4.xy * u_xlat0.xy;
    u_xlat4.x = fma(u_xlat4.y, u_xlat4.y, 1.0);
    u_xlat4.x = sqrt(u_xlat4.x);
    u_xlat4.x = 1.41421354 / u_xlat4.x;
    output.TEXCOORD1.xy = u_xlat4.xx * u_xlat0.xy;
    output.TEXCOORD0.xy = input.TEXCOORD0.xy;
    return output;
}
