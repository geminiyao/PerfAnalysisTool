#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

struct VGlobals_Type
{
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    half4 gLightBuffer [116];
    int _VT_RootSize ;
    int _VT_MaxVTMip ;
    float _TERRAIN_VT_HEIGHT_SCALE ;
    float4 _VT_TerrainTileInfo ;
    float4 _VT_TerrainInfo ;
    float4 _VT_TerrainHeightInfo ;
    float4 gPlanarShadowParams ;
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
    half4 TEXCOORD0 [[ attribute(1) ]] ;
    half4 COLOR0 [[ attribute(2) ]] ;
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
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(1) ]],
    constant UnityInstancing_PerDraw0_Type& UnityInstancing_PerDraw0 [[ buffer(2) ]],
    sampler sampler_VT_IndexTex [[ sampler (0) ]],
    texture2d<half, access::sample > _VT_IndexTex [[ texture(0) ]] ,
    texture2d_array<half, access::sample > _VT_WorldYTex [[ texture(1) ]] ,
    uint mtl_InstanceID [[ instance_id ]],
    Mtl_VertexIn input [[ stage_in ]])
{
    Mtl_VertexOut output;
    constexpr sampler vt_linear_clamp_sampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 u_xlat0;
    int2 u_xlati0;
    uint u_xlatu0;
    float4 u_xlat1;
    float3 u_xlat2;
    float3 u_xlat3;
    uint u_xlatu3;
    float u_xlat4;
    uint u_xlatu4;
    float u_xlat6;
    int u_xlati6;
    float u_xlat9;
    u_xlati0.xy = int2(VGlobals._VT_TerrainTileInfo.yz);
    u_xlati0.x = (-u_xlati0.y) + u_xlati0.x;
    u_xlati0.x = 0x1 << u_xlati0.x;
    u_xlat0.x = float(u_xlati0.x);
    u_xlat3.x = float(VGlobals._VT_RootSize);
    u_xlati6 = int(mtl_InstanceID) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlati6 = u_xlati6 << 0x3;
    u_xlat1.xyz = input.POSITION0.yyy * UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati6 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[1].xyz;
    u_xlat1.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati6 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[0].xyz, input.POSITION0.xxx, u_xlat1.xyz);
    u_xlat1.xyz = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati6 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[2].xyz, input.POSITION0.zzz, u_xlat1.xyz);
    u_xlat1.xzw = fma(UnityInstancing_PerDraw0.unity_Builtins0Array[u_xlati6 / 8].hlslcc_mtx4x4unity_ObjectToWorldArray[3].xyz, input.POSITION0.www, u_xlat1.xyz);
    u_xlat6 = u_xlat1.y * VGlobals._TERRAIN_VT_HEIGHT_SCALE;
    u_xlat2.xy = u_xlat1.xw + (-VGlobals._VT_TerrainInfo.zw);
    u_xlat2.xy = u_xlat2.xy * VGlobals._VT_TerrainInfo.yy;
    u_xlat2.xy = clamp(u_xlat2.xy, 0.0f, 1.0f);
    u_xlat3.xz = u_xlat3.xx * u_xlat2.xy;
    u_xlat4 = float(_VT_IndexTex.sample(sampler_VT_IndexTex, u_xlat2.xy, level(0.0)).x);
    u_xlat4 = fma(u_xlat4, 255.0, 0.5);
    u_xlatu4 = uint(u_xlat4);
    u_xlat2.xy = u_xlat3.xz / u_xlat0.xx;
    u_xlat2.xy = floor(u_xlat2.xy);
    u_xlat3.xz = fma((-u_xlat2.xy), u_xlat0.xx, u_xlat3.xz);
    u_xlat2.xy = u_xlat3.xz / u_xlat0.xx;
    u_xlat2.xy = clamp(u_xlat2.xy, 0.0f, 1.0f);
    u_xlatu0 = u_xlatu4 >> 0x7u;
    u_xlatu3 = u_xlatu4 & 0x7fu;
    u_xlat2.z = float(u_xlatu3);
    u_xlat0.x = float(u_xlatu0);
    u_xlat3.x = float(VGlobals._VT_MaxVTMip);
    u_xlat0.x = min(u_xlat3.x, u_xlat0.x);
    u_xlat0.x = float(_VT_WorldYTex.sample(vt_linear_clamp_sampler, u_xlat2.xy, round(u_xlat2.z), level(u_xlat0.x)).x);
    u_xlat3.x = (-VGlobals._VT_TerrainHeightInfo.x) + VGlobals._VT_TerrainHeightInfo.y;
    u_xlat0.x = fma(u_xlat0.x, u_xlat3.x, VGlobals._VT_TerrainHeightInfo.x);
    u_xlat0.x = u_xlat0.x + VGlobals._VT_TerrainHeightInfo.w;
    u_xlat0.x = (-u_xlat1.z) + u_xlat0.x;
    u_xlat0.x = fma(u_xlat0.x, VGlobals._TERRAIN_VT_HEIGHT_SCALE, u_xlat6);
    u_xlat0.y = u_xlat0.x + u_xlat1.z;
    u_xlat9 = (-u_xlat0.y) + VGlobals.gPlanarShadowParams.x;
    u_xlat2.xyz = float3(u_xlat9) * float3(VGlobals.gLightBuffer[11].xyz);
    u_xlat2.xyz = u_xlat2.xyz / float3(VGlobals.gLightBuffer[11].yyy);
    u_xlat0.xz = u_xlat1.xw;
    output.TEXCOORD1.xyz = u_xlat1.xzw;
    u_xlat1.xyz = u_xlat0.xyz + u_xlat2.xyz;
    output.TEXCOORD0.xyz = u_xlat0.xyz;
    u_xlat0 = u_xlat1.yyyy * VGlobals.hlslcc_mtx4x4unity_MatrixVP[1];
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[0], u_xlat1.xxxx, u_xlat0);
    u_xlat0 = fma(VGlobals.hlslcc_mtx4x4unity_MatrixVP[2], u_xlat1.zzzz, u_xlat0);
    output.mtl_Position = u_xlat0 + VGlobals.hlslcc_mtx4x4unity_MatrixVP[3];
    output.TEXCOORD0.w = float(input.TEXCOORD0.x);
    output.TEXCOORD1.w = float(input.TEXCOORD0.y);
    output.TEXCOORD2 = input.COLOR0;
    output.TEXCOORD3 = half4(0.0, 0.0, 0.0, 0.0);
    output.TEXCOORD4 = half4(0.0, 0.0, 0.0, 0.0);
    output.TEXCOORD5.xyz = half3(0.0, 0.0, 0.0);
    output.TEXCOORD8.xyz = float3(0.0, 0.0, 0.0);
    output.SV_InstanceID0 = mtl_InstanceID;
    return output;
}
