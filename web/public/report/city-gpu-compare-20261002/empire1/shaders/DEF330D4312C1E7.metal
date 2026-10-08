#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float _Alpha ;
};

struct UnityPerDraw_Type
{
    float4 hlslcc_mtx4x4unity_ObjectToWorld [4];
    float4 hlslcc_mtx4x4unity_WorldToObject [4];
    float4 unity_LODFade ;
    float4 unity_WorldTransformParams ;
    float4 unity_RenderingLayer ;
};

struct UnityPerFrame_Type
{
    half4 glstate_lightmodel_ambient ;
    half4 unity_AmbientSky ;
    half4 unity_AmbientEquator ;
    half4 unity_AmbientGround ;
    half4 unity_IndirectSpecColor ;
    float4 hlslcc_mtx4x4glstate_matrix_projection [4];
    float4 hlslcc_mtx4x4unity_MatrixV [4];
    float4 hlslcc_mtx4x4unity_MatrixInvV [4];
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    int unity_StereoEyeIndex ;
    half4 unity_ShadowColor ;
};

struct UnityPerMaterial_Type
{
    float4 _MainTex_ST ;
};

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    half4 COLOR0 [[ attribute(1) ]] ;
    float2 TEXCOORD0 [[ attribute(2) ]] ;
};

struct Mtl_VertexOut
{
    float4 mtl_Position [[ position ]];
    half4 COLOR0 [[ user(COLOR0) ]];
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(1) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(2) ]],
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(3) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    float4 u_xlat1;
    u_xlat0 = input.POSITION0.yyyy * UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat0 = u_xlat0 + UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[3];
    u_xlat1 = u_xlat0.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat1 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat1);
    output.mtl_Position = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat0.wwww, u_xlat1);
    u_xlat0.x = float(input.COLOR0.w) * VGlobals._Alpha;
    output.COLOR0.w = half(u_xlat0.x);
    output.COLOR0.xyz = input.COLOR0.xyz;
    output.TEXCOORD0.xy = fma(input.TEXCOORD0.xy, UnityPerMaterial._MainTex_ST.xy, UnityPerMaterial._MainTex_ST.zw);
    return output;
}
