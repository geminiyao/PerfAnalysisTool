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
    sampler sampler_GlobalNormal [[ sampler (11) ]],
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
    texture2d<half, access::sample > _GlobalNormal [[ texture(10) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(11) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(12) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(13) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_point_clamp_compare_sampler(compare_func::greater_equal,filter::nearest,address::clamp_to_edge);
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float3 u_xlat0;
    half3 u_xlat16_0;
    half3 u_xlat16_1;
    float4 u_xlat2;
    half4 u_xlat16_2;
    bool u_xlatb2;
    half2 u_xlat16_3;
    half4 u_xlat16_4;
    float2 u_xlat5;
    half4 u_xlat16_5;
    half4 u_xlat16_6;
    float3 u_xlat7;
    half4 u_xlat16_7;
    bool2 u_xlatb7;
    half4 u_xlat16_8;
    half4 u_xlat16_9;
    half3 u_xlat16_10;
    half4 u_xlat16_11;
    half2 u_xlat16_12;
    half u_xlat16_13;
    half3 u_xlat16_16;
    half u_xlat16_23;
    float2 u_xlat28;
    half2 u_xlat16_28;
    half2 u_xlat16_29;
    bool2 u_xlatb33;
    float u_xlat39;
    half u_xlat16_39;
    half u_xlat10_39;
    bool u_xlatb39;
    float u_xlat40;
    half u_xlat16_40;
    half u_xlat10_40;
    bool u_xlatb40;
    half u_xlat16_42;
    bool u_xlatb45;
    u_xlat16_0.x = dot(input.TEXCOORD3.xyz, input.TEXCOORD3.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * input.TEXCOORD3.xyz;
    u_xlat16_39 = dot(input.TEXCOORD4.xyz, input.TEXCOORD4.xyz);
    u_xlat16_39 = max(u_xlat16_39, half(0.00100000005));
    u_xlat16_39 = rsqrt(u_xlat16_39);
    u_xlat16_1.xyz = half3(u_xlat16_39) * input.TEXCOORD4.xyz;
    u_xlat39 = UnityPerMaterial._AlbedoPack0_TexelSize.z * 0.5;
    u_xlatb40 = input.TEXCOORD0.w>=0.25;
    u_xlatb2 = input.TEXCOORD0.w<0.75;
    u_xlatb40 = u_xlatb40 && u_xlatb2;
    u_xlatb2 = input.TEXCOORD1.w>=0.25;
    u_xlatb40 = u_xlatb40 && u_xlatb2;
    u_xlatb2 = input.TEXCOORD1.w<0.75;
    u_xlatb40 = u_xlatb40 && u_xlatb2;
    u_xlat16_3.x = half(input.TEXCOORD0.w + -0.25);
    u_xlat16_16.x = half(input.TEXCOORD1.w + -0.25);
    u_xlat16_16.x = u_xlat16_16.x + u_xlat16_16.x;
    u_xlat16_29.x = half(fma(input.TEXCOORD0.w, 0.5, 0.5));
    u_xlat16_4.x = (u_xlatb40) ? u_xlat16_3.x : u_xlat16_29.x;
    u_xlat16_4.y = (u_xlatb40) ? u_xlat16_16.x : half(input.TEXCOORD1.w);
    u_xlat2.x = input.TEXCOORD0.w;
    u_xlat2.y = input.TEXCOORD1.w;
    u_xlat28.xy = u_xlat2.xy * UnityPerMaterial._TilingOffset.xy;
    u_xlat5.xy = float2(u_xlat39) * u_xlat28.xy;
    u_xlat5.xy = u_xlat5.xy * float2(0.0625, 0.0625);
    u_xlat16_40 = _MipLUT.sample(sampler_MipLUT, u_xlat5.xy).w;
    u_xlat16_3.x = u_xlat16_40 * half(4.0);
    u_xlat16_3.x = rint(u_xlat16_3.x);
    u_xlat16_16.x = exp2(u_xlat16_3.x);
    u_xlat16_29.x = half(u_xlat39 / float(u_xlat16_16.x));
    u_xlat39 = float(u_xlat16_16.x) * UnityPerMaterial._AlbedoPack0_TexelSize.x;
    u_xlat5.xy = u_xlat28.xy * float2(u_xlat16_29.xx);
    u_xlat5.xy = floor(u_xlat5.xy);
    u_xlat5.xy = u_xlat5.xy / float2(u_xlat16_29.xx);
    u_xlat5.xy = fma(float2(u_xlat39), float2(0.5, 0.5), u_xlat5.xy);
    u_xlat16_6 = _HeightPack0.sample(sampler_HeightPack0, u_xlat28.xy).wxyz;
    u_xlat16_7 = _WeightPack0.sample(sampler_WeightPack0, float2(u_xlat16_4.xy)).wxyz;
    u_xlat16_4 = _WeightPack1.sample(sampler_WeightPack1, float2(u_xlat16_4.xy)).zxyw;
    u_xlat16_16.xyz = fma(half3(UnityPerMaterial._ChangeSeasonPack0), (-u_xlat16_6.yzw), u_xlat16_6.yzw);
    u_xlat16_16.yz = u_xlat16_16.yz * u_xlat16_7.zw;
    u_xlat16_29.x = u_xlat16_16.z + u_xlat16_16.y;
    u_xlat16_16.y = u_xlat16_29.x + half(0.00100000005);
    u_xlat16_16.x = fma(u_xlat16_7.y, u_xlat16_16.x, u_xlat16_16.y);
    u_xlat16_8.xy = u_xlat16_16.zy / u_xlat16_16.yx;
    u_xlat28.xy = fma(float2(u_xlat16_8.xy), float2(u_xlat39), u_xlat5.xy);
    u_xlat16_8 = _AlbedoPack0.sample(sampler_AlbedoPack0, u_xlat28.xy, level(float(u_xlat16_3.x)));
    u_xlat16_9 = _NormalPack0.sample(sampler_NormalPack0, u_xlat28.xy, level(float(u_xlat16_3.x))).xzwy;
    u_xlat16_29.xy = u_xlat16_4.yz * u_xlat16_9.yz;
    u_xlat16_29.x = u_xlat16_29.y + u_xlat16_29.x;
    u_xlat16_29.x = u_xlat16_29.x + half(0.00100000005);
    u_xlat16_10.x = fma(u_xlat16_7.x, u_xlat16_6.x, u_xlat16_29.x);
    u_xlat16_11.x = u_xlat16_29.y / u_xlat16_29.x;
    u_xlat16_11.y = u_xlat16_29.x / u_xlat16_10.x;
    u_xlat28.xy = fma(float2(u_xlat16_11.xy), float2(u_xlat39), u_xlat5.xy);
    u_xlat16_6 = _AlbedoPack1.sample(sampler_AlbedoPack1, u_xlat28.xy, level(float(u_xlat16_3.x)));
    u_xlat16_11 = _NormalPack1.sample(sampler_NormalPack1, u_xlat28.xy, level(float(u_xlat16_3.x)));
    u_xlat16_29.x = dot(u_xlat16_7.yzwx, half4(1.0, 1.0, 1.0, 1.0));
    u_xlat16_29.x = (-u_xlat16_29.x) + half(1.0);
    u_xlat16_42 = dot(u_xlat16_4.yzxw, half4(1.0, 1.0, 1.0, 1.0));
    u_xlat16_29.x = (-u_xlat16_42) + u_xlat16_29.x;
    u_xlat16_29.x = clamp(u_xlat16_29.x, 0.0h, 1.0h);
    u_xlat16_29.x = u_xlat16_29.x * half(0.5);
    u_xlat16_42 = fma(u_xlat16_4.w, u_xlat16_11.w, u_xlat16_29.x);
    u_xlat16_42 = u_xlat16_42 + half(0.00100000005);
    u_xlat16_23 = fma(u_xlat16_4.x, u_xlat16_11.z, u_xlat16_42);
    u_xlat16_12.x = u_xlat16_29.x / u_xlat16_42;
    u_xlat16_12.y = u_xlat16_42 / u_xlat16_23;
    u_xlat28.xy = fma(float2(u_xlat16_12.xy), float2(u_xlat39), u_xlat5.xy);
    u_xlat16_4 = _AlbedoPack2.sample(sampler_AlbedoPack2, u_xlat28.xy, level(float(u_xlat16_3.x)));
    u_xlat16_28.xy = _NormalPack2.sample(sampler_NormalPack2, u_xlat28.xy, level(float(u_xlat16_3.x))).xy;
    u_xlat16_3.x = u_xlat16_16.x + u_xlat16_10.x;
    u_xlat16_3.x = u_xlat16_23 + u_xlat16_3.x;
    u_xlat16_5 = u_xlat16_10.xxxx * u_xlat16_6;
    u_xlat16_5 = fma(u_xlat16_8, u_xlat16_16.xxxx, u_xlat16_5);
    u_xlat16_4 = fma(u_xlat16_4, half4(u_xlat16_23), u_xlat16_5);
    u_xlat16_4 = u_xlat16_4 / u_xlat16_3.xxxx;
    u_xlat16_29.xy = u_xlat16_10.xx * u_xlat16_11.xy;
    u_xlat16_16.xy = fma(u_xlat16_9.xw, u_xlat16_16.xx, u_xlat16_29.xy);
    u_xlat16_16.xy = fma(u_xlat16_28.xy, half2(u_xlat16_23), u_xlat16_16.xy);
    u_xlat16_3.xy = u_xlat16_16.xy / u_xlat16_3.xx;
    u_xlat16_2.xy = _GlobalNormal.sample(sampler_GlobalNormal, u_xlat2.xy).xy;
    u_xlat16_29.xy = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_3.xy = fma(u_xlat16_3.xy, half2(2.0, 2.0), u_xlat16_29.xy);
    u_xlat16_2.xy = u_xlat16_3.xy + half2(-1.0, -1.0);
    u_xlat16_2.z = (-u_xlat16_2.y);
    u_xlat16_3.x = dot(u_xlat16_2.xz, u_xlat16_2.xz);
    u_xlat16_3.x = min(u_xlat16_3.x, half(1.0));
    u_xlat16_3.x = (-u_xlat16_3.x) + half(1.0);
    u_xlat16_2.w = sqrt(u_xlat16_3.x);
    u_xlat16_39 = dot(u_xlat16_2.xzw, u_xlat16_2.xzw);
    u_xlat16_39 = max(u_xlat16_39, half(0.00100000005));
    u_xlat16_39 = rsqrt(u_xlat16_39);
    u_xlat16_6.xyz = half3(u_xlat16_39) * u_xlat16_2.xzw;
    u_xlatb39 = u_xlat16_4.w>=half(0.99000001);
    u_xlat16_3.x = u_xlat16_4.w + half(-0.899999976);
    u_xlat16_3.x = u_xlat16_3.x * half(8.88888836);
    u_xlat16_16.xy = (bool(u_xlatb39)) ? half2(0.0, 0.800000012) : half2(1.0, 0.0);
    u_xlat16_3.x = fma(u_xlat16_16.x, u_xlat16_3.x, u_xlat16_16.y);
    u_xlat16_16.x = FGlobals.gLightBuffer[8].y * half(0.5);
    u_xlat16_3.x = (-u_xlat16_4.w) + u_xlat16_3.x;
    u_xlat16_3.x = fma(u_xlat16_16.x, u_xlat16_3.x, u_xlat16_4.w);
    u_xlat16_3.x = max(u_xlat16_3.x, half(0.119999997));
    u_xlat16_3.x = min(u_xlat16_3.x, half(1.0));
    u_xlatb39 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb39){
        u_xlat7.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat39 = min(u_xlat7.z, 0.999000013);
        u_xlat39 = u_xlat39 + FGlobals.gShadowParams0[4].z;
        u_xlat39 = (-u_xlat39) + 1.0;
        u_xlat10_40 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat7.xy, saturate(u_xlat39), level(0.0)));
        u_xlatb33.xy = (float2(1.0, 1.0)<u_xlat7.xy);
        u_xlatb45 = u_xlatb33.y || u_xlatb33.x;
        u_xlatb33.xy = (u_xlat7.xy<float2(0.0, 0.0));
        u_xlatb33.x = u_xlatb33.y || u_xlatb33.x;
        u_xlatb45 = u_xlatb45 || u_xlatb33.x;
        u_xlat16_16.x = (u_xlatb45) ? half(1.0) : half(0.0);
        u_xlat16_16.x = half(max(float(u_xlat10_40), float(u_xlat16_16.x)));
        u_xlatb40 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb40){
            u_xlat7.xy = fma(u_xlat7.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_39 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat7.xy, saturate(u_xlat39), level(0.0)));
            u_xlatb33.xy = (float2(1.0, 1.0)<u_xlat7.xy);
            u_xlatb40 = u_xlatb33.y || u_xlatb33.x;
            u_xlatb7.xy = (u_xlat7.xy<float2(0.0, 0.0));
            u_xlatb45 = u_xlatb7.y || u_xlatb7.x;
            u_xlatb40 = u_xlatb40 || u_xlatb45;
            u_xlat16_29.x = (u_xlatb40) ? half(1.0) : half(0.0);
            u_xlat16_29.x = half(max(float(u_xlat10_39), float(u_xlat16_29.x)));
            u_xlat16_16.x = min(u_xlat16_16.x, u_xlat16_29.x);
        }
        u_xlatb39 = input.TEXCOORD0.y<-30.0;
        u_xlat16_16.x = (u_xlatb39) ? half(1.0) : u_xlat16_16.x;
    } else {
        u_xlat16_16.x = half(1.0);
    }
    u_xlat2 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat2 = fma(u_xlat2, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat2 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat2);
    u_xlat16_39 = CloudTex.sample(samplerCloudTex, u_xlat2.xy).y;
    u_xlat16_40 = CloudTex.sample(samplerCloudTex, u_xlat2.zw).w;
    u_xlat16_29.x = u_xlat16_40 * half(0.5);
    u_xlat16_29.x = fma(u_xlat16_39, half(0.5), u_xlat16_29.x);
    u_xlat16_39 = fma((-u_xlat16_29.x), u_xlat16_29.x, u_xlat16_29.x);
    u_xlat40 = fma((-float(u_xlat16_29.x)), float(u_xlat16_29.x), FGlobals.CloudParam.y);
    u_xlat16_39 = half(1.0) / u_xlat16_39;
    u_xlat39 = float(u_xlat16_39) * u_xlat40;
    u_xlat39 = clamp(u_xlat39, 0.0f, 1.0f);
    u_xlat40 = fma(u_xlat39, -2.0, 3.0);
    u_xlat39 = u_xlat39 * u_xlat39;
    u_xlat39 = u_xlat39 * u_xlat40;
    u_xlat39 = fma((-u_xlat39), FGlobals.CloudParam.z, 1.0);
    u_xlat39 = clamp(u_xlat39, 0.0f, 1.0f);
    u_xlatb40 = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_29.x = (u_xlatb40) ? half(u_xlat39) : half(1.0);
    u_xlat16_16.x = min(u_xlat16_29.x, u_xlat16_16.x);
    u_xlat7.xyz = float3(u_xlat16_4.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_29.x = dot(u_xlat16_6.xyz, u_xlat16_1.xyz);
    u_xlat16_29.x = clamp(u_xlat16_29.x, 0.0h, 1.0h);
    u_xlat16_42 = dot(u_xlat16_6.xyz, u_xlat16_0.xyz);
    u_xlat16_42 = clamp(u_xlat16_42, 0.0h, 1.0h);
    u_xlat16_0.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_10.xyz = u_xlat16_29.xxx * u_xlat16_0.xyz;
    u_xlat16_29.x = fma(u_xlat16_3.x, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_42), u_xlat16_42, half(1.0));
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_3.x;
    u_xlat16_13 = u_xlat16_3.x * u_xlat16_42;
    u_xlat16_0.x = fma(u_xlat16_13, u_xlat16_13, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_3.x / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_29.x;
    u_xlat16_0.xyz = fma(u_xlat16_0.xxx, half3(0.0399999991, 0.0399999991, 0.0399999991), u_xlat16_4.xyz);
    u_xlat16_0.xyz = u_xlat16_0.xyz * u_xlat16_10.xyz;
    u_xlat16_1.xyz = fma(u_xlat16_0.xyz, u_xlat16_16.xxx, (-u_xlat16_0.xyz));
    u_xlat0.xyz = fma(FGlobals.gShadowParams0[5].zzz, float3(u_xlat16_1.xyz), float3(u_xlat16_0.xyz));
    u_xlat0.xyz = fma(u_xlat7.xyz, float3(FGlobals.gLightBuffer[9].xyz), u_xlat0.xyz);
    output.SV_TARGET0.xyz = half3(fma(u_xlat0.xyz, float3(input.TEXCOORD7.www), float3(input.TEXCOORD7.xyz)));
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
