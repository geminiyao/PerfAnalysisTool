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
    float4 u_xlat3;
    half4 u_xlat16_3;
    bool2 u_xlatb3;
    half3 u_xlat16_4;
    half4 u_xlat16_5;
    half3 u_xlat16_6;
    float4 u_xlat7;
    bool2 u_xlatb7;
    float3 u_xlat8;
    half3 u_xlat16_9;
    half2 u_xlat16_10;
    float3 u_xlat11;
    half u_xlat16_11;
    bool u_xlatb11;
    float3 u_xlat12;
    float u_xlat13;
    bool2 u_xlatb13;
    float2 u_xlat14;
    bool u_xlatb14;
    float u_xlat16;
    half3 u_xlat16_16;
    half3 u_xlat16_17;
    float u_xlat22;
    half u_xlat16_22;
    bool u_xlatb22;
    float u_xlat24;
    bool u_xlatb24;
    float u_xlat25;
    int2 u_xlati25;
    uint u_xlatu25;
    bool2 u_xlatb25;
    half2 u_xlat16_27;
    float u_xlat33;
    half u_xlat16_33;
    bool u_xlatb33;
    float u_xlat34;
    half u_xlat16_34;
    bool u_xlatb34;
    float u_xlat35;
    half u_xlat16_35;
    half u_xlat10_35;
    uint u_xlatu35;
    bool u_xlatb35;
    bool u_xlatb36;
    half u_xlat16_37;
    half u_xlat16_38;
    u_xlat16_0.x = dot(input.TEXCOORD3.xyz, input.TEXCOORD3.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * input.TEXCOORD3.xyz;
    u_xlat16_33 = dot(input.TEXCOORD4.xyz, input.TEXCOORD4.xyz);
    u_xlat16_33 = max(u_xlat16_33, half(0.00100000005));
    u_xlat16_33 = rsqrt(u_xlat16_33);
    u_xlat16_1.xyz = half3(u_xlat16_33) * input.TEXCOORD4.xyz;
    u_xlat2.x = input.TEXCOORD0.w;
    u_xlat2.y = input.TEXCOORD1.w;
    u_xlat2.xy = fma(u_xlat2.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw));
    u_xlat16_3 = _MainTex.sample(sampler_MainTex, u_xlat2.xy);
    u_xlat16_4.xyz = u_xlat16_3.xyz * FGlobals._TintColorHDR.xyz;
    u_xlat16_5.xy = half2(u_xlat2.xy * float2(FGlobals._MainTex_TexelSize.zw));
    u_xlat16_27.xy = dfdx(u_xlat16_5.xy);
    u_xlat16_5.xy = dfdy(u_xlat16_5.xy);
    u_xlat16_37 = dot(u_xlat16_27.xy, u_xlat16_27.xy);
    u_xlat16_5.x = dot(u_xlat16_5.xy, u_xlat16_5.xy);
    u_xlat16_37 = max(u_xlat16_37, u_xlat16_5.x);
    u_xlat16_37 = log2(u_xlat16_37);
    u_xlat16_37 = u_xlat16_37 * half(0.5);
    u_xlat16_37 = max(u_xlat16_37, half(0.0));
    u_xlat16_37 = fma(u_xlat16_37, FGlobals._MipScale, half(1.0));
    u_xlat33 = float(u_xlat16_3.w) * float(u_xlat16_37);
    u_xlat16_34 = fma(u_xlat16_3.w, u_xlat16_37, (-FGlobals._OpacityMaskClipValue));
    u_xlat24 = dfdx(u_xlat33);
    u_xlat33 = dfdy(u_xlat33);
    u_xlat33 = abs(u_xlat33) + abs(u_xlat24);
    u_xlat33 = max(u_xlat33, 9.99999975e-05);
    u_xlat33 = float(u_xlat16_34) / u_xlat33;
    u_xlat33 = u_xlat33 + 0.5;
    u_xlat16_2 = _NormalTex.sample(sampler_NormalTex, u_xlat2.xy);
    u_xlat16_37 = u_xlat16_2.z + u_xlat16_2.z;
    u_xlat16_5.xy = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_5.z = (-u_xlat16_5.y);
    u_xlat16_16.x = dot(u_xlat16_5.xz, u_xlat16_5.xz);
    u_xlat16_16.x = min(u_xlat16_16.x, half(1.0));
    u_xlat16_16.x = (-u_xlat16_16.x) + half(1.0);
    u_xlat16_5.w = sqrt(u_xlat16_16.x);
    u_xlatb34 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_17.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_16.x = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_17.x = (u_xlatb34) ? FGlobals.gLightBuffer[8].x : u_xlat16_16.x;
    u_xlat16_16.x = dot(FGlobals._RoughnessScale.xyz, u_xlat16_17.xyz);
    u_xlat16_16.x = u_xlat16_2.z * u_xlat16_16.x;
    u_xlat16_6.x = input.TEXCOORD5.y + (-FGlobals._SnowLevel);
    u_xlat16_6.x = u_xlat16_6.x / FGlobals._SnowWetness;
    u_xlat16_6.x = clamp(u_xlat16_6.x, 0.0h, 1.0h);
    u_xlat16_17.x = u_xlat16_2.z + FGlobals._SnowNoiseInvert;
    u_xlat16_37 = fma((-u_xlat16_37), FGlobals._SnowNoiseInvert, u_xlat16_17.x);
    u_xlat16_37 = log2(u_xlat16_37);
    u_xlat16_37 = u_xlat16_37 * FGlobals._SnowNoise;
    u_xlat16_37 = exp2(u_xlat16_37);
    u_xlat16_37 = u_xlat16_37 * FGlobals._SnowIntensity;
    u_xlat16_37 = u_xlat16_37 * u_xlat16_6.x;
    u_xlat16_6.x = log2(input.TEXCOORD2.w);
    u_xlat16_6.x = u_xlat16_6.x * FGlobals._SnowOcclusion;
    u_xlat16_6.x = exp2(u_xlat16_6.x);
    u_xlat16_37 = u_xlat16_37 * u_xlat16_6.x;
    u_xlat16_37 = clamp(u_xlat16_37, 0.0h, 1.0h);
    u_xlatb34 = FGlobals._ShowSnowDirectly<half(1.0);
    u_xlat16_6.x = u_xlat16_37 * FGlobals.gLightBuffer[8].z;
    u_xlat16_37 = (u_xlatb34) ? u_xlat16_6.x : u_xlat16_37;
    u_xlat16_6.x = (-u_xlat16_37) + half(1.0);
    u_xlat16_6.x = fma(FGlobals._RoughnessScale.w, u_xlat16_37, u_xlat16_6.x);
    u_xlat16_16.x = u_xlat16_16.x * u_xlat16_6.x;
    u_xlat16_6.xyz = fma((-u_xlat16_3.xyz), FGlobals._TintColorHDR.xyz, FGlobals._SnowColor.xyz);
    u_xlat16_4.xyz = fma(half3(u_xlat16_37), u_xlat16_6.xyz, u_xlat16_4.xyz);
    u_xlat16_37 = max(u_xlat16_16.x, half(0.119999997));
    u_xlat16_37 = min(u_xlat16_37, half(1.0));
    u_xlat16_16.x = half(u_xlat33 + (-float(FGlobals._OpacityMaskClipValue)));
    u_xlatb33 = u_xlat16_16.x<half(0.0);
    if(((int(u_xlatb33) * int(0xffffffffu)))!=0){discard_fragment();}
    u_xlat33 = FGlobals._ShadowAmount * FGlobals.gShadowParams0[5].z;
    u_xlatb34 = 0.0>=u_xlat33;
    if(u_xlatb34){
        u_xlat16_16.x = half(1.0);
    }
    if(!u_xlatb34){
        u_xlat2.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlatb34 = 0.5<FGlobals.gPlanarShadowEnabled;
        u_xlat3.x = input.TEXCOORD0.y + 100.0;
        u_xlat3.x = u_xlat3.x / FGlobals.gPlanarShadowParams.y;
        u_xlatb14 = FGlobals.gPlanarShadowEnabled<0.5;
        u_xlat25 = min(u_xlat2.z, 0.999000013);
        u_xlat24 = (u_xlatb14) ? u_xlat25 : u_xlat2.z;
        u_xlat24 = (u_xlatb34) ? u_xlat3.x : u_xlat24;
        u_xlat14.x = u_xlat24 + FGlobals.gShadowParams0[4].z;
        u_xlat25 = (-u_xlat14.x) + 1.0;
        u_xlat14.x = (u_xlatb34) ? u_xlat14.x : u_xlat25;
        u_xlat14.x = float(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat2.xy, saturate(u_xlat14.x), level(0.0)));
        u_xlatb25.xy = (u_xlat2.xy<float2(0.0, 0.0));
        u_xlatb25.x = u_xlatb25.y || u_xlatb25.x;
        u_xlatb7.xy = (float2(1.0, 1.0)<u_xlat2.xy);
        u_xlatb36 = u_xlatb7.y || u_xlatb7.x;
        u_xlatb25.x = u_xlatb36 || u_xlatb25.x;
        u_xlat16_6.x = (u_xlatb25.x) ? half(1.0) : half(u_xlat14.x);
        u_xlatb14 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb14){
            if(u_xlatb34){
                u_xlat14.x = (-input.TEXCOORD0.y) + FGlobals.gPlanarShadowParams.x;
                u_xlat14.x = u_xlat14.x / float(FGlobals.gLightBuffer[11].y);
                u_xlat7.xyz = fma(float3(FGlobals.gLightBuffer[11].xyz), u_xlat14.xxx, input.TEXCOORD0.xyz);
                u_xlat7.w = 1.0;
                u_xlat8.x = dot(FGlobals.gShadowParams0[0], u_xlat7);
                u_xlat8.y = dot(FGlobals.gShadowParams0[1], u_xlat7);
                u_xlat8.z = dot(FGlobals.gShadowParams0[3], u_xlat7);
                u_xlat16_17.xyz = half3(u_xlat8.xyz * float3(0.5, 0.5, 0.5));
                u_xlat16_9.x = u_xlat16_17.z + u_xlat16_17.x;
                u_xlat16_9.y = half(fma(float(u_xlat16_17.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_17.z)));
                u_xlat3.x = u_xlat3.x * u_xlat8.z;
                u_xlat14.xy = float2(u_xlat16_9.xy) / u_xlat8.zz;
                u_xlat24 = u_xlat3.x / u_xlat8.z;
            } else {
                u_xlat14.xy = fma(u_xlat2.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            }
            u_xlat2.x = u_xlat24 + FGlobals.gShadowParams0[4].z;
            u_xlat13 = (-u_xlat2.x) + 1.0;
            u_xlat2.x = (u_xlatb34) ? u_xlat2.x : u_xlat13;
            u_xlat2.x = float(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat14.xy, saturate(u_xlat2.x), level(0.0)));
            u_xlatb13.xy = (u_xlat14.xy<float2(0.0, 0.0));
            u_xlatb13.x = u_xlatb13.y || u_xlatb13.x;
            u_xlatb3.xy = (float2(1.0, 1.0)<u_xlat14.xy);
            u_xlatb24 = u_xlatb3.y || u_xlatb3.x;
            u_xlatb13.x = u_xlatb24 || u_xlatb13.x;
            u_xlat16_17.x = (u_xlatb13.x) ? half(1.0) : half(u_xlat2.x);
            u_xlat16_6.x = min(u_xlat16_17.x, u_xlat16_6.x);
        }
        u_xlat34 = (u_xlatb34) ? -100.0 : -30.0;
        u_xlatb34 = input.TEXCOORD0.y<u_xlat34;
        u_xlat16_2.x = u_xlat16_6.x + half(-1.0);
        u_xlat33 = fma(u_xlat33, float(u_xlat16_2.x), 1.0);
        u_xlat16 = (u_xlatb34) ? 1.0 : u_xlat33;
        u_xlat16_16.x = half(u_xlat16);
    }
    u_xlatb33 = 0.0<FGlobals.CloudParam.w;
    if(u_xlatb33){
        u_xlat3 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
        u_xlat3 = fma(u_xlat3, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
        u_xlat3 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat3);
        u_xlat16_33 = CloudTex.sample(samplerCloudTex, u_xlat3.xy).y;
        u_xlat16_34 = CloudTex.sample(samplerCloudTex, u_xlat3.zw).w;
        u_xlat16_6.x = u_xlat16_34 * half(0.5);
        u_xlat16_6.x = fma(u_xlat16_33, half(0.5), u_xlat16_6.x);
        u_xlat16_33 = fma((-u_xlat16_6.x), u_xlat16_6.x, u_xlat16_6.x);
        u_xlat34 = fma((-float(u_xlat16_6.x)), float(u_xlat16_6.x), FGlobals.CloudParam.y);
        u_xlat16_33 = half(1.0) / u_xlat16_33;
        u_xlat33 = float(u_xlat16_33) * u_xlat34;
        u_xlat33 = clamp(u_xlat33, 0.0f, 1.0f);
        u_xlat34 = fma(u_xlat33, -2.0, 3.0);
        u_xlat33 = u_xlat33 * u_xlat33;
        u_xlat33 = u_xlat33 * u_xlat34;
        u_xlat33 = fma((-u_xlat33), FGlobals.CloudParam.z, 1.0);
        u_xlat33 = clamp(u_xlat33, 0.0f, 1.0f);
        u_xlat16_16.x = half(min(u_xlat33, float(u_xlat16_16.x)));
    }
    u_xlat2.xyz = float3(u_xlat16_4.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_6.x = dot(u_xlat16_5.xzw, u_xlat16_1.xyz);
    u_xlat16_6.x = clamp(u_xlat16_6.x, 0.0h, 1.0h);
    u_xlat16_5.x = dot(u_xlat16_5.xzw, u_xlat16_0.xyz);
    u_xlat16_5.x = clamp(u_xlat16_5.x, 0.0h, 1.0h);
    u_xlat16_0.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_6.xyz = u_xlat16_6.xxx * u_xlat16_0.xyz;
    u_xlat16_27.x = fma(u_xlat16_37, half(0.25), half(0.25));
    u_xlat16_0.x = fma((-u_xlat16_5.x), u_xlat16_5.x, half(1.0));
    u_xlat16_37 = u_xlat16_37 * u_xlat16_37;
    u_xlat16_11 = u_xlat16_37 * u_xlat16_5.x;
    u_xlat16_0.x = fma(u_xlat16_11, u_xlat16_11, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_37 / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_27.x;
    u_xlat16_0.xyz = fma(u_xlat16_0.xxx, half3(0.0399999991, 0.0399999991, 0.0399999991), u_xlat16_4.xyz);
    u_xlat16_0.xyz = u_xlat16_0.xyz * u_xlat16_6.xyz;
    u_xlat16_4.xyz = u_xlat16_16.xxx * u_xlat16_0.xyz;
    u_xlat16_4.xyz = half3(fma(u_xlat2.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_4.xyz)));
    u_xlat16_4.xyz = u_xlat16_2.www * u_xlat16_4.xyz;
    u_xlat16_37 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_37 = min(u_xlat16_37, half(1.0));
    u_xlat16_5.x = (-u_xlat16_37) + half(1.0);
    u_xlat16_37 = fma(FGlobals._VertexOcclusionIntensity, u_xlat16_5.x, u_xlat16_37);
    u_xlat16_4.xyz = half3(u_xlat16_37) * u_xlat16_4.xyz;
    u_xlat0.xyz = input.TEXCOORD0.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
    u_xlat1 = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat12.x = max(u_xlat1, 0.00100000005);
    u_xlat12.x = rsqrt(u_xlat12.x);
    u_xlat12.xyz = u_xlat0.xyz * u_xlat12.xxx;
    u_xlat1 = sqrt(u_xlat1);
    u_xlat16_37 = half(u_xlat1 + (-float(FGlobals.gFogParams[1].z)));
    u_xlat16_37 = max(u_xlat16_37, half(0.0));
    u_xlatb2.xyz = (half3(0.5, 0.5, 0.5)<FGlobals.gFogParams[7].wzx);
    u_xlatb35 = u_xlatb2.y || u_xlatb2.x;
    if(u_xlatb35){
        u_xlat3.xy = input.TEXCOORD0.xz + (-FGlobals._VT_TerrainInfo.zw);
        u_xlat3.xy = u_xlat3.xy * FGlobals._VT_TerrainInfo.yy;
        u_xlat3.xy = clamp(u_xlat3.xy, 0.0f, 1.0f);
        u_xlat16_35 = _VT_IndexTex.sample(sampler_VT_IndexTex, u_xlat3.xy, level(0.0)).x;
        u_xlat35 = fma(float(u_xlat16_35), 255.0, 0.5);
        u_xlatu35 = uint(u_xlat35);
        u_xlatu25 = u_xlatu35 & 0x7fu;
        u_xlat7.z = float(u_xlatu25);
        u_xlatu35 = u_xlatu35 >> 0x7u;
        u_xlat35 = float(u_xlatu35);
        u_xlati25.xy = int2(FGlobals._VT_TerrainTileInfo.yz);
        u_xlati25.x = (-u_xlati25.y) + u_xlati25.x;
        u_xlati25.x = 0x1 << u_xlati25.x;
        u_xlat25 = float(u_xlati25.x);
        u_xlat8.xy = float2(int2(FGlobals._VT_RootSize, FGlobals._VT_MaxVTMip));
        u_xlat3.xy = u_xlat3.xy * u_xlat8.xx;
        u_xlat8.xz = u_xlat3.xy / float2(u_xlat25);
        u_xlat8.xz = floor(u_xlat8.xz);
        u_xlat3.xy = fma((-u_xlat8.xz), float2(u_xlat25), u_xlat3.xy);
        u_xlat7.xy = u_xlat3.xy / float2(u_xlat25);
        u_xlat7.xy = clamp(u_xlat7.xy, 0.0f, 1.0f);
        u_xlat35 = min(u_xlat35, u_xlat8.y);
        u_xlat10_35 = half(_VT_WorldYTex.sample(vt_linear_clamp_sampler, u_xlat7.xy, round(u_xlat7.z), level(u_xlat35)).x);
        u_xlat3.x = (-FGlobals._VT_TerrainHeightInfo.x) + FGlobals._VT_TerrainHeightInfo.y;
        u_xlat35 = fma(float(u_xlat10_35), u_xlat3.x, FGlobals._VT_TerrainHeightInfo.x);
        u_xlat35 = u_xlat35 + FGlobals._VT_TerrainHeightInfo.w;
        u_xlat35 = max(u_xlat35, -1000000.0);
        u_xlat35 = min(u_xlat35, 1000000.0);
    } else {
        u_xlat35 = 0.0;
    }
    u_xlat16_5.x = FGlobals.gFogParams[0].w + FGlobals.gFogParams[1].x;
    u_xlat3.x = (-u_xlat35) + input.TEXCOORD0.y;
    u_xlat0.w = u_xlat3.x + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = dot(u_xlat0.xzw, u_xlat0.xzw);
    u_xlat0.x = sqrt(u_xlat0.x);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlat22 = (u_xlatb2.x) ? u_xlat0.w : u_xlat0.y;
    u_xlat16_37 = (u_xlatb2.x) ? half(u_xlat0.x) : u_xlat16_37;
    u_xlat16_16.x = half(float(FGlobals.gFogParams[1].z) / u_xlat1);
    u_xlat16_16.x = clamp(u_xlat16_16.x, 0.0h, 1.0h);
    u_xlat0.x = fma(u_xlat22, float(u_xlat16_16.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[0].x));
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[1].w);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_16.x = (-u_xlat16_16.x) + half(1.0);
    u_xlat22 = u_xlat22 * float(u_xlat16_16.x);
    u_xlat22 = u_xlat22 * float(FGlobals.gFogParams[1].w);
    u_xlat22 = max(u_xlat22, -64.0);
    u_xlat22 = min(u_xlat22, -0.00100000005);
    u_xlat33 = exp2((-u_xlat22));
    u_xlat33 = (-u_xlat33) + 1.0;
    u_xlat33 = u_xlat33 / u_xlat22;
    u_xlatb22 = 0.00999999978<(-u_xlat22);
    u_xlat22 = (u_xlatb22) ? u_xlat33 : 0.693147004;
    u_xlat0.x = u_xlat22 * u_xlat0.x;
    u_xlat16_37 = half(u_xlat0.x * (-float(u_xlat16_37)));
    u_xlat16_37 = u_xlat16_5.x * u_xlat16_37;
    u_xlat16_37 = u_xlat16_37 * FGlobals.gFogParams[0].y;
    u_xlat16_37 = exp2(u_xlat16_37);
    u_xlat16_37 = max(u_xlat16_37, FGlobals.gFogParams[0].z);
    u_xlat16_16.x = dot(float3(FGlobals.gLightBuffer[11].xyz), u_xlat12.xyz);
    u_xlat16_6.xyz = FGlobals.gFogParams[0].www * FGlobals.gFogParams[2].xyz;
    u_xlat16_27.x = fma(u_xlat16_16.x, u_xlat16_16.x, half(1.0));
    u_xlat16_9.xyz = FGlobals.gFogParams[1].xxx * FGlobals.gFogParams[3].xyz;
    u_xlat16_27.y = fma((-FGlobals.gFogParams[1].y), FGlobals.gFogParams[1].y, half(1.0));
    u_xlat16_0.xz = u_xlat16_27.xy * half2(0.0596831031, 0.119366206);
    u_xlat16_10.xy = fma(FGlobals.gFogParams[1].yy, FGlobals.gFogParams[1].yy, half2(1.0, 2.0));
    u_xlat16_16.x = dot(u_xlat16_16.xx, FGlobals.gFogParams[1].yy);
    u_xlat16_16.x = (-u_xlat16_16.x) + u_xlat16_10.x;
    u_xlat16_16.x = log2(abs(u_xlat16_16.x));
    u_xlat16_16.x = u_xlat16_16.x * half(-1.5);
    u_xlat16_16.x = exp2(u_xlat16_16.x);
    u_xlat16_22 = u_xlat16_0.z * u_xlat16_16.x;
    u_xlat16_22 = u_xlat16_27.x * u_xlat16_22;
    u_xlat16_22 = u_xlat16_22 / u_xlat16_10.y;
    u_xlat16_16.xyz = half3(u_xlat16_22) * u_xlat16_9.xyz;
    u_xlat16_9.xyz = FGlobals.gLightBuffer[12].xyz * FGlobals.gFogParams[2].www;
    u_xlat16_16.xyz = fma(u_xlat16_6.xyz, u_xlat16_0.xxx, u_xlat16_16.xyz);
    u_xlat16_16.xyz = u_xlat16_16.xyz * u_xlat16_9.xyz;
    u_xlat16_5.xyz = u_xlat16_16.xyz / u_xlat16_5.xxx;
    u_xlat16_38 = (-u_xlat16_37) + half(1.0);
    u_xlat16_5.xyz = half3(u_xlat16_38) * u_xlat16_5.xyz;
    u_xlat0.x = u_xlat35 + float(FGlobals.gFogParams[3].w);
    u_xlat0.x = (u_xlatb2.y) ? u_xlat0.x : float(FGlobals.gFogParams[3].w);
    u_xlat16_38 = half(u_xlat1 + (-float(FGlobals.gFogParams[5].y)));
    u_xlat16_38 = max(u_xlat16_38, half(0.0));
    u_xlat16_6.x = half(float(FGlobals.gFogParams[5].y) / u_xlat1);
    u_xlat16_6.x = clamp(u_xlat16_6.x, 0.0h, 1.0h);
    u_xlat22 = fma(u_xlat0.y, float(u_xlat16_6.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = (-u_xlat0.x) + u_xlat22;
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[5].z);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_6.x = (-u_xlat16_6.x) + half(1.0);
    u_xlat11.x = u_xlat0.y * float(u_xlat16_6.x);
    u_xlat11.x = u_xlat11.x * float(FGlobals.gFogParams[5].z);
    u_xlat11.x = max(u_xlat11.x, -64.0);
    u_xlat11.x = min(u_xlat11.x, -0.00100000005);
    u_xlat22 = exp2((-u_xlat11.x));
    u_xlat22 = (-u_xlat22) + 1.0;
    u_xlat22 = u_xlat22 / u_xlat11.x;
    u_xlatb11 = 0.00999999978<(-u_xlat11.x);
    u_xlat11.x = (u_xlatb11) ? u_xlat22 : 0.693147004;
    u_xlat0.x = u_xlat11.x * u_xlat0.x;
    u_xlat16_38 = half(u_xlat0.x * (-float(u_xlat16_38)));
    u_xlat16_38 = u_xlat16_38 * FGlobals.gFogParams[4].w;
    u_xlat16_38 = exp2(u_xlat16_38);
    u_xlat16_38 = max(u_xlat16_38, FGlobals.gFogParams[5].x);
    u_xlat16_0.xy = max(FGlobals.gFogParams[9].xy, half2(9.99999975e-05, 9.99999975e-05));
    u_xlat22 = u_xlat1 + (-float(FGlobals.gFogParams[1].z));
    u_xlat16_0.xy = half2(1.0, 1.0) / u_xlat16_0.xy;
    u_xlat0.x = float(u_xlat16_0.x) * u_xlat22;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat22 = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat22;
    u_xlat22 = u_xlat1 + (-float(FGlobals.gFogParams[5].y));
    u_xlat11.x = float(u_xlat16_0.y) * u_xlat22;
    u_xlat11.x = clamp(u_xlat11.x, 0.0f, 1.0f);
    u_xlat22 = fma(u_xlat11.x, -2.0, 3.0);
    u_xlat11.x = u_xlat11.x * u_xlat11.x;
    u_xlat11.x = u_xlat11.x * u_xlat22;
    u_xlat16_5.xyz = half3(u_xlat0.xxx * float3(u_xlat16_5.xyz));
    u_xlat16_22 = u_xlat16_37 + half(-1.0);
    u_xlat0.x = fma(u_xlat0.x, float(u_xlat16_22), 1.0);
    u_xlat16_22 = u_xlat16_38 + half(-1.0);
    u_xlat11.x = fma(u_xlat11.x, float(u_xlat16_22), 1.0);
    u_xlat16_37 = half((-u_xlat11.x) + 1.0);
    u_xlat16_5.xyz = half3(u_xlat11.xxx * float3(u_xlat16_5.xyz));
    u_xlat16_1.xyz = fma(FGlobals.gFogParams[4].xyz, half3(u_xlat16_37), u_xlat16_5.xyz);
    u_xlat16_1.w = half(u_xlat0.x * u_xlat11.x);
    if(u_xlatb2.z){
        u_xlat16_5.xy = half2(fma(input.TEXCOORD0.xz, float2(FGlobals.gFogParams[8].xy), float2(FGlobals.gFogParams[8].zw)));
        u_xlat16_37 = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_5.xy), level(0.0)).x;
        u_xlat16_37 = log2(u_xlat16_37);
        u_xlat16_37 = u_xlat16_37 * FGlobals.gFogParams[7].y;
        u_xlat16_37 = exp2(u_xlat16_37);
        u_xlat16_5.x = half(fma((-u_xlat11.x), u_xlat0.x, 1.0));
        u_xlat16_1.w = fma(u_xlat16_37, u_xlat16_5.x, u_xlat16_1.w);
        u_xlat16_1.xyz = fma(half3(u_xlat16_37), (-u_xlat16_1.xyz), u_xlat16_1.xyz);
    }
    u_xlatb0 = half(0.0)<FGlobals._ScreenCenterFogParams0.z;
    u_xlat11.xyz = input.TEXCOORD0.yyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1].xyw;
    u_xlat11.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0].xyw, input.TEXCOORD0.xxx, u_xlat11.xyz);
    u_xlat11.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2].xyw, input.TEXCOORD0.zzz, u_xlat11.xyz);
    u_xlat11.xyz = u_xlat11.xyz + UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3].xyw;
    u_xlat11.xy = u_xlat11.xy / u_xlat11.zz;
    u_xlat11.xy = fma(u_xlat11.xy, float2(0.5, 0.5), float2(0.5, 0.5));
    u_xlat16_2.xy = FGlobals._ScreenCenterFogParams1.xy + half2(0.5, 0.5);
    u_xlat11.xy = u_xlat11.xy + (-float2(u_xlat16_2.xy));
    u_xlat11.x = dot(u_xlat11.xy, u_xlat11.xy);
    u_xlat11.x = sqrt(u_xlat11.x);
    u_xlat16_37 = half(u_xlat11.x + (-float(FGlobals._ScreenCenterFogParams0.x)));
    u_xlat16_5.x = half(1.0) / FGlobals._ScreenCenterFogParams0.y;
    u_xlat16_37 = u_xlat16_37 * u_xlat16_5.x;
    u_xlat16_37 = clamp(u_xlat16_37, 0.0h, 1.0h);
    u_xlat16_5.x = fma(u_xlat16_37, half(-2.0), half(3.0));
    u_xlat16_37 = u_xlat16_37 * u_xlat16_37;
    u_xlat16_37 = fma((-u_xlat16_5.x), u_xlat16_37, half(1.0));
    u_xlat16_5.x = u_xlat16_37 * FGlobals._ScreenCenterFogParams0.z;
    u_xlat16_37 = fma((-u_xlat16_37), FGlobals._ScreenCenterFogParams0.z, half(1.0));
    u_xlat16_2.xyz = u_xlat16_1.xyz * half3(u_xlat16_37);
    u_xlat16_37 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_2.w = fma(u_xlat16_5.x, u_xlat16_37, u_xlat16_1.w);
    u_xlat16_0 = (bool(u_xlatb0)) ? u_xlat16_2 : u_xlat16_1;
    output.SV_TARGET0.xyz = fma(u_xlat16_4.xyz, u_xlat16_0.www, u_xlat16_0.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
