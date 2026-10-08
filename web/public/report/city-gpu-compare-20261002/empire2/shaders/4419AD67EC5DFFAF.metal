#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float _WindFreq ;
    float _BendScale ;
    float _BendPivot ;
    float _DetailAmp ;
    float _DetailOffset ;
    float _DetailFreq2 ;
    float _DetailAmp2 ;
    float _WaveVariation ;
    float4 _WindDir ;
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
    float3 u_xlat4;
    float4 u_xlat5;
    half4 u_xlat16_5;
    half3 u_xlat16_6;
    float4 u_xlat7;
    float3 u_xlat8;
    half3 u_xlat16_9;
    float3 u_xlat10;
    float3 u_xlat13;
    float u_xlat30;
    bool u_xlatb30;
    float u_xlat33;
    float u_xlat34;
    bool u_xlatb34;
    half u_xlat16_36;
    u_xlati0 = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0 = u_xlati0 << 0x3;
    u_xlat1 = input.POSITION0.yyyy * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat1 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], input.POSITION0.xxxx, u_xlat1);
    u_xlat1 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], input.POSITION0.zzzz, u_xlat1);
    u_xlat1 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], input.POSITION0.wwww, u_xlat1);
    u_xlat10.xyz = float3(input.NORMAL0.yyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat10.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.NORMAL0.xxx), u_xlat10.xyz);
    u_xlat10.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.NORMAL0.zzz), u_xlat10.xyz);
    u_xlat2.x = dot(u_xlat10.xyz, u_xlat10.xyz);
    u_xlat2.x = max(u_xlat2.x, 0.00100000005);
    u_xlat2.x = rsqrt(u_xlat2.x);
    u_xlat2.xyz = u_xlat10.xyz * u_xlat2.xxx;
    u_xlat10.xyz = float3(input.TANGENT0.yyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].yzx;
    u_xlat10.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].yzx, float3(input.TANGENT0.xxx), u_xlat10.xyz);
    u_xlat10.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].yzx, float3(input.TANGENT0.zzz), u_xlat10.xyz);
    u_xlat3.x = dot(u_xlat10.xyz, u_xlat10.xyz);
    u_xlat3.x = max(u_xlat3.x, 0.00100000005);
    u_xlat3.x = rsqrt(u_xlat3.x);
    u_xlat10.xyz = u_xlat10.xyz * u_xlat3.xxx;
    u_xlat3.x = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat13.xyz = u_xlat10.xyz * u_xlat2.zxy;
    u_xlat13.xyz = fma(u_xlat2.yzx, u_xlat10.yzx, (-u_xlat13.xyz));
    u_xlat3.xyz = u_xlat3.xxx * u_xlat13.xyz;
    u_xlat33 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat33 = max(u_xlat33, 0.00100000005);
    u_xlat33 = rsqrt(u_xlat33);
    u_xlat3.xyz = float3(u_xlat33) * u_xlat3.xzy;
    u_xlat33 = UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].y + UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].x;
    u_xlat33 = u_xlat33 + UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].z;
    u_xlat33 = fract(u_xlat33);
    u_xlat33 = fma(u_xlat33, VGlobals._WaveVariation, UnityPerCamera._Time.x);
    u_xlat33 = u_xlat33 + float(input.COLOR0.y);
    u_xlat4.x = u_xlat33 * VGlobals._WindFreq;
    u_xlat4.y = fract(u_xlat4.x);
    u_xlat5.x = floor(u_xlat4.x);
    u_xlat5.y = 0.5;
    u_xlat4.x = dot(u_xlat5.xy, float2(12.9898005, 78.2330017));
    u_xlat4.xz = u_xlat4.xy * float2(0.318309873, 6.28318977);
    u_xlatb34 = u_xlat4.x>=(-u_xlat4.x);
    u_xlat4.x = fract(abs(u_xlat4.x));
    u_xlat4.x = (u_xlatb34) ? u_xlat4.x : (-u_xlat4.x);
    u_xlat4.x = u_xlat4.x * 3.14159274;
    u_xlat4.xz = sin(u_xlat4.xz);
    u_xlat4.x = u_xlat4.x * 43758.5469;
    u_xlat4.x = fract(u_xlat4.x);
    u_xlat4.x = max(u_xlat4.x, 0.5);
    u_xlat34 = u_xlat4.x * u_xlat4.z;
    u_xlat4.x = fma(u_xlat4.z, u_xlat4.x, (-VGlobals._DetailOffset));
    u_xlat16_6.x = half(u_xlat4.x * u_xlat4.x);
    u_xlat16_6.x = u_xlat16_6.x * u_xlat16_6.x;
    u_xlat4.x = dot(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz, UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz);
    u_xlat4.x = sqrt(u_xlat4.x);
    u_xlat0.x = u_xlat1.y + (-UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].y);
    u_xlat0.x = fma((-VGlobals._BendPivot), u_xlat4.x, u_xlat0.x);
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlat0.x = fma(u_xlat0.x, VGlobals._BendScale, 1.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = fma(u_xlat0.x, u_xlat0.x, (-u_xlat0.x));
    u_xlat4.x = fma(u_xlat4.y, 6.28318977, 3.14159012);
    u_xlat4.x = sin(u_xlat4.x);
    u_xlat4.x = u_xlat4.x * VGlobals._DetailAmp;
    u_xlat4.x = fma(u_xlat4.x, float(u_xlat16_6.x), u_xlat34);
    u_xlat4.x = u_xlat4.x + VGlobals._WindDir.w;
    u_xlat0.x = u_xlat0.x * u_xlat4.x;
    u_xlat4.xyz = u_xlat0.xxx * VGlobals._WindDir.xyz;
    u_xlat5.xyz = fma(u_xlat0.xxx, VGlobals._WindDir.xyz, u_xlat1.xyz);
    u_xlat0.x = u_xlat5.y + u_xlat5.x;
    u_xlat0.x = u_xlat5.z + u_xlat0.x;
    u_xlat0.x = fma(u_xlat33, VGlobals._WindFreq, u_xlat0.x);
    u_xlat0.x = u_xlat0.x + float(input.COLOR0.y);
    u_xlat5.xy = u_xlat0.xx * float2(1.97500002, 0.792999983);
    u_xlat5.xy = fract(u_xlat5.xy);
    u_xlat5.xy = fma(u_xlat5.xy, float2(2.0, 2.0), float2(-1.0, -1.0));
    u_xlat5.xy = fma(u_xlat5.xy, float2(VGlobals._DetailFreq2), float2(0.5, 0.5));
    u_xlat5.xy = fract(u_xlat5.xy);
    u_xlat5.xy = fma(u_xlat5.xy, float2(2.0, 2.0), float2(-1.0, -1.0));
    u_xlat0.x = abs(u_xlat5.y) + abs(u_xlat5.x);
    u_xlat33 = float(input.COLOR0.x) * VGlobals._DetailAmp2;
    u_xlat5.xyz = u_xlat2.xyz * float3(u_xlat33);
    u_xlat4.xyz = fma(u_xlat0.xxx, u_xlat5.xyz, u_xlat4.xyz);
    u_xlat4.xyz = u_xlat1.xyz + u_xlat4.xyz;
    u_xlat5 = u_xlat4.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat5 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat4.xxxx, u_xlat5);
    u_xlat5 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat4.zzzz, u_xlat5);
    output.mtl_Position = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat1.wwww, u_xlat5);
    u_xlat5.xyz = (-u_xlat4.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat0.x = dot(u_xlat5.xyz, u_xlat5.xyz);
    u_xlat0.x = max(u_xlat0.x, 0.00100000005);
    u_xlat0.x = rsqrt(u_xlat0.x);
    u_xlat5.xyz = fma(u_xlat5.xyz, u_xlat0.xxx, float3(VGlobals.gLightBuffer[11].xyz));
    u_xlat0.x = dot(u_xlat5.xyz, u_xlat5.xyz);
    u_xlat0.x = max(u_xlat0.x, 0.00100000005);
    u_xlat0.x = rsqrt(u_xlat0.x);
    u_xlat5.xyz = u_xlat0.xxx * u_xlat5.xyz;
    u_xlat7.x = u_xlat10.z;
    u_xlat7.y = u_xlat3.x;
    u_xlat7.z = u_xlat2.x;
    u_xlat8.x = u_xlat10.x;
    u_xlat8.y = u_xlat3.z;
    u_xlat8.z = u_xlat2.y;
    u_xlat0.xyw = u_xlat5.yyy * u_xlat8.xyz;
    u_xlat0.xyw = fma(u_xlat7.xyz, u_xlat5.xxx, u_xlat0.xyw);
    u_xlat3.x = u_xlat10.y;
    u_xlat3.z = u_xlat2.z;
    u_xlat0.xyz = fma(u_xlat3.xyz, u_xlat5.zzz, u_xlat0.xyw);
    u_xlat5.xyz = u_xlat8.xyz * float3(VGlobals.gLightBuffer[11].yyy);
    u_xlat5.xyz = fma(u_xlat7.xyz, float3(VGlobals.gLightBuffer[11].xxx), u_xlat5.xyz);
    u_xlat3.xyz = fma(u_xlat3.xyz, float3(VGlobals.gLightBuffer[11].zzz), u_xlat5.xyz);
    u_xlatb30 = 0.5<VGlobals.gPlanarShadowEnabled;
    u_xlat5.xyz = (bool(u_xlatb30)) ? u_xlat4.xyz : u_xlat1.xyz;
    if(u_xlatb30){
        u_xlat30 = (-u_xlat5.y) + VGlobals.gPlanarShadowParams.x;
        u_xlat30 = u_xlat30 / float(VGlobals.gLightBuffer[11].y);
        u_xlat7.xyz = fma(float3(VGlobals.gLightBuffer[11].xyz), float3(u_xlat30), u_xlat5.xyz);
        u_xlat8.xyz = u_xlat7.yyy * VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[1].xyw;
        u_xlat7.xyw = fma(VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[0].xyw, u_xlat7.xxx, u_xlat8.xyz);
        u_xlat7.xyz = fma(VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[2].xyw, u_xlat7.zzz, u_xlat7.xyw);
        u_xlat7.xyz = u_xlat7.xyz + VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[3].xyw;
        u_xlat16_6.xyz = half3(u_xlat7.xyz * float3(0.5, 0.5, 0.5));
        u_xlat16_9.x = u_xlat16_6.z + u_xlat16_6.x;
        u_xlat16_9.y = half(fma(float(u_xlat16_6.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_6.z)));
        u_xlat30 = u_xlat5.y + 100.0;
        u_xlat30 = u_xlat30 / VGlobals.gPlanarShadowParams.y;
        output.TEXCOORD14.z = u_xlat7.z * u_xlat30;
        output.TEXCOORD14.xy = float2(u_xlat16_9.xy);
        output.TEXCOORD14.w = u_xlat7.z;
    } else {
        u_xlat5.w = 1.0;
        output.TEXCOORD14.x = dot(VGlobals.gShadowParams0[0], u_xlat5);
        output.TEXCOORD14.y = dot(VGlobals.gShadowParams0[1], u_xlat5);
        output.TEXCOORD14.z = dot(VGlobals.gShadowParams0[2], u_xlat5);
        output.TEXCOORD14.w = dot(VGlobals.gShadowParams0[3], u_xlat5);
    }
    u_xlat2.w = 1.0;
    u_xlat16_6.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat2));
    u_xlat16_6.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat2));
    u_xlat16_6.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat2));
    u_xlat16_5 = half4(u_xlat2.yzzx * u_xlat2.xyzz);
    u_xlat16_9.x = dot(VGlobals.gLightBuffer[3], u_xlat16_5);
    u_xlat16_9.y = dot(VGlobals.gLightBuffer[4], u_xlat16_5);
    u_xlat16_9.z = dot(VGlobals.gLightBuffer[5], u_xlat16_5);
    u_xlat16_36 = half(u_xlat2.y * u_xlat2.y);
    u_xlat16_36 = half(fma(u_xlat2.x, u_xlat2.x, (-float(u_xlat16_36))));
    u_xlat16_9.xyz = fma(VGlobals.gLightBuffer[6].xyz, half3(u_xlat16_36), u_xlat16_9.xyz);
    u_xlat16_6.xyz = u_xlat16_6.xyz + u_xlat16_9.xyz;
    u_xlat16_6.xyz = u_xlat16_6.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_6.xyz = max(u_xlat16_6.xyz, half3(0.0, 0.0, 0.0));
    output.TEXCOORD0.xyz = u_xlat4.xyz;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.xyz = u_xlat1.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    output.TEXCOORD3.xyz = half3(u_xlat0.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    output.TEXCOORD4.xyz = half3(u_xlat3.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat2.xyz);
    output.TEXCOORD8.xyz = float3(u_xlat16_6.xyz);
    output.TEXCOORD21 = half4(0.0, 0.0, 0.0, 0.0);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
