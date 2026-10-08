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
    half4 gLightBuffer [116];
    half4 gFogParams [10];
    float4 gShadowParams0 [7];
    float gPlanarShadowEnabled ;
    half gShadowEnableDynamicShadow ;
    float4 gPlanarShadowParams ;
    float4 CloudSpeed ;
    float4 CloudParam ;
    float4 CloudOffset ;
    half4 _ScreenCenterFogParams0 ;
    half4 _ScreenCenterFogParams1 ;
    int _VT_RootSize ;
    int _VT_MaxVTMip ;
    float4 _VT_TerrainTileInfo ;
    float4 _VT_TerrainInfo ;
    float4 _VT_TerrainHeightInfo ;
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

struct UnityPerFrame_Type
{
    half4 glstate_lightmodel_ambient ;
    half4 unity_AmbientSky ;
    half4 unity_AmbientEquator ;
    half4 unity_AmbientGround ;
    half4 unity_IndirectSpecColor ;
    float4 hlslcc_mtx4x4glstate_matrix_projection [4];
    float4 hlslcc_mtx4x4unity_MatrixV [4];
    float4 hlslcc_mtx4x4unity_MatrixInvV [4];
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    int unity_StereoEyeIndex ;
    half4 unity_ShadowColor ;
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
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(2) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_NormalTex [[ sampler (1) ]],
    sampler samplerCloudTex [[ sampler (2) ]],
    sampler sampler_VT_IndexTex [[ sampler (3) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(1) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(2) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(3) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(4) ]] ,
    texture2d<half, access::sample > BnSFog_FogMaskTex [[ texture(5) ]] ,
    texture2d<half, access::sample > _VT_IndexTex [[ texture(6) ]] ,
    texture2d_array<half, access::sample > _VT_WorldYTex [[ texture(7) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_linear_clamp_compare_sampler(compare_func::greater_equal,filter::linear,mip_filter::nearest,address::clamp_to_edge);
    constexpr sampler BnsFog_LinearClampSampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    constexpr sampler vt_linear_clamp_sampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float4 u_xlat0;
    half4 u_xlat16_0;
    bool u_xlatb0;
    float u_xlat1;
    half4 u_xlat16_1;
    float3 u_xlat2;
    half4 u_xlat16_2;
    bool3 u_xlatb2;
    half4 u_xlat16_3;
    half3 u_xlat16_4;
    float u_xlat5;
    half3 u_xlat16_5;
    float4 u_xlat6;
    half2 u_xlat16_6;
    float2 u_xlat7;
    bool2 u_xlatb7;
    float3 u_xlat8;
    bool2 u_xlatb8;
    half3 u_xlat16_9;
    half3 u_xlat16_10;
    float3 u_xlat11;
    half2 u_xlat16_12;
    float3 u_xlat13;
    half u_xlat16_13;
    bool u_xlatb13;
    float3 u_xlat14;
    float u_xlat15;
    bool2 u_xlatb15;
    half3 u_xlat16_18;
    half3 u_xlat16_19;
    float2 u_xlat20;
    bool u_xlatb20;
    float u_xlat26;
    half u_xlat16_26;
    bool u_xlatb26;
    float u_xlat28;
    bool u_xlatb28;
    half2 u_xlat16_31;
    half2 u_xlat16_32;
    float u_xlat33;
    int2 u_xlati33;
    uint u_xlatu33;
    bool2 u_xlatb33;
    float u_xlat39;
    half u_xlat16_39;
    bool u_xlatb39;
    float u_xlat40;
    half u_xlat16_40;
    bool u_xlatb40;
    float u_xlat41;
    half u_xlat16_41;
    half u_xlat10_41;
    uint u_xlatu41;
    bool u_xlatb41;
    half u_xlat16_43;
    half u_xlat16_44;
    bool u_xlatb46;
    u_xlat16_0.x = dot(input.TEXCOORD3.xyz, input.TEXCOORD3.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * input.TEXCOORD3.xyz;
    u_xlat16_39 = dot(input.TEXCOORD4.xyz, input.TEXCOORD4.xyz);
    u_xlat16_39 = max(u_xlat16_39, half(0.00100000005));
    u_xlat16_39 = rsqrt(u_xlat16_39);
    u_xlat16_1.xyz = half3(u_xlat16_39) * input.TEXCOORD4.xyz;
    u_xlat2.x = input.TEXCOORD0.w;
    u_xlat2.y = input.TEXCOORD1.w;
    u_xlat2.xy = fma(u_xlat2.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw));
    u_xlat16_3 = _MainTex.sample(sampler_MainTex, u_xlat2.xy);
    u_xlat16_4.xyz = (-u_xlat16_3.xyz) + FGlobals._HueVariation.xyz;
    u_xlat16_4.xyz = fma(input.TEXCOORD9, u_xlat16_4.xyz, u_xlat16_3.xyz);
    u_xlat16_43 = max(u_xlat16_3.z, u_xlat16_3.y);
    u_xlat16_43 = max(u_xlat16_3.x, u_xlat16_43);
    u_xlat16_5.x = max(u_xlat16_4.z, u_xlat16_4.y);
    u_xlat16_5.x = max(u_xlat16_4.x, u_xlat16_5.x);
    u_xlat16_43 = u_xlat16_43 / u_xlat16_5.x;
    u_xlat16_43 = fma(u_xlat16_43, half(0.5), half(0.5));
    u_xlat16_4.xyz = half3(u_xlat16_43) * u_xlat16_4.xyz;
    u_xlat16_4.xyz = clamp(u_xlat16_4.xyz, 0.0h, 1.0h);
    u_xlat16_5.xyz = u_xlat16_4.xyz * FGlobals._TintColorHDR.xyz;
    u_xlat16_6.xy = half2(u_xlat2.xy * float2(FGlobals._MainTex_TexelSize.zw));
    u_xlat16_32.xy = dfdx(u_xlat16_6.xy);
    u_xlat16_6.xy = dfdy(u_xlat16_6.xy);
    u_xlat16_43 = dot(u_xlat16_32.xy, u_xlat16_32.xy);
    u_xlat16_44 = dot(u_xlat16_6.xy, u_xlat16_6.xy);
    u_xlat16_43 = max(u_xlat16_43, u_xlat16_44);
    u_xlat16_43 = log2(u_xlat16_43);
    u_xlat16_43 = u_xlat16_43 * half(0.5);
    u_xlat16_43 = max(u_xlat16_43, half(0.0));
    u_xlat16_43 = fma(u_xlat16_43, FGlobals._MipScale, half(1.0));
    u_xlat39 = float(u_xlat16_3.w) * float(u_xlat16_43);
    u_xlat16_40 = fma(u_xlat16_3.w, u_xlat16_43, (-FGlobals._OpacityMaskClipValue));
    u_xlat28 = dfdx(u_xlat39);
    u_xlat39 = dfdy(u_xlat39);
    u_xlat39 = abs(u_xlat39) + abs(u_xlat28);
    u_xlat39 = max(u_xlat39, 9.99999975e-05);
    u_xlat39 = float(u_xlat16_40) / u_xlat39;
    u_xlat39 = u_xlat39 + 0.5;
    u_xlat16_2 = _NormalTex.sample(sampler_NormalTex, u_xlat2.xy);
    u_xlat16_43 = u_xlat16_2.z + u_xlat16_2.z;
    u_xlat16_3.xy = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_3.z = (-u_xlat16_3.y);
    u_xlat16_44 = dot(u_xlat16_3.xz, u_xlat16_3.xz);
    u_xlat16_44 = min(u_xlat16_44, half(1.0));
    u_xlat16_44 = (-u_xlat16_44) + half(1.0);
    u_xlat16_3.w = sqrt(u_xlat16_44);
    u_xlatb40 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_19.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_44 = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_19.x = (u_xlatb40) ? FGlobals.gLightBuffer[8].x : u_xlat16_44;
    u_xlat16_44 = dot(FGlobals._RoughnessScale.xyz, u_xlat16_19.xyz);
    u_xlat16_44 = u_xlat16_2.z * u_xlat16_44;
    u_xlat16_6.x = input.TEXCOORD5.y + (-FGlobals._SnowLevel);
    u_xlat16_6.x = u_xlat16_6.x / FGlobals._SnowWetness;
    u_xlat16_6.x = clamp(u_xlat16_6.x, 0.0h, 1.0h);
    u_xlat16_19.x = u_xlat16_2.z + FGlobals._SnowNoiseInvert;
    u_xlat16_43 = fma((-u_xlat16_43), FGlobals._SnowNoiseInvert, u_xlat16_19.x);
    u_xlat16_43 = log2(u_xlat16_43);
    u_xlat16_43 = u_xlat16_43 * FGlobals._SnowNoise;
    u_xlat16_43 = exp2(u_xlat16_43);
    u_xlat16_43 = u_xlat16_43 * FGlobals._SnowIntensity;
    u_xlat16_43 = u_xlat16_43 * u_xlat16_6.x;
    u_xlat16_6.x = log2(input.TEXCOORD2.w);
    u_xlat16_6.x = u_xlat16_6.x * FGlobals._SnowOcclusion;
    u_xlat16_6.x = exp2(u_xlat16_6.x);
    u_xlat16_43 = u_xlat16_43 * u_xlat16_6.x;
    u_xlat16_43 = clamp(u_xlat16_43, 0.0h, 1.0h);
    u_xlatb40 = FGlobals._ShowSnowDirectly<half(1.0);
    u_xlat16_6.x = u_xlat16_43 * FGlobals.gLightBuffer[8].z;
    u_xlat16_43 = (u_xlatb40) ? u_xlat16_6.x : u_xlat16_43;
    u_xlat16_6.x = (-u_xlat16_43) + half(1.0);
    u_xlat16_6.x = fma(FGlobals._RoughnessScale.w, u_xlat16_43, u_xlat16_6.x);
    u_xlat16_44 = u_xlat16_44 * u_xlat16_6.x;
    u_xlat16_4.xyz = fma((-u_xlat16_4.xyz), FGlobals._TintColorHDR.xyz, FGlobals._SnowColor.xyz);
    u_xlat16_4.xyz = fma(half3(u_xlat16_43), u_xlat16_4.xyz, u_xlat16_5.xyz);
    u_xlat16_43 = max(u_xlat16_44, half(0.119999997));
    u_xlat16_43 = min(u_xlat16_43, half(1.0));
    u_xlat16_5.x = half(u_xlat39 + (-float(FGlobals._OpacityMaskClipValue)));
    u_xlatb39 = u_xlat16_5.x<half(0.0);
    if(((int(u_xlatb39) * int(0xffffffffu)))!=0){discard_fragment();}
    u_xlat39 = FGlobals._ShadowAmount * FGlobals.gShadowParams0[5].z;
    u_xlatb40 = 0.0>=u_xlat39;
    if(u_xlatb40){
        u_xlat16_5.x = half(1.0);
    }
    if(!u_xlatb40){
        u_xlat2.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlatb40 = 0.5<FGlobals.gPlanarShadowEnabled;
        u_xlat7.x = input.TEXCOORD0.y + 100.0;
        u_xlat7.x = u_xlat7.x / FGlobals.gPlanarShadowParams.y;
        u_xlatb20 = FGlobals.gPlanarShadowEnabled<0.5;
        u_xlat33 = min(u_xlat2.z, 0.999000013);
        u_xlat28 = (u_xlatb20) ? u_xlat33 : u_xlat2.z;
        u_xlat28 = (u_xlatb40) ? u_xlat7.x : u_xlat28;
        u_xlat20.x = u_xlat28 + FGlobals.gShadowParams0[4].z;
        u_xlat33 = (-u_xlat20.x) + 1.0;
        u_xlat20.x = (u_xlatb40) ? u_xlat20.x : u_xlat33;
        u_xlat20.x = float(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat2.xy, saturate(u_xlat20.x), level(0.0)));
        u_xlatb33.xy = (u_xlat2.xy<float2(0.0, 0.0));
        u_xlatb33.x = u_xlatb33.y || u_xlatb33.x;
        u_xlatb8.xy = (float2(1.0, 1.0)<u_xlat2.xy);
        u_xlatb46 = u_xlatb8.y || u_xlatb8.x;
        u_xlatb33.x = u_xlatb46 || u_xlatb33.x;
        u_xlat16_18.x = (u_xlatb33.x) ? half(1.0) : half(u_xlat20.x);
        u_xlatb20 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb20){
            if(u_xlatb40){
                u_xlat20.x = (-input.TEXCOORD0.y) + FGlobals.gPlanarShadowParams.x;
                u_xlat20.x = u_xlat20.x / float(FGlobals.gLightBuffer[11].y);
                u_xlat6.xyz = fma(float3(FGlobals.gLightBuffer[11].xyz), u_xlat20.xxx, input.TEXCOORD0.xyz);
                u_xlat6.w = 1.0;
                u_xlat8.x = dot(FGlobals.gShadowParams0[0], u_xlat6);
                u_xlat8.y = dot(FGlobals.gShadowParams0[1], u_xlat6);
                u_xlat8.z = dot(FGlobals.gShadowParams0[3], u_xlat6);
                u_xlat16_9.xyz = half3(u_xlat8.xyz * float3(0.5, 0.5, 0.5));
                u_xlat16_10.x = u_xlat16_9.z + u_xlat16_9.x;
                u_xlat16_10.y = half(fma(float(u_xlat16_9.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_9.z)));
                u_xlat7.x = u_xlat7.x * u_xlat8.z;
                u_xlat20.xy = float2(u_xlat16_10.xy) / u_xlat8.zz;
                u_xlat28 = u_xlat7.x / u_xlat8.z;
            } else {
                u_xlat20.xy = fma(u_xlat2.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            }
            u_xlat2.x = u_xlat28 + FGlobals.gShadowParams0[4].z;
            u_xlat15 = (-u_xlat2.x) + 1.0;
            u_xlat2.x = (u_xlatb40) ? u_xlat2.x : u_xlat15;
            u_xlat2.x = float(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat20.xy, saturate(u_xlat2.x), level(0.0)));
            u_xlatb15.xy = (u_xlat20.xy<float2(0.0, 0.0));
            u_xlatb15.x = u_xlatb15.y || u_xlatb15.x;
            u_xlatb7.xy = (float2(1.0, 1.0)<u_xlat20.xy);
            u_xlatb28 = u_xlatb7.y || u_xlatb7.x;
            u_xlatb15.x = u_xlatb28 || u_xlatb15.x;
            u_xlat16_31.x = (u_xlatb15.x) ? half(1.0) : half(u_xlat2.x);
            u_xlat16_18.x = min(u_xlat16_31.x, u_xlat16_18.x);
        }
        u_xlat40 = (u_xlatb40) ? -100.0 : -30.0;
        u_xlatb40 = input.TEXCOORD0.y<u_xlat40;
        u_xlat16_2.x = u_xlat16_18.x + half(-1.0);
        u_xlat39 = fma(u_xlat39, float(u_xlat16_2.x), 1.0);
        u_xlat5 = (u_xlatb40) ? 1.0 : u_xlat39;
        u_xlat16_5.x = half(u_xlat5);
    }
    u_xlatb39 = 0.0<FGlobals.CloudParam.w;
    if(u_xlatb39){
        u_xlat6 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
        u_xlat6 = fma(u_xlat6, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
        u_xlat6 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat6);
        u_xlat16_39 = CloudTex.sample(samplerCloudTex, u_xlat6.xy).y;
        u_xlat16_40 = CloudTex.sample(samplerCloudTex, u_xlat6.zw).w;
        u_xlat16_18.x = u_xlat16_40 * half(0.5);
        u_xlat16_18.x = fma(u_xlat16_39, half(0.5), u_xlat16_18.x);
        u_xlat16_39 = fma((-u_xlat16_18.x), u_xlat16_18.x, u_xlat16_18.x);
        u_xlat40 = fma((-float(u_xlat16_18.x)), float(u_xlat16_18.x), FGlobals.CloudParam.y);
        u_xlat16_39 = half(1.0) / u_xlat16_39;
        u_xlat39 = float(u_xlat16_39) * u_xlat40;
        u_xlat39 = clamp(u_xlat39, 0.0f, 1.0f);
        u_xlat40 = fma(u_xlat39, -2.0, 3.0);
        u_xlat39 = u_xlat39 * u_xlat39;
        u_xlat39 = u_xlat39 * u_xlat40;
        u_xlat39 = fma((-u_xlat39), FGlobals.CloudParam.z, 1.0);
        u_xlat39 = clamp(u_xlat39, 0.0f, 1.0f);
        u_xlat16_5.x = half(min(u_xlat39, float(u_xlat16_5.x)));
    }
    u_xlat2.xyz = float3(u_xlat16_4.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_18.x = dot(u_xlat16_3.xzw, u_xlat16_1.xyz);
    u_xlat16_18.x = clamp(u_xlat16_18.x, 0.0h, 1.0h);
    u_xlat16_31.x = dot(u_xlat16_3.xzw, u_xlat16_0.xyz);
    u_xlat16_31.x = clamp(u_xlat16_31.x, 0.0h, 1.0h);
    u_xlat16_0.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_9.xyz = u_xlat16_18.xxx * u_xlat16_0.xyz;
    u_xlat16_18.x = fma(u_xlat16_43, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_31.x), u_xlat16_31.x, half(1.0));
    u_xlat16_43 = u_xlat16_43 * u_xlat16_43;
    u_xlat16_13 = u_xlat16_43 * u_xlat16_31.x;
    u_xlat16_0.x = fma(u_xlat16_13, u_xlat16_13, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_43 / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_18.x;
    u_xlat16_0.xyz = fma(u_xlat16_0.xxx, half3(0.0399999991, 0.0399999991, 0.0399999991), u_xlat16_4.xyz);
    u_xlat16_0.xyz = u_xlat16_0.xyz * u_xlat16_9.xyz;
    u_xlat16_4.xyz = u_xlat16_5.xxx * u_xlat16_0.xyz;
    u_xlat16_4.xyz = half3(fma(u_xlat2.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_4.xyz)));
    u_xlat16_4.xyz = u_xlat16_2.www * u_xlat16_4.xyz;
    u_xlat16_43 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_43 = min(u_xlat16_43, half(1.0));
    u_xlat16_5.x = (-u_xlat16_43) + half(1.0);
    u_xlat16_43 = fma(FGlobals._VertexOcclusionIntensity, u_xlat16_5.x, u_xlat16_43);
    u_xlat16_4.xyz = half3(u_xlat16_43) * u_xlat16_4.xyz;
    u_xlat0.xyz = input.TEXCOORD0.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
    u_xlat1 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat14.x = max(u_xlat1, 0.00100000005);
    u_xlat14.x = rsqrt(u_xlat14.x);
    u_xlat14.xyz = u_xlat0.xyz * u_xlat14.xxx;
    u_xlat1 = sqrt(u_xlat1);
    u_xlat16_43 = half(u_xlat1 + (-float(FGlobals.gFogParams[1].z)));
    u_xlat16_43 = max(u_xlat16_43, half(0.0));
    u_xlatb2.xyz = (half3(0.5, 0.5, 0.5)<FGlobals.gFogParams[7].wzx);
    u_xlatb41 = u_xlatb2.y || u_xlatb2.x;
    if(u_xlatb41){
        u_xlat7.xy = input.TEXCOORD0.xz + (-FGlobals._VT_TerrainInfo.zw);
        u_xlat7.xy = u_xlat7.xy * FGlobals._VT_TerrainInfo.yy;
        u_xlat7.xy = clamp(u_xlat7.xy, 0.0f, 1.0f);
        u_xlat16_41 = _VT_IndexTex.sample(sampler_VT_IndexTex, u_xlat7.xy, level(0.0)).x;
        u_xlat41 = fma(float(u_xlat16_41), 255.0, 0.5);
        u_xlatu41 = uint(u_xlat41);
        u_xlatu33 = u_xlatu41 & 0x7fu;
        u_xlat8.z = float(u_xlatu33);
        u_xlatu41 = u_xlatu41 >> 0x7u;
        u_xlat41 = float(u_xlatu41);
        u_xlati33.xy = int2(FGlobals._VT_TerrainTileInfo.yz);
        u_xlati33.x = (-u_xlati33.y) + u_xlati33.x;
        u_xlati33.x = 0x1 << u_xlati33.x;
        u_xlat33 = float(u_xlati33.x);
        u_xlat11.xy = float2(int2(FGlobals._VT_RootSize, FGlobals._VT_MaxVTMip));
        u_xlat7.xy = u_xlat7.xy * u_xlat11.xx;
        u_xlat11.xz = u_xlat7.xy / float2(u_xlat33);
        u_xlat11.xz = floor(u_xlat11.xz);
        u_xlat7.xy = fma((-u_xlat11.xz), float2(u_xlat33), u_xlat7.xy);
        u_xlat8.xy = u_xlat7.xy / float2(u_xlat33);
        u_xlat8.xy = clamp(u_xlat8.xy, 0.0f, 1.0f);
        u_xlat41 = min(u_xlat41, u_xlat11.y);
        u_xlat10_41 = half(_VT_WorldYTex.sample(vt_linear_clamp_sampler, u_xlat8.xy, round(u_xlat8.z), level(u_xlat41)).x);
        u_xlat7.x = (-FGlobals._VT_TerrainHeightInfo.x) + FGlobals._VT_TerrainHeightInfo.y;
        u_xlat41 = fma(float(u_xlat10_41), u_xlat7.x, FGlobals._VT_TerrainHeightInfo.x);
        u_xlat41 = u_xlat41 + FGlobals._VT_TerrainHeightInfo.w;
        u_xlat41 = max(u_xlat41, -1000000.0);
        u_xlat41 = min(u_xlat41, 1000000.0);
    } else {
        u_xlat41 = 0.0;
    }
    u_xlat16_5.x = FGlobals.gFogParams[0].w + FGlobals.gFogParams[1].x;
    u_xlat7.x = (-u_xlat41) + input.TEXCOORD0.y;
    u_xlat0.w = u_xlat7.x + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = dot(u_xlat0.xzw, u_xlat0.xzw);
    u_xlat0.x = sqrt(u_xlat0.x);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlat26 = (u_xlatb2.x) ? u_xlat0.w : u_xlat0.y;
    u_xlat16_43 = (u_xlatb2.x) ? half(u_xlat0.x) : u_xlat16_43;
    u_xlat16_18.x = half(float(FGlobals.gFogParams[1].z) / u_xlat1);
    u_xlat16_18.x = clamp(u_xlat16_18.x, 0.0h, 1.0h);
    u_xlat0.x = fma(u_xlat26, float(u_xlat16_18.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[0].x));
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[1].w);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_18.x = (-u_xlat16_18.x) + half(1.0);
    u_xlat26 = u_xlat26 * float(u_xlat16_18.x);
    u_xlat26 = u_xlat26 * float(FGlobals.gFogParams[1].w);
    u_xlat26 = max(u_xlat26, -64.0);
    u_xlat26 = min(u_xlat26, -0.00100000005);
    u_xlat39 = exp2((-u_xlat26));
    u_xlat39 = (-u_xlat39) + 1.0;
    u_xlat39 = u_xlat39 / u_xlat26;
    u_xlatb26 = 0.00999999978<(-u_xlat26);
    u_xlat26 = (u_xlatb26) ? u_xlat39 : 0.693147004;
    u_xlat0.x = u_xlat26 * u_xlat0.x;
    u_xlat16_43 = half(u_xlat0.x * (-float(u_xlat16_43)));
    u_xlat16_43 = u_xlat16_5.x * u_xlat16_43;
    u_xlat16_43 = u_xlat16_43 * FGlobals.gFogParams[0].y;
    u_xlat16_43 = exp2(u_xlat16_43);
    u_xlat16_43 = max(u_xlat16_43, FGlobals.gFogParams[0].z);
    u_xlat16_18.x = dot(float3(FGlobals.gLightBuffer[11].xyz), u_xlat14.xyz);
    u_xlat16_9.xyz = FGlobals.gFogParams[0].www * FGlobals.gFogParams[2].xyz;
    u_xlat16_31.x = fma(u_xlat16_18.x, u_xlat16_18.x, half(1.0));
    u_xlat16_10.xyz = FGlobals.gFogParams[1].xxx * FGlobals.gFogParams[3].xyz;
    u_xlat16_31.y = fma((-FGlobals.gFogParams[1].y), FGlobals.gFogParams[1].y, half(1.0));
    u_xlat16_0.xz = u_xlat16_31.xy * half2(0.0596831031, 0.119366206);
    u_xlat16_12.xy = fma(FGlobals.gFogParams[1].yy, FGlobals.gFogParams[1].yy, half2(1.0, 2.0));
    u_xlat16_18.x = dot(u_xlat16_18.xx, FGlobals.gFogParams[1].yy);
    u_xlat16_18.x = (-u_xlat16_18.x) + u_xlat16_12.x;
    u_xlat16_18.x = log2(abs(u_xlat16_18.x));
    u_xlat16_18.x = u_xlat16_18.x * half(-1.5);
    u_xlat16_18.x = exp2(u_xlat16_18.x);
    u_xlat16_26 = u_xlat16_0.z * u_xlat16_18.x;
    u_xlat16_26 = u_xlat16_31.x * u_xlat16_26;
    u_xlat16_26 = u_xlat16_26 / u_xlat16_12.y;
    u_xlat16_18.xyz = half3(u_xlat16_26) * u_xlat16_10.xyz;
    u_xlat16_10.xyz = FGlobals.gLightBuffer[12].xyz * FGlobals.gFogParams[2].www;
    u_xlat16_18.xyz = fma(u_xlat16_9.xyz, u_xlat16_0.xxx, u_xlat16_18.xyz);
    u_xlat16_18.xyz = u_xlat16_18.xyz * u_xlat16_10.xyz;
    u_xlat16_5.xyz = u_xlat16_18.xyz / u_xlat16_5.xxx;
    u_xlat16_44 = (-u_xlat16_43) + half(1.0);
    u_xlat16_5.xyz = half3(u_xlat16_44) * u_xlat16_5.xyz;
    u_xlat0.x = u_xlat41 + float(FGlobals.gFogParams[3].w);
    u_xlat0.x = (u_xlatb2.y) ? u_xlat0.x : float(FGlobals.gFogParams[3].w);
    u_xlat16_44 = half(u_xlat1 + (-float(FGlobals.gFogParams[5].y)));
    u_xlat16_44 = max(u_xlat16_44, half(0.0));
    u_xlat16_9.x = half(float(FGlobals.gFogParams[5].y) / u_xlat1);
    u_xlat16_9.x = clamp(u_xlat16_9.x, 0.0h, 1.0h);
    u_xlat26 = fma(u_xlat0.y, float(u_xlat16_9.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = (-u_xlat0.x) + u_xlat26;
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[5].z);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_9.x = (-u_xlat16_9.x) + half(1.0);
    u_xlat13.x = u_xlat0.y * float(u_xlat16_9.x);
    u_xlat13.x = u_xlat13.x * float(FGlobals.gFogParams[5].z);
    u_xlat13.x = max(u_xlat13.x, -64.0);
    u_xlat13.x = min(u_xlat13.x, -0.00100000005);
    u_xlat26 = exp2((-u_xlat13.x));
    u_xlat26 = (-u_xlat26) + 1.0;
    u_xlat26 = u_xlat26 / u_xlat13.x;
    u_xlatb13 = 0.00999999978<(-u_xlat13.x);
    u_xlat13.x = (u_xlatb13) ? u_xlat26 : 0.693147004;
    u_xlat0.x = u_xlat13.x * u_xlat0.x;
    u_xlat16_44 = half(u_xlat0.x * (-float(u_xlat16_44)));
    u_xlat16_44 = u_xlat16_44 * FGlobals.gFogParams[4].w;
    u_xlat16_44 = exp2(u_xlat16_44);
    u_xlat16_44 = max(u_xlat16_44, FGlobals.gFogParams[5].x);
    u_xlat16_0.xy = max(FGlobals.gFogParams[9].xy, half2(9.99999975e-05, 9.99999975e-05));
    u_xlat26 = u_xlat1 + (-float(FGlobals.gFogParams[1].z));
    u_xlat16_0.xy = half2(1.0, 1.0) / u_xlat16_0.xy;
    u_xlat0.x = float(u_xlat16_0.x) * u_xlat26;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat26 = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat26;
    u_xlat26 = u_xlat1 + (-float(FGlobals.gFogParams[5].y));
    u_xlat13.x = float(u_xlat16_0.y) * u_xlat26;
    u_xlat13.x = clamp(u_xlat13.x, 0.0f, 1.0f);
    u_xlat26 = fma(u_xlat13.x, -2.0, 3.0);
    u_xlat13.x = u_xlat13.x * u_xlat13.x;
    u_xlat13.x = u_xlat13.x * u_xlat26;
    u_xlat16_5.xyz = half3(u_xlat0.xxx * float3(u_xlat16_5.xyz));
    u_xlat16_26 = u_xlat16_43 + half(-1.0);
    u_xlat0.x = fma(u_xlat0.x, float(u_xlat16_26), 1.0);
    u_xlat16_26 = u_xlat16_44 + half(-1.0);
    u_xlat13.x = fma(u_xlat13.x, float(u_xlat16_26), 1.0);
    u_xlat16_43 = half((-u_xlat13.x) + 1.0);
    u_xlat16_5.xyz = half3(u_xlat13.xxx * float3(u_xlat16_5.xyz));
    u_xlat16_1.xyz = fma(FGlobals.gFogParams[4].xyz, half3(u_xlat16_43), u_xlat16_5.xyz);
    u_xlat16_1.w = half(u_xlat0.x * u_xlat13.x);
    if(u_xlatb2.z){
        u_xlat16_5.xy = half2(fma(input.TEXCOORD0.xz, float2(FGlobals.gFogParams[8].xy), float2(FGlobals.gFogParams[8].zw)));
        u_xlat16_43 = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_5.xy), level(0.0)).x;
        u_xlat16_43 = log2(u_xlat16_43);
        u_xlat16_43 = u_xlat16_43 * FGlobals.gFogParams[7].y;
        u_xlat16_43 = exp2(u_xlat16_43);
        u_xlat16_5.x = half(fma((-u_xlat13.x), u_xlat0.x, 1.0));
        u_xlat16_1.w = fma(u_xlat16_43, u_xlat16_5.x, u_xlat16_1.w);
        u_xlat16_1.xyz = fma(half3(u_xlat16_43), (-u_xlat16_1.xyz), u_xlat16_1.xyz);
    }
    u_xlatb0 = half(0.0)<FGlobals._ScreenCenterFogParams0.z;
    u_xlat13.xyz = input.TEXCOORD0.yyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1].xyw;
    u_xlat13.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0].xyw, input.TEXCOORD0.xxx, u_xlat13.xyz);
    u_xlat13.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2].xyw, input.TEXCOORD0.zzz, u_xlat13.xyz);
    u_xlat13.xyz = u_xlat13.xyz + UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3].xyw;
    u_xlat13.xy = u_xlat13.xy / u_xlat13.zz;
    u_xlat13.xy = fma(u_xlat13.xy, float2(0.5, 0.5), float2(0.5, 0.5));
    u_xlat16_2.xy = FGlobals._ScreenCenterFogParams1.xy + half2(0.5, 0.5);
    u_xlat13.xy = u_xlat13.xy + (-float2(u_xlat16_2.xy));
    u_xlat13.x = dot(u_xlat13.xy, u_xlat13.xy);
    u_xlat13.x = sqrt(u_xlat13.x);
    u_xlat16_43 = half(u_xlat13.x + (-float(FGlobals._ScreenCenterFogParams0.x)));
    u_xlat16_5.x = half(1.0) / FGlobals._ScreenCenterFogParams0.y;
    u_xlat16_43 = u_xlat16_43 * u_xlat16_5.x;
    u_xlat16_43 = clamp(u_xlat16_43, 0.0h, 1.0h);
    u_xlat16_5.x = fma(u_xlat16_43, half(-2.0), half(3.0));
    u_xlat16_43 = u_xlat16_43 * u_xlat16_43;
    u_xlat16_43 = fma((-u_xlat16_5.x), u_xlat16_43, half(1.0));
    u_xlat16_5.x = u_xlat16_43 * FGlobals._ScreenCenterFogParams0.z;
    u_xlat16_43 = fma((-u_xlat16_43), FGlobals._ScreenCenterFogParams0.z, half(1.0));
    u_xlat16_2.xyz = u_xlat16_1.xyz * half3(u_xlat16_43);
    u_xlat16_43 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_2.w = fma(u_xlat16_5.x, u_xlat16_43, u_xlat16_1.w);
    u_xlat16_0 = (bool(u_xlatb0)) ? u_xlat16_2 : u_xlat16_1;
    output.SV_TARGET0.xyz = fma(u_xlat16_4.xyz, u_xlat16_0.www, u_xlat16_0.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
