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
    half4 _MainTex_ST ;
    half4 _MainTex_TexelSize ;
    half4 _TintColorHDR ;
    half4 _RoughnessScale ;
    half _OpacityMaskClipValue ;
    half _MipScale ;
    half _VertexOcclusionIntensity ;
    half4 _HueVariation ;
    half4 _SnowColor ;
    half _SnowLevel ;
    half _SnowNoise ;
    half _SnowNoiseInvert ;
    half _SnowIntensity ;
    half _SnowWetness ;
    half _SnowOcclusion ;
    half _ShowSnowDirectly ;
    float _ShadowAmount ;
    half4 gLightBuffer [115];
    float4 gShadowParams0 [6];
    half gShadowmapFuncEnabled ;
    half gShadowEnableDynamicShadow ;
    half _WeatherSplitOn ;
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

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    half3 TEXCOORD5 [[ user(TEXCOORD5) ]] ;
    half TEXCOORD9 [[ user(TEXCOORD9) ]] ;
    half4 TEXCOORD7 [[ user(TEXCOORD7) ]] ;
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]] ;
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]] ;
    half4 TEXCOORD20 [[ user(TEXCOORD20) ]] ;
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
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_NormalTex [[ sampler (1) ]],
    sampler samplerCloudTex [[ sampler (2) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(1) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(2) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(3) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(4) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_linear_clamp_compare_sampler(compare_func::greater_equal,filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float3 u_xlat0;
    half3 u_xlat16_0;
    half3 u_xlat16_1;
    float3 u_xlat2;
    half4 u_xlat16_2;
    bool2 u_xlatb2;
    half4 u_xlat16_3;
    half3 u_xlat16_4;
    float4 u_xlat5;
    half3 u_xlat16_5;
    half4 u_xlat16_6;
    bool2 u_xlatb8;
    half u_xlat16_9;
    half3 u_xlat16_12;
    half u_xlat16_13;
    half3 u_xlat16_16;
    bool u_xlatb20;
    half2 u_xlat16_21;
    half u_xlat16_22;
    float u_xlat27;
    half u_xlat16_27;
    half u_xlat10_27;
    bool u_xlatb27;
    float u_xlat28;
    half u_xlat16_28;
    half u_xlat10_28;
    bool u_xlatb28;
    half u_xlat16_30;
    half u_xlat16_31;
    u_xlat16_0.x = dot(input.TEXCOORD3.xyz, input.TEXCOORD3.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * input.TEXCOORD3.xyz;
    u_xlat16_27 = dot(input.TEXCOORD4.xyz, input.TEXCOORD4.xyz);
    u_xlat16_27 = max(u_xlat16_27, half(0.00100000005));
    u_xlat16_27 = rsqrt(u_xlat16_27);
    u_xlat16_1.xyz = half3(u_xlat16_27) * input.TEXCOORD4.xyz;
    u_xlat2.x = input.TEXCOORD0.w;
    u_xlat2.y = input.TEXCOORD1.w;
    u_xlat16_3.xy = half2(fma(u_xlat2.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw)));
    u_xlat16_2 = _MainTex.sample(sampler_MainTex, float2(u_xlat16_3.xy));
    u_xlat16_4.xyz = (-u_xlat16_2.xyz) + FGlobals._HueVariation.xyz;
    u_xlat16_4.xyz = fma(input.TEXCOORD9, u_xlat16_4.xyz, u_xlat16_2.xyz);
    u_xlat16_21.x = max(u_xlat16_2.z, u_xlat16_2.y);
    u_xlat16_21.x = max(u_xlat16_2.x, u_xlat16_21.x);
    u_xlat16_30 = max(u_xlat16_4.z, u_xlat16_4.y);
    u_xlat16_30 = max(u_xlat16_30, u_xlat16_4.x);
    u_xlat16_21.x = u_xlat16_21.x / u_xlat16_30;
    u_xlat16_21.x = fma(u_xlat16_21.x, half(0.5), half(0.5));
    u_xlat16_4.xyz = u_xlat16_21.xxx * u_xlat16_4.xyz;
    u_xlat16_4.xyz = clamp(u_xlat16_4.xyz, 0.0h, 1.0h);
    u_xlat16_5.xyz = u_xlat16_4.xyz * FGlobals._TintColorHDR.xyz;
    u_xlat16_21.xy = u_xlat16_3.xy * FGlobals._MainTex_TexelSize.zw;
    u_xlat16_6.xy = dfdx(u_xlat16_21.xy);
    u_xlat16_21.xy = dfdy(u_xlat16_21.xy);
    u_xlat16_31 = dot(u_xlat16_6.xy, u_xlat16_6.xy);
    u_xlat16_21.x = dot(u_xlat16_21.xy, u_xlat16_21.xy);
    u_xlat16_21.x = max(u_xlat16_21.x, u_xlat16_31);
    u_xlat16_21.x = log2(u_xlat16_21.x);
    u_xlat16_21.x = u_xlat16_21.x * half(0.5);
    u_xlat16_21.x = max(u_xlat16_21.x, half(0.0));
    u_xlat16_21.x = fma(u_xlat16_21.x, FGlobals._MipScale, half(1.0));
    u_xlat27 = float(u_xlat16_2.w) * float(u_xlat16_21.x);
    u_xlat16_28 = fma(u_xlat16_2.w, u_xlat16_21.x, (-FGlobals._OpacityMaskClipValue));
    u_xlat2.x = dfdx(u_xlat27);
    u_xlat27 = dfdy(u_xlat27);
    u_xlat27 = abs(u_xlat27) + abs(u_xlat2.x);
    u_xlat27 = max(u_xlat27, 9.99999975e-05);
    u_xlat27 = float(u_xlat16_28) / u_xlat27;
    u_xlat27 = u_xlat27 + 0.5;
    u_xlat16_2 = _NormalTex.sample(sampler_NormalTex, float2(u_xlat16_3.xy));
    u_xlat16_3.x = u_xlat16_2.z + u_xlat16_2.z;
    u_xlat16_6.xy = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_6.z = (-u_xlat16_6.y);
    u_xlat16_12.x = dot(u_xlat16_6.xz, u_xlat16_6.xz);
    u_xlat16_12.x = min(u_xlat16_12.x, half(1.0));
    u_xlat16_12.x = (-u_xlat16_12.x) + half(1.0);
    u_xlat16_6.w = sqrt(u_xlat16_12.x);
    u_xlatb28 = half(0.0)!=FGlobals._WeatherSplitOn;
    u_xlatb2.x = input.TEXCOORD20.z<input.TEXCOORD20.w;
    u_xlat16_12.yz = input.TEXCOORD20.zw * half2(0.5, 1.0);
    u_xlat16_31 = fma((-input.TEXCOORD20.z), half(0.5), half(1.0));
    u_xlat16_12.x = (u_xlatb2.x) ? input.TEXCOORD20.y : u_xlat16_31;
    u_xlat16_12.x = dot(FGlobals._RoughnessScale.xyz, u_xlat16_12.xyz);
    u_xlatb2.x = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_16.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_21.x = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_16.x = (u_xlatb2.x) ? FGlobals.gLightBuffer[8].x : u_xlat16_21.x;
    u_xlat16_12.y = dot(FGlobals._RoughnessScale.xyz, u_xlat16_16.xyz);
    u_xlat16_12.xy = u_xlat16_2.zz * u_xlat16_12.xy;
    u_xlat16_12.x = (u_xlatb28) ? u_xlat16_12.x : u_xlat16_12.y;
    u_xlat16_21.x = input.TEXCOORD5.y + (-FGlobals._SnowLevel);
    u_xlat16_21.x = u_xlat16_21.x / FGlobals._SnowWetness;
    u_xlat16_21.x = clamp(u_xlat16_21.x, 0.0h, 1.0h);
    u_xlat16_30 = u_xlat16_2.z + FGlobals._SnowNoiseInvert;
    u_xlat16_3.x = fma((-u_xlat16_3.x), FGlobals._SnowNoiseInvert, u_xlat16_30);
    u_xlat16_3.x = log2(u_xlat16_3.x);
    u_xlat16_3.x = u_xlat16_3.x * FGlobals._SnowNoise;
    u_xlat16_3.x = exp2(u_xlat16_3.x);
    u_xlat16_3.x = u_xlat16_3.x * FGlobals._SnowIntensity;
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_21.x;
    u_xlat16_21.x = log2(input.TEXCOORD2.w);
    u_xlat16_21.x = u_xlat16_21.x * FGlobals._SnowOcclusion;
    u_xlat16_21.x = exp2(u_xlat16_21.x);
    u_xlat16_3.x = u_xlat16_21.x * u_xlat16_3.x;
    u_xlat16_3.x = clamp(u_xlat16_3.x, 0.0h, 1.0h);
    u_xlatb2.x = FGlobals._ShowSnowDirectly<half(1.0);
    u_xlat16_21.x = u_xlat16_3.x * input.TEXCOORD20.w;
    u_xlat16_30 = u_xlat16_3.x * FGlobals.gLightBuffer[8].z;
    u_xlat16_21.x = (u_xlatb28) ? u_xlat16_21.x : u_xlat16_30;
    u_xlat16_3.x = (u_xlatb2.x) ? u_xlat16_21.x : u_xlat16_3.x;
    u_xlat16_21.x = (-u_xlat16_3.x) + half(1.0);
    u_xlat16_21.x = fma(FGlobals._RoughnessScale.w, u_xlat16_3.x, u_xlat16_21.x);
    u_xlat16_12.x = u_xlat16_21.x * u_xlat16_12.x;
    u_xlat16_4.xyz = fma((-u_xlat16_4.xyz), FGlobals._TintColorHDR.xyz, FGlobals._SnowColor.xyz);
    u_xlat16_3.xzw = fma(u_xlat16_3.xxx, u_xlat16_4.xyz, u_xlat16_5.xyz);
    u_xlat16_12.x = max(u_xlat16_12.x, half(0.119999997));
    u_xlat16_12.x = min(u_xlat16_12.x, half(1.0));
    u_xlat16_4.x = half(u_xlat27 + (-float(FGlobals._OpacityMaskClipValue)));
    u_xlatb27 = u_xlat16_4.x<half(0.0);
    if(((int(u_xlatb27) * int(0xffffffffu)))!=0){discard_fragment();}
    u_xlatb27 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb27){
        u_xlat2.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat27 = min(u_xlat2.z, 0.999000013);
        u_xlat27 = u_xlat27 + FGlobals.gShadowParams0[4].z;
        u_xlat27 = (-u_xlat27) + 1.0;
        u_xlat10_28 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat2.xy, saturate(u_xlat27), level(0.0)));
        u_xlatb8.xy = (float2(1.0, 1.0)<u_xlat2.xy);
        u_xlatb20 = u_xlatb8.y || u_xlatb8.x;
        u_xlatb8.xy = (u_xlat2.xy<float2(0.0, 0.0));
        u_xlatb8.x = u_xlatb8.y || u_xlatb8.x;
        u_xlatb20 = u_xlatb20 || u_xlatb8.x;
        u_xlat16_4.x = (u_xlatb20) ? half(1.0) : half(0.0);
        u_xlat16_4.x = half(max(float(u_xlat10_28), float(u_xlat16_4.x)));
        u_xlatb28 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb28){
            u_xlat2.xy = fma(u_xlat2.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_27 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat2.xy, saturate(u_xlat27), level(0.0)));
            u_xlatb8.xy = (float2(1.0, 1.0)<u_xlat2.xy);
            u_xlatb28 = u_xlatb8.y || u_xlatb8.x;
            u_xlatb2.xy = (u_xlat2.xy<float2(0.0, 0.0));
            u_xlatb2.x = u_xlatb2.y || u_xlatb2.x;
            u_xlatb28 = u_xlatb28 || u_xlatb2.x;
            u_xlat16_13 = (u_xlatb28) ? half(1.0) : half(0.0);
            u_xlat16_13 = half(max(float(u_xlat10_27), float(u_xlat16_13)));
            u_xlat16_4.x = min(u_xlat16_4.x, u_xlat16_13);
        }
        u_xlatb27 = input.TEXCOORD0.y<-30.0;
        u_xlat16_4.x = (u_xlatb27) ? half(1.0) : u_xlat16_4.x;
    } else {
        u_xlat16_4.x = half(1.0);
    }
    u_xlat5 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat5 = fma(u_xlat5, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat5 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat5);
    u_xlat16_27 = CloudTex.sample(samplerCloudTex, u_xlat5.xy).y;
    u_xlat16_28 = CloudTex.sample(samplerCloudTex, u_xlat5.zw).w;
    u_xlat16_13 = u_xlat16_28 * half(0.5);
    u_xlat16_13 = fma(u_xlat16_27, half(0.5), u_xlat16_13);
    u_xlat16_27 = fma((-u_xlat16_13), u_xlat16_13, u_xlat16_13);
    u_xlat28 = fma((-float(u_xlat16_13)), float(u_xlat16_13), FGlobals.CloudParam.y);
    u_xlat16_27 = half(1.0) / u_xlat16_27;
    u_xlat27 = float(u_xlat16_27) * u_xlat28;
    u_xlat27 = clamp(u_xlat27, 0.0f, 1.0f);
    u_xlat28 = fma(u_xlat27, -2.0, 3.0);
    u_xlat27 = u_xlat27 * u_xlat27;
    u_xlat27 = u_xlat27 * u_xlat28;
    u_xlat27 = fma((-u_xlat27), FGlobals.CloudParam.z, 1.0);
    u_xlat27 = clamp(u_xlat27, 0.0f, 1.0f);
    u_xlatb28 = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_13 = (u_xlatb28) ? half(u_xlat27) : half(1.0);
    u_xlat16_4.x = min(u_xlat16_13, u_xlat16_4.x);
    u_xlat2.xyz = float3(u_xlat16_3.xzw) * input.TEXCOORD8.xyz;
    u_xlat27 = FGlobals._ShadowAmount * FGlobals.gShadowParams0[5].z;
    u_xlat16_13 = dot(u_xlat16_6.xzw, u_xlat16_1.xyz);
    u_xlat16_13 = clamp(u_xlat16_13, 0.0h, 1.0h);
    u_xlat16_22 = dot(u_xlat16_6.xzw, u_xlat16_0.xyz);
    u_xlat16_22 = clamp(u_xlat16_22, 0.0h, 1.0h);
    u_xlat16_0.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_6.xyz = half3(u_xlat16_13) * u_xlat16_0.xyz;
    u_xlat16_13 = fma(u_xlat16_12.x, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_22), u_xlat16_22, half(1.0));
    u_xlat16_12.x = u_xlat16_12.x * u_xlat16_12.x;
    u_xlat16_9 = u_xlat16_12.x * u_xlat16_22;
    u_xlat16_0.x = fma(u_xlat16_9, u_xlat16_9, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_12.x / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_13;
    u_xlat16_0.xyz = fma(u_xlat16_0.xxx, half3(0.0399999991, 0.0399999991, 0.0399999991), u_xlat16_3.xzw);
    u_xlat16_0.xyz = u_xlat16_0.xyz * u_xlat16_6.xyz;
    u_xlat16_1.xyz = fma(u_xlat16_0.xyz, u_xlat16_4.xxx, (-u_xlat16_0.xyz));
    u_xlat0.xyz = fma(float3(u_xlat27), float3(u_xlat16_1.xyz), float3(u_xlat16_0.xyz));
    u_xlat0.xyz = fma(u_xlat2.xyz, float3(FGlobals.gLightBuffer[9].xyz), u_xlat0.xyz);
    u_xlat16_3.xyz = half3(float3(u_xlat16_2.www) * u_xlat0.xyz);
    u_xlat16_30 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_30 = min(u_xlat16_30, half(1.0));
    u_xlat16_4.x = (-u_xlat16_30) + half(1.0);
    u_xlat16_30 = fma(FGlobals._VertexOcclusionIntensity, u_xlat16_4.x, u_xlat16_30);
    u_xlat16_3.xyz = half3(u_xlat16_30) * u_xlat16_3.xyz;
    output.SV_TARGET0.xyz = fma(u_xlat16_3.xyz, input.TEXCOORD7.www, input.TEXCOORD7.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
