#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    half4 gFogParams [9];
    float4 gShadowParams0 [6];
};

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
    half TEXCOORD10 [[ user(TEXCOORD10) ]];
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(2) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(3) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    half4 phase0_Output0_6;
    float4 u_xlat0;
    float4 u_xlat1;
    float4 u_xlat2;
    float3 u_xlat3;
    half u_xlat16_4;
    half u_xlat16_9;
    half u_xlat16_14;
    float u_xlat16;
    u_xlat0 = input.POSITION0.yyyy * UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat0 = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[3], input.POSITION0.wwww, u_xlat0);
    u_xlat1 = u_xlat0.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat1 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat1);
    output.mtl_Position = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat0.wwww, u_xlat1);
    output.TEXCOORD0.xyz = u_xlat0.xyz;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.xyz = u_xlat0.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    u_xlat1.xyz = float3(input.TANGENT0.yyy) * UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat1.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, float3(input.TANGENT0.xxx), u_xlat1.xyz);
    u_xlat1.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, float3(input.TANGENT0.zzz), u_xlat1.xyz);
    u_xlat16 = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat16 = max(u_xlat16, 0.00100000005);
    u_xlat16 = rsqrt(u_xlat16);
    u_xlat1.xyz = float3(u_xlat16) * u_xlat1.xyz;
    output.TEXCOORD3.xyz = half3(u_xlat1.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    u_xlat2.xyz = float3(input.NORMAL0.yyy) * UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat2.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, float3(input.NORMAL0.xxx), u_xlat2.xyz);
    u_xlat2.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, float3(input.NORMAL0.zzz), u_xlat2.xyz);
    u_xlat16 = dot(u_xlat2.xyz, u_xlat2.xyz);
    u_xlat16 = max(u_xlat16, 0.00100000005);
    u_xlat16 = rsqrt(u_xlat16);
    u_xlat2.xyz = float3(u_xlat16) * u_xlat2.xyz;
    u_xlat3.xyz = u_xlat1.yzx * u_xlat2.zxy;
    u_xlat1.xyz = fma(u_xlat2.yzx, u_xlat1.zxy, (-u_xlat3.xyz));
    u_xlat16 = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat1.xyz = float3(u_xlat16) * u_xlat1.xyz;
    u_xlat16 = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat16 = max(u_xlat16, 0.00100000005);
    u_xlat16 = rsqrt(u_xlat16);
    u_xlat1.xyz = float3(u_xlat16) * u_xlat1.xyz;
    output.TEXCOORD4.xyz = half3(u_xlat1.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    u_xlat1.xyz = u_xlat0.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
    u_xlat16_4 = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat16_4 = sqrt(u_xlat16_4);
    u_xlat16_9 = (-VGlobals.gFogParams[5].w) + VGlobals.gFogParams[6].x;
    u_xlat16_14 = half(-1.0) / u_xlat16_9;
    u_xlat16_9 = VGlobals.gFogParams[6].x / u_xlat16_9;
    u_xlat2.w = fma(float(u_xlat16_4), float(u_xlat16_14), float(u_xlat16_9));
    u_xlat2.w = clamp(u_xlat2.w, 0.0f, 1.0f);
    phase0_Output0_6 = half4(u_xlat2);
    u_xlat0.w = 1.0;
    output.TEXCOORD14.x = dot(VGlobals.gShadowParams0[0], u_xlat0);
    output.TEXCOORD14.y = dot(VGlobals.gShadowParams0[1], u_xlat0);
    output.TEXCOORD14.z = dot(VGlobals.gShadowParams0[2], u_xlat0);
    output.TEXCOORD14.w = dot(VGlobals.gShadowParams0[3], u_xlat0);
    output.TEXCOORD5 = phase0_Output0_6.xyz;
    output.TEXCOORD10 = phase0_Output0_6.w;
    return output;
}
