#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct Globals_Type
{
    half4 _GlossyEnvironmentColor ;
    half4 _SubtractiveShadowColor ;
    float4 hlslcc_mtx4x4_InvCameraViewProj [4];
    float4 _ScaledScreenParams ;
    float4 _MainLightPosition ;
    half4 _MainLightColor ;
    half4 _AdditionalLightsCount ;
    float4 _AdditionalLightsPosition [32];
    half4 _AdditionalLightsColor [32];
    half4 _AdditionalLightsAttenuation [32];
    half4 _AdditionalLightsSpotDir [32];
    half4 _AdditionalLightsOcclusionProbes [32];
    float4 _Time ;
    float4 _SinTime ;
    float4 _CosTime ;
    float4 unity_DeltaTime ;
    float4 _TimeParameters ;
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
    float4 hlslcc_mtx4x4glstate_matrix_transpose_modelview0 [4];
    half4 glstate_lightmodel_ambient ;
    half4 unity_AmbientSky ;
    half4 unity_AmbientEquator ;
    half4 unity_AmbientGround ;
    half4 unity_IndirectSpecColor ;
    float4 unity_FogParams ;
    half4 unity_FogColor ;
    float4 hlslcc_mtx4x4glstate_matrix_projection [4];
    float4 hlslcc_mtx4x4unity_MatrixV [4];
    float4 hlslcc_mtx4x4unity_MatrixInvV [4];
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    float4 unity_StereoScaleOffset ;
    int unity_StereoEyeIndex ;
    half4 unity_ShadowColor ;
    float4 hlslcc_mtx4x4_PrevViewProjMatrix [4];
    float4 hlslcc_mtx4x4_ViewProjMatrix [4];
    float4 hlslcc_mtx4x4_NonJitteredViewProjMatrix [4];
    float4 hlslcc_mtx4x4_ViewMatrix [4];
    float4 hlslcc_mtx4x4_ProjMatrix [4];
    float4 hlslcc_mtx4x4_InvViewProjMatrix [4];
    float4 hlslcc_mtx4x4_InvViewMatrix [4];
    float4 hlslcc_mtx4x4_InvProjMatrix [4];
    float4 _InvProjParam ;
    float4 _ScreenSize ;
    float4 _FrustumPlanes [6];
    float _ScreenFade ;
    float2 _ReflectionRTSize ;
    float _WaterPlaneHeight ;
    float4 hlslcc_mtx4x4_VPMatrix [4];
    float4 hlslcc_mtx4x4_IVPMatrix [4];
};

kernel void computeMain(
    constant Globals_Type& Globals [[ buffer(0) ]],
    texture2d<half, access::sample > _CameraOpaqueTexture [[ texture(2) ]] ,
    texture2d<float, access::sample > _CameraDepthTexture [[ texture(3) ]] ,
    texture2d<half, access::write > Result [[ texture(0) ]] ,
    texture2d<float, access::read_write > Height [[ texture(1) ]] ,
    uint3 mtl_ThreadID [[ thread_position_in_grid ]])
{
    constexpr sampler PointClampSampler(filter::nearest,address::clamp_to_edge);
    constexpr sampler LinearClampSampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float2 u_xlat0;
    half4 u_xlat16_0;
    float4 u_xlat1;
    bool u_xlatb1;
    float4 u_xlat2;
    uint4 u_xlatu2;
    float2 u_xlat6;
    bool u_xlatb6;
    bool u_xlatb9;
    u_xlat0.xy = float2(mtl_ThreadID.xy);
    u_xlat0.xy = u_xlat0.xy + float2(0.5, 0.5);
    u_xlat0.xy = u_xlat0.xy / Globals._ReflectionRTSize.xxyx.yz;
    u_xlat6.x = _CameraDepthTexture.sample(PointClampSampler, u_xlat0.xy, level(0.0)).x;
    u_xlat1.xy = fma(u_xlat0.xy, float2(2.0, 2.0), float2(-1.0, -1.0));
    u_xlat2 = u_xlat1.yyyy * Globals.hlslcc_mtx4x4_IVPMatrix[1];
    u_xlat1 = fma(Globals.hlslcc_mtx4x4_IVPMatrix[0], u_xlat1.xxxx, u_xlat2);
    u_xlat1 = fma(Globals.hlslcc_mtx4x4_IVPMatrix[2], u_xlat6.xxxx, u_xlat1);
    u_xlat1 = u_xlat1 + Globals.hlslcc_mtx4x4_IVPMatrix[3];
    u_xlat1.xyz = u_xlat1.xyz / u_xlat1.www;
    u_xlatb6 = u_xlat1.y<Globals._WaterPlaneHeight;
    if(u_xlatb6){
        return;
    }
    u_xlat6.x = fma(Globals._WaterPlaneHeight, 2.0, (-u_xlat1.y));
    u_xlat2.xyz = u_xlat6.xxx * Globals.hlslcc_mtx4x4_VPMatrix[1].xyw;
    u_xlat2.xyz = fma(Globals.hlslcc_mtx4x4_VPMatrix[0].xyw, u_xlat1.xxx, u_xlat2.xyz);
    u_xlat1.xzw = fma(Globals.hlslcc_mtx4x4_VPMatrix[2].xyw, u_xlat1.zzz, u_xlat2.xyz);
    u_xlat1.xzw = u_xlat1.xzw + Globals.hlslcc_mtx4x4_VPMatrix[3].xyw;
    u_xlat6.xy = u_xlat1.xz / u_xlat1.ww;
    u_xlat2.xy = fma(u_xlat6.xy, float2(0.5, 0.5), float2(0.5, 0.5));
    u_xlat6.x = (-u_xlat2.y) + 1.0;
    u_xlatb9 = u_xlat2.x<0.0;
    u_xlatb1 = 1.0<u_xlat2.x;
    u_xlatb9 = u_xlatb9 || u_xlatb1;
    u_xlatb1 = u_xlat6.x<0.0;
    u_xlatb9 = u_xlatb9 || u_xlatb1;
    u_xlatb6 = 1.0<u_xlat6.x;
    u_xlatb6 = u_xlatb6 || u_xlatb9;
    if(u_xlatb6){
        return;
    }
    u_xlat2.z = (-u_xlat2.y) + 1.0;
    u_xlat2 = fma(u_xlat2.xzzz, Globals._ReflectionRTSize.xxyx.yzzz, float4(0.5, 0.5, 0.5, 0.5));
    u_xlatu2 = uint4(u_xlat2);
    u_xlat6.x = Height.read(u_xlatu2.xw).x;
    u_xlatb6 = u_xlat1.y<u_xlat6.x;
    if(u_xlatb6){
        u_xlat16_0.xyz = _CameraOpaqueTexture.sample(LinearClampSampler, u_xlat0.xy, level(0.0)).xyz;
        u_xlat16_0.w = half(1.0);
        Result.write(u_xlat16_0, u_xlatu2.xw);
        Height.write(u_xlat1.yyyy, u_xlatu2.xy);
    }
    return;
}
