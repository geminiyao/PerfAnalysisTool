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
    float4 unity_WorldTransformParams ;
    float4 hlslcc_mtx4x4unity_MatrixV [4];
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
    float4 TEXCOORD9 [[ user(TEXCOORD9) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    float4 u_xlat1;
    float3 u_xlat2;
    half4 u_xlat16_2;
    float4 u_xlat3;
    float3 u_xlat4;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    float u_xlat7;
    float u_xlat21;
    u_xlat0 = input.POSITION0.yyyy * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[3], input.POSITION0.wwww, u_xlat0);
    u_xlat1 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat0.wwww, u_xlat1);
    output.mtl_Position = u_xlat1;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD0.xyz = u_xlat0.xyz;
    output.TEXCOORD1.xyz = u_xlat0.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    u_xlat2.xyz = float3(input.TANGENT0.yyy) * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat2.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, float3(input.TANGENT0.xxx), u_xlat2.xyz);
    u_xlat2.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, float3(input.TANGENT0.zzz), u_xlat2.xyz);
    u_xlat21 = dot(u_xlat2.xyz, u_xlat2.xyz);
    u_xlat21 = max(u_xlat21, 0.00100000005);
    u_xlat21 = rsqrt(u_xlat21);
    u_xlat2.xyz = float3(u_xlat21) * u_xlat2.xyz;
    output.TEXCOORD3.xyz = half3(u_xlat2.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    u_xlat3.xyz = float3(input.NORMAL0.yyy) * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat3.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, float3(input.NORMAL0.xxx), u_xlat3.xyz);
    u_xlat3.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, float3(input.NORMAL0.zzz), u_xlat3.xyz);
    u_xlat21 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat21 = max(u_xlat21, 0.00100000005);
    u_xlat21 = rsqrt(u_xlat21);
    u_xlat3.xyz = float3(u_xlat21) * u_xlat3.xyz;
    u_xlat4.xyz = u_xlat2.yzx * u_xlat3.zxy;
    u_xlat2.xyz = fma(u_xlat3.yzx, u_xlat2.zxy, (-u_xlat4.xyz));
    u_xlat21 = float(input.TANGENT0.w) * VGlobals.unity_WorldTransformParams.w;
    u_xlat2.xyz = float3(u_xlat21) * u_xlat2.xyz;
    u_xlat21 = dot(u_xlat2.xyz, u_xlat2.xyz);
    u_xlat21 = max(u_xlat21, 0.00100000005);
    u_xlat21 = rsqrt(u_xlat21);
    u_xlat2.xyz = float3(u_xlat21) * u_xlat2.xyz;
    output.TEXCOORD4.xyz = half3(u_xlat2.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat3.xyz);
    u_xlat16_5.x = half(u_xlat3.y * u_xlat3.y);
    u_xlat16_5.x = half(fma(u_xlat3.x, u_xlat3.x, (-float(u_xlat16_5.x))));
    u_xlat16_2 = half4(u_xlat3.yzzx * u_xlat3.xyzz);
    u_xlat16_6.x = dot(VGlobals.gLightBuffer[3], u_xlat16_2);
    u_xlat16_6.y = dot(VGlobals.gLightBuffer[4], u_xlat16_2);
    u_xlat16_6.z = dot(VGlobals.gLightBuffer[5], u_xlat16_2);
    u_xlat16_5.xyz = fma(VGlobals.gLightBuffer[6].xyz, u_xlat16_5.xxx, u_xlat16_6.xyz);
    u_xlat3.w = 1.0;
    u_xlat16_6.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat3));
    u_xlat16_6.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat3));
    u_xlat16_6.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat3));
    u_xlat16_5.xyz = u_xlat16_5.xyz + u_xlat16_6.xyz;
    u_xlat16_5.xyz = u_xlat16_5.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_5.xyz = max(u_xlat16_5.xyz, half3(0.0, 0.0, 0.0));
    output.TEXCOORD8.xyz = float3(u_xlat16_5.xyz);
    u_xlat7 = u_xlat0.y * VGlobals.hlslcc_mtx4x4unity_MatrixV[1].z;
    u_xlat0.x = fma(VGlobals.hlslcc_mtx4x4unity_MatrixV[0].z, u_xlat0.x, u_xlat7);
    u_xlat0.x = fma(VGlobals.hlslcc_mtx4x4unity_MatrixV[2].z, u_xlat0.z, u_xlat0.x);
    u_xlat0.x = u_xlat0.x + VGlobals.hlslcc_mtx4x4unity_MatrixV[3].z;
    output.TEXCOORD9.z = (-u_xlat0.x);
    u_xlat16_5.xyz = half3(u_xlat1.xyw * float3(0.5, 0.5, 0.5));
    output.TEXCOORD9.w = u_xlat1.w;
    u_xlat16_6.x = u_xlat16_5.z + u_xlat16_5.x;
    u_xlat16_6.y = half(fma(float(u_xlat16_5.y), VGlobals._ProjectionParams.x, float(u_xlat16_5.z)));
    output.TEXCOORD9.xy = float2(u_xlat16_6.xy);
    return output;
}
