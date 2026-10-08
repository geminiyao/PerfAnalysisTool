#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float3 _WorldSpaceCameraPos ;
    float4 unity_WorldTransformParams ;
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    half4 gLightBuffer [115];
    half4 gFogParams [9];
    half gFogFuncEnabled ;
    float4 gShadowParams0 [6];
    float4 _boneTexture_TexelSize ;
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
    half4 TEXCOORD21 [[ user(TEXCOORD21) ]];
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(1) ]],
    const constant unity_Builtins0Array_Type* UnityInstancing_PerDraw0 [[ buffer(2) ]],
    const constant AnimPropsArray_Type* UnityInstancing_AnimProps [[ buffer(3) ]],
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
    float4 u_xlat2;
    float4 u_xlat3;
    float4 u_xlat4;
    half4 u_xlat16_4;
    float4 u_xlat5;
    float4 u_xlat6;
    half3 u_xlat16_6;
    float4 u_xlat7;
    float3 u_xlat8;
    bool u_xlatb8;
    half3 u_xlat16_9;
    half3 u_xlat16_10;
    half3 u_xlat16_11;
    half3 u_xlat16_12;
    float u_xlat15;
    uint u_xlatu15;
    float u_xlat21;
    half u_xlat16_22;
    float2 u_xlat26;
    bool2 u_xlatb26;
    float u_xlat28;
    half2 u_xlat16_35;
    float u_xlat39;
    uint u_xlatu39;
    bool u_xlatb39;
    float u_xlat42;
    bool u_xlatb42;
    half u_xlat16_48;
    half u_xlat16_49;
    half u_xlat16_50;
    u_xlati0.x = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0.xy = u_xlati0.xx << int2(0x1, 0x3);
    u_xlatb26.x = UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.w>=100.0;
    u_xlat16_1.x = rint(input.TEXCOORD2.x);
    u_xlatu39 = uint(float(u_xlat16_1.x));
    u_xlat2.x = 0.5 + UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.x;
    u_xlat2.x = u_xlat2.x + UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.x;
    u_xlatu15 = u_xlatu39 * 0x3u;
    u_xlat15 = float(u_xlatu15);
    u_xlat28 = u_xlat15 + UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.y;
    u_xlat2.z = u_xlat28 + 0.5;
    u_xlat1.xy = u_xlat2.xz * VGlobals._boneTexture_TexelSize.xy;
    u_xlat3 = _boneTexture.sample(sampler_boneTexture, u_xlat1.xy, level(0.0));
    u_xlat1.z = fma(u_xlat2.z, VGlobals._boneTexture_TexelSize.y, VGlobals._boneTexture_TexelSize.y);
    u_xlat4 = _boneTexture.sample(sampler_boneTexture, u_xlat1.xz, level(0.0));
    u_xlat1.w = u_xlat1.z + VGlobals._boneTexture_TexelSize.y;
    u_xlat16_1 = half4(_boneTexture.sample(sampler_boneTexture, u_xlat1.xw, level(0.0)));
    u_xlat5.x = dot(input.POSITION0, u_xlat3);
    u_xlat5.y = dot(input.POSITION0, u_xlat4);
    u_xlat5.z = dot(input.POSITION0, float4(u_xlat16_1));
    u_xlat6.x = dot(float3(input.NORMAL0.xyz), u_xlat3.xyz);
    u_xlat6.y = dot(float3(input.NORMAL0.xyz), u_xlat4.xyz);
    u_xlat6.z = dot(input.NORMAL0.xyz, u_xlat16_1.xyz);
    u_xlat2.x = dot(u_xlat6.xyz, u_xlat6.xyz);
    u_xlat2.x = max(u_xlat2.x, 0.00100000005);
    u_xlat2.x = rsqrt(u_xlat2.x);
    u_xlat2.xzw = u_xlat2.xxx * u_xlat6.xyz;
    u_xlat3.x = dot(float3(input.TANGENT0.xyz), u_xlat3.xyz);
    u_xlat3.y = dot(float3(input.TANGENT0.xyz), u_xlat4.xyz);
    u_xlat3.z = dot(input.TANGENT0.xyz, u_xlat16_1.xyz);
    u_xlat42 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat42 = max(u_xlat42, 0.00100000005);
    u_xlat42 = rsqrt(u_xlat42);
    u_xlat3.xyz = float3(u_xlat42) * u_xlat3.xyz;
    u_xlatb26.y = u_xlatu39<0x3e8u;
    u_xlat26.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb26.xy));
    u_xlat26.x = u_xlat26.y * u_xlat26.x;
    u_xlatb26.x = float(0.0)!=u_xlat26.x;
    if(u_xlatb26.x){
        u_xlat39 = 0.5 + UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.z;
        u_xlat39 = u_xlat39 + UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.y;
        u_xlat15 = u_xlat15 + UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.w;
        u_xlat15 = u_xlat15 + 0.5;
        u_xlat1.x = u_xlat39 * VGlobals._boneTexture_TexelSize.x;
        u_xlat1.y = u_xlat15 * VGlobals._boneTexture_TexelSize.y;
        u_xlat4 = _boneTexture.sample(sampler_boneTexture, u_xlat1.xy, level(0.0));
        u_xlat1.z = fma(u_xlat15, VGlobals._boneTexture_TexelSize.y, VGlobals._boneTexture_TexelSize.y);
        u_xlat6 = _boneTexture.sample(sampler_boneTexture, u_xlat1.xz, level(0.0));
        u_xlat1.w = u_xlat1.z + VGlobals._boneTexture_TexelSize.y;
        u_xlat1 = _boneTexture.sample(sampler_boneTexture, u_xlat1.xw, level(0.0));
        u_xlat7.x = dot(input.POSITION0, u_xlat4);
        u_xlat7.y = dot(input.POSITION0, u_xlat6);
        u_xlat7.z = dot(input.POSITION0, u_xlat1);
        u_xlat8.x = dot(float3(input.NORMAL0.xyz), u_xlat4.xyz);
        u_xlat8.y = dot(float3(input.NORMAL0.xyz), u_xlat6.xyz);
        u_xlat8.z = dot(float3(input.NORMAL0.xyz), u_xlat1.xyz);
        u_xlat39 = dot(u_xlat8.xyz, u_xlat8.xyz);
        u_xlat39 = max(u_xlat39, 0.00100000005);
        u_xlat39 = rsqrt(u_xlat39);
        u_xlat4.x = dot(float3(input.TANGENT0.xyz), u_xlat4.xyz);
        u_xlat4.y = dot(float3(input.TANGENT0.xyz), u_xlat6.xyz);
        u_xlat4.z = dot(float3(input.TANGENT0.xyz), u_xlat1.xyz);
        u_xlat15 = dot(u_xlat4.xyz, u_xlat4.xyz);
        u_xlat15 = max(u_xlat15, 0.00100000005);
        u_xlat15 = rsqrt(u_xlat15);
        u_xlat6.xyz = fma(u_xlat8.xyz, float3(u_xlat39), (-u_xlat2.xzw));
        u_xlat6.xyz = fma(UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.zzz, u_xlat6.xyz, u_xlat2.xzw);
        u_xlat4.xyz = fma(u_xlat4.xyz, float3(u_xlat15), (-u_xlat3.xyz));
        u_xlat4.xyz = fma(UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.zzz, u_xlat4.xyz, u_xlat3.xyz);
        u_xlat5.w = input.POSITION0.w;
        u_xlat7.w = input.POSITION0.w;
        u_xlat1 = (-u_xlat5) + u_xlat7;
        u_xlat1 = fma(UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.zzzz, u_xlat1, u_xlat5);
        u_xlat16_1 = half4(u_xlat1);
        u_xlat16_4.xyz = half3(u_xlat4.xyz);
        u_xlat16_6.xyz = half3(u_xlat6.xyz);
    } else {
        u_xlat16_4.xyz = input.TANGENT0.xyz;
        u_xlat16_6.xyz = input.NORMAL0.xyz;
    }
    u_xlat5.w = input.POSITION0.w;
    u_xlat16_1 = (u_xlatb26.x) ? u_xlat16_1 : half4(u_xlat5);
    u_xlat16_9.xyz = (u_xlatb26.x) ? u_xlat16_4.xyz : half3(u_xlat3.xyz);
    u_xlat16_10.xyz = (u_xlatb26.x) ? u_xlat16_6.xyz : half3(u_xlat2.xzw);
    u_xlat2 = float4(u_xlat16_1.yyyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], float4(u_xlat16_1.xxxx), u_xlat2);
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], float4(u_xlat16_1.zzzz), u_xlat2);
    u_xlat1 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], float4(u_xlat16_1.wwww), u_xlat2);
    u_xlat0.xzw = float3(u_xlat16_10.yyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(u_xlat16_10.xxx), u_xlat0.xzw);
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(u_xlat16_10.zzz), u_xlat0.xzw);
    u_xlat2.x = dot(u_xlat0.xzw, u_xlat0.xzw);
    u_xlat2.x = max(u_xlat2.x, 0.00100000005);
    u_xlat2.x = rsqrt(u_xlat2.x);
    u_xlat2.xyz = u_xlat0.xzw * u_xlat2.xxx;
    u_xlat0.xzw = float3(u_xlat16_9.yyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(u_xlat16_9.xxx), u_xlat0.xzw);
    u_xlat0.xyz = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(u_xlat16_9.zzz), u_xlat0.xzw);
    u_xlat39 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat39 = max(u_xlat39, 0.00100000005);
    u_xlat39 = rsqrt(u_xlat39);
    u_xlat0.xyz = float3(u_xlat39) * u_xlat0.xyz;
    u_xlat39 = float(input.TANGENT0.w) * VGlobals.unity_WorldTransformParams.w;
    u_xlat3.xyz = u_xlat0.yzx * u_xlat2.zxy;
    u_xlat3.xyz = fma(u_xlat2.yzx, u_xlat0.zxy, (-u_xlat3.xyz));
    u_xlat3.xyz = float3(u_xlat39) * u_xlat3.xyz;
    u_xlat39 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat39 = max(u_xlat39, 0.00100000005);
    u_xlat39 = rsqrt(u_xlat39);
    u_xlat3.xyz = float3(u_xlat39) * u_xlat3.xyz;
    u_xlat4 = u_xlat1.yyyy * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat4 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat1.xxxx, u_xlat4);
    u_xlat4 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat1.zzzz, u_xlat4);
    output.mtl_Position = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat1.wwww, u_xlat4);
    u_xlat1.w = 1.0;
    output.TEXCOORD14.x = dot(VGlobals.gShadowParams0[0], u_xlat1);
    output.TEXCOORD14.y = dot(VGlobals.gShadowParams0[1], u_xlat1);
    output.TEXCOORD14.z = dot(VGlobals.gShadowParams0[2], u_xlat1);
    output.TEXCOORD14.w = dot(VGlobals.gShadowParams0[3], u_xlat1);
    u_xlatb39 = VGlobals.gFogFuncEnabled>=half(0.5);
    if(u_xlatb39){
        u_xlat7.xyz = u_xlat1.xyz + (-VGlobals._WorldSpaceCameraPos.xyzx.xyz);
        u_xlat39 = dot(u_xlat7.xyz, u_xlat7.xyz);
        u_xlat42 = max(u_xlat39, 0.00100000005);
        u_xlat42 = rsqrt(u_xlat42);
        u_xlat7.xzw = float3(u_xlat42) * u_xlat7.xyz;
        u_xlat39 = sqrt(u_xlat39);
        u_xlat16_9.x = half(u_xlat39 + (-float(VGlobals.gFogParams[1].z)));
        u_xlat16_9.y = half(u_xlat39 + (-float(VGlobals.gFogParams[5].y)));
        u_xlat16_9.xy = max(u_xlat16_9.xy, half2(0.0, 0.0));
        u_xlat16_35.x = VGlobals.gFogParams[0].w + VGlobals.gFogParams[1].x;
        u_xlat16_48 = half(float(VGlobals.gFogParams[1].z) / u_xlat39);
        u_xlat16_48 = clamp(u_xlat16_48, 0.0h, 1.0h);
        u_xlat42 = fma(u_xlat7.y, float(u_xlat16_48), VGlobals._WorldSpaceCameraPos.xyzx.y);
        u_xlat42 = u_xlat42 + (-float(VGlobals.gFogParams[0].x));
        u_xlat42 = max(u_xlat42, -127.0);
        u_xlat42 = (-u_xlat42) * float(VGlobals.gFogParams[1].w);
        u_xlat42 = exp2(u_xlat42);
        u_xlat16_48 = (-u_xlat16_48) + half(1.0);
        u_xlat8.x = u_xlat7.y * float(u_xlat16_48);
        u_xlat8.x = u_xlat8.x * float(VGlobals.gFogParams[1].w);
        u_xlat8.x = max(u_xlat8.x, -64.0);
        u_xlat21 = exp2((-u_xlat8.x));
        u_xlat21 = (-u_xlat21) + 1.0;
        u_xlat21 = u_xlat21 / u_xlat8.x;
        u_xlatb8 = 0.00999999978<abs(u_xlat8.x);
        u_xlat8.x = (u_xlatb8) ? u_xlat21 : 0.693147004;
        u_xlat42 = u_xlat42 * u_xlat8.x;
        u_xlat16_9.x = half(u_xlat42 * (-float(u_xlat16_9.x)));
        u_xlat16_9.x = u_xlat16_35.x * u_xlat16_9.x;
        u_xlat16_9.x = u_xlat16_9.x * VGlobals.gFogParams[0].y;
        u_xlat16_9.x = exp2(u_xlat16_9.x);
        u_xlat16_9.x = max(u_xlat16_9.x, VGlobals.gFogParams[0].z);
        u_xlat16_48 = dot(float3(VGlobals.gLightBuffer[11].xyz), u_xlat7.xzw);
        u_xlat16_10.xyz = VGlobals.gFogParams[0].www * VGlobals.gFogParams[2].xyz;
        u_xlat16_49 = fma(u_xlat16_48, u_xlat16_48, half(1.0));
        u_xlat42 = float(u_xlat16_49) * 0.0596831031;
        u_xlat16_11.xyz = VGlobals.gFogParams[1].xxx * VGlobals.gFogParams[3].xyz;
        u_xlat16_50 = fma((-VGlobals.gFogParams[1].y), VGlobals.gFogParams[1].y, half(1.0));
        u_xlat7.x = float(u_xlat16_50) * 0.119366206;
        u_xlat16_12.xy = fma(VGlobals.gFogParams[1].yy, VGlobals.gFogParams[1].yy, half2(1.0, 2.0));
        u_xlat16_48 = dot(half2(u_xlat16_48), VGlobals.gFogParams[1].yy);
        u_xlat16_48 = (-u_xlat16_48) + u_xlat16_12.x;
        u_xlat16_48 = log2(abs(u_xlat16_48));
        u_xlat16_48 = u_xlat16_48 * half(-1.5);
        u_xlat16_48 = exp2(u_xlat16_48);
        u_xlat7.x = u_xlat7.x * float(u_xlat16_48);
        u_xlat7.x = float(u_xlat16_49) * u_xlat7.x;
        u_xlat7.x = u_xlat7.x / float(u_xlat16_12.y);
        u_xlat16_11.xyz = half3(u_xlat7.xxx * float3(u_xlat16_11.xyz));
        u_xlat16_12.xyz = VGlobals.gLightBuffer[12].xyz * VGlobals.gFogParams[2].www;
        u_xlat16_10.xyz = half3(fma(float3(u_xlat16_10.xyz), float3(u_xlat42), float3(u_xlat16_11.xyz)));
        u_xlat16_10.xyz = u_xlat16_10.xyz * u_xlat16_12.xyz;
        u_xlat16_10.xyz = u_xlat16_10.xyz / u_xlat16_35.xxx;
        u_xlat16_35.x = (-u_xlat16_9.x) + half(1.0);
        u_xlat16_10.xyz = u_xlat16_35.xxx * u_xlat16_10.xyz;
        u_xlat16_35.x = half(float(VGlobals.gFogParams[5].y) / u_xlat39);
        u_xlat16_35.x = clamp(u_xlat16_35.x, 0.0h, 1.0h);
        u_xlat39 = fma(u_xlat7.y, float(u_xlat16_35.x), VGlobals._WorldSpaceCameraPos.xyzx.y);
        u_xlat39 = u_xlat39 + (-float(VGlobals.gFogParams[3].w));
        u_xlat39 = max(u_xlat39, -127.0);
        u_xlat39 = (-u_xlat39) * float(VGlobals.gFogParams[5].z);
        u_xlat39 = exp2(u_xlat39);
        u_xlat16_35.x = (-u_xlat16_35.x) + half(1.0);
        u_xlat42 = u_xlat7.y * float(u_xlat16_35.x);
        u_xlat42 = u_xlat42 * float(VGlobals.gFogParams[5].z);
        u_xlat42 = max(u_xlat42, -64.0);
        u_xlat7.x = exp2((-u_xlat42));
        u_xlat7.x = (-u_xlat7.x) + 1.0;
        u_xlat7.x = u_xlat7.x / u_xlat42;
        u_xlatb42 = 0.00999999978<abs(u_xlat42);
        u_xlat42 = (u_xlatb42) ? u_xlat7.x : 0.693147004;
        u_xlat39 = u_xlat39 * u_xlat42;
        u_xlat16_22 = half(u_xlat39 * (-float(u_xlat16_9.y)));
        u_xlat16_22 = u_xlat16_22 * VGlobals.gFogParams[4].w;
        u_xlat16_22 = exp2(u_xlat16_22);
        u_xlat16_22 = max(u_xlat16_22, VGlobals.gFogParams[5].x);
        u_xlat16_35.x = (-u_xlat16_22) + half(1.0);
        u_xlat16_10.xyz = half3(u_xlat16_22) * u_xlat16_10.xyz;
        u_xlat16_4.xyz = fma(VGlobals.gFogParams[4].xyz, u_xlat16_35.xxx, u_xlat16_10.xyz);
        u_xlat16_4.w = u_xlat16_9.x * u_xlat16_22;
        u_xlatb39 = half(0.5)<VGlobals.gFogParams[7].x;
        if(u_xlatb39){
            u_xlat16_35.xy = half2(fma(u_xlat1.xz, float2(VGlobals.gFogParams[8].xy), float2(VGlobals.gFogParams[8].zw)));
            u_xlat16_35.x = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_35.xy), level(0.0)).x;
            u_xlat16_35.x = log2(u_xlat16_35.x);
            u_xlat16_35.x = u_xlat16_35.x * VGlobals.gFogParams[7].y;
            u_xlat16_35.x = exp2(u_xlat16_35.x);
            u_xlat16_9.x = fma((-u_xlat16_22), u_xlat16_9.x, half(1.0));
            output.TEXCOORD7.w = fma(u_xlat16_35.x, u_xlat16_9.x, u_xlat16_4.w);
            output.TEXCOORD7.xyz = fma(u_xlat16_35.xxx, (-u_xlat16_4.xyz), u_xlat16_4.xyz);
        } else {
            output.TEXCOORD7 = u_xlat16_4;
        }
    } else {
        output.TEXCOORD7 = half4(0.0, 0.0, 0.0, 1.0);
    }
    u_xlat2.w = 1.0;
    u_xlat16_9.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat2));
    u_xlat16_9.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat2));
    u_xlat16_9.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat2));
    u_xlat16_4 = half4(u_xlat2.yzzx * u_xlat2.xyzz);
    u_xlat16_10.x = dot(VGlobals.gLightBuffer[3], u_xlat16_4);
    u_xlat16_10.y = dot(VGlobals.gLightBuffer[4], u_xlat16_4);
    u_xlat16_10.z = dot(VGlobals.gLightBuffer[5], u_xlat16_4);
    u_xlat16_48 = half(u_xlat2.y * u_xlat2.y);
    u_xlat16_48 = half(fma(u_xlat2.x, u_xlat2.x, (-float(u_xlat16_48))));
    u_xlat16_10.xyz = fma(VGlobals.gLightBuffer[6].xyz, half3(u_xlat16_48), u_xlat16_10.xyz);
    u_xlat16_9.xyz = u_xlat16_9.xyz + u_xlat16_10.xyz;
    u_xlat16_9.xyz = u_xlat16_9.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_9.xyz = max(u_xlat16_9.xyz, half3(0.0, 0.0, 0.0));
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
    output.TEXCOORD8.xyz = float3(u_xlat16_9.xyz);
    output.TEXCOORD21 = half4(0.0, 0.0, 0.0, 0.0);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
