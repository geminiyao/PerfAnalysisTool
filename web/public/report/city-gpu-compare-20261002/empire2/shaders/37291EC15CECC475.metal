#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float3 _WorldSpaceCameraPos ;
    float4 _ProjectionParams ;
    float4 unity_WorldTransformParams ;
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    half4 gLightBuffer [116];
    float4 gShadowParams0 [7];
    float gPlanarShadowEnabled ;
    float4 gPlanarShadowParams ;
    float4 hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat [4];
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
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]];
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]];
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]];
};

vertex Mtl_VertexOut xlatMtlMain(
    constant VGlobals_Type& VGlobals [[ buffer(0) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(1) ]],
    constant UnityInstancing_PerDraw0_Type& UnityInstancing_PerDraw0 [[ buffer(2) ]],
    constant UnityInstancing_AnimProps_Type& UnityInstancing_AnimProps [[ buffer(3) ]],
    sampler sampler_boneTexture [[ sampler (0) ]],
    texture2d<float, access::sample > _boneTexture [[ texture(0) ]] ,
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
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
    half3 u_xlat16_9;
    half3 u_xlat16_10;
    float3 u_xlat11;
    float u_xlat14;
    uint u_xlatu14;
    float2 u_xlat24;
    bool2 u_xlatb24;
    float u_xlat26;
    float u_xlat36;
    uint u_xlatu36;
    bool u_xlatb36;
    float u_xlat39;
    half u_xlat16_45;
    u_xlati0.x = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0.xy = u_xlati0.xx << int2(0x1, 0x3);
    u_xlatb24.x = UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.w>=100.0;
    u_xlat16_1.x = rint(input.TEXCOORD2.x);
    u_xlatu36 = uint(float(u_xlat16_1.x));
    u_xlat2.x = 0.5 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].FrameIndices.x;
    u_xlat2.x = u_xlat2.x + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.x;
    u_xlatu14 = u_xlatu36 * 0x3u;
    u_xlat14 = float(u_xlatu14);
    u_xlat26 = u_xlat14 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].FrameIndices.y;
    u_xlat2.z = u_xlat26 + 0.5;
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
    u_xlat39 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat39 = max(u_xlat39, 0.00100000005);
    u_xlat39 = rsqrt(u_xlat39);
    u_xlat3.xyz = float3(u_xlat39) * u_xlat3.xyz;
    u_xlatb24.y = u_xlatu36<0x3e8u;
    u_xlat24.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb24.xy));
    u_xlat24.x = u_xlat24.y * u_xlat24.x;
    u_xlatb24.x = float(0.0)!=u_xlat24.x;
    if(u_xlatb24.x){
        u_xlat36 = 0.5 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].FrameIndices.z;
        u_xlat36 = u_xlat36 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.y;
        u_xlat14 = u_xlat14 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].FrameIndices.w;
        u_xlat14 = u_xlat14 + 0.5;
        u_xlat1.x = u_xlat36 * VGlobals._boneTexture_TexelSize.x;
        u_xlat1.y = u_xlat14 * VGlobals._boneTexture_TexelSize.y;
        u_xlat4 = _boneTexture.sample(sampler_boneTexture, u_xlat1.xy, level(0.0));
        u_xlat1.z = fma(u_xlat14, VGlobals._boneTexture_TexelSize.y, VGlobals._boneTexture_TexelSize.y);
        u_xlat6 = _boneTexture.sample(sampler_boneTexture, u_xlat1.xz, level(0.0));
        u_xlat1.w = u_xlat1.z + VGlobals._boneTexture_TexelSize.y;
        u_xlat1 = _boneTexture.sample(sampler_boneTexture, u_xlat1.xw, level(0.0));
        u_xlat7.x = dot(input.POSITION0, u_xlat4);
        u_xlat7.y = dot(input.POSITION0, u_xlat6);
        u_xlat7.z = dot(input.POSITION0, u_xlat1);
        u_xlat8.x = dot(float3(input.NORMAL0.xyz), u_xlat4.xyz);
        u_xlat8.y = dot(float3(input.NORMAL0.xyz), u_xlat6.xyz);
        u_xlat8.z = dot(float3(input.NORMAL0.xyz), u_xlat1.xyz);
        u_xlat36 = dot(u_xlat8.xyz, u_xlat8.xyz);
        u_xlat36 = max(u_xlat36, 0.00100000005);
        u_xlat36 = rsqrt(u_xlat36);
        u_xlat4.x = dot(float3(input.TANGENT0.xyz), u_xlat4.xyz);
        u_xlat4.y = dot(float3(input.TANGENT0.xyz), u_xlat6.xyz);
        u_xlat4.z = dot(float3(input.TANGENT0.xyz), u_xlat1.xyz);
        u_xlat14 = dot(u_xlat4.xyz, u_xlat4.xyz);
        u_xlat14 = max(u_xlat14, 0.00100000005);
        u_xlat14 = rsqrt(u_xlat14);
        u_xlat6.xyz = fma(u_xlat8.xyz, float3(u_xlat36), (-u_xlat2.xzw));
        u_xlat6.xyz = fma(UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.zzz, u_xlat6.xyz, u_xlat2.xzw);
        u_xlat4.xyz = fma(u_xlat4.xyz, float3(u_xlat14), (-u_xlat3.xyz));
        u_xlat4.xyz = fma(UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.zzz, u_xlat4.xyz, u_xlat3.xyz);
        u_xlat5.w = input.POSITION0.w;
        u_xlat7.w = input.POSITION0.w;
        u_xlat1 = (-u_xlat5) + u_xlat7;
        u_xlat1 = fma(UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.zzzz, u_xlat1, u_xlat5);
        u_xlat16_1 = half4(u_xlat1);
        u_xlat16_4.xyz = half3(u_xlat4.xyz);
        u_xlat16_6.xyz = half3(u_xlat6.xyz);
    } else {
        u_xlat16_4.xyz = input.TANGENT0.xyz;
        u_xlat16_6.xyz = input.NORMAL0.xyz;
    }
    u_xlat5.w = input.POSITION0.w;
    u_xlat16_1 = (u_xlatb24.x) ? u_xlat16_1 : half4(u_xlat5);
    u_xlat16_9.xyz = (u_xlatb24.x) ? u_xlat16_4.xyz : half3(u_xlat3.xyz);
    u_xlat16_10.xyz = (u_xlatb24.x) ? u_xlat16_6.xyz : half3(u_xlat2.xzw);
    u_xlat2 = float4(u_xlat16_1.yyyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat2 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], float4(u_xlat16_1.xxxx), u_xlat2);
    u_xlat2 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], float4(u_xlat16_1.zzzz), u_xlat2);
    u_xlat1 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], float4(u_xlat16_1.wwww), u_xlat2);
    u_xlat0.xzw = float3(u_xlat16_10.yyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(u_xlat16_10.xxx), u_xlat0.xzw);
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(u_xlat16_10.zzz), u_xlat0.xzw);
    u_xlat2.x = dot(u_xlat0.xzw, u_xlat0.xzw);
    u_xlat2.x = max(u_xlat2.x, 0.00100000005);
    u_xlat2.x = rsqrt(u_xlat2.x);
    u_xlat2.xyz = u_xlat0.xzw * u_xlat2.xxx;
    u_xlat0.xzw = float3(u_xlat16_9.yyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].yzx;
    u_xlat0.xzw = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].yzx, float3(u_xlat16_9.xxx), u_xlat0.xzw);
    u_xlat0.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].yzx, float3(u_xlat16_9.zzz), u_xlat0.xzw);
    u_xlat36 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat36 = max(u_xlat36, 0.00100000005);
    u_xlat36 = rsqrt(u_xlat36);
    u_xlat0.xyz = float3(u_xlat36) * u_xlat0.xyz;
    u_xlat36 = float(input.TANGENT0.w) * VGlobals.unity_WorldTransformParams.w;
    u_xlat3.xyz = u_xlat0.xyz * u_xlat2.zxy;
    u_xlat3.xyz = fma(u_xlat2.yzx, u_xlat0.yzx, (-u_xlat3.xyz));
    u_xlat3.xyz = float3(u_xlat36) * u_xlat3.xyz;
    u_xlat36 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat36 = max(u_xlat36, 0.00100000005);
    u_xlat36 = rsqrt(u_xlat36);
    u_xlat3.xyz = float3(u_xlat36) * u_xlat3.xzy;
    u_xlat4 = u_xlat1.yyyy * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat4 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat1.xxxx, u_xlat4);
    u_xlat4 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat1.zzzz, u_xlat4);
    output.mtl_Position = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat1.wwww, u_xlat4);
    u_xlat7.xyz = (-u_xlat1.xyz) + VGlobals._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat36 = dot(u_xlat7.xyz, u_xlat7.xyz);
    u_xlat36 = max(u_xlat36, 0.00100000005);
    u_xlat36 = rsqrt(u_xlat36);
    u_xlat7.xyz = fma(u_xlat7.xyz, float3(u_xlat36), float3(VGlobals.gLightBuffer[11].xyz));
    u_xlat36 = dot(u_xlat7.xyz, u_xlat7.xyz);
    u_xlat36 = max(u_xlat36, 0.00100000005);
    u_xlat36 = rsqrt(u_xlat36);
    u_xlat7.xyz = float3(u_xlat36) * u_xlat7.xyz;
    u_xlat8.x = u_xlat0.z;
    u_xlat8.y = u_xlat3.x;
    u_xlat8.z = u_xlat2.x;
    u_xlat11.x = u_xlat0.x;
    u_xlat11.y = u_xlat3.z;
    u_xlat11.z = u_xlat2.y;
    u_xlat0.xzw = u_xlat7.yyy * u_xlat11.xyz;
    u_xlat0.xzw = fma(u_xlat8.xyz, u_xlat7.xxx, u_xlat0.xzw);
    u_xlat3.x = u_xlat0.y;
    u_xlat3.z = u_xlat2.z;
    u_xlat0.xyz = fma(u_xlat3.xyz, u_xlat7.zzz, u_xlat0.xzw);
    u_xlat7.xyz = u_xlat11.xyz * float3(VGlobals.gLightBuffer[11].yyy);
    u_xlat7.xyz = fma(u_xlat8.xyz, float3(VGlobals.gLightBuffer[11].xxx), u_xlat7.xyz);
    u_xlat3.xyz = fma(u_xlat3.xyz, float3(VGlobals.gLightBuffer[11].zzz), u_xlat7.xyz);
    u_xlatb36 = 0.5<VGlobals.gPlanarShadowEnabled;
    if(u_xlatb36){
        u_xlat36 = (-u_xlat1.y) + VGlobals.gPlanarShadowParams.x;
        u_xlat36 = u_xlat36 / float(VGlobals.gLightBuffer[11].y);
        u_xlat7.xyz = fma(float3(VGlobals.gLightBuffer[11].xyz), float3(u_xlat36), u_xlat1.xyz);
        u_xlat8.xyz = u_xlat7.yyy * VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[1].xyw;
        u_xlat7.xyw = fma(VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[0].xyw, u_xlat7.xxx, u_xlat8.xyz);
        u_xlat7.xyz = fma(VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[2].xyw, u_xlat7.zzz, u_xlat7.xyw);
        u_xlat7.xyz = u_xlat7.xyz + VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[3].xyw;
        u_xlat16_9.xyz = half3(u_xlat7.xyz * float3(0.5, 0.5, 0.5));
        u_xlat16_10.x = u_xlat16_9.z + u_xlat16_9.x;
        u_xlat16_10.y = half(fma(float(u_xlat16_9.y), VGlobals._ProjectionParams.x, float(u_xlat16_9.z)));
        u_xlat36 = u_xlat1.y + 100.0;
        u_xlat36 = u_xlat36 / VGlobals.gPlanarShadowParams.y;
        output.TEXCOORD14.z = u_xlat7.z * u_xlat36;
        output.TEXCOORD14.xy = float2(u_xlat16_10.xy);
        output.TEXCOORD14.w = u_xlat7.z;
    } else {
        u_xlat1.w = 1.0;
        output.TEXCOORD14.x = dot(VGlobals.gShadowParams0[0], u_xlat1);
        output.TEXCOORD14.y = dot(VGlobals.gShadowParams0[1], u_xlat1);
        output.TEXCOORD14.z = dot(VGlobals.gShadowParams0[2], u_xlat1);
        output.TEXCOORD14.w = dot(VGlobals.gShadowParams0[3], u_xlat1);
    }
    u_xlat2.w = 1.0;
    u_xlat16_9.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat2));
    u_xlat16_9.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat2));
    u_xlat16_9.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat2));
    u_xlat16_4 = half4(u_xlat2.yzzx * u_xlat2.xyzz);
    u_xlat16_10.x = dot(VGlobals.gLightBuffer[3], u_xlat16_4);
    u_xlat16_10.y = dot(VGlobals.gLightBuffer[4], u_xlat16_4);
    u_xlat16_10.z = dot(VGlobals.gLightBuffer[5], u_xlat16_4);
    u_xlat16_45 = half(u_xlat2.y * u_xlat2.y);
    u_xlat16_45 = half(fma(u_xlat2.x, u_xlat2.x, (-float(u_xlat16_45))));
    u_xlat16_10.xyz = fma(VGlobals.gLightBuffer[6].xyz, half3(u_xlat16_45), u_xlat16_10.xyz);
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
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
