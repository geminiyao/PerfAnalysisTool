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
    half4 _TintColorHDR ;
    half4 _RoughnessScale ;
    half _VertexOcclusionIntensity ;
    half _TeamColorIntensity ;
    half _TeamMaskScale ;
    half4 _WeaponNoise_ST ;
    half4 _WpemissiveColor ;
    half _WpemissiveIntensity ;
    half _IsWeapon ;
    half _FlowSpeed ;
    half _FlowShappen ;
    half _FlowWeight ;
    half _FlowRotate ;
    half _WpNoiseMin ;
    half _WpNoiseMax ;
    half _WpNoiseIntensity ;
    half4 gLightBuffer [115];
    float4 gShadowParams0 [6];
    half gShadowmapFuncEnabled ;
    half gShadowEnableDynamicShadow ;
    float4 CloudSpeed ;
    float4 CloudParam ;
    float4 CloudOffset ;
    half _SpecCubePower ;
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

struct ColorProps2Array_Type
{
    float4 _Rim ;
    float4 _Reversed2 ;
};

struct UnityInstancing_ColorProps2_Type
{
    ColorProps2Array_Type ColorProps2Array [2];
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    half3 TEXCOORD5 [[ user(TEXCOORD5) ]] ;
    half4 TEXCOORD7 [[ user(TEXCOORD7) ]] ;
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]] ;
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]] ;
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]]  [[ flat ]];
};

struct Mtl_FragmentOut
{
    half4 SV_TARGET0 [[ color(xlt_remap_o[0]) ]];
    float SV_Target1 [[ color(xlt_remap_o[1]) ]];
    float SV_Target2 [[ color(xlt_remap_o[2]) ]];
};

constexpr sampler _mtl_xl_shadow_sampler(address::clamp_to_edge, filter::linear, compare_func::greater_equal);
fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(2) ]],
    const constant ColorPropsArray_Type* UnityInstancing_ColorProps [[ buffer(3) ]],
    const constant ColorProps2Array_Type* UnityInstancing_ColorProps2 [[ buffer(4) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_NormalTex [[ sampler (1) ]],
    sampler sampler_WeaponTex [[ sampler (2) ]],
    sampler sampler_WeaponNoise [[ sampler (3) ]],
    sampler samplerCloudTex [[ sampler (4) ]],
    sampler sampler_2DSpecCube0 [[ sampler (5) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _WeaponTex [[ texture(2) ]] ,
    texture2d<half, access::sample > _WeaponNoise [[ texture(3) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(4) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(5) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(6) ]] ,
    texture2d<half, access::sample > _2DSpecCube0 [[ texture(7) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_linear_clamp_compare_sampler(compare_func::greater_equal,filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float3 u_xlat0;
    half3 u_xlat16_0;
    half u_xlat10_0;
    int u_xlati0;
    bool u_xlatb0;
    float2 u_xlat1;
    half4 u_xlat16_1;
    half4 u_xlat16_2;
    float3 u_xlat3;
    half4 u_xlat16_3;
    half4 u_xlat16_4;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    float4 u_xlat7;
    half3 u_xlat16_7;
    bool2 u_xlatb7;
    float u_xlat8;
    bool2 u_xlatb8;
    half3 u_xlat16_9;
    half3 u_xlat16_10;
    half3 u_xlat16_11;
    float3 u_xlat12;
    half u_xlat16_12;
    bool u_xlatb12;
    float u_xlat13;
    half u_xlat16_16;
    half3 u_xlat16_18;
    float u_xlat25;
    half u_xlat16_28;
    half u_xlat16_30;
    bool2 u_xlatb31;
    half u_xlat16_37;
    float u_xlat39;
    half u_xlat16_39;
    half u_xlat10_39;
    bool u_xlatb39;
    half u_xlat16_40;
    half u_xlat16_41;
    half u_xlat16_42;
    bool u_xlatb43;
    u_xlati0 = int(input.SV_InstanceID0) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat16_2.xy = half2(fma(u_xlat1.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw)));
    u_xlati0 = u_xlati0 << 0x1;
    u_xlat16_3 = _MainTex.sample(sampler_MainTex, float2(u_xlat16_2.xy));
    u_xlat16_2 = _NormalTex.sample(sampler_NormalTex, float2(u_xlat16_2.xy));
    u_xlat16_4.yz = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_4.xw = (-u_xlat16_4.zz);
    u_xlat16_28 = dot(u_xlat16_4.yw, u_xlat16_4.yw);
    u_xlat16_28 = min(u_xlat16_28, half(1.0));
    u_xlat16_28 = (-u_xlat16_28) + half(1.0);
    u_xlat16_28 = sqrt(u_xlat16_28);
    u_xlat16_5.xyz = u_xlat16_3.xyz * FGlobals._TintColorHDR.xyz;
    u_xlat16_40 = (-u_xlat16_3.w) + half(1.0);
    u_xlat16_40 = u_xlat16_40 * FGlobals._TeamMaskScale;
    u_xlat16_40 = min(u_xlat16_40, half(1.0));
    u_xlat16_6.xyz = half3(fma(UnityInstancing_ColorProps[u_xlati0 / 2]._TeamColor.xyz, float3(FGlobals._TeamColorIntensity), float3(-1.0, -1.0, -1.0)));
    u_xlat16_6.xyz = fma(half3(u_xlat16_40), u_xlat16_6.xyz, half3(1.0, 1.0, 1.0));
    u_xlat16_5.xyz = half3(fma(float3(u_xlat16_5.xyz), float3(u_xlat16_6.xyz), UnityInstancing_ColorProps[u_xlati0 / 2]._HighlightColor.xyz));
    u_xlatb12 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_18.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_40 = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_18.x = (u_xlatb12) ? FGlobals.gLightBuffer[8].x : u_xlat16_40;
    u_xlat16_40 = dot(FGlobals._RoughnessScale.xyz, u_xlat16_18.xyz);
    u_xlat16_40 = u_xlat16_2.z * u_xlat16_40;
    u_xlat12.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat25 = dot(u_xlat12.xyz, u_xlat12.xyz);
    u_xlat25 = max(u_xlat25, 0.00100000005);
    u_xlat25 = rsqrt(u_xlat25);
    u_xlat3.xyz = u_xlat12.xyz * float3(u_xlat25);
    u_xlat16_41 = dot(u_xlat3.xyz, float3(input.TEXCOORD5.xyz));
    u_xlat16_41 = (-u_xlat16_41) + half(1.0);
    u_xlat16_41 = clamp(u_xlat16_41, 0.0h, 1.0h);
    u_xlat16_6.x = u_xlat16_41 * u_xlat16_41;
    u_xlat16_41 = u_xlat16_41 * u_xlat16_6.x;
    u_xlat16_41 = half(float(u_xlat16_41) * UnityInstancing_ColorProps2[u_xlati0 / 2]._Rim.w);
    u_xlat16_37 = _WeaponTex.sample(sampler_WeaponTex, u_xlat1.xy).x;
    u_xlat16_6.xy = half2(fma(u_xlat1.xy, float2(FGlobals._WeaponNoise_ST.xy), float2(FGlobals._WeaponNoise_ST.zw)));
    u_xlat16_39 = _WeaponNoise.sample(sampler_WeaponNoise, float2(u_xlat16_6.xy)).x;
    u_xlat7.x = float(FGlobals._FlowRotate) * 3.14159274;
    u_xlat8 = cos(u_xlat7.x);
    u_xlat7.x = sin(u_xlat7.x);
    u_xlat1.xy = u_xlat1.xy + float2(-0.5, -0.5);
    u_xlat7.y = u_xlat8;
    u_xlat1.x = dot(u_xlat1.xy, u_xlat7.xy);
    u_xlat1.x = u_xlat1.x + 0.5;
    u_xlat13 = float(FGlobals._FlowSpeed) * UnityPerCamera._Time.y;
    u_xlat13 = fract(u_xlat13);
    u_xlat16_6.x = half((-u_xlat13) + u_xlat1.x);
    u_xlat16_18.x = half(1.0) / FGlobals._FlowShappen;
    u_xlat16_6.x = u_xlat16_18.x * u_xlat16_6.x;
    u_xlat16_6.x = clamp(u_xlat16_6.x, 0.0h, 1.0h);
    u_xlat16_30 = fma(u_xlat16_6.x, half(-2.0), half(3.0));
    u_xlat16_42 = half(u_xlat13 + float(FGlobals._FlowWeight));
    u_xlat16_42 = half(u_xlat1.x + (-float(u_xlat16_42)));
    u_xlat16_6.y = u_xlat16_18.x * u_xlat16_42;
    u_xlat16_6.y = clamp(u_xlat16_6.y, 0.0h, 1.0h);
    u_xlat16_42 = fma(u_xlat16_6.y, half(-2.0), half(3.0));
    u_xlat16_6.xy = u_xlat16_6.xy * u_xlat16_6.xy;
    u_xlat16_18.x = u_xlat16_6.y * u_xlat16_42;
    u_xlat16_6.x = fma(u_xlat16_30, u_xlat16_6.x, (-u_xlat16_18.x));
    u_xlat16_18.x = (-FGlobals._WpNoiseMin) + FGlobals._WpNoiseMax;
    u_xlat16_18.x = fma(u_xlat16_39, u_xlat16_18.x, FGlobals._WpNoiseMin);
    u_xlat16_30 = FGlobals._WpNoiseIntensity / FGlobals._WpemissiveIntensity;
    u_xlat16_30 = fma(u_xlat16_30, half(10.0), u_xlat16_6.x);
    u_xlat16_18.x = u_xlat16_30 * u_xlat16_18.x;
    u_xlat1.x = UnityPerCamera._Time.y + UnityPerCamera._Time.y;
    u_xlat1.x = sin(u_xlat1.x);
    u_xlat1.x = fma(u_xlat1.x, 0.5, 0.5);
    u_xlat13 = u_xlat1.x * float(u_xlat16_18.x);
    u_xlat16_6.x = max(u_xlat16_6.x, half(0.00100000005));
    u_xlat16_6.x = log2(u_xlat16_6.x);
    u_xlat16_6.x = u_xlat16_6.x * half(2.20000005);
    u_xlat16_6.x = exp2(u_xlat16_6.x);
    u_xlat1.x = fma((-float(u_xlat16_18.x)), u_xlat1.x, 1.0);
    u_xlat1.x = fma(float(u_xlat16_6.x), u_xlat1.x, u_xlat13);
    u_xlat16_6.x = half(float(u_xlat16_37) * u_xlat1.x);
    u_xlat16_6.xyz = u_xlat16_6.xxx * FGlobals._WpemissiveColor.xyz;
    u_xlat16_6.xyz = u_xlat16_6.xyz * half3(FGlobals._WpemissiveIntensity);
    u_xlat16_6.xyz = u_xlat16_6.xyz * half3(FGlobals._IsWeapon);
    u_xlat16_6.xyz = half3(fma(float3(u_xlat16_41), UnityInstancing_ColorProps2[u_xlati0 / 2]._Rim.xyz, float3(u_xlat16_6.xyz)));
    u_xlat16_40 = max(u_xlat16_40, half(0.119999997));
    u_xlat16_40 = min(u_xlat16_40, half(1.0));
    u_xlat16_9.xyz = u_xlat16_4.xxx * input.TEXCOORD4.xyz;
    u_xlat16_9.xyz = fma(input.TEXCOORD3.xyz, u_xlat16_4.yyy, u_xlat16_9.xyz);
    u_xlat16_4.xyz = fma(input.TEXCOORD5.xyz, half3(u_xlat16_28), u_xlat16_9.xyz);
    u_xlat16_0.x = dot(u_xlat16_4.xyz, u_xlat16_4.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_1.xyw = u_xlat16_0.xxx * u_xlat16_4.xyz;
    u_xlatb0 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb0){
        u_xlat7.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat0.x = min(u_xlat7.z, 0.999000013);
        u_xlat0.x = u_xlat0.x + FGlobals.gShadowParams0[4].z;
        u_xlat0.x = (-u_xlat0.x) + 1.0;
        u_xlat10_39 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat7.xy, saturate(u_xlat0.x), level(0.0)));
        u_xlatb31.xy = (float2(1.0, 1.0)<u_xlat7.xy);
        u_xlatb31.x = u_xlatb31.y || u_xlatb31.x;
        u_xlatb8.xy = (u_xlat7.xy<float2(0.0, 0.0));
        u_xlatb43 = u_xlatb8.y || u_xlatb8.x;
        u_xlatb31.x = u_xlatb43 || u_xlatb31.x;
        u_xlat16_4.x = (u_xlatb31.x) ? half(1.0) : half(0.0);
        u_xlat16_4.x = half(max(float(u_xlat10_39), float(u_xlat16_4.x)));
        u_xlatb39 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb39){
            u_xlat7.xy = fma(u_xlat7.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_0 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat7.xy, saturate(u_xlat0.x), level(0.0)));
            u_xlatb31.xy = (float2(1.0, 1.0)<u_xlat7.xy);
            u_xlatb39 = u_xlatb31.y || u_xlatb31.x;
            u_xlatb7.xy = (u_xlat7.xy<float2(0.0, 0.0));
            u_xlatb7.x = u_xlatb7.y || u_xlatb7.x;
            u_xlatb39 = u_xlatb39 || u_xlatb7.x;
            u_xlat16_16 = (u_xlatb39) ? half(1.0) : half(0.0);
            u_xlat16_16 = half(max(float(u_xlat10_0), float(u_xlat16_16)));
            u_xlat16_4.x = min(u_xlat16_4.x, u_xlat16_16);
        }
        u_xlatb0 = input.TEXCOORD0.y<-30.0;
        u_xlat16_4.x = (u_xlatb0) ? half(1.0) : u_xlat16_4.x;
    } else {
        u_xlat16_4.x = half(1.0);
    }
    u_xlat7 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat7 = fma(u_xlat7, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat7 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat7);
    u_xlat16_0.x = CloudTex.sample(samplerCloudTex, u_xlat7.xy).y;
    u_xlat16_39 = CloudTex.sample(samplerCloudTex, u_xlat7.zw).w;
    u_xlat16_16 = u_xlat16_39 * half(0.5);
    u_xlat16_16 = fma(u_xlat16_0.x, half(0.5), u_xlat16_16);
    u_xlat16_0.x = fma((-u_xlat16_16), u_xlat16_16, u_xlat16_16);
    u_xlat39 = fma((-float(u_xlat16_16)), float(u_xlat16_16), FGlobals.CloudParam.y);
    u_xlat16_0.x = half(1.0) / u_xlat16_0.x;
    u_xlat0.x = float(u_xlat16_0.x) * u_xlat39;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat39 = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat39;
    u_xlat0.x = fma((-u_xlat0.x), FGlobals.CloudParam.z, 1.0);
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlatb39 = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_16 = (u_xlatb39) ? half(u_xlat0.x) : half(1.0);
    u_xlat16_4.x = min(u_xlat16_16, u_xlat16_4.x);
    u_xlat16_9.xyz = fma((-u_xlat16_5.xyz), u_xlat16_2.www, u_xlat16_5.xyz);
    u_xlat16_16 = fma((-u_xlat16_2.w), half(0.0399999991), half(0.0399999991));
    u_xlat16_5.xyz = fma(u_xlat16_5.xyz, u_xlat16_2.www, half3(u_xlat16_16));
    u_xlat16_16 = dot(float3(u_xlat16_1.xyw), u_xlat3.xyz);
    u_xlat16_2 = fma(half4(u_xlat16_40), half4(-1.0, -0.0274999999, -0.572000027, 0.0219999999), half4(1.0, 0.0425000004, 1.03999996, -0.0399999991));
    u_xlat16_28 = u_xlat16_2.x * u_xlat16_2.x;
    u_xlat16_41 = u_xlat16_16 * half(-9.27999973);
    u_xlat16_41 = exp2(u_xlat16_41);
    u_xlat16_28 = min(u_xlat16_28, u_xlat16_41);
    u_xlat16_28 = fma(u_xlat16_28, u_xlat16_2.x, u_xlat16_2.y);
    u_xlat16_10.xy = fma(half2(u_xlat16_28), half2(-1.03999996, 1.03999996), u_xlat16_2.zw);
    u_xlat16_28 = u_xlat16_5.y * half(50.0);
    u_xlat16_28 = clamp(u_xlat16_28, 0.0h, 1.0h);
    u_xlat16_28 = u_xlat16_28 * u_xlat16_10.y;
    u_xlat16_5.xyz = fma(u_xlat16_5.xyz, u_xlat16_10.xxx, half3(u_xlat16_28));
    u_xlat16_28 = dot(float3(0.212500006, 0.715399981, 0.0720999986), input.TEXCOORD8.xyz);
    u_xlat16_28 = u_xlat16_28 * FGlobals.gLightBuffer[10].w;
    u_xlat16_28 = clamp(u_xlat16_28, 0.0h, 1.0h);
    u_xlat7.xyz = float3(u_xlat16_9.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_41 = dot((-u_xlat3.xyz), float3(u_xlat16_1.xyw));
    u_xlat16_41 = u_xlat16_41 + u_xlat16_41;
    u_xlat16_10.xyz = half3(fma(float3(u_xlat16_1.xyw), (-float3(u_xlat16_41)), (-u_xlat3.xyz)));
    u_xlat16_0.x = dot(u_xlat16_10.xyz, u_xlat16_10.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_3.xyz = u_xlat16_0.xxx * u_xlat16_10.xyz;
    u_xlat16_41 = fma((-u_xlat16_40), half(0.699999988), half(1.70000005));
    u_xlat16_41 = u_xlat16_40 * u_xlat16_41;
    u_xlat16_41 = u_xlat16_41 * half(6.0);
    u_xlat16_42 = fma(u_xlat16_3.y, half(8.0), half(8.0));
    u_xlat16_42 = sqrt(u_xlat16_42);
    u_xlat16_10.xy = u_xlat16_3.xz / half2(u_xlat16_42);
    u_xlat16_10.xy = u_xlat16_10.xy + half2(0.5, 0.5);
    u_xlat16_3.xyz = _2DSpecCube0.sample(sampler_2DSpecCube0, float2(u_xlat16_10.xy), level(float(u_xlat16_41))).xyz;
    u_xlat16_10.xyz = u_xlat16_3.xyz * half3(FGlobals._SpecCubePower);
    u_xlat16_10.xyz = u_xlat16_5.xyz * u_xlat16_10.xyz;
    u_xlat16_10.xyz = half3(u_xlat16_28) * u_xlat16_10.xyz;
    u_xlat16_10.xyz = u_xlat16_10.xyz * FGlobals.gLightBuffer[10].xyz;
    u_xlat16_10.xyz = half3(fma(u_xlat7.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_10.xyz)));
    u_xlat16_3.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_11.xyz = half3(fma(u_xlat12.xyz, float3(u_xlat25), float3(FGlobals.gLightBuffer[11].xyz)));
    u_xlat16_0.x = dot(u_xlat16_11.xyz, u_xlat16_11.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_7.xyz = u_xlat16_0.xxx * u_xlat16_11.xyz;
    u_xlat16_0.x = dot(u_xlat16_1.xyw, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.0));
    u_xlat16_28 = dot(u_xlat16_1.xyw, u_xlat16_7.xyz);
    u_xlat16_28 = max(u_xlat16_28, half(0.0));
    u_xlatb39 = u_xlat16_16>=half(0.0);
    u_xlat16_16 = (u_xlatb39) ? half(1.0) : half(0.0);
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(u_xlat16_16);
    u_xlat16_16 = fma(u_xlat16_40, half(0.25), half(0.25));
    u_xlat16_39 = fma((-u_xlat16_28), u_xlat16_28, half(1.0));
    u_xlat16_40 = u_xlat16_40 * u_xlat16_40;
    u_xlat16_7.x = u_xlat16_40 * u_xlat16_28;
    u_xlat16_39 = fma(u_xlat16_7.x, u_xlat16_7.x, u_xlat16_39);
    u_xlat16_39 = u_xlat16_40 / u_xlat16_39;
    u_xlat16_39 = u_xlat16_39 * u_xlat16_39;
    u_xlat16_39 = min(u_xlat16_39, half(128.0));
    u_xlat16_39 = u_xlat16_39 * u_xlat16_16;
    u_xlat16_7.xyz = fma(u_xlat16_5.xyz, half3(u_xlat16_39), u_xlat16_9.xyz);
    u_xlat16_7.xyz = u_xlat16_0.xxx * u_xlat16_7.xyz;
    u_xlat16_3.xyz = u_xlat16_3.xyz * u_xlat16_7.xyz;
    u_xlat16_7.xyz = fma(u_xlat16_3.xyz, u_xlat16_4.xxx, (-u_xlat16_3.xyz));
    u_xlat3.xyz = fma(FGlobals.gShadowParams0[5].zzz, float3(u_xlat16_7.xyz), float3(u_xlat16_3.xyz));
    u_xlat3.xyz = u_xlat3.xyz + float3(u_xlat16_10.xyz);
    u_xlat16_10.xyz = half3(fma(u_xlat12.xyz, float3(u_xlat25), float3(FGlobals.gLightBuffer[16].xyz)));
    u_xlat16_0.x = dot(u_xlat16_10.xyz, u_xlat16_10.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * u_xlat16_10.xyz;
    u_xlat16_4.x = dot(u_xlat16_1.xyw, FGlobals.gLightBuffer[16].xyz);
    u_xlat16_4.z = dot(u_xlat16_1.xyw, u_xlat16_0.xyz);
    u_xlat16_4.xz = max(u_xlat16_4.xz, half2(0.0, 0.0));
    u_xlat16_0.x = fma((-u_xlat16_4.z), u_xlat16_4.z, half(1.0));
    u_xlat16_12 = u_xlat16_40 * u_xlat16_4.z;
    u_xlat16_0.x = fma(u_xlat16_12, u_xlat16_12, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_40 / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_16;
    u_xlat16_0.xyz = fma(u_xlat16_5.xyz, u_xlat16_0.xxx, u_xlat16_9.xyz);
    u_xlat16_4.xyz = u_xlat16_4.xxx * u_xlat16_0.xyz;
    u_xlat16_5.xyz = FGlobals.gLightBuffer[17].www * FGlobals.gLightBuffer[17].xyz;
    u_xlat16_0.xyz = u_xlat16_4.xyz * u_xlat16_5.xyz;
    u_xlat0.xyz = fma(float3(u_xlat16_0.xyz), float3(FGlobals.gLightBuffer[8].www), u_xlat3.xyz);
    u_xlat16_4.x = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_4.x = min(u_xlat16_4.x, half(1.0));
    u_xlat16_16 = (-u_xlat16_4.x) + half(1.0);
    u_xlat16_4.x = fma(FGlobals._VertexOcclusionIntensity, u_xlat16_16, u_xlat16_4.x);
    u_xlat16_4.xyz = half3(fma(u_xlat0.xyz, float3(u_xlat16_4.xxx), float3(u_xlat16_6.xyz)));
    output.SV_TARGET0.xyz = fma(u_xlat16_4.xyz, input.TEXCOORD7.www, input.TEXCOORD7.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    output.SV_Target2 = 1.0;
    return output;
}
