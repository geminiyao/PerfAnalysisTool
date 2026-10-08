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

struct UnityPerMaterial_Type
{
    float4 _FoamTex_ST ;
    half4 _WaterColor1 ;
    half4 _WaterColor2 ;
    float _ColorRange ;
    float _Distortion ;
    float _SpecularLevel ;
    float _EdgeOpacity ;
    float _Opacity ;
    half _OpacityMaskEnabled ;
    half _ShoreAlphaClip ;
    half _ShoreAlphaIntensity ;
    float _VertexWaveTiling ;
    float _VertexWaveSpeed ;
    float _VertexWaveIntensity ;
    float _VertexShoreTiling ;
    float _VertexShoreSpeed ;
    float _VertexShoreIntensity ;
    float4 _WaveDirection ;
    float _WPO_MasterSpeed ;
    float4 _WPO_WaveSpeed ;
    float4 _WPO_WaveScale ;
    float4 _WPO_WaveIntensity ;
    half4 _ShoreFoamColor ;
    float _ShoreDepthRange ;
    float _ShoreWaveFoamTiling ;
    float _ShoreWaveRampSize ;
    float _ShoreWaveNoiseClip ;
    float _ShoreAreaOffset ;
    float _ShoreWaveIntensity ;
    float _ShoreWaveBumpIntensity ;
    float _SpecularTiling ;
    float _SpecularIntensity ;
    float4 _SpecularPower ;
    float4 _SpecularDir ;
    float4 _NoiseScale ;
    float4 _ShoreMask_UV ;
    float t5_intensity ;
    float4 t5_uv1 ;
    float4 t5_uv2 ;
    float4 t5_control ;
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
    float4 TEXCOORD10 [[ user(TEXCOORD10) ]];
    float4 TEXCOORD11 [[ user(TEXCOORD11) ]];
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(2) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(3) ]],
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(4) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(5) ]],
    const constant unity_Builtins0Array_Type* UnityInstancing_PerDraw0 [[ buffer(6) ]],
    sampler sampler_NoiseTex [[ sampler (0) ]],
    sampler sampler_WaveNormal [[ sampler (1) ]],
    sampler sampler_ShoreNormal [[ sampler (2) ]],
    texture2d<half, access::sample > _NoiseTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _WaveNormal [[ texture(1) ]] ,
    texture2d<half, access::sample > _ShoreNormal [[ texture(2) ]] ,
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    float3 u_xlat1;
    float4 u_xlat2;
    float4 u_xlat3;
    float3 u_xlat4;
    half4 u_xlat16_4;
    float4 u_xlat5;
    float3 u_xlat6;
    half3 u_xlat16_7;
    half3 u_xlat16_8;
    float3 u_xlat9;
    float3 u_xlat10;
    float u_xlat18;
    float u_xlat19;
    float u_xlat27;
    int u_xlati28;
    u_xlat0.x = float(0.0);
    u_xlat0.z = float(0.0);
    u_xlat1.xyz = UnityPerMaterial._WPO_WaveIntensity.www * UnityPerMaterial._WPO_WaveIntensity.xyz;
    u_xlat27 = UnityPerCamera._Time.y * UnityPerMaterial._WPO_MasterSpeed;
    u_xlati28 = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati28 = u_xlati28 << 0x3;
    u_xlat2 = input.POSITION0.yyyy * UnityInstancing_PerDraw0[u_xlati28 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati28 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], input.POSITION0.xxxx, u_xlat2);
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati28 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], input.POSITION0.zzzz, u_xlat2);
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati28 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], input.POSITION0.wwww, u_xlat2);
    u_xlat3.xyz = u_xlat2.xxz / UnityPerMaterial._WPO_WaveScale.xyz;
    u_xlat3.xyz = fma((-float3(u_xlat27)), UnityPerMaterial._WPO_WaveSpeed.xyz, u_xlat3.xyz);
    u_xlat3.xyz = u_xlat3.xyz * float3(6.28318977, 6.28318977, 6.28318977);
    u_xlat3.xyz = sin(u_xlat3.xyz);
    u_xlat1.xy = u_xlat1.xy * u_xlat3.xy;
    u_xlat27 = u_xlat1.y + u_xlat1.x;
    u_xlat27 = fma(u_xlat1.z, u_xlat3.z, u_xlat27);
    u_xlat0.y = u_xlat27 + u_xlat27;
    u_xlat27 = u_xlat27 * 0.100000001;
    u_xlat1.xy = fma(u_xlat2.zx, float2(-0.00999999978, -0.00999999978), float2(u_xlat27));
    u_xlat1.xy = float2(_NoiseTex.sample(sampler_NoiseTex, u_xlat1.xy, level(0.0)).xy);
    u_xlat0.xyz = u_xlat0.xyz + u_xlat2.xyz;
    u_xlat3 = u_xlat0.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat3 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat3);
    u_xlat3 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat3);
    u_xlat3 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat2.wwww, u_xlat3);
    output.mtl_Position = u_xlat3;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD0.xyz = u_xlat0.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD1.xyz = u_xlat2.xyz;
    output.TEXCOORD2 = input.COLOR0;
    u_xlat4.xyz = float3(input.TANGENT0.yyy) * UnityInstancing_PerDraw0[u_xlati28 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat4.xyz = fma(UnityInstancing_PerDraw0[u_xlati28 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.TANGENT0.xxx), u_xlat4.xyz);
    u_xlat4.xyz = fma(UnityInstancing_PerDraw0[u_xlati28 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.TANGENT0.zzz), u_xlat4.xyz);
    u_xlat27 = dot(u_xlat4.xyz, u_xlat4.xyz);
    u_xlat27 = max(u_xlat27, 0.00100000005);
    u_xlat27 = rsqrt(u_xlat27);
    u_xlat4.xyz = float3(u_xlat27) * u_xlat4.xyz;
    output.TEXCOORD3.xyz = half3(u_xlat4.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    u_xlat5.xyz = float3(input.NORMAL0.yyy) * UnityInstancing_PerDraw0[u_xlati28 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat5.xyz = fma(UnityInstancing_PerDraw0[u_xlati28 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.NORMAL0.xxx), u_xlat5.xyz);
    u_xlat5.xyz = fma(UnityInstancing_PerDraw0[u_xlati28 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.NORMAL0.zzz), u_xlat5.xyz);
    u_xlat27 = dot(u_xlat5.xyz, u_xlat5.xyz);
    u_xlat27 = max(u_xlat27, 0.00100000005);
    u_xlat27 = rsqrt(u_xlat27);
    u_xlat5.xyz = float3(u_xlat27) * u_xlat5.xyz;
    u_xlat6.xyz = u_xlat4.yzx * u_xlat5.zxy;
    u_xlat4.xyz = fma(u_xlat5.yzx, u_xlat4.zxy, (-u_xlat6.xyz));
    u_xlat27 = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat4.xyz = float3(u_xlat27) * u_xlat4.xyz;
    u_xlat27 = dot(u_xlat4.xyz, u_xlat4.xyz);
    u_xlat27 = max(u_xlat27, 0.00100000005);
    u_xlat27 = rsqrt(u_xlat27);
    u_xlat4.xyz = float3(u_xlat27) * u_xlat4.xyz;
    output.TEXCOORD4.xyz = half3(u_xlat4.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat5.xyz);
    u_xlat16_7.x = half(u_xlat5.y * u_xlat5.y);
    u_xlat16_7.x = half(fma(u_xlat5.x, u_xlat5.x, (-float(u_xlat16_7.x))));
    u_xlat16_4 = half4(u_xlat5.yzzx * u_xlat5.xyzz);
    u_xlat16_8.x = dot(VGlobals.gLightBuffer[3], u_xlat16_4);
    u_xlat16_8.y = dot(VGlobals.gLightBuffer[4], u_xlat16_4);
    u_xlat16_8.z = dot(VGlobals.gLightBuffer[5], u_xlat16_4);
    u_xlat16_7.xyz = fma(VGlobals.gLightBuffer[6].xyz, u_xlat16_7.xxx, u_xlat16_8.xyz);
    u_xlat5.w = 1.0;
    u_xlat16_8.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat5));
    u_xlat16_8.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat5));
    u_xlat16_8.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat5));
    u_xlat16_7.xyz = u_xlat16_7.xyz + u_xlat16_8.xyz;
    u_xlat16_7.xyz = u_xlat16_7.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_7.xyz = max(u_xlat16_7.xyz, half3(0.0, 0.0, 0.0));
    output.TEXCOORD8.xyz = float3(u_xlat16_7.xyz);
    u_xlat9.x = u_xlat0.y * UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[1].z;
    u_xlat0.x = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[0].z, u_xlat0.x, u_xlat9.x);
    u_xlat0.x = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[2].z, u_xlat0.z, u_xlat0.x);
    u_xlat0.x = u_xlat0.x + UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[3].z;
    output.TEXCOORD9.z = (-u_xlat0.x);
    u_xlat16_7.xyz = half3(u_xlat3.xyw * float3(0.5, 0.5, 0.5));
    output.TEXCOORD9.w = u_xlat3.w;
    u_xlat16_8.x = u_xlat16_7.z + u_xlat16_7.x;
    u_xlat16_8.y = half(fma(float(u_xlat16_7.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_7.z)));
    output.TEXCOORD9.xy = float2(u_xlat16_8.xy);
    u_xlat0.xyz = u_xlat2.xzx / float3(UnityPerMaterial._VertexWaveTiling, UnityPerMaterial._VertexShoreTiling, UnityPerMaterial._VertexShoreTiling);
    u_xlat9.x = dot(u_xlat0.yz, UnityPerMaterial._WaveDirection.zw);
    u_xlat0.x = u_xlat0.x + UnityPerCamera._Time.y;
    u_xlat0.x = u_xlat0.x * UnityPerMaterial._VertexWaveSpeed;
    u_xlat9.x = u_xlat9.x + (-UnityPerCamera._Time.y);
    u_xlat0.y = u_xlat9.x * UnityPerMaterial._VertexShoreSpeed;
    u_xlat0.xy = u_xlat0.xy * float2(63.0, 63.0);
    u_xlat18 = floor(u_xlat0.y);
    u_xlat9.x = fract(u_xlat0.y);
    u_xlat27 = u_xlat18 + 1.0;
    u_xlat3.w = fma(u_xlat18, 0.015625, 0.0078125);
    u_xlat3.y = fma(u_xlat27, 0.015625, 0.0078125);
    u_xlat3.xz = float2(input.TEXCOORD1.xx);
    u_xlat5.xyz = float3(_ShoreNormal.sample(sampler_ShoreNormal, u_xlat3.xy, level(0.0)).xyz);
    u_xlat3.xyz = float3(_ShoreNormal.sample(sampler_ShoreNormal, u_xlat3.zw, level(0.0)).xyz);
    u_xlat16_7.xyz = half3((-u_xlat3.xyz) + u_xlat5.xyz);
    u_xlat16_7.xyz = half3(fma(u_xlat9.xxx, float3(u_xlat16_7.xyz), u_xlat3.xyz));
    u_xlat16_7.xyz = fma(u_xlat16_7.xyz, half3(2.0, 2.0, 2.0), half3(-1.0, -1.0, -1.0));
    u_xlat9.xyz = u_xlat1.yyy * float3(u_xlat16_7.xyz);
    u_xlat9.xyz = u_xlat9.xyz * float3(UnityPerMaterial._VertexShoreIntensity);
    u_xlat10.x = floor(u_xlat0.x);
    u_xlat0.x = fract(u_xlat0.x);
    u_xlat19 = u_xlat10.x + 1.0;
    u_xlat3.w = fma(u_xlat10.x, 0.015625, 0.0078125);
    u_xlat3.y = fma(u_xlat19, 0.015625, 0.0078125);
    u_xlat3.xz = float2(input.TEXCOORD1.xx);
    u_xlat10.xyz = float3(_WaveNormal.sample(sampler_WaveNormal, u_xlat3.xy, level(0.0)).xyz);
    u_xlat3.xyz = float3(_WaveNormal.sample(sampler_WaveNormal, u_xlat3.zw, level(0.0)).xyz);
    u_xlat16_7.xyz = half3(u_xlat10.xyz + (-u_xlat3.xyz));
    u_xlat16_7.xyz = half3(fma(u_xlat0.xxx, float3(u_xlat16_7.xyz), u_xlat3.xyz));
    u_xlat16_7.xyz = fma(u_xlat16_7.xyz, half3(2.0, 2.0, 2.0), half3(-1.0, -1.0, -1.0));
    u_xlat1.xyz = u_xlat1.xxx * float3(u_xlat16_7.xyz);
    output.TEXCOORD10.xyz = fma(u_xlat1.xyz, float3(UnityPerMaterial._VertexWaveIntensity), u_xlat9.xyz);
    u_xlat0.x = u_xlat2.x / UnityPerMaterial.t5_control.z;
    u_xlat9.xy = u_xlat2.zx * float2(1.0, -1.0);
    u_xlat9.xy = u_xlat9.xy / float2(UnityPerMaterial._SpecularTiling);
    u_xlat0.x = fma(UnityPerCamera._Time.y, UnityPerMaterial.t5_control.y, u_xlat0.x);
    u_xlat0.x = u_xlat0.x * UnityPerMaterial.t5_control.w;
    u_xlat0.x = sin(u_xlat0.x);
    output.TEXCOORD10.w = u_xlat0.x * UnityPerMaterial.t5_control.x;
    u_xlat0.xw = UnityPerCamera._Time.yy * float2(-0.0250000004, -0.0500000007);
    output.TEXCOORD11.zw = fma(u_xlat9.xy, float2(1.5, 1.5), u_xlat0.xw);
    output.TEXCOORD11.xy = fma(UnityPerCamera._Time.yy, float2(0.0500000007, 0.0250000004), u_xlat9.xy);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
