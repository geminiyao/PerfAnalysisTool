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
    half4 _DownTex_TexelSize ;
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
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    float4 u_xlat1;
    float2 u_xlat4;
    u_xlat0 = float4(input.POSITION0.yyyy) * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0], float4(input.POSITION0.xxxx), u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2], float4(input.POSITION0.zzzz), u_xlat0);
    u_xlat0 = u_xlat0 + VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[3];
    u_xlat1 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat1);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat0.wwww, u_xlat1);
    output.mtl_Position = u_xlat0;
    u_xlat4.x = 1.0;
    u_xlat1.x = float(1.0) / VGlobals._ScreenParams.x;
    u_xlat4.y = u_xlat1.x * VGlobals._ScreenParams.y;
    u_xlat0.xy = u_xlat4.xy * u_xlat0.xy;
    u_xlat4.x = fma(u_xlat4.y, u_xlat4.y, 1.0);
    u_xlat4.x = sqrt(u_xlat4.x);
    u_xlat4.x = 1.41421354 / u_xlat4.x;
    u_xlat0.xy = u_xlat4.xx * u_xlat0.xy;
    output.TEXCOORD0.zw = half2(u_xlat0.xy);
    output.TEXCOORD0.xy = input.TEXCOORD0.xy;
    u_xlat0 = fma(float4(VGlobals._DownTex_TexelSize.xyxy), float4(0.112866625, 0.310098588, 0.324986577, 0.0573039912), float4(input.TEXCOORD0.xyxy));
    output.TEXCOORD1 = half4(u_xlat0);
    u_xlat0 = fma(float4(VGlobals._DownTex_TexelSize.xyxy), float4(0.212120041, -0.252794564, -0.112866439, -0.310098648), float4(input.TEXCOORD0.xyxy));
    output.TEXCOORD2 = half4(u_xlat0);
    u_xlat0 = fma(float4(VGlobals._DownTex_TexelSize.xyxy), float4(-0.324986517, -0.0573041961, -0.212120205, 0.252794445), float4(input.TEXCOORD0.xyxy));
    output.TEXCOORD3 = half4(u_xlat0);
    return output;
}
