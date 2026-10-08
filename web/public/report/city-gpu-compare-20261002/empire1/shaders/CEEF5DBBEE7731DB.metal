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

struct UnityPerMaterial_Type
{
    half4 _MainTex_ST ;
    half4 _TintColorHDR ;
    half4 _RoughnessScale ;
    half _Roughness ;
    half4 _Metallic ;
    half _TextureLodBias ;
    half _VertexOcclusionIntensity ;
    half _AlphaControl ;
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
};

constexpr sampler _mtl_xl_shadow_sampler(address::clamp_to_edge, filter::linear, compare_func::greater_equal);
fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(2) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(3) ]],
    const constant ColorPropsArray_Type* UnityInstancing_ColorProps [[ buffer(4) ]],
    const constant ColorProps2Array_Type* UnityInstancing_ColorProps2 [[ buffer(5) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_NormalTex [[ sampler (1) ]],
    sampler samplerCloudTex [[ sampler (2) ]],
    sampler sampler_2DSpecCube0 [[ sampler (3) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(1) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(2) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(3) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(4) ]] ,
    texture2d<half, access::sample > _2DSpecCube0 [[ texture(5) ]] ,
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
    half4 u_xlat16_3;
    half3 u_xlat16_4;
    half3 u_xlat16_5;
    float3 u_xlat6;
    half3 u_xlat16_6;
    float4 u_xlat7;
    half4 u_xlat16_7;
    half3 u_xlat16_8;
    float3 u_xlat9;
    bool2 u_xlatb9;
    half3 u_xlat16_10;
    half3 u_xlat16_11;
    half3 u_xlat16_12;
    float3 u_xlat13;
    half u_xlat16_13;
    bool u_xlatb13;
    float2 u_xlat14;
    half u_xlat16_14;
    half u_xlat10_14;
    bool2 u_xlatb14;
    half u_xlat16_16;
    half3 u_xlat16_18;
    bool u_xlatb27;
    half u_xlat16_29;
    bool2 u_xlatb35;
    half u_xlat16_39;
    half u_xlat16_42;
    half u_xlat16_43;
    half u_xlat16_44;
    bool u_xlatb45;
    u_xlati0 = int(input.SV_InstanceID0) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat16_2.xy = half2(fma(u_xlat1.xy, float2(UnityPerMaterial._MainTex_ST.xy), float2(UnityPerMaterial._MainTex_ST.zw)));
    u_xlati0 = u_xlati0 << 0x1;
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, float2(u_xlat16_2.xy));
    u_xlat16_2 = _NormalTex.sample(sampler_NormalTex, float2(u_xlat16_2.xy));
    u_xlat16_3.yz = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_3.xw = (-u_xlat16_3.zz);
    u_xlat16_29 = dot(u_xlat16_3.yw, u_xlat16_3.yw);
    u_xlat16_29 = min(u_xlat16_29, half(1.0));
    u_xlat16_29 = (-u_xlat16_29) + half(1.0);
    u_xlat16_29 = sqrt(u_xlat16_29);
    u_xlat16_4.xyz = half3(fma(float3(u_xlat16_1.xyz), float3(UnityPerMaterial._TintColorHDR.xyz), UnityInstancing_ColorProps[u_xlati0 / 2]._HighlightColor.xyz));
    u_xlatb13 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_18.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_42 = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_18.x = (u_xlatb13) ? FGlobals.gLightBuffer[8].x : u_xlat16_42;
    u_xlat16_42 = dot(UnityPerMaterial._RoughnessScale.xyz, u_xlat16_18.xyz);
    u_xlat16_42 = u_xlat16_2.z * u_xlat16_42;
    u_xlat13.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat1.x = dot(u_xlat13.xyz, u_xlat13.xyz);
    u_xlat1.x = max(u_xlat1.x, 0.00100000005);
    u_xlat1.x = rsqrt(u_xlat1.x);
    u_xlat6.xyz = u_xlat13.xyz * u_xlat1.xxx;
    u_xlat16_43 = dot(u_xlat6.xyz, float3(input.TEXCOORD5.xyz));
    u_xlat16_43 = (-u_xlat16_43) + half(1.0);
    u_xlat16_43 = clamp(u_xlat16_43, 0.0h, 1.0h);
    u_xlat16_5.x = u_xlat16_43 * u_xlat16_43;
    u_xlat16_43 = u_xlat16_43 * u_xlat16_5.x;
    u_xlat16_43 = half(float(u_xlat16_43) * UnityInstancing_ColorProps2[u_xlati0 / 2]._Rim.w);
    u_xlat16_5.xyz = half3(float3(u_xlat16_43) * UnityInstancing_ColorProps2[u_xlati0 / 2]._Rim.xyz);
    u_xlat16_42 = max(u_xlat16_42, half(0.119999997));
    u_xlat16_42 = min(u_xlat16_42, half(1.0));
    u_xlat16_7.xyz = u_xlat16_3.xxx * input.TEXCOORD4.xyz;
    u_xlat16_7.xyz = fma(input.TEXCOORD3.xyz, u_xlat16_3.yyy, u_xlat16_7.xyz);
    u_xlat16_3.xyz = fma(input.TEXCOORD5.xyz, half3(u_xlat16_29), u_xlat16_7.xyz);
    u_xlat16_0.x = dot(u_xlat16_3.xyz, u_xlat16_3.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_8.xyz = u_xlat16_0.xxx * u_xlat16_3.xyz;
    u_xlatb0 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb0){
        u_xlat9.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat0.x = min(u_xlat9.z, 0.999000013);
        u_xlat0.x = u_xlat0.x + FGlobals.gShadowParams0[4].z;
        u_xlat0.x = (-u_xlat0.x) + 1.0;
        u_xlat10_14 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat9.xy, saturate(u_xlat0.x), level(0.0)));
        u_xlatb35.xy = (float2(1.0, 1.0)<u_xlat9.xy);
        u_xlatb27 = u_xlatb35.y || u_xlatb35.x;
        u_xlatb35.xy = (u_xlat9.xy<float2(0.0, 0.0));
        u_xlatb45 = u_xlatb35.y || u_xlatb35.x;
        u_xlatb27 = u_xlatb27 || u_xlatb45;
        u_xlat16_3.x = (u_xlatb27) ? half(1.0) : half(0.0);
        u_xlat16_3.x = half(max(float(u_xlat10_14), float(u_xlat16_3.x)));
        u_xlatb14.x = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb14.x){
            u_xlat14.xy = fma(u_xlat9.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_0 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat14.xy, saturate(u_xlat0.x), level(0.0)));
            u_xlatb9.xy = (float2(1.0, 1.0)<u_xlat14.xy);
            u_xlatb45 = u_xlatb9.y || u_xlatb9.x;
            u_xlatb14.xy = (u_xlat14.xy<float2(0.0, 0.0));
            u_xlatb14.x = u_xlatb14.y || u_xlatb14.x;
            u_xlatb14.x = u_xlatb14.x || u_xlatb45;
            u_xlat16_16 = (u_xlatb14.x) ? half(1.0) : half(0.0);
            u_xlat16_16 = half(max(float(u_xlat10_0), float(u_xlat16_16)));
            u_xlat16_3.x = min(u_xlat16_3.x, u_xlat16_16);
        }
        u_xlatb0 = input.TEXCOORD0.y<-30.0;
        u_xlat16_3.x = (u_xlatb0) ? half(1.0) : u_xlat16_3.x;
    } else {
        u_xlat16_3.x = half(1.0);
    }
    u_xlat7 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat7 = fma(u_xlat7, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat7 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat7);
    u_xlat16_0.x = CloudTex.sample(samplerCloudTex, u_xlat7.xy).y;
    u_xlat16_14 = CloudTex.sample(samplerCloudTex, u_xlat7.zw).w;
    u_xlat16_16 = u_xlat16_14 * half(0.5);
    u_xlat16_16 = fma(u_xlat16_0.x, half(0.5), u_xlat16_16);
    u_xlat16_0.x = fma((-u_xlat16_16), u_xlat16_16, u_xlat16_16);
    u_xlat14.x = fma((-float(u_xlat16_16)), float(u_xlat16_16), FGlobals.CloudParam.y);
    u_xlat16_0.x = half(1.0) / u_xlat16_0.x;
    u_xlat0.x = float(u_xlat16_0.x) * u_xlat14.x;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat14.x = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat14.x;
    u_xlat0.x = fma((-u_xlat0.x), FGlobals.CloudParam.z, 1.0);
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlatb14.x = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_16 = (u_xlatb14.x) ? half(u_xlat0.x) : half(1.0);
    u_xlat16_3.x = min(u_xlat16_16, u_xlat16_3.x);
    u_xlat16_10.xyz = fma((-u_xlat16_4.xyz), u_xlat16_2.www, u_xlat16_4.xyz);
    u_xlat16_16 = fma((-u_xlat16_2.w), half(0.0399999991), half(0.0399999991));
    u_xlat16_4.xyz = fma(u_xlat16_4.xyz, u_xlat16_2.www, half3(u_xlat16_16));
    u_xlat16_16 = dot(float3(u_xlat16_8.xyz), u_xlat6.xyz);
    u_xlat16_7 = fma(half4(u_xlat16_42), half4(-1.0, -0.0274999999, -0.572000027, 0.0219999999), half4(1.0, 0.0425000004, 1.03999996, -0.0399999991));
    u_xlat16_29 = u_xlat16_7.x * u_xlat16_7.x;
    u_xlat16_43 = u_xlat16_16 * half(-9.27999973);
    u_xlat16_43 = exp2(u_xlat16_43);
    u_xlat16_29 = min(u_xlat16_29, u_xlat16_43);
    u_xlat16_29 = fma(u_xlat16_29, u_xlat16_7.x, u_xlat16_7.y);
    u_xlat16_11.xy = fma(half2(u_xlat16_29), half2(-1.03999996, 1.03999996), u_xlat16_7.zw);
    u_xlat16_29 = u_xlat16_4.y * half(50.0);
    u_xlat16_29 = clamp(u_xlat16_29, 0.0h, 1.0h);
    u_xlat16_29 = u_xlat16_29 * u_xlat16_11.y;
    u_xlat16_4.xyz = fma(u_xlat16_4.xyz, u_xlat16_11.xxx, half3(u_xlat16_29));
    u_xlat16_29 = dot(float3(0.212500006, 0.715399981, 0.0720999986), input.TEXCOORD8.xyz);
    u_xlat16_29 = u_xlat16_29 * FGlobals.gLightBuffer[10].w;
    u_xlat16_29 = clamp(u_xlat16_29, 0.0h, 1.0h);
    u_xlat9.xyz = float3(u_xlat16_10.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_43 = dot((-u_xlat6.xyz), float3(u_xlat16_8.xyz));
    u_xlat16_43 = u_xlat16_43 + u_xlat16_43;
    u_xlat16_11.xyz = half3(fma(float3(u_xlat16_8.xyz), (-float3(u_xlat16_43)), (-u_xlat6.xyz)));
    u_xlat16_0.x = dot(u_xlat16_11.xyz, u_xlat16_11.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_6.xyz = u_xlat16_0.xxx * u_xlat16_11.xyz;
    u_xlat16_43 = fma((-u_xlat16_42), half(0.699999988), half(1.70000005));
    u_xlat16_43 = u_xlat16_42 * u_xlat16_43;
    u_xlat16_43 = u_xlat16_43 * half(6.0);
    u_xlat16_44 = fma(u_xlat16_6.y, half(8.0), half(8.0));
    u_xlat16_44 = sqrt(u_xlat16_44);
    u_xlat16_11.xy = u_xlat16_6.xz / half2(u_xlat16_44);
    u_xlat16_11.xy = u_xlat16_11.xy + half2(0.5, 0.5);
    u_xlat16_6.xyz = _2DSpecCube0.sample(sampler_2DSpecCube0, float2(u_xlat16_11.xy), level(float(u_xlat16_43))).xyz;
    u_xlat16_11.xyz = u_xlat16_6.xyz * half3(FGlobals._SpecCubePower);
    u_xlat16_43 = (-u_xlat16_42) + half(1.0);
    u_xlat16_44 = u_xlat16_2.w * u_xlat16_43;
    u_xlat16_43 = u_xlat16_43 * u_xlat16_44;
    u_xlat16_44 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_43 = fma(u_xlat16_43, u_xlat16_44, u_xlat16_1.w);
    u_xlat16_11.xyz = half3(u_xlat16_43) * u_xlat16_11.xyz;
    u_xlat16_11.xyz = u_xlat16_4.xyz * u_xlat16_11.xyz;
    u_xlat16_11.xyz = half3(u_xlat16_29) * u_xlat16_11.xyz;
    u_xlat16_11.xyz = u_xlat16_11.xyz * FGlobals.gLightBuffer[10].xyz;
    u_xlat16_11.xyz = half3(fma(u_xlat9.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_11.xyz)));
    u_xlat16_6.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_12.xyz = half3(fma(u_xlat13.xyz, u_xlat1.xxx, float3(FGlobals.gLightBuffer[11].xyz)));
    u_xlat16_0.x = dot(u_xlat16_12.xyz, u_xlat16_12.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * u_xlat16_12.xyz;
    u_xlat16_39 = dot(u_xlat16_8.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_39 = max(u_xlat16_39, half(0.0));
    u_xlat16_29 = dot(u_xlat16_8.xyz, u_xlat16_0.xyz);
    u_xlat16_29 = max(u_xlat16_29, half(0.0));
    u_xlatb0 = u_xlat16_16>=half(0.0);
    u_xlat16_16 = (u_xlatb0) ? half(1.0) : half(0.0);
    u_xlat16_4.xyz = u_xlat16_4.xyz * half3(u_xlat16_16);
    u_xlat16_16 = fma(u_xlat16_42, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_29), u_xlat16_29, half(1.0));
    u_xlat16_42 = u_xlat16_42 * u_xlat16_42;
    u_xlat16_13 = u_xlat16_42 * u_xlat16_29;
    u_xlat16_0.x = fma(u_xlat16_13, u_xlat16_13, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_42 / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_16;
    u_xlat16_0.xyz = fma(u_xlat16_4.xyz, u_xlat16_0.xxx, u_xlat16_10.xyz);
    u_xlat16_0.xyz = half3(u_xlat16_39) * u_xlat16_0.xyz;
    u_xlat16_0.xyz = u_xlat16_6.xyz * u_xlat16_0.xyz;
    u_xlat16_1.xyz = fma(u_xlat16_0.xyz, u_xlat16_3.xxx, (-u_xlat16_0.xyz));
    u_xlat0.xyz = fma(FGlobals.gShadowParams0[5].zzz, float3(u_xlat16_1.xyz), float3(u_xlat16_0.xyz));
    u_xlat0.xyz = u_xlat0.xyz + float3(u_xlat16_11.xyz);
    u_xlat16_3.xyz = half3(float3(u_xlat16_1.www) * u_xlat0.xyz);
    u_xlat16_42 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_42 = min(u_xlat16_42, half(1.0));
    u_xlat16_4.x = (-u_xlat16_42) + half(1.0);
    u_xlat16_42 = fma(UnityPerMaterial._VertexOcclusionIntensity, u_xlat16_4.x, u_xlat16_42);
    u_xlat16_3.xyz = fma(u_xlat16_3.xyz, half3(u_xlat16_42), u_xlat16_5.xyz);
    output.SV_TARGET0.xyz = fma(u_xlat16_3.xyz, input.TEXCOORD7.www, input.TEXCOORD7.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
