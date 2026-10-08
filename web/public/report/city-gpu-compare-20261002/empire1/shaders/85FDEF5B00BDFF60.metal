#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float3 _WorldSpaceCameraPos ;
    float4 _ProjectionParams ;
    float4 hlslcc_mtx4x4unity_ObjectToWorld [4];
    float4 unity_WorldTransformParams ;
    float4 hlslcc_mtx4x4unity_MatrixV [4];
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    half4 gLightBuffer [115];
    half4 gFogParams [9];
    half gFogFuncEnabled ;
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
    float4 TEXCOORD9 [[ user(TEXCOORD9) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
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
    half4 u_xlat16_5;
    half2 u_xlat16_6;
    float3 u_xlat7;
    half4 u_xlat16_7;
    half3 u_xlat16_8;
    half u_xlat16_14;
    half u_xlat16_24;
    float u_xlat27;
    bool u_xlatb27;
    float u_xlat28;
    float u_xlat29;
    bool u_xlatb29;
    float u_xlat30;
    half u_xlat16_32;
    half u_xlat16_33;
    u_xlat0 = input.POSITION0.yyyy * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[3], input.POSITION0.wwww, u_xlat0);
    u_xlat1.xyz = float3(input.NORMAL0.yyy) * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat1.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, float3(input.NORMAL0.xxx), u_xlat1.xyz);
    u_xlat1.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, float3(input.NORMAL0.zzz), u_xlat1.xyz);
    u_xlat28 = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat28 = max(u_xlat28, 0.00100000005);
    u_xlat28 = rsqrt(u_xlat28);
    u_xlat1.xyz = float3(u_xlat28) * u_xlat1.xyz;
    u_xlat2.xyz = float3(input.TANGENT0.yyy) * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat2.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, float3(input.TANGENT0.xxx), u_xlat2.xyz);
    u_xlat2.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, float3(input.TANGENT0.zzz), u_xlat2.xyz);
    u_xlat29 = dot(u_xlat2.xyz, u_xlat2.xyz);
    u_xlat29 = max(u_xlat29, 0.00100000005);
    u_xlat29 = rsqrt(u_xlat29);
    u_xlat2.xyz = float3(u_xlat29) * u_xlat2.xyz;
    u_xlat29 = float(input.TANGENT0.w) * VGlobals.unity_WorldTransformParams.w;
    u_xlat3.xyz = u_xlat1.zxy * u_xlat2.yzx;
    u_xlat3.xyz = fma(u_xlat1.yzx, u_xlat2.zxy, (-u_xlat3.xyz));
    u_xlat3.xyz = float3(u_xlat29) * u_xlat3.xyz;
    u_xlat29 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat29 = max(u_xlat29, 0.00100000005);
    u_xlat29 = rsqrt(u_xlat29);
    u_xlat3.xyz = float3(u_xlat29) * u_xlat3.xyz;
    u_xlat4 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat4 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat4);
    u_xlat4 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat4);
    u_xlat4 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat0.wwww, u_xlat4);
    u_xlat16_5.xyz = half3(u_xlat4.xyw * float3(0.5, 0.5, 0.5));
    u_xlat16_6.x = u_xlat16_5.z + u_xlat16_5.x;
    u_xlat16_6.y = half(fma(float(u_xlat16_5.y), VGlobals._ProjectionParams.x, float(u_xlat16_5.z)));
    u_xlat27 = u_xlat0.y * VGlobals.hlslcc_mtx4x4unity_MatrixV[1].z;
    u_xlat27 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixV[0].z, u_xlat0.x, u_xlat27);
    u_xlat27 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixV[2].z, u_xlat0.z, u_xlat27);
    u_xlat27 = u_xlat27 + VGlobals.hlslcc_mtx4x4unity_MatrixV[3].z;
    output.TEXCOORD9.z = (-u_xlat27);
    u_xlatb27 = VGlobals.gFogFuncEnabled>=half(0.5);
    if(u_xlatb27){
        u_xlat7.xyz = u_xlat0.xyz + (-VGlobals._WorldSpaceCameraPos.xyzx.xyz);
        u_xlat27 = dot(u_xlat7.xyz, u_xlat7.xyz);
        u_xlat27 = sqrt(u_xlat27);
        u_xlat16_5.x = half(u_xlat27 + (-float(VGlobals.gFogParams[5].y)));
        u_xlat16_5.x = max(u_xlat16_5.x, half(0.0));
        u_xlat16_14 = half(float(VGlobals.gFogParams[5].y) / u_xlat27);
        u_xlat16_14 = clamp(u_xlat16_14, 0.0h, 1.0h);
        u_xlat27 = fma(u_xlat7.y, float(u_xlat16_14), VGlobals._WorldSpaceCameraPos.xyzx.y);
        u_xlat27 = u_xlat27 + (-float(VGlobals.gFogParams[3].w));
        u_xlat27 = max(u_xlat27, -127.0);
        u_xlat27 = (-u_xlat27) * float(VGlobals.gFogParams[5].z);
        u_xlat27 = exp2(u_xlat27);
        u_xlat16_14 = (-u_xlat16_14) + half(1.0);
        u_xlat29 = float(u_xlat16_14) * u_xlat7.y;
        u_xlat29 = u_xlat29 * float(VGlobals.gFogParams[5].z);
        u_xlat29 = max(u_xlat29, -64.0);
        u_xlat30 = exp2((-u_xlat29));
        u_xlat30 = (-u_xlat30) + 1.0;
        u_xlat30 = u_xlat30 / u_xlat29;
        u_xlatb29 = 0.00999999978<abs(u_xlat29);
        u_xlat29 = (u_xlatb29) ? u_xlat30 : 0.693147004;
        u_xlat27 = u_xlat27 * u_xlat29;
        u_xlat16_5.x = half(u_xlat27 * (-float(u_xlat16_5.x)));
        u_xlat16_5.x = u_xlat16_5.x * VGlobals.gFogParams[4].w;
        u_xlat16_5.x = exp2(u_xlat16_5.x);
        u_xlat16_5.w = max(u_xlat16_5.x, VGlobals.gFogParams[5].x);
        u_xlat16_24 = (-u_xlat16_5.w) + half(1.0);
        u_xlat16_5.xyz = half3(u_xlat16_24) * VGlobals.gFogParams[4].xyz;
        u_xlatb27 = half(0.5)<VGlobals.gFogParams[7].x;
        if(u_xlatb27){
            u_xlat16_8.xy = half2(fma(u_xlat0.xz, float2(VGlobals.gFogParams[8].xy), float2(VGlobals.gFogParams[8].zw)));
            u_xlat16_33 = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_8.xy), level(0.0)).x;
            u_xlat16_33 = log2(u_xlat16_33);
            u_xlat16_33 = u_xlat16_33 * VGlobals.gFogParams[7].y;
            u_xlat16_33 = exp2(u_xlat16_33);
            output.TEXCOORD7.w = fma(u_xlat16_33, u_xlat16_24, u_xlat16_5.w);
            output.TEXCOORD7.xyz = fma(half3(u_xlat16_33), (-u_xlat16_5.xyz), u_xlat16_5.xyz);
        } else {
            output.TEXCOORD7 = u_xlat16_5;
        }
    } else {
        output.TEXCOORD7 = half4(0.0, 0.0, 0.0, 1.0);
    }
    u_xlat1.w = 1.0;
    u_xlat16_5.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat1));
    u_xlat16_5.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat1));
    u_xlat16_5.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat1));
    u_xlat16_7 = half4(u_xlat1.yzzx * u_xlat1.xyzz);
    u_xlat16_8.x = dot(VGlobals.gLightBuffer[3], u_xlat16_7);
    u_xlat16_8.y = dot(VGlobals.gLightBuffer[4], u_xlat16_7);
    u_xlat16_8.z = dot(VGlobals.gLightBuffer[5], u_xlat16_7);
    u_xlat16_32 = half(u_xlat1.y * u_xlat1.y);
    u_xlat16_32 = half(fma(u_xlat1.x, u_xlat1.x, (-float(u_xlat16_32))));
    u_xlat16_8.xyz = fma(VGlobals.gLightBuffer[6].xyz, half3(u_xlat16_32), u_xlat16_8.xyz);
    u_xlat16_5.xyz = u_xlat16_5.xyz + u_xlat16_8.xyz;
    u_xlat16_5.xyz = u_xlat16_5.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_5.xyz = max(u_xlat16_5.xyz, half3(0.0, 0.0, 0.0));
    output.mtl_Position = u_xlat4;
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
    output.TEXCOORD9.xy = float2(u_xlat16_6.xy);
    output.TEXCOORD9.w = u_xlat4.w;
    output.TEXCOORD8.xyz = float3(u_xlat16_5.xyz);
    return output;
}
