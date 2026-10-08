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
    half4 gLightBuffer [115];
    half4 gFogParams [9];
    half gFogFuncEnabled ;
    float4 gShadowParams0 [6];
    half _WeatherSplitOn ;
    float _TerrainValidSize ;
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
    unity_Builtins0Array_Type unity_Builtins0Array [2];
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
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]];
    half4 TEXCOORD20 [[ user(TEXCOORD20) ]];
    half4 TEXCOORD21 [[ user(TEXCOORD21) ]];
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(2) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(3) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(4) ]],
    const constant unity_Builtins0Array_Type* UnityInstancing_PerDraw0 [[ buffer(5) ]],
    sampler sampler_WeatherSplitTex [[ sampler (0) ]],
    texture2d<half, access::sample > _WeatherSplitTex [[ texture(0) ]] ,
    texture2d<half, access::sample > BnSFog_FogMaskTex [[ texture(1) ]] ,
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    constexpr sampler BnsFog_LinearClampSampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 u_xlat0;
    int u_xlati0;
    float4 u_xlat1;
    float4 u_xlat2;
    float3 u_xlat3;
    float3 u_xlat4;
    float4 u_xlat5;
    half4 u_xlat16_5;
    half3 u_xlat16_6;
    float3 u_xlat7;
    float3 u_xlat8;
    half3 u_xlat16_9;
    half3 u_xlat16_10;
    half3 u_xlat16_11;
    float3 u_xlat12;
    float3 u_xlat15;
    half u_xlat16_18;
    half2 u_xlat16_30;
    float u_xlat36;
    bool u_xlatb36;
    float u_xlat37;
    bool u_xlatb37;
    float u_xlat39;
    bool u_xlatb39;
    float u_xlat40;
    bool u_xlatb40;
    half u_xlat16_42;
    half u_xlat16_45;
    half u_xlat16_46;
    u_xlati0 = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0 = u_xlati0 << 0x3;
    u_xlat1 = input.POSITION0.yyyy * UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat1 = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], input.POSITION0.xxxx, u_xlat1);
    u_xlat1 = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], input.POSITION0.zzzz, u_xlat1);
    u_xlat1 = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], input.POSITION0.wwww, u_xlat1);
    u_xlat12.xyz = float3(input.NORMAL0.yyy) * UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat12.xyz = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.NORMAL0.xxx), u_xlat12.xyz);
    u_xlat12.xyz = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.NORMAL0.zzz), u_xlat12.xyz);
    u_xlat2.x = dot(u_xlat12.xyz, u_xlat12.xyz);
    u_xlat2.x = max(u_xlat2.x, 0.00100000005);
    u_xlat2.x = rsqrt(u_xlat2.x);
    u_xlat2.xyz = u_xlat12.xyz * u_xlat2.xxx;
    u_xlat12.xyz = float3(input.TANGENT0.yyy) * UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].yzx;
    u_xlat12.xyz = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].yzx, float3(input.TANGENT0.xxx), u_xlat12.xyz);
    u_xlat12.xyz = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].yzx, float3(input.TANGENT0.zzz), u_xlat12.xyz);
    u_xlat3.x = dot(u_xlat12.xyz, u_xlat12.xyz);
    u_xlat3.x = max(u_xlat3.x, 0.00100000005);
    u_xlat3.x = rsqrt(u_xlat3.x);
    u_xlat12.xyz = u_xlat12.xyz * u_xlat3.xxx;
    u_xlat3.x = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat15.xyz = u_xlat12.xyz * u_xlat2.zxy;
    u_xlat15.xyz = fma(u_xlat2.yzx, u_xlat12.yzx, (-u_xlat15.xyz));
    u_xlat3.xyz = u_xlat3.xxx * u_xlat15.xyz;
    u_xlat39 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat39 = max(u_xlat39, 0.00100000005);
    u_xlat39 = rsqrt(u_xlat39);
    u_xlat3.xyz = float3(u_xlat39) * u_xlat3.xzy;
    u_xlat39 = UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].y + UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].x;
    u_xlat39 = u_xlat39 + UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].z;
    u_xlat39 = fract(u_xlat39);
    u_xlat39 = fma(u_xlat39, VGlobals._WaveVariation, UnityPerCamera._Time.x);
    u_xlat39 = u_xlat39 + float(input.COLOR0.y);
    u_xlat4.x = u_xlat39 * VGlobals._WindFreq;
    u_xlat4.y = fract(u_xlat4.x);
    u_xlat5.x = floor(u_xlat4.x);
    u_xlat5.y = 0.5;
    u_xlat4.x = dot(u_xlat5.xy, float2(12.9898005, 78.2330017));
    u_xlat4.xz = u_xlat4.xy * float2(0.318309873, 6.28318977);
    u_xlatb40 = u_xlat4.x>=(-u_xlat4.x);
    u_xlat4.x = fract(abs(u_xlat4.x));
    u_xlat4.x = (u_xlatb40) ? u_xlat4.x : (-u_xlat4.x);
    u_xlat4.x = u_xlat4.x * 3.14159274;
    u_xlat4.xz = sin(u_xlat4.xz);
    u_xlat4.x = u_xlat4.x * 43758.5469;
    u_xlat4.x = fract(u_xlat4.x);
    u_xlat4.x = max(u_xlat4.x, 0.5);
    u_xlat40 = u_xlat4.x * u_xlat4.z;
    u_xlat4.x = fma(u_xlat4.z, u_xlat4.x, (-VGlobals._DetailOffset));
    u_xlat16_6.x = half(u_xlat4.x * u_xlat4.x);
    u_xlat16_6.x = u_xlat16_6.x * u_xlat16_6.x;
    u_xlat4.x = dot(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz, UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz);
    u_xlat4.x = sqrt(u_xlat4.x);
    u_xlat0.x = u_xlat1.y + (-UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].y);
    u_xlat0.x = fma((-VGlobals._BendPivot), u_xlat4.x, u_xlat0.x);
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlat0.x = fma(u_xlat0.x, VGlobals._BendScale, 1.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = fma(u_xlat0.x, u_xlat0.x, (-u_xlat0.x));
    u_xlat4.x = fma(u_xlat4.y, 6.28318977, 3.14159012);
    u_xlat4.x = sin(u_xlat4.x);
    u_xlat4.x = u_xlat4.x * VGlobals._DetailAmp;
    u_xlat4.x = fma(u_xlat4.x, float(u_xlat16_6.x), u_xlat40);
    u_xlat4.x = u_xlat4.x + VGlobals._WindDir.w;
    u_xlat0.x = u_xlat0.x * u_xlat4.x;
    u_xlat4.xyz = u_xlat0.xxx * VGlobals._WindDir.xyz;
    u_xlat5.xyz = fma(u_xlat0.xxx, VGlobals._WindDir.xyz, u_xlat1.xyz);
    u_xlat0.x = u_xlat5.y + u_xlat5.x;
    u_xlat0.x = u_xlat5.z + u_xlat0.x;
    u_xlat0.x = fma(u_xlat39, VGlobals._WindFreq, u_xlat0.x);
    u_xlat0.x = u_xlat0.x + float(input.COLOR0.y);
    u_xlat5.xy = u_xlat0.xx * float2(1.97500002, 0.792999983);
    u_xlat5.xy = fract(u_xlat5.xy);
    u_xlat5.xy = fma(u_xlat5.xy, float2(2.0, 2.0), float2(-1.0, -1.0));
    u_xlat5.xy = fma(u_xlat5.xy, float2(VGlobals._DetailFreq2), float2(0.5, 0.5));
    u_xlat5.xy = fract(u_xlat5.xy);
    u_xlat5.xy = fma(u_xlat5.xy, float2(2.0, 2.0), float2(-1.0, -1.0));
    u_xlat0.x = abs(u_xlat5.y) + abs(u_xlat5.x);
    u_xlat39 = float(input.COLOR0.x) * VGlobals._DetailAmp2;
    u_xlat5.xyz = u_xlat2.xyz * float3(u_xlat39);
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
    u_xlat7.x = u_xlat12.z;
    u_xlat7.y = u_xlat3.x;
    u_xlat7.z = u_xlat2.x;
    u_xlat8.x = u_xlat12.x;
    u_xlat8.y = u_xlat3.z;
    u_xlat8.z = u_xlat2.y;
    u_xlat0.xyw = u_xlat5.yyy * u_xlat8.xyz;
    u_xlat0.xyw = fma(u_xlat7.xyz, u_xlat5.xxx, u_xlat0.xyw);
    u_xlat3.x = u_xlat12.y;
    u_xlat3.z = u_xlat2.z;
    u_xlat0.xyz = fma(u_xlat3.xyz, u_xlat5.zzz, u_xlat0.xyw);
    u_xlat5.xyz = u_xlat8.xyz * float3(VGlobals.gLightBuffer[11].yyy);
    u_xlat5.xyz = fma(u_xlat7.xyz, float3(VGlobals.gLightBuffer[11].xxx), u_xlat5.xyz);
    u_xlat3.xyz = fma(u_xlat3.xyz, float3(VGlobals.gLightBuffer[11].zzz), u_xlat5.xyz);
    u_xlat1.w = 1.0;
    output.TEXCOORD14.x = dot(VGlobals.gShadowParams0[0], u_xlat1);
    output.TEXCOORD14.y = dot(VGlobals.gShadowParams0[1], u_xlat1);
    output.TEXCOORD14.z = dot(VGlobals.gShadowParams0[2], u_xlat1);
    output.TEXCOORD14.w = dot(VGlobals.gShadowParams0[3], u_xlat1);
    u_xlatb36 = VGlobals.gFogFuncEnabled>=half(0.5);
    if(u_xlatb36){
        u_xlat5.xyz = u_xlat4.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
        u_xlat36 = dot(u_xlat5.xyz, u_xlat5.xyz);
        u_xlat37 = max(u_xlat36, 0.00100000005);
        u_xlat37 = rsqrt(u_xlat37);
        u_xlat5.xzw = float3(u_xlat37) * u_xlat5.xyz;
        u_xlat36 = sqrt(u_xlat36);
        u_xlat16_6.x = half(u_xlat36 + (-float(VGlobals.gFogParams[1].z)));
        u_xlat16_6.y = half(u_xlat36 + (-float(VGlobals.gFogParams[5].y)));
        u_xlat16_6.xy = max(u_xlat16_6.xy, half2(0.0, 0.0));
        u_xlat16_30.x = VGlobals.gFogParams[0].w + VGlobals.gFogParams[1].x;
        u_xlat16_42 = half(float(VGlobals.gFogParams[1].z) / u_xlat36);
        u_xlat16_42 = clamp(u_xlat16_42, 0.0h, 1.0h);
        u_xlat37 = fma(u_xlat5.y, float(u_xlat16_42), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
        u_xlat37 = u_xlat37 + (-float(VGlobals.gFogParams[0].x));
        u_xlat37 = max(u_xlat37, -127.0);
        u_xlat37 = (-u_xlat37) * float(VGlobals.gFogParams[1].w);
        u_xlat37 = exp2(u_xlat37);
        u_xlat16_42 = (-u_xlat16_42) + half(1.0);
        u_xlat39 = u_xlat5.y * float(u_xlat16_42);
        u_xlat39 = u_xlat39 * float(VGlobals.gFogParams[1].w);
        u_xlat39 = max(u_xlat39, -64.0);
        u_xlat40 = exp2((-u_xlat39));
        u_xlat40 = (-u_xlat40) + 1.0;
        u_xlat40 = u_xlat40 / u_xlat39;
        u_xlatb39 = 0.00999999978<abs(u_xlat39);
        u_xlat39 = (u_xlatb39) ? u_xlat40 : 0.693147004;
        u_xlat37 = u_xlat37 * u_xlat39;
        u_xlat16_6.x = half(u_xlat37 * (-float(u_xlat16_6.x)));
        u_xlat16_6.x = u_xlat16_30.x * u_xlat16_6.x;
        u_xlat16_6.x = u_xlat16_6.x * VGlobals.gFogParams[0].y;
        u_xlat16_6.x = exp2(u_xlat16_6.x);
        u_xlat16_6.x = max(u_xlat16_6.x, VGlobals.gFogParams[0].z);
        u_xlat16_42 = dot(float3(VGlobals.gLightBuffer[11].xyz), u_xlat5.xzw);
        u_xlat16_9.xyz = VGlobals.gFogParams[0].www * VGlobals.gFogParams[2].xyz;
        u_xlat16_45 = fma(u_xlat16_42, u_xlat16_42, half(1.0));
        u_xlat37 = float(u_xlat16_45) * 0.0596831031;
        u_xlat16_10.xyz = VGlobals.gFogParams[1].xxx * VGlobals.gFogParams[3].xyz;
        u_xlat16_46 = fma((-VGlobals.gFogParams[1].y), VGlobals.gFogParams[1].y, half(1.0));
        u_xlat39 = float(u_xlat16_46) * 0.119366206;
        u_xlat16_11.xy = fma(VGlobals.gFogParams[1].yy, VGlobals.gFogParams[1].yy, half2(1.0, 2.0));
        u_xlat16_42 = dot(half2(u_xlat16_42), VGlobals.gFogParams[1].yy);
        u_xlat16_42 = (-u_xlat16_42) + u_xlat16_11.x;
        u_xlat16_42 = log2(abs(u_xlat16_42));
        u_xlat16_42 = u_xlat16_42 * half(-1.5);
        u_xlat16_42 = exp2(u_xlat16_42);
        u_xlat39 = u_xlat39 * float(u_xlat16_42);
        u_xlat39 = float(u_xlat16_45) * u_xlat39;
        u_xlat39 = u_xlat39 / float(u_xlat16_11.y);
        u_xlat16_10.xyz = half3(float3(u_xlat39) * float3(u_xlat16_10.xyz));
        u_xlat16_11.xyz = VGlobals.gLightBuffer[12].xyz * VGlobals.gFogParams[2].www;
        u_xlat16_9.xyz = half3(fma(float3(u_xlat16_9.xyz), float3(u_xlat37), float3(u_xlat16_10.xyz)));
        u_xlat16_9.xyz = u_xlat16_9.xyz * u_xlat16_11.xyz;
        u_xlat16_9.xyz = u_xlat16_9.xyz / u_xlat16_30.xxx;
        u_xlat16_30.x = (-u_xlat16_6.x) + half(1.0);
        u_xlat16_9.xyz = u_xlat16_30.xxx * u_xlat16_9.xyz;
        u_xlat16_30.x = half(float(VGlobals.gFogParams[5].y) / u_xlat36);
        u_xlat16_30.x = clamp(u_xlat16_30.x, 0.0h, 1.0h);
        u_xlat36 = fma(u_xlat5.y, float(u_xlat16_30.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
        u_xlat36 = u_xlat36 + (-float(VGlobals.gFogParams[3].w));
        u_xlat36 = max(u_xlat36, -127.0);
        u_xlat36 = (-u_xlat36) * float(VGlobals.gFogParams[5].z);
        u_xlat36 = exp2(u_xlat36);
        u_xlat16_30.x = (-u_xlat16_30.x) + half(1.0);
        u_xlat37 = u_xlat5.y * float(u_xlat16_30.x);
        u_xlat37 = u_xlat37 * float(VGlobals.gFogParams[5].z);
        u_xlat37 = max(u_xlat37, -64.0);
        u_xlat39 = exp2((-u_xlat37));
        u_xlat39 = (-u_xlat39) + 1.0;
        u_xlat39 = u_xlat39 / u_xlat37;
        u_xlatb37 = 0.00999999978<abs(u_xlat37);
        u_xlat37 = (u_xlatb37) ? u_xlat39 : 0.693147004;
        u_xlat36 = u_xlat36 * u_xlat37;
        u_xlat16_18 = half(u_xlat36 * (-float(u_xlat16_6.y)));
        u_xlat16_18 = u_xlat16_18 * VGlobals.gFogParams[4].w;
        u_xlat16_18 = exp2(u_xlat16_18);
        u_xlat16_18 = max(u_xlat16_18, VGlobals.gFogParams[5].x);
        u_xlat16_30.x = (-u_xlat16_18) + half(1.0);
        u_xlat16_9.xyz = half3(u_xlat16_18) * u_xlat16_9.xyz;
        u_xlat16_5.xyz = fma(VGlobals.gFogParams[4].xyz, u_xlat16_30.xxx, u_xlat16_9.xyz);
        u_xlat16_5.w = u_xlat16_6.x * u_xlat16_18;
        u_xlatb36 = half(0.5)<VGlobals.gFogParams[7].x;
        if(u_xlatb36){
            u_xlat16_30.xy = half2(fma(u_xlat4.xz, float2(VGlobals.gFogParams[8].xy), float2(VGlobals.gFogParams[8].zw)));
            u_xlat16_30.x = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_30.xy), level(0.0)).x;
            u_xlat16_30.x = log2(u_xlat16_30.x);
            u_xlat16_30.x = u_xlat16_30.x * VGlobals.gFogParams[7].y;
            u_xlat16_30.x = exp2(u_xlat16_30.x);
            u_xlat16_6.x = fma((-u_xlat16_18), u_xlat16_6.x, half(1.0));
            output.TEXCOORD7.w = fma(u_xlat16_30.x, u_xlat16_6.x, u_xlat16_5.w);
            output.TEXCOORD7.xyz = fma(u_xlat16_30.xxx, (-u_xlat16_5.xyz), u_xlat16_5.xyz);
        } else {
            output.TEXCOORD7 = u_xlat16_5;
        }
    } else {
        output.TEXCOORD7 = half4(0.0, 0.0, 0.0, 1.0);
    }
    u_xlat2.w = 1.0;
    u_xlat16_6.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat2));
    u_xlat16_6.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat2));
    u_xlat16_6.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat2));
    u_xlat16_5 = half4(u_xlat2.yzzx * u_xlat2.xyzz);
    u_xlat16_9.x = dot(VGlobals.gLightBuffer[3], u_xlat16_5);
    u_xlat16_9.y = dot(VGlobals.gLightBuffer[4], u_xlat16_5);
    u_xlat16_9.z = dot(VGlobals.gLightBuffer[5], u_xlat16_5);
    u_xlat16_42 = half(u_xlat2.y * u_xlat2.y);
    u_xlat16_42 = half(fma(u_xlat2.x, u_xlat2.x, (-float(u_xlat16_42))));
    u_xlat16_9.xyz = fma(VGlobals.gLightBuffer[6].xyz, half3(u_xlat16_42), u_xlat16_9.xyz);
    u_xlat16_6.xyz = u_xlat16_6.xyz + u_xlat16_9.xyz;
    u_xlat16_6.xyz = u_xlat16_6.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_6.xyz = max(u_xlat16_6.xyz, half3(0.0, 0.0, 0.0));
    u_xlatb36 = half(0.0)!=VGlobals._WeatherSplitOn;
    if(u_xlatb36){
        u_xlat7.xy = u_xlat4.xz / float2(VGlobals._TerrainValidSize);
        u_xlat7.xy = u_xlat7.xy + float2(0.5, 0.5);
        u_xlat5 = float4(_WeatherSplitTex.sample(sampler_WeatherSplitTex, u_xlat7.xy, level(0.0)));
        output.TEXCOORD20 = half4(u_xlat5);
    }
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
