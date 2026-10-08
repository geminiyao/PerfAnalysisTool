#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

constant float4 ImmCB_0[4] =
{
	float4(1.0, 0.0, 0.0, 0.0),
	float4(0.0, 1.0, 0.0, 0.0),
	float4(0.0, 0.0, 1.0, 0.0),
	float4(0.0, 0.0, 0.0, 1.0)
};
struct VGlobals_Type
{
    half4 gLightBuffer [115];
    half4 gFogParams [9];
    half gFogFuncEnabled ;
    float4 gShadowParams0 [6];
    float4 hlslcc_mtx4x4_NonJitteredViewProjMatrix [4];
    float4 _NeckWeights [128];
    float4 _boneTexture_TexelSize ;
    int _NeckWeightOffset ;
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

struct AnimPropsArray_Type
{
    float4 FrameIndices ;
    float4 LerpWeights ;
};

struct UnityInstancing_AnimProps_Type
{
    AnimPropsArray_Type AnimPropsArray [2];
};

struct Mtl_VertexIn
{
    float4 POSITION0 [[ attribute(0) ]] ;
    half4 TANGENT0 [[ attribute(1) ]] ;
    half3 NORMAL0 [[ attribute(2) ]] ;
    half4 TEXCOORD0 [[ attribute(3) ]] ;
    half4 TEXCOORD1 [[ attribute(4) ]] ;
    half4 TEXCOORD2 [[ attribute(5) ]] ;
    half4 COLOR0 [[ attribute(6) ]] ;
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
    float3 TEXCOORD16 [[ user(TEXCOORD16) ]];
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(2) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(3) ]],
    const constant unity_Builtins0Array_Type* UnityInstancing_PerDraw0 [[ buffer(4) ]],
    const constant AnimPropsArray_Type* UnityInstancing_AnimProps [[ buffer(5) ]],
    sampler sampler_boneTexture [[ sampler (0) ]],
    texture2d<float, access::sample > _boneTexture [[ texture(0) ]] ,
    texture2d<half, access::sample > BnSFog_FogMaskTex [[ texture(1) ]] ,
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    constexpr sampler BnsFog_LinearClampSampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 u_xlat0;
    int2 u_xlati0;
    float4 u_xlat1;
    half4 u_xlat16_1;
    int u_xlati1;
    bool u_xlatb1;
    float4 u_xlat2;
    half4 u_xlat16_2;
    float4 u_xlat3;
    float4 u_xlat4;
    float4 u_xlat5;
    half4 u_xlat16_5;
    float4 u_xlat6;
    half4 u_xlat16_6;
    float4 u_xlat7;
    half3 u_xlat16_7;
    half4 u_xlat16_8;
    float3 u_xlat9;
    half3 u_xlat16_9;
    float3 u_xlat10;
    bool u_xlatb10;
    half3 u_xlat16_11;
    half3 u_xlat16_12;
    half3 u_xlat16_13;
    float u_xlat15;
    int u_xlati15;
    float3 u_xlat19;
    half u_xlat16_22;
    float u_xlat24;
    float u_xlat28;
    bool u_xlatb28;
    float u_xlat29;
    half2 u_xlat16_36;
    float u_xlat42;
    bool u_xlatb42;
    uint u_xlatu43;
    float u_xlat45;
    float u_xlat46;
    bool u_xlatb46;
    half u_xlat16_50;
    half u_xlat16_53;
    half u_xlat16_54;
    u_xlati0.x = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0.xy = u_xlati0.xx << int2(0x1, 0x3);
    u_xlatb28 = UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.w>=100.0;
    u_xlat42 = u_xlatb28 ? 1.0 : float(0.0);
    u_xlat28 = (u_xlatb28) ? -106.283188 : -0.0;
    u_xlat28 = u_xlat28 + UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.w;
    u_xlatb1 = VGlobals._NeckWeightOffset>=0x20;
    if(u_xlatb1){
        u_xlat16_2.x = input.TEXCOORD2.x * half(0.25);
        u_xlati1 = int(float(u_xlat16_2.x));
        u_xlati15 = u_xlati1 << 0x2;
        u_xlat16_2.x = half(u_xlati15);
        u_xlat16_2.x = (-u_xlat16_2.x) + input.TEXCOORD2.x;
        u_xlati15 = int(float(u_xlat16_2.x));
        u_xlati1 = u_xlati1 + VGlobals._NeckWeightOffset;
        u_xlati1 = u_xlati1 + int(0xffffffe0u);
        u_xlat1.x = dot(VGlobals._NeckWeights[u_xlati1], ImmCB_0[u_xlati15]);
    } else {
        u_xlat1.x = 0.0;
    }
    u_xlat16_2.x = rint(input.TEXCOORD2.x);
    u_xlat16_1.y = half(uint(float(u_xlat16_2.x)));
    u_xlat29 = 0.5 + UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.x;
    u_xlat16_1.z = half(u_xlat29 + UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.x);
    u_xlatu43 = uint(u_xlat16_1.y) * 0x3u;
    u_xlat16_1.w = half(float(u_xlatu43));
    u_xlat3.x = float(u_xlat16_1.w) + UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.y;
    u_xlat3.x = u_xlat3.x + 0.5;
    u_xlat2.x = float(u_xlat16_1.z) * VGlobals._boneTexture_TexelSize.x;
    u_xlat2.y = u_xlat3.x * VGlobals._boneTexture_TexelSize.y;
    u_xlat4 = _boneTexture.sample(sampler_boneTexture, u_xlat2.xy, level(0.0));
    u_xlat2.z = fma(u_xlat3.x, VGlobals._boneTexture_TexelSize.y, VGlobals._boneTexture_TexelSize.y);
    u_xlat3 = _boneTexture.sample(sampler_boneTexture, u_xlat2.xz, level(0.0));
    u_xlat2.w = u_xlat2.z + VGlobals._boneTexture_TexelSize.y;
    u_xlat2 = _boneTexture.sample(sampler_boneTexture, u_xlat2.xw, level(0.0));
    u_xlat28 = u_xlat28 * u_xlat1.x;
    u_xlat16_1.x = half(sin(u_xlat28));
    u_xlat5.x = cos(u_xlat28);
    u_xlat16_6 = half4(float4(u_xlat16_1.xxxx) * u_xlat2);
    u_xlat16_6 = half4(fma(u_xlat4, u_xlat5.xxxx, float4(u_xlat16_6)));
    u_xlat16_2 = half4(u_xlat2 * u_xlat5.xxxx);
    u_xlat16_2 = half4(fma(u_xlat4, (-float4(u_xlat16_1.xxxx)), float4(u_xlat16_2)));
    u_xlat4.x = dot(input.POSITION0, float4(u_xlat16_6));
    u_xlat4.y = dot(input.POSITION0, u_xlat3);
    u_xlat4.z = dot(input.POSITION0, float4(u_xlat16_2));
    u_xlat7.x = dot(input.NORMAL0.xyz, u_xlat16_6.xyz);
    u_xlat7.y = dot(float3(input.NORMAL0.xyz), u_xlat3.xyz);
    u_xlat7.z = dot(input.NORMAL0.xyz, u_xlat16_2.xyz);
    u_xlat28 = dot(u_xlat7.xyz, u_xlat7.xyz);
    u_xlat28 = max(u_xlat28, 0.00100000005);
    u_xlat28 = rsqrt(u_xlat28);
    u_xlat19.xyz = float3(u_xlat28) * u_xlat7.xyz;
    u_xlat7.x = dot(input.TANGENT0.xyz, u_xlat16_6.xyz);
    u_xlat7.y = dot(float3(input.TANGENT0.xyz), u_xlat3.xyz);
    u_xlat7.z = dot(input.TANGENT0.xyz, u_xlat16_2.xyz);
    u_xlat28 = dot(u_xlat7.xyz, u_xlat7.xyz);
    u_xlat28 = max(u_xlat28, 0.00100000005);
    u_xlat28 = rsqrt(u_xlat28);
    u_xlat3.xyz = float3(u_xlat28) * u_xlat7.xyz;
    u_xlatb28 = uint(u_xlat16_1.y)<0x3e8u;
    u_xlat28 = u_xlatb28 ? 1.0 : float(0.0);
    u_xlat28 = u_xlat28 * u_xlat42;
    u_xlatb28 = float(0.0)!=u_xlat28;
    if(u_xlatb28){
        u_xlat42 = 0.5 + UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.z;
        u_xlat42 = u_xlat42 + UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.y;
        u_xlat15 = float(u_xlat16_1.w) + UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.w;
        u_xlat15 = u_xlat15 + 0.5;
        u_xlat2.x = u_xlat42 * VGlobals._boneTexture_TexelSize.x;
        u_xlat2.y = u_xlat15 * VGlobals._boneTexture_TexelSize.y;
        u_xlat6 = _boneTexture.sample(sampler_boneTexture, u_xlat2.xy, level(0.0));
        u_xlat2.z = fma(u_xlat15, VGlobals._boneTexture_TexelSize.y, VGlobals._boneTexture_TexelSize.y);
        u_xlat7 = _boneTexture.sample(sampler_boneTexture, u_xlat2.xz, level(0.0));
        u_xlat2.w = u_xlat2.z + VGlobals._boneTexture_TexelSize.y;
        u_xlat2 = _boneTexture.sample(sampler_boneTexture, u_xlat2.xw, level(0.0));
        u_xlat16_8 = half4(float4(u_xlat16_1.xxxx) * u_xlat2);
        u_xlat16_8 = half4(fma(u_xlat6, u_xlat5.xxxx, float4(u_xlat16_8)));
        u_xlat16_2 = half4(u_xlat5.xxxx * u_xlat2);
        u_xlat16_1 = half4(fma(u_xlat6, (-float4(u_xlat16_1.xxxx)), float4(u_xlat16_2)));
        u_xlat2.x = dot(input.POSITION0, float4(u_xlat16_8));
        u_xlat2.y = dot(input.POSITION0, u_xlat7);
        u_xlat2.z = dot(input.POSITION0, float4(u_xlat16_1));
        u_xlat9.x = dot(input.NORMAL0.xyz, u_xlat16_8.xyz);
        u_xlat9.y = dot(float3(input.NORMAL0.xyz), u_xlat7.xyz);
        u_xlat9.z = dot(input.NORMAL0.xyz, u_xlat16_1.xyz);
        u_xlat42 = dot(u_xlat9.xyz, u_xlat9.xyz);
        u_xlat42 = max(u_xlat42, 0.00100000005);
        u_xlat42 = rsqrt(u_xlat42);
        u_xlat10.x = dot(input.TANGENT0.xyz, u_xlat16_8.xyz);
        u_xlat10.y = dot(float3(input.TANGENT0.xyz), u_xlat7.xyz);
        u_xlat10.z = dot(input.TANGENT0.xyz, u_xlat16_1.xyz);
        u_xlat45 = dot(u_xlat10.xyz, u_xlat10.xyz);
        u_xlat45 = max(u_xlat45, 0.00100000005);
        u_xlat45 = rsqrt(u_xlat45);
        u_xlat7.xyz = fma(u_xlat9.xyz, float3(u_xlat42), (-u_xlat19.xyz));
        u_xlat7.xyz = fma(UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.zzz, u_xlat7.xyz, u_xlat19.xyz);
        u_xlat9.xyz = fma(u_xlat10.xyz, float3(u_xlat45), (-u_xlat3.xyz));
        u_xlat9.xyz = fma(UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.zzz, u_xlat9.xyz, u_xlat3.xyz);
        u_xlat4.w = input.POSITION0.w;
        u_xlat2.w = input.POSITION0.w;
        u_xlat1 = u_xlat2 + (-u_xlat4);
        u_xlat1 = fma(UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.zzzz, u_xlat1, u_xlat4);
        u_xlat16_1 = half4(u_xlat1);
        u_xlat16_9.xyz = half3(u_xlat9.xyz);
        u_xlat16_7.xyz = half3(u_xlat7.xyz);
    } else {
        u_xlat16_9.xyz = input.TANGENT0.xyz;
        u_xlat16_7.xyz = input.NORMAL0.xyz;
    }
    u_xlat4.w = input.POSITION0.w;
    u_xlat16_1 = (bool(u_xlatb28)) ? u_xlat16_1 : half4(u_xlat4);
    u_xlat16_8.xyz = (bool(u_xlatb28)) ? u_xlat16_9.xyz : half3(u_xlat3.xyz);
    u_xlat16_11.xyz = (bool(u_xlatb28)) ? u_xlat16_7.xyz : half3(u_xlat19.xyz);
    u_xlat2 = float4(u_xlat16_1.yyyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], float4(u_xlat16_1.xxxx), u_xlat2);
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], float4(u_xlat16_1.zzzz), u_xlat2);
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], float4(u_xlat16_1.wwww), u_xlat2);
    u_xlat0.xzw = float3(u_xlat16_11.yyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(u_xlat16_11.xxx), u_xlat0.xzw);
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(u_xlat16_11.zzz), u_xlat0.xzw);
    u_xlat3.x = dot(u_xlat0.xzw, u_xlat0.xzw);
    u_xlat3.x = max(u_xlat3.x, 0.00100000005);
    u_xlat3.x = rsqrt(u_xlat3.x);
    u_xlat3.xyz = u_xlat0.xzw * u_xlat3.xxx;
    u_xlat0.xzw = float3(u_xlat16_8.yyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(u_xlat16_8.xxx), u_xlat0.xzw);
    u_xlat0.xyz = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(u_xlat16_8.zzz), u_xlat0.xzw);
    u_xlat42 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat42 = max(u_xlat42, 0.00100000005);
    u_xlat42 = rsqrt(u_xlat42);
    u_xlat0.xyz = float3(u_xlat42) * u_xlat0.xyz;
    u_xlat42 = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat4.xyz = u_xlat0.yzx * u_xlat3.zxy;
    u_xlat4.xyz = fma(u_xlat3.yzx, u_xlat0.zxy, (-u_xlat4.xyz));
    u_xlat4.xyz = float3(u_xlat42) * u_xlat4.xyz;
    u_xlat42 = dot(u_xlat4.xyz, u_xlat4.xyz);
    u_xlat42 = max(u_xlat42, 0.00100000005);
    u_xlat42 = rsqrt(u_xlat42);
    u_xlat4.xyz = float3(u_xlat42) * u_xlat4.xyz;
    u_xlat5 = u_xlat2.yyyy * VGlobals.hlslcc_mtx4x4_NonJitteredViewProjMatrix[1];
    u_xlat5 = fma(VGlobals.hlslcc_mtx4x4_NonJitteredViewProjMatrix[0], u_xlat2.xxxx, u_xlat5);
    u_xlat5 = fma(VGlobals.hlslcc_mtx4x4_NonJitteredViewProjMatrix[2], u_xlat2.zzzz, u_xlat5);
    output.mtl_Position = fma(VGlobals.hlslcc_mtx4x4_NonJitteredViewProjMatrix[3], u_xlat2.wwww, u_xlat5);
    u_xlat2.w = 1.0;
    output.TEXCOORD14.x = dot(VGlobals.gShadowParams0[0], u_xlat2);
    output.TEXCOORD14.y = dot(VGlobals.gShadowParams0[1], u_xlat2);
    output.TEXCOORD14.z = dot(VGlobals.gShadowParams0[2], u_xlat2);
    output.TEXCOORD14.w = dot(VGlobals.gShadowParams0[3], u_xlat2);
    u_xlatb42 = VGlobals.gFogFuncEnabled>=half(0.5);
    if(u_xlatb42){
        u_xlat5.xyz = u_xlat2.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
        u_xlat42 = dot(u_xlat5.xyz, u_xlat5.xyz);
        u_xlat46 = max(u_xlat42, 0.00100000005);
        u_xlat46 = rsqrt(u_xlat46);
        u_xlat5.xzw = float3(u_xlat46) * u_xlat5.xyz;
        u_xlat42 = sqrt(u_xlat42);
        u_xlat16_8.x = half(u_xlat42 + (-float(VGlobals.gFogParams[1].z)));
        u_xlat16_8.y = half(u_xlat42 + (-float(VGlobals.gFogParams[5].y)));
        u_xlat16_8.xy = max(u_xlat16_8.xy, half2(0.0, 0.0));
        u_xlat16_36.x = VGlobals.gFogParams[0].w + VGlobals.gFogParams[1].x;
        u_xlat16_50 = half(float(VGlobals.gFogParams[1].z) / u_xlat42);
        u_xlat16_50 = clamp(u_xlat16_50, 0.0h, 1.0h);
        u_xlat46 = fma(u_xlat5.y, float(u_xlat16_50), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
        u_xlat46 = u_xlat46 + (-float(VGlobals.gFogParams[0].x));
        u_xlat46 = max(u_xlat46, -127.0);
        u_xlat46 = (-u_xlat46) * float(VGlobals.gFogParams[1].w);
        u_xlat46 = exp2(u_xlat46);
        u_xlat16_50 = (-u_xlat16_50) + half(1.0);
        u_xlat10.x = u_xlat5.y * float(u_xlat16_50);
        u_xlat10.x = u_xlat10.x * float(VGlobals.gFogParams[1].w);
        u_xlat10.x = max(u_xlat10.x, -64.0);
        u_xlat24 = exp2((-u_xlat10.x));
        u_xlat24 = (-u_xlat24) + 1.0;
        u_xlat24 = u_xlat24 / u_xlat10.x;
        u_xlatb10 = 0.00999999978<abs(u_xlat10.x);
        u_xlat10.x = (u_xlatb10) ? u_xlat24 : 0.693147004;
        u_xlat46 = u_xlat46 * u_xlat10.x;
        u_xlat16_8.x = half(u_xlat46 * (-float(u_xlat16_8.x)));
        u_xlat16_8.x = u_xlat16_36.x * u_xlat16_8.x;
        u_xlat16_8.x = u_xlat16_8.x * VGlobals.gFogParams[0].y;
        u_xlat16_8.x = exp2(u_xlat16_8.x);
        u_xlat16_8.x = max(u_xlat16_8.x, VGlobals.gFogParams[0].z);
        u_xlat16_50 = dot(float3(VGlobals.gLightBuffer[11].xyz), u_xlat5.xzw);
        u_xlat16_11.xyz = VGlobals.gFogParams[0].www * VGlobals.gFogParams[2].xyz;
        u_xlat16_53 = fma(u_xlat16_50, u_xlat16_50, half(1.0));
        u_xlat46 = float(u_xlat16_53) * 0.0596831031;
        u_xlat16_12.xyz = VGlobals.gFogParams[1].xxx * VGlobals.gFogParams[3].xyz;
        u_xlat16_54 = fma((-VGlobals.gFogParams[1].y), VGlobals.gFogParams[1].y, half(1.0));
        u_xlat5.x = float(u_xlat16_54) * 0.119366206;
        u_xlat16_13.xy = fma(VGlobals.gFogParams[1].yy, VGlobals.gFogParams[1].yy, half2(1.0, 2.0));
        u_xlat16_50 = dot(half2(u_xlat16_50), VGlobals.gFogParams[1].yy);
        u_xlat16_50 = (-u_xlat16_50) + u_xlat16_13.x;
        u_xlat16_50 = log2(abs(u_xlat16_50));
        u_xlat16_50 = u_xlat16_50 * half(-1.5);
        u_xlat16_50 = exp2(u_xlat16_50);
        u_xlat5.x = u_xlat5.x * float(u_xlat16_50);
        u_xlat5.x = float(u_xlat16_53) * u_xlat5.x;
        u_xlat5.x = u_xlat5.x / float(u_xlat16_13.y);
        u_xlat16_12.xyz = half3(u_xlat5.xxx * float3(u_xlat16_12.xyz));
        u_xlat16_13.xyz = VGlobals.gLightBuffer[12].xyz * VGlobals.gFogParams[2].www;
        u_xlat16_11.xyz = half3(fma(float3(u_xlat16_11.xyz), float3(u_xlat46), float3(u_xlat16_12.xyz)));
        u_xlat16_11.xyz = u_xlat16_11.xyz * u_xlat16_13.xyz;
        u_xlat16_11.xyz = u_xlat16_11.xyz / u_xlat16_36.xxx;
        u_xlat16_36.x = (-u_xlat16_8.x) + half(1.0);
        u_xlat16_11.xyz = u_xlat16_36.xxx * u_xlat16_11.xyz;
        u_xlat16_36.x = half(float(VGlobals.gFogParams[5].y) / u_xlat42);
        u_xlat16_36.x = clamp(u_xlat16_36.x, 0.0h, 1.0h);
        u_xlat42 = fma(u_xlat5.y, float(u_xlat16_36.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
        u_xlat42 = u_xlat42 + (-float(VGlobals.gFogParams[3].w));
        u_xlat42 = max(u_xlat42, -127.0);
        u_xlat42 = (-u_xlat42) * float(VGlobals.gFogParams[5].z);
        u_xlat42 = exp2(u_xlat42);
        u_xlat16_36.x = (-u_xlat16_36.x) + half(1.0);
        u_xlat46 = u_xlat5.y * float(u_xlat16_36.x);
        u_xlat46 = u_xlat46 * float(VGlobals.gFogParams[5].z);
        u_xlat46 = max(u_xlat46, -64.0);
        u_xlat5.x = exp2((-u_xlat46));
        u_xlat5.x = (-u_xlat5.x) + 1.0;
        u_xlat5.x = u_xlat5.x / u_xlat46;
        u_xlatb46 = 0.00999999978<abs(u_xlat46);
        u_xlat46 = (u_xlatb46) ? u_xlat5.x : 0.693147004;
        u_xlat42 = u_xlat42 * u_xlat46;
        u_xlat16_22 = half(u_xlat42 * (-float(u_xlat16_8.y)));
        u_xlat16_22 = u_xlat16_22 * VGlobals.gFogParams[4].w;
        u_xlat16_22 = exp2(u_xlat16_22);
        u_xlat16_22 = max(u_xlat16_22, VGlobals.gFogParams[5].x);
        u_xlat16_36.x = (-u_xlat16_22) + half(1.0);
        u_xlat16_11.xyz = half3(u_xlat16_22) * u_xlat16_11.xyz;
        u_xlat16_5.xyz = fma(VGlobals.gFogParams[4].xyz, u_xlat16_36.xxx, u_xlat16_11.xyz);
        u_xlat16_5.w = u_xlat16_8.x * u_xlat16_22;
        u_xlatb42 = half(0.5)<VGlobals.gFogParams[7].x;
        if(u_xlatb42){
            u_xlat16_36.xy = half2(fma(u_xlat2.xz, float2(VGlobals.gFogParams[8].xy), float2(VGlobals.gFogParams[8].zw)));
            u_xlat16_36.x = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_36.xy), level(0.0)).x;
            u_xlat16_36.x = log2(u_xlat16_36.x);
            u_xlat16_36.x = u_xlat16_36.x * VGlobals.gFogParams[7].y;
            u_xlat16_36.x = exp2(u_xlat16_36.x);
            u_xlat16_8.x = fma((-u_xlat16_22), u_xlat16_8.x, half(1.0));
            output.TEXCOORD7.w = fma(u_xlat16_36.x, u_xlat16_8.x, u_xlat16_5.w);
            output.TEXCOORD7.xyz = fma(u_xlat16_36.xxx, (-u_xlat16_5.xyz), u_xlat16_5.xyz);
        } else {
            output.TEXCOORD7 = u_xlat16_5;
        }
    } else {
        output.TEXCOORD7 = half4(0.0, 0.0, 0.0, 1.0);
    }
    u_xlat3.w = 1.0;
    u_xlat16_8.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat3));
    u_xlat16_8.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat3));
    u_xlat16_8.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat3));
    u_xlat16_5 = half4(u_xlat3.yzzx * u_xlat3.xyzz);
    u_xlat16_11.x = dot(VGlobals.gLightBuffer[3], u_xlat16_5);
    u_xlat16_11.y = dot(VGlobals.gLightBuffer[4], u_xlat16_5);
    u_xlat16_11.z = dot(VGlobals.gLightBuffer[5], u_xlat16_5);
    u_xlat16_50 = half(u_xlat3.y * u_xlat3.y);
    u_xlat16_50 = half(fma(u_xlat3.x, u_xlat3.x, (-float(u_xlat16_50))));
    u_xlat16_11.xyz = fma(VGlobals.gLightBuffer[6].xyz, half3(u_xlat16_50), u_xlat16_11.xyz);
    u_xlat16_8.xyz = u_xlat16_8.xyz + u_xlat16_11.xyz;
    u_xlat16_8.xyz = u_xlat16_8.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_8.xyz = max(u_xlat16_8.xyz, half3(0.0, 0.0, 0.0));
    output.TEXCOORD0.xyz = u_xlat2.xyz;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.xyz = u_xlat2.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    output.TEXCOORD3.xyz = half3(u_xlat0.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    output.TEXCOORD4.xyz = half3(u_xlat4.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat3.xyz);
    output.TEXCOORD8.xyz = float3(u_xlat16_8.xyz);
    output.TEXCOORD16.xyz = float3(u_xlat16_1.xyz);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
