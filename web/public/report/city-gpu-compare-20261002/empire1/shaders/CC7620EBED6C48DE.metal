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
    float4 u_xlat4;
    half4 u_xlat16_4;
    float3 u_xlat5;
    float3 u_xlat6;
    half3 u_xlat16_7;
    half3 u_xlat16_8;
    half3 u_xlat16_9;
    half3 u_xlat16_10;
    float3 u_xlat11;
    half u_xlat16_18;
    half2 u_xlat16_29;
    float u_xlat33;
    bool u_xlatb33;
    float u_xlat34;
    bool u_xlatb34;
    float u_xlat36;
    bool u_xlatb36;
    half u_xlat16_40;
    half u_xlat16_41;
    half u_xlat16_42;
    u_xlati0 = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0 = u_xlati0 << 0x3;
    u_xlat1 = input.POSITION0.yyyy * UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat1 = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], input.POSITION0.xxxx, u_xlat1);
    u_xlat1 = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], input.POSITION0.zzzz, u_xlat1);
    u_xlat1 = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], input.POSITION0.wwww, u_xlat1);
    u_xlat11.xyz = float3(input.NORMAL0.yyy) * UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat11.xyz = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.NORMAL0.xxx), u_xlat11.xyz);
    u_xlat11.xyz = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.NORMAL0.zzz), u_xlat11.xyz);
    u_xlat2.x = dot(u_xlat11.xyz, u_xlat11.xyz);
    u_xlat2.x = max(u_xlat2.x, 0.00100000005);
    u_xlat2.x = rsqrt(u_xlat2.x);
    u_xlat2.xyz = u_xlat11.xyz * u_xlat2.xxx;
    u_xlat11.xyz = float3(input.TANGENT0.yyy) * UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].yzx;
    u_xlat11.xyz = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].yzx, float3(input.TANGENT0.xxx), u_xlat11.xyz);
    u_xlat0.xyz = fma(UnityInstancing_PerDraw0[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].yzx, float3(input.TANGENT0.zzz), u_xlat11.xyz);
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
    output.mtl_Position = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat1.wwww, u_xlat4);
    u_xlat4.xyz = (-u_xlat1.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat33 = dot(u_xlat4.xyz, u_xlat4.xyz);
    u_xlat33 = max(u_xlat33, 0.00100000005);
    u_xlat33 = rsqrt(u_xlat33);
    u_xlat4.xyz = fma(u_xlat4.xyz, float3(u_xlat33), float3(VGlobals.gLightBuffer[11].xyz));
    u_xlat33 = dot(u_xlat4.xyz, u_xlat4.xyz);
    u_xlat33 = max(u_xlat33, 0.00100000005);
    u_xlat33 = rsqrt(u_xlat33);
    u_xlat4.xyz = float3(u_xlat33) * u_xlat4.xyz;
    u_xlat5.x = u_xlat0.z;
    u_xlat5.y = u_xlat3.x;
    u_xlat5.z = u_xlat2.x;
    u_xlat6.x = u_xlat0.x;
    u_xlat6.y = u_xlat3.z;
    u_xlat6.z = u_xlat2.y;
    u_xlat0.xzw = u_xlat4.yyy * u_xlat6.xyz;
    u_xlat0.xzw = fma(u_xlat5.xyz, u_xlat4.xxx, u_xlat0.xzw);
    u_xlat3.x = u_xlat0.y;
    u_xlat3.z = u_xlat2.z;
    u_xlat0.xyz = fma(u_xlat3.xyz, u_xlat4.zzz, u_xlat0.xzw);
    u_xlat4.xyz = u_xlat6.xyz * float3(VGlobals.gLightBuffer[11].yyy);
    u_xlat4.xyz = fma(u_xlat5.xyz, float3(VGlobals.gLightBuffer[11].xxx), u_xlat4.xyz);
    u_xlat3.xyz = fma(u_xlat3.xyz, float3(VGlobals.gLightBuffer[11].zzz), u_xlat4.xyz);
    u_xlat1.w = 1.0;
    output.TEXCOORD14.x = dot(VGlobals.gShadowParams0[0], u_xlat1);
    output.TEXCOORD14.y = dot(VGlobals.gShadowParams0[1], u_xlat1);
    output.TEXCOORD14.z = dot(VGlobals.gShadowParams0[2], u_xlat1);
    output.TEXCOORD14.w = dot(VGlobals.gShadowParams0[3], u_xlat1);
    u_xlatb33 = VGlobals.gFogFuncEnabled>=half(0.5);
    if(u_xlatb33){
        u_xlat4.xyz = u_xlat1.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
        u_xlat33 = dot(u_xlat4.xyz, u_xlat4.xyz);
        u_xlat34 = max(u_xlat33, 0.00100000005);
        u_xlat34 = rsqrt(u_xlat34);
        u_xlat4.xzw = float3(u_xlat34) * u_xlat4.xyz;
        u_xlat33 = sqrt(u_xlat33);
        u_xlat16_7.x = half(u_xlat33 + (-float(VGlobals.gFogParams[1].z)));
        u_xlat16_7.y = half(u_xlat33 + (-float(VGlobals.gFogParams[5].y)));
        u_xlat16_7.xy = max(u_xlat16_7.xy, half2(0.0, 0.0));
        u_xlat16_29.x = VGlobals.gFogParams[0].w + VGlobals.gFogParams[1].x;
        u_xlat16_40 = half(float(VGlobals.gFogParams[1].z) / u_xlat33);
        u_xlat16_40 = clamp(u_xlat16_40, 0.0h, 1.0h);
        u_xlat34 = fma(u_xlat4.y, float(u_xlat16_40), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
        u_xlat34 = u_xlat34 + (-float(VGlobals.gFogParams[0].x));
        u_xlat34 = max(u_xlat34, -127.0);
        u_xlat34 = (-u_xlat34) * float(VGlobals.gFogParams[1].w);
        u_xlat34 = exp2(u_xlat34);
        u_xlat16_40 = (-u_xlat16_40) + half(1.0);
        u_xlat36 = u_xlat4.y * float(u_xlat16_40);
        u_xlat36 = u_xlat36 * float(VGlobals.gFogParams[1].w);
        u_xlat36 = max(u_xlat36, -64.0);
        u_xlat5.x = exp2((-u_xlat36));
        u_xlat5.x = (-u_xlat5.x) + 1.0;
        u_xlat5.x = u_xlat5.x / u_xlat36;
        u_xlatb36 = 0.00999999978<abs(u_xlat36);
        u_xlat36 = (u_xlatb36) ? u_xlat5.x : 0.693147004;
        u_xlat34 = u_xlat34 * u_xlat36;
        u_xlat16_7.x = half(u_xlat34 * (-float(u_xlat16_7.x)));
        u_xlat16_7.x = u_xlat16_29.x * u_xlat16_7.x;
        u_xlat16_7.x = u_xlat16_7.x * VGlobals.gFogParams[0].y;
        u_xlat16_7.x = exp2(u_xlat16_7.x);
        u_xlat16_7.x = max(u_xlat16_7.x, VGlobals.gFogParams[0].z);
        u_xlat16_40 = dot(float3(VGlobals.gLightBuffer[11].xyz), u_xlat4.xzw);
        u_xlat16_8.xyz = VGlobals.gFogParams[0].www * VGlobals.gFogParams[2].xyz;
        u_xlat16_41 = fma(u_xlat16_40, u_xlat16_40, half(1.0));
        u_xlat34 = float(u_xlat16_41) * 0.0596831031;
        u_xlat16_9.xyz = VGlobals.gFogParams[1].xxx * VGlobals.gFogParams[3].xyz;
        u_xlat16_42 = fma((-VGlobals.gFogParams[1].y), VGlobals.gFogParams[1].y, half(1.0));
        u_xlat36 = float(u_xlat16_42) * 0.119366206;
        u_xlat16_10.xy = fma(VGlobals.gFogParams[1].yy, VGlobals.gFogParams[1].yy, half2(1.0, 2.0));
        u_xlat16_40 = dot(half2(u_xlat16_40), VGlobals.gFogParams[1].yy);
        u_xlat16_40 = (-u_xlat16_40) + u_xlat16_10.x;
        u_xlat16_40 = log2(abs(u_xlat16_40));
        u_xlat16_40 = u_xlat16_40 * half(-1.5);
        u_xlat16_40 = exp2(u_xlat16_40);
        u_xlat36 = u_xlat36 * float(u_xlat16_40);
        u_xlat36 = float(u_xlat16_41) * u_xlat36;
        u_xlat36 = u_xlat36 / float(u_xlat16_10.y);
        u_xlat16_9.xyz = half3(float3(u_xlat36) * float3(u_xlat16_9.xyz));
        u_xlat16_10.xyz = VGlobals.gLightBuffer[12].xyz * VGlobals.gFogParams[2].www;
        u_xlat16_8.xyz = half3(fma(float3(u_xlat16_8.xyz), float3(u_xlat34), float3(u_xlat16_9.xyz)));
        u_xlat16_8.xyz = u_xlat16_8.xyz * u_xlat16_10.xyz;
        u_xlat16_8.xyz = u_xlat16_8.xyz / u_xlat16_29.xxx;
        u_xlat16_29.x = (-u_xlat16_7.x) + half(1.0);
        u_xlat16_8.xyz = u_xlat16_29.xxx * u_xlat16_8.xyz;
        u_xlat16_29.x = half(float(VGlobals.gFogParams[5].y) / u_xlat33);
        u_xlat16_29.x = clamp(u_xlat16_29.x, 0.0h, 1.0h);
        u_xlat33 = fma(u_xlat4.y, float(u_xlat16_29.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
        u_xlat33 = u_xlat33 + (-float(VGlobals.gFogParams[3].w));
        u_xlat33 = max(u_xlat33, -127.0);
        u_xlat33 = (-u_xlat33) * float(VGlobals.gFogParams[5].z);
        u_xlat33 = exp2(u_xlat33);
        u_xlat16_29.x = (-u_xlat16_29.x) + half(1.0);
        u_xlat34 = u_xlat4.y * float(u_xlat16_29.x);
        u_xlat34 = u_xlat34 * float(VGlobals.gFogParams[5].z);
        u_xlat34 = max(u_xlat34, -64.0);
        u_xlat36 = exp2((-u_xlat34));
        u_xlat36 = (-u_xlat36) + 1.0;
        u_xlat36 = u_xlat36 / u_xlat34;
        u_xlatb34 = 0.00999999978<abs(u_xlat34);
        u_xlat34 = (u_xlatb34) ? u_xlat36 : 0.693147004;
        u_xlat33 = u_xlat33 * u_xlat34;
        u_xlat16_18 = half(u_xlat33 * (-float(u_xlat16_7.y)));
        u_xlat16_18 = u_xlat16_18 * VGlobals.gFogParams[4].w;
        u_xlat16_18 = exp2(u_xlat16_18);
        u_xlat16_18 = max(u_xlat16_18, VGlobals.gFogParams[5].x);
        u_xlat16_29.x = (-u_xlat16_18) + half(1.0);
        u_xlat16_8.xyz = half3(u_xlat16_18) * u_xlat16_8.xyz;
        u_xlat16_4.xyz = fma(VGlobals.gFogParams[4].xyz, u_xlat16_29.xxx, u_xlat16_8.xyz);
        u_xlat16_4.w = u_xlat16_7.x * u_xlat16_18;
        u_xlatb33 = half(0.5)<VGlobals.gFogParams[7].x;
        if(u_xlatb33){
            u_xlat16_29.xy = half2(fma(u_xlat1.xz, float2(VGlobals.gFogParams[8].xy), float2(VGlobals.gFogParams[8].zw)));
            u_xlat16_29.x = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_29.xy), level(0.0)).x;
            u_xlat16_29.x = log2(u_xlat16_29.x);
            u_xlat16_29.x = u_xlat16_29.x * VGlobals.gFogParams[7].y;
            u_xlat16_29.x = exp2(u_xlat16_29.x);
            u_xlat16_7.x = fma((-u_xlat16_18), u_xlat16_7.x, half(1.0));
            output.TEXCOORD7.w = fma(u_xlat16_29.x, u_xlat16_7.x, u_xlat16_4.w);
            output.TEXCOORD7.xyz = fma(u_xlat16_29.xxx, (-u_xlat16_4.xyz), u_xlat16_4.xyz);
        } else {
            output.TEXCOORD7 = u_xlat16_4;
        }
    } else {
        output.TEXCOORD7 = half4(0.0, 0.0, 0.0, 1.0);
    }
    u_xlat2.w = 1.0;
    u_xlat16_7.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat2));
    u_xlat16_7.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat2));
    u_xlat16_7.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat2));
    u_xlat16_4 = half4(u_xlat2.yzzx * u_xlat2.xyzz);
    u_xlat16_8.x = dot(VGlobals.gLightBuffer[3], u_xlat16_4);
    u_xlat16_8.y = dot(VGlobals.gLightBuffer[4], u_xlat16_4);
    u_xlat16_8.z = dot(VGlobals.gLightBuffer[5], u_xlat16_4);
    u_xlat16_40 = half(u_xlat2.y * u_xlat2.y);
    u_xlat16_40 = half(fma(u_xlat2.x, u_xlat2.x, (-float(u_xlat16_40))));
    u_xlat16_8.xyz = fma(VGlobals.gLightBuffer[6].xyz, half3(u_xlat16_40), u_xlat16_8.xyz);
    u_xlat16_7.xyz = u_xlat16_7.xyz + u_xlat16_8.xyz;
    u_xlat16_7.xyz = u_xlat16_7.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_7.xyz = max(u_xlat16_7.xyz, half3(0.0, 0.0, 0.0));
    u_xlatb33 = half(0.0)!=VGlobals._WeatherSplitOn;
    if(u_xlatb33){
        u_xlat5.xy = u_xlat1.xz / float2(VGlobals._TerrainValidSize);
        u_xlat5.xy = u_xlat5.xy + float2(0.5, 0.5);
        u_xlat4 = float4(_WeatherSplitTex.sample(sampler_WeatherSplitTex, u_xlat5.xy, level(0.0)));
        output.TEXCOORD20 = half4(u_xlat4);
    }
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
    output.TEXCOORD8.xyz = float3(u_xlat16_7.xyz);
    output.TEXCOORD21 = half4(0.0, 0.0, 0.0, 0.0);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
