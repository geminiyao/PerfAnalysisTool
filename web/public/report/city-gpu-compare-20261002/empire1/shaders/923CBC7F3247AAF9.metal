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
    half4 _vertexAnimTexture0_TexelSize ;
    half4 _vertexAnimTexture1_TexelSize ;
    half4 _vertexAnimTexture2_TexelSize ;
    half4 _vertexAnimTexture3_TexelSize ;
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
    half4 TANGENT0 [[ attribute(0) ]] ;
    half3 NORMAL0 [[ attribute(1) ]] ;
    half4 TEXCOORD0 [[ attribute(2) ]] ;
    half4 TEXCOORD1 [[ attribute(3) ]] ;
    half4 COLOR0 [[ attribute(4) ]] ;
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
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(2) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(3) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(4) ]],
    const constant unity_Builtins0Array_Type* UnityInstancing_PerDraw0 [[ buffer(5) ]],
    const constant AnimPropsArray_Type* UnityInstancing_AnimProps [[ buffer(6) ]],
    sampler sampler_vertexAnimTexture0 [[ sampler (0) ]],
    sampler sampler_vertexAnimTexture1 [[ sampler (1) ]],
    sampler sampler_vertexAnimTexture2 [[ sampler (2) ]],
    sampler sampler_vertexAnimTexture3 [[ sampler (3) ]],
    texture2d<float, access::sample > _vertexAnimTexture0 [[ texture(0) ]] ,
    texture2d<float, access::sample > _vertexAnimTexture1 [[ texture(1) ]] ,
    texture2d<float, access::sample > _vertexAnimTexture2 [[ texture(2) ]] ,
    texture2d<float, access::sample > _vertexAnimTexture3 [[ texture(3) ]] ,
    texture2d<half, access::sample > BnSFog_FogMaskTex [[ texture(4) ]] ,
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
    half4 u_xlat16_2;
    float3 u_xlat3;
    float4 u_xlat4;
    half4 u_xlat16_4;
    half3 u_xlat16_5;
    float u_xlat6;
    bool u_xlatb6;
    half3 u_xlat16_7;
    half3 u_xlat16_8;
    half3 u_xlat16_9;
    half u_xlat16_15;
    float u_xlat16;
    float2 u_xlat20;
    half2 u_xlat16_25;
    float u_xlat30;
    bool u_xlatb30;
    float u_xlat31;
    uint u_xlatu31;
    float u_xlat33;
    bool u_xlatb33;
    half u_xlat16_35;
    half u_xlat16_37;
    half u_xlat16_38;
    u_xlati0.x = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0.xy = u_xlati0.xx << int2(0x1, 0x3);
    u_xlat16_1.xyz = half3(uint3((input.COLOR0.yyy<half3(0.5, 1.5, 2.5))) * 0xFFFFFFFFu);
    u_xlat20.xy = (int(u_xlat16_1.z) != 0) ? float2(VGlobals._vertexAnimTexture2_TexelSize.zw) : float2(VGlobals._vertexAnimTexture3_TexelSize.zw);
    u_xlat20.xy = (int(u_xlat16_1.y) != 0) ? float2(VGlobals._vertexAnimTexture1_TexelSize.zw) : u_xlat20.xy;
    u_xlat20.xy = (int(u_xlat16_1.x) != 0) ? float2(VGlobals._vertexAnimTexture0_TexelSize.zw) : u_xlat20.xy;
    u_xlat20.xy = float2(1.0, 1.0) / u_xlat20.xy;
    u_xlat16_2.x = rint(input.COLOR0.x);
    u_xlatu31 = uint(float(u_xlat16_2.x));
    u_xlat3.x = 0.5 + UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.x;
    u_xlat3.x = u_xlat3.x + UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.x;
    u_xlat3.y = u_xlat20.x * u_xlat3.x;
    u_xlat31 = float(u_xlatu31);
    u_xlat16_1.w = half(u_xlat31 + 0.5);
    u_xlat3.z = u_xlat20.y * float(u_xlat16_1.w);
    if((uint(u_xlat16_1.x))!=uint(0)){
        u_xlat4.xyz = _vertexAnimTexture0.sample(sampler_vertexAnimTexture0, u_xlat3.yz, level(0.0)).xyz;
        u_xlat16_2.xyz = half3(u_xlat4.xyz);
    } else {
        if((uint(u_xlat16_1.y))!=uint(0)){
            u_xlat4.xyz = _vertexAnimTexture1.sample(sampler_vertexAnimTexture1, u_xlat3.yz, level(0.0)).xyz;
            u_xlat16_2.xyz = half3(u_xlat4.xyz);
        } else {
            if((uint(u_xlat16_1.z))!=uint(0)){
                u_xlat4.xyz = _vertexAnimTexture2.sample(sampler_vertexAnimTexture2, u_xlat3.yz, level(0.0)).xyz;
                u_xlat16_2.xyz = half3(u_xlat4.xyz);
            } else {
                u_xlat4.xyz = _vertexAnimTexture3.sample(sampler_vertexAnimTexture3, u_xlat3.yz, level(0.0)).xyz;
                u_xlat16_2.xyz = half3(u_xlat4.xyz);
            }
        }
    }
    u_xlatb30 = UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.w>=100.0;
    if(u_xlatb30){
        u_xlat31 = 0.5 + UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.z;
        u_xlat31 = u_xlat31 + UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.y;
        u_xlat3.x = u_xlat20.x * u_xlat31;
        if((uint(u_xlat16_1.x))!=uint(0)){
            u_xlat4.xyz = _vertexAnimTexture0.sample(sampler_vertexAnimTexture0, u_xlat3.xz, level(0.0)).xyz;
            u_xlat16_5.xyz = half3(u_xlat4.xyz);
        } else {
            if((uint(u_xlat16_1.y))!=uint(0)){
                u_xlat1.xyw = _vertexAnimTexture1.sample(sampler_vertexAnimTexture1, u_xlat3.xz, level(0.0)).xyz;
                u_xlat16_5.xyz = half3(u_xlat1.xyw);
            } else {
                if((uint(u_xlat16_1.z))!=uint(0)){
                    u_xlat1.xyz = _vertexAnimTexture2.sample(sampler_vertexAnimTexture2, u_xlat3.xz, level(0.0)).xyz;
                    u_xlat16_5.xyz = half3(u_xlat1.xyz);
                } else {
                    u_xlat1.xyz = _vertexAnimTexture3.sample(sampler_vertexAnimTexture3, u_xlat3.xz, level(0.0)).xyz;
                    u_xlat16_5.xyz = half3(u_xlat1.xyz);
                }
            }
        }
        u_xlat16_2.w = half(1.0);
        u_xlat1.xyz = (-float3(u_xlat16_2.xyz)) + float3(u_xlat16_5.xyz);
        u_xlat1.w = 0.0;
        u_xlat1 = fma(UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.zzzz, u_xlat1, float4(u_xlat16_2));
        u_xlat16_1 = half4(u_xlat1);
    }
    u_xlat16_2.w = half(1.0);
    u_xlat16_1 = (bool(u_xlatb30)) ? u_xlat16_1 : u_xlat16_2;
    u_xlat2 = float4(u_xlat16_1.yyyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], float4(u_xlat16_1.xxxx), u_xlat2);
    u_xlat2 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], float4(u_xlat16_1.zzzz), u_xlat2);
    u_xlat1 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], float4(u_xlat16_1.wwww), u_xlat2);
    u_xlat0.xzw = float3(input.NORMAL0.yyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.NORMAL0.xxx), u_xlat0.xzw);
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.NORMAL0.zzz), u_xlat0.xzw);
    u_xlat3.x = dot(u_xlat0.xzw, u_xlat0.xzw);
    u_xlat3.x = max(u_xlat3.x, 0.00100000005);
    u_xlat3.x = rsqrt(u_xlat3.x);
    u_xlat2.xyz = u_xlat0.xzw * u_xlat3.xxx;
    u_xlat0.xzw = float3(input.TANGENT0.yyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.TANGENT0.xxx), u_xlat0.xzw);
    u_xlat0.xyz = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.TANGENT0.zzz), u_xlat0.xzw);
    u_xlat30 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat30 = max(u_xlat30, 0.00100000005);
    u_xlat30 = rsqrt(u_xlat30);
    u_xlat0.xyz = float3(u_xlat30) * u_xlat0.xyz;
    u_xlat30 = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat3.xyz = u_xlat0.yzx * u_xlat2.zxy;
    u_xlat3.xyz = fma(u_xlat2.yzx, u_xlat0.zxy, (-u_xlat3.xyz));
    u_xlat3.xyz = float3(u_xlat30) * u_xlat3.xyz;
    u_xlat30 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat30 = max(u_xlat30, 0.00100000005);
    u_xlat30 = rsqrt(u_xlat30);
    u_xlat3.xyz = float3(u_xlat30) * u_xlat3.xyz;
    u_xlat4 = u_xlat1.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat4 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat1.xxxx, u_xlat4);
    u_xlat4 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat1.zzzz, u_xlat4);
    output.mtl_Position = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat1.wwww, u_xlat4);
    u_xlat1.w = 1.0;
    output.TEXCOORD14.x = dot(VGlobals.gShadowParams0[0], u_xlat1);
    output.TEXCOORD14.y = dot(VGlobals.gShadowParams0[1], u_xlat1);
    output.TEXCOORD14.z = dot(VGlobals.gShadowParams0[2], u_xlat1);
    output.TEXCOORD14.w = dot(VGlobals.gShadowParams0[3], u_xlat1);
    u_xlatb30 = VGlobals.gFogFuncEnabled>=half(0.5);
    if(u_xlatb30){
        u_xlat4.xyz = u_xlat1.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
        u_xlat30 = dot(u_xlat4.xyz, u_xlat4.xyz);
        u_xlat33 = max(u_xlat30, 0.00100000005);
        u_xlat33 = rsqrt(u_xlat33);
        u_xlat4.xzw = float3(u_xlat33) * u_xlat4.xyz;
        u_xlat30 = sqrt(u_xlat30);
        u_xlat16_5.x = half(u_xlat30 + (-float(VGlobals.gFogParams[1].z)));
        u_xlat16_5.y = half(u_xlat30 + (-float(VGlobals.gFogParams[5].y)));
        u_xlat16_5.xy = max(u_xlat16_5.xy, half2(0.0, 0.0));
        u_xlat16_25.x = VGlobals.gFogParams[0].w + VGlobals.gFogParams[1].x;
        u_xlat16_35 = half(float(VGlobals.gFogParams[1].z) / u_xlat30);
        u_xlat16_35 = clamp(u_xlat16_35, 0.0h, 1.0h);
        u_xlat33 = fma(u_xlat4.y, float(u_xlat16_35), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
        u_xlat33 = u_xlat33 + (-float(VGlobals.gFogParams[0].x));
        u_xlat33 = max(u_xlat33, -127.0);
        u_xlat33 = (-u_xlat33) * float(VGlobals.gFogParams[1].w);
        u_xlat33 = exp2(u_xlat33);
        u_xlat16_35 = (-u_xlat16_35) + half(1.0);
        u_xlat6 = u_xlat4.y * float(u_xlat16_35);
        u_xlat6 = u_xlat6 * float(VGlobals.gFogParams[1].w);
        u_xlat6 = max(u_xlat6, -64.0);
        u_xlat16 = exp2((-u_xlat6));
        u_xlat16 = (-u_xlat16) + 1.0;
        u_xlat16 = u_xlat16 / u_xlat6;
        u_xlatb6 = 0.00999999978<abs(u_xlat6);
        u_xlat6 = (u_xlatb6) ? u_xlat16 : 0.693147004;
        u_xlat33 = u_xlat33 * u_xlat6;
        u_xlat16_5.x = half(u_xlat33 * (-float(u_xlat16_5.x)));
        u_xlat16_5.x = u_xlat16_25.x * u_xlat16_5.x;
        u_xlat16_5.x = u_xlat16_5.x * VGlobals.gFogParams[0].y;
        u_xlat16_5.x = exp2(u_xlat16_5.x);
        u_xlat16_5.x = max(u_xlat16_5.x, VGlobals.gFogParams[0].z);
        u_xlat16_35 = dot(float3(VGlobals.gLightBuffer[11].xyz), u_xlat4.xzw);
        u_xlat16_7.xyz = VGlobals.gFogParams[0].www * VGlobals.gFogParams[2].xyz;
        u_xlat16_37 = fma(u_xlat16_35, u_xlat16_35, half(1.0));
        u_xlat33 = float(u_xlat16_37) * 0.0596831031;
        u_xlat16_8.xyz = VGlobals.gFogParams[1].xxx * VGlobals.gFogParams[3].xyz;
        u_xlat16_38 = fma((-VGlobals.gFogParams[1].y), VGlobals.gFogParams[1].y, half(1.0));
        u_xlat4.x = float(u_xlat16_38) * 0.119366206;
        u_xlat16_9.xy = fma(VGlobals.gFogParams[1].yy, VGlobals.gFogParams[1].yy, half2(1.0, 2.0));
        u_xlat16_35 = dot(half2(u_xlat16_35), VGlobals.gFogParams[1].yy);
        u_xlat16_35 = (-u_xlat16_35) + u_xlat16_9.x;
        u_xlat16_35 = log2(abs(u_xlat16_35));
        u_xlat16_35 = u_xlat16_35 * half(-1.5);
        u_xlat16_35 = exp2(u_xlat16_35);
        u_xlat4.x = u_xlat4.x * float(u_xlat16_35);
        u_xlat4.x = float(u_xlat16_37) * u_xlat4.x;
        u_xlat4.x = u_xlat4.x / float(u_xlat16_9.y);
        u_xlat16_8.xyz = half3(u_xlat4.xxx * float3(u_xlat16_8.xyz));
        u_xlat16_9.xyz = VGlobals.gLightBuffer[12].xyz * VGlobals.gFogParams[2].www;
        u_xlat16_7.xyz = half3(fma(float3(u_xlat16_7.xyz), float3(u_xlat33), float3(u_xlat16_8.xyz)));
        u_xlat16_7.xyz = u_xlat16_7.xyz * u_xlat16_9.xyz;
        u_xlat16_7.xyz = u_xlat16_7.xyz / u_xlat16_25.xxx;
        u_xlat16_25.x = (-u_xlat16_5.x) + half(1.0);
        u_xlat16_7.xyz = u_xlat16_25.xxx * u_xlat16_7.xyz;
        u_xlat16_25.x = half(float(VGlobals.gFogParams[5].y) / u_xlat30);
        u_xlat16_25.x = clamp(u_xlat16_25.x, 0.0h, 1.0h);
        u_xlat30 = fma(u_xlat4.y, float(u_xlat16_25.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
        u_xlat30 = u_xlat30 + (-float(VGlobals.gFogParams[3].w));
        u_xlat30 = max(u_xlat30, -127.0);
        u_xlat30 = (-u_xlat30) * float(VGlobals.gFogParams[5].z);
        u_xlat30 = exp2(u_xlat30);
        u_xlat16_25.x = (-u_xlat16_25.x) + half(1.0);
        u_xlat33 = u_xlat4.y * float(u_xlat16_25.x);
        u_xlat33 = u_xlat33 * float(VGlobals.gFogParams[5].z);
        u_xlat33 = max(u_xlat33, -64.0);
        u_xlat4.x = exp2((-u_xlat33));
        u_xlat4.x = (-u_xlat4.x) + 1.0;
        u_xlat4.x = u_xlat4.x / u_xlat33;
        u_xlatb33 = 0.00999999978<abs(u_xlat33);
        u_xlat33 = (u_xlatb33) ? u_xlat4.x : 0.693147004;
        u_xlat30 = u_xlat30 * u_xlat33;
        u_xlat16_15 = half(u_xlat30 * (-float(u_xlat16_5.y)));
        u_xlat16_15 = u_xlat16_15 * VGlobals.gFogParams[4].w;
        u_xlat16_15 = exp2(u_xlat16_15);
        u_xlat16_15 = max(u_xlat16_15, VGlobals.gFogParams[5].x);
        u_xlat16_25.x = (-u_xlat16_15) + half(1.0);
        u_xlat16_7.xyz = half3(u_xlat16_15) * u_xlat16_7.xyz;
        u_xlat16_4.xyz = fma(VGlobals.gFogParams[4].xyz, u_xlat16_25.xxx, u_xlat16_7.xyz);
        u_xlat16_4.w = u_xlat16_5.x * u_xlat16_15;
        u_xlatb30 = half(0.5)<VGlobals.gFogParams[7].x;
        if(u_xlatb30){
            u_xlat16_25.xy = half2(fma(u_xlat1.xz, float2(VGlobals.gFogParams[8].xy), float2(VGlobals.gFogParams[8].zw)));
            u_xlat16_25.x = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_25.xy), level(0.0)).x;
            u_xlat16_25.x = log2(u_xlat16_25.x);
            u_xlat16_25.x = u_xlat16_25.x * VGlobals.gFogParams[7].y;
            u_xlat16_25.x = exp2(u_xlat16_25.x);
            u_xlat16_5.x = fma((-u_xlat16_15), u_xlat16_5.x, half(1.0));
            output.TEXCOORD7.w = fma(u_xlat16_25.x, u_xlat16_5.x, u_xlat16_4.w);
            output.TEXCOORD7.xyz = fma(u_xlat16_25.xxx, (-u_xlat16_4.xyz), u_xlat16_4.xyz);
        } else {
            output.TEXCOORD7 = u_xlat16_4;
        }
    } else {
        output.TEXCOORD7 = half4(0.0, 0.0, 0.0, 1.0);
    }
    u_xlat2.w = 1.0;
    u_xlat16_5.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat2));
    u_xlat16_5.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat2));
    u_xlat16_5.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat2));
    u_xlat16_4 = half4(u_xlat2.yzzx * u_xlat2.xyzz);
    u_xlat16_7.x = dot(VGlobals.gLightBuffer[3], u_xlat16_4);
    u_xlat16_7.y = dot(VGlobals.gLightBuffer[4], u_xlat16_4);
    u_xlat16_7.z = dot(VGlobals.gLightBuffer[5], u_xlat16_4);
    u_xlat16_35 = half(u_xlat2.y * u_xlat2.y);
    u_xlat16_35 = half(fma(u_xlat2.x, u_xlat2.x, (-float(u_xlat16_35))));
    u_xlat16_7.xyz = fma(VGlobals.gLightBuffer[6].xyz, half3(u_xlat16_35), u_xlat16_7.xyz);
    u_xlat16_5.xyz = u_xlat16_5.xyz + u_xlat16_7.xyz;
    u_xlat16_5.xyz = u_xlat16_5.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_5.xyz = max(u_xlat16_5.xyz, half3(0.0, 0.0, 0.0));
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
    output.TEXCOORD8.xyz = float3(u_xlat16_5.xyz);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
