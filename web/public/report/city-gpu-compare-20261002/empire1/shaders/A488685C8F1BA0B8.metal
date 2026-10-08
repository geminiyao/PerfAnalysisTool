#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    half4 gLightBuffer [115];
    half4 gFogParams [9];
    half gFogFuncEnabled ;
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
    half4 TEXCOORD7 [[ user(TEXCOORD7) ]];
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(2) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(3) ]],
    texture2d<half, access::sample > BnSFog_FogMaskTex [[ texture(0) ]] ,
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    constexpr sampler BnsFog_LinearClampSampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 u_xlat0;
    float4 u_xlat1;
    float3 u_xlat2;
    float3 u_xlat3;
    float4 u_xlat4;
    half4 u_xlat16_4;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    half2 u_xlat16_12;
    float u_xlat21;
    bool u_xlatb21;
    float u_xlat22;
    float u_xlat23;
    bool u_xlatb23;
    float u_xlat24;
    half u_xlat16_26;
    u_xlat0 = input.POSITION0.yyyy * UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat0 = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[3], input.POSITION0.wwww, u_xlat0);
    u_xlat1.xyz = float3(input.NORMAL0.yyy) * UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat1.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, float3(input.NORMAL0.xxx), u_xlat1.xyz);
    u_xlat1.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, float3(input.NORMAL0.zzz), u_xlat1.xyz);
    u_xlat22 = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat22 = max(u_xlat22, 0.00100000005);
    u_xlat22 = rsqrt(u_xlat22);
    u_xlat1.xyz = float3(u_xlat22) * u_xlat1.xyz;
    u_xlat2.xyz = float3(input.TANGENT0.yyy) * UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat2.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, float3(input.TANGENT0.xxx), u_xlat2.xyz);
    u_xlat2.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, float3(input.TANGENT0.zzz), u_xlat2.xyz);
    u_xlat23 = dot(u_xlat2.xyz, u_xlat2.xyz);
    u_xlat23 = max(u_xlat23, 0.00100000005);
    u_xlat23 = rsqrt(u_xlat23);
    u_xlat2.xyz = float3(u_xlat23) * u_xlat2.xyz;
    u_xlat23 = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat3.xyz = u_xlat1.zxy * u_xlat2.yzx;
    u_xlat3.xyz = fma(u_xlat1.yzx, u_xlat2.zxy, (-u_xlat3.xyz));
    u_xlat3.xyz = float3(u_xlat23) * u_xlat3.xyz;
    u_xlat23 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat23 = max(u_xlat23, 0.00100000005);
    u_xlat23 = rsqrt(u_xlat23);
    u_xlat3.xyz = float3(u_xlat23) * u_xlat3.xyz;
    u_xlat4 = u_xlat0.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat4 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat4);
    u_xlat4 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat4);
    output.mtl_Position = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat0.wwww, u_xlat4);
    u_xlatb21 = VGlobals.gFogFuncEnabled>=half(0.5);
    if(u_xlatb21){
        u_xlat4.xyz = u_xlat0.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
        u_xlat21 = dot(u_xlat4.xyz, u_xlat4.xyz);
        u_xlat21 = sqrt(u_xlat21);
        u_xlat16_5.x = half(u_xlat21 + (-float(VGlobals.gFogParams[5].y)));
        u_xlat16_5.x = max(u_xlat16_5.x, half(0.0));
        u_xlat16_12.x = half(float(VGlobals.gFogParams[5].y) / u_xlat21);
        u_xlat16_12.x = clamp(u_xlat16_12.x, 0.0h, 1.0h);
        u_xlat21 = fma(u_xlat4.y, float(u_xlat16_12.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
        u_xlat21 = u_xlat21 + (-float(VGlobals.gFogParams[3].w));
        u_xlat21 = max(u_xlat21, -127.0);
        u_xlat21 = (-u_xlat21) * float(VGlobals.gFogParams[5].z);
        u_xlat21 = exp2(u_xlat21);
        u_xlat16_12.x = (-u_xlat16_12.x) + half(1.0);
        u_xlat23 = u_xlat4.y * float(u_xlat16_12.x);
        u_xlat23 = u_xlat23 * float(VGlobals.gFogParams[5].z);
        u_xlat23 = max(u_xlat23, -64.0);
        u_xlat24 = exp2((-u_xlat23));
        u_xlat24 = (-u_xlat24) + 1.0;
        u_xlat24 = u_xlat24 / u_xlat23;
        u_xlatb23 = 0.00999999978<abs(u_xlat23);
        u_xlat23 = (u_xlatb23) ? u_xlat24 : 0.693147004;
        u_xlat21 = u_xlat21 * u_xlat23;
        u_xlat16_5.x = half(u_xlat21 * (-float(u_xlat16_5.x)));
        u_xlat16_5.x = u_xlat16_5.x * VGlobals.gFogParams[4].w;
        u_xlat16_5.x = exp2(u_xlat16_5.x);
        u_xlat16_4.w = max(u_xlat16_5.x, VGlobals.gFogParams[5].x);
        u_xlat16_5.x = (-u_xlat16_4.w) + half(1.0);
        u_xlat16_4.xyz = u_xlat16_5.xxx * VGlobals.gFogParams[4].xyz;
        u_xlatb21 = half(0.5)<VGlobals.gFogParams[7].x;
        if(u_xlatb21){
            u_xlat16_12.xy = half2(fma(u_xlat0.xz, float2(VGlobals.gFogParams[8].xy), float2(VGlobals.gFogParams[8].zw)));
            u_xlat16_12.x = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_12.xy), level(0.0)).x;
            u_xlat16_12.x = log2(u_xlat16_12.x);
            u_xlat16_12.x = u_xlat16_12.x * VGlobals.gFogParams[7].y;
            u_xlat16_12.x = exp2(u_xlat16_12.x);
            output.TEXCOORD7.w = fma(u_xlat16_12.x, u_xlat16_5.x, u_xlat16_4.w);
            output.TEXCOORD7.xyz = fma(u_xlat16_12.xxx, (-u_xlat16_4.xyz), u_xlat16_4.xyz);
        } else {
            output.TEXCOORD7 = u_xlat16_4;
        }
    } else {
        output.TEXCOORD7 = half4(0.0, 0.0, 0.0, 1.0);
    }
    u_xlat1.w = 1.0;
    u_xlat16_5.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat1));
    u_xlat16_5.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat1));
    u_xlat16_5.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat1));
    u_xlat16_4 = half4(u_xlat1.yzzx * u_xlat1.xyzz);
    u_xlat16_6.x = dot(VGlobals.gLightBuffer[3], u_xlat16_4);
    u_xlat16_6.y = dot(VGlobals.gLightBuffer[4], u_xlat16_4);
    u_xlat16_6.z = dot(VGlobals.gLightBuffer[5], u_xlat16_4);
    u_xlat16_26 = half(u_xlat1.y * u_xlat1.y);
    u_xlat16_26 = half(fma(u_xlat1.x, u_xlat1.x, (-float(u_xlat16_26))));
    u_xlat16_6.xyz = fma(VGlobals.gLightBuffer[6].xyz, half3(u_xlat16_26), u_xlat16_6.xyz);
    u_xlat16_5.xyz = u_xlat16_5.xyz + u_xlat16_6.xyz;
    u_xlat16_5.xyz = u_xlat16_5.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_5.xyz = max(u_xlat16_5.xyz, half3(0.0, 0.0, 0.0));
    output.TEXCOORD0.xyz = u_xlat0.xyz;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.xyz = u_xlat0.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    output.TEXCOORD3.xyz = half3(u_xlat2.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    output.TEXCOORD4.xyz = half3(u_xlat3.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat1.xyz);
    output.TEXCOORD8.xyz = float3(u_xlat16_5.xyz);
    return output;
}
