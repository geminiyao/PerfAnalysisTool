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
    half _TeamColorReplace ;
    half _TeamColorGrayscaleBlend ;
    half _RoleBackLightIntensity ;
    half4 gLightBuffer [116];
    half4 gFogParams [10];
    float4 gShadowParams0 [7];
    float gPlanarShadowEnabled ;
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
    half _SpecCubeLodSteps ;
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
    ColorPropsArray_Type ColorPropsArray [128];
};

struct ColorProps2Array_Type
{
    float4 _Rim ;
    float4 _Reversed2 ;
};

struct UnityInstancing_ColorProps2_Type
{
    ColorProps2Array_Type ColorProps2Array [128];
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
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(2) ]],
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(3) ]],
    constant UnityInstancing_ColorProps_Type& UnityInstancing_ColorProps [[ buffer(4) ]],
    constant UnityInstancing_ColorProps2_Type& UnityInstancing_ColorProps2 [[ buffer(5) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_NormalTex [[ sampler (1) ]],
    sampler samplerCloudTex [[ sampler (2) ]],
    sampler sampler_VT_IndexTex [[ sampler (3) ]],
    sampler sampler_2DSpecCube0 [[ sampler (4) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(1) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(2) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(3) ]] ,
    texture2d<half, access::sample > BnSFog_FogMaskTex [[ texture(4) ]] ,
    texture2d<half, access::sample > _VT_IndexTex [[ texture(5) ]] ,
    texture2d_array<half, access::sample > _VT_WorldYTex [[ texture(6) ]] ,
    texture2d<half, access::sample > _2DSpecCube0 [[ texture(7) ]] ,
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
    int u_xlati0;
    bool u_xlatb0;
    float2 u_xlat1;
    half4 u_xlat16_1;
    half4 u_xlat16_2;
    bool3 u_xlatb2;
    float u_xlat3;
    half4 u_xlat16_3;
    half3 u_xlat16_4;
    half3 u_xlat16_5;
    float4 u_xlat6;
    half4 u_xlat16_6;
    float3 u_xlat7;
    half3 u_xlat16_7;
    bool2 u_xlatb7;
    float3 u_xlat8;
    bool2 u_xlatb8;
    half3 u_xlat16_9;
    half3 u_xlat16_10;
    half3 u_xlat16_11;
    half3 u_xlat16_12;
    float3 u_xlat13;
    float3 u_xlat14;
    half u_xlat16_14;
    bool u_xlatb14;
    float3 u_xlat15;
    half3 u_xlat16_15;
    half3 u_xlat16_17;
    half3 u_xlat16_18;
    half3 u_xlat16_19;
    float u_xlat22;
    float u_xlat28;
    half u_xlat16_28;
    bool u_xlatb28;
    half u_xlat16_31;
    half2 u_xlat16_32;
    float u_xlat35;
    half u_xlat10_35;
    int2 u_xlati35;
    uint u_xlatu35;
    float u_xlat42;
    float u_xlat44;
    half u_xlat16_44;
    half u_xlat10_44;
    uint u_xlatu44;
    bool u_xlatb44;
    half u_xlat16_45;
    half u_xlat16_46;
    half u_xlat16_47;
    float u_xlat49;
    bool u_xlatb49;
    u_xlati0 = int(input.SV_InstanceID0) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat14.xy = fma(u_xlat1.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw));
    u_xlati0 = u_xlati0 << 0x1;
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, u_xlat14.xy);
    u_xlat16_2 = _NormalTex.sample(sampler_NormalTex, u_xlat14.xy);
    u_xlat16_3.yz = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_3.xw = (-u_xlat16_3.zz);
    u_xlat16_31 = dot(u_xlat16_3.yw, u_xlat16_3.yw);
    u_xlat16_31 = min(u_xlat16_31, half(1.0));
    u_xlat16_31 = (-u_xlat16_31) + half(1.0);
    u_xlat16_31 = sqrt(u_xlat16_31);
    u_xlat16_4.xyz = u_xlat16_1.xyz * FGlobals._TintColorHDR.xyz;
    u_xlat16_5.xyz = half3(float3(FGlobals._TeamColorIntensity) * UnityInstancing_ColorProps.ColorPropsArray[u_xlati0 / 2]._TeamColor.xyz);
    u_xlat16_45 = dot(half3(0.212500006, 0.715399981, 0.0720999986), u_xlat16_4.xyz);
    u_xlat16_45 = u_xlat16_45 + half(-1.0);
    u_xlat16_45 = fma(FGlobals._TeamColorGrayscaleBlend, u_xlat16_45, half(1.0));
    u_xlatb14 = half(0.5)<FGlobals._TeamColorReplace;
    u_xlat16_46 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_47 = half(float(u_xlat16_46) * UnityInstancing_ColorProps.ColorPropsArray[u_xlati0 / 2]._TeamColor.w);
    u_xlat16_6.xyz = fma(u_xlat16_5.xyz, half3(u_xlat16_45), (-u_xlat16_4.xyz));
    u_xlat16_6.xyz = fma(half3(u_xlat16_47), u_xlat16_6.xyz, u_xlat16_4.xyz);
    u_xlat16_6.xyz = half3(float3(u_xlat16_6.xyz) + UnityInstancing_ColorProps.ColorPropsArray[u_xlati0 / 2]._HighlightColor.xyz);
    u_xlat16_46 = u_xlat16_46 * FGlobals._TeamMaskScale;
    u_xlat16_46 = min(u_xlat16_46, half(1.0));
    u_xlat16_5.xyz = fma(u_xlat16_5.xyz, half3(u_xlat16_45), half3(-1.0, -1.0, -1.0));
    u_xlat16_5.xyz = fma(half3(u_xlat16_46), u_xlat16_5.xyz, half3(1.0, 1.0, 1.0));
    u_xlat16_4.xyz = half3(fma(float3(u_xlat16_4.xyz), float3(u_xlat16_5.xyz), UnityInstancing_ColorProps.ColorPropsArray[u_xlati0 / 2]._HighlightColor.xyz));
    u_xlat16_4.xyz = (bool(u_xlatb14)) ? u_xlat16_6.xyz : u_xlat16_4.xyz;
    u_xlatb14 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_19.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_45 = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_19.x = (u_xlatb14) ? FGlobals.gLightBuffer[8].x : u_xlat16_45;
    u_xlat16_45 = dot(FGlobals._RoughnessScale.xyz, u_xlat16_19.xyz);
    u_xlat16_45 = u_xlat16_2.z * u_xlat16_45;
    u_xlat14.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat1.x = dot(u_xlat14.xyz, u_xlat14.xyz);
    u_xlat1.x = max(u_xlat1.x, 0.00100000005);
    u_xlat1.x = rsqrt(u_xlat1.x);
    u_xlat15.xyz = u_xlat14.xyz * u_xlat1.xxx;
    u_xlat16_46 = dot(u_xlat15.xyz, float3(input.TEXCOORD5.xyz));
    u_xlat16_46 = (-u_xlat16_46) + half(1.0);
    u_xlat16_46 = clamp(u_xlat16_46, 0.0h, 1.0h);
    u_xlat16_5.x = u_xlat16_46 * u_xlat16_46;
    u_xlat16_46 = u_xlat16_46 * u_xlat16_5.x;
    u_xlat16_46 = half(float(u_xlat16_46) * UnityInstancing_ColorProps2.ColorProps2Array[u_xlati0 / 2]._Rim.w);
    u_xlat16_5.xyz = half3(float3(u_xlat16_46) * UnityInstancing_ColorProps2.ColorProps2Array[u_xlati0 / 2]._Rim.xyz);
    u_xlat16_45 = max(u_xlat16_45, half(0.119999997));
    u_xlat16_45 = min(u_xlat16_45, half(1.0));
    u_xlat16_6.xyz = u_xlat16_3.xxx * input.TEXCOORD4.xyz;
    u_xlat16_6.xyz = fma(input.TEXCOORD3.xyz, u_xlat16_3.yyy, u_xlat16_6.xyz);
    u_xlat16_3.xyz = fma(input.TEXCOORD5.xyz, half3(u_xlat16_31), u_xlat16_6.xyz);
    u_xlat16_0.x = dot(u_xlat16_3.xyz, u_xlat16_3.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_2.xyz = u_xlat16_0.xxx * u_xlat16_3.xyz;
    u_xlatb0 = 0.0>=FGlobals.gShadowParams0[5].z;
    if(u_xlatb0){
        u_xlat16_3.x = half(1.0);
    }
    if(!u_xlatb0){
        u_xlat7.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlatb0 = 0.5<FGlobals.gPlanarShadowEnabled;
        u_xlat49 = input.TEXCOORD0.y + 100.0;
        u_xlat49 = u_xlat49 / FGlobals.gPlanarShadowParams.y;
        u_xlatb8.x = FGlobals.gPlanarShadowEnabled<0.5;
        u_xlat22 = min(u_xlat7.z, 0.999000013);
        u_xlat35 = (u_xlatb8.x) ? u_xlat22 : u_xlat7.z;
        u_xlat35 = (u_xlatb0) ? u_xlat49 : u_xlat35;
        u_xlat35 = u_xlat35 + FGlobals.gShadowParams0[4].z;
        u_xlat49 = (-u_xlat35) + 1.0;
        u_xlat35 = (u_xlatb0) ? u_xlat35 : u_xlat49;
        u_xlat10_35 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat7.xy, saturate(u_xlat35), level(0.0)));
        u_xlatb8.xy = (u_xlat7.xy<float2(0.0, 0.0));
        u_xlatb49 = u_xlatb8.y || u_xlatb8.x;
        u_xlatb7.xy = (float2(1.0, 1.0)<u_xlat7.xy);
        u_xlatb7.x = u_xlatb7.y || u_xlatb7.x;
        u_xlatb7.x = u_xlatb7.x || u_xlatb49;
        u_xlat0.x = (u_xlatb0) ? -100.0 : -30.0;
        u_xlatb0 = input.TEXCOORD0.y<u_xlat0.x;
        u_xlatb0 = u_xlatb0 || u_xlatb7.x;
        u_xlat16_7.x = half(float(u_xlat10_35) + -1.0);
        u_xlat7.x = fma(FGlobals.gShadowParams0[5].z, float(u_xlat16_7.x), 1.0);
        u_xlat3 = (u_xlatb0) ? 1.0 : u_xlat7.x;
        u_xlat16_3.x = half(u_xlat3);
    }
    u_xlatb0 = 0.0<FGlobals.CloudParam.w;
    if(u_xlatb0){
        u_xlat6 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
        u_xlat6 = fma(u_xlat6, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
        u_xlat6 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat6);
        u_xlat16_0.x = CloudTex.sample(samplerCloudTex, u_xlat6.xy).y;
        u_xlat16_7.x = CloudTex.sample(samplerCloudTex, u_xlat6.zw).w;
        u_xlat16_17.x = u_xlat16_7.x * half(0.5);
        u_xlat16_17.x = fma(u_xlat16_0.x, half(0.5), u_xlat16_17.x);
        u_xlat16_0.x = fma((-u_xlat16_17.x), u_xlat16_17.x, u_xlat16_17.x);
        u_xlat7.x = fma((-float(u_xlat16_17.x)), float(u_xlat16_17.x), FGlobals.CloudParam.y);
        u_xlat16_0.x = half(1.0) / u_xlat16_0.x;
        u_xlat0.x = float(u_xlat16_0.x) * u_xlat7.x;
        u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
        u_xlat7.x = fma(u_xlat0.x, -2.0, 3.0);
        u_xlat0.x = u_xlat0.x * u_xlat0.x;
        u_xlat0.x = u_xlat0.x * u_xlat7.x;
        u_xlat0.x = fma((-u_xlat0.x), FGlobals.CloudParam.z, 1.0);
        u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
        u_xlat16_3.x = half(min(u_xlat0.x, float(u_xlat16_3.x)));
    }
    u_xlat16_9.xyz = fma((-u_xlat16_4.xyz), u_xlat16_2.www, u_xlat16_4.xyz);
    u_xlat16_17.x = fma((-u_xlat16_2.w), half(0.0399999991), half(0.0399999991));
    u_xlat16_4.xyz = fma(u_xlat16_4.xyz, u_xlat16_2.www, u_xlat16_17.xxx);
    u_xlat16_17.x = dot(float3(u_xlat16_2.xyz), u_xlat15.xyz);
    u_xlat16_6 = fma(half4(u_xlat16_45), half4(-1.0, -0.0274999999, -0.572000027, 0.0219999999), half4(1.0, 0.0425000004, 1.03999996, -0.0399999991));
    u_xlat16_31 = u_xlat16_6.x * u_xlat16_6.x;
    u_xlat16_46 = u_xlat16_17.x * half(-9.27999973);
    u_xlat16_46 = exp2(u_xlat16_46);
    u_xlat16_31 = min(u_xlat16_31, u_xlat16_46);
    u_xlat16_31 = fma(u_xlat16_31, u_xlat16_6.x, u_xlat16_6.y);
    u_xlat16_10.xy = fma(half2(u_xlat16_31), half2(-1.03999996, 1.03999996), u_xlat16_6.zw);
    u_xlat16_31 = u_xlat16_4.y * half(50.0);
    u_xlat16_31 = clamp(u_xlat16_31, 0.0h, 1.0h);
    u_xlat16_31 = u_xlat16_31 * u_xlat16_10.y;
    u_xlat16_4.xyz = fma(u_xlat16_4.xyz, u_xlat16_10.xxx, half3(u_xlat16_31));
    u_xlat16_31 = dot(float3(0.212500006, 0.715399981, 0.0720999986), input.TEXCOORD8.xyz);
    u_xlat16_31 = u_xlat16_31 * FGlobals.gLightBuffer[10].w;
    u_xlat16_31 = clamp(u_xlat16_31, 0.0h, 1.0h);
    u_xlat7.xyz = float3(u_xlat16_9.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_46 = dot((-u_xlat15.xyz), float3(u_xlat16_2.xyz));
    u_xlat16_46 = u_xlat16_46 + u_xlat16_46;
    u_xlat16_10.xyz = half3(fma(float3(u_xlat16_2.xyz), (-float3(u_xlat16_46)), (-u_xlat15.xyz)));
    u_xlat16_0.x = dot(u_xlat16_10.xyz, u_xlat16_10.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_15.xyz = u_xlat16_0.xxx * u_xlat16_10.xyz;
    u_xlat16_46 = fma((-u_xlat16_45), half(0.699999988), half(1.70000005));
    u_xlat16_46 = u_xlat16_45 * u_xlat16_46;
    u_xlatb0 = half(0.0)<FGlobals._SpecCubeLodSteps;
    u_xlat16_47 = (u_xlatb0) ? FGlobals._SpecCubeLodSteps : half(6.0);
    u_xlat16_46 = u_xlat16_46 * u_xlat16_47;
    u_xlat16_47 = fma(u_xlat16_15.y, half(8.0), half(8.0));
    u_xlat16_47 = sqrt(u_xlat16_47);
    u_xlat16_10.xy = u_xlat16_15.xz / half2(u_xlat16_47);
    u_xlat16_10.xy = u_xlat16_10.xy + half2(0.5, 0.5);
    u_xlat16_15.xyz = _2DSpecCube0.sample(sampler_2DSpecCube0, float2(u_xlat16_10.xy), level(float(u_xlat16_46))).xyz;
    u_xlat16_10.xyz = u_xlat16_15.xyz * half3(FGlobals._SpecCubePower);
    u_xlat16_10.xyz = u_xlat16_4.xyz * u_xlat16_10.xyz;
    u_xlat16_10.xyz = half3(u_xlat16_31) * u_xlat16_10.xyz;
    u_xlat16_11.xyz = u_xlat16_10.xyz * FGlobals.gLightBuffer[10].xyz;
    u_xlat16_11.xyz = half3(fma(u_xlat7.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_11.xyz)));
    u_xlat16_15.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_12.xyz = half3(fma(u_xlat14.xyz, u_xlat1.xxx, float3(FGlobals.gLightBuffer[11].xyz)));
    u_xlat16_0.x = dot(u_xlat16_12.xyz, u_xlat16_12.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_7.xyz = u_xlat16_0.xxx * u_xlat16_12.xyz;
    u_xlat16_0.x = dot(u_xlat16_2.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.0));
    u_xlat16_31 = dot(u_xlat16_2.xyz, u_xlat16_7.xyz);
    u_xlat16_31 = max(u_xlat16_31, half(0.0));
    u_xlatb44 = u_xlat16_17.x>=half(0.0);
    u_xlat16_17.x = (u_xlatb44) ? half(1.0) : half(0.0);
    u_xlat16_4.xyz = u_xlat16_4.xyz * u_xlat16_17.xxx;
    u_xlat16_17.x = fma(u_xlat16_45, half(0.25), half(0.25));
    u_xlat16_44 = fma((-u_xlat16_31), u_xlat16_31, half(1.0));
    u_xlat16_45 = u_xlat16_45 * u_xlat16_45;
    u_xlat16_7.x = u_xlat16_45 * u_xlat16_31;
    u_xlat16_44 = fma(u_xlat16_7.x, u_xlat16_7.x, u_xlat16_44);
    u_xlat16_44 = u_xlat16_45 / u_xlat16_44;
    u_xlat16_44 = u_xlat16_44 * u_xlat16_44;
    u_xlat16_44 = min(u_xlat16_44, half(128.0));
    u_xlat16_44 = u_xlat16_44 * u_xlat16_17.x;
    u_xlat16_7.xyz = fma(u_xlat16_4.xyz, half3(u_xlat16_44), u_xlat16_9.xyz);
    u_xlat16_7.xyz = u_xlat16_0.xxx * u_xlat16_7.xyz;
    u_xlat16_15.xyz = u_xlat16_15.xyz * u_xlat16_7.xyz;
    u_xlat16_11.xyz = fma(u_xlat16_15.xyz, u_xlat16_3.xxx, u_xlat16_11.xyz);
    u_xlat16_12.xyz = half3(fma(u_xlat14.xyz, u_xlat1.xxx, float3(FGlobals.gLightBuffer[16].xyz)));
    u_xlat16_0.x = dot(u_xlat16_12.xyz, u_xlat16_12.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * u_xlat16_12.xyz;
    u_xlat16_3.x = dot(u_xlat16_2.xyz, FGlobals.gLightBuffer[16].xyz);
    u_xlat16_3.z = dot(u_xlat16_2.xyz, u_xlat16_0.xyz);
    u_xlat16_3.xz = max(u_xlat16_3.xz, half2(0.0, 0.0));
    u_xlat16_0.x = fma((-u_xlat16_3.z), u_xlat16_3.z, half(1.0));
    u_xlat16_14 = u_xlat16_45 * u_xlat16_3.z;
    u_xlat16_0.x = fma(u_xlat16_14, u_xlat16_14, u_xlat16_0.x);
    u_xlat16_0.x = u_xlat16_45 / u_xlat16_0.x;
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_0.x = min(u_xlat16_0.x, half(128.0));
    u_xlat16_0.x = u_xlat16_0.x * u_xlat16_17.x;
    u_xlat16_0.xyz = fma(u_xlat16_4.xyz, u_xlat16_0.xxx, u_xlat16_9.xyz);
    u_xlat16_3.xyz = u_xlat16_3.xxx * u_xlat16_0.xyz;
    u_xlat16_4.xyz = FGlobals.gLightBuffer[17].www * FGlobals.gLightBuffer[17].xyz;
    u_xlat16_0.xyz = u_xlat16_3.xyz * u_xlat16_4.xyz;
    u_xlat16_0.xyz = fma(u_xlat16_0.xyz, FGlobals.gLightBuffer[8].www, u_xlat16_11.xyz);
    u_xlat16_3.x = dot(u_xlat16_2.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_3.x = (-u_xlat16_3.x);
    u_xlat16_3.x = clamp(u_xlat16_3.x, 0.0h, 1.0h);
    u_xlat16_17.xyz = half3(float3(u_xlat16_9.xyz) * input.TEXCOORD8.xyz);
    u_xlat16_17.xyz = u_xlat16_3.xxx * u_xlat16_17.xyz;
    u_xlat16_17.xyz = fma(u_xlat16_17.xyz, half3(FGlobals._RoleBackLightIntensity), u_xlat16_0.xyz);
    u_xlat16_4.xyz = u_xlat16_3.xxx * u_xlat16_10.xyz;
    u_xlat16_3.xyz = fma(u_xlat16_4.xyz, half3(FGlobals._RoleBackLightIntensity), u_xlat16_17.xyz);
    u_xlat16_45 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_45 = min(u_xlat16_45, half(1.0));
    u_xlat16_4.x = (-u_xlat16_45) + half(1.0);
    u_xlat16_45 = fma(FGlobals._VertexOcclusionIntensity, u_xlat16_4.x, u_xlat16_45);
    u_xlat16_3.xyz = fma(u_xlat16_3.xyz, half3(u_xlat16_45), u_xlat16_5.xyz);
    u_xlat0.xyz = input.TEXCOORD0.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
    u_xlat1.x = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat15.x = max(u_xlat1.x, 0.00100000005);
    u_xlat15.x = rsqrt(u_xlat15.x);
    u_xlat15.xyz = u_xlat0.xyz * u_xlat15.xxx;
    u_xlat1.x = sqrt(u_xlat1.x);
    u_xlat16_45 = half(u_xlat1.x + (-float(FGlobals.gFogParams[1].z)));
    u_xlat16_45 = max(u_xlat16_45, half(0.0));
    u_xlatb2.xyz = (half3(0.5, 0.5, 0.5)<FGlobals.gFogParams[7].wzx);
    u_xlatb44 = u_xlatb2.y || u_xlatb2.x;
    if(u_xlatb44){
        u_xlat7.xy = input.TEXCOORD0.xz + (-FGlobals._VT_TerrainInfo.zw);
        u_xlat7.xy = u_xlat7.xy * FGlobals._VT_TerrainInfo.yy;
        u_xlat7.xy = clamp(u_xlat7.xy, 0.0f, 1.0f);
        u_xlat16_44 = _VT_IndexTex.sample(sampler_VT_IndexTex, u_xlat7.xy, level(0.0)).x;
        u_xlat44 = fma(float(u_xlat16_44), 255.0, 0.5);
        u_xlatu44 = uint(u_xlat44);
        u_xlatu35 = u_xlatu44 & 0x7fu;
        u_xlat8.z = float(u_xlatu35);
        u_xlatu44 = u_xlatu44 >> 0x7u;
        u_xlat44 = float(u_xlatu44);
        u_xlati35.xy = int2(FGlobals._VT_TerrainTileInfo.yz);
        u_xlati35.x = (-u_xlati35.y) + u_xlati35.x;
        u_xlati35.x = 0x1 << u_xlati35.x;
        u_xlat35 = float(u_xlati35.x);
        u_xlat13.xy = float2(int2(FGlobals._VT_RootSize, FGlobals._VT_MaxVTMip));
        u_xlat7.xy = u_xlat7.xy * u_xlat13.xx;
        u_xlat13.xz = u_xlat7.xy / float2(u_xlat35);
        u_xlat13.xz = floor(u_xlat13.xz);
        u_xlat7.xy = fma((-u_xlat13.xz), float2(u_xlat35), u_xlat7.xy);
        u_xlat8.xy = u_xlat7.xy / float2(u_xlat35);
        u_xlat8.xy = clamp(u_xlat8.xy, 0.0f, 1.0f);
        u_xlat44 = min(u_xlat44, u_xlat13.y);
        u_xlat10_44 = half(_VT_WorldYTex.sample(vt_linear_clamp_sampler, u_xlat8.xy, round(u_xlat8.z), level(u_xlat44)).x);
        u_xlat7.x = (-FGlobals._VT_TerrainHeightInfo.x) + FGlobals._VT_TerrainHeightInfo.y;
        u_xlat44 = fma(float(u_xlat10_44), u_xlat7.x, FGlobals._VT_TerrainHeightInfo.x);
        u_xlat44 = u_xlat44 + FGlobals._VT_TerrainHeightInfo.w;
        u_xlat44 = max(u_xlat44, -1000000.0);
        u_xlat44 = min(u_xlat44, 1000000.0);
    } else {
        u_xlat44 = 0.0;
    }
    u_xlat16_4.x = FGlobals.gFogParams[0].w + FGlobals.gFogParams[1].x;
    u_xlat7.x = (-u_xlat44) + input.TEXCOORD0.y;
    u_xlat0.w = u_xlat7.x + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = dot(u_xlat0.xzw, u_xlat0.xzw);
    u_xlat0.x = sqrt(u_xlat0.x);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlat28 = (u_xlatb2.x) ? u_xlat0.w : u_xlat0.y;
    u_xlat16_45 = (u_xlatb2.x) ? half(u_xlat0.x) : u_xlat16_45;
    u_xlat16_18.x = half(float(FGlobals.gFogParams[1].z) / u_xlat1.x);
    u_xlat16_18.x = clamp(u_xlat16_18.x, 0.0h, 1.0h);
    u_xlat0.x = fma(u_xlat28, float(u_xlat16_18.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[0].x));
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[1].w);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_18.x = (-u_xlat16_18.x) + half(1.0);
    u_xlat28 = u_xlat28 * float(u_xlat16_18.x);
    u_xlat28 = u_xlat28 * float(FGlobals.gFogParams[1].w);
    u_xlat28 = max(u_xlat28, -64.0);
    u_xlat28 = min(u_xlat28, -0.00100000005);
    u_xlat42 = exp2((-u_xlat28));
    u_xlat42 = (-u_xlat42) + 1.0;
    u_xlat42 = u_xlat42 / u_xlat28;
    u_xlatb28 = 0.00999999978<(-u_xlat28);
    u_xlat28 = (u_xlatb28) ? u_xlat42 : 0.693147004;
    u_xlat0.x = u_xlat28 * u_xlat0.x;
    u_xlat16_45 = half(u_xlat0.x * (-float(u_xlat16_45)));
    u_xlat16_45 = u_xlat16_4.x * u_xlat16_45;
    u_xlat16_45 = u_xlat16_45 * FGlobals.gFogParams[0].y;
    u_xlat16_45 = exp2(u_xlat16_45);
    u_xlat16_45 = max(u_xlat16_45, FGlobals.gFogParams[0].z);
    u_xlat16_18.x = dot(float3(FGlobals.gLightBuffer[11].xyz), u_xlat15.xyz);
    u_xlat16_5.xyz = FGlobals.gFogParams[0].www * FGlobals.gFogParams[2].xyz;
    u_xlat16_32.x = fma(u_xlat16_18.x, u_xlat16_18.x, half(1.0));
    u_xlat16_9.xyz = FGlobals.gFogParams[1].xxx * FGlobals.gFogParams[3].xyz;
    u_xlat16_32.y = fma((-FGlobals.gFogParams[1].y), FGlobals.gFogParams[1].y, half(1.0));
    u_xlat16_0.xz = u_xlat16_32.xy * half2(0.0596831031, 0.119366206);
    u_xlat16_10.xy = fma(FGlobals.gFogParams[1].yy, FGlobals.gFogParams[1].yy, half2(1.0, 2.0));
    u_xlat16_18.x = dot(u_xlat16_18.xx, FGlobals.gFogParams[1].yy);
    u_xlat16_18.x = (-u_xlat16_18.x) + u_xlat16_10.x;
    u_xlat16_18.x = log2(abs(u_xlat16_18.x));
    u_xlat16_18.x = u_xlat16_18.x * half(-1.5);
    u_xlat16_18.x = exp2(u_xlat16_18.x);
    u_xlat16_28 = u_xlat16_0.z * u_xlat16_18.x;
    u_xlat16_28 = u_xlat16_32.x * u_xlat16_28;
    u_xlat16_28 = u_xlat16_28 / u_xlat16_10.y;
    u_xlat16_18.xyz = half3(u_xlat16_28) * u_xlat16_9.xyz;
    u_xlat16_9.xyz = FGlobals.gLightBuffer[12].xyz * FGlobals.gFogParams[2].www;
    u_xlat16_18.xyz = fma(u_xlat16_5.xyz, u_xlat16_0.xxx, u_xlat16_18.xyz);
    u_xlat16_18.xyz = u_xlat16_18.xyz * u_xlat16_9.xyz;
    u_xlat16_4.xyz = u_xlat16_18.xyz / u_xlat16_4.xxx;
    u_xlat16_46 = (-u_xlat16_45) + half(1.0);
    u_xlat16_4.xyz = half3(u_xlat16_46) * u_xlat16_4.xyz;
    u_xlat0.x = u_xlat44 + float(FGlobals.gFogParams[3].w);
    u_xlat0.x = (u_xlatb2.y) ? u_xlat0.x : float(FGlobals.gFogParams[3].w);
    u_xlat16_46 = half(u_xlat1.x + (-float(FGlobals.gFogParams[5].y)));
    u_xlat16_46 = max(u_xlat16_46, half(0.0));
    u_xlat16_5.x = half(float(FGlobals.gFogParams[5].y) / u_xlat1.x);
    u_xlat16_5.x = clamp(u_xlat16_5.x, 0.0h, 1.0h);
    u_xlat28 = fma(u_xlat0.y, float(u_xlat16_5.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat0.x = (-u_xlat0.x) + u_xlat28;
    u_xlat0.x = max(u_xlat0.x, -127.0);
    u_xlat0.x = (-u_xlat0.x) * float(FGlobals.gFogParams[5].z);
    u_xlat0.x = exp2(u_xlat0.x);
    u_xlat16_5.x = (-u_xlat16_5.x) + half(1.0);
    u_xlat14.x = u_xlat0.y * float(u_xlat16_5.x);
    u_xlat14.x = u_xlat14.x * float(FGlobals.gFogParams[5].z);
    u_xlat14.x = max(u_xlat14.x, -64.0);
    u_xlat14.x = min(u_xlat14.x, -0.00100000005);
    u_xlat28 = exp2((-u_xlat14.x));
    u_xlat28 = (-u_xlat28) + 1.0;
    u_xlat28 = u_xlat28 / u_xlat14.x;
    u_xlatb14 = 0.00999999978<(-u_xlat14.x);
    u_xlat14.x = (u_xlatb14) ? u_xlat28 : 0.693147004;
    u_xlat0.x = u_xlat14.x * u_xlat0.x;
    u_xlat16_46 = half(u_xlat0.x * (-float(u_xlat16_46)));
    u_xlat16_46 = u_xlat16_46 * FGlobals.gFogParams[4].w;
    u_xlat16_46 = exp2(u_xlat16_46);
    u_xlat16_46 = max(u_xlat16_46, FGlobals.gFogParams[5].x);
    u_xlat16_0.xy = max(FGlobals.gFogParams[9].xy, half2(9.99999975e-05, 9.99999975e-05));
    u_xlat28 = u_xlat1.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat16_0.xy = half2(1.0, 1.0) / u_xlat16_0.xy;
    u_xlat0.x = float(u_xlat16_0.x) * u_xlat28;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat28 = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat28;
    u_xlat28 = u_xlat1.x + (-float(FGlobals.gFogParams[5].y));
    u_xlat14.x = float(u_xlat16_0.y) * u_xlat28;
    u_xlat14.x = clamp(u_xlat14.x, 0.0f, 1.0f);
    u_xlat28 = fma(u_xlat14.x, -2.0, 3.0);
    u_xlat14.x = u_xlat14.x * u_xlat14.x;
    u_xlat14.x = u_xlat14.x * u_xlat28;
    u_xlat16_4.xyz = half3(u_xlat0.xxx * float3(u_xlat16_4.xyz));
    u_xlat16_28 = u_xlat16_45 + half(-1.0);
    u_xlat0.x = fma(u_xlat0.x, float(u_xlat16_28), 1.0);
    u_xlat16_28 = u_xlat16_46 + half(-1.0);
    u_xlat14.x = fma(u_xlat14.x, float(u_xlat16_28), 1.0);
    u_xlat16_45 = half((-u_xlat14.x) + 1.0);
    u_xlat16_4.xyz = half3(u_xlat14.xxx * float3(u_xlat16_4.xyz));
    u_xlat16_1.xyz = fma(FGlobals.gFogParams[4].xyz, half3(u_xlat16_45), u_xlat16_4.xyz);
    u_xlat16_1.w = half(u_xlat0.x * u_xlat14.x);
    if(u_xlatb2.z){
        u_xlat16_4.xy = half2(fma(input.TEXCOORD0.xz, float2(FGlobals.gFogParams[8].xy), float2(FGlobals.gFogParams[8].zw)));
        u_xlat16_45 = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_4.xy), level(0.0)).x;
        u_xlat16_45 = log2(u_xlat16_45);
        u_xlat16_45 = u_xlat16_45 * FGlobals.gFogParams[7].y;
        u_xlat16_45 = exp2(u_xlat16_45);
        u_xlat16_4.x = half(fma((-u_xlat14.x), u_xlat0.x, 1.0));
        u_xlat16_1.w = fma(u_xlat16_45, u_xlat16_4.x, u_xlat16_1.w);
        u_xlat16_1.xyz = fma(half3(u_xlat16_45), (-u_xlat16_1.xyz), u_xlat16_1.xyz);
    }
    u_xlatb0 = half(0.0)<FGlobals._ScreenCenterFogParams0.z;
    u_xlat14.xyz = input.TEXCOORD0.yyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1].xyw;
    u_xlat14.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0].xyw, input.TEXCOORD0.xxx, u_xlat14.xyz);
    u_xlat14.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2].xyw, input.TEXCOORD0.zzz, u_xlat14.xyz);
    u_xlat14.xyz = u_xlat14.xyz + UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3].xyw;
    u_xlat14.xy = u_xlat14.xy / u_xlat14.zz;
    u_xlat14.xy = fma(u_xlat14.xy, float2(0.5, 0.5), float2(0.5, 0.5));
    u_xlat16_2.xy = FGlobals._ScreenCenterFogParams1.xy + half2(0.5, 0.5);
    u_xlat14.xy = u_xlat14.xy + (-float2(u_xlat16_2.xy));
    u_xlat14.x = dot(u_xlat14.xy, u_xlat14.xy);
    u_xlat14.x = sqrt(u_xlat14.x);
    u_xlat16_45 = half(u_xlat14.x + (-float(FGlobals._ScreenCenterFogParams0.x)));
    u_xlat16_4.x = half(1.0) / FGlobals._ScreenCenterFogParams0.y;
    u_xlat16_45 = u_xlat16_45 * u_xlat16_4.x;
    u_xlat16_45 = clamp(u_xlat16_45, 0.0h, 1.0h);
    u_xlat16_4.x = fma(u_xlat16_45, half(-2.0), half(3.0));
    u_xlat16_45 = u_xlat16_45 * u_xlat16_45;
    u_xlat16_45 = fma((-u_xlat16_4.x), u_xlat16_45, half(1.0));
    u_xlat16_4.x = u_xlat16_45 * FGlobals._ScreenCenterFogParams0.z;
    u_xlat16_45 = fma((-u_xlat16_45), FGlobals._ScreenCenterFogParams0.z, half(1.0));
    u_xlat16_2.xyz = u_xlat16_1.xyz * half3(u_xlat16_45);
    u_xlat16_45 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_2.w = fma(u_xlat16_4.x, u_xlat16_45, u_xlat16_1.w);
    u_xlat16_0 = (bool(u_xlatb0)) ? u_xlat16_2 : u_xlat16_1;
    output.SV_TARGET0.xyz = fma(u_xlat16_3.xyz, u_xlat16_0.www, u_xlat16_0.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    output.SV_Target2 = 1.0;
    return output;
}
