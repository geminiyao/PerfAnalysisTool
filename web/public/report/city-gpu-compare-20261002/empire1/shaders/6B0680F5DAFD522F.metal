#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    half4 gLightBuffer [115];
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

struct UnityDrawCallInfo_Type
{
    int unity_BaseInstanceID ;
    int unity_InstanceCount ;
};

struct unity_Builtins0Array_Type
{
    float4 hlslcc_mtx4x4unity_ObjectToWorldArray [4];
    float4 hlslcc_mtx4x4unity_WorldToObjectArray [4];
};

struct UnityInstancing_PerDraw0_Type
{
    unity_Builtins0Array_Type unity_Builtins0Array [2];
};

struct UnityPerMaterial_Type
{
    half4 _MainTex_ST ;
    half4 _TintColorHDR ;
    half4 _RoughnessScale ;
    half _Roughness ;
    half4 _Metallic ;
    half _TextureLodBias ;
    half _VertexOcclusionIntensity ;
    float _FrameNum ;
    float _FrameRate ;
    half _AlphaControl ;
    half4 _WeaponNoise_ST ;
    half4 _WpemissiveColor ;
    half _WpemissiveIntensity ;
    half _IsWeapon ;
    half _FlowSpeed ;
    half _FlowShappen ;
    half _FlowWeight ;
    half _FlowRotate ;
    half _WpNoiseMin ;
    half _WpNoiseMax ;
    half _WpNoiseIntensity ;
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
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(2) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(3) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(4) ]],
    const constant unity_Builtins0Array_Type* UnityInstancing_PerDraw0 [[ buffer(5) ]],
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(6) ]],
    sampler sampler_MorphTex [[ sampler (0) ]],
    texture2d<half, access::sample > _MorphTex [[ texture(0) ]] ,
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    half4 u_xlat16_0;
    float4 u_xlat1;
    int u_xlati1;
    float4 u_xlat2;
    float4 u_xlat3;
    half3 u_xlat16_4;
    half3 u_xlat16_5;
    float3 u_xlat7;
    float2 u_xlat13;
    float u_xlat18;
    u_xlat0.xz = float2(input.TEXCOORD1.xx);
    u_xlati1 = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati1 = u_xlati1 << 0x3;
    u_xlat7.x = UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].y + UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].x;
    u_xlat7.x = u_xlat7.x + UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].z;
    u_xlat7.x = fract(u_xlat7.x);
    u_xlat7.x = u_xlat7.x * UnityPerMaterial._FrameNum;
    u_xlat7.x = fma(UnityPerCamera._Time.y, UnityPerMaterial._FrameRate, u_xlat7.x);
    u_xlat13.x = floor(u_xlat7.x);
    u_xlat7.x = fract(u_xlat7.x);
    u_xlat13.xy = u_xlat13.xx + float2(-0.5, -1.5);
    u_xlat0.yw = u_xlat13.xy / float2(UnityPerMaterial._FrameNum);
    u_xlat2.xyz = float3(_MorphTex.sample(sampler_MorphTex, u_xlat0.zw, level(0.0)).xyz);
    u_xlat0.xyz = float3(_MorphTex.sample(sampler_MorphTex, u_xlat0.xy, level(0.0)).xyz);
    u_xlat2.xyz = (-u_xlat0.xyz) + u_xlat2.xyz;
    u_xlat0.xyz = fma(u_xlat7.xxx, u_xlat2.xyz, u_xlat0.xyz);
    u_xlat0.xyz = u_xlat0.xyz * float3(0.00999999978, 0.00999999978, 0.00999999978);
    u_xlat7.xyz = u_xlat0.yyy * UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat0.xyw = fma(UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, u_xlat0.xxx, u_xlat7.xyz);
    u_xlat0.xyz = fma(UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, u_xlat0.zzz, u_xlat0.xyw);
    u_xlat2 = input.POSITION0.yyyy * UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], input.POSITION0.xxxx, u_xlat2);
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], input.POSITION0.zzzz, u_xlat2);
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], input.POSITION0.wwww, u_xlat2);
    u_xlat0.xyz = u_xlat0.xyz + u_xlat2.xyz;
    u_xlat3 = u_xlat0.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat3 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat3);
    u_xlat3 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat3);
    output.TEXCOORD0.xyz = u_xlat0.xyz;
    output.mtl_Position = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat2.wwww, u_xlat3);
    output.TEXCOORD1.xyz = u_xlat2.xyz;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    u_xlat0.xyz = float3(input.TANGENT0.yyy) * UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat0.xyz = fma(UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.TANGENT0.xxx), u_xlat0.xyz);
    u_xlat0.xyz = fma(UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.TANGENT0.zzz), u_xlat0.xyz);
    u_xlat18 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat18 = max(u_xlat18, 0.00100000005);
    u_xlat18 = rsqrt(u_xlat18);
    u_xlat0.xyz = float3(u_xlat18) * u_xlat0.xyz;
    output.TEXCOORD3.xyz = half3(u_xlat0.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    u_xlat7.xyz = float3(input.NORMAL0.yyy) * UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat7.xyz = fma(UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.NORMAL0.xxx), u_xlat7.xyz);
    u_xlat1.xyz = fma(UnityInstancing_PerDraw0[u_xlati1 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.NORMAL0.zzz), u_xlat7.xyz);
    u_xlat18 = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat18 = max(u_xlat18, 0.00100000005);
    u_xlat18 = rsqrt(u_xlat18);
    u_xlat1.xyz = float3(u_xlat18) * u_xlat1.xyz;
    u_xlat2.xyz = u_xlat0.yzx * u_xlat1.zxy;
    u_xlat0.xyz = fma(u_xlat1.yzx, u_xlat0.zxy, (-u_xlat2.xyz));
    u_xlat18 = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat0.xyz = float3(u_xlat18) * u_xlat0.xyz;
    u_xlat18 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat18 = max(u_xlat18, 0.00100000005);
    u_xlat18 = rsqrt(u_xlat18);
    u_xlat0.xyz = float3(u_xlat18) * u_xlat0.xyz;
    output.TEXCOORD4.xyz = half3(u_xlat0.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat1.xyz);
    u_xlat16_4.x = half(u_xlat1.y * u_xlat1.y);
    u_xlat16_4.x = half(fma(u_xlat1.x, u_xlat1.x, (-float(u_xlat16_4.x))));
    u_xlat16_0 = half4(u_xlat1.yzzx * u_xlat1.xyzz);
    u_xlat16_5.x = dot(VGlobals.gLightBuffer[3], u_xlat16_0);
    u_xlat16_5.y = dot(VGlobals.gLightBuffer[4], u_xlat16_0);
    u_xlat16_5.z = dot(VGlobals.gLightBuffer[5], u_xlat16_0);
    u_xlat16_4.xyz = fma(VGlobals.gLightBuffer[6].xyz, u_xlat16_4.xxx, u_xlat16_5.xyz);
    u_xlat1.w = 1.0;
    u_xlat16_5.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat1));
    u_xlat16_5.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat1));
    u_xlat16_5.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat1));
    u_xlat16_4.xyz = u_xlat16_4.xyz + u_xlat16_5.xyz;
    u_xlat16_4.xyz = u_xlat16_4.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_4.xyz = max(u_xlat16_4.xyz, half3(0.0, 0.0, 0.0));
    output.TEXCOORD8.xyz = float3(u_xlat16_4.xyz);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
