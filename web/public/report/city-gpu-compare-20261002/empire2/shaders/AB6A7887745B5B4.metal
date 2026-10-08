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
    half4 gLightBuffer [116];
    float4 gShadowParams0 [7];
    float gPlanarShadowEnabled ;
    float4 gPlanarShadowParams ;
    float4 hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat [4];
    float4 _FlagWeight0 ;
    float4 _FlagWeight1 ;
    float4 _boneTexture_TexelSize ;
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
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(2) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(3) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(4) ]],
    constant UnityInstancing_PerDraw0_Type& UnityInstancing_PerDraw0 [[ buffer(5) ]],
    constant UnityInstancing_AnimProps_Type& UnityInstancing_AnimProps [[ buffer(6) ]],
    sampler sampler_boneTexture [[ sampler (0) ]],
    texture2d<float, access::sample > _boneTexture [[ texture(0) ]] ,
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    float4 u_xlat0;
    half4 u_xlat16_0;
    int2 u_xlati0;
    float4 u_xlat1;
    int u_xlati1;
    bool u_xlatb1;
    float4 u_xlat2;
    half4 u_xlat16_2;
    float4 u_xlat3;
    float4 u_xlat4;
    half3 u_xlat16_4;
    float4 u_xlat5;
    float4 u_xlat6;
    half3 u_xlat16_7;
    float4 u_xlat8;
    float3 u_xlat9;
    half3 u_xlat16_10;
    float3 u_xlat11;
    float3 u_xlat13;
    half3 u_xlat16_13;
    int u_xlati13;
    uint u_xlatu13;
    bool u_xlatb13;
    half u_xlat16_19;
    float u_xlat24;
    bool u_xlatb24;
    float u_xlat25;
    half u_xlat16_31;
    float u_xlat36;
    float u_xlat37;
    uint u_xlatu37;
    float u_xlat41;
    bool u_xlatb41;
    half u_xlat16_43;
    u_xlati0.x = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0.xy = u_xlati0.xx << int2(0x1, 0x3);
    u_xlatb24 = UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.w>=100.0;
    u_xlat36 = u_xlatb24 ? 1.0 : float(0.0);
    u_xlat24 = (u_xlatb24) ? -106.283188 : -0.0;
    u_xlat24 = u_xlat24 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.w;
    u_xlatb1 = input.TEXCOORD2.x<half(4.0);
    if(u_xlatb1){
        u_xlati1 = int(float(input.TEXCOORD2.x));
        u_xlat1.x = dot(VGlobals._FlagWeight0, ImmCB_0[u_xlati1]);
    } else {
        u_xlatb13 = input.TEXCOORD2.x<half(8.0);
        if(u_xlatb13){
            u_xlati13 = int(float(input.TEXCOORD2.x));
            u_xlati13 = u_xlati13 + int(0xfffffffcu);
            u_xlat1.x = dot(VGlobals._FlagWeight1, ImmCB_0[u_xlati13]);
        } else {
            u_xlat1.x = 0.0;
        }
    }
    u_xlat16_2.x = rint(input.TEXCOORD2.x);
    u_xlatu13 = uint(float(u_xlat16_2.x));
    u_xlat25 = 0.5 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].FrameIndices.x;
    u_xlat25 = u_xlat25 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.x;
    u_xlatu37 = u_xlatu13 * 0x3u;
    u_xlat37 = float(u_xlatu37);
    u_xlat3.x = u_xlat37 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].FrameIndices.y;
    u_xlat3.x = u_xlat3.x + 0.5;
    u_xlat2.x = u_xlat25 * VGlobals._boneTexture_TexelSize.x;
    u_xlat2.y = u_xlat3.x * VGlobals._boneTexture_TexelSize.y;
    u_xlat4 = _boneTexture.sample(sampler_boneTexture, u_xlat2.xy, level(0.0));
    u_xlat2.z = fma(u_xlat3.x, VGlobals._boneTexture_TexelSize.y, VGlobals._boneTexture_TexelSize.y);
    u_xlat3 = _boneTexture.sample(sampler_boneTexture, u_xlat2.xz, level(0.0));
    u_xlat2.w = u_xlat2.z + VGlobals._boneTexture_TexelSize.y;
    u_xlat16_2 = half4(_boneTexture.sample(sampler_boneTexture, u_xlat2.xw, level(0.0)));
    u_xlat24 = (-u_xlat24) * u_xlat1.x;
    u_xlat1.x = sin(u_xlat24);
    u_xlat5.x = cos(u_xlat24);
    u_xlat6.x = (-u_xlat1.x);
    u_xlat6.y = u_xlat5.x;
    u_xlat16_7.x = dot(u_xlat6.yx, u_xlat4.xz);
    u_xlat16_19 = dot(u_xlat6.yx, u_xlat3.xz);
    u_xlat16_31 = dot(u_xlat6.yx, float2(u_xlat16_2.xz));
    u_xlat6.z = u_xlat1.x;
    u_xlat4.z = dot(u_xlat6.zy, u_xlat4.xz);
    u_xlat3.z = dot(u_xlat6.zy, u_xlat3.xz);
    u_xlat16_2.z = dot(u_xlat6.zy, float2(u_xlat16_2.xz));
    u_xlat4.x = float(u_xlat16_7.x);
    u_xlat5.x = dot(input.POSITION0, u_xlat4);
    u_xlat3.x = float(u_xlat16_19);
    u_xlat5.y = dot(input.POSITION0, u_xlat3);
    u_xlat16_2.x = u_xlat16_31;
    u_xlat5.z = dot(input.POSITION0, float4(u_xlat16_2));
    u_xlat8.x = dot(float3(input.NORMAL0.xyz), u_xlat4.xyz);
    u_xlat8.y = dot(float3(input.NORMAL0.xyz), u_xlat3.xyz);
    u_xlat8.z = dot(input.NORMAL0.xyz, u_xlat16_2.xyz);
    u_xlat24 = dot(u_xlat8.xyz, u_xlat8.xyz);
    u_xlat24 = max(u_xlat24, 0.00100000005);
    u_xlat24 = rsqrt(u_xlat24);
    u_xlat8.xyz = float3(u_xlat24) * u_xlat8.xyz;
    u_xlat4.x = dot(float3(input.TANGENT0.xyz), u_xlat4.xyz);
    u_xlat4.y = dot(float3(input.TANGENT0.xyz), u_xlat3.xyz);
    u_xlat4.z = dot(input.TANGENT0.xyz, u_xlat16_2.xyz);
    u_xlat24 = dot(u_xlat4.xyz, u_xlat4.xyz);
    u_xlat24 = max(u_xlat24, 0.00100000005);
    u_xlat24 = rsqrt(u_xlat24);
    u_xlat3.xyz = float3(u_xlat24) * u_xlat4.xyz;
    u_xlatb24 = u_xlatu13<0x3e8u;
    u_xlat24 = u_xlatb24 ? 1.0 : float(0.0);
    u_xlat24 = u_xlat24 * u_xlat36;
    u_xlatb24 = float(0.0)!=u_xlat24;
    if(u_xlatb24){
        u_xlat36 = 0.5 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].FrameIndices.z;
        u_xlat36 = u_xlat36 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.y;
        u_xlat1.x = u_xlat37 + UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].FrameIndices.w;
        u_xlat1.x = u_xlat1.x + 0.5;
        u_xlat2.x = u_xlat36 * VGlobals._boneTexture_TexelSize.x;
        u_xlat2.y = u_xlat1.x * VGlobals._boneTexture_TexelSize.y;
        u_xlat4 = _boneTexture.sample(sampler_boneTexture, u_xlat2.xy, level(0.0));
        u_xlat2.z = fma(u_xlat1.x, VGlobals._boneTexture_TexelSize.y, VGlobals._boneTexture_TexelSize.y);
        u_xlat1 = _boneTexture.sample(sampler_boneTexture, u_xlat2.xz, level(0.0));
        u_xlat2.w = u_xlat2.z + VGlobals._boneTexture_TexelSize.y;
        u_xlat2 = _boneTexture.sample(sampler_boneTexture, u_xlat2.xw, level(0.0));
        u_xlat16_7.x = dot(u_xlat6.yx, u_xlat4.xz);
        u_xlat16_19 = dot(u_xlat6.yx, u_xlat1.xz);
        u_xlat16_31 = dot(u_xlat6.yx, u_xlat2.xz);
        u_xlat4.z = dot(u_xlat6.zy, u_xlat4.xz);
        u_xlat1.z = dot(u_xlat6.zy, u_xlat1.xz);
        u_xlat2.z = dot(u_xlat6.zy, u_xlat2.xz);
        u_xlat4.x = float(u_xlat16_7.x);
        u_xlat6.x = dot(input.POSITION0, u_xlat4);
        u_xlat1.x = float(u_xlat16_19);
        u_xlat6.y = dot(input.POSITION0, u_xlat1);
        u_xlat2.x = float(u_xlat16_31);
        u_xlat6.z = dot(input.POSITION0, u_xlat2);
        u_xlat9.x = dot(float3(input.NORMAL0.xyz), u_xlat4.xyz);
        u_xlat9.y = dot(float3(input.NORMAL0.xyz), u_xlat1.xyz);
        u_xlat9.z = dot(float3(input.NORMAL0.xyz), u_xlat2.xyz);
        u_xlat36 = dot(u_xlat9.xyz, u_xlat9.xyz);
        u_xlat36 = max(u_xlat36, 0.00100000005);
        u_xlat36 = rsqrt(u_xlat36);
        u_xlat4.x = dot(float3(input.TANGENT0.xyz), u_xlat4.xyz);
        u_xlat4.y = dot(float3(input.TANGENT0.xyz), u_xlat1.xyz);
        u_xlat4.z = dot(float3(input.TANGENT0.xyz), u_xlat2.xyz);
        u_xlat1.x = dot(u_xlat4.xyz, u_xlat4.xyz);
        u_xlat1.x = max(u_xlat1.x, 0.00100000005);
        u_xlat1.x = rsqrt(u_xlat1.x);
        u_xlat13.xyz = fma(u_xlat9.xyz, float3(u_xlat36), (-u_xlat8.xyz));
        u_xlat13.xyz = fma(UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.zzz, u_xlat13.xyz, u_xlat8.xyz);
        u_xlat4.xyz = fma(u_xlat4.xyz, u_xlat1.xxx, (-u_xlat3.xyz));
        u_xlat4.xyz = fma(UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.zzz, u_xlat4.xyz, u_xlat3.xyz);
        u_xlat5.w = input.POSITION0.w;
        u_xlat6.w = input.POSITION0.w;
        u_xlat2 = (-u_xlat5) + u_xlat6;
        u_xlat2 = fma(UnityInstancing_AnimProps.AnimPropsArray[u_xlati0.x / 2].LerpWeights.zzzz, u_xlat2, u_xlat5);
        u_xlat16_2 = half4(u_xlat2);
        u_xlat16_4.xyz = half3(u_xlat4.xyz);
        u_xlat16_13.xyz = half3(u_xlat13.xyz);
    } else {
        u_xlat16_4.xyz = input.TANGENT0.xyz;
        u_xlat16_13.xyz = input.NORMAL0.xyz;
    }
    u_xlat5.w = input.POSITION0.w;
    u_xlat16_2 = (bool(u_xlatb24)) ? u_xlat16_2 : half4(u_xlat5);
    u_xlat16_7.xyz = (bool(u_xlatb24)) ? u_xlat16_4.xyz : half3(u_xlat3.xyz);
    u_xlat16_10.xyz = (bool(u_xlatb24)) ? u_xlat16_13.xyz : half3(u_xlat8.xyz);
    u_xlat1 = float4(u_xlat16_2.yyyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat1 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], float4(u_xlat16_2.xxxx), u_xlat1);
    u_xlat1 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], float4(u_xlat16_2.zzzz), u_xlat1);
    u_xlat1 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], float4(u_xlat16_2.wwww), u_xlat1);
    u_xlat5.xyz = float3(u_xlat16_10.yyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat5.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(u_xlat16_10.xxx), u_xlat5.xyz);
    u_xlat5.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(u_xlat16_10.zzz), u_xlat5.xyz);
    u_xlat41 = dot(u_xlat5.xyz, u_xlat5.xyz);
    u_xlat41 = max(u_xlat41, 0.00100000005);
    u_xlat41 = rsqrt(u_xlat41);
    u_xlat2.xyz = float3(u_xlat41) * u_xlat5.xyz;
    u_xlat5.xyz = float3(u_xlat16_7.yyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].yzx;
    u_xlat5.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].yzx, float3(u_xlat16_7.xxx), u_xlat5.xyz);
    u_xlat5.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0.y / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].yzx, float3(u_xlat16_7.zzz), u_xlat5.xyz);
    u_xlat41 = dot(u_xlat5.xyz, u_xlat5.xyz);
    u_xlat41 = max(u_xlat41, 0.00100000005);
    u_xlat41 = rsqrt(u_xlat41);
    u_xlat5.xyz = float3(u_xlat41) * u_xlat5.xyz;
    u_xlat41 = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat6.xyz = u_xlat2.zxy * u_xlat5.xyz;
    u_xlat6.xyz = fma(u_xlat2.yzx, u_xlat5.yzx, (-u_xlat6.xyz));
    u_xlat6.xyz = float3(u_xlat41) * u_xlat6.xyz;
    u_xlat41 = dot(u_xlat6.xyz, u_xlat6.xyz);
    u_xlat41 = max(u_xlat41, 0.00100000005);
    u_xlat41 = rsqrt(u_xlat41);
    u_xlat6.xyz = float3(u_xlat41) * u_xlat6.xzy;
    u_xlat0 = u_xlat1.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat0 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat1.xxxx, u_xlat0);
    u_xlat0 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat1.zzzz, u_xlat0);
    output.mtl_Position = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat1.wwww, u_xlat0);
    u_xlat8.xyz = (-u_xlat1.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat41 = dot(u_xlat8.xyz, u_xlat8.xyz);
    u_xlat41 = max(u_xlat41, 0.00100000005);
    u_xlat41 = rsqrt(u_xlat41);
    u_xlat8.xyz = fma(u_xlat8.xyz, float3(u_xlat41), float3(VGlobals.gLightBuffer[11].xyz));
    u_xlat41 = dot(u_xlat8.xyz, u_xlat8.xyz);
    u_xlat41 = max(u_xlat41, 0.00100000005);
    u_xlat41 = rsqrt(u_xlat41);
    u_xlat8.xyz = float3(u_xlat41) * u_xlat8.xyz;
    u_xlat9.x = u_xlat5.z;
    u_xlat9.y = u_xlat6.x;
    u_xlat9.z = u_xlat2.x;
    u_xlat11.x = u_xlat5.x;
    u_xlat11.y = u_xlat6.z;
    u_xlat11.z = u_xlat2.y;
    u_xlat5.xzw = u_xlat8.yyy * u_xlat11.xyz;
    u_xlat5.xzw = fma(u_xlat9.xyz, u_xlat8.xxx, u_xlat5.xzw);
    u_xlat6.x = u_xlat5.y;
    u_xlat6.z = u_xlat2.z;
    u_xlat5.xyz = fma(u_xlat6.xyz, u_xlat8.zzz, u_xlat5.xzw);
    u_xlat8.xyz = u_xlat11.xyz * float3(VGlobals.gLightBuffer[11].yyy);
    u_xlat8.xyz = fma(u_xlat9.xyz, float3(VGlobals.gLightBuffer[11].xxx), u_xlat8.xyz);
    u_xlat6.xyz = fma(u_xlat6.xyz, float3(VGlobals.gLightBuffer[11].zzz), u_xlat8.xyz);
    u_xlatb41 = 0.5<VGlobals.gPlanarShadowEnabled;
    if(u_xlatb41){
        u_xlat41 = (-u_xlat1.y) + VGlobals.gPlanarShadowParams.x;
        u_xlat41 = u_xlat41 / float(VGlobals.gLightBuffer[11].y);
        u_xlat8.xyz = fma(float3(VGlobals.gLightBuffer[11].xyz), float3(u_xlat41), u_xlat1.xyz);
        u_xlat9.xyz = u_xlat8.yyy * VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[1].xyw;
        u_xlat8.xyw = fma(VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[0].xyw, u_xlat8.xxx, u_xlat9.xyz);
        u_xlat8.xyz = fma(VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[2].xyw, u_xlat8.zzz, u_xlat8.xyw);
        u_xlat8.xyz = u_xlat8.xyz + VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[3].xyw;
        u_xlat16_7.xyz = half3(u_xlat8.xyz * float3(0.5, 0.5, 0.5));
        u_xlat16_10.x = u_xlat16_7.z + u_xlat16_7.x;
        u_xlat16_10.y = half(fma(float(u_xlat16_7.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_7.z)));
        u_xlat41 = u_xlat1.y + 100.0;
        u_xlat41 = u_xlat41 / VGlobals.gPlanarShadowParams.y;
        output.TEXCOORD14.z = u_xlat8.z * u_xlat41;
        output.TEXCOORD14.xy = float2(u_xlat16_10.xy);
        output.TEXCOORD14.w = u_xlat8.z;
    } else {
        u_xlat1.w = 1.0;
        output.TEXCOORD14.x = dot(VGlobals.gShadowParams0[0], u_xlat1);
        output.TEXCOORD14.y = dot(VGlobals.gShadowParams0[1], u_xlat1);
        output.TEXCOORD14.z = dot(VGlobals.gShadowParams0[2], u_xlat1);
        output.TEXCOORD14.w = dot(VGlobals.gShadowParams0[3], u_xlat1);
    }
    u_xlat2.w = 1.0;
    u_xlat16_7.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat2));
    u_xlat16_7.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat2));
    u_xlat16_7.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat2));
    u_xlat16_0 = half4(u_xlat2.yzzx * u_xlat2.xyzz);
    u_xlat16_10.x = dot(VGlobals.gLightBuffer[3], u_xlat16_0);
    u_xlat16_10.y = dot(VGlobals.gLightBuffer[4], u_xlat16_0);
    u_xlat16_10.z = dot(VGlobals.gLightBuffer[5], u_xlat16_0);
    u_xlat16_43 = half(u_xlat2.y * u_xlat2.y);
    u_xlat16_43 = half(fma(u_xlat2.x, u_xlat2.x, (-float(u_xlat16_43))));
    u_xlat16_10.xyz = fma(VGlobals.gLightBuffer[6].xyz, half3(u_xlat16_43), u_xlat16_10.xyz);
    u_xlat16_7.xyz = u_xlat16_7.xyz + u_xlat16_10.xyz;
    u_xlat16_7.xyz = u_xlat16_7.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_7.xyz = max(u_xlat16_7.xyz, half3(0.0, 0.0, 0.0));
    output.TEXCOORD0.xyz = u_xlat1.xyz;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.xyz = u_xlat1.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    output.TEXCOORD3.xyz = half3(u_xlat5.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    output.TEXCOORD4.xyz = half3(u_xlat6.xyz);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat2.xyz);
    output.TEXCOORD8.xyz = float3(u_xlat16_7.xyz);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
