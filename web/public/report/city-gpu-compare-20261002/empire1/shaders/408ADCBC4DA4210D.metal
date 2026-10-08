#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float4 _ScreenParams ;
    float4 hlslcc_mtx4x4unity_ObjectToWorld [4];
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    float _MUI_BUILDING_NAMEPLATE_SCALE ;
    float _MUI_GLOBAL_SCALE ;
};

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    half4 COLOR0 [[ attribute(1) ]] ;
    half4 TEXCOORD0 [[ attribute(2) ]] ;
    half4 TEXCOORD1 [[ attribute(3) ]] ;
    half4 TEXCOORD2 [[ attribute(4) ]] ;
    half4 TEXCOORD3 [[ attribute(5) ]] ;
    half4 TEXCOORD4 [[ attribute(6) ]] ;
};

struct Mtl_VertexOut
{
    float4 mtl_Position [[ position ]];
    float3 TEXCOORD0 [[ user(TEXCOORD0) ]];
    half TEXCOORD3 [[ user(TEXCOORD3) ]];
    half4 TEXCOORD1 [[ user(TEXCOORD1) ]];
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]];
    float2 TEXCOORD5 [[ user(TEXCOORD5) ]];
    float3 TEXCOORD6 [[ user(TEXCOORD6) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    float3 u_xlat1;
    half3 u_xlat16_2;
    float u_xlat3;
    float u_xlat4;
    float u_xlat5;
    float2 u_xlat6;
    float2 u_xlat10;
    float u_xlat15;
    u_xlat0 = input.POSITION0.yyyy * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat0 = u_xlat0 + VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[3];
    u_xlat1.xyz = u_xlat0.yyy * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1].xyw;
    u_xlat1.xyz = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0].xyw, u_xlat0.xxx, u_xlat1.xyz);
    u_xlat0.xyz = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2].xyw, u_xlat0.zzz, u_xlat1.xyz);
    u_xlat0.xyz = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[3].xyw, u_xlat0.www, u_xlat0.xyz);
    u_xlat0.xy = u_xlat0.xy / u_xlat0.zz;
    u_xlat16_2.xy = input.TEXCOORD1.zw + input.TEXCOORD1.zw;
    u_xlat10.xy = float2(u_xlat16_2.xy) / VGlobals._ScreenParams.xy;
    u_xlat1.x = min(VGlobals._ScreenParams.y, VGlobals._ScreenParams.x);
    u_xlat1.x = u_xlat1.x * 0.00092592591;
    u_xlat10.xy = u_xlat10.xy * u_xlat1.xx;
    u_xlat10.xy = u_xlat10.xy * float2(VGlobals._MUI_BUILDING_NAMEPLATE_SCALE);
    u_xlat0.xy = fma(u_xlat10.xy, float2(VGlobals._MUI_GLOBAL_SCALE), u_xlat0.xy);
    u_xlat16_2.xy = (-input.TEXCOORD0.wz) + half2(0.5, 0.5);
    u_xlat16_2.xy = u_xlat16_2.xy + u_xlat16_2.xy;
    u_xlat16_2.xy = fma(u_xlat16_2.xy, abs(input.TEXCOORD1.yx), input.TEXCOORD1.yx);
    u_xlat16_2.xy = u_xlat16_2.xy * input.TEXCOORD2.yx;
    u_xlat10.xy = float2(u_xlat16_2.xy) * float2(VGlobals._MUI_BUILDING_NAMEPLATE_SCALE);
    u_xlat10.xy = u_xlat10.xy * float2(VGlobals._MUI_GLOBAL_SCALE);
    u_xlat6.x = input.POSITION0.w * 0.0174532924;
    u_xlat3 = sin(u_xlat6.x);
    u_xlat4 = cos(u_xlat6.x);
    u_xlat6.xy = u_xlat10.xy * float2(u_xlat3);
    u_xlat15 = fma(u_xlat4, u_xlat10.y, (-u_xlat6.x));
    u_xlat10.x = fma(u_xlat4, u_xlat10.x, u_xlat6.y);
    u_xlat10.x = u_xlat1.x * u_xlat10.x;
    u_xlat10.x = u_xlat10.x / VGlobals._ScreenParams.y;
    output.mtl_Position.y = u_xlat10.x + u_xlat0.y;
    u_xlat5 = u_xlat1.x * u_xlat15;
    u_xlat10.x = u_xlat1.x * float(input.TEXCOORD2.x);
    u_xlat10.x = u_xlat10.x * 10.0;
    u_xlat5 = u_xlat5 / VGlobals._ScreenParams.x;
    output.mtl_Position.x = u_xlat5 + u_xlat0.x;
    output.mtl_Position.zw = float2(0.0, 1.0);
    u_xlat16_2.xy = input.TEXCOORD0.xy;
    u_xlat16_2.z = input.TEXCOORD2.z;
    output.TEXCOORD0.xyz = float3(u_xlat16_2.xyz);
    output.TEXCOORD1 = input.COLOR0;
    output.TEXCOORD2 = input.TEXCOORD3;
    output.TEXCOORD3 = input.TEXCOORD4.x;
    u_xlat0.x = 0.5 / u_xlat10.x;
    output.TEXCOORD5.x = u_xlat10.x;
    u_xlat5 = fma((-float(input.TEXCOORD4.x)), 0.5, 0.5);
    output.TEXCOORD5.y = u_xlat0.x + u_xlat5;
    u_xlat16_2.xy = input.TEXCOORD1.xy;
    u_xlat16_2.z = input.TEXCOORD4.w;
    output.TEXCOORD6.xyz = float3(u_xlat16_2.xyz);
    return output;
}
