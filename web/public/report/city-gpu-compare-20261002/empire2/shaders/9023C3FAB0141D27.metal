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
    float _VT_PageUVScale ;
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
    sampler samplerCloudTex [[ sampler (0) ]],
    sampler sampler_VT_IndexTex [[ sampler (1) ]],
    texture2d<half, access::sample > CloudTex [[ texture(0) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(1) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(2) ]] ,
    texture2d<half, access::sample > BnSFog_FogMaskTex [[ texture(3) ]] ,
    texture2d<half, access::sample > _VT_IndexTex [[ texture(4) ]] ,
    texture2d_array<half, access::sample > _VT_AlbedoTex [[ texture(5) ]] ,
    texture2d_array<half, access::sample > _VT_NormalTex [[ texture(6) ]] ,
    texture2d_array<half, access::sample > _VT_WorldYTex [[ texture(7) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_point_clamp_compare_sampler(compare_func::greater_equal,filter::nearest,address::clamp_to_edge);
    constexpr sampler BnsFog_LinearClampSampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    constexpr sampler vt_linear_clamp_sampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float2 u_xlat0;
    half4 u_xlat16_0;
    half u_xlat10_0;
    bool u_xlatb0;
    float4 u_xlat1;
    half4 u_xlat16_1;
    float4 u_xlat2;
    half4 u_xlat16_2;
    half4 u_xlat10_2;
    int2 u_xlati2;
    float3 u_xlat3;
    float3 u_xlat4;
    bool3 u_xlatb4;
    half3 u_xlat16_5;
    float4 u_xlat6;
    float4 u_xlat7;
    half u_xlat16_7;
    half u_xlat10_7;
    float3 u_xlat8;
    half3 u_xlat16_8;
    bool4 u_xlatb8;
    half3 u_xlat16_9;
    half3 u_xlat16_10;
    half3 u_xlat16_11;
    half2 u_xlat16_12;
    float3 u_xlat13;
    half3 u_xlat16_13;
    half3 u_xlat10_13;
    bool u_xlatb13;
    float u_xlat18;
    half u_xlat16_18;
    float u_xlat20;
    bool2 u_xlatb21;
    half3 u_xlat16_22;
    float2 u_xlat26;
    half2 u_xlat16_26;
    uint u_xlatu26;
    bool u_xlatb26;
    float u_xlat27;
    half u_xlat16_31;
    float u_xlat32;
    float u_xlat34;
    half2 u_xlat16_35;
    float u_xlat39;
    half u_xlat16_39;
    int u_xlati39;
    uint u_xlatu39;
    bool u_xlatb39;
    float u_xlat42;
    float u_xlat43;
    half u_xlat16_43;
    bool u_xlatb43;
    half u_xlat16_44;
    float u_xlat45;
    half u_xlat16_45;
    half u_xlat10_45;
    half u_xlat16_48;
    u_xlat0.xy = input.TEXCOORD0.xz + (-FGlobals._VT_TerrainInfo.zw);
    u_xlat0.xy = u_xlat0.xy * FGlobals._VT_TerrainInfo.yy;
    u_xlat0.xy = clamp(u_xlat0.xy, 0.0f, 1.0f);
    u_xlat16_26.x = _VT_IndexTex.sample(sampler_VT_IndexTex, u_xlat0.xy, level(0.0)).x;
    u_xlat26.x = fma(float(u_xlat16_26.x), 255.0, 0.5);
    u_xlatu26 = uint(u_xlat26.x);
    u_xlatu39 = u_xlatu26 & 0x7fu;
    u_xlat1.z = float(u_xlatu39);
    u_xlatu26 = u_xlatu26 >> 0x7u;
    u_xlat26.x = float(u_xlatu26);
    u_xlati2.xy = int2(FGlobals._VT_TerrainTileInfo.yz);
    u_xlati39 = (-u_xlati2.y) + u_xlati2.x;
    u_xlati39 = 0x1 << u_xlati39;
    u_xlat39 = float(u_xlati39);
    u_xlat2.xy = float2(int2(FGlobals._VT_RootSize, FGlobals._VT_MaxVTMip));
    u_xlat0.xy = u_xlat0.xy * u_xlat2.xx;
    u_xlat2.xz = u_xlat0.xy / float2(u_xlat39);
    u_xlat2.xz = floor(u_xlat2.xz);
    u_xlat0.xy = fma((-u_xlat2.xz), float2(u_xlat39), u_xlat0.xy);
    u_xlat3.xy = u_xlat0.xy / float2(u_xlat39);
    u_xlat3.xy = clamp(u_xlat3.xy, 0.0f, 1.0f);
    u_xlat0.x = min(u_xlat26.x, u_xlat2.y);
    u_xlatb13 = 0.0<FGlobals._VT_PageUVScale;
    u_xlat13.x = (u_xlatb13) ? FGlobals._VT_PageUVScale : 1.0;
    u_xlat1.xy = u_xlat13.xx * u_xlat3.xy;
    u_xlat10_2 = half4(_VT_AlbedoTex.sample(vt_linear_clamp_sampler, u_xlat1.xy, round(u_xlat1.z), level(u_xlat0.x)));
    u_xlat10_13.xyz = half3(_VT_NormalTex.sample(vt_linear_clamp_sampler, u_xlat1.xy, round(u_xlat1.z), level(u_xlat0.x)).xyz);
    u_xlat16_13.xy = half2(fma(float2(u_xlat10_13.xy), float2(2.0, 2.0), float2(-1.0, -1.0)));
    u_xlat4.x = float(u_xlat16_13.y) + float(u_xlat16_13.x);
    u_xlat4.z = (-float(u_xlat16_13.y)) + float(u_xlat16_13.x);
    u_xlat4.xz = u_xlat4.xz * float2(0.5, 0.5);
    u_xlat13.x = -abs(u_xlat4.x) + 1.0;
    u_xlat4.y = -abs(u_xlat4.z) + u_xlat13.x;
    u_xlat13.x = dot(u_xlat4.xyz, u_xlat4.xyz);
    u_xlat13.x = rsqrt(u_xlat13.x);
    u_xlat1.xyw = u_xlat13.xxx * u_xlat4.xyz;
    u_xlat16_5.x = half(max(float(u_xlat10_13.z), 0.119999997));
    u_xlat16_5.x = min(u_xlat16_5.x, half(1.0));
    u_xlat13.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat42 = dot(u_xlat13.xyz, u_xlat13.xyz);
    u_xlat42 = max(u_xlat42, 0.00100000005);
    u_xlat42 = rsqrt(u_xlat42);
    u_xlat4.xyz = u_xlat13.xyz * float3(u_xlat42);
    u_xlatb43 = 0.0>=FGlobals.gShadowParams0[5].z;
    if(u_xlatb43){
        u_xlat16_18 = half(1.0);
    }
    if(!u_xlatb43){
        u_xlat6.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlatb43 = 0.5<FGlobals.gPlanarShadowEnabled;
        u_xlat45 = input.TEXCOORD0.y + 100.0;
        u_xlat16_45 = half(u_xlat45 / FGlobals.gPlanarShadowParams.y);
        u_xlat16_7 = half((FGlobals.gPlanarShadowEnabled<0.5) ? 0xFFFFFFFFu : uint(0));
        u_xlat20 = min(u_xlat6.z, 0.999000013);
        u_xlat32 = (int(u_xlat16_7) != 0) ? u_xlat20 : u_xlat6.z;
        u_xlat32 = (u_xlatb43) ? float(u_xlat16_45) : u_xlat32;
        if(u_xlatb43){
            u_xlat7.x = u_xlat32 + FGlobals.gShadowParams0[4].z;
            u_xlat10_7 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat6.xy, saturate(u_xlat7.x), level(0.0)));
            u_xlat16_7 = half(float(u_xlat10_7));
        }
        if(!u_xlatb43){
            u_xlat8.x = u_xlat32 + FGlobals.gShadowParams0[4].z;
            u_xlat8.x = (-u_xlat8.x) + 1.0;
            u_xlat10_7 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat6.xy, saturate(u_xlat8.x), level(0.0)));
            u_xlat16_7 = half(float(u_xlat10_7));
        }
        u_xlatb8.xy = (u_xlat6.xy<float2(0.0, 0.0));
        u_xlatb8.x = u_xlatb8.y || u_xlatb8.x;
        u_xlatb21.xy = (float2(1.0, 1.0)<u_xlat6.xy);
        u_xlatb21.x = u_xlatb21.y || u_xlatb21.x;
        u_xlatb8.x = u_xlatb21.x || u_xlatb8.x;
        u_xlat16_31 = (u_xlatb8.x) ? half(1.0) : u_xlat16_7;
        u_xlatb8.x = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb8.x){
            if(u_xlatb43){
                u_xlat8.x = (-input.TEXCOORD0.y) + FGlobals.gPlanarShadowParams.x;
                u_xlat8.x = u_xlat8.x / float(FGlobals.gLightBuffer[11].y);
                u_xlat7.xyz = fma(float3(FGlobals.gLightBuffer[11].xyz), u_xlat8.xxx, input.TEXCOORD0.xyz);
                u_xlat7.w = 1.0;
                u_xlat8.x = dot(FGlobals.gShadowParams0[0], u_xlat7);
                u_xlat8.y = dot(FGlobals.gShadowParams0[1], u_xlat7);
                u_xlat8.z = dot(FGlobals.gShadowParams0[3], u_xlat7);
                u_xlat16_9.xyz = half3(u_xlat8.xyz * float3(0.5, 0.5, 0.5));
                u_xlat16_10.x = u_xlat16_9.z + u_xlat16_9.x;
                u_xlat16_10.y = half(fma(float(u_xlat16_9.y), UnityPerCamera._ProjectionParams.x, float(u_xlat16_9.z)));
                u_xlat45 = float(u_xlat16_45) * u_xlat8.z;
                u_xlat8.xy = float2(u_xlat16_10.xy) / u_xlat8.zz;
                u_xlat32 = u_xlat45 / u_xlat8.z;
                u_xlat45 = u_xlat32 + FGlobals.gShadowParams0[4].z;
                u_xlat10_45 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat8.xy, saturate(u_xlat45), level(0.0)));
                u_xlat16_45 = half(float(u_xlat10_45));
            } else {
                u_xlat8.xy = fma(u_xlat6.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            }
            if(!u_xlatb43){
                u_xlat34 = u_xlat32 + FGlobals.gShadowParams0[4].z;
                u_xlat34 = (-u_xlat34) + 1.0;
                u_xlat10_45 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat8.xy, saturate(u_xlat34), level(0.0)));
                u_xlat16_45 = half(float(u_xlat10_45));
            }
            u_xlatb8.zw = (u_xlat8.xy<float2(0.0, 0.0));
            u_xlatb8.xy = (float2(1.0, 1.0)<u_xlat8.xy);
            u_xlatb8.xz = u_xlatb8.yw || u_xlatb8.xz;
            u_xlatb8.x = u_xlatb8.x || u_xlatb8.z;
            u_xlat16_44 = (u_xlatb8.x) ? half(1.0) : u_xlat16_45;
            u_xlat16_31 = min(u_xlat16_44, u_xlat16_31);
        }
        u_xlat43 = (u_xlatb43) ? -100.0 : -30.0;
        u_xlatb43 = input.TEXCOORD0.y<u_xlat43;
        u_xlat16_8.x = u_xlat16_31 + half(-1.0);
        u_xlat8.x = fma(FGlobals.gShadowParams0[5].z, float(u_xlat16_8.x), 1.0);
        u_xlat18 = (u_xlatb43) ? 1.0 : u_xlat8.x;
        u_xlat16_18 = half(u_xlat18);
    }
    u_xlatb43 = 0.0<FGlobals.CloudParam.w;
    if(u_xlatb43){
        u_xlat6 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
        u_xlat6 = fma(u_xlat6, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
        u_xlat6 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat6);
        u_xlat16_43 = CloudTex.sample(samplerCloudTex, u_xlat6.xy).y;
        u_xlat16_8.x = CloudTex.sample(samplerCloudTex, u_xlat6.zw).w;
        u_xlat16_31 = u_xlat16_8.x * half(0.5);
        u_xlat16_31 = fma(u_xlat16_43, half(0.5), u_xlat16_31);
        u_xlat16_43 = fma((-u_xlat16_31), u_xlat16_31, u_xlat16_31);
        u_xlat8.x = fma((-float(u_xlat16_31)), float(u_xlat16_31), FGlobals.CloudParam.y);
        u_xlat16_43 = half(1.0) / u_xlat16_43;
        u_xlat43 = float(u_xlat16_43) * u_xlat8.x;
        u_xlat43 = clamp(u_xlat43, 0.0f, 1.0f);
        u_xlat8.x = fma(u_xlat43, -2.0, 3.0);
        u_xlat43 = u_xlat43 * u_xlat43;
        u_xlat43 = u_xlat43 * u_xlat8.x;
        u_xlat43 = fma((-u_xlat43), FGlobals.CloudParam.z, 1.0);
        u_xlat43 = clamp(u_xlat43, 0.0f, 1.0f);
        u_xlat16_18 = half(min(u_xlat43, float(u_xlat16_18)));
    }
    u_xlat16_31 = dot(u_xlat1.xyw, u_xlat4.xyz);
    u_xlat4.xyz = float3(u_xlat10_2.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_8.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_9.xyz = half3(fma(u_xlat13.xyz, float3(u_xlat42), float3(FGlobals.gLightBuffer[11].xyz)));
    u_xlat16_13.x = dot(u_xlat16_9.xyz, u_xlat16_9.xyz);
    u_xlat16_13.x = max(u_xlat16_13.x, half(0.00100000005));
    u_xlat16_13.x = rsqrt(u_xlat16_13.x);
    u_xlat16_13.xyz = u_xlat16_13.xxx * u_xlat16_9.xyz;
    u_xlat42 = dot(u_xlat1.xyw, float3(FGlobals.gLightBuffer[11].xyz));
    u_xlat42 = max(u_xlat42, 0.0);
    u_xlat16_44 = dot(u_xlat1.xyw, float3(u_xlat16_13.xyz));
    u_xlat16_44 = max(u_xlat16_44, half(0.0));
    u_xlatb13 = u_xlat16_31>=half(0.0);
    u_xlat16_31 = fma(u_xlat16_5.x, half(0.25), half(0.25));
    u_xlat16_26.x = fma((-u_xlat16_44), u_xlat16_44, half(1.0));
    u_xlat16_5.x = u_xlat16_5.x * u_xlat16_5.x;
    u_xlat16_39 = u_xlat16_5.x * u_xlat16_44;
    u_xlat16_26.x = fma(u_xlat16_39, u_xlat16_39, u_xlat16_26.x);
    u_xlat16_26.x = u_xlat16_5.x / u_xlat16_26.x;
    u_xlat16_26.x = u_xlat16_26.x * u_xlat16_26.x;
    u_xlat16_26.x = min(u_xlat16_26.x, half(128.0));
    u_xlat16_26.x = u_xlat16_26.x * u_xlat16_31;
    u_xlat26.x = float(u_xlat16_26.x) * 0.0399999991;
    u_xlat13.x = u_xlatb13 ? u_xlat26.x : float(0.0);
    u_xlat13.xyz = u_xlat13.xxx + float3(u_xlat10_2.xyz);
    u_xlat13.xyz = float3(u_xlat42) * u_xlat13.xyz;
    u_xlat13.xyz = float3(u_xlat16_8.xyz) * u_xlat13.xyz;
    u_xlat16_5.xyz = half3(float3(u_xlat16_18) * u_xlat13.xyz);
    u_xlat16_5.xyz = half3(fma(u_xlat4.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_5.xyz)));
    u_xlat16_5.xyz = half3(float3(u_xlat10_2.www) * float3(u_xlat16_5.xyz));
    u_xlat2.xyz = input.TEXCOORD0.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
    u_xlat13.x = dot(u_xlat2.xyz, u_xlat2.xyz);
    u_xlat26.x = max(u_xlat13.x, 0.00100000005);
    u_xlat26.x = rsqrt(u_xlat26.x);
    u_xlat1.xyw = u_xlat26.xxx * u_xlat2.xyz;
    u_xlat13.x = sqrt(u_xlat13.x);
    u_xlat16_44 = half(u_xlat13.x + (-float(FGlobals.gFogParams[1].z)));
    u_xlat16_44 = max(u_xlat16_44, half(0.0));
    u_xlatb4.xyz = (half3(0.5, 0.5, 0.5)<FGlobals.gFogParams[7].wzx);
    u_xlatb26 = u_xlatb4.y || u_xlatb4.x;
    if(u_xlatb26){
        u_xlat3.z = u_xlat1.z;
        u_xlat10_0 = half(_VT_WorldYTex.sample(vt_linear_clamp_sampler, u_xlat3.xy, round(u_xlat3.z), level(u_xlat0.x)).x);
        u_xlat26.x = (-FGlobals._VT_TerrainHeightInfo.x) + FGlobals._VT_TerrainHeightInfo.y;
        u_xlat0.x = fma(float(u_xlat10_0), u_xlat26.x, FGlobals._VT_TerrainHeightInfo.x);
        u_xlat0.x = u_xlat0.x + FGlobals._VT_TerrainHeightInfo.w;
        u_xlat0.x = max(u_xlat0.x, -1000000.0);
        u_xlat0.x = min(u_xlat0.x, 1000000.0);
    } else {
        u_xlat0.x = 0.0;
    }
    u_xlat16_9.x = FGlobals.gFogParams[0].w + FGlobals.gFogParams[1].x;
    u_xlat26.x = (-u_xlat0.x) + input.TEXCOORD0.y;
    u_xlat2.w = u_xlat26.x + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat26.x = dot(u_xlat2.xzw, u_xlat2.xzw);
    u_xlat26.x = sqrt(u_xlat26.x);
    u_xlat26.x = u_xlat26.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat26.x = max(u_xlat26.x, 0.0);
    u_xlat39 = (u_xlatb4.x) ? u_xlat2.w : u_xlat2.y;
    u_xlat16_44 = (u_xlatb4.x) ? half(u_xlat26.x) : u_xlat16_44;
    u_xlat16_22.x = half(float(FGlobals.gFogParams[1].z) / u_xlat13.x);
    u_xlat16_22.x = clamp(u_xlat16_22.x, 0.0h, 1.0h);
    u_xlat26.x = fma(u_xlat39, float(u_xlat16_22.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat26.x = u_xlat26.x + (-float(FGlobals.gFogParams[0].x));
    u_xlat26.x = max(u_xlat26.x, -127.0);
    u_xlat26.x = (-u_xlat26.x) * float(FGlobals.gFogParams[1].w);
    u_xlat26.x = exp2(u_xlat26.x);
    u_xlat16_22.x = (-u_xlat16_22.x) + half(1.0);
    u_xlat39 = u_xlat39 * float(u_xlat16_22.x);
    u_xlat39 = u_xlat39 * float(FGlobals.gFogParams[1].w);
    u_xlat39 = max(u_xlat39, -64.0);
    u_xlat39 = min(u_xlat39, -0.00100000005);
    u_xlat27 = exp2((-u_xlat39));
    u_xlat27 = (-u_xlat27) + 1.0;
    u_xlat27 = u_xlat27 / u_xlat39;
    u_xlatb39 = 0.00999999978<(-u_xlat39);
    u_xlat39 = (u_xlatb39) ? u_xlat27 : 0.693147004;
    u_xlat26.x = u_xlat39 * u_xlat26.x;
    u_xlat16_44 = half(u_xlat26.x * (-float(u_xlat16_44)));
    u_xlat16_44 = u_xlat16_9.x * u_xlat16_44;
    u_xlat16_44 = u_xlat16_44 * FGlobals.gFogParams[0].y;
    u_xlat16_44 = exp2(u_xlat16_44);
    u_xlat16_44 = max(u_xlat16_44, FGlobals.gFogParams[0].z);
    u_xlat16_22.x = dot(float3(FGlobals.gLightBuffer[11].xyz), u_xlat1.xyw);
    u_xlat16_10.xyz = FGlobals.gFogParams[0].www * FGlobals.gFogParams[2].xyz;
    u_xlat16_35.x = fma(u_xlat16_22.x, u_xlat16_22.x, half(1.0));
    u_xlat16_11.xyz = FGlobals.gFogParams[1].xxx * FGlobals.gFogParams[3].xyz;
    u_xlat16_35.y = fma((-FGlobals.gFogParams[1].y), FGlobals.gFogParams[1].y, half(1.0));
    u_xlat16_26.xy = u_xlat16_35.xy * half2(0.0596831031, 0.119366206);
    u_xlat16_12.xy = fma(FGlobals.gFogParams[1].yy, FGlobals.gFogParams[1].yy, half2(1.0, 2.0));
    u_xlat16_22.x = dot(u_xlat16_22.xx, FGlobals.gFogParams[1].yy);
    u_xlat16_22.x = (-u_xlat16_22.x) + u_xlat16_12.x;
    u_xlat16_22.x = log2(abs(u_xlat16_22.x));
    u_xlat16_22.x = u_xlat16_22.x * half(-1.5);
    u_xlat16_22.x = exp2(u_xlat16_22.x);
    u_xlat16_39 = u_xlat16_26.y * u_xlat16_22.x;
    u_xlat16_39 = u_xlat16_35.x * u_xlat16_39;
    u_xlat16_39 = u_xlat16_39 / u_xlat16_12.y;
    u_xlat16_22.xyz = half3(u_xlat16_39) * u_xlat16_11.xyz;
    u_xlat16_11.xyz = FGlobals.gLightBuffer[12].xyz * FGlobals.gFogParams[2].www;
    u_xlat16_22.xyz = fma(u_xlat16_10.xyz, u_xlat16_26.xxx, u_xlat16_22.xyz);
    u_xlat16_22.xyz = u_xlat16_22.xyz * u_xlat16_11.xyz;
    u_xlat16_9.xyz = u_xlat16_22.xyz / u_xlat16_9.xxx;
    u_xlat16_48 = (-u_xlat16_44) + half(1.0);
    u_xlat16_9.xyz = half3(u_xlat16_48) * u_xlat16_9.xyz;
    u_xlat0.x = u_xlat0.x + float(FGlobals.gFogParams[3].w);
    u_xlat0.x = (u_xlatb4.y) ? u_xlat0.x : float(FGlobals.gFogParams[3].w);
    u_xlat16_48 = half(u_xlat13.x + (-float(FGlobals.gFogParams[5].y)));
    u_xlat16_48 = max(u_xlat16_48, half(0.0));
    u_xlat16_10.x = half(float(FGlobals.gFogParams[5].y) / u_xlat13.x);
    u_xlat16_10.x = clamp(u_xlat16_10.x, 0.0h, 1.0h);
    u_xlat26.x = fma(u_xlat2.y, float(u_xlat16_10.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = (-u_xlat0.x) + u_xlat26.x;
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[5].z);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_10.x = (-u_xlat16_10.x) + half(1.0);
    u_xlat26.x = u_xlat2.y * float(u_xlat16_10.x);
    u_xlat26.x = u_xlat26.x * float(FGlobals.gFogParams[5].z);
    u_xlat26.x = max(u_xlat26.x, -64.0);
    u_xlat26.x = min(u_xlat26.x, -0.00100000005);
    u_xlat39 = exp2((-u_xlat26.x));
    u_xlat39 = (-u_xlat39) + 1.0;
    u_xlat39 = u_xlat39 / u_xlat26.x;
    u_xlatb26 = 0.00999999978<(-u_xlat26.x);
    u_xlat26.x = (u_xlatb26) ? u_xlat39 : 0.693147004;
    u_xlat0.x = u_xlat26.x * u_xlat0.x;
    u_xlat16_48 = half(u_xlat0.x * (-float(u_xlat16_48)));
    u_xlat16_48 = u_xlat16_48 * FGlobals.gFogParams[4].w;
    u_xlat16_48 = exp2(u_xlat16_48);
    u_xlat16_48 = max(u_xlat16_48, FGlobals.gFogParams[5].x);
    u_xlat16_0.xz = max(FGlobals.gFogParams[9].xy, half2(9.99999975e-05, 9.99999975e-05));
    u_xlat39 = u_xlat13.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat16_0.xz = half2(1.0, 1.0) / u_xlat16_0.xz;
    u_xlat0.x = float(u_xlat16_0.x) * u_xlat39;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat26.y = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat13.x = u_xlat13.x + (-float(FGlobals.gFogParams[5].y));
    u_xlat13.x = float(u_xlat16_0.z) * u_xlat13.x;
    u_xlat13.x = clamp(u_xlat13.x, 0.0f, 1.0f);
    u_xlat26.x = fma(u_xlat13.x, -2.0, 3.0);
    u_xlat0.y = u_xlat13.x * u_xlat13.x;
    u_xlat0.xy = u_xlat0.xy * u_xlat26.yx;
    u_xlat16_9.xyz = half3(u_xlat0.xxx * float3(u_xlat16_9.xyz));
    u_xlat16_26.x = u_xlat16_44 + half(-1.0);
    u_xlat0.x = fma(u_xlat0.x, float(u_xlat16_26.x), 1.0);
    u_xlat16_26.x = u_xlat16_48 + half(-1.0);
    u_xlat13.x = fma(u_xlat0.y, float(u_xlat16_26.x), 1.0);
    u_xlat16_44 = half((-u_xlat13.x) + 1.0);
    u_xlat16_9.xyz = half3(u_xlat13.xxx * float3(u_xlat16_9.xyz));
    u_xlat16_1.xyz = fma(FGlobals.gFogParams[4].xyz, half3(u_xlat16_44), u_xlat16_9.xyz);
    u_xlat16_1.w = half(u_xlat0.x * u_xlat13.x);
    if(u_xlatb4.z){
        u_xlat16_9.xy = half2(fma(input.TEXCOORD0.xz, float2(FGlobals.gFogParams[8].xy), float2(FGlobals.gFogParams[8].zw)));
        u_xlat16_44 = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_9.xy), level(0.0)).x;
        u_xlat16_44 = log2(u_xlat16_44);
        u_xlat16_44 = u_xlat16_44 * FGlobals.gFogParams[7].y;
        u_xlat16_44 = exp2(u_xlat16_44);
        u_xlat16_9.x = half(fma((-u_xlat13.x), u_xlat0.x, 1.0));
        u_xlat16_1.w = fma(u_xlat16_44, u_xlat16_9.x, u_xlat16_1.w);
        u_xlat16_1.xyz = fma(half3(u_xlat16_44), (-u_xlat16_1.xyz), u_xlat16_1.xyz);
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
    u_xlat16_44 = half(u_xlat13.x + (-float(FGlobals._ScreenCenterFogParams0.x)));
    u_xlat16_9.x = half(1.0) / FGlobals._ScreenCenterFogParams0.y;
    u_xlat16_44 = u_xlat16_44 * u_xlat16_9.x;
    u_xlat16_44 = clamp(u_xlat16_44, 0.0h, 1.0h);
    u_xlat16_9.x = fma(u_xlat16_44, half(-2.0), half(3.0));
    u_xlat16_44 = u_xlat16_44 * u_xlat16_44;
    u_xlat16_44 = fma((-u_xlat16_9.x), u_xlat16_44, half(1.0));
    u_xlat16_9.x = u_xlat16_44 * FGlobals._ScreenCenterFogParams0.z;
    u_xlat16_44 = fma((-u_xlat16_44), FGlobals._ScreenCenterFogParams0.z, half(1.0));
    u_xlat16_2.xyz = u_xlat16_1.xyz * half3(u_xlat16_44);
    u_xlat16_44 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_2.w = fma(u_xlat16_9.x, u_xlat16_44, u_xlat16_1.w);
    u_xlat16_0 = (bool(u_xlatb0)) ? u_xlat16_2 : u_xlat16_1;
    output.SV_TARGET0.xyz = fma(u_xlat16_5.xyz, u_xlat16_0.www, u_xlat16_0.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
