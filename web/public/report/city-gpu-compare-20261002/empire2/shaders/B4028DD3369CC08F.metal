#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    half4 gLightBuffer [116];
    float _FrameNum ;
    float _FrameRate ;
    float4 gPlanarShadowParams ;
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
    unity_Builtins0Array_Type unity_Builtins0Array [128];
};

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    half4 TEXCOORD0 [[ attribute(1) ]] ;
    half4 TEXCOORD1 [[ attribute(2) ]] ;
    half4 COLOR0 [[ attribute(3) ]] ;
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
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(2) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(3) ]],
    constant UnityInstancing_PerDraw0_Type& UnityInstancing_PerDraw0 [[ buffer(4) ]],
    sampler sampler_MorphTex [[ sampler (0) ]],
    texture2d<half, access::sample > _MorphTex [[ texture(0) ]] ,
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    int u_xlati0;
    float4 u_xlat1;
    float3 u_xlat2;
    float3 u_xlat3;
    float2 u_xlat6;
    float u_xlat9;
    u_xlati0 = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0 = u_xlati0 << 0x3;
    u_xlat3.x = UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].y + UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].x;
    u_xlat3.x = u_xlat3.x + UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].z;
    u_xlat3.x = fract(u_xlat3.x);
    u_xlat3.x = u_xlat3.x * VGlobals._FrameNum;
    u_xlat3.x = fma(UnityPerCamera._Time.y, VGlobals._FrameRate, u_xlat3.x);
    u_xlat6.x = floor(u_xlat3.x);
    u_xlat3.x = fract(u_xlat3.x);
    u_xlat6.xy = u_xlat6.xx + float2(-0.5, -1.5);
    u_xlat1.yw = u_xlat6.xy / float2(VGlobals._FrameNum);
    u_xlat1.xz = float2(input.TEXCOORD1.xx);
    u_xlat2.xyz = float3(_MorphTex.sample(sampler_MorphTex, u_xlat1.zw, level(0.0)).xyz);
    u_xlat1.xyz = float3(_MorphTex.sample(sampler_MorphTex, u_xlat1.xy, level(0.0)).xyz);
    u_xlat2.xyz = (-u_xlat1.xyz) + u_xlat2.xyz;
    u_xlat3.xyz = fma(u_xlat3.xxx, u_xlat2.xyz, u_xlat1.xyz);
    u_xlat3.xyz = u_xlat3.xyz * float3(0.00999999978, 0.00999999978, 0.00999999978);
    u_xlat1.xyz = u_xlat3.yyy * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat1.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, u_xlat3.xxx, u_xlat1.xyz);
    u_xlat3.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, u_xlat3.zzz, u_xlat1.xyz);
    u_xlat1.xyz = input.POSITION0.yyy * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat1.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, input.POSITION0.xxx, u_xlat1.xyz);
    u_xlat1.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, input.POSITION0.zzz, u_xlat1.xyz);
    u_xlat1.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].xyz, input.POSITION0.www, u_xlat1.xyz);
    u_xlat0.xyz = u_xlat3.xyz + u_xlat1.xyz;
    output.TEXCOORD1.xyz = u_xlat1.xyz;
    u_xlat9 = (-u_xlat0.y) + VGlobals.gPlanarShadowParams.x;
    u_xlat1.xyz = float3(u_xlat9) * float3(VGlobals.gLightBuffer[11].xyz);
    u_xlat1.xyz = u_xlat1.xyz / float3(VGlobals.gLightBuffer[11].yyy);
    u_xlat1.xyz = u_xlat0.xyz + u_xlat1.xyz;
    output.TEXCOORD0.xyz = u_xlat0.xyz;
    u_xlat0 = u_xlat1.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat0 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat1.xxxx, u_xlat0);
    u_xlat0 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat1.zzzz, u_xlat0);
    output.mtl_Position = u_xlat0 + UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3];
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    output.TEXCOORD3 = half4(0.0, 0.0, 0.0, 0.0);
    output.TEXCOORD4 = half4(0.0, 0.0, 0.0, 0.0);
    output.TEXCOORD5.xyz = half3(0.0, 0.0, 0.0);
    output.TEXCOORD8.xyz = float3(0.0, 0.0, 0.0);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
