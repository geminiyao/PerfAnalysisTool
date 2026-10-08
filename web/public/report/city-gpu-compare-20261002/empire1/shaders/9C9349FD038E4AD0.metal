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
    half _Metallic ;
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

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
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
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(2) ]],
    const constant ColorPropsArray_Type* UnityInstancing_ColorProps [[ buffer(3) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler samplerCloudTex [[ sampler (1) ]],
    sampler sampler_2DSpecCube0 [[ sampler (2) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(1) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(2) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(3) ]] ,
    texture2d<half, access::sample > _2DSpecCube0 [[ texture(4) ]] ,
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
    half3 u_xlat16_1;
    half3 u_xlat16_2;
    float3 u_xlat3;
    half3 u_xlat16_3;
    float4 u_xlat4;
    half4 u_xlat16_4;
    bool2 u_xlatb4;
    float3 u_xlat5;
    bool2 u_xlatb5;
    half u_xlat16_6;
    half3 u_xlat16_7;
    half3 u_xlat16_8;
    half3 u_xlat16_9;
    half3 u_xlat16_10;
    half u_xlat16_12;
    half u_xlat16_16;
    bool2 u_xlatb24;
    half2 u_xlat16_26;
    float u_xlat30;
    half u_xlat16_30;
    float u_xlat31;
    half u_xlat16_31;
    half u_xlat10_31;
    bool u_xlatb31;
    half u_xlat16_32;
    float u_xlat33;
    half u_xlat16_33;
    half u_xlat10_33;
    bool u_xlatb33;
    bool u_xlatb34;
    half u_xlat16_36;
    half u_xlat16_37;
    u_xlati0 = int(input.SV_InstanceID0) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat16_2.xy = half2(fma(u_xlat1.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw)));
    u_xlat16_10.xyz = _MainTex.sample(sampler_MainTex, float2(u_xlat16_2.xy)).xyz;
    u_xlati0 = u_xlati0 << 0x1;
    u_xlat16_2.xyz = half3(float3(u_xlat16_10.xyz) + UnityInstancing_ColorProps[u_xlati0 / 2]._HighlightColor.xyz);
    u_xlat16_32 = max(FGlobals._Roughness, half(0.119999997));
    u_xlat16_32 = min(u_xlat16_32, half(1.0));
    u_xlat16_0.x = dot(input.TEXCOORD5.xyz, input.TEXCOORD5.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * input.TEXCOORD5.xyz;
    u_xlat1.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat30 = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat30 = max(u_xlat30, 0.00100000005);
    u_xlat30 = rsqrt(u_xlat30);
    u_xlat3.xyz = float3(u_xlat30) * u_xlat1.xyz;
    u_xlatb31 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb31){
        u_xlat4.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat31 = min(u_xlat4.z, 0.999000013);
        u_xlat31 = u_xlat31 + FGlobals.gShadowParams0[4].z;
        u_xlat31 = (-u_xlat31) + 1.0;
        u_xlat10_33 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat4.xy, saturate(u_xlat31), level(0.0)));
        u_xlatb24.xy = (float2(1.0, 1.0)<u_xlat4.xy);
        u_xlatb24.x = u_xlatb24.y || u_xlatb24.x;
        u_xlatb5.xy = (u_xlat4.xy<float2(0.0, 0.0));
        u_xlatb34 = u_xlatb5.y || u_xlatb5.x;
        u_xlatb24.x = u_xlatb34 || u_xlatb24.x;
        u_xlat16_6 = (u_xlatb24.x) ? half(1.0) : half(0.0);
        u_xlat16_6 = half(max(float(u_xlat10_33), float(u_xlat16_6)));
        u_xlatb33 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb33){
            u_xlat4.xy = fma(u_xlat4.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_31 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat4.xy, saturate(u_xlat31), level(0.0)));
            u_xlatb24.xy = (float2(1.0, 1.0)<u_xlat4.xy);
            u_xlatb33 = u_xlatb24.y || u_xlatb24.x;
            u_xlatb4.xy = (u_xlat4.xy<float2(0.0, 0.0));
            u_xlatb4.x = u_xlatb4.y || u_xlatb4.x;
            u_xlatb33 = u_xlatb33 || u_xlatb4.x;
            u_xlat16_16 = (u_xlatb33) ? half(1.0) : half(0.0);
            u_xlat16_16 = half(max(float(u_xlat10_31), float(u_xlat16_16)));
            u_xlat16_6 = min(u_xlat16_6, u_xlat16_16);
        }
        u_xlatb31 = input.TEXCOORD0.y<-30.0;
        u_xlat16_6 = (u_xlatb31) ? half(1.0) : u_xlat16_6;
    } else {
        u_xlat16_6 = half(1.0);
    }
    u_xlat4 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat4 = fma(u_xlat4, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat4 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat4);
    u_xlat16_31 = CloudTex.sample(samplerCloudTex, u_xlat4.xy).y;
    u_xlat16_33 = CloudTex.sample(samplerCloudTex, u_xlat4.zw).w;
    u_xlat16_16 = u_xlat16_33 * half(0.5);
    u_xlat16_16 = fma(u_xlat16_31, half(0.5), u_xlat16_16);
    u_xlat16_31 = fma((-u_xlat16_16), u_xlat16_16, u_xlat16_16);
    u_xlat33 = fma((-float(u_xlat16_16)), float(u_xlat16_16), FGlobals.CloudParam.y);
    u_xlat16_31 = half(1.0) / u_xlat16_31;
    u_xlat31 = float(u_xlat16_31) * u_xlat33;
    u_xlat31 = clamp(u_xlat31, 0.0f, 1.0f);
    u_xlat33 = fma(u_xlat31, -2.0, 3.0);
    u_xlat31 = u_xlat31 * u_xlat31;
    u_xlat31 = u_xlat31 * u_xlat33;
    u_xlat31 = fma((-u_xlat31), FGlobals.CloudParam.z, 1.0);
    u_xlat31 = clamp(u_xlat31, 0.0f, 1.0f);
    u_xlatb33 = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_16 = (u_xlatb33) ? half(u_xlat31) : half(1.0);
    u_xlat16_6 = min(u_xlat16_16, u_xlat16_6);
    u_xlat16_16 = FGlobals._Specular * half(0.0799999982);
    u_xlat16_7.xyz = fma((-u_xlat16_2.xyz), half3(FGlobals._Metallic), u_xlat16_2.xyz);
    u_xlat16_16 = fma((-u_xlat16_16), FGlobals._Metallic, u_xlat16_16);
    u_xlat16_2.xyz = fma(u_xlat16_2.xyz, half3(FGlobals._Metallic), half3(u_xlat16_16));
    u_xlat16_16 = dot(float3(u_xlat16_0.xyz), u_xlat3.xyz);
    u_xlat16_4 = fma(half4(u_xlat16_32), half4(-1.0, -0.0274999999, -0.572000027, 0.0219999999), half4(1.0, 0.0425000004, 1.03999996, -0.0399999991));
    u_xlat16_26.x = u_xlat16_4.x * u_xlat16_4.x;
    u_xlat16_36 = u_xlat16_16 * half(-9.27999973);
    u_xlat16_36 = exp2(u_xlat16_36);
    u_xlat16_26.x = min(u_xlat16_36, u_xlat16_26.x);
    u_xlat16_26.x = fma(u_xlat16_26.x, u_xlat16_4.x, u_xlat16_4.y);
    u_xlat16_26.xy = fma(u_xlat16_26.xx, half2(-1.03999996, 1.03999996), u_xlat16_4.zw);
    u_xlat16_37 = u_xlat16_2.y * half(50.0);
    u_xlat16_37 = clamp(u_xlat16_37, 0.0h, 1.0h);
    u_xlat16_36 = u_xlat16_26.y * u_xlat16_37;
    u_xlat16_2.xyz = fma(u_xlat16_2.xyz, u_xlat16_26.xxx, half3(u_xlat16_36));
    u_xlat16_26.x = dot(float3(0.212500006, 0.715399981, 0.0720999986), input.TEXCOORD8.xyz);
    u_xlat16_26.x = u_xlat16_26.x * FGlobals.gLightBuffer[10].w;
    u_xlat16_26.x = clamp(u_xlat16_26.x, 0.0h, 1.0h);
    u_xlat5.xyz = float3(u_xlat16_7.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_36 = dot((-u_xlat3.xyz), float3(u_xlat16_0.xyz));
    u_xlat16_36 = u_xlat16_36 + u_xlat16_36;
    u_xlat16_8.xyz = half3(fma(float3(u_xlat16_0.xyz), (-float3(u_xlat16_36)), (-u_xlat3.xyz)));
    u_xlat16_31 = dot(u_xlat16_8.xyz, u_xlat16_8.xyz);
    u_xlat16_31 = max(u_xlat16_31, half(0.00100000005));
    u_xlat16_31 = rsqrt(u_xlat16_31);
    u_xlat16_3.xyz = half3(u_xlat16_31) * u_xlat16_8.xyz;
    u_xlat16_36 = fma((-u_xlat16_32), half(0.699999988), half(1.70000005));
    u_xlat16_36 = u_xlat16_32 * u_xlat16_36;
    u_xlat16_36 = u_xlat16_36 * half(6.0);
    u_xlat16_37 = fma(u_xlat16_3.y, half(8.0), half(8.0));
    u_xlat16_37 = sqrt(u_xlat16_37);
    u_xlat16_8.xy = u_xlat16_3.xz / half2(u_xlat16_37);
    u_xlat16_8.xy = u_xlat16_8.xy + half2(0.5, 0.5);
    u_xlat16_3.xyz = _2DSpecCube0.sample(sampler_2DSpecCube0, float2(u_xlat16_8.xy), level(float(u_xlat16_36))).xyz;
    u_xlat16_8.xyz = u_xlat16_3.xyz * half3(FGlobals._SpecCubePower);
    u_xlat16_8.xyz = u_xlat16_2.xyz * u_xlat16_8.xyz;
    u_xlat16_8.xyz = u_xlat16_26.xxx * u_xlat16_8.xyz;
    u_xlat16_8.xyz = u_xlat16_8.xyz * FGlobals.gLightBuffer[10].xyz;
    u_xlat16_8.xyz = half3(fma(u_xlat5.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_8.xyz)));
    u_xlat16_3.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_9.xyz = half3(fma(u_xlat1.xyz, float3(u_xlat30), float3(FGlobals.gLightBuffer[11].xyz)));
    u_xlat16_30 = dot(u_xlat16_9.xyz, u_xlat16_9.xyz);
    u_xlat16_30 = max(u_xlat16_30, half(0.00100000005));
    u_xlat16_30 = rsqrt(u_xlat16_30);
    u_xlat16_1.xyz = half3(u_xlat16_30) * u_xlat16_9.xyz;
    u_xlat16_30 = dot(u_xlat16_0.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_30 = max(u_xlat16_30, half(0.0));
    u_xlat16_26.x = dot(u_xlat16_0.xyz, u_xlat16_1.xyz);
    u_xlat16_26.x = max(u_xlat16_26.x, half(0.0));
    u_xlatb0 = u_xlat16_16>=half(0.0);
    u_xlat16_16 = (u_xlatb0) ? half(1.0) : half(0.0);
    u_xlat16_2.xyz = u_xlat16_2.xyz * half3(u_xlat16_16);
    u_xlat16_16 = fma(u_xlat16_32, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_26.x), u_xlat16_26.x, half(1.0));
    u_xlat16_32 = u_xlat16_32 * u_xlat16_32;
    u_xlat16_10.x = u_xlat16_32 * u_xlat16_26.x;
    u_xlat16_0.x = fma(u_xlat16_10.x, u_xlat16_10.x, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_32 / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_16;
    u_xlat16_0.xyz = fma(u_xlat16_2.xyz, u_xlat16_0.xxx, u_xlat16_7.xyz);
    u_xlat16_0.xyz = half3(u_xlat16_30) * u_xlat16_0.xyz;
    u_xlat16_0.xyz = u_xlat16_3.xyz * u_xlat16_0.xyz;
    u_xlat16_1.xyz = fma(u_xlat16_0.xyz, half3(u_xlat16_6), (-u_xlat16_0.xyz));
    u_xlat0.xyz = fma(FGlobals.gShadowParams0[5].zzz, float3(u_xlat16_1.xyz), float3(u_xlat16_0.xyz));
    u_xlat0.xyz = u_xlat0.xyz + float3(u_xlat16_8.xyz);
    u_xlat16_2.x = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_2.x = min(u_xlat16_2.x, half(1.0));
    u_xlat16_12 = (-u_xlat16_2.x) + half(1.0);
    u_xlat16_2.x = fma(FGlobals._VertexOcclusionIntensity, u_xlat16_12, u_xlat16_2.x);
    u_xlat16_2.xyz = half3(u_xlat0.xyz * float3(u_xlat16_2.xxx));
    output.SV_TARGET0.xyz = fma(u_xlat16_2.xyz, input.TEXCOORD7.www, input.TEXCOORD7.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
