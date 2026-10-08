#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    half4 gLightBuffer [116];
    float4 gShadowParams0 [7];
    float gPlanarShadowEnabled ;
    float4 gPlanarShadowParams ;
    float4 hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat [4];
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
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]];
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
    float4 u_xlat0;
    float4 u_xlat1;
    float3 u_xlat2;
    float3 u_xlat3;
    float4 u_xlat4;
    half4 u_xlat16_4;
    float3 u_xlat5;
    half3 u_xlat16_6;
    half3 u_xlat16_7;
    float u_xlat25;
    float u_xlat26;
    bool u_xlatb26;
    half u_xlat16_30;
    u_xlat0 = input.POSITION0.yyyy * UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat0 = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[3], input.POSITION0.wwww, u_xlat0);
    u_xlat1.xyz = float3(input.NORMAL0.yyy) * UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat1.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, float3(input.NORMAL0.xxx), u_xlat1.xyz);
    u_xlat1.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, float3(input.NORMAL0.zzz), u_xlat1.xyz);
    u_xlat25 = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat25 = max(u_xlat25, 0.00100000005);
    u_xlat25 = rsqrt(u_xlat25);
    u_xlat1.xyz = float3(u_xlat25) * u_xlat1.xyz;
    u_xlat2.xyz = float3(input.TANGENT0.yyy) * UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat2.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, float3(input.TANGENT0.xxx), u_xlat2.xyz);
    u_xlat2.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, float3(input.TANGENT0.zzz), u_xlat2.xyz);
    u_xlat26 = dot(u_xlat2.xyz, u_xlat2.xyz);
    u_xlat26 = max(u_xlat26, 0.00100000005);
    u_xlat26 = rsqrt(u_xlat26);
    u_xlat2.xyz = float3(u_xlat26) * u_xlat2.xyz;
    u_xlat26 = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat3.xyz = u_xlat1.zxy * u_xlat2.yzx;
    u_xlat3.xyz = fma(u_xlat1.yzx, u_xlat2.zxy, (-u_xlat3.xyz));
    u_xlat3.xyz = float3(u_xlat26) * u_xlat3.xyz;
    u_xlat26 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat26 = max(u_xlat26, 0.00100000005);
    u_xlat26 = rsqrt(u_xlat26);
    u_xlat3.xyz = float3(u_xlat26) * u_xlat3.xyz;
    u_xlat4 = u_xlat0.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat4 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat4);
    u_xlat4 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat4);
    output.mtl_Position = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat0.wwww, u_xlat4);
    u_xlatb26 = 0.5<VGlobals.gPlanarShadowEnabled;
    if(u_xlatb26){
        u_xlat26 = (-u_xlat0.y) + VGlobals.gPlanarShadowParams.x;
        u_xlat26 = u_xlat26 / float(VGlobals.gLightBuffer[11].y);
        u_xlat4.xyz = fma(float3(VGlobals.gLightBuffer[11].xyz), float3(u_xlat26), u_xlat0.xyz);
        u_xlat5.xyz = u_xlat4.yyy * VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[1].xyw;
        u_xlat4.xyw = fma(VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[0].xyw, u_xlat4.xxx, u_xlat5.xyz);
        u_xlat4.xyz = fma(VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[2].xyw, u_xlat4.zzz, u_xlat4.xyw);
        u_xlat4.xyz = u_xlat4.xyz + VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[3].xyw;
        u_xlat16_6.xyz = half3(u_xlat4.xyz * float3(0.5, 0.5, 0.5));
        u_xlat16_7.x = u_xlat16_6.z + u_xlat16_6.x;
        u_xlat16_7.y = half(fma(float(u_xlat16_6.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_6.z)));
        u_xlat26 = u_xlat0.y + 100.0;
        u_xlat26 = u_xlat26 / VGlobals.gPlanarShadowParams.y;
        output.TEXCOORD14.z = u_xlat4.z * u_xlat26;
        output.TEXCOORD14.xy = float2(u_xlat16_7.xy);
        output.TEXCOORD14.w = u_xlat4.z;
    } else {
        u_xlat0.w = 1.0;
        output.TEXCOORD14.x = dot(VGlobals.gShadowParams0[0], u_xlat0);
        output.TEXCOORD14.y = dot(VGlobals.gShadowParams0[1], u_xlat0);
        output.TEXCOORD14.z = dot(VGlobals.gShadowParams0[2], u_xlat0);
        output.TEXCOORD14.w = dot(VGlobals.gShadowParams0[3], u_xlat0);
    }
    u_xlat1.w = 1.0;
    u_xlat16_6.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat1));
    u_xlat16_6.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat1));
    u_xlat16_6.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat1));
    u_xlat16_4 = half4(u_xlat1.yzzx * u_xlat1.xyzz);
    u_xlat16_7.x = dot(VGlobals.gLightBuffer[3], u_xlat16_4);
    u_xlat16_7.y = dot(VGlobals.gLightBuffer[4], u_xlat16_4);
    u_xlat16_7.z = dot(VGlobals.gLightBuffer[5], u_xlat16_4);
    u_xlat16_30 = half(u_xlat1.y * u_xlat1.y);
    u_xlat16_30 = half(fma(u_xlat1.x, u_xlat1.x, (-float(u_xlat16_30))));
    u_xlat16_7.xyz = fma(VGlobals.gLightBuffer[6].xyz, half3(u_xlat16_30), u_xlat16_7.xyz);
    u_xlat16_6.xyz = u_xlat16_6.xyz + u_xlat16_7.xyz;
    u_xlat16_6.xyz = u_xlat16_6.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_6.xyz = max(u_xlat16_6.xyz, half3(0.0, 0.0, 0.0));
    output.TEXCOORD0.xyz = u_xlat0.xyz;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.xyz = u_xlat0.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    output.TEXCOORD3.xyz = half3(u_xlat2.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    output.TEXCOORD4.xyz = half3(u_xlat3.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat1.xyz);
    output.TEXCOORD8.xyz = float3(u_xlat16_6.xyz);
    return output;
}
