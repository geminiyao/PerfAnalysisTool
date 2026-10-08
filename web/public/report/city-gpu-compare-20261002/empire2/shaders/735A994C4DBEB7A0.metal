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
    half _Intensity ;
    half4 _TintColorHDR ;
    half4 _SecondTintColorHDR ;
    half4 _RoughnessScale ;
    half _OpacityMaskClipValue ;
    half _MipScale ;
    half _VertexOcclusionIntensity ;
    half4 _SnowColor ;
    half _SnowLevel ;
    half _SnowNoise ;
    half _SnowNoiseInvert ;
    half _SnowIntensity ;
    half _SnowWetness ;
    half _SnowOcclusion ;
    half4 gLightBuffer [116];
    half4 gFogParams [10];
    float4 gShadowParams0 [7];
    float gPlanarShadowEnabled ;
    half gShadowEnableDynamicShadow ;
    float4 gPlanarShadowParams ;
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
    sampler sampler_VT_IndexTex [[ sampler (2) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(1) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(2) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(3) ]] ,
    texture2d<half, access::sample > BnSFog_FogMaskTex [[ texture(4) ]] ,
    texture2d<half, access::sample > _VT_IndexTex [[ texture(5) ]] ,
    texture2d_array<half, access::sample > _VT_WorldYTex [[ texture(6) ]] ,
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
    float2 u_xlat2;
    half4 u_xlat16_2;
    float4 u_xlat3;
    half4 u_xlat16_3;
    float3 u_xlat4;
    half4 u_xlat16_4;
    bool3 u_xlatb4;
    half3 u_xlat16_5;
    float u_xlat6;
    half3 u_xlat16_6;
    half3 u_xlat16_7;
    float3 u_xlat8;
    bool u_xlatb8;
    half3 u_xlat16_9;
    float3 u_xlat10;
    float3 u_xlat11;
    half2 u_xlat16_12;
    float3 u_xlat13;
    half u_xlat16_13;
    bool u_xlatb13;
    float3 u_xlat14;
    bool2 u_xlatb17;
    half3 u_xlat16_19;
    half3 u_xlat16_20;
    float u_xlat21;
    bool2 u_xlatb21;
    float u_xlat26;
    half u_xlat16_26;
    bool u_xlatb26;
    float u_xlat30;
    half2 u_xlat16_32;
    half2 u_xlat16_33;
    float u_xlat34;
    int2 u_xlati34;
    uint u_xlatu34;
    bool2 u_xlatb34;
    float u_xlat39;
    half u_xlat16_39;
    bool u_xlatb39;
    float u_xlat40;
    half u_xlat16_40;
    bool u_xlatb40;
    float u_xlat43;
    half u_xlat16_43;
    half u_xlat10_43;
    uint u_xlatu43;
    bool u_xlatb43;
    half u_xlat16_44;
    half u_xlat16_45;
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
    u_xlat16_3 = u_xlat16_3 * half4(FGlobals._Intensity);
    u_xlat16_4 = _NormalTex.sample(sampler_NormalTex, u_xlat2.xy);
    u_xlat16_5.xyz = (-FGlobals._TintColorHDR.xyz) + FGlobals._SecondTintColorHDR.xyz;
    u_xlat16_5.xyz = fma(u_xlat16_5.xyz, half3(0.5, 0.5, 0.5), FGlobals._TintColorHDR.xyz);
    u_xlat16_6.xyz = u_xlat16_3.xyz * u_xlat16_5.xyz;
    u_xlat16_7.xy = half2(u_xlat2.xy * float2(FGlobals._MainTex_TexelSize.zw));
    u_xlat16_33.xy = dfdx(u_xlat16_7.xy);
    u_xlat16_7.xy = dfdy(u_xlat16_7.xy);
    u_xlat16_44 = dot(u_xlat16_33.xy, u_xlat16_33.xy);
    u_xlat16_45 = dot(u_xlat16_7.xy, u_xlat16_7.xy);
    u_xlat16_44 = max(u_xlat16_44, u_xlat16_45);
    u_xlat16_44 = log2(u_xlat16_44);
    u_xlat16_44 = u_xlat16_44 * half(0.5);
    u_xlat16_44 = max(u_xlat16_44, half(0.0));
    u_xlat16_44 = fma(u_xlat16_44, FGlobals._MipScale, half(1.0));
    u_xlat39 = float(u_xlat16_3.w) * float(u_xlat16_44);
    u_xlat16_40 = fma(u_xlat16_3.w, u_xlat16_44, (-FGlobals._OpacityMaskClipValue));
    u_xlat2.x = dfdx(u_xlat39);
    u_xlat39 = dfdy(u_xlat39);
    u_xlat39 = abs(u_xlat39) + abs(u_xlat2.x);
    u_xlat39 = max(u_xlat39, 9.99999975e-05);
    u_xlat39 = float(u_xlat16_40) / u_xlat39;
    u_xlat39 = u_xlat39 + 0.5;
    u_xlat16_44 = u_xlat16_4.z + u_xlat16_4.z;
    u_xlat16_2.xy = fma(u_xlat16_4.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_2.z = (-u_xlat16_2.y);
    u_xlat16_45 = dot(u_xlat16_2.xz, u_xlat16_2.xz);
    u_xlat16_45 = min(u_xlat16_45, half(1.0));
    u_xlat16_45 = (-u_xlat16_45) + half(1.0);
    u_xlat16_2.w = sqrt(u_xlat16_45);
    u_xlatb40 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_20.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_45 = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_20.x = (u_xlatb40) ? FGlobals.gLightBuffer[8].x : u_xlat16_45;
    u_xlat16_45 = dot(FGlobals._RoughnessScale.xyz, u_xlat16_20.xyz);
    u_xlat16_45 = u_xlat16_4.z * u_xlat16_45;
    u_xlat16_7.x = input.TEXCOORD5.y + (-FGlobals._SnowLevel);
    u_xlat16_7.x = u_xlat16_7.x / FGlobals._SnowWetness;
    u_xlat16_7.x = clamp(u_xlat16_7.x, 0.0h, 1.0h);
    u_xlat16_20.x = u_xlat16_4.z + FGlobals._SnowNoiseInvert;
    u_xlat16_44 = fma((-u_xlat16_44), FGlobals._SnowNoiseInvert, u_xlat16_20.x);
    u_xlat16_44 = log2(u_xlat16_44);
    u_xlat16_44 = u_xlat16_44 * FGlobals._SnowNoise;
    u_xlat16_44 = exp2(u_xlat16_44);
    u_xlat16_44 = u_xlat16_44 * FGlobals._SnowIntensity;
    u_xlat16_44 = u_xlat16_44 * u_xlat16_7.x;
    u_xlat16_7.x = log2(input.TEXCOORD2.w);
    u_xlat16_7.x = u_xlat16_7.x * FGlobals._SnowOcclusion;
    u_xlat16_7.x = exp2(u_xlat16_7.x);
    u_xlat16_44 = u_xlat16_44 * u_xlat16_7.x;
    u_xlat16_44 = clamp(u_xlat16_44, 0.0h, 1.0h);
    u_xlat16_7.x = u_xlat16_44 * FGlobals.gLightBuffer[8].z;
    u_xlat16_44 = fma((-u_xlat16_44), FGlobals.gLightBuffer[8].z, half(1.0));
    u_xlat16_44 = fma(FGlobals._RoughnessScale.w, u_xlat16_7.x, u_xlat16_44);
    u_xlat16_44 = u_xlat16_44 * u_xlat16_45;
    u_xlat16_5.xyz = fma((-u_xlat16_3.xyz), u_xlat16_5.xyz, FGlobals._SnowColor.xyz);
    u_xlat16_5.xyz = fma(u_xlat16_7.xxx, u_xlat16_5.xyz, u_xlat16_6.xyz);
    u_xlat16_44 = max(u_xlat16_44, half(0.119999997));
    u_xlat16_44 = min(u_xlat16_44, half(1.0));
    u_xlat16_6.x = half(u_xlat39 + (-float(FGlobals._OpacityMaskClipValue)));
    u_xlatb39 = u_xlat16_6.x<half(0.0);
    if(((int(u_xlatb39) * int(0xffffffffu)))!=0){discard_fragment();}
    u_xlatb39 = 0.0>=FGlobals.gShadowParams0[5].z;
    if(u_xlatb39){
        u_xlat16_6.x = half(1.0);
    }
    if(!u_xlatb39){
        u_xlat4.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlatb39 = 0.5<FGlobals.gPlanarShadowEnabled;
        u_xlat40 = input.TEXCOORD0.y + 100.0;
        u_xlat40 = u_xlat40 / FGlobals.gPlanarShadowParams.y;
        u_xlatb8 = FGlobals.gPlanarShadowEnabled<0.5;
        u_xlat21 = min(u_xlat4.z, 0.999000013);
        u_xlat30 = (u_xlatb8) ? u_xlat21 : u_xlat4.z;
        u_xlat30 = (u_xlatb39) ? u_xlat40 : u_xlat30;
        u_xlat8.x = u_xlat30 + FGlobals.gShadowParams0[4].z;
        u_xlat21 = (-u_xlat8.x) + 1.0;
        u_xlat8.x = (u_xlatb39) ? u_xlat8.x : u_xlat21;
        u_xlat8.x = float(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat4.xy, saturate(u_xlat8.x), level(0.0)));
        u_xlatb21.xy = (u_xlat4.xy<float2(0.0, 0.0));
        u_xlatb21.x = u_xlatb21.y || u_xlatb21.x;
        u_xlatb34.xy = (float2(1.0, 1.0)<u_xlat4.xy);
        u_xlatb34.x = u_xlatb34.y || u_xlatb34.x;
        u_xlatb21.x = u_xlatb34.x || u_xlatb21.x;
        u_xlat16_19.x = (u_xlatb21.x) ? half(1.0) : half(u_xlat8.x);
        u_xlatb8 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb8){
            if(u_xlatb39){
                u_xlat8.x = (-input.TEXCOORD0.y) + FGlobals.gPlanarShadowParams.x;
                u_xlat8.x = u_xlat8.x / float(FGlobals.gLightBuffer[11].y);
                u_xlat3.xyz = fma(float3(FGlobals.gLightBuffer[11].xyz), u_xlat8.xxx, input.TEXCOORD0.xyz);
                u_xlat3.w = 1.0;
                u_xlat8.x = dot(FGlobals.gShadowParams0[0], u_xlat3);
                u_xlat8.y = dot(FGlobals.gShadowParams0[1], u_xlat3);
                u_xlat8.z = dot(FGlobals.gShadowParams0[3], u_xlat3);
                u_xlat16_7.xyz = half3(u_xlat8.xyz * float3(0.5, 0.5, 0.5));
                u_xlat16_9.x = u_xlat16_7.z + u_xlat16_7.x;
                u_xlat16_9.y = half(fma(float(u_xlat16_7.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_7.z)));
                u_xlat40 = u_xlat40 * u_xlat8.z;
                u_xlat8.xy = float2(u_xlat16_9.xy) / u_xlat8.zz;
                u_xlat30 = u_xlat40 / u_xlat8.z;
            } else {
                u_xlat8.xy = fma(u_xlat4.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            }
            u_xlat40 = u_xlat30 + FGlobals.gShadowParams0[4].z;
            u_xlat4.x = (-u_xlat40) + 1.0;
            u_xlat40 = (u_xlatb39) ? u_xlat40 : u_xlat4.x;
            u_xlat40 = float(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat8.xy, saturate(u_xlat40), level(0.0)));
            u_xlatb4.xy = (u_xlat8.xy<float2(0.0, 0.0));
            u_xlatb4.x = u_xlatb4.y || u_xlatb4.x;
            u_xlatb17.xy = (float2(1.0, 1.0)<u_xlat8.xy);
            u_xlatb17.x = u_xlatb17.y || u_xlatb17.x;
            u_xlatb4.x = u_xlatb17.x || u_xlatb4.x;
            u_xlat16_32.x = (u_xlatb4.x) ? half(1.0) : half(u_xlat40);
            u_xlat16_19.x = min(u_xlat16_32.x, u_xlat16_19.x);
        }
        u_xlat39 = (u_xlatb39) ? -100.0 : -30.0;
        u_xlatb39 = input.TEXCOORD0.y<u_xlat39;
        u_xlat16_40 = u_xlat16_19.x + half(-1.0);
        u_xlat40 = fma(FGlobals.gShadowParams0[5].z, float(u_xlat16_40), 1.0);
        u_xlat6 = (u_xlatb39) ? 1.0 : u_xlat40;
        u_xlat16_6.x = half(u_xlat6);
    }
    u_xlat4.xyz = float3(u_xlat16_5.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_19.x = dot(u_xlat16_2.xzw, u_xlat16_1.xyz);
    u_xlat16_19.x = clamp(u_xlat16_19.x, 0.0h, 1.0h);
    u_xlat16_32.x = dot(u_xlat16_2.xzw, u_xlat16_0.xyz);
    u_xlat16_32.x = clamp(u_xlat16_32.x, 0.0h, 1.0h);
    u_xlat16_0.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_7.xyz = u_xlat16_19.xxx * u_xlat16_0.xyz;
    u_xlat16_19.x = fma(u_xlat16_44, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_32.x), u_xlat16_32.x, half(1.0));
    u_xlat16_44 = u_xlat16_44 * u_xlat16_44;
    u_xlat16_13 = u_xlat16_44 * u_xlat16_32.x;
    u_xlat16_0.x = fma(u_xlat16_13, u_xlat16_13, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_44 / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_19.x;
    u_xlat16_0.xyz = fma(u_xlat16_0.xxx, half3(0.0399999991, 0.0399999991, 0.0399999991), u_xlat16_5.xyz);
    u_xlat16_0.xyz = u_xlat16_0.xyz * u_xlat16_7.xyz;
    u_xlat16_5.xyz = u_xlat16_6.xxx * u_xlat16_0.xyz;
    u_xlat16_5.xyz = half3(fma(u_xlat4.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_5.xyz)));
    u_xlat16_5.xyz = u_xlat16_4.www * u_xlat16_5.xyz;
    u_xlat16_44 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_44 = min(u_xlat16_44, half(1.0));
    u_xlat16_6.x = (-u_xlat16_44) + half(1.0);
    u_xlat16_44 = fma(FGlobals._VertexOcclusionIntensity, u_xlat16_6.x, u_xlat16_44);
    u_xlat16_5.xyz = half3(u_xlat16_44) * u_xlat16_5.xyz;
    u_xlat0.xyz = input.TEXCOORD0.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
    u_xlat1 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat14.x = max(u_xlat1, 0.00100000005);
    u_xlat14.x = rsqrt(u_xlat14.x);
    u_xlat14.xyz = u_xlat0.xyz * u_xlat14.xxx;
    u_xlat1 = sqrt(u_xlat1);
    u_xlat16_44 = half(u_xlat1 + (-float(FGlobals.gFogParams[1].z)));
    u_xlat16_44 = max(u_xlat16_44, half(0.0));
    u_xlatb4.xyz = (half3(0.5, 0.5, 0.5)<FGlobals.gFogParams[7].wzx);
    u_xlatb43 = u_xlatb4.y || u_xlatb4.x;
    if(u_xlatb43){
        u_xlat8.xy = input.TEXCOORD0.xz + (-FGlobals._VT_TerrainInfo.zw);
        u_xlat8.xy = u_xlat8.xy * FGlobals._VT_TerrainInfo.yy;
        u_xlat8.xy = clamp(u_xlat8.xy, 0.0f, 1.0f);
        u_xlat16_43 = _VT_IndexTex.sample(sampler_VT_IndexTex, u_xlat8.xy, level(0.0)).x;
        u_xlat43 = fma(float(u_xlat16_43), 255.0, 0.5);
        u_xlatu43 = uint(u_xlat43);
        u_xlatu34 = u_xlatu43 & 0x7fu;
        u_xlat10.z = float(u_xlatu34);
        u_xlatu43 = u_xlatu43 >> 0x7u;
        u_xlat43 = float(u_xlatu43);
        u_xlati34.xy = int2(FGlobals._VT_TerrainTileInfo.yz);
        u_xlati34.x = (-u_xlati34.y) + u_xlati34.x;
        u_xlati34.x = 0x1 << u_xlati34.x;
        u_xlat34 = float(u_xlati34.x);
        u_xlat11.xy = float2(int2(FGlobals._VT_RootSize, FGlobals._VT_MaxVTMip));
        u_xlat8.xy = u_xlat8.xy * u_xlat11.xx;
        u_xlat11.xz = u_xlat8.xy / float2(u_xlat34);
        u_xlat11.xz = floor(u_xlat11.xz);
        u_xlat8.xy = fma((-u_xlat11.xz), float2(u_xlat34), u_xlat8.xy);
        u_xlat10.xy = u_xlat8.xy / float2(u_xlat34);
        u_xlat10.xy = clamp(u_xlat10.xy, 0.0f, 1.0f);
        u_xlat43 = min(u_xlat43, u_xlat11.y);
        u_xlat10_43 = half(_VT_WorldYTex.sample(vt_linear_clamp_sampler, u_xlat10.xy, round(u_xlat10.z), level(u_xlat43)).x);
        u_xlat8.x = (-FGlobals._VT_TerrainHeightInfo.x) + FGlobals._VT_TerrainHeightInfo.y;
        u_xlat43 = fma(float(u_xlat10_43), u_xlat8.x, FGlobals._VT_TerrainHeightInfo.x);
        u_xlat43 = u_xlat43 + FGlobals._VT_TerrainHeightInfo.w;
        u_xlat43 = max(u_xlat43, -1000000.0);
        u_xlat43 = min(u_xlat43, 1000000.0);
    } else {
        u_xlat43 = 0.0;
    }
    u_xlat16_6.x = FGlobals.gFogParams[0].w + FGlobals.gFogParams[1].x;
    u_xlat8.x = (-u_xlat43) + input.TEXCOORD0.y;
    u_xlat0.w = u_xlat8.x + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = dot(u_xlat0.xzw, u_xlat0.xzw);
    u_xlat0.x = sqrt(u_xlat0.x);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlat26 = (u_xlatb4.x) ? u_xlat0.w : u_xlat0.y;
    u_xlat16_44 = (u_xlatb4.x) ? half(u_xlat0.x) : u_xlat16_44;
    u_xlat16_19.x = half(float(FGlobals.gFogParams[1].z) / u_xlat1);
    u_xlat16_19.x = clamp(u_xlat16_19.x, 0.0h, 1.0h);
    u_xlat0.x = fma(u_xlat26, float(u_xlat16_19.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[0].x));
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[1].w);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_19.x = (-u_xlat16_19.x) + half(1.0);
    u_xlat26 = u_xlat26 * float(u_xlat16_19.x);
    u_xlat26 = u_xlat26 * float(FGlobals.gFogParams[1].w);
    u_xlat26 = max(u_xlat26, -64.0);
    u_xlat26 = min(u_xlat26, -0.00100000005);
    u_xlat39 = exp2((-u_xlat26));
    u_xlat39 = (-u_xlat39) + 1.0;
    u_xlat39 = u_xlat39 / u_xlat26;
    u_xlatb26 = 0.00999999978<(-u_xlat26);
    u_xlat26 = (u_xlatb26) ? u_xlat39 : 0.693147004;
    u_xlat0.x = u_xlat26 * u_xlat0.x;
    u_xlat16_44 = half(u_xlat0.x * (-float(u_xlat16_44)));
    u_xlat16_44 = u_xlat16_6.x * u_xlat16_44;
    u_xlat16_44 = u_xlat16_44 * FGlobals.gFogParams[0].y;
    u_xlat16_44 = exp2(u_xlat16_44);
    u_xlat16_44 = max(u_xlat16_44, FGlobals.gFogParams[0].z);
    u_xlat16_19.x = dot(float3(FGlobals.gLightBuffer[11].xyz), u_xlat14.xyz);
    u_xlat16_7.xyz = FGlobals.gFogParams[0].www * FGlobals.gFogParams[2].xyz;
    u_xlat16_32.x = fma(u_xlat16_19.x, u_xlat16_19.x, half(1.0));
    u_xlat16_9.xyz = FGlobals.gFogParams[1].xxx * FGlobals.gFogParams[3].xyz;
    u_xlat16_32.y = fma((-FGlobals.gFogParams[1].y), FGlobals.gFogParams[1].y, half(1.0));
    u_xlat16_0.xz = u_xlat16_32.xy * half2(0.0596831031, 0.119366206);
    u_xlat16_12.xy = fma(FGlobals.gFogParams[1].yy, FGlobals.gFogParams[1].yy, half2(1.0, 2.0));
    u_xlat16_19.x = dot(u_xlat16_19.xx, FGlobals.gFogParams[1].yy);
    u_xlat16_19.x = (-u_xlat16_19.x) + u_xlat16_12.x;
    u_xlat16_19.x = log2(abs(u_xlat16_19.x));
    u_xlat16_19.x = u_xlat16_19.x * half(-1.5);
    u_xlat16_19.x = exp2(u_xlat16_19.x);
    u_xlat16_26 = u_xlat16_0.z * u_xlat16_19.x;
    u_xlat16_26 = u_xlat16_32.x * u_xlat16_26;
    u_xlat16_26 = u_xlat16_26 / u_xlat16_12.y;
    u_xlat16_19.xyz = half3(u_xlat16_26) * u_xlat16_9.xyz;
    u_xlat16_9.xyz = FGlobals.gLightBuffer[12].xyz * FGlobals.gFogParams[2].www;
    u_xlat16_19.xyz = fma(u_xlat16_7.xyz, u_xlat16_0.xxx, u_xlat16_19.xyz);
    u_xlat16_19.xyz = u_xlat16_19.xyz * u_xlat16_9.xyz;
    u_xlat16_6.xyz = u_xlat16_19.xyz / u_xlat16_6.xxx;
    u_xlat16_45 = (-u_xlat16_44) + half(1.0);
    u_xlat16_6.xyz = half3(u_xlat16_45) * u_xlat16_6.xyz;
    u_xlat0.x = u_xlat43 + float(FGlobals.gFogParams[3].w);
    u_xlat0.x = (u_xlatb4.y) ? u_xlat0.x : float(FGlobals.gFogParams[3].w);
    u_xlat16_45 = half(u_xlat1 + (-float(FGlobals.gFogParams[5].y)));
    u_xlat16_45 = max(u_xlat16_45, half(0.0));
    u_xlat16_7.x = half(float(FGlobals.gFogParams[5].y) / u_xlat1);
    u_xlat16_7.x = clamp(u_xlat16_7.x, 0.0h, 1.0h);
    u_xlat26 = fma(u_xlat0.y, float(u_xlat16_7.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = (-u_xlat0.x) + u_xlat26;
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[5].z);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_7.x = (-u_xlat16_7.x) + half(1.0);
    u_xlat13.x = u_xlat0.y * float(u_xlat16_7.x);
    u_xlat13.x = u_xlat13.x * float(FGlobals.gFogParams[5].z);
    u_xlat13.x = max(u_xlat13.x, -64.0);
    u_xlat13.x = min(u_xlat13.x, -0.00100000005);
    u_xlat26 = exp2((-u_xlat13.x));
    u_xlat26 = (-u_xlat26) + 1.0;
    u_xlat26 = u_xlat26 / u_xlat13.x;
    u_xlatb13 = 0.00999999978<(-u_xlat13.x);
    u_xlat13.x = (u_xlatb13) ? u_xlat26 : 0.693147004;
    u_xlat0.x = u_xlat13.x * u_xlat0.x;
    u_xlat16_45 = half(u_xlat0.x * (-float(u_xlat16_45)));
    u_xlat16_45 = u_xlat16_45 * FGlobals.gFogParams[4].w;
    u_xlat16_45 = exp2(u_xlat16_45);
    u_xlat16_45 = max(u_xlat16_45, FGlobals.gFogParams[5].x);
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
    u_xlat16_6.xyz = half3(u_xlat0.xxx * float3(u_xlat16_6.xyz));
    u_xlat16_26 = u_xlat16_44 + half(-1.0);
    u_xlat0.x = fma(u_xlat0.x, float(u_xlat16_26), 1.0);
    u_xlat16_26 = u_xlat16_45 + half(-1.0);
    u_xlat13.x = fma(u_xlat13.x, float(u_xlat16_26), 1.0);
    u_xlat16_44 = half((-u_xlat13.x) + 1.0);
    u_xlat16_6.xyz = half3(u_xlat13.xxx * float3(u_xlat16_6.xyz));
    u_xlat16_1.xyz = fma(FGlobals.gFogParams[4].xyz, half3(u_xlat16_44), u_xlat16_6.xyz);
    u_xlat16_1.w = half(u_xlat0.x * u_xlat13.x);
    if(u_xlatb4.z){
        u_xlat16_6.xy = half2(fma(input.TEXCOORD0.xz, float2(FGlobals.gFogParams[8].xy), float2(FGlobals.gFogParams[8].zw)));
        u_xlat16_44 = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_6.xy), level(0.0)).x;
        u_xlat16_44 = log2(u_xlat16_44);
        u_xlat16_44 = u_xlat16_44 * FGlobals.gFogParams[7].y;
        u_xlat16_44 = exp2(u_xlat16_44);
        u_xlat16_6.x = half(fma((-u_xlat13.x), u_xlat0.x, 1.0));
        u_xlat16_1.w = fma(u_xlat16_44, u_xlat16_6.x, u_xlat16_1.w);
        u_xlat16_1.xyz = fma(half3(u_xlat16_44), (-u_xlat16_1.xyz), u_xlat16_1.xyz);
    }
    u_xlatb0 = half(0.0)<FGlobals._ScreenCenterFogParams0.z;
    u_xlat13.xyz = input.TEXCOORD0.yyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1].xyw;
    u_xlat13.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0].xyw, input.TEXCOORD0.xxx, u_xlat13.xyz);
    u_xlat13.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2].xyw, input.TEXCOORD0.zzz, u_xlat13.xyz);
    u_xlat13.xyz = u_xlat13.xyz + UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3].xyw;
    u_xlat13.xy = u_xlat13.xy / u_xlat13.zz;
    u_xlat13.xy = fma(u_xlat13.xy, float2(0.5, 0.5), float2(0.5, 0.5));
    u_xlat16_4.xy = FGlobals._ScreenCenterFogParams1.xy + half2(0.5, 0.5);
    u_xlat13.xy = u_xlat13.xy + (-float2(u_xlat16_4.xy));
    u_xlat13.x = dot(u_xlat13.xy, u_xlat13.xy);
    u_xlat13.x = sqrt(u_xlat13.x);
    u_xlat16_44 = half(u_xlat13.x + (-float(FGlobals._ScreenCenterFogParams0.x)));
    u_xlat16_6.x = half(1.0) / FGlobals._ScreenCenterFogParams0.y;
    u_xlat16_44 = u_xlat16_44 * u_xlat16_6.x;
    u_xlat16_44 = clamp(u_xlat16_44, 0.0h, 1.0h);
    u_xlat16_6.x = fma(u_xlat16_44, half(-2.0), half(3.0));
    u_xlat16_44 = u_xlat16_44 * u_xlat16_44;
    u_xlat16_44 = fma((-u_xlat16_6.x), u_xlat16_44, half(1.0));
    u_xlat16_6.x = u_xlat16_44 * FGlobals._ScreenCenterFogParams0.z;
    u_xlat16_44 = fma((-u_xlat16_44), FGlobals._ScreenCenterFogParams0.z, half(1.0));
    u_xlat16_2.xyz = u_xlat16_1.xyz * half3(u_xlat16_44);
    u_xlat16_44 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_2.w = fma(u_xlat16_6.x, u_xlat16_44, u_xlat16_1.w);
    u_xlat16_0 = (bool(u_xlatb0)) ? u_xlat16_2 : u_xlat16_1;
    output.SV_TARGET0.xyz = fma(u_xlat16_5.xyz, u_xlat16_0.www, u_xlat16_0.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
