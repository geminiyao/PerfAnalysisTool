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
    half4 gLightBuffer [115];
    float4 gShadowParams0 [6];
    half gShadowmapFuncEnabled ;
    half gShadowEnableDynamicShadow ;
    float4 CloudSpeed ;
    float4 CloudParam ;
    float4 CloudOffset ;
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

struct UnityPerMaterial_Type
{
    float4 _AlbedoPack0_TexelSize ;
    half _ChangeSeasonPack0 ;
    float4 _TilingOffset ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    half4 TEXCOORD7 [[ user(TEXCOORD7) ]] ;
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]] ;
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_TARGET0 [[ color(xlt_remap_o[0]) ]];
    float SV_Target1 [[ color(xlt_remap_o[1]) ]];
};

constexpr sampler _mtl_xl_shadow_sampler(address::clamp_to_edge, filter::linear, compare_func::greater_equal);
fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(2) ]],
    sampler samplerCloudTex [[ sampler (0) ]],
    sampler sampler_AlbedoPack0 [[ sampler (1) ]],
    sampler sampler_AlbedoPack1 [[ sampler (2) ]],
    sampler sampler_AlbedoPack2 [[ sampler (3) ]],
    sampler sampler_NormalPack1 [[ sampler (4) ]],
    sampler sampler_NormalPack0 [[ sampler (5) ]],
    sampler sampler_NormalPack2 [[ sampler (6) ]],
    sampler sampler_WeightPack0 [[ sampler (7) ]],
    sampler sampler_WeightPack1 [[ sampler (8) ]],
    sampler sampler_HeightPack0 [[ sampler (9) ]],
    sampler sampler_MipLUT [[ sampler (10) ]],
    texture2d<half, access::sample > _MipLUT [[ texture(0) ]] ,
    texture2d<half, access::sample > _HeightPack0 [[ texture(1) ]] ,
    texture2d<half, access::sample > _WeightPack0 [[ texture(2) ]] ,
    texture2d<half, access::sample > _WeightPack1 [[ texture(3) ]] ,
    texture2d<half, access::sample > _AlbedoPack0 [[ texture(4) ]] ,
    texture2d<half, access::sample > _NormalPack0 [[ texture(5) ]] ,
    texture2d<half, access::sample > _AlbedoPack1 [[ texture(6) ]] ,
    texture2d<half, access::sample > _NormalPack1 [[ texture(7) ]] ,
    texture2d<half, access::sample > _AlbedoPack2 [[ texture(8) ]] ,
    texture2d<half, access::sample > _NormalPack2 [[ texture(9) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(10) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(11) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(12) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_point_clamp_compare_sampler(compare_func::greater_equal,filter::nearest,address::clamp_to_edge);
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float3 u_xlat0;
    half3 u_xlat16_0;
    half3 u_xlat16_1;
    float2 u_xlat2;
    half4 u_xlat16_2;
    float2 u_xlat3;
    half4 u_xlat16_3;
    half2 u_xlat16_4;
    float4 u_xlat5;
    half4 u_xlat16_5;
    float3 u_xlat6;
    half4 u_xlat16_6;
    bool2 u_xlatb6;
    half4 u_xlat16_7;
    half4 u_xlat16_8;
    bool2 u_xlatb8;
    half3 u_xlat16_9;
    half4 u_xlat16_10;
    half2 u_xlat16_11;
    half u_xlat16_12;
    half3 u_xlat16_16;
    half u_xlat16_21;
    float2 u_xlat26;
    float2 u_xlat27;
    half2 u_xlat16_28;
    bool2 u_xlatb30;
    float u_xlat36;
    half u_xlat16_36;
    half u_xlat10_36;
    bool u_xlatb36;
    float u_xlat37;
    half u_xlat16_37;
    half u_xlat10_37;
    bool u_xlatb37;
    half u_xlat16_40;
    bool u_xlatb42;
    u_xlat16_0.x = dot(input.TEXCOORD3.xyz, input.TEXCOORD3.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * input.TEXCOORD3.xyz;
    u_xlat16_36 = dot(input.TEXCOORD4.xyz, input.TEXCOORD4.xyz);
    u_xlat16_36 = max(u_xlat16_36, half(0.00100000005));
    u_xlat16_36 = rsqrt(u_xlat16_36);
    u_xlat16_1.xyz = half3(u_xlat16_36) * input.TEXCOORD4.xyz;
    u_xlat36 = UnityPerMaterial._AlbedoPack0_TexelSize.z * 0.5;
    u_xlat2.x = input.TEXCOORD0.w;
    u_xlat2.y = input.TEXCOORD1.w;
    u_xlat26.xy = u_xlat2.xy * UnityPerMaterial._TilingOffset.xy;
    u_xlat3.xy = float2(u_xlat36) * u_xlat26.xy;
    u_xlat3.xy = u_xlat3.xy * float2(0.0625, 0.0625);
    u_xlat16_37 = _MipLUT.sample(sampler_MipLUT, u_xlat3.xy).w;
    u_xlat16_4.x = u_xlat16_37 * half(4.0);
    u_xlat16_4.x = rint(u_xlat16_4.x);
    u_xlat16_16.x = exp2(u_xlat16_4.x);
    u_xlat16_28.x = half(u_xlat36 / float(u_xlat16_16.x));
    u_xlat36 = float(u_xlat16_16.x) * UnityPerMaterial._AlbedoPack0_TexelSize.x;
    u_xlat3.xy = u_xlat26.xy * float2(u_xlat16_28.xx);
    u_xlat3.xy = floor(u_xlat3.xy);
    u_xlat3.xy = u_xlat3.xy / float2(u_xlat16_28.xx);
    u_xlat3.xy = fma(float2(u_xlat36), float2(0.5, 0.5), u_xlat3.xy);
    u_xlat16_5 = _HeightPack0.sample(sampler_HeightPack0, u_xlat26.xy).wxyz;
    u_xlat16_6 = _WeightPack0.sample(sampler_WeightPack0, u_xlat2.xy).wxyz;
    u_xlat16_2 = _WeightPack1.sample(sampler_WeightPack1, u_xlat2.xy).zxyw;
    u_xlat16_16.xyz = fma(half3(UnityPerMaterial._ChangeSeasonPack0), (-u_xlat16_5.yzw), u_xlat16_5.yzw);
    u_xlat16_16.yz = u_xlat16_16.yz * u_xlat16_6.zw;
    u_xlat16_28.x = u_xlat16_16.z + u_xlat16_16.y;
    u_xlat16_16.y = u_xlat16_28.x + half(0.00100000005);
    u_xlat16_16.x = fma(u_xlat16_6.y, u_xlat16_16.x, u_xlat16_16.y);
    u_xlat16_7.xy = u_xlat16_16.zy / u_xlat16_16.yx;
    u_xlat27.xy = fma(float2(u_xlat16_7.xy), float2(u_xlat36), u_xlat3.xy);
    u_xlat16_7 = _AlbedoPack0.sample(sampler_AlbedoPack0, u_xlat27.xy, level(float(u_xlat16_4.x)));
    u_xlat16_8 = _NormalPack0.sample(sampler_NormalPack0, u_xlat27.xy, level(float(u_xlat16_4.x))).xzwy;
    u_xlat16_28.xy = u_xlat16_2.yz * u_xlat16_8.yz;
    u_xlat16_28.x = u_xlat16_28.y + u_xlat16_28.x;
    u_xlat16_28.x = u_xlat16_28.x + half(0.00100000005);
    u_xlat16_9.x = fma(u_xlat16_6.x, u_xlat16_5.x, u_xlat16_28.x);
    u_xlat16_10.x = u_xlat16_28.y / u_xlat16_28.x;
    u_xlat16_10.y = u_xlat16_28.x / u_xlat16_9.x;
    u_xlat27.xy = fma(float2(u_xlat16_10.xy), float2(u_xlat36), u_xlat3.xy);
    u_xlat16_5 = _AlbedoPack1.sample(sampler_AlbedoPack1, u_xlat27.xy, level(float(u_xlat16_4.x)));
    u_xlat16_10 = _NormalPack1.sample(sampler_NormalPack1, u_xlat27.xy, level(float(u_xlat16_4.x)));
    u_xlat16_28.x = dot(u_xlat16_6.yzwx, half4(1.0, 1.0, 1.0, 1.0));
    u_xlat16_28.x = (-u_xlat16_28.x) + half(1.0);
    u_xlat16_40 = dot(u_xlat16_2.yzxw, half4(1.0, 1.0, 1.0, 1.0));
    u_xlat16_28.x = (-u_xlat16_40) + u_xlat16_28.x;
    u_xlat16_28.x = clamp(u_xlat16_28.x, 0.0h, 1.0h);
    u_xlat16_28.x = u_xlat16_28.x * half(0.5);
    u_xlat16_40 = fma(u_xlat16_2.w, u_xlat16_10.w, u_xlat16_28.x);
    u_xlat16_40 = u_xlat16_40 + half(0.00100000005);
    u_xlat16_21 = fma(u_xlat16_2.x, u_xlat16_10.z, u_xlat16_40);
    u_xlat16_11.x = u_xlat16_28.x / u_xlat16_40;
    u_xlat16_11.y = u_xlat16_40 / u_xlat16_21;
    u_xlat2.xy = fma(float2(u_xlat16_11.xy), float2(u_xlat36), u_xlat3.xy);
    u_xlat16_3 = _AlbedoPack2.sample(sampler_AlbedoPack2, u_xlat2.xy, level(float(u_xlat16_4.x)));
    u_xlat16_2.xy = _NormalPack2.sample(sampler_NormalPack2, u_xlat2.xy, level(float(u_xlat16_4.x))).xy;
    u_xlat16_4.x = u_xlat16_16.x + u_xlat16_9.x;
    u_xlat16_4.x = u_xlat16_21 + u_xlat16_4.x;
    u_xlat16_5 = u_xlat16_9.xxxx * u_xlat16_5;
    u_xlat16_5 = fma(u_xlat16_7, u_xlat16_16.xxxx, u_xlat16_5);
    u_xlat16_3 = fma(u_xlat16_3, half4(u_xlat16_21), u_xlat16_5);
    u_xlat16_3 = u_xlat16_3 / u_xlat16_4.xxxx;
    u_xlat16_28.xy = u_xlat16_9.xx * u_xlat16_10.xy;
    u_xlat16_16.xy = fma(u_xlat16_8.xw, u_xlat16_16.xx, u_xlat16_28.xy);
    u_xlat16_16.xy = fma(u_xlat16_2.xy, half2(u_xlat16_21), u_xlat16_16.xy);
    u_xlat16_4.xy = u_xlat16_16.xy / u_xlat16_4.xx;
    u_xlat16_2.xy = fma(u_xlat16_4.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_2.z = (-u_xlat16_2.y);
    u_xlat16_4.x = dot(u_xlat16_2.xz, u_xlat16_2.xz);
    u_xlat16_4.x = min(u_xlat16_4.x, half(1.0));
    u_xlat16_4.x = (-u_xlat16_4.x) + half(1.0);
    u_xlat16_2.w = sqrt(u_xlat16_4.x);
    u_xlatb36 = u_xlat16_3.w>=half(0.99000001);
    u_xlat16_4.x = u_xlat16_3.w + half(-0.899999976);
    u_xlat16_4.x = u_xlat16_4.x * half(8.88888836);
    u_xlat16_16.xy = (bool(u_xlatb36)) ? half2(0.0, 0.800000012) : half2(1.0, 0.0);
    u_xlat16_4.x = fma(u_xlat16_16.x, u_xlat16_4.x, u_xlat16_16.y);
    u_xlat16_16.x = FGlobals.gLightBuffer[8].y * half(0.5);
    u_xlat16_4.x = (-u_xlat16_3.w) + u_xlat16_4.x;
    u_xlat16_4.x = fma(u_xlat16_16.x, u_xlat16_4.x, u_xlat16_3.w);
    u_xlat16_4.x = max(u_xlat16_4.x, half(0.119999997));
    u_xlat16_4.x = min(u_xlat16_4.x, half(1.0));
    u_xlatb36 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb36){
        u_xlat6.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat36 = min(u_xlat6.z, 0.999000013);
        u_xlat36 = u_xlat36 + FGlobals.gShadowParams0[4].z;
        u_xlat36 = (-u_xlat36) + 1.0;
        u_xlat10_37 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat6.xy, saturate(u_xlat36), level(0.0)));
        u_xlatb30.xy = (float2(1.0, 1.0)<u_xlat6.xy);
        u_xlatb30.x = u_xlatb30.y || u_xlatb30.x;
        u_xlatb8.xy = (u_xlat6.xy<float2(0.0, 0.0));
        u_xlatb42 = u_xlatb8.y || u_xlatb8.x;
        u_xlatb30.x = u_xlatb42 || u_xlatb30.x;
        u_xlat16_16.x = (u_xlatb30.x) ? half(1.0) : half(0.0);
        u_xlat16_16.x = half(max(float(u_xlat10_37), float(u_xlat16_16.x)));
        u_xlatb37 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb37){
            u_xlat6.xy = fma(u_xlat6.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_36 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat6.xy, saturate(u_xlat36), level(0.0)));
            u_xlatb30.xy = (float2(1.0, 1.0)<u_xlat6.xy);
            u_xlatb37 = u_xlatb30.y || u_xlatb30.x;
            u_xlatb6.xy = (u_xlat6.xy<float2(0.0, 0.0));
            u_xlatb6.x = u_xlatb6.y || u_xlatb6.x;
            u_xlatb37 = u_xlatb37 || u_xlatb6.x;
            u_xlat16_28.x = (u_xlatb37) ? half(1.0) : half(0.0);
            u_xlat16_28.x = half(max(float(u_xlat10_36), float(u_xlat16_28.x)));
            u_xlat16_16.x = min(u_xlat16_16.x, u_xlat16_28.x);
        }
        u_xlatb36 = input.TEXCOORD0.y<-30.0;
        u_xlat16_16.x = (u_xlatb36) ? half(1.0) : u_xlat16_16.x;
    } else {
        u_xlat16_16.x = half(1.0);
    }
    u_xlat5 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat5 = fma(u_xlat5, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat5 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat5);
    u_xlat16_36 = CloudTex.sample(samplerCloudTex, u_xlat5.xy).y;
    u_xlat16_37 = CloudTex.sample(samplerCloudTex, u_xlat5.zw).w;
    u_xlat16_28.x = u_xlat16_37 * half(0.5);
    u_xlat16_28.x = fma(u_xlat16_36, half(0.5), u_xlat16_28.x);
    u_xlat16_36 = fma((-u_xlat16_28.x), u_xlat16_28.x, u_xlat16_28.x);
    u_xlat37 = fma((-float(u_xlat16_28.x)), float(u_xlat16_28.x), FGlobals.CloudParam.y);
    u_xlat16_36 = half(1.0) / u_xlat16_36;
    u_xlat36 = float(u_xlat16_36) * u_xlat37;
    u_xlat36 = clamp(u_xlat36, 0.0f, 1.0f);
    u_xlat37 = fma(u_xlat36, -2.0, 3.0);
    u_xlat36 = u_xlat36 * u_xlat36;
    u_xlat36 = u_xlat36 * u_xlat37;
    u_xlat36 = fma((-u_xlat36), FGlobals.CloudParam.z, 1.0);
    u_xlat36 = clamp(u_xlat36, 0.0f, 1.0f);
    u_xlatb37 = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_28.x = (u_xlatb37) ? half(u_xlat36) : half(1.0);
    u_xlat16_16.x = min(u_xlat16_28.x, u_xlat16_16.x);
    u_xlat6.xyz = float3(u_xlat16_3.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_28.x = dot(u_xlat16_2.xzw, u_xlat16_1.xyz);
    u_xlat16_28.x = clamp(u_xlat16_28.x, 0.0h, 1.0h);
    u_xlat16_40 = dot(u_xlat16_2.xzw, u_xlat16_0.xyz);
    u_xlat16_40 = clamp(u_xlat16_40, 0.0h, 1.0h);
    u_xlat16_0.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_9.xyz = u_xlat16_28.xxx * u_xlat16_0.xyz;
    u_xlat16_28.x = fma(u_xlat16_4.x, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_40), u_xlat16_40, half(1.0));
    u_xlat16_4.x = u_xlat16_4.x * u_xlat16_4.x;
    u_xlat16_12 = u_xlat16_4.x * u_xlat16_40;
    u_xlat16_0.x = fma(u_xlat16_12, u_xlat16_12, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_4.x / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_28.x;
    u_xlat16_0.xyz = fma(u_xlat16_0.xxx, half3(0.0399999991, 0.0399999991, 0.0399999991), u_xlat16_3.xyz);
    u_xlat16_0.xyz = u_xlat16_0.xyz * u_xlat16_9.xyz;
    u_xlat16_1.xyz = fma(u_xlat16_0.xyz, u_xlat16_16.xxx, (-u_xlat16_0.xyz));
    u_xlat0.xyz = fma(FGlobals.gShadowParams0[5].zzz, float3(u_xlat16_1.xyz), float3(u_xlat16_0.xyz));
    u_xlat0.xyz = fma(u_xlat6.xyz, float3(FGlobals.gLightBuffer[9].xyz), u_xlat0.xyz);
    output.SV_TARGET0.xyz = half3(fma(u_xlat0.xyz, float3(input.TEXCOORD7.www), float3(input.TEXCOORD7.xyz)));
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
