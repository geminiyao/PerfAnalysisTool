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
    half _Roughness ;
    half _Specular ;
    half _VertexOcclusionIntensity ;
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

struct UnityDrawCallInfo_Type
{
    int unity_BaseInstanceID ;
    int unity_InstanceCount ;
};

struct ColorPropsArray_Type
{
    float4 _TeamColor ;
    float4 _HighlightColor ;
};

struct UnityInstancing_ColorProps_Type
{
    ColorPropsArray_Type ColorPropsArray [2];
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    half4 TEXCOORD7 [[ user(TEXCOORD7) ]] ;
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]] ;
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]] ;
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]]  [[ flat ]];
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
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(2) ]],
    const constant ColorPropsArray_Type* UnityInstancing_ColorProps [[ buffer(3) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler samplerCloudTex [[ sampler (1) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(1) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(2) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(3) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_linear_clamp_compare_sampler(compare_func::greater_equal,filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float4 u_xlat0;
    half u_xlat16_0;
    int u_xlati0;
    bool2 u_xlatb0;
    half3 u_xlat16_1;
    float3 u_xlat2;
    half3 u_xlat16_2;
    bool2 u_xlatb2;
    half3 u_xlat16_3;
    half3 u_xlat16_4;
    half3 u_xlat16_5;
    float u_xlat6;
    half3 u_xlat16_6;
    bool u_xlatb6;
    half u_xlat16_7;
    bool2 u_xlatb8;
    float u_xlat12;
    half u_xlat10_12;
    half2 u_xlat16_13;
    half u_xlat16_18;
    half u_xlat10_18;
    bool u_xlatb18;
    half u_xlat16_19;
    half u_xlat16_21;
    u_xlati0 = int(input.SV_InstanceID0) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlat16_6.x = dot(input.TEXCOORD3.xyz, input.TEXCOORD3.xyz);
    u_xlat16_6.x = max(u_xlat16_6.x, half(0.00100000005));
    u_xlat16_6.x = rsqrt(u_xlat16_6.x);
    u_xlat16_1.x = u_xlat16_6.x * input.TEXCOORD3.z;
    u_xlat16_1.x = clamp(u_xlat16_1.x, 0.0h, 1.0h);
    u_xlat16_6.x = dot(input.TEXCOORD4.xyz, input.TEXCOORD4.xyz);
    u_xlat16_6.x = max(u_xlat16_6.x, half(0.00100000005));
    u_xlat16_6.x = rsqrt(u_xlat16_6.x);
    u_xlat16_7 = u_xlat16_6.x * input.TEXCOORD4.z;
    u_xlat16_7 = clamp(u_xlat16_7, 0.0h, 1.0h);
    u_xlat2.x = input.TEXCOORD0.w;
    u_xlat2.y = input.TEXCOORD1.w;
    u_xlat16_13.xy = half2(fma(u_xlat2.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw)));
    u_xlat16_6.xyz = _MainTex.sample(sampler_MainTex, float2(u_xlat16_13.xy)).xyz;
    u_xlati0 = u_xlati0 << 0x1;
    u_xlat16_3.xyz = half3(float3(u_xlat16_6.xyz) + UnityInstancing_ColorProps[u_xlati0 / 2]._HighlightColor.xyz);
    u_xlat16_13.x = max(FGlobals._Roughness, half(0.119999997));
    u_xlat16_13.x = min(u_xlat16_13.x, half(1.0));
    u_xlatb0.x = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb0.x){
        u_xlat0.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat12 = min(u_xlat0.z, 0.999000013);
        u_xlat12 = u_xlat12 + FGlobals.gShadowParams0[4].z;
        u_xlat12 = (-u_xlat12) + 1.0;
        u_xlat10_18 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat0.xy, saturate(u_xlat12), level(0.0)));
        u_xlatb2.xy = (float2(1.0, 1.0)<u_xlat0.xy);
        u_xlatb2.x = u_xlatb2.y || u_xlatb2.x;
        u_xlatb8.xy = (u_xlat0.xy<float2(0.0, 0.0));
        u_xlatb8.x = u_xlatb8.y || u_xlatb8.x;
        u_xlatb2.x = u_xlatb8.x || u_xlatb2.x;
        u_xlat16_19 = (u_xlatb2.x) ? half(1.0) : half(0.0);
        u_xlat16_19 = half(max(float(u_xlat10_18), float(u_xlat16_19)));
        u_xlatb18 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb18){
            u_xlat0.xy = fma(u_xlat0.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_12 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat0.xy, saturate(u_xlat12), level(0.0)));
            u_xlatb2.xy = (float2(1.0, 1.0)<u_xlat0.xy);
            u_xlatb18 = u_xlatb2.y || u_xlatb2.x;
            u_xlatb0.xy = (u_xlat0.xy<float2(0.0, 0.0));
            u_xlatb0.x = u_xlatb0.y || u_xlatb0.x;
            u_xlatb0.x = u_xlatb0.x || u_xlatb18;
            u_xlat16_21 = (u_xlatb0.x) ? half(1.0) : half(0.0);
            u_xlat16_21 = half(max(float(u_xlat10_12), float(u_xlat16_21)));
            u_xlat16_19 = min(u_xlat16_19, u_xlat16_21);
        }
        u_xlatb0.x = input.TEXCOORD0.y<-30.0;
        u_xlat16_19 = (u_xlatb0.x) ? half(1.0) : u_xlat16_19;
    } else {
        u_xlat16_19 = half(1.0);
    }
    u_xlat0 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat0 = fma(u_xlat0, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat0 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat0);
    u_xlat16_0 = CloudTex.sample(samplerCloudTex, u_xlat0.xy).y;
    u_xlat16_6.x = CloudTex.sample(samplerCloudTex, u_xlat0.zw).w;
    u_xlat16_21 = u_xlat16_6.x * half(0.5);
    u_xlat16_21 = fma(u_xlat16_0, half(0.5), u_xlat16_21);
    u_xlat16_0 = fma((-u_xlat16_21), u_xlat16_21, u_xlat16_21);
    u_xlat6 = fma((-float(u_xlat16_21)), float(u_xlat16_21), FGlobals.CloudParam.y);
    u_xlat16_0 = half(1.0) / u_xlat16_0;
    u_xlat0.x = float(u_xlat16_0) * u_xlat6;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat6 = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat6;
    u_xlat0.x = fma((-u_xlat0.x), FGlobals.CloudParam.z, 1.0);
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlatb6 = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_21 = (u_xlatb6) ? half(u_xlat0.x) : half(1.0);
    u_xlat16_19 = min(u_xlat16_19, u_xlat16_21);
    u_xlat16_21 = FGlobals._Specular * half(0.0799999982);
    u_xlat0.xyz = float3(u_xlat16_3.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_2.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_4.xyz = half3(u_xlat16_7) * u_xlat16_2.xyz;
    u_xlat16_7 = fma(u_xlat16_13.x, half(0.25), half(0.25));
    u_xlat16_18 = fma((-u_xlat16_1.x), u_xlat16_1.x, half(1.0));
    u_xlat16_13.x = u_xlat16_13.x * u_xlat16_13.x;
    u_xlat16_2.x = u_xlat16_13.x * u_xlat16_1.x;
    u_xlat16_18 = fma(u_xlat16_2.x, u_xlat16_2.x, u_xlat16_18);
    u_xlat16_18 = u_xlat16_13.x / u_xlat16_18;
    u_xlat16_18 = u_xlat16_18 * u_xlat16_18;
    u_xlat16_18 = min(u_xlat16_18, half(128.0));
    u_xlat16_18 = u_xlat16_18 * u_xlat16_7;
    u_xlat16_2.xyz = fma(half3(u_xlat16_21), half3(u_xlat16_18), u_xlat16_3.xyz);
    u_xlat16_2.xyz = u_xlat16_2.xyz * u_xlat16_4.xyz;
    u_xlat16_5.xyz = fma(u_xlat16_2.xyz, half3(u_xlat16_19), (-u_xlat16_2.xyz));
    u_xlat2.xyz = fma(FGlobals.gShadowParams0[5].zzz, float3(u_xlat16_5.xyz), float3(u_xlat16_2.xyz));
    u_xlat0.xyz = fma(u_xlat0.xyz, float3(FGlobals.gLightBuffer[9].xyz), u_xlat2.xyz);
    u_xlat16_1.x = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_1.x = min(u_xlat16_1.x, half(1.0));
    u_xlat16_7 = (-u_xlat16_1.x) + half(1.0);
    u_xlat16_1.x = fma(FGlobals._VertexOcclusionIntensity, u_xlat16_7, u_xlat16_1.x);
    u_xlat16_1.xyz = half3(u_xlat0.xyz * float3(u_xlat16_1.xxx));
    output.SV_TARGET0.xyz = fma(u_xlat16_1.xyz, input.TEXCOORD7.www, input.TEXCOORD7.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
