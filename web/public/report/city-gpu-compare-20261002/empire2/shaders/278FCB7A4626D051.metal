#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    half4 gLightBuffer [116];
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

struct UnityPerMaterial_Type
{
    half _ShadowFadeStart ;
    half _ShadowFadeEnd ;
    half _ShadowMinAmount ;
    half _ShadowIntensity ;
    float4 _FoamTex_ST ;
    half4 _WaterColor1 ;
    half4 _WaterColor2 ;
    half4 _WaterColorLod ;
    half _ColorRange ;
    half _ColorRangeChangeRate ;
    half _RefractionDistortion ;
    half _Distortion ;
    half _EdgeOpacity ;
    half _Opacity ;
    half _OpacityLOD ;
    half _VertexAlphaForOpacity ;
    half _VertexAlphaClip ;
    half _VertexAlphaIntensity ;
    half _WPO_MasterSpeed ;
    half4 _WPO_WaveSpeed ;
    half4 _WPO_WaveScale ;
    half4 _WPO_WaveIntensity ;
    half _ShoreDepthRange ;
    half _ShoreDepthRangeNew ;
    half _ShoreWaveFoamTiling ;
    half _ShoreWaveRampSize ;
    half _ShoreWaveNoiseClip ;
    half _ShoreAreaOffset ;
    half _FoamIntensity ;
    half _ShoreWaveBumpIntensity ;
    half _ShoreFoamSpeed ;
    half _ShoreFoamOffset ;
    half _ShoreFoamVariation ;
    half _ShoreWaveSpeed ;
    half _ShoreIntersectionClipping ;
    half _ShoreFoamDistortion ;
    half _ShoreEdgeFoamRange ;
    half4 _FoamColor ;
    half _IntersectionLength ;
    half _IntersectionClipping ;
    half _IntersectionFalloff ;
    half _IntersectionTiling ;
    half _IntersectionSpeed ;
    half _IntersectionRippleDist ;
    half _IntersectionRippleStrength ;
    half _SpecularTiling ;
    half _SpecularIntensity ;
    half4 _SpecularPower ;
    half4 _SpecularDir ;
    half4 _NoiseScale ;
    half t5_intensity ;
    half t5_uv_rotation ;
    float4 t5_uv1 ;
    float4 t5_uv2 ;
    half4 t5_control ;
    half _DisableDepthFade_FromCameraHeight ;
    half _DisableDepthFade_CameraHeightRange ;
    half _RefractFadeHeight ;
    half _RefractFadeRange ;
    half _RoughnessFadeHeight ;
    half _RoughnessFadeRange ;
    half _DepthVertical ;
    half _DepthHorizontal ;
    half _VertexColorForDepth ;
    half _VertexRIntensity ;
    half _WaterSpecularNormalStrength ;
    half _ReflectionFresnel ;
    half _ReflectionStrength ;
    half _SpecularLevel ;
    half _PRStrength ;
    half4 _PlanarReflectionTintColor ;
    half _PRDistanceFadeStart ;
    half _PRDistanceFadeEnd ;
    half _TranslucencyStrength ;
    half _TranslucencyExp ;
    half _TranslucencyCurvatureMask ;
    half _TranslucencyReflectionMask ;
    half _BlinnPhongSpecPower ;
    half4 _CausticColor ;
    half _CausticDepth ;
    half _CausticDistance ;
    half _CausticDistortionValue ;
    half _CausticFade ;
    half _CausticFadeExponent ;
    half _CausticShadowEnable ;
    half4 _CausticUVDirSpeedScale ;
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
    unity_Builtins0Array_Type unity_Builtins0Array [128];
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
    float4 TEXCOORD9 [[ user(TEXCOORD9) ]];
    float4 TEXCOORD15 [[ user(TEXCOORD15) ]];
    float4 TEXCOORD11 [[ user(TEXCOORD11) ]];
    float4 TEXCOORD12 [[ user(TEXCOORD12) ]];
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(2) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(3) ]],
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(4) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(5) ]],
    constant UnityInstancing_PerDraw0_Type& UnityInstancing_PerDraw0 [[ buffer(6) ]],
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    float4 u_xlat1;
    half3 u_xlat16_1;
    float3 u_xlat2;
    half4 u_xlat16_2;
    int u_xlati2;
    float4 u_xlat3;
    float4 u_xlat4;
    float3 u_xlat5;
    half3 u_xlat16_6;
    half3 u_xlat16_7;
    float u_xlat8;
    float3 u_xlat10;
    float u_xlat24;
    u_xlat0.x = float(0.0);
    u_xlat0.z = float(0.0);
    u_xlat16_1.xyz = UnityPerMaterial._WPO_WaveIntensity.www * UnityPerMaterial._WPO_WaveIntensity.xyz;
    u_xlat24 = UnityPerCamera._Time.y * float(UnityPerMaterial._WPO_MasterSpeed);
    u_xlati2 = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati2 = u_xlati2 << 0x3;
    u_xlat3 = input.POSITION0.yyyy * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati2 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat3 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati2 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], input.POSITION0.xxxx, u_xlat3);
    u_xlat3 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati2 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], input.POSITION0.zzzz, u_xlat3);
    u_xlat3 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati2 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], input.POSITION0.wwww, u_xlat3);
    u_xlat10.xyz = u_xlat3.xxz / float3(UnityPerMaterial._WPO_WaveScale.xyz);
    u_xlat10.xyz = fma((-float3(u_xlat24)), float3(UnityPerMaterial._WPO_WaveSpeed.xyz), u_xlat10.xyz);
    u_xlat10.xyz = u_xlat10.xyz * float3(6.28318977, 6.28318977, 6.28318977);
    u_xlat10.xyz = sin(u_xlat10.xyz);
    u_xlat10.xy = float2(u_xlat16_1.xy) * u_xlat10.xy;
    u_xlat24 = u_xlat10.y + u_xlat10.x;
    u_xlat24 = fma(float(u_xlat16_1.z), u_xlat10.z, u_xlat24);
    u_xlat0.y = u_xlat24 + u_xlat24;
    u_xlat0.xyz = u_xlat0.xyz + u_xlat3.xyz;
    u_xlat1 = u_xlat0.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat1 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat1);
    u_xlat1 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat3.wwww, u_xlat1);
    output.mtl_Position = u_xlat1;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD0.xyz = u_xlat0.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD1.xyz = u_xlat3.xyz;
    output.TEXCOORD2 = input.COLOR0;
    u_xlat10.xyz = float3(input.TANGENT0.yyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati2 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat10.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati2 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.TANGENT0.xxx), u_xlat10.xyz);
    u_xlat10.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati2 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.TANGENT0.zzz), u_xlat10.xyz);
    u_xlat24 = dot(u_xlat10.xyz, u_xlat10.xyz);
    u_xlat24 = max(u_xlat24, 0.00100000005);
    u_xlat24 = rsqrt(u_xlat24);
    u_xlat10.xyz = float3(u_xlat24) * u_xlat10.xyz;
    output.TEXCOORD3.xyz = half3(u_xlat10.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    u_xlat4.xyz = float3(input.NORMAL0.yyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati2 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat4.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati2 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.NORMAL0.xxx), u_xlat4.xyz);
    u_xlat4.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati2 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.NORMAL0.zzz), u_xlat4.xyz);
    u_xlat24 = dot(u_xlat4.xyz, u_xlat4.xyz);
    u_xlat24 = max(u_xlat24, 0.00100000005);
    u_xlat24 = rsqrt(u_xlat24);
    u_xlat4.xyz = float3(u_xlat24) * u_xlat4.xyz;
    u_xlat5.xyz = u_xlat10.yzx * u_xlat4.zxy;
    u_xlat2.xyz = fma(u_xlat4.yzx, u_xlat10.zxy, (-u_xlat5.xyz));
    u_xlat24 = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat2.xyz = float3(u_xlat24) * u_xlat2.xyz;
    u_xlat24 = dot(u_xlat2.xyz, u_xlat2.xyz);
    u_xlat24 = max(u_xlat24, 0.00100000005);
    u_xlat24 = rsqrt(u_xlat24);
    u_xlat2.xyz = float3(u_xlat24) * u_xlat2.xyz;
    output.TEXCOORD4.xyz = half3(u_xlat2.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat4.xyz);
    u_xlat16_6.x = half(u_xlat4.y * u_xlat4.y);
    u_xlat16_6.x = half(fma(u_xlat4.x, u_xlat4.x, (-float(u_xlat16_6.x))));
    u_xlat16_2 = half4(u_xlat4.yzzx * u_xlat4.xyzz);
    u_xlat16_7.x = dot(VGlobals.gLightBuffer[3], u_xlat16_2);
    u_xlat16_7.y = dot(VGlobals.gLightBuffer[4], u_xlat16_2);
    u_xlat16_7.z = dot(VGlobals.gLightBuffer[5], u_xlat16_2);
    u_xlat16_6.xyz = fma(VGlobals.gLightBuffer[6].xyz, u_xlat16_6.xxx, u_xlat16_7.xyz);
    u_xlat4.w = 1.0;
    u_xlat16_7.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat4));
    u_xlat16_7.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat4));
    u_xlat16_7.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat4));
    u_xlat16_6.xyz = u_xlat16_6.xyz + u_xlat16_7.xyz;
    u_xlat16_6.xyz = u_xlat16_6.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_6.xyz = max(u_xlat16_6.xyz, half3(0.0, 0.0, 0.0));
    output.TEXCOORD8.xyz = float3(u_xlat16_6.xyz);
    u_xlat8 = u_xlat0.y * UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[1].z;
    u_xlat0.x = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[0].z, u_xlat0.x, u_xlat8);
    u_xlat0.x = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[2].z, u_xlat0.z, u_xlat0.x);
    u_xlat0.x = u_xlat0.x + UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[3].z;
    output.TEXCOORD9.z = (-u_xlat0.x);
    u_xlat16_6.xyz = half3(u_xlat1.xyw * float3(0.5, 0.5, 0.5));
    output.TEXCOORD9.w = u_xlat1.w;
    u_xlat16_7.x = u_xlat16_6.z + u_xlat16_6.x;
    u_xlat16_7.y = half(fma(float(u_xlat16_6.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_6.z)));
    output.TEXCOORD9.xy = float2(u_xlat16_7.xy);
    u_xlat0.x = u_xlat3.x / float(UnityPerMaterial.t5_control.z);
    u_xlat0.x = fma(UnityPerCamera._Time.y, float(UnityPerMaterial.t5_control.y), u_xlat0.x);
    u_xlat0.x = u_xlat0.x * float(UnityPerMaterial.t5_control.w);
    u_xlat0.x = sin(u_xlat0.x);
    output.TEXCOORD15.w = u_xlat0.x * float(UnityPerMaterial.t5_control.x);
    output.TEXCOORD15.xyz = float3(0.0, 0.0, 1.0);
    u_xlat0 = u_xlat3.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat0 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat3.xxxx, u_xlat0);
    u_xlat0 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat3.zzzz, u_xlat0);
    u_xlat3.xy = u_xlat3.zx * float2(1.0, -1.0);
    u_xlat3.xy = u_xlat3.xy / float2(UnityPerMaterial._SpecularTiling);
    output.TEXCOORD11 = u_xlat0 + UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3];
    u_xlat0.xy = UnityPerCamera._Time.yy * float2(-0.0250000004, -0.0500000007);
    output.TEXCOORD12.zw = fma(u_xlat3.xy, float2(1.5, 1.5), u_xlat0.xy);
    output.TEXCOORD12.xy = fma(UnityPerCamera._Time.yy, float2(0.0500000007, 0.0250000004), u_xlat3.xy);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
