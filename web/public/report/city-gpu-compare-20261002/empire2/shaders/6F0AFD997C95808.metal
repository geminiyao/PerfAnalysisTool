#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float3 _WorldSpaceCameraPos ;
    float4 hlslcc_mtx4x4unity_ObjectToWorld [4];
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    float _ExpandCoef ;
    float4 _MainTex_ST ;
    float _CurrentTime ;
    float _ExpandView ;
};

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    float3 NORMAL0 [[ attribute(1) ]] ;
    float4 COLOR0 [[ attribute(2) ]] ;
    float2 TEXCOORD0 [[ attribute(3) ]] ;
    float2 TEXCOORD1 [[ attribute(4) ]] ;
    float2 TEXCOORD2 [[ attribute(5) ]] ;
    float2 TEXCOORD3 [[ attribute(6) ]] ;
    float2 TEXCOORD4 [[ attribute(7) ]] ;
    float2 TEXCOORD5 [[ attribute(8) ]] ;
};

struct Mtl_VertexOut
{
    float4 mtl_Position [[ position ]];
    float4 COLOR0 [[ user(COLOR0) ]];
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]];
    float2 TEXCOORD1 [[ user(TEXCOORD1) ]];
    float2 TEXCOORD2 [[ user(TEXCOORD2) ]];
    float2 TEXCOORD3 [[ user(TEXCOORD3) ]];
    float2 TEXCOORD4 [[ user(TEXCOORD4) ]];
    float2 TEXCOORD5 [[ user(TEXCOORD5) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float3 u_xlat0;
    float4 u_xlat1;
    float4 u_xlat2;
    float u_xlat3;
    float u_xlat6;
    float u_xlat9;
    u_xlat0.xyz = input.POSITION0.yyy * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat0.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, input.POSITION0.xxx, u_xlat0.xyz);
    u_xlat0.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, input.POSITION0.zzz, u_xlat0.xyz);
    u_xlat0.xyz = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[3].xyz, input.POSITION0.www, u_xlat0.xyz);
    u_xlat0.xyz = u_xlat0.xyz + (-VGlobals._WorldSpaceCameraPos.xyzx.xyz);
    u_xlat3 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat3 = rsqrt(u_xlat3);
    u_xlat0.xy = float2(u_xlat3) * u_xlat0.xz;
    u_xlat6 = dot(input.NORMAL0.xyz, input.NORMAL0.xyz);
    u_xlat6 = rsqrt(u_xlat6);
    u_xlat1.xyz = float3(u_xlat6) * input.NORMAL0.xyz;
    u_xlat0.x = dot(u_xlat1.xz, u_xlat0.xy);
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlat3 = input.TEXCOORD5.x * 8.0;
    u_xlat3 = clamp(u_xlat3, 0.0f, 1.0f);
    u_xlat3 = fma(u_xlat3, (-VGlobals._ExpandView), VGlobals._ExpandView);
    u_xlat0.x = fma(u_xlat3, u_xlat0.x, 1.0);
    u_xlat0.xyz = u_xlat0.xxx * u_xlat1.xyz;
    u_xlat0.xyz = u_xlat0.xyz * input.TEXCOORD5.xxx;
    u_xlat9 = VGlobals._ExpandCoef + 1.0;
    u_xlat0.xyz = fma(u_xlat0.xyz, float3(u_xlat9), input.POSITION0.xyz);
    u_xlat1 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2], u_xlat0.zzzz, u_xlat1);
    u_xlat1 = u_xlat1 + VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[3];
    u_xlat2 = u_xlat1.yyyy * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat2 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat1.xxxx, u_xlat2);
    u_xlat2 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat1.zzzz, u_xlat2);
    output.mtl_Position = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat1.wwww, u_xlat2);
    output.COLOR0 = input.COLOR0;
    u_xlat0.x = input.TEXCOORD2.x / u_xlat9;
    u_xlat3 = input.TEXCOORD0.x / u_xlat9;
    u_xlat0.x = fract(u_xlat0.x);
    u_xlat0.x = (-u_xlat0.x) + u_xlat3;
    u_xlat0.x = u_xlat0.x + 1.0;
    u_xlat0.y = input.TEXCOORD0.y;
    output.TEXCOORD0.xy = fma(u_xlat0.xy, VGlobals._MainTex_ST.xy, VGlobals._MainTex_ST.zw);
    output.TEXCOORD1.x = (-input.TEXCOORD1.x) + VGlobals._CurrentTime;
    output.TEXCOORD1.y = 0.0;
    output.TEXCOORD2.xy = input.TEXCOORD2.xy;
    output.TEXCOORD3.xy = input.TEXCOORD3.xy;
    output.TEXCOORD4.xy = input.TEXCOORD4.xy;
    output.TEXCOORD5.xy = input.TEXCOORD0.xy;
    return output;
}
