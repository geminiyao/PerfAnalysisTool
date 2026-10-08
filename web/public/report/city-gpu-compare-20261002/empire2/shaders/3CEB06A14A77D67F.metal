#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float _PlanarShadowDepthBias ;
    half4 gLightBuffer [116];
    float4 gShadowParams0 [7];
    float gPlanarShadowEnabled ;
    float4 gPlanarShadowParams ;
    float4 hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat [4];
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
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]];
    float4 TEXCOORD9 [[ user(TEXCOORD9) ]];
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]];
    half4 TEXCOORD21 [[ user(TEXCOORD21) ]];
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(2) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(3) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(4) ]],
    constant UnityInstancing_PerDraw0_Type& UnityInstancing_PerDraw0 [[ buffer(5) ]],
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    int u_xlati0;
    float4 u_xlat1;
    float4 u_xlat2;
    float3 u_xlat3;
    float4 u_xlat4;
    float4 u_xlat5;
    half4 u_xlat16_5;
    float3 u_xlat6;
    float3 u_xlat7;
    half3 u_xlat16_8;
    half2 u_xlat16_9;
    half3 u_xlat16_10;
    float3 u_xlat11;
    float u_xlat33;
    bool u_xlatb33;
    half u_xlat16_41;
    u_xlati0 = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0 = u_xlati0 << 0x3;
    u_xlat1 = input.POSITION0.yyyy * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat1 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], input.POSITION0.xxxx, u_xlat1);
    u_xlat1 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], input.POSITION0.zzzz, u_xlat1);
    u_xlat1 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], input.POSITION0.wwww, u_xlat1);
    u_xlat11.xyz = float3(input.NORMAL0.yyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat11.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.NORMAL0.xxx), u_xlat11.xyz);
    u_xlat11.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.NORMAL0.zzz), u_xlat11.xyz);
    u_xlat2.x = dot(u_xlat11.xyz, u_xlat11.xyz);
    u_xlat2.x = max(u_xlat2.x, 0.00100000005);
    u_xlat2.x = rsqrt(u_xlat2.x);
    u_xlat2.xyz = u_xlat11.xyz * u_xlat2.xxx;
    u_xlat11.xyz = float3(input.TANGENT0.yyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].yzx;
    u_xlat11.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].yzx, float3(input.TANGENT0.xxx), u_xlat11.xyz);
    u_xlat0.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].yzx, float3(input.TANGENT0.zzz), u_xlat11.xyz);
    u_xlat33 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat33 = max(u_xlat33, 0.00100000005);
    u_xlat33 = rsqrt(u_xlat33);
    u_xlat0.xyz = float3(u_xlat33) * u_xlat0.xyz;
    u_xlat33 = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat3.xyz = u_xlat0.xyz * u_xlat2.zxy;
    u_xlat3.xyz = fma(u_xlat2.yzx, u_xlat0.yzx, (-u_xlat3.xyz));
    u_xlat3.xyz = float3(u_xlat33) * u_xlat3.xyz;
    u_xlat33 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat33 = max(u_xlat33, 0.00100000005);
    u_xlat33 = rsqrt(u_xlat33);
    u_xlat3.xyz = float3(u_xlat33) * u_xlat3.xzy;
    u_xlat4 = u_xlat1.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat4 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat1.xxxx, u_xlat4);
    u_xlat4 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat1.zzzz, u_xlat4);
    u_xlat4 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat1.wwww, u_xlat4);
    u_xlat5.xyz = (-u_xlat1.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat33 = dot(u_xlat5.xyz, u_xlat5.xyz);
    u_xlat33 = max(u_xlat33, 0.00100000005);
    u_xlat33 = rsqrt(u_xlat33);
    u_xlat5.xyz = fma(u_xlat5.xyz, float3(u_xlat33), float3(VGlobals.gLightBuffer[14].xyz));
    u_xlat33 = dot(u_xlat5.xyz, u_xlat5.xyz);
    u_xlat33 = max(u_xlat33, 0.00100000005);
    u_xlat33 = rsqrt(u_xlat33);
    u_xlat5.xyz = float3(u_xlat33) * u_xlat5.xyz;
    u_xlat6.x = u_xlat0.z;
    u_xlat6.y = u_xlat3.x;
    u_xlat6.z = u_xlat2.x;
    u_xlat7.x = u_xlat0.x;
    u_xlat7.y = u_xlat3.z;
    u_xlat7.z = u_xlat2.y;
    u_xlat0.xzw = u_xlat5.yyy * u_xlat7.xyz;
    u_xlat0.xzw = fma(u_xlat6.xyz, u_xlat5.xxx, u_xlat0.xzw);
    u_xlat3.x = u_xlat0.y;
    u_xlat3.z = u_xlat2.z;
    u_xlat0.xyz = fma(u_xlat3.xyz, u_xlat5.zzz, u_xlat0.xzw);
    u_xlat5.xyz = u_xlat7.xyz * float3(VGlobals.gLightBuffer[11].yyy);
    u_xlat5.xyz = fma(u_xlat6.xyz, float3(VGlobals.gLightBuffer[11].xxx), u_xlat5.xyz);
    u_xlat3.xyz = fma(u_xlat3.xyz, float3(VGlobals.gLightBuffer[11].zzz), u_xlat5.xyz);
    u_xlatb33 = 0.5<VGlobals.gPlanarShadowEnabled;
    if(u_xlatb33){
        u_xlat33 = (-u_xlat1.y) + VGlobals.gPlanarShadowParams.x;
        u_xlat33 = u_xlat33 / float(VGlobals.gLightBuffer[11].y);
        u_xlat5.xyz = fma(float3(VGlobals.gLightBuffer[11].xyz), float3(u_xlat33), u_xlat1.xyz);
        u_xlat6.xyz = u_xlat5.yyy * VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[1].xyw;
        u_xlat5.xyw = fma(VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[0].xyw, u_xlat5.xxx, u_xlat6.xyz);
        u_xlat5.xyz = fma(VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[2].xyw, u_xlat5.zzz, u_xlat5.xyw);
        u_xlat5.xyz = u_xlat5.xyz + VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[3].xyw;
        u_xlat16_8.xyz = half3(u_xlat5.xyz * float3(0.5, 0.5, 0.5));
        u_xlat16_9.x = u_xlat16_8.z + u_xlat16_8.x;
        u_xlat16_9.y = half(fma(float(u_xlat16_8.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_8.z)));
        u_xlat33 = u_xlat1.y + 100.0;
        u_xlat33 = u_xlat33 / VGlobals.gPlanarShadowParams.y;
        u_xlat33 = u_xlat33 + VGlobals._PlanarShadowDepthBias;
        output.TEXCOORD14.z = u_xlat5.z * u_xlat33;
        output.TEXCOORD14.xy = float2(u_xlat16_9.xy);
        output.TEXCOORD14.w = u_xlat5.z;
    } else {
        u_xlat1.w = 1.0;
        output.TEXCOORD14.x = dot(VGlobals.gShadowParams0[0], u_xlat1);
        output.TEXCOORD14.y = dot(VGlobals.gShadowParams0[1], u_xlat1);
        output.TEXCOORD14.z = dot(VGlobals.gShadowParams0[2], u_xlat1);
        output.TEXCOORD14.w = dot(VGlobals.gShadowParams0[3], u_xlat1);
    }
    u_xlat16_8.xyz = half3(u_xlat4.xyw * float3(0.5, 0.5, 0.5));
    u_xlat16_9.x = u_xlat16_8.z + u_xlat16_8.x;
    u_xlat16_9.y = half(fma(float(u_xlat16_8.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_8.z)));
    u_xlat33 = u_xlat1.y * UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[1].z;
    u_xlat33 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[0].z, u_xlat1.x, u_xlat33);
    u_xlat33 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[2].z, u_xlat1.z, u_xlat33);
    u_xlat33 = u_xlat33 + UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[3].z;
    output.TEXCOORD9.z = (-u_xlat33);
    u_xlat2.w = 1.0;
    u_xlat16_8.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat2));
    u_xlat16_8.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat2));
    u_xlat16_8.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat2));
    u_xlat16_5 = half4(u_xlat2.yzzx * u_xlat2.xyzz);
    u_xlat16_10.x = dot(VGlobals.gLightBuffer[3], u_xlat16_5);
    u_xlat16_10.y = dot(VGlobals.gLightBuffer[4], u_xlat16_5);
    u_xlat16_10.z = dot(VGlobals.gLightBuffer[5], u_xlat16_5);
    u_xlat16_41 = half(u_xlat2.y * u_xlat2.y);
    u_xlat16_41 = half(fma(u_xlat2.x, u_xlat2.x, (-float(u_xlat16_41))));
    u_xlat16_10.xyz = fma(VGlobals.gLightBuffer[6].xyz, half3(u_xlat16_41), u_xlat16_10.xyz);
    u_xlat16_8.xyz = u_xlat16_8.xyz + u_xlat16_10.xyz;
    u_xlat16_8.xyz = u_xlat16_8.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_8.xyz = max(u_xlat16_8.xyz, half3(0.0, 0.0, 0.0));
    output.mtl_Position = u_xlat4;
    output.TEXCOORD0.xyz = u_xlat1.xyz;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.xyz = u_xlat1.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    output.TEXCOORD3.xyz = half3(u_xlat0.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    output.TEXCOORD4.xyz = half3(u_xlat3.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat2.xyz);
    output.TEXCOORD9.xy = float2(u_xlat16_9.xy);
    output.TEXCOORD9.w = u_xlat4.w;
    output.TEXCOORD8.xyz = float3(u_xlat16_8.xyz);
    output.TEXCOORD21 = half4(0.0, 0.0, 0.0, 0.0);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
