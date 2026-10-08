#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    half4 gLightBuffer [116];
    half4 _vertexAnimTexture0_TexelSize ;
    half4 _vertexAnimTexture1_TexelSize ;
    half4 _vertexAnimTexture2_TexelSize ;
    half4 _vertexAnimTexture3_TexelSize ;
    float4 gPlanarShadowParams ;
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

struct AnimPropsArray_Type
{
    float4 FrameIndices ;
    float4 LerpWeights ;
};

struct UnityInstancing_AnimProps_Type
{
    AnimPropsArray_Type AnimPropsArray [128];
};

struct Mtl_VertexIn
{
    half4 TEXCOORD0 [[ attribute(0) ]] ;
    half4 COLOR0 [[ attribute(1) ]] ;
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
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(1) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(2) ]],
    constant UnityInstancing_PerDraw0_Type& UnityInstancing_PerDraw0 [[ buffer(3) ]],
    constant UnityInstancing_AnimProps_Type& UnityInstancing_AnimProps [[ buffer(4) ]],
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
    half4 u_xlat16_1;
    half4 u_xlat16_2;
    float3 u_xlat3;
    float3 u_xlat4;
    half3 u_xlat16_5;
    float2 u_xlat12;
    float u_xlat18;
    bool u_xlatb18;
    float u_xlat19;
    uint u_xlatu19;
    u_xlati0.x = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0.xy = u_xlati0.xx << int2(0x1, 0x3);
    u_xlat16_1.xyz = half3(uint3((input.COLOR0.yyy<half3(0.5, 1.5, 2.5))) * 0xFFFFFFFFu);
    u_xlat12.xy = (int(u_xlat16_1.z) != 0) ? float2(VGlobals._vertexAnimTexture2_TexelSize.zw) : float2(VGlobals._vertexAnimTexture3_TexelSize.zw);
    u_xlat12.xy = (int(u_xlat16_1.y) != 0) ? float2(VGlobals._vertexAnimTexture1_TexelSize.zw) : u_xlat12.xy;
    u_xlat12.xy = (int(u_xlat16_1.x) != 0) ? float2(VGlobals._vertexAnimTexture0_TexelSize.zw) : u_xlat12.xy;
    u_xlat12.xy = float2(1.0, 1.0) / u_xlat12.xy;
    u_xlat16_2.x = rint(input.COLOR0.x);
    u_xlatu19 = uint(float(u_xlat16_2.x));
    u_xlat3.x = 0.5 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].FrameIndices.x;
    u_xlat3.x = u_xlat3.x + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.x;
    u_xlat3.y = u_xlat12.x * u_xlat3.x;
    u_xlat19 = float(u_xlatu19);
    u_xlat16_1.w = half(u_xlat19 + 0.5);
    u_xlat3.z = u_xlat12.y * float(u_xlat16_1.w);
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
    u_xlatb18 = UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.w>=100.0;
    if(u_xlatb18){
        u_xlat19 = 0.5 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].FrameIndices.z;
        u_xlat19 = u_xlat19 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.y;
        u_xlat3.x = u_xlat12.x * u_xlat19;
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
        u_xlat1 = fma(UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.zzzz, u_xlat1, float4(u_xlat16_2));
        u_xlat16_1 = half4(u_xlat1);
    }
    u_xlat16_2.w = half(1.0);
    u_xlat16_1 = (bool(u_xlatb18)) ? u_xlat16_1 : u_xlat16_2;
    u_xlat0.xzw = float3(u_xlat16_1.yyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(u_xlat16_1.xxx), u_xlat0.xzw);
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(u_xlat16_1.zzz), u_xlat0.xzw);
    u_xlat0.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].xyz, float3(u_xlat16_1.www), u_xlat0.xzw);
    u_xlat18 = (-u_xlat0.y) + VGlobals.gPlanarShadowParams.x;
    u_xlat3.xyz = float3(u_xlat18) * float3(VGlobals.gLightBuffer[11].xyz);
    u_xlat3.xyz = u_xlat3.xyz / float3(VGlobals.gLightBuffer[11].yyy);
    u_xlat3.xyz = u_xlat0.xyz + u_xlat3.xyz;
    u_xlat1 = u_xlat3.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat1 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat3.xxxx, u_xlat1);
    u_xlat1 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat3.zzzz, u_xlat1);
    output.mtl_Position = u_xlat1 + UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3];
    output.TEXCOORD0.xyz = u_xlat0.xyz;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.xyz = u_xlat0.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    output.TEXCOORD3 = half4(0.0, 0.0, 0.0, 0.0);
    output.TEXCOORD4 = half4(0.0, 0.0, 0.0, 0.0);
    output.TEXCOORD5.xyz = half3(0.0, 0.0, 0.0);
    output.TEXCOORD8.xyz = float3(0.0, 0.0, 0.0);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
