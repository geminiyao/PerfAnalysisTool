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
    half _WeatherSplitOn ;
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
    half4 _SnowColor ;
    half _SnowLevel ;
    half _SnowNoise ;
    half _SnowNoiseInvert ;
    half _SnowIntensity ;
    half _SnowWetness ;
    half _SnowOcclusion ;
    half _ShowSnowDirectly ;
    half4 _NightColorHDR ;
    half4 _NightColorHDRCity ;
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
    half4 TEXCOORD20 [[ user(TEXCOORD20) ]] ;
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
    int u_xlati0;
    bool u_xlatb0;
    float3 u_xlat1;
    half4 u_xlat16_1;
    float4 u_xlat2;
    half4 u_xlat16_2;
    half3 u_xlat16_3;
    half4 u_xlat16_4;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    half3 u_xlat16_7;
    float3 u_xlat8;
    half3 u_xlat16_8;
    float3 u_xlat9;
    half u_xlat16_9;
    bool4 u_xlatb9;
    bool2 u_xlatb10;
    half u_xlat16_11;
    bool u_xlatb11;
    half u_xlat16_14;
    half3 u_xlat16_17;
    half2 u_xlat16_25;
    half u_xlat10_31;
    bool u_xlatb31;
    float u_xlat33;
    half u_xlat16_33;
    half u_xlat16_36;
    half u_xlat16_37;
    half u_xlat16_38;
    float u_xlat41;
    half u_xlat16_41;
    half u_xlat10_41;
    bool u_xlatb41;
    bool u_xlatb42;
    u_xlati0 = int(input.SV_InstanceID0) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat16_2.xy = half2(fma(u_xlat1.xy, float2(UnityPerMaterial._MainTex_ST.xy), float2(UnityPerMaterial._MainTex_ST.zw)));
    u_xlati0 = u_xlati0 << 0x1;
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, float2(u_xlat16_2.xy));
    u_xlat16_2 = _NormalTex.sample(sampler_NormalTex, float2(u_xlat16_2.xy));
    u_xlat16_3.x = u_xlat16_2.z + u_xlat16_2.z;
    u_xlat16_4.yz = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_4.xw = (-u_xlat16_4.zz);
    u_xlat16_14 = dot(u_xlat16_4.yw, u_xlat16_4.yw);
    u_xlat16_14 = min(u_xlat16_14, half(1.0));
    u_xlat16_14 = (-u_xlat16_14) + half(1.0);
    u_xlat16_14 = sqrt(u_xlat16_14);
    u_xlat16_5.xyz = half3(fma(float3(u_xlat16_1.xyz), float3(UnityPerMaterial._TintColorHDR.xyz), UnityInstancing_ColorProps[u_xlati0 / 2]._HighlightColor.xyz));
    u_xlat16_25.x = (-input.TEXCOORD2.x) + half(1.0);
    u_xlat16_36 = u_xlat16_25.x * FGlobals.gLightBuffer[8].w;
    u_xlat16_25.x = fma((-u_xlat16_25.x), FGlobals.gLightBuffer[8].w, half(1.0));
    u_xlat16_6.xyz = fma(half3(u_xlat16_36), UnityPerMaterial._NightColorHDR.xyz, u_xlat16_25.xxx);
    u_xlat16_7.xyz = fma(u_xlat16_5.xyz, half3(-2.0, -2.0, -2.0), half3(1.0, 1.0, 1.0));
    u_xlat16_5.xyz = fma(half3(u_xlat16_36), u_xlat16_7.xyz, u_xlat16_5.xyz);
    u_xlat16_7.xyz = u_xlat16_6.xyz * u_xlat16_5.xyz;
    u_xlat16_25.x = input.TEXCOORD5.y + (-UnityPerMaterial._SnowLevel);
    u_xlat16_25.x = u_xlat16_25.x / UnityPerMaterial._SnowWetness;
    u_xlat16_25.x = clamp(u_xlat16_25.x, 0.0h, 1.0h);
    u_xlat16_36 = u_xlat16_2.z + UnityPerMaterial._SnowNoiseInvert;
    u_xlat16_3.x = fma((-u_xlat16_3.x), UnityPerMaterial._SnowNoiseInvert, u_xlat16_36);
    u_xlat16_3.x = log2(u_xlat16_3.x);
    u_xlat16_3.x = u_xlat16_3.x * UnityPerMaterial._SnowNoise;
    u_xlat16_3.x = exp2(u_xlat16_3.x);
    u_xlat16_3.x = u_xlat16_3.x * UnityPerMaterial._SnowIntensity;
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_25.x;
    u_xlat16_3.x = clamp(u_xlat16_3.x, 0.0h, 1.0h);
    u_xlatb0 = UnityPerMaterial._ShowSnowDirectly<half(1.0);
    u_xlatb11 = half(0.0)!=FGlobals._WeatherSplitOn;
    u_xlat16_25.x = u_xlat16_3.x * input.TEXCOORD20.w;
    u_xlat16_36 = u_xlat16_3.x * FGlobals.gLightBuffer[8].z;
    u_xlat16_25.x = (u_xlatb11) ? u_xlat16_25.x : u_xlat16_36;
    u_xlat16_3.x = (u_xlatb0) ? u_xlat16_25.x : u_xlat16_3.x;
    u_xlat16_5.xyz = fma((-u_xlat16_5.xyz), u_xlat16_6.xyz, UnityPerMaterial._SnowColor.xyz);
    u_xlat16_5.xyz = fma(u_xlat16_3.xxx, u_xlat16_5.xyz, u_xlat16_7.xyz);
    u_xlatb0 = input.TEXCOORD20.z<input.TEXCOORD20.w;
    u_xlat16_17.yz = input.TEXCOORD20.zw * half2(0.5, 1.0);
    u_xlat16_25.x = fma((-input.TEXCOORD20.z), half(0.5), half(1.0));
    u_xlat16_17.x = (u_xlatb0) ? input.TEXCOORD20.y : u_xlat16_25.x;
    u_xlat16_25.x = dot(UnityPerMaterial._RoughnessScale.xyz, u_xlat16_17.xyz);
    u_xlatb0 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_17.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_36 = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_17.x = (u_xlatb0) ? FGlobals.gLightBuffer[8].x : u_xlat16_36;
    u_xlat16_25.y = dot(UnityPerMaterial._RoughnessScale.xyz, u_xlat16_17.xyz);
    u_xlat16_25.xy = u_xlat16_2.zz * u_xlat16_25.xy;
    u_xlat16_25.x = (u_xlatb11) ? u_xlat16_25.x : u_xlat16_25.y;
    u_xlat16_36 = (-u_xlat16_3.x) + half(1.0);
    u_xlat16_3.x = fma(UnityPerMaterial._RoughnessScale.w, u_xlat16_3.x, u_xlat16_36);
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_25.x;
    u_xlat16_25.x = u_xlat16_2.w * u_xlat16_36;
    u_xlat16_3.x = max(u_xlat16_3.x, half(0.119999997));
    u_xlat16_3.x = min(u_xlat16_3.x, half(1.0));
    u_xlat16_4.xzw = u_xlat16_4.xxx * input.TEXCOORD4.xyz;
    u_xlat16_4.xyz = fma(input.TEXCOORD3.xyz, u_xlat16_4.yyy, u_xlat16_4.xzw);
    u_xlat16_4.xyz = fma(input.TEXCOORD5.xyz, half3(u_xlat16_14), u_xlat16_4.xyz);
    u_xlat16_0.x = dot(u_xlat16_4.xyz, u_xlat16_4.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * u_xlat16_4.xyz;
    u_xlat1.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat33 = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat33 = max(u_xlat33, 0.00100000005);
    u_xlat33 = rsqrt(u_xlat33);
    u_xlat8.xyz = float3(u_xlat33) * u_xlat1.xyz;
    u_xlatb41 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb41){
        u_xlat9.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat41 = min(u_xlat9.z, 0.999000013);
        u_xlat41 = u_xlat41 + FGlobals.gShadowParams0[4].z;
        u_xlat41 = (-u_xlat41) + 1.0;
        u_xlat10_31 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat9.xy, saturate(u_xlat41), level(0.0)));
        u_xlatb10.xy = (float2(1.0, 1.0)<u_xlat9.xy);
        u_xlatb42 = u_xlatb10.y || u_xlatb10.x;
        u_xlatb10.xy = (u_xlat9.xy<float2(0.0, 0.0));
        u_xlatb10.x = u_xlatb10.y || u_xlatb10.x;
        u_xlatb42 = u_xlatb42 || u_xlatb10.x;
        u_xlat16_14 = (u_xlatb42) ? half(1.0) : half(0.0);
        u_xlat16_14 = half(max(float(u_xlat10_31), float(u_xlat16_14)));
        u_xlatb31 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb31){
            u_xlat9.xy = fma(u_xlat9.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_41 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat9.xy, saturate(u_xlat41), level(0.0)));
            u_xlatb9.zw = (float2(1.0, 1.0)<u_xlat9.xy);
            u_xlatb9.xy = (u_xlat9.xy<float2(0.0, 0.0));
            u_xlatb9.xz = u_xlatb9.yw || u_xlatb9.xz;
            u_xlatb9.x = u_xlatb9.x || u_xlatb9.z;
            u_xlat16_36 = (u_xlatb9.x) ? half(1.0) : half(0.0);
            u_xlat16_36 = half(max(float(u_xlat10_41), float(u_xlat16_36)));
            u_xlat16_14 = min(u_xlat16_14, u_xlat16_36);
        }
        u_xlatb41 = input.TEXCOORD0.y<-30.0;
        u_xlat16_14 = (u_xlatb41) ? half(1.0) : u_xlat16_14;
    } else {
        u_xlat16_14 = half(1.0);
    }
    u_xlat2 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat2 = fma(u_xlat2, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat2 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat2);
    u_xlat16_41 = CloudTex.sample(samplerCloudTex, u_xlat2.xy).y;
    u_xlat16_9 = CloudTex.sample(samplerCloudTex, u_xlat2.zw).w;
    u_xlat16_36 = u_xlat16_9 * half(0.5);
    u_xlat16_36 = fma(u_xlat16_41, half(0.5), u_xlat16_36);
    u_xlat16_41 = fma((-u_xlat16_36), u_xlat16_36, u_xlat16_36);
    u_xlat9.x = fma((-float(u_xlat16_36)), float(u_xlat16_36), FGlobals.CloudParam.y);
    u_xlat16_41 = half(1.0) / u_xlat16_41;
    u_xlat41 = float(u_xlat16_41) * u_xlat9.x;
    u_xlat41 = clamp(u_xlat41, 0.0f, 1.0f);
    u_xlat9.x = fma(u_xlat41, -2.0, 3.0);
    u_xlat41 = u_xlat41 * u_xlat41;
    u_xlat41 = u_xlat41 * u_xlat9.x;
    u_xlat41 = fma((-u_xlat41), FGlobals.CloudParam.z, 1.0);
    u_xlat41 = clamp(u_xlat41, 0.0f, 1.0f);
    u_xlatb9.x = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_36 = (u_xlatb9.x) ? half(u_xlat41) : half(1.0);
    u_xlat16_14 = min(u_xlat16_36, u_xlat16_14);
    u_xlat16_4.xyz = fma((-u_xlat16_5.xyz), u_xlat16_25.xxx, u_xlat16_5.xyz);
    u_xlat16_36 = fma((-u_xlat16_25.x), half(0.0399999991), half(0.0399999991));
    u_xlat16_5.xyz = fma(u_xlat16_5.xyz, u_xlat16_25.xxx, half3(u_xlat16_36));
    u_xlat16_36 = dot(float3(u_xlat16_0.xyz), u_xlat8.xyz);
    u_xlat16_2 = fma(u_xlat16_3.xxxx, half4(-1.0, -0.0274999999, -0.572000027, 0.0219999999), half4(1.0, 0.0425000004, 1.03999996, -0.0399999991));
    u_xlat16_37 = u_xlat16_2.x * u_xlat16_2.x;
    u_xlat16_38 = u_xlat16_36 * half(-9.27999973);
    u_xlat16_38 = exp2(u_xlat16_38);
    u_xlat16_37 = min(u_xlat16_37, u_xlat16_38);
    u_xlat16_37 = fma(u_xlat16_37, u_xlat16_2.x, u_xlat16_2.y);
    u_xlat16_6.xy = fma(half2(u_xlat16_37), half2(-1.03999996, 1.03999996), u_xlat16_2.zw);
    u_xlat16_37 = u_xlat16_5.y * half(50.0);
    u_xlat16_37 = clamp(u_xlat16_37, 0.0h, 1.0h);
    u_xlat16_37 = u_xlat16_37 * u_xlat16_6.y;
    u_xlat16_5.xyz = fma(u_xlat16_5.xyz, u_xlat16_6.xxx, half3(u_xlat16_37));
    u_xlat16_37 = dot(float3(0.212500006, 0.715399981, 0.0720999986), input.TEXCOORD8.xyz);
    u_xlat16_37 = u_xlat16_37 * FGlobals.gLightBuffer[10].w;
    u_xlat16_37 = clamp(u_xlat16_37, 0.0h, 1.0h);
    u_xlat9.xyz = float3(u_xlat16_4.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_38 = dot((-u_xlat8.xyz), float3(u_xlat16_0.xyz));
    u_xlat16_38 = u_xlat16_38 + u_xlat16_38;
    u_xlat16_6.xyz = half3(fma(float3(u_xlat16_0.xyz), (-float3(u_xlat16_38)), (-u_xlat8.xyz)));
    u_xlat16_8.x = dot(u_xlat16_6.xyz, u_xlat16_6.xyz);
    u_xlat16_8.x = max(u_xlat16_8.x, half(0.00100000005));
    u_xlat16_8.x = rsqrt(u_xlat16_8.x);
    u_xlat16_8.xyz = u_xlat16_6.xyz * u_xlat16_8.xxx;
    u_xlat16_38 = fma((-u_xlat16_3.x), half(0.699999988), half(1.70000005));
    u_xlat16_38 = u_xlat16_3.x * u_xlat16_38;
    u_xlat16_38 = u_xlat16_38 * half(6.0);
    u_xlat16_6.x = fma(u_xlat16_8.y, half(8.0), half(8.0));
    u_xlat16_6.x = sqrt(u_xlat16_6.x);
    u_xlat16_6.xy = u_xlat16_8.xz / u_xlat16_6.xx;
    u_xlat16_6.xy = u_xlat16_6.xy + half2(0.5, 0.5);
    u_xlat16_8.xyz = _2DSpecCube0.sample(sampler_2DSpecCube0, float2(u_xlat16_6.xy), level(float(u_xlat16_38))).xyz;
    u_xlat16_6.xyz = u_xlat16_8.xyz * half3(FGlobals._SpecCubePower);
    u_xlat16_38 = (-u_xlat16_3.x) + half(1.0);
    u_xlat16_38 = u_xlat16_38 * u_xlat16_38;
    u_xlat16_25.x = u_xlat16_25.x * u_xlat16_38;
    u_xlat16_38 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_25.x = fma(u_xlat16_25.x, u_xlat16_38, u_xlat16_1.w);
    u_xlat16_6.xyz = u_xlat16_25.xxx * u_xlat16_6.xyz;
    u_xlat16_6.xyz = u_xlat16_5.xyz * u_xlat16_6.xyz;
    u_xlat16_6.xyz = half3(u_xlat16_37) * u_xlat16_6.xyz;
    u_xlat16_6.xyz = u_xlat16_6.xyz * FGlobals.gLightBuffer[10].xyz;
    u_xlat16_6.xyz = half3(fma(u_xlat9.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_6.xyz)));
    u_xlat16_8.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_7.xyz = half3(fma(u_xlat1.xyz, float3(u_xlat33), float3(FGlobals.gLightBuffer[11].xyz)));
    u_xlat16_33 = dot(u_xlat16_7.xyz, u_xlat16_7.xyz);
    u_xlat16_33 = max(u_xlat16_33, half(0.00100000005));
    u_xlat16_33 = rsqrt(u_xlat16_33);
    u_xlat16_1.xyz = half3(u_xlat16_33) * u_xlat16_7.xyz;
    u_xlat16_33 = dot(u_xlat16_0.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_33 = max(u_xlat16_33, half(0.0));
    u_xlat16_25.x = dot(u_xlat16_0.xyz, u_xlat16_1.xyz);
    u_xlat16_25.x = max(u_xlat16_25.x, half(0.0));
    u_xlatb0 = u_xlat16_36>=half(0.0);
    u_xlat16_36 = (u_xlatb0) ? half(1.0) : half(0.0);
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(u_xlat16_36);
    u_xlat16_36 = fma(u_xlat16_3.x, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_25.x), u_xlat16_25.x, half(1.0));
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_3.x;
    u_xlat16_11 = u_xlat16_3.x * u_xlat16_25.x;
    u_xlat16_0.x = fma(u_xlat16_11, u_xlat16_11, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_3.x / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_36;
    u_xlat16_0.xyz = fma(u_xlat16_5.xyz, u_xlat16_0.xxx, u_xlat16_4.xyz);
    u_xlat16_0.xyz = half3(u_xlat16_33) * u_xlat16_0.xyz;
    u_xlat16_0.xyz = u_xlat16_8.xyz * u_xlat16_0.xyz;
    u_xlat16_1.xyz = fma(u_xlat16_0.xyz, half3(u_xlat16_14), (-u_xlat16_0.xyz));
    u_xlat0.xyz = fma(FGlobals.gShadowParams0[5].zzz, float3(u_xlat16_1.xyz), float3(u_xlat16_0.xyz));
    u_xlat0.xyz = u_xlat0.xyz + float3(u_xlat16_6.xyz);
    u_xlat16_3.xyz = half3(float3(u_xlat16_1.www) * u_xlat0.xyz);
    u_xlat16_36 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_36 = min(u_xlat16_36, half(1.0));
    u_xlat16_4.x = (-u_xlat16_36) + half(1.0);
    u_xlat16_36 = fma(UnityPerMaterial._VertexOcclusionIntensity, u_xlat16_4.x, u_xlat16_36);
    u_xlat16_3.xyz = half3(u_xlat16_36) * u_xlat16_3.xyz;
    output.SV_TARGET0.xyz = fma(u_xlat16_3.xyz, input.TEXCOORD7.www, input.TEXCOORD7.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
