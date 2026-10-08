#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float4 hlslcc_mtx4x4unity_ObjectToWorld [4];
    float4 unity_WorldTransformParams ;
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    half4 gLightBuffer [115];
};

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    half4 TANGENT0 [[ attribute(1) ]] ;
    half3 NORMAL0 [[ attribute(2) ]] ;
    half4 TEXCOORD0 [[ attribute(3) ]] ;
    half4 TEXCOORD1 [[ attribute(4) ]] ;
    half4 COLOR0 [[ attribute(5) ]] ;
};

struct Mtl_VertexOut
{
    float4 mtl_Position [[ position ]];
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]];
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]];
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]];
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]];
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]];
    half3 TEXCOORD5 [[ user(TEXCOORD5) ]];
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    half4 u_xlat16_0;
    float4 u_xlat1;
    float3 u_xlat2;
    half3 u_xlat16_3;
    half3 u_xlat16_4;
    float u_xlat15;
    u_xlat0 = input.POSITION0.yyyy * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[3], input.POSITION0.wwww, u_xlat0);
    u_xlat1 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat1);
    output.mtl_Position = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat0.wwww, u_xlat1);
    output.TEXCOORD0.xyz = u_xlat0.xyz;
    output.TEXCOORD1.xyz = u_xlat0.xyz;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    u_xlat0.xyz = float3(input.TANGENT0.yyy) * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat0.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, float3(input.TANGENT0.xxx), u_xlat0.xyz);
    u_xlat0.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, float3(input.TANGENT0.zzz), u_xlat0.xyz);
    u_xlat15 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat15 = max(u_xlat15, 0.00100000005);
    u_xlat15 = rsqrt(u_xlat15);
    u_xlat0.xyz = float3(u_xlat15) * u_xlat0.xyz;
    output.TEXCOORD3.xyz = half3(u_xlat0.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    u_xlat1.xyz = float3(input.NORMAL0.yyy) * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat1.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, float3(input.NORMAL0.xxx), u_xlat1.xyz);
    u_xlat1.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, float3(input.NORMAL0.zzz), u_xlat1.xyz);
    u_xlat15 = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat15 = max(u_xlat15, 0.00100000005);
    u_xlat15 = rsqrt(u_xlat15);
    u_xlat1.xyz = float3(u_xlat15) * u_xlat1.xyz;
    u_xlat2.xyz = u_xlat0.yzx * u_xlat1.zxy;
    u_xlat0.xyz = fma(u_xlat1.yzx, u_xlat0.zxy, (-u_xlat2.xyz));
    u_xlat15 = float(input.TANGENT0.w) * VGlobals.unity_WorldTransformParams.w;
    u_xlat0.xyz = float3(u_xlat15) * u_xlat0.xyz;
    u_xlat15 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat15 = max(u_xlat15, 0.00100000005);
    u_xlat15 = rsqrt(u_xlat15);
    u_xlat0.xyz = float3(u_xlat15) * u_xlat0.xyz;
    output.TEXCOORD4.xyz = half3(u_xlat0.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat1.xyz);
    u_xlat16_3.x = half(u_xlat1.y * u_xlat1.y);
    u_xlat16_3.x = half(fma(u_xlat1.x, u_xlat1.x, (-float(u_xlat16_3.x))));
    u_xlat16_0 = half4(u_xlat1.yzzx * u_xlat1.xyzz);
    u_xlat16_4.x = dot(VGlobals.gLightBuffer[3], u_xlat16_0);
    u_xlat16_4.y = dot(VGlobals.gLightBuffer[4], u_xlat16_0);
    u_xlat16_4.z = dot(VGlobals.gLightBuffer[5], u_xlat16_0);
    u_xlat16_3.xyz = fma(VGlobals.gLightBuffer[6].xyz, u_xlat16_3.xxx, u_xlat16_4.xyz);
    u_xlat1.w = 1.0;
    u_xlat16_4.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat1));
    u_xlat16_4.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat1));
    u_xlat16_4.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat1));
    u_xlat16_3.xyz = u_xlat16_3.xyz + u_xlat16_4.xyz;
    u_xlat16_3.xyz = u_xlat16_3.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_3.xyz = max(u_xlat16_3.xyz, half3(0.0, 0.0, 0.0));
    output.TEXCOORD8.xyz = float3(u_xlat16_3.xyz);
    return output;
}
