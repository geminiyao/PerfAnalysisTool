#include <metal_stdlib>
#include <metal_texture>
using namespace metal;

#if !(__HAVE_FMA__)
#define fma(a,b,c) ((a) * (b) + (c))
#endif

#ifndef XLT_REMAP_O
	#define XLT_REMAP_O {0, 1, 2, 3, 4, 5, 6, 7}
#endif
constexpr constant uint xlt_remap_o[] = XLT_REMAP_O;
struct FGlobals_Type
{
    float4 _VT_TerrainHeightInfo ;
    half4 gLightBuffer [116];
};

struct UnityPerDraw_Type
{
    float4 hlslcc_mtx4x4unity_ObjectToWorld [4];
    float4 hlslcc_mtx4x4unity_WorldToObject [4];
    float4 unity_LODFade ;
    float4 unity_WorldTransformParams ;
    float4 unity_RenderingLayer ;
};

struct UnityPerMaterial_Type
{
    float4 _AlbedoPack0_TexelSize ;
    half _ChangeSeasonPack0 ;
    float4 _TilingOffset ;
};

struct Mtl_FragmentIn
{
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float3 NORMAL0 [[ user(NORMAL0) ]] ;
    float4 TANGENT0 [[ user(TANGENT0) ]] ;
    float3 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
};

struct Mtl_FragmentOut
{
    float4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
    float4 SV_Target1 [[ color(xlt_remap_o[1]) ]];
    float4 SV_Target2 [[ color(xlt_remap_o[2]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    constant UnityPerDraw_Type& UnityPerDraw [[ buffer(1) ]],
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(2) ]],
    texture2d<half, access::sample > _AlbedoPack0 [[ texture(0) ]] ,
    texture2d<half, access::sample > _AlbedoPack1 [[ texture(1) ]] ,
    texture2d<half, access::sample > _AlbedoPack2 [[ texture(2) ]] ,
    texture2d<half, access::sample > _NormalPack1 [[ texture(3) ]] ,
    texture2d<half, access::sample > _NormalPack0 [[ texture(4) ]] ,
    texture2d<half, access::sample > _NormalPack2 [[ texture(5) ]] ,
    texture2d<half, access::sample > _WeightPack0 [[ texture(6) ]] ,
    texture2d<half, access::sample > _WeightPack1 [[ texture(7) ]] ,
    texture2d<half, access::sample > _HeightPack0 [[ texture(8) ]] ,
    texture2d<half, access::sample > _MipLUT [[ texture(9) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler tex_linear_repeat_sampler(filter::linear,mip_filter::nearest,address::repeat);
    constexpr sampler tex_linear_clamp_sampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float2 u_xlat0;
    half4 u_xlat16_0;
    half4 u_xlat10_0;
    bool2 u_xlatb0;
    float4 u_xlat1;
    half4 u_xlat16_1;
    half4 u_xlat10_1;
    half2 u_xlat16_2;
    half4 u_xlat10_2;
    float2 u_xlat3;
    half4 u_xlat16_3;
    half4 u_xlat10_3;
    half3 u_xlat16_4;
    half2 u_xlat16_5;
    half4 u_xlat10_5;
    half2 u_xlat16_6;
    half4 u_xlat16_7;
    half4 u_xlat10_7;
    float3 u_xlat8;
    bool u_xlatb8;
    half2 u_xlat16_9;
    float3 u_xlat10;
    float3 u_xlat11;
    float u_xlat12;
    half3 u_xlat16_16;
    half2 u_xlat16_18;
    float u_xlat20;
    float2 u_xlat24;
    half u_xlat10_24;
    bool2 u_xlatb24;
    half u_xlat16_28;
    half u_xlat16_29;
    half u_xlat16_40;
    float u_xlat44;
    u_xlatb0.xy = (input.TEXCOORD0.xy>=float2(0.25, 0.25));
    u_xlatb24.xy = (input.TEXCOORD0.xy<float2(0.75, 0.75));
    u_xlatb0.x = u_xlatb24.x && u_xlatb0.x;
    u_xlatb0.x = u_xlatb0.y && u_xlatb0.x;
    u_xlatb0.x = u_xlatb24.y && u_xlatb0.x;
    u_xlat1 = fma(input.TEXCOORD0.xyxy, float4(1.0, 2.0, 0.5, 1.0), float4(-0.25, -0.5, 0.5, 0.0));
    u_xlat16_2.xy = (u_xlatb0.x) ? half2(u_xlat1.xy) : half2(u_xlat1.zw);
    u_xlat10_0 = half4(_WeightPack0.sample(tex_linear_clamp_sampler, float2(u_xlat16_2.xy)).wxyz);
    u_xlat10_1 = half4(_WeightPack1.sample(tex_linear_clamp_sampler, float2(u_xlat16_2.xy)).zxyw);
    u_xlat3.xy = input.TEXCOORD0.xy * UnityPerMaterial._TilingOffset.xy;
    u_xlat10_2 = half4(_HeightPack0.sample(tex_linear_repeat_sampler, u_xlat3.xy).wxyz);
    u_xlat16_4.xyz = half3(fma(float3(UnityPerMaterial._ChangeSeasonPack0), (-float3(u_xlat10_2.yzw)), float3(u_xlat10_2.yzw)));
    u_xlat16_4.yz = half2(float2(u_xlat10_0.zw) * float2(u_xlat16_4.yz));
    u_xlat16_16.x = u_xlat16_4.z + u_xlat16_4.y;
    u_xlat16_4.y = u_xlat16_16.x + half(0.00100000005);
    u_xlat16_4.x = half(fma(float(u_xlat10_0.y), float(u_xlat16_4.x), float(u_xlat16_4.y)));
    u_xlat16_40 = half(dot(float4(u_xlat10_0.yzwx), float4(1.0, 1.0, 1.0, 1.0)));
    u_xlat16_40 = (-u_xlat16_40) + half(1.0);
    u_xlat16_5.xy = u_xlat16_4.zy / u_xlat16_4.yx;
    u_xlat12 = UnityPerMaterial._AlbedoPack0_TexelSize.z * 0.5;
    u_xlat24.xy = float2(u_xlat12) * u_xlat3.xy;
    u_xlat24.xy = u_xlat24.xy * float2(0.0625, 0.0625);
    u_xlat10_24 = half(_MipLUT.sample(tex_linear_repeat_sampler, u_xlat24.xy).w);
    u_xlat16_16.x = half(float(u_xlat10_24) * 4.0);
    u_xlat16_16.x = rint(u_xlat16_16.x);
    u_xlat16_28 = exp2(u_xlat16_16.x);
    u_xlat16_29 = half(u_xlat12 / float(u_xlat16_28));
    u_xlat12 = float(u_xlat16_28) * UnityPerMaterial._AlbedoPack0_TexelSize.x;
    u_xlat24.xy = u_xlat3.xy * float2(u_xlat16_29);
    u_xlat24.xy = floor(u_xlat24.xy);
    u_xlat24.xy = u_xlat24.xy / float2(u_xlat16_29);
    u_xlat24.xy = fma(float2(u_xlat12), float2(0.5, 0.5), u_xlat24.xy);
    u_xlat3.xy = fma(float2(u_xlat16_5.xy), float2(u_xlat12), u_xlat24.xy);
    u_xlat10_5 = half4(_NormalPack0.sample(tex_linear_repeat_sampler, u_xlat3.xy, level(float(u_xlat16_16.x))).xzwy);
    u_xlat10_3 = half4(_AlbedoPack0.sample(tex_linear_repeat_sampler, u_xlat3.xy, level(float(u_xlat16_16.x))));
    u_xlat16_6.xy = half2(float2(u_xlat10_1.yz) * float2(u_xlat10_5.yz));
    u_xlat16_28 = u_xlat16_6.y + u_xlat16_6.x;
    u_xlat16_28 = u_xlat16_28 + half(0.00100000005);
    u_xlat16_6.x = half(fma(float(u_xlat10_0.x), float(u_xlat10_2.x), float(u_xlat16_28)));
    u_xlat16_7.y = u_xlat16_28 / u_xlat16_6.x;
    u_xlat16_7.x = u_xlat16_6.y / u_xlat16_28;
    u_xlat8.xy = fma(float2(u_xlat16_7.xy), float2(u_xlat12), u_xlat24.xy);
    u_xlat10_2 = half4(_NormalPack1.sample(tex_linear_repeat_sampler, u_xlat8.xy, level(float(u_xlat16_16.x))));
    u_xlat10_7 = half4(_AlbedoPack1.sample(tex_linear_repeat_sampler, u_xlat8.xy, level(float(u_xlat16_16.x))));
    u_xlat16_7 = half4(float4(u_xlat16_6.xxxx) * float4(u_xlat10_7));
    u_xlat16_3 = half4(fma(float4(u_xlat10_3), float4(u_xlat16_4.xxxx), float4(u_xlat16_7)));
    u_xlat16_28 = half(dot(float4(u_xlat10_1.yzxw), float4(1.0, 1.0, 1.0, 1.0)));
    u_xlat16_28 = (-u_xlat16_28) + u_xlat16_40;
    u_xlat16_28 = clamp(u_xlat16_28, 0.0h, 1.0h);
    u_xlat16_28 = u_xlat16_28 * half(0.5);
    u_xlat16_40 = half(fma(float(u_xlat10_1.w), float(u_xlat10_2.w), float(u_xlat16_28)));
    u_xlat16_40 = u_xlat16_40 + half(0.00100000005);
    u_xlat16_9.x = u_xlat16_28 / u_xlat16_40;
    u_xlat16_28 = half(fma(float(u_xlat10_1.x), float(u_xlat10_2.z), float(u_xlat16_40)));
    u_xlat16_18.xy = half2(float2(u_xlat16_6.xx) * float2(u_xlat10_2.xy));
    u_xlat16_6.x = u_xlat16_4.x + u_xlat16_6.x;
    u_xlat16_18.xy = half2(fma(float2(u_xlat10_5.xw), float2(u_xlat16_4.xx), float2(u_xlat16_18.xy)));
    u_xlat16_4.x = u_xlat16_28 + u_xlat16_6.x;
    u_xlat16_9.y = u_xlat16_40 / u_xlat16_28;
    u_xlat0.xy = fma(float2(u_xlat16_9.xy), float2(u_xlat12), u_xlat24.xy);
    u_xlat10_1 = half4(_AlbedoPack2.sample(tex_linear_repeat_sampler, u_xlat0.xy, level(float(u_xlat16_16.x))));
    u_xlat10_0.xy = half2(_NormalPack2.sample(tex_linear_repeat_sampler, u_xlat0.xy, level(float(u_xlat16_16.x))).xy);
    u_xlat16_16.xz = half2(fma(float2(u_xlat10_0.xy), float2(u_xlat16_28), float2(u_xlat16_18.xy)));
    u_xlat16_0 = half4(fma(float4(u_xlat10_1), float4(u_xlat16_28), float4(u_xlat16_3)));
    u_xlat16_0 = u_xlat16_0 / u_xlat16_4.xxxx;
    u_xlat16_4.xy = u_xlat16_16.xz / u_xlat16_4.xx;
    u_xlat16_1.yz = fma(u_xlat16_4.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    output.SV_Target0.xyz = float3(u_xlat16_0.xyz);
    output.SV_Target0.w = 1.0;
    u_xlat16_4.x = u_xlat16_0.w + half(-0.899999976);
    u_xlat16_4.x = u_xlat16_4.x * half(8.88888836);
    u_xlatb8 = u_xlat16_0.w>=half(0.99000001);
    u_xlat16_16.xy = (bool(u_xlatb8)) ? half2(0.0, 0.800000012) : half2(1.0, 0.0);
    u_xlat16_4.x = fma(u_xlat16_16.x, u_xlat16_4.x, u_xlat16_16.y);
    u_xlat16_4.x = (-u_xlat16_0.w) + u_xlat16_4.x;
    u_xlat16_16.x = FGlobals.gLightBuffer[8].y * half(0.5);
    u_xlat16_4.x = fma(u_xlat16_16.x, u_xlat16_4.x, u_xlat16_0.w);
    output.SV_Target1.z = float(u_xlat16_4.x);
    u_xlat16_1.xw = (-u_xlat16_1.zz);
    u_xlat16_4.x = dot(u_xlat16_1.yw, u_xlat16_1.yw);
    u_xlat16_4.x = min(u_xlat16_4.x, half(1.0));
    u_xlat16_4.x = (-u_xlat16_4.x) + half(1.0);
    u_xlat16_4.x = sqrt(u_xlat16_4.x);
    u_xlat8.x = dot(input.NORMAL0.xyz, UnityPerDraw.hlslcc_mtx4x4unity_WorldToObject[0].xyz);
    u_xlat8.y = dot(input.NORMAL0.xyz, UnityPerDraw.hlslcc_mtx4x4unity_WorldToObject[1].xyz);
    u_xlat8.z = dot(input.NORMAL0.xyz, UnityPerDraw.hlslcc_mtx4x4unity_WorldToObject[2].xyz);
    u_xlat44 = dot(u_xlat8.xyz, u_xlat8.xyz);
    u_xlat44 = rsqrt(u_xlat44);
    u_xlat8.xyz = float3(u_xlat44) * u_xlat8.xyz;
    u_xlat10.xyz = input.TANGENT0.yyy * UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[1].xyz;
    u_xlat10.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[0].xyz, input.TANGENT0.xxx, u_xlat10.xyz);
    u_xlat10.xyz = fma(UnityPerDraw.hlslcc_mtx4x4unity_ObjectToWorld[2].xyz, input.TANGENT0.zzz, u_xlat10.xyz);
    u_xlat44 = dot(u_xlat10.xyz, u_xlat10.xyz);
    u_xlat44 = rsqrt(u_xlat44);
    u_xlat10.xyz = float3(u_xlat44) * u_xlat10.xyz;
    u_xlat11.xyz = u_xlat8.zxy * u_xlat10.yzx;
    u_xlat11.xyz = fma(u_xlat8.yzx, u_xlat10.zxy, (-u_xlat11.xyz));
    u_xlat44 = input.TANGENT0.w * UnityPerDraw.unity_WorldTransformParams.w;
    u_xlat11.xyz = float3(u_xlat44) * u_xlat11.xyz;
    u_xlat11.xyz = float3(u_xlat16_1.xxx) * u_xlat11.xyz;
    u_xlat10.xyz = fma(u_xlat10.xyz, float3(u_xlat16_1.yyy), u_xlat11.xyz);
    u_xlat8.xyz = fma(u_xlat8.xyz, float3(u_xlat16_4.xxx), u_xlat10.xyz);
    u_xlat44 = dot(u_xlat8.xyz, u_xlat8.xyz);
    u_xlat44 = max(u_xlat44, 0.00100000005);
    u_xlat44 = rsqrt(u_xlat44);
    u_xlat8.xyz = float3(u_xlat44) * u_xlat8.xyz;
    u_xlat20 = abs(u_xlat8.y) + abs(u_xlat8.x);
    u_xlat20 = abs(u_xlat8.z) + u_xlat20;
    u_xlat8.xy = u_xlat8.xz / float2(u_xlat20);
    u_xlat10.x = u_xlat8.y + u_xlat8.x;
    u_xlat10.y = (-u_xlat8.y) + u_xlat8.x;
    output.SV_Target1.xy = fma(u_xlat10.xy, float2(0.5, 0.5), float2(0.5, 0.5));
    output.SV_Target1.w = 0.0;
    u_xlat8.x = (-FGlobals._VT_TerrainHeightInfo.x) + FGlobals._VT_TerrainHeightInfo.y;
    u_xlat8.x = max(u_xlat8.x, 0.00999999978);
    u_xlat20 = input.TEXCOORD1.y + (-FGlobals._VT_TerrainHeightInfo.x);
    output.SV_Target2.x = u_xlat20 / u_xlat8.x;
    output.SV_Target2.x = clamp(output.SV_Target2.x, 0.0f, 1.0f);
    output.SV_Target2.yzw = float3(0.0, 0.0, 1.0);
    return output;
}
