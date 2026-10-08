#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    half4 gLightBuffer [116];
    float4 _boneTexture_TexelSize ;
    float4 gPlanarShadowParams ;
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

struct AnimPropsArray_Type
{
    float4 FrameIndices ;
    float4 LerpWeights ;
};

struct UnityInstancing_AnimProps_Type
{
    AnimPropsArray_Type AnimPropsArray [128];
};

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    half4 TEXCOORD0 [[ attribute(1) ]] ;
    half4 TEXCOORD2 [[ attribute(2) ]] ;
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
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(1) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(2) ]],
    constant UnityInstancing_PerDraw0_Type& UnityInstancing_PerDraw0 [[ buffer(3) ]],
    constant UnityInstancing_AnimProps_Type& UnityInstancing_AnimProps [[ buffer(4) ]],
    sampler sampler_boneTexture [[ sampler (0) ]],
    texture2d<float, access::sample > _boneTexture [[ texture(0) ]] ,
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    half u_xlat16_0;
    float4 u_xlat1;
    uint u_xlatu1;
    float4 u_xlat2;
    float4 u_xlat3;
    float u_xlat5;
    int2 u_xlati5;
    float u_xlat13;
    u_xlat16_0 = rint(input.TEXCOORD2.x);
    u_xlatu1 = uint(float(u_xlat16_0));
    u_xlatu1 = u_xlatu1 * 0x3u;
    u_xlat1.x = float(u_xlatu1);
    u_xlati5.x = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati5.xy = u_xlati5.xx << int2(0x1, 0x3);
    u_xlat1.x = u_xlat1.x + UnityInstancing_AnimProps.AnimPropsArray[u_xlati5.x / 2].FrameIndices.y;
    u_xlat1.x = u_xlat1.x + 0.5;
    u_xlat0.z = fma(u_xlat1.x, VGlobals._boneTexture_TexelSize.y, VGlobals._boneTexture_TexelSize.y);
    u_xlat0.y = u_xlat1.x * VGlobals._boneTexture_TexelSize.y;
    u_xlat1.x = 0.5 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati5.x / 2].FrameIndices.x;
    u_xlat1.x = u_xlat1.x + UnityInstancing_AnimProps.AnimPropsArray[u_xlati5.x / 2].LerpWeights.x;
    u_xlat0.x = u_xlat1.x * VGlobals._boneTexture_TexelSize.x;
    u_xlat2 = _boneTexture.sample(sampler_boneTexture, u_xlat0.xz, level(0.0));
    u_xlat0.w = u_xlat0.z + VGlobals._boneTexture_TexelSize.y;
    u_xlat3 = _boneTexture.sample(sampler_boneTexture, u_xlat0.xw, level(0.0));
    u_xlat0 = _boneTexture.sample(sampler_boneTexture, u_xlat0.xy, level(0.0));
    u_xlat1.x = dot(input.POSITION0, u_xlat0);
    u_xlat5 = dot(input.POSITION0, u_xlat3);
    u_xlat13 = dot(input.POSITION0, u_xlat2);
    u_xlat2.xyz = float3(u_xlat13) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati5.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat2.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati5.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, u_xlat1.xxx, u_xlat2.xyz);
    u_xlat1.xyw = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati5.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(u_xlat5), u_xlat2.xyz);
    u_xlat1.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati5.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].xyz, input.POSITION0.www, u_xlat1.xyw);
    u_xlat13 = (-u_xlat1.y) + VGlobals.gPlanarShadowParams.x;
    u_xlat2.xyz = float3(u_xlat13) * float3(VGlobals.gLightBuffer[11].xyz);
    u_xlat2.xyz = u_xlat2.xyz / float3(VGlobals.gLightBuffer[11].yyy);
    u_xlat2.xyz = u_xlat1.xyz + u_xlat2.xyz;
    u_xlat0 = u_xlat2.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat0 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat2.xxxx, u_xlat0);
    u_xlat0 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat2.zzzz, u_xlat0);
    output.mtl_Position = u_xlat0 + UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3];
    output.TEXCOORD0.xyz = u_xlat1.xyz;
    output.TEXCOORD1.xyz = u_xlat1.xyz;
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
