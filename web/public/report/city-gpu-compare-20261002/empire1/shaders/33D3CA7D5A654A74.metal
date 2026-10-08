#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float4 hlslcc_mtx4x4unity_ObjectToWorld [4];
    float4 hlslcc_mtx4x4glstate_matrix_projection [4];
    float4 hlslcc_mtx4x4unity_MatrixV [4];
    half4 _Color ;
    float4 hlslcc_mtx4x4_UIProjMatrix [4];
    float _UIProjRatio ;
    float _ColorIntensity ;
};

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    float4 COLOR0 [[ attribute(1) ]] ;
    float2 TEXCOORD0 [[ attribute(2) ]] ;
    half2 TEXCOORD1 [[ attribute(3) ]] ;
};

struct Mtl_VertexOut
{
    float4 mtl_Position [[ position ]];
    half4 COLOR0 [[ user(COLOR0) ]];
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]];
    half2 TEXCOORD2 [[ user(TEXCOORD2) ]];
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    float4 u_xlat1;
    float4 u_xlat2;
    half3 u_xlat16_3;
    u_xlat0 = input.POSITION0.yyyy * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[3], input.POSITION0.wwww, u_xlat0);
    u_xlat1 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4unity_MatrixV[1];
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixV[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixV[2], u_xlat0.zzzz, u_xlat1);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixV[3], u_xlat0.wwww, u_xlat1);
    u_xlat1 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4_UIProjMatrix[1];
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4_UIProjMatrix[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4_UIProjMatrix[2], u_xlat0.zzzz, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4_UIProjMatrix[3], u_xlat0.wwww, u_xlat1);
    u_xlat1 = u_xlat1 * float4(VGlobals._UIProjRatio);
    u_xlat2 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4glstate_matrix_projection[1];
    u_xlat2 = fma(VGlobals.hlslcc_mtx4x4glstate_matrix_projection[0], u_xlat0.xxxx, u_xlat2);
    u_xlat2 = fma(VGlobals.hlslcc_mtx4x4glstate_matrix_projection[2], u_xlat0.zzzz, u_xlat2);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4glstate_matrix_projection[3], u_xlat0.wwww, u_xlat2);
    u_xlat2.x = (-VGlobals._UIProjRatio) + 1.0;
    output.mtl_Position = fma(u_xlat0, u_xlat2.xxxx, u_xlat1);
    u_xlat0 = input.COLOR0 * float4(VGlobals._Color);
    u_xlat16_3.xyz = half3(max(u_xlat0.xyz, float3(0.0, 0.0, 0.0)));
    u_xlat1.xyz = log2(float3(u_xlat16_3.xyz));
    u_xlat1.xyz = u_xlat1.xyz * float3(0.416666657, 0.416666657, 0.416666657);
    u_xlat1.xyz = exp2(u_xlat1.xyz);
    u_xlat1.xyz = fma(u_xlat1.xyz, float3(1.05499995, 1.05499995, 1.05499995), float3(-0.0549999997, -0.0549999997, -0.0549999997));
    u_xlat1.xyz = max(u_xlat1.xyz, float3(0.0, 0.0, 0.0));
    u_xlat0.xyz = u_xlat1.xyz * float3(VGlobals._ColorIntensity);
    output.COLOR0 = half4(u_xlat0);
    output.TEXCOORD0.xy = input.TEXCOORD0.xy;
    output.TEXCOORD1 = input.POSITION0;
    output.TEXCOORD2.xy = input.TEXCOORD1.xy;
    return output;
}
