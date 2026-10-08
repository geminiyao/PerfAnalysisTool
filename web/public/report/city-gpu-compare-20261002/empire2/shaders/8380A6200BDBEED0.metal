#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct UnityPerCamera_Type
{
    float4 _Time ;
    float4 _SinTime ;
    float4 _CosTime ;
    float4 unity_DeltaTime ;
    float3 _WorldSpaceCameraPos ;
    float4 _ProjectionParams ;
    float4 _ScreenParams ;
    float4 _ZBufferParams ;
    float4 unity_OrthoParams ;
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

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    float2 TEXCOORD0 [[ attribute(1) ]] ;
    half4 COLOR0 [[ attribute(2) ]] ;
    float3 NORMAL0 [[ attribute(3) ]] ;
    float4 TANGENT0 [[ attribute(4) ]] ;
};

struct Mtl_VertexOut
{
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]];
    float4 mtl_Position [[ position ]];
    half4 COLOR0 [[ user(COLOR0) ]];
    float3 NORMAL0 [[ user(NORMAL0) ]];
    float4 TANGENT0 [[ user(TANGENT0) ]];
    float3 TEXCOORD1 [[ user(TEXCOORD1) ]];
    float4 TEXCOORD2 [[ user(TEXCOORD2) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(0) ]],
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(1) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(2) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    float4 u_xlat1;
    half3 u_xlat16_2;
    half2 u_xlat16_3;
    output.TEXCOORD0.xy = input.TEXCOORD0.xy;
    u_xlat0 = input.POSITION0.yyyy * UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat1 = u_xlat0 + UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[3];
    output.TEXCOORD1.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[3].xyz, input.POSITION0.www, u_xlat0.xyz);
    u_xlat0 = u_xlat1.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat0 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat1.xxxx, u_xlat0);
    u_xlat0 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat1.zzzz, u_xlat0);
    u_xlat0 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat1.wwww, u_xlat0);
    output.mtl_Position = u_xlat0;
    output.COLOR0 = input.COLOR0;
    output.NORMAL0.xyz = input.NORMAL0.xyz;
    output.TANGENT0 = input.TANGENT0;
    u_xlat16_2.xyz = half3(u_xlat0.xyw * float3(0.5, 0.5, 0.5));
    output.TEXCOORD2.zw = u_xlat0.zw;
    u_xlat16_3.x = u_xlat16_2.z + u_xlat16_2.x;
    u_xlat16_3.y = half(fma(float(u_xlat16_2.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_2.z)));
    output.TEXCOORD2.xy = float2(u_xlat16_3.xy);
    return output;
}
