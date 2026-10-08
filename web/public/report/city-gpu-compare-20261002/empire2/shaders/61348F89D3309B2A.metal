#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float _PlanarShadowDepthBias ;
    half _DECAL_PROJECT_OFFSET ;
    int _VT_RootSize ;
    int _VT_MaxVTMip ;
    float _TERRAIN_VT_HEIGHT_SCALE ;
    float4 _VT_TerrainTileInfo ;
    float4 _VT_TerrainInfo ;
    float4 _VT_TerrainHeightInfo ;
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
    float4 TEXCOORD9 [[ user(TEXCOORD9) ]];
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
    sampler sampler_VT_IndexTex [[ sampler (0) ]],
    texture2d<half, access::sample > _VT_IndexTex [[ texture(0) ]] ,
    texture2d_array<half, access::sample > _VT_WorldYTex [[ texture(1) ]] ,
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    constexpr sampler vt_linear_clamp_sampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float3 u_xlat0;
    int u_xlati0;
    float4 u_xlat1;
    float4 u_xlat2;
    float4 u_xlat3;
    float4 u_xlat4;
    float4 u_xlat5;
    float4 u_xlat6;
    half4 u_xlat16_6;
    float3 u_xlat7;
    half3 u_xlat16_8;
    half2 u_xlat16_9;
    half3 u_xlat16_10;
    float3 u_xlat11;
    float u_xlat12;
    float u_xlat26;
    int2 u_xlati26;
    uint u_xlatu26;
    float u_xlat33;
    uint u_xlatu33;
    bool u_xlatb33;
    half u_xlat16_41;
    u_xlati0 = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati0 = u_xlati0 << 0x3;
    u_xlat1 = input.POSITION0.yyyy * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1];
    u_xlat1 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0], input.POSITION0.xxxx, u_xlat1);
    u_xlat1 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2], input.POSITION0.zzzz, u_xlat1);
    u_xlat2 = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3], input.POSITION0.wwww, u_xlat1);
    u_xlat11.xyz = float3(input.NORMAL0.yyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat11.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.NORMAL0.xxx), u_xlat11.xyz);
    u_xlat11.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.NORMAL0.zzz), u_xlat11.xyz);
    u_xlat1.x = dot(u_xlat11.xyz, u_xlat11.xyz);
    u_xlat1.x = max(u_xlat1.x, 0.00100000005);
    u_xlat1.x = rsqrt(u_xlat1.x);
    u_xlat3.xyz = u_xlat11.xyz * u_xlat1.xxx;
    u_xlat11.xyz = float3(input.TANGENT0.yyy) * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat11.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, float3(input.TANGENT0.xxx), u_xlat11.xyz);
    u_xlat0.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati0 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, float3(input.TANGENT0.zzz), u_xlat11.xyz);
    u_xlat33 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat33 = max(u_xlat33, 0.00100000005);
    u_xlat33 = rsqrt(u_xlat33);
    u_xlat0.xyz = float3(u_xlat33) * u_xlat0.xyz;
    u_xlat33 = float(input.TANGENT0.w) * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat1.xzw = u_xlat0.yzx * u_xlat3.zxy;
    u_xlat1.xzw = fma(u_xlat3.yzx, u_xlat0.zxy, (-u_xlat1.xzw));
    u_xlat1.xzw = float3(u_xlat33) * u_xlat1.xzw;
    u_xlat33 = dot(u_xlat1.xzw, u_xlat1.xzw);
    u_xlat33 = max(u_xlat33, 0.00100000005);
    u_xlat33 = rsqrt(u_xlat33);
    u_xlat1.xzw = float3(u_xlat33) * u_xlat1.xzw;
    u_xlat4.xy = u_xlat2.xz + (-VGlobals._VT_TerrainInfo.zw);
    u_xlat4.xy = u_xlat4.xy * VGlobals._VT_TerrainInfo.yy;
    u_xlat4.xy = clamp(u_xlat4.xy, 0.0f, 1.0f);
    u_xlat33 = float(_VT_IndexTex.sample(sampler_VT_IndexTex, u_xlat4.xy, level(0.0)).x);
    u_xlat33 = fma(u_xlat33, 255.0, 0.5);
    u_xlatu33 = uint(u_xlat33);
    u_xlatu26 = u_xlatu33 & 0x7fu;
    u_xlat5.z = float(u_xlatu26);
    u_xlatu33 = u_xlatu33 >> 0x7u;
    u_xlat33 = float(u_xlatu33);
    u_xlati26.xy = int2(VGlobals._VT_TerrainTileInfo.yz);
    u_xlati26.x = (-u_xlati26.y) + u_xlati26.x;
    u_xlati26.x = 0x1 << u_xlati26.x;
    u_xlat26 = float(u_xlati26.x);
    u_xlat6.xy = float2(int2(VGlobals._VT_RootSize, VGlobals._VT_MaxVTMip));
    u_xlat4.xy = u_xlat4.xy * u_xlat6.xx;
    u_xlat6.xz = u_xlat4.xy / float2(u_xlat26);
    u_xlat6.xz = floor(u_xlat6.xz);
    u_xlat4.xy = fma((-u_xlat6.xz), float2(u_xlat26), u_xlat4.xy);
    u_xlat5.xy = u_xlat4.xy / float2(u_xlat26);
    u_xlat5.xy = clamp(u_xlat5.xy, 0.0f, 1.0f);
    u_xlat33 = min(u_xlat33, u_xlat6.y);
    u_xlat33 = float(_VT_WorldYTex.sample(vt_linear_clamp_sampler, u_xlat5.xy, round(u_xlat5.z), level(u_xlat33)).x);
    u_xlat4.x = (-VGlobals._VT_TerrainHeightInfo.x) + VGlobals._VT_TerrainHeightInfo.y;
    u_xlat33 = fma(u_xlat33, u_xlat4.x, VGlobals._VT_TerrainHeightInfo.x);
    u_xlat33 = u_xlat33 + VGlobals._VT_TerrainHeightInfo.w;
    u_xlat33 = (-u_xlat2.y) + u_xlat33;
    u_xlat33 = u_xlat33 + float(VGlobals._DECAL_PROJECT_OFFSET);
    u_xlat12 = u_xlat1.y * VGlobals._TERRAIN_VT_HEIGHT_SCALE;
    u_xlat33 = fma(u_xlat33, VGlobals._TERRAIN_VT_HEIGHT_SCALE, u_xlat12);
    u_xlat4.xz = u_xlat2.xz;
    u_xlat4.y = u_xlat33 + u_xlat2.y;
    u_xlat5 = u_xlat4.yyyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat5 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat4.xxxx, u_xlat5);
    u_xlat5 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat4.zzzz, u_xlat5);
    u_xlat5 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3], u_xlat2.wwww, u_xlat5);
    u_xlatb33 = 0.5<VGlobals.gPlanarShadowEnabled;
    if(u_xlatb33){
        u_xlat33 = (-u_xlat4.y) + VGlobals.gPlanarShadowParams.x;
        u_xlat33 = u_xlat33 / float(VGlobals.gLightBuffer[11].y);
        u_xlat6.xyz = fma(float3(VGlobals.gLightBuffer[11].xyz), float3(u_xlat33), u_xlat4.xyz);
        u_xlat7.xyz = u_xlat6.yyy * VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[1].xyw;
        u_xlat6.xyw = fma(VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[0].xyw, u_xlat6.xxx, u_xlat7.xyz);
        u_xlat6.xyz = fma(VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[2].xyw, u_xlat6.zzz, u_xlat6.xyw);
        u_xlat6.xyz = u_xlat6.xyz + VGlobals.hlslcc_mtx4x4PlanarStaticShadow_ProjectViewMat[3].xyw;
        u_xlat16_8.xyz = half3(u_xlat6.xyz * float3(0.5, 0.5, 0.5));
        u_xlat16_9.x = u_xlat16_8.z + u_xlat16_8.x;
        u_xlat16_9.y = half(fma(float(u_xlat16_8.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_8.z)));
        u_xlat33 = u_xlat4.y + 100.0;
        u_xlat33 = u_xlat33 / VGlobals.gPlanarShadowParams.y;
        u_xlat33 = u_xlat33 + VGlobals._PlanarShadowDepthBias;
        output.TEXCOORD14.z = u_xlat6.z * u_xlat33;
        output.TEXCOORD14.xy = float2(u_xlat16_9.xy);
        output.TEXCOORD14.w = u_xlat6.z;
    } else {
        u_xlat4.w = 1.0;
        output.TEXCOORD14.x = dot(VGlobals.gShadowParams0[0], u_xlat4);
        output.TEXCOORD14.y = dot(VGlobals.gShadowParams0[1], u_xlat4);
        output.TEXCOORD14.z = dot(VGlobals.gShadowParams0[2], u_xlat4);
        output.TEXCOORD14.w = dot(VGlobals.gShadowParams0[3], u_xlat4);
    }
    u_xlat16_8.xyz = half3(u_xlat5.xyw * float3(0.5, 0.5, 0.5));
    u_xlat16_9.x = u_xlat16_8.z + u_xlat16_8.x;
    u_xlat16_9.y = half(fma(float(u_xlat16_8.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_8.z)));
    u_xlat33 = u_xlat4.y * UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[1].z;
    u_xlat33 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[0].z, u_xlat4.x, u_xlat33);
    u_xlat33 = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[2].z, u_xlat4.z, u_xlat33);
    u_xlat33 = u_xlat33 + UnityPerFrame.hlslcc_mtx4x4unity_MatrixV[3].z;
    output.TEXCOORD9.z = (-u_xlat33);
    u_xlat3.w = 1.0;
    u_xlat16_8.x = half(dot(float4(VGlobals.gLightBuffer[0]), u_xlat3));
    u_xlat16_8.y = half(dot(float4(VGlobals.gLightBuffer[1]), u_xlat3));
    u_xlat16_8.z = half(dot(float4(VGlobals.gLightBuffer[2]), u_xlat3));
    u_xlat16_6 = half4(u_xlat3.yzzx * u_xlat3.xyzz);
    u_xlat16_10.x = dot(VGlobals.gLightBuffer[3], u_xlat16_6);
    u_xlat16_10.y = dot(VGlobals.gLightBuffer[4], u_xlat16_6);
    u_xlat16_10.z = dot(VGlobals.gLightBuffer[5], u_xlat16_6);
    u_xlat16_41 = half(u_xlat3.y * u_xlat3.y);
    u_xlat16_41 = half(fma(u_xlat3.x, u_xlat3.x, (-float(u_xlat16_41))));
    u_xlat16_10.xyz = fma(VGlobals.gLightBuffer[6].xyz, half3(u_xlat16_41), u_xlat16_10.xyz);
    u_xlat16_8.xyz = u_xlat16_8.xyz + u_xlat16_10.xyz;
    u_xlat16_8.xyz = u_xlat16_8.xyz * VGlobals.gLightBuffer[7].www;
    u_xlat16_8.xyz = max(u_xlat16_8.xyz, half3(0.0, 0.0, 0.0));
    output.mtl_Position = u_xlat5;
    output.TEXCOORD0.xyz = u_xlat4.xyz;
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.xyz = u_xlat2.xyz;
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    output.TEXCOORD3.xyz = half3(u_xlat0.xyz);
    output.TEXCOORD3.w = input.TEXCOORD1.x;
    output.TEXCOORD4.xyz = half3(u_xlat1.xzw);
    output.TEXCOORD4.w = input.TEXCOORD1.y;
    output.TEXCOORD5.xyz = half3(u_xlat3.xyz);
    output.TEXCOORD9.xy = float2(u_xlat16_9.xy);
    output.TEXCOORD9.w = u_xlat5.w;
    output.TEXCOORD8.xyz = float3(u_xlat16_8.xyz);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
