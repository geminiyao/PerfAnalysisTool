#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float4 _Time ;
    float4 hlslcc_mtx4x4unity_ObjectToWorld [4];
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    float4 _MainTex_ST ;
    float _MainTexOffsetX ;
    float _MainTexOffsetY ;
    float _MainTexRotator ;
    float4 _dissTex_ST ;
    float _dissTexRotator ;
    float _dissTexOffsetX ;
    float _dissTexOffsetY ;
    float4 _AlphaMask_ST ;
    float _AlphaMaskRotator ;
    float _AlphaTexOffsetX ;
    float _AlphaTexOffsetY ;
};

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    float4 COLOR0 [[ attribute(1) ]] ;
    float4 TEXCOORD0 [[ attribute(2) ]] ;
    float4 TEXCOORD1 [[ attribute(3) ]] ;
    float4 TEXCOORD2 [[ attribute(4) ]] ;
};

struct Mtl_VertexOut
{
    float4 mtl_Position [[ position ]];
    half4 COLOR0 [[ user(COLOR0) ]];
    float4 TEXCOORD3 [[ user(TEXCOORD3) ]];
    float4 TEXCOORD4 [[ user(TEXCOORD4) ]];
    float4 TEXCOORD5 [[ user(TEXCOORD5) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    float4 u_xlat1;
    float3 u_xlat2;
    float3 u_xlat3;
    float2 u_xlat8;
    float2 u_xlat9;
    u_xlat0 = input.POSITION0.yyyy * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[3], input.POSITION0.wwww, u_xlat0);
    u_xlat1 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat0.zzzz, u_xlat1);
    output.mtl_Position = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat0.wwww, u_xlat1);
    output.COLOR0 = half4(input.COLOR0);
    u_xlat0.xy = VGlobals._Time.yy * float2(VGlobals._MainTexOffsetX, VGlobals._MainTexOffsetY);
    u_xlat0.xy = fract(u_xlat0.xy);
    u_xlat0.xy = u_xlat0.xy + input.TEXCOORD1.xy;
    u_xlat8.x = VGlobals._MainTexRotator * 3.14159274;
    u_xlat1.x = sin(u_xlat8.x);
    u_xlat2.x = cos(u_xlat8.x);
    u_xlat3.x = (-u_xlat1.x);
    u_xlat3.y = u_xlat2.x;
    u_xlat3.z = u_xlat1.x;
    u_xlat8.xy = input.TEXCOORD0.xy + float2(-0.5, -0.5);
    u_xlat1.x = dot(u_xlat8.yx, u_xlat3.xy);
    u_xlat1.y = dot(u_xlat8.yx, u_xlat3.yz);
    u_xlat1.xy = u_xlat1.xy + float2(0.5, 0.5);
    u_xlat1.xy = fma(u_xlat1.xy, VGlobals._MainTex_ST.xy, VGlobals._MainTex_ST.zw);
    output.TEXCOORD3.xy = u_xlat0.xy + u_xlat1.xy;
    u_xlat0.x = VGlobals._dissTexRotator * 3.14159274;
    u_xlat1.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat2.x = (-u_xlat0.x);
    u_xlat2.y = u_xlat1.x;
    u_xlat2.z = u_xlat0.x;
    u_xlat9.y = dot(u_xlat8.yx, u_xlat2.yz);
    u_xlat9.x = dot(u_xlat8.yx, u_xlat2.xy);
    u_xlat0.xy = u_xlat9.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, VGlobals._dissTex_ST.xy, VGlobals._dissTex_ST.zw);
    u_xlat1.xy = VGlobals._Time.yy * float2(VGlobals._dissTexOffsetX, VGlobals._dissTexOffsetY);
    u_xlat1.xy = fract(u_xlat1.xy);
    output.TEXCOORD3.zw = u_xlat0.xy + u_xlat1.xy;
    u_xlat0.x = VGlobals._AlphaMaskRotator * 3.14159274;
    u_xlat1.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat2.x = (-u_xlat0.x);
    u_xlat2.y = u_xlat1.x;
    u_xlat2.z = u_xlat0.x;
    u_xlat9.y = dot(u_xlat8.yx, u_xlat2.yz);
    u_xlat9.x = dot(u_xlat8.yx, u_xlat2.xy);
    u_xlat0.xy = u_xlat9.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, VGlobals._AlphaMask_ST.xy, VGlobals._AlphaMask_ST.zw);
    u_xlat8.xy = VGlobals._Time.yy * float2(VGlobals._AlphaTexOffsetX, VGlobals._AlphaTexOffsetY);
    u_xlat8.xy = fract(u_xlat8.xy);
    u_xlat8.xy = u_xlat8.xy + input.TEXCOORD1.zw;
    output.TEXCOORD4.zw = u_xlat8.xy + u_xlat0.xy;
    output.TEXCOORD4.xy = float2(0.0, 0.0);
    output.TEXCOORD5.x = input.TEXCOORD2.x;
    output.TEXCOORD5.yz = input.TEXCOORD0.xy;
    return output;
}
