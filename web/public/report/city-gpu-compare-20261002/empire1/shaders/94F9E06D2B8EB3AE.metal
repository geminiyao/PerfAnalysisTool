#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

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

struct AnimPropsArray_Type
{
    float4 FrameIndices ;
    float4 LerpWeights ;
};

struct UnityInstancing_AnimProps_Type
{
    AnimPropsArray_Type AnimPropsArray [2];
};

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    half4 TANGENT0 [[ attribute(1) ]] ;
    half3 NORMAL0 [[ attribute(2) ]] ;
    half4 TEXCOORD0 [[ attribute(3) ]] ;
    half4 TEXCOORD1 [[ attribute(4) ]] ;
    half4 TEXCOORD2 [[ attribute(5) ]] ;
    half4 COLOR0 [[ attribute(6) ]] ;
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
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(0) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(1) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(2) ]],
    const constant unity_Builtins0Array_Type* UnityInstancing_PerDraw0 [[ buffer(3) ]],
    const constant AnimPropsArray_Type* UnityInstancing_AnimProps [[ buffer(4) ]],
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    int2 u_xlati0;
    bool u_xlatb0;
    float4 u_xlat1;
    half4 u_xlat16_1;
    float4 u_xlat2;
    float3 u_xlat3;
    float4 u_xlat4;
    float u_xlat5;
    uint u_xlatu10;
    bool u_xlatb10;
    u_xlati0.x = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0.xy = u_xlati0.xx << int2(0x1, 0x3);
    u_xlatb0 = UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.w>=100.0;
    u_xlat16_1.x = rint(input.TEXCOORD2.x);
    u_xlatu10 = uint(float(u_xlat16_1.x));
    u_xlatb10 = u_xlatu10<0x3e8u;
    u_xlatb0 = u_xlatb10 && u_xlatb0;
    if(u_xlatb0){
        u_xlat16_1 = half4(input.POSITION0);
    }
    u_xlat16_1 = (bool(u_xlatb0)) ? u_xlat16_1 : half4(input.POSITION0);
    u_xlat2 = float4(u_xlat16_1.yyyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], float4(u_xlat16_1.xxxx), u_xlat2);
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], float4(u_xlat16_1.zzzz), u_xlat2);
    u_xlat1 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], float4(u_xlat16_1.wwww), u_xlat2);
    u_xlat0.xzw = float3(input.NORMAL0.yyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.NORMAL0.xxx), u_xlat0.xzw);
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.NORMAL0.zzz), u_xlat0.xzw);
    u_xlat2.xyz = float3(input.TANGENT0.yyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat2.xyz = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.TANGENT0.xxx), u_xlat2.xyz);
    u_xlat2.xyz = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.TANGENT0.zzz), u_xlat2.xyz);
    u_xlat5 = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat3.xyz = u_xlat0.wxz * u_xlat2.yzx;
    u_xlat3.xyz = fma(u_xlat0.zwx, u_xlat2.zxy, (-u_xlat3.xyz));
    u_xlat3.xyz = float3(u_xlat5) * u_xlat3.xyz;
    u_xlat5 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat5 = max(u_xlat5, 0.00100000005);
    u_xlat5 = rsqrt(u_xlat5);
    u_xlat3.xyz = float3(u_xlat5) * u_xlat3.xyz;
    u_xlat4 = u_xlat1.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat4 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat1.xxxx, u_xlat4);
    u_xlat4 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat1.zzzz, u_xlat4);
    output.mtl_Position = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat1.wwww, u_xlat4);
    output.TEXCOORD0.xyz = u_xlat1.xyz;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.xyz = u_xlat1.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    output.TEXCOORD3.xyz = half3(u_xlat2.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    output.TEXCOORD4.xyz = half3(u_xlat3.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat0.xzw);
    output.TEXCOORD8.xyz = float3(0.0, 0.0, 0.0);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
