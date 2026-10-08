#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct Globals_Type
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
    float4 unity_CameraWorldClipPlanes [6];
    float4 hlslcc_mtx4x4unity_CameraProjection [4];
    float4 hlslcc_mtx4x4unity_CameraInvProjection [4];
    float4 hlslcc_mtx4x4unity_WorldToCamera [4];
    float4 hlslcc_mtx4x4unity_CameraToWorld [4];
    float4 _WorldSpaceLightPos0 ;
    float4 _LightPositionRange ;
    float4 _LightProjectionParams ;
    float4 unity_4LightPosX0 ;
    float4 unity_4LightPosY0 ;
    float4 unity_4LightPosZ0 ;
    half4 unity_4LightAtten0 ;
    half4 unity_LightColor [8];
    float4 unity_LightPosition [8];
    half4 unity_LightAtten [8];
    float4 unity_SpotDirection [8];
    half4 unity_SHAr ;
    half4 unity_SHAg ;
    half4 unity_SHAb ;
    half4 unity_SHBr ;
    half4 unity_SHBg ;
    half4 unity_SHBb ;
    half4 unity_SHC ;
    half4 unity_OcclusionMaskSelector ;
    half4 unity_ProbesOcclusion ;
    half3 unity_LightColor0 ;
    half3 unity_LightColor1 ;
    half3 unity_LightColor2 ;
    half3 unity_LightColor3 ;
    float4 unity_ShadowSplitSpheres [4];
    float4 unity_ShadowSplitSqRadii ;
    float4 unity_LightShadowBias ;
    float4 _LightSplitsNear ;
    float4 _LightSplitsFar ;
    float4 hlslcc_mtx4x4unity_WorldToShadow [16];
    half4 _LightShadowData ;
    float4 unity_ShadowFadeCenterAndType ;
    float4 hlslcc_mtx4x4unity_ObjectToWorld [4];
    float4 hlslcc_mtx4x4unity_WorldToObject [4];
    float4 unity_LODFade ;
    float4 unity_WorldTransformParams ;
    float4 unity_RenderingLayer ;
    float4 hlslcc_mtx4x4glstate_matrix_transpose_modelview0 [4];
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
    half4 unity_FogColor ;
    float4 unity_FogParams ;
    float4 unity_LightmapST ;
    float4 unity_DynamicLightmapST ;
    float4 unity_SpecCube0_BoxMax ;
    float4 unity_SpecCube0_BoxMin ;
    float4 unity_SpecCube0_ProbePosition ;
    half4 unity_SpecCube0_HDR ;
    float4 unity_SpecCube1_BoxMax ;
    float4 unity_SpecCube1_BoxMin ;
    float4 unity_SpecCube1_ProbePosition ;
    half4 unity_SpecCube1_HDR ;
    half4 unity_Lightmap_HDR ;
    half4 unity_DynamicLightmap_HDR ;
    float4 _DepthMinMax_TexelSize ;
    float4 _CameraDepthTexture_TexelSize ;
};

kernel void computeMain(
    constant Globals_Type& Globals [[ buffer(0) ]],
    texture2d<float, access::sample > _CameraDepthTexture [[ texture(1) ]] ,
    texture2d<float, access::write > _DepthMinMaxTex [[ texture(0) ]] ,
    uint3 mtl_ThreadID [[ thread_position_in_grid ]])
{
    constexpr sampler PointClampSampler(filter::nearest,address::clamp_to_edge);
    float4 u_xlat0;
    bool u_xlatb0;
    float2 u_xlat1;
    int2 u_xlati2;
    bool u_xlatb2;
    u_xlat0.x = Globals._DepthMinMax_TexelSize.x + (-Globals._CameraDepthTexture_TexelSize.x);
    u_xlatb0 = 9.99999975e-06>=abs(u_xlat0.x);
    if(u_xlatb0){
        u_xlat0.xy = float2(mtl_ThreadID.xy);
        u_xlat0.xy = u_xlat0.xy + float2(0.5, 0.5);
        u_xlat0.xy = u_xlat0.xy * Globals._CameraDepthTexture_TexelSize.xy;
        u_xlat0.x = _CameraDepthTexture.sample(PointClampSampler, u_xlat0.xy, level(0.0)).x;
        _DepthMinMaxTex.write(u_xlat0.xxxx, mtl_ThreadID.xy);
        return;
    }
    u_xlat0.xy = float2(mtl_ThreadID.xy);
    u_xlat0.xy = u_xlat0.xy + float2(0.5, 0.5);
    u_xlat0.xy = u_xlat0.xy * Globals._DepthMinMax_TexelSize.xy;
    u_xlat0 = _CameraDepthTexture.gather(PointClampSampler, u_xlat0.xy);
    u_xlat1.xy = max(u_xlat0.yw, u_xlat0.xz);
    u_xlat1.x = max(u_xlat1.y, u_xlat1.x);
    u_xlat0.xy = min(u_xlat0.yw, u_xlat0.xz);
    u_xlat0.x = min(u_xlat0.y, u_xlat0.x);
    u_xlati2.xy = int2(mtl_ThreadID.xy & uint2(0x1u, 0x1u));
    u_xlatb2 = u_xlati2.y==u_xlati2.x;
    u_xlat0.x = (u_xlatb2) ? u_xlat0.x : u_xlat1.x;
    _DepthMinMaxTex.write(u_xlat0.xxxx, mtl_ThreadID.xy);
    return;
}
