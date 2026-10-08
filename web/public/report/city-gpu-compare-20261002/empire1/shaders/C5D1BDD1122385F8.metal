#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    half4 gLightBuffer [115];
    float4 PlanarShadowData ;
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
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(1) ]],
    const constant unity_Builtins0Array_Type* UnityInstancing_PerDraw0 [[ buffer(2) ]],
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    int u_xlati0;
    float3 u_xlat1;
    float3 u_xlat2;
    float u_xlat6;
    u_xlati0 = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0 = u_xlati0 << 0x3;
    u_xlat2.xyz = input.POSITION0.yyy * UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat2.xyz = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, input.POSITION0.xxx, u_xlat2.xyz);
    u_xlat2.xyz = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, input.POSITION0.zzz, u_xlat2.xyz);
    u_xlat0.xyz = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].xyz, input.POSITION0.www, u_xlat2.xyz);
    u_xlat6 = (-u_xlat0.y) + VGlobals.PlanarShadowData.x;
    u_xlat1.xyz = float3(u_xlat6) * float3(VGlobals.gLightBuffer[11].xyz);
    u_xlat1.xyz = u_xlat1.xyz / float3(VGlobals.gLightBuffer[11].yyy);
    u_xlat0.xzw = u_xlat0.xyz + u_xlat1.xyz;
    u_xlat2.x = u_xlat0.y + (-VGlobals.PlanarShadowData.x);
    u_xlat2.x = u_xlat2.x / VGlobals.PlanarShadowData.y;
    u_xlat1.xyz = u_xlat0.zzz * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1].xyw;
    u_xlat1.xyz = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0].xyw, u_xlat0.xxx, u_xlat1.xyz);
    u_xlat0.xzw = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2].xyw, u_xlat0.www, u_xlat1.xyz);
    u_xlat0.xzw = u_xlat0.xzw + VGlobals.hlslcc_mtx4x4unity_MatrixVP[3].xyw;
    output.mtl_Position.z = u_xlat0.w * u_xlat2.x;
    output.mtl_Position.xyw = u_xlat0.xzw;
    output.TEXCOORD0 = float4(0.0, 0.0, 0.0, 0.0);
    output.TEXCOORD1 = float4(0.0, 0.0, 0.0, 0.0);
    output.TEXCOORD2 = half4(0.0, 0.0, 0.0, 0.0);
    output.TEXCOORD3 = half4(0.0, 0.0, 0.0, 0.0);
    output.TEXCOORD4 = half4(0.0, 0.0, 0.0, 0.0);
    output.TEXCOORD5.xyz = half3(0.0, 0.0, 0.0);
    output.TEXCOORD8.xyz = float3(0.0, 0.0, 0.0);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
