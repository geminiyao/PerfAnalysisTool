#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    half4 _MainTex_ST ;
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

struct Mtl_VertexIn
{
    half4 POSITION0 [[ attribute(0) ]] ;
    half2 TEXCOORD0 [[ attribute(1) ]] ;
};

struct Mtl_VertexOut
{
    float4 mtl_Position [[ position ]];
    half2 TEXCOORD0 [[ user(TEXCOORD0) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(1) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(2) ]],
    const constant unity_Builtins0Array_Type* UnityInstancing_PerDraw0 [[ buffer(3) ]],
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    int u_xlati0;
    float4 u_xlat1;
    u_xlati0 = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0 = u_xlati0 << 0x3;
    u_xlat1 = float4(input.POSITION0.yyyy) * UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat1 = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], float4(input.POSITION0.xxxx), u_xlat1);
    u_xlat1 = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], float4(input.POSITION0.zzzz), u_xlat1);
    u_xlat0 = u_xlat1 + UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3];
    u_xlat1 = u_xlat0.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat1 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat1);
    u_xlat0 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat0.wwww, u_xlat1);
    output.mtl_Position = u_xlat0;
    output.TEXCOORD0.xy = fma(input.TEXCOORD0.xy, VGlobals._MainTex_ST.xy, VGlobals._MainTex_ST.zw);
    return output;
}
