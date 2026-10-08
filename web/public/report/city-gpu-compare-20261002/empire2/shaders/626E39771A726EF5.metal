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
    float2 _ReflectionRTSize ;
    float _WaterPlaneHeight ;
    float4 hlslcc_mtx4x4_VPMatrix [4];
    float4 hlslcc_mtx4x4_IVPMatrix [4];
    float _ScreenFade ;
    int _EdgeMode ;
};

uint bitFieldExtractU(uint width, uint offset, uint src);
uint bitFieldExtractU(uint width, uint offset, uint src)
{
	bool isWidthZero = (width == 0);
	bool needsClamp = ((width + offset) < 32);
	uint clampVersion = src << (32-(width+offset));
	clampVersion = clampVersion >> (32 - width);
	uint simpleVersion = src >> offset;
	uint res = select(simpleVersion, clampVersion, needsClamp);
	return select(res, (uint)0, isWidthZero);
}; 
kernel void computeMain(
    constant Globals_Type& Globals [[ buffer(0) ]],
    texture2d<half, access::sample > _CameraOpaqueTexture [[ texture(2) ]] ,
    texture2d<uint, access::read > ProjectionDataRT [[ texture(0) ]] ,
    texture2d<half, access::write > ReflectionColorRT [[ texture(1) ]] ,
    uint3 mtl_ThreadID [[ thread_position_in_grid ]])
{
    constexpr sampler LinearClampSampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float2 u_xlat0;
    uint u_xlatu0;
    float4 u_xlat1;
    half3 u_xlat16_2;
    uint u_xlatu3;
    bool u_xlatb3;
    uint u_xlatu6;
    u_xlatu0 = ProjectionDataRT.read(mtl_ThreadID.xy).x;
    u_xlatb3 = int(u_xlatu0)==int(0xffffffffu);
    if(u_xlatb3){
        ReflectionColorRT.write(half4(0.0, 0.0, 0.0, 0.0), mtl_ThreadID.xy);
        return;
    }
    u_xlatu3 = bitFieldExtractU(0xcu, 0x8u, u_xlatu0);
    u_xlatu6 = u_xlatu0 >> 0x14u;
    u_xlatu0 = u_xlatu0 & 0xffu;
    u_xlat0.x = float(u_xlatu0);
    u_xlat1.w = u_xlat0.x * 0.00392156886;
    u_xlat0.x = float(u_xlatu3);
    u_xlat0.y = float(u_xlatu6);
    u_xlat0.xy = u_xlat0.xy + float2(0.5, 0.5);
    u_xlat0.xy = u_xlat0.xy / Globals._ReflectionRTSize.xyxx.xy;
    u_xlat16_2.xyz = _CameraOpaqueTexture.sample(LinearClampSampler, u_xlat0.xy, level(0.0)).xyz;
    u_xlat1.xyz = float3(u_xlat16_2.xyz);
    ReflectionColorRT.write(half4(u_xlat1), mtl_ThreadID.xy);
    return;
}
