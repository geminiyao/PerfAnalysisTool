#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float _totalAnimTime ;
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
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]];
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
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    int2 u_xlati0;
    float4 u_xlat1;
    bool3 u_xlatb1;
    float4 u_xlat2;
    half3 u_xlat16_2;
    float3 u_xlat3;
    bool u_xlatb3;
    float3 u_xlat4;
    float u_xlat5;
    float2 u_xlat8;
    float2 u_xlat10;
    float u_xlat15;
    uint u_xlatu16;
    float u_xlat18;
    u_xlati0.x = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0.xy = u_xlati0.xx << int2(0x1, 0x3);
    u_xlatb1.xyz = (input.COLOR0.yyy<half3(0.5, 1.5, 2.5));
    u_xlat10.xy = (u_xlatb1.z) ? float2(VGlobals._vertexAnimTexture2_TexelSize.zw) : float2(VGlobals._vertexAnimTexture3_TexelSize.zw);
    u_xlat10.xy = (u_xlatb1.y) ? float2(VGlobals._vertexAnimTexture1_TexelSize.zw) : u_xlat10.xy;
    u_xlat10.xy = (u_xlatb1.x) ? float2(VGlobals._vertexAnimTexture0_TexelSize.zw) : u_xlat10.xy;
    u_xlat16_2.x = rint(input.COLOR0.x);
    u_xlatu16 = uint(float(u_xlat16_2.x));
    u_xlat3.x = UnityPerCamera._Time.y + (-UnityInstancing_AnimProps[u_xlati0.x / 2].LerpWeights.x);
    u_xlat3.x = u_xlat3.x / VGlobals._totalAnimTime;
    u_xlat8.xy = float2(1.0, 1.0) / u_xlat10.xy;
    u_xlat10.x = u_xlat10.x + -1.0;
    u_xlat15 = u_xlat10.x * u_xlat3.x;
    u_xlatb3 = 0.0<UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.x;
    u_xlat18 = UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.y / VGlobals._totalAnimTime;
    u_xlat18 = u_xlat18 * UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.z;
    u_xlat0.x = fma(u_xlat18, u_xlat10.x, UnityInstancing_AnimProps[u_xlati0.x / 2].FrameIndices.w);
    u_xlat0.x = (u_xlatb3) ? u_xlat0.x : u_xlat15;
    u_xlat0.x = u_xlat0.x + 0.5;
    u_xlat3.x = u_xlat8.x * u_xlat0.x;
    u_xlat0.x = float(u_xlatu16);
    u_xlat0.x = u_xlat0.x + 0.5;
    u_xlat3.y = u_xlat8.y * u_xlat0.x;
    if(u_xlatb1.x){
        u_xlat0.xzw = _vertexAnimTexture0.sample(sampler_vertexAnimTexture0, u_xlat3.xy, level(0.0)).xyz;
        u_xlat16_2.xyz = half3(u_xlat0.xzw);
    } else {
        if(u_xlatb1.y){
            u_xlat0.xzw = _vertexAnimTexture1.sample(sampler_vertexAnimTexture1, u_xlat3.xy, level(0.0)).xyz;
            u_xlat16_2.xyz = half3(u_xlat0.xzw);
        } else {
            if(u_xlatb1.z){
                u_xlat0.xzw = _vertexAnimTexture2.sample(sampler_vertexAnimTexture2, u_xlat3.xy, level(0.0)).xyz;
                u_xlat16_2.xyz = half3(u_xlat0.xzw);
            } else {
                u_xlat0.xzw = _vertexAnimTexture3.sample(sampler_vertexAnimTexture3, u_xlat3.xy, level(0.0)).xyz;
                u_xlat16_2.xyz = half3(u_xlat0.xzw);
            }
        }
    }
    u_xlat1 = float4(u_xlat16_2.yyyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat1 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], float4(u_xlat16_2.xxxx), u_xlat1);
    u_xlat1 = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], float4(u_xlat16_2.zzzz), u_xlat1);
    u_xlat1 = u_xlat1 + UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3];
    u_xlat0.xzw = float3(input.NORMAL0.yyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.NORMAL0.xxx), u_xlat0.xzw);
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.NORMAL0.zzz), u_xlat0.xzw);
    u_xlat3.xyz = float3(input.TANGENT0.yyy) * UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat3.xyz = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.TANGENT0.xxx), u_xlat3.xyz);
    u_xlat3.xyz = fma(UnityInstancing_PerDraw0[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.TANGENT0.zzz), u_xlat3.xyz);
    u_xlat5 = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat4.xyz = u_xlat0.wxz * u_xlat3.yzx;
    u_xlat4.xyz = fma(u_xlat0.zwx, u_xlat3.zxy, (-u_xlat4.xyz));
    u_xlat4.xyz = float3(u_xlat5) * u_xlat4.xyz;
    u_xlat5 = dot(u_xlat4.xyz, u_xlat4.xyz);
    u_xlat5 = max(u_xlat5, 0.00100000005);
    u_xlat5 = rsqrt(u_xlat5);
    u_xlat4.xyz = float3(u_xlat5) * u_xlat4.xyz;
    u_xlat2 = u_xlat1.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat2 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat1.xxxx, u_xlat2);
    u_xlat2 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat1.zzzz, u_xlat2);
    output.mtl_Position = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat1.wwww, u_xlat2);
    output.TEXCOORD0.xyz = u_xlat1.xyz;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.xyz = u_xlat1.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    output.TEXCOORD3.xyz = half3(u_xlat3.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    output.TEXCOORD4.xyz = half3(u_xlat4.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat0.xzw);
    output.TEXCOORD8.xyz = float3(0.0, 0.0, 0.0);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
