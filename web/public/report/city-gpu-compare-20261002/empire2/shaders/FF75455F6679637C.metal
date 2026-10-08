#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float4 hlslcc_mtx4x4unity_ObjectToWorld [4];
    float4 hlslcc_mtx4x4glstate_matrix_projection [4];
    float4 hlslcc_mtx4x4unity_MatrixV [4];
    half4 _Color ;
    half _UseUIAlphaFade ;
    half _UseUICircleMask ;
    float4 _CircleParam1 ;
    float4 _CircleParam2 ;
    float4 hlslcc_mtx4x4_UIProjMatrix [4];
    float _UIProjRatio ;
    float _ColorIntensity ;
    float4 _FadeRects [128];
    float _FadeRectRotations [128];
    float _UseUIAlphaFade2 ;
    float _OuterFadeRectIndex ;
};

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    float4 COLOR0 [[ attribute(1) ]] ;
    float2 TEXCOORD0 [[ attribute(2) ]] ;
    half2 TEXCOORD1 [[ attribute(3) ]] ;
    float2 TEXCOORD2 [[ attribute(4) ]] ;
};

struct Mtl_VertexOut
{
    float4 mtl_Position [[ position ]];
    half4 COLOR0 [[ user(COLOR0) ]];
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]];
    half2 TEXCOORD2 [[ user(TEXCOORD2) ]];
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]];
    float4 TEXCOORD3 [[ user(TEXCOORD3) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    float4 u_xlat1;
    int u_xlati1;
    bool u_xlatb1;
    float4 u_xlat2;
    int u_xlati2;
    bool u_xlatb2;
    float4 u_xlat3;
    float3 u_xlat4;
    float3 u_xlat5;
    half3 u_xlat16_6;
    float2 u_xlat8;
    float2 u_xlat9;
    float2 u_xlat15;
    float u_xlat22;
    float u_xlat23;
    u_xlat0 = input.POSITION0.yyyy * VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[1];
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[0], input.POSITION0.xxxx, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[2], input.POSITION0.zzzz, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_ObjectToWorld[3], input.POSITION0.wwww, u_xlat0);
    u_xlat1 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4unity_MatrixV[1];
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixV[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixV[2], u_xlat0.zzzz, u_xlat1);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixV[3], u_xlat0.wwww, u_xlat1);
    u_xlat1 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4glstate_matrix_projection[1];
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4glstate_matrix_projection[0], u_xlat0.xxxx, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4glstate_matrix_projection[2], u_xlat0.zzzz, u_xlat1);
    u_xlat1 = fma(VGlobals.hlslcc_mtx4x4glstate_matrix_projection[3], u_xlat0.wwww, u_xlat1);
    u_xlat2.x = (-VGlobals._UIProjRatio) + 1.0;
    u_xlat3 = u_xlat0.yyyy * VGlobals.hlslcc_mtx4x4_UIProjMatrix[1];
    u_xlat3 = fma(VGlobals.hlslcc_mtx4x4_UIProjMatrix[0], u_xlat0.xxxx, u_xlat3);
    u_xlat3 = fma(VGlobals.hlslcc_mtx4x4_UIProjMatrix[2], u_xlat0.zzzz, u_xlat3);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4_UIProjMatrix[3], u_xlat0.wwww, u_xlat3);
    u_xlat0 = u_xlat0 * float4(VGlobals._UIProjRatio);
    u_xlat0 = fma(u_xlat1, u_xlat2.xxxx, u_xlat0);
    u_xlatb1 = half(0.5)<VGlobals._UseUICircleMask;
    if(u_xlatb1){
        u_xlat1.xy = u_xlat0.xy + (-VGlobals._CircleParam1.xy);
        u_xlat2 = abs(u_xlat1.xyxy) * VGlobals._CircleParam2.xzyw;
        u_xlat2 = sin(u_xlat2);
        u_xlat2 = u_xlat2 * u_xlat2;
        u_xlat2 = u_xlat2 * VGlobals._CircleParam1.zwzw;
        u_xlat15.xy = u_xlat2.yw + u_xlat2.xz;
        u_xlat0.xy = fma((-u_xlat1.xy), u_xlat15.xy, u_xlat0.xy);
    }
    u_xlatb1 = half(0.5)<VGlobals._UseUIAlphaFade;
    if(u_xlatb1){
        u_xlat1.x = floor(input.TEXCOORD2.x);
        u_xlati1 = int(u_xlat1.x);
        u_xlat8.xy = input.POSITION0.xy + (-VGlobals._FadeRects[u_xlati1].xy);
        u_xlat22 = 0.0174532924 * VGlobals._FadeRectRotations[u_xlati1];
        u_xlat2.x = sin(u_xlat22);
        u_xlat3.x = cos(u_xlat22);
        u_xlat4.x = sin((-u_xlat22));
        u_xlat4.y = u_xlat3.x;
        u_xlat4.z = u_xlat2.x;
        u_xlat2.x = dot(u_xlat4.yz, u_xlat8.xy);
        u_xlat2.y = dot(u_xlat4.xy, u_xlat8.xy);
        u_xlat1.xy = u_xlat2.xy * VGlobals._FadeRects[u_xlati1].zw;
        u_xlatb2 = 0.5<VGlobals._UseUIAlphaFade2;
        if(u_xlatb2){
            u_xlat2.x = floor(VGlobals._OuterFadeRectIndex);
            u_xlati2 = int(u_xlat2.x);
            u_xlat9.xy = input.POSITION0.xy + (-VGlobals._FadeRects[u_xlati2].xy);
            u_xlat23 = 0.0174532924 * VGlobals._FadeRectRotations[u_xlati2];
            u_xlat3.x = sin(u_xlat23);
            u_xlat4.x = cos(u_xlat23);
            u_xlat5.x = sin((-u_xlat23));
            u_xlat5.y = u_xlat4.x;
            u_xlat5.z = u_xlat3.x;
            u_xlat3.x = dot(u_xlat5.yz, u_xlat9.xy);
            u_xlat3.y = dot(u_xlat5.xy, u_xlat9.xy);
            u_xlat1.zw = u_xlat3.xy * VGlobals._FadeRects[u_xlati2].zw;
        } else {
            u_xlat1.zw = u_xlat1.xy;
        }
        output.TEXCOORD3 = u_xlat1;
    }
    u_xlat1 = input.COLOR0 * float4(VGlobals._Color);
    u_xlat16_6.xyz = half3(max(u_xlat1.xyz, float3(0.0, 0.0, 0.0)));
    u_xlat2.xyz = log2(float3(u_xlat16_6.xyz));
    u_xlat2.xyz = u_xlat2.xyz * float3(0.416666657, 0.416666657, 0.416666657);
    u_xlat2.xyz = exp2(u_xlat2.xyz);
    u_xlat2.xyz = fma(u_xlat2.xyz, float3(1.05499995, 1.05499995, 1.05499995), float3(-0.0549999997, -0.0549999997, -0.0549999997));
    u_xlat2.xyz = max(u_xlat2.xyz, float3(0.0, 0.0, 0.0));
    u_xlat1.xyz = u_xlat2.xyz * float3(VGlobals._ColorIntensity);
    output.mtl_Position = u_xlat0;
    output.COLOR0 = half4(u_xlat1);
    output.TEXCOORD1 = input.POSITION0;
    output.TEXCOORD0.xy = input.TEXCOORD0.xy;
    output.TEXCOORD2.xy = input.TEXCOORD1.xy;
    return output;
}
