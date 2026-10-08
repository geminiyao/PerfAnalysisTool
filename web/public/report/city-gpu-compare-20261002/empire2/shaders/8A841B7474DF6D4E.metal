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
#ifndef XLT_REMAP_I
	#define XLT_REMAP_I {0, 1, 2, 3, 4, 5, 6, 7}
#endif
constexpr constant uint xlt_remap_i[] = XLT_REMAP_I;
struct FGlobals_Type
{
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

struct UnityPerMaterial_Type
{
    float4 _FoamTex_ST ;
    half4 _WaterColor1 ;
    half4 _WaterColor2 ;
    half4 _WaterColorLOD ;
    float _ColorRange ;
    float _SpecularLevel ;
    float _EdgeOpacity ;
    half _Opacity1 ;
    half _Opacity2 ;
    float _VertexAlphaIntensity ;
    float _VertexAlphaClip ;
    float _WPO_MasterSpeed ;
    float4 _WPO_WaveSpeed ;
    float4 _WPO_WaveScale ;
    float4 _WPO_WaveIntensity ;
    float4 _EdgeFoamColor ;
    float _EdgeFoamRange ;
    float _EdgeFoamPower ;
    float _EdgeFoamTiling ;
    float _EdgeFoamOpacity ;
    float _EdgeFoamDistortion ;
    float _WaveFoamRange ;
    float _WaveFoamOpacity ;
    float _WaveFoamOpacityLOD ;
    float _WaveFoamDistortion ;
    float4 _WaveFoamTiling ;
    float4 _WaveFoamOffset ;
    float _SpecularTiling ;
    float _SpecularIntensity ;
    float4 _SpecularPower ;
    float4 _SpecularDir ;
    float t5_intensity ;
    float4 t5_uv1 ;
    float4 t5_uv2 ;
    half _DisableDepthFade_FromCameraHeight ;
    half _DisableDepthFade_CameraHeightRange ;
    half _ReflectionFresnel ;
    half4 _PlanarReflectionTintColor ;
    half _PRStrength ;
    half _Distortion ;
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
    float4 TEXCOORD9 [[ user(TEXCOORD9) ]] ;
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]] ;
    float4 TEXCOORD11 [[ user(TEXCOORD11) ]] ;
    float SV_Target1 [[ color(xlt_remap_i[1]) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_TARGET0 [[ color(xlt_remap_o[0]) ]];
};

constexpr sampler _mtl_xl_shadow_sampler(address::clamp_to_edge, filter::linear, compare_func::greater_equal);
fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerFrame_Type& UnityPerFrame [[ buffer(2) ]],
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(3) ]],
    sampler sampler_ShoreWaveRamp [[ sampler (0) ]],
    sampler sampler_SpecTex [[ sampler (1) ]],
    sampler sampler_FoamTex [[ sampler (2) ]],
    sampler samplert5 [[ sampler (3) ]],
    sampler samplerCloudTex [[ sampler (4) ]],
    sampler sampler_VT_IndexTex [[ sampler (5) ]],
    texture2d<half, access::sample > t5 [[ texture(0) ]] ,
    texture2d<half, access::sample > _FoamTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _ShoreWaveRamp [[ texture(2) ]] ,
    texture2d<half, access::sample > _SpecTex [[ texture(3) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(4) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(5) ]] ,
    texture2d<half, access::sample > BnSFog_FogMaskTex [[ texture(6) ]] ,
    texture2d<half, access::sample > _VT_IndexTex [[ texture(7) ]] ,
    texture2d_array<half, access::sample > _VT_WorldYTex [[ texture(8) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_point_clamp_compare_sampler(compare_func::greater_equal,filter::nearest,address::clamp_to_edge);
    constexpr sampler BnsFog_LinearClampSampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    constexpr sampler vt_linear_clamp_sampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float3 u_xlat0;
    half3 u_xlat16_0;
    bool u_xlatb0;
    float4 u_xlat1;
    half4 u_xlat16_1;
    float4 u_xlat2;
    half4 u_xlat16_2;
    float4 u_xlat3;
    half3 u_xlat16_3;
    bool3 u_xlatb3;
    float u_xlat4;
    half4 u_xlat16_4;
    float3 u_xlat5;
    float4 u_xlat6;
    half3 u_xlat16_6;
    int2 u_xlati6;
    bool2 u_xlatb6;
    half3 u_xlat16_7;
    half3 u_xlat16_8;
    float3 u_xlat9;
    half3 u_xlat16_10;
    half3 u_xlat16_11;
    half3 u_xlat16_12;
    half2 u_xlat16_13;
    float2 u_xlat14;
    half2 u_xlat16_14;
    half u_xlat10_14;
    bool u_xlatb14;
    float2 u_xlat15;
    bool u_xlatb15;
    float2 u_xlat16;
    half2 u_xlat16_16;
    half u_xlat16_18;
    half3 u_xlat16_24;
    float2 u_xlat28;
    half u_xlat16_28;
    bool u_xlatb28;
    float2 u_xlat29;
    half2 u_xlat16_29;
    float u_xlat30;
    half2 u_xlat16_32;
    half u_xlat16_38;
    float u_xlat42;
    float u_xlat43;
    half u_xlat16_43;
    half u_xlat10_43;
    float u_xlat44;
    half u_xlat16_44;
    uint u_xlatu44;
    bool u_xlatb44;
    float u_xlat45;
    half u_xlat16_45;
    int u_xlati45;
    uint u_xlatu45;
    bool u_xlatb45;
    half u_xlat16_46;
    half u_xlat16_52;
    u_xlat0.xy = (-input.TEXCOORD0.zx) / UnityPerMaterial.t5_uv1.zz;
    u_xlat1.x = UnityPerCamera._Time.y;
    u_xlat1.y = float(0.0);
    u_xlat29.y = float(0.5);
    u_xlat0.xy = fma(UnityPerMaterial.t5_uv1.xy, u_xlat1.xy, u_xlat0.xy);
    u_xlat28.xy = (-input.TEXCOORD0.zx) / UnityPerMaterial.t5_uv2.zz;
    u_xlat28.xy = fma(UnityPerMaterial.t5_uv2.xy, u_xlat1.xy, u_xlat28.xy);
    u_xlat16_2.xyz = t5.sample(samplert5, u_xlat0.xy).xyz;
    u_xlat16_2.xyz = fma(u_xlat16_2.xyz, half3(2.0, 2.0, 2.0), half3(-1.0, -1.0, -1.0));
    u_xlat16_0.xyz = t5.sample(samplert5, u_xlat28.xy).xyz;
    u_xlat16_0.xyz = fma(u_xlat16_0.xyz, half3(2.0, 2.0, 2.0), u_xlat16_2.xyz);
    u_xlat16_0.xyz = u_xlat16_0.xyz + half3(-1.0, -1.0, -2.0);
    u_xlat0.xyz = fma(float3(UnityPerMaterial.t5_intensity), float3(u_xlat16_0.xyz), float3(0.0, 0.0, 1.0));
    u_xlat42 = fma(UnityPerCamera._ZBufferParams.z, input.SV_Target1, UnityPerCamera._ZBufferParams.w);
    u_xlat42 = float(1.0) / u_xlat42;
    u_xlat42 = u_xlat42 + (-input.TEXCOORD9.w);
    u_xlat1.xy = float2(u_xlat42) / float2(UnityPerMaterial._ColorRange, UnityPerMaterial._EdgeOpacity);
    u_xlat1.xy = clamp(u_xlat1.xy, 0.0f, 1.0f);
    u_xlat2.x = UnityPerCamera._WorldSpaceCameraPos.xyzx.y + (-float(UnityPerMaterial._DisableDepthFade_FromCameraHeight));
    u_xlat2.x = u_xlat2.x / float(UnityPerMaterial._DisableDepthFade_CameraHeightRange);
    u_xlat2.x = clamp(u_xlat2.x, 0.0f, 1.0f);
    u_xlat16.xy = (-u_xlat1.xy) + float2(1.0, 1.0);
    u_xlat1.xy = fma(u_xlat2.xx, u_xlat16.xy, u_xlat1.xy);
    u_xlat16.x = u_xlat42 / UnityPerMaterial._EdgeFoamRange;
    u_xlat16.x = clamp(u_xlat16.x, 0.0f, 1.0f);
    u_xlat30 = (-u_xlat16.x) + 1.0;
    u_xlat16.x = fma(u_xlat2.x, u_xlat30, u_xlat16.x);
    u_xlat29.x = u_xlat16.x * UnityPerMaterial._EdgeFoamPower;
    u_xlat16.xy = u_xlat0.xy * float2(UnityPerMaterial._EdgeFoamDistortion);
    u_xlat16.xy = fma((-input.TEXCOORD0.xz), float2(UnityPerMaterial._EdgeFoamTiling), u_xlat16.xy);
    u_xlat16_16.xy = _FoamTex.sample(sampler_FoamTex, u_xlat16.xy).yz;
    u_xlat16_29.xy = _ShoreWaveRamp.sample(sampler_ShoreWaveRamp, u_xlat29.xy).xy;
    u_xlat16_29.x = dot(u_xlat16_29.xy, u_xlat16_16.xy);
    u_xlat29.x = float(u_xlat16_29.x) * UnityPerMaterial._EdgeFoamOpacity;
    u_xlat42 = u_xlat42 / UnityPerMaterial._WaveFoamRange;
    u_xlat42 = clamp(u_xlat42, 0.0f, 1.0f);
    u_xlat43 = (-u_xlat42) + 1.0;
    u_xlat42 = fma(u_xlat2.x, u_xlat43, u_xlat42);
    u_xlat42 = (-u_xlat42) + 1.0;
    u_xlat2.xz = input.TEXCOORD0.ww;
    u_xlat2.yw = input.TEXCOORD1.ww;
    u_xlat3 = UnityPerCamera._Time.yyyy * UnityPerMaterial._WaveFoamOffset;
    u_xlat2 = fma(u_xlat2, UnityPerMaterial._WaveFoamTiling, u_xlat3);
    u_xlat2 = fma(u_xlat0.xyxy, float4(UnityPerMaterial._WaveFoamDistortion), u_xlat2);
    u_xlat16_3.xyz = _FoamTex.sample(sampler_FoamTex, u_xlat2.xy).xyz;
    u_xlat16_2.xyz = _FoamTex.sample(sampler_FoamTex, u_xlat2.zw).xyz;
    u_xlat16_43 = dot(u_xlat16_3.xyz, u_xlat16_2.xyz);
    u_xlat42 = u_xlat42 * float(u_xlat16_43);
    u_xlat42 = u_xlat42 * u_xlat42;
    u_xlat42 = u_xlat42 * UnityPerMaterial._WaveFoamOpacity;
    u_xlat43 = float(input.TEXCOORD2.w) * UnityPerMaterial._VertexAlphaIntensity;
    u_xlat43 = clamp(u_xlat43, 0.0f, 1.0f);
    u_xlat16_4.xy = (-half2(UnityPerMaterial._Opacity1, UnityPerMaterial._Opacity2)) + half2(1.0, 1.0);
    u_xlat16_4.xy = fma(u_xlat16_4.xy, half2(0.100000001, 0.100000001), half2(UnityPerMaterial._Opacity1, UnityPerMaterial._Opacity2));
    u_xlat16_4.xzw = u_xlat16_4.xxx * UnityPerMaterial._WaterColor1.xyz;
    u_xlat16_2.xyz = fma(u_xlat16_4.yyy, UnityPerMaterial._WaterColor2.xyz, (-u_xlat16_4.xzw));
    u_xlat2.xyz = fma(u_xlat1.xxx, float3(u_xlat16_2.xyz), float3(u_xlat16_4.xzw));
    u_xlat3.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat1.x = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat1.x = max(u_xlat1.x, 0.00100000005);
    u_xlat1.x = rsqrt(u_xlat1.x);
    u_xlat5.xyz = u_xlat1.xxx * u_xlat3.xyz;
    u_xlat15.x = min(u_xlat1.y, 1.0);
    u_xlat15.x = u_xlat43 * u_xlat15.x;
    u_xlat44 = dot(UnityPerMaterial._SpecularDir.xyz, UnityPerMaterial._SpecularDir.xyz);
    u_xlat44 = max(u_xlat44, 0.00100000005);
    u_xlat44 = rsqrt(u_xlat44);
    u_xlat6.xyz = float3(u_xlat44) * UnityPerMaterial._SpecularDir.xyz;
    u_xlat16_7.xyz = _SpecTex.sample(sampler_SpecTex, input.TEXCOORD11.xy).xyz;
    u_xlat16_8.xyz = _SpecTex.sample(sampler_SpecTex, input.TEXCOORD11.zw).xyz;
    u_xlat9.xyz = fma(u_xlat5.yyy, float3(0.0, 2.0, 0.0), (-u_xlat5.xyz));
    u_xlat44 = dot(u_xlat9.xyz, u_xlat6.xyz);
    u_xlat44 = clamp(u_xlat44, 0.0f, 1.0f);
    u_xlat44 = log2(u_xlat44);
    u_xlat6.xyz = float3(u_xlat44) * UnityPerMaterial._SpecularPower.xyz;
    u_xlat6.xyz = exp2(u_xlat6.xyz);
    u_xlat16_7.xyz = u_xlat16_7.xyz * u_xlat16_8.xyz;
    u_xlat6.xy = u_xlat6.xy * float2(u_xlat16_7.xy);
    u_xlat44 = u_xlat6.y + u_xlat6.x;
    u_xlat44 = fma(float(u_xlat16_7.z), u_xlat6.z, u_xlat44);
    u_xlat44 = u_xlat44 * UnityPerMaterial._SpecularIntensity;
    u_xlat42 = max(u_xlat42, u_xlat29.x);
    u_xlat6.xyz = fma(float3(u_xlat42), UnityPerMaterial._EdgeFoamColor.xyz, float3(u_xlat44));
    u_xlat2.xyz = fma(u_xlat6.xyz, u_xlat15.xxx, u_xlat2.xyz);
    u_xlat42 = u_xlat43 * u_xlat15.x;
    u_xlat16_4.xyz = half3(u_xlat0.yyy * float3(input.TEXCOORD4.xyz));
    u_xlat16_4.xyz = half3(fma(float3(input.TEXCOORD3.xyz), u_xlat0.xxx, float3(u_xlat16_4.xyz)));
    u_xlat16_4.xyz = half3(fma(float3(input.TEXCOORD5.xyz), u_xlat0.zzz, float3(u_xlat16_4.xyz)));
    u_xlat16_0.x = dot(u_xlat16_4.xyz, u_xlat16_4.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * u_xlat16_4.xyz;
    u_xlatb15 = 0.5<FGlobals.gPlanarShadowEnabled;
    if(u_xlatb15){
        u_xlatb15 = 0.0>=FGlobals.gShadowParams0[5].z;
        if(u_xlatb15){
            u_xlat16_4.x = half(1.0);
        }
        if(!u_xlatb15){
            u_xlat15.xy = input.TEXCOORD14.xy / input.TEXCOORD14.ww;
            u_xlat43 = input.TEXCOORD0.y + 100.0;
            u_xlat43 = u_xlat43 / FGlobals.gPlanarShadowParams.y;
            u_xlat43 = u_xlat43 + FGlobals.gShadowParams0[4].z;
            u_xlat10_43 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat15.xy, saturate(u_xlat43), level(0.0)));
            u_xlat16_43 = half(float(u_xlat10_43));
            u_xlatb6.xy = (u_xlat15.xy<float2(0.0, 0.0));
            u_xlatb44 = u_xlatb6.y || u_xlatb6.x;
            u_xlatb6.xy = (float2(1.0, 1.0)<u_xlat15.xy);
            u_xlatb45 = u_xlatb6.y || u_xlatb6.x;
            u_xlatb44 = u_xlatb44 || u_xlatb45;
            u_xlatb45 = input.TEXCOORD0.y<-100.0;
            u_xlatb44 = u_xlatb44 || u_xlatb45;
            u_xlat16_45 = u_xlat16_43 + half(-1.0);
            u_xlat45 = fma(FGlobals.gShadowParams0[5].z, float(u_xlat16_45), 1.0);
            u_xlat4 = (u_xlatb44) ? 1.0 : u_xlat45;
            u_xlat16_4.x = half(u_xlat4);
        }
    } else {
        u_xlat16_4.x = half(1.0);
    }
    u_xlatb44 = 0.0<FGlobals.CloudParam.w;
    if(u_xlatb44){
        u_xlat6 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
        u_xlat6 = fma(u_xlat6, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
        u_xlat6 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat6);
        u_xlat16_44 = CloudTex.sample(samplerCloudTex, u_xlat6.xy).y;
        u_xlat16_45 = CloudTex.sample(samplerCloudTex, u_xlat6.zw).w;
        u_xlat16_18 = u_xlat16_45 * half(0.5);
        u_xlat16_18 = fma(u_xlat16_44, half(0.5), u_xlat16_18);
        u_xlat16_44 = fma((-u_xlat16_18), u_xlat16_18, u_xlat16_18);
        u_xlat45 = fma((-float(u_xlat16_18)), float(u_xlat16_18), FGlobals.CloudParam.y);
        u_xlat16_44 = half(1.0) / u_xlat16_44;
        u_xlat44 = float(u_xlat16_44) * u_xlat45;
        u_xlat44 = clamp(u_xlat44, 0.0f, 1.0f);
        u_xlat45 = fma(u_xlat44, -2.0, 3.0);
        u_xlat44 = u_xlat44 * u_xlat44;
        u_xlat44 = u_xlat44 * u_xlat45;
        u_xlat44 = fma((-u_xlat44), FGlobals.CloudParam.z, 1.0);
        u_xlat44 = clamp(u_xlat44, 0.0f, 1.0f);
        u_xlat16_4.x = half(min(u_xlat44, float(u_xlat16_4.x)));
    }
    u_xlat16_18 = dot(float3(u_xlat16_0.xyz), u_xlat5.xyz);
    u_xlat16_32.x = u_xlat16_18 * half(-9.27999973);
    u_xlat16_32.x = exp2(u_xlat16_32.x);
    u_xlat16_32.x = min(u_xlat16_32.x, half(0.774399996));
    u_xlat16_32.x = fma(u_xlat16_32.x, half(0.879999995), half(0.0392000005));
    u_xlat16_32.xy = fma(u_xlat16_32.xx, half2(-1.03999996, 1.03999996), half2(0.971359968, -0.0373599976));
    u_xlat16_10.xy = half2(float2(UnityPerMaterial._SpecularLevel) * float2(4.0, 0.0799999982));
    u_xlat16_10.x = u_xlat16_10.x;
    u_xlat16_10.x = clamp(u_xlat16_10.x, 0.0h, 1.0h);
    u_xlat16_46 = u_xlat16_32.y * u_xlat16_10.x;
    u_xlat16_32.x = fma(u_xlat16_10.y, u_xlat16_32.x, u_xlat16_46);
    u_xlat5.xyz = u_xlat2.xyz * input.TEXCOORD8.xyz;
    u_xlat16_6.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat3.xyz = fma(u_xlat3.xyz, u_xlat1.xxx, float3(FGlobals.gLightBuffer[13].xyz));
    u_xlat44 = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat44 = max(u_xlat44, 0.00100000005);
    u_xlat44 = rsqrt(u_xlat44);
    u_xlat3.xyz = float3(u_xlat44) * u_xlat3.xyz;
    u_xlat16_46 = dot(u_xlat16_0.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_46 = max(u_xlat16_46, half(0.0));
    u_xlat0.x = dot(float3(u_xlat16_0.xyz), u_xlat3.xyz);
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlatb14 = u_xlat16_18>=half(0.0);
    u_xlat16_3.xyz = half3(u_xlat16_46) * u_xlat16_6.xyz;
    u_xlat28.x = fma((-u_xlat0.x), u_xlat0.x, 1.0);
    u_xlat0.x = u_xlat0.x * 0.0143999998;
    u_xlat0.x = fma(u_xlat0.x, u_xlat0.x, u_xlat28.x);
    u_xlat0.x = 0.0143999998 / u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = min(u_xlat0.x, 128.0);
    u_xlat0.x = u_xlat0.x * float(u_xlat16_32.x);
    u_xlat0.x = u_xlat0.x * 0.280000001;
    u_xlat0.x = u_xlatb14 ? u_xlat0.x : float(0.0);
    u_xlat0.xyz = u_xlat0.xxx + u_xlat2.xyz;
    u_xlat0.xyz = u_xlat0.xyz * float3(u_xlat16_3.xyz);
    u_xlat16_4.xyz = half3(float3(u_xlat16_4.xxx) * u_xlat0.xyz);
    u_xlat16_4.xyz = half3(fma(u_xlat5.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_4.xyz)));
    u_xlat1.xyz = input.TEXCOORD0.xyz + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz);
    u_xlat0.x = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat14.x = max(u_xlat0.x, 0.00100000005);
    u_xlat14.x = rsqrt(u_xlat14.x);
    u_xlat2.xyz = u_xlat14.xxx * u_xlat1.xyz;
    u_xlat0.x = sqrt(u_xlat0.x);
    u_xlat16_46 = half(u_xlat0.x + (-float(FGlobals.gFogParams[1].z)));
    u_xlat16_46 = max(u_xlat16_46, half(0.0));
    u_xlatb3.xyz = (half3(0.5, 0.5, 0.5)<FGlobals.gFogParams[7].wzx);
    u_xlatb14 = u_xlatb3.y || u_xlatb3.x;
    if(u_xlatb14){
        u_xlat14.xy = input.TEXCOORD0.xz + (-FGlobals._VT_TerrainInfo.zw);
        u_xlat14.xy = u_xlat14.xy * FGlobals._VT_TerrainInfo.yy;
        u_xlat14.xy = clamp(u_xlat14.xy, 0.0f, 1.0f);
        u_xlat16_44 = _VT_IndexTex.sample(sampler_VT_IndexTex, u_xlat14.xy, level(0.0)).x;
        u_xlat44 = fma(float(u_xlat16_44), 255.0, 0.5);
        u_xlatu44 = uint(u_xlat44);
        u_xlatu45 = u_xlatu44 & 0x7fu;
        u_xlat5.z = float(u_xlatu45);
        u_xlatu44 = u_xlatu44 >> 0x7u;
        u_xlat44 = float(u_xlatu44);
        u_xlati6.xy = int2(FGlobals._VT_TerrainTileInfo.yz);
        u_xlati45 = (-u_xlati6.y) + u_xlati6.x;
        u_xlati45 = 0x1 << u_xlati45;
        u_xlat45 = float(u_xlati45);
        u_xlat6.xy = float2(int2(FGlobals._VT_RootSize, FGlobals._VT_MaxVTMip));
        u_xlat14.xy = u_xlat14.xy * u_xlat6.xx;
        u_xlat6.xz = u_xlat14.xy / float2(u_xlat45);
        u_xlat6.xz = floor(u_xlat6.xz);
        u_xlat14.xy = fma((-u_xlat6.xz), float2(u_xlat45), u_xlat14.xy);
        u_xlat5.xy = u_xlat14.xy / float2(u_xlat45);
        u_xlat5.xy = clamp(u_xlat5.xy, 0.0f, 1.0f);
        u_xlat14.x = min(u_xlat44, u_xlat6.y);
        u_xlat10_14 = half(_VT_WorldYTex.sample(vt_linear_clamp_sampler, u_xlat5.xy, round(u_xlat5.z), level(u_xlat14.x)).x);
        u_xlat28.x = (-FGlobals._VT_TerrainHeightInfo.x) + FGlobals._VT_TerrainHeightInfo.y;
        u_xlat14.x = fma(float(u_xlat10_14), u_xlat28.x, FGlobals._VT_TerrainHeightInfo.x);
        u_xlat14.x = u_xlat14.x + FGlobals._VT_TerrainHeightInfo.w;
        u_xlat14.x = max(u_xlat14.x, -1000000.0);
        u_xlat14.x = min(u_xlat14.x, 1000000.0);
    } else {
        u_xlat14.x = 0.0;
    }
    u_xlat16_10.x = FGlobals.gFogParams[0].w + FGlobals.gFogParams[1].x;
    u_xlat28.x = (-u_xlat14.x) + input.TEXCOORD0.y;
    u_xlat1.w = u_xlat28.x + (-UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat28.x = dot(u_xlat1.xzw, u_xlat1.xzw);
    u_xlat28.x = sqrt(u_xlat28.x);
    u_xlat28.x = u_xlat28.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat28.x = max(u_xlat28.x, 0.0);
    u_xlat44 = (u_xlatb3.x) ? u_xlat1.w : u_xlat1.y;
    u_xlat16_46 = (u_xlatb3.x) ? half(u_xlat28.x) : u_xlat16_46;
    u_xlat16_24.x = half(float(FGlobals.gFogParams[1].z) / u_xlat0.x);
    u_xlat16_24.x = clamp(u_xlat16_24.x, 0.0h, 1.0h);
    u_xlat28.x = fma(u_xlat44, float(u_xlat16_24.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat28.x = u_xlat28.x + (-float(FGlobals.gFogParams[0].x));
    u_xlat28.x = max(u_xlat28.x, -127.0);
    u_xlat28.x = (-u_xlat28.x) * float(FGlobals.gFogParams[1].w);
    u_xlat28.x = exp2(u_xlat28.x);
    u_xlat16_24.x = (-u_xlat16_24.x) + half(1.0);
    u_xlat44 = u_xlat44 * float(u_xlat16_24.x);
    u_xlat44 = u_xlat44 * float(FGlobals.gFogParams[1].w);
    u_xlat44 = max(u_xlat44, -64.0);
    u_xlat44 = min(u_xlat44, -0.00100000005);
    u_xlat3.x = exp2((-u_xlat44));
    u_xlat3.x = (-u_xlat3.x) + 1.0;
    u_xlat3.x = u_xlat3.x / u_xlat44;
    u_xlatb44 = 0.00999999978<(-u_xlat44);
    u_xlat44 = (u_xlatb44) ? u_xlat3.x : 0.693147004;
    u_xlat28.x = u_xlat28.x * u_xlat44;
    u_xlat16_46 = half(u_xlat28.x * (-float(u_xlat16_46)));
    u_xlat16_46 = u_xlat16_10.x * u_xlat16_46;
    u_xlat16_46 = u_xlat16_46 * FGlobals.gFogParams[0].y;
    u_xlat16_46 = exp2(u_xlat16_46);
    u_xlat16_46 = max(u_xlat16_46, FGlobals.gFogParams[0].z);
    u_xlat16_24.x = dot(float3(FGlobals.gLightBuffer[11].xyz), u_xlat2.xyz);
    u_xlat16_11.xyz = FGlobals.gFogParams[0].www * FGlobals.gFogParams[2].xyz;
    u_xlat16_38 = fma(u_xlat16_24.x, u_xlat16_24.x, half(1.0));
    u_xlat16_28 = u_xlat16_38 * half(0.0596831031);
    u_xlat16_12.xyz = FGlobals.gFogParams[1].xxx * FGlobals.gFogParams[3].xyz;
    u_xlat16_52 = fma((-FGlobals.gFogParams[1].y), FGlobals.gFogParams[1].y, half(1.0));
    u_xlat16_2.x = u_xlat16_52 * half(0.119366206);
    u_xlat16_13.xy = fma(FGlobals.gFogParams[1].yy, FGlobals.gFogParams[1].yy, half2(1.0, 2.0));
    u_xlat16_24.x = dot(u_xlat16_24.xx, FGlobals.gFogParams[1].yy);
    u_xlat16_24.x = (-u_xlat16_24.x) + u_xlat16_13.x;
    u_xlat16_24.x = log2(abs(u_xlat16_24.x));
    u_xlat16_24.x = u_xlat16_24.x * half(-1.5);
    u_xlat16_24.x = exp2(u_xlat16_24.x);
    u_xlat16_2.x = u_xlat16_2.x * u_xlat16_24.x;
    u_xlat16_2.x = u_xlat16_38 * u_xlat16_2.x;
    u_xlat16_2.x = u_xlat16_2.x / u_xlat16_13.y;
    u_xlat16_24.xyz = u_xlat16_2.xxx * u_xlat16_12.xyz;
    u_xlat16_12.xyz = FGlobals.gLightBuffer[12].xyz * FGlobals.gFogParams[2].www;
    u_xlat16_24.xyz = fma(u_xlat16_11.xyz, half3(u_xlat16_28), u_xlat16_24.xyz);
    u_xlat16_24.xyz = u_xlat16_24.xyz * u_xlat16_12.xyz;
    u_xlat16_10.xyz = u_xlat16_24.xyz / u_xlat16_10.xxx;
    u_xlat16_52 = (-u_xlat16_46) + half(1.0);
    u_xlat16_10.xyz = half3(u_xlat16_52) * u_xlat16_10.xyz;
    u_xlat14.x = u_xlat14.x + float(FGlobals.gFogParams[3].w);
    u_xlat14.x = (u_xlatb3.y) ? u_xlat14.x : float(FGlobals.gFogParams[3].w);
    u_xlat16_52 = half(u_xlat0.x + (-float(FGlobals.gFogParams[5].y)));
    u_xlat16_52 = max(u_xlat16_52, half(0.0));
    u_xlat16_11.x = half(float(FGlobals.gFogParams[5].y) / u_xlat0.x);
    u_xlat16_11.x = clamp(u_xlat16_11.x, 0.0h, 1.0h);
    u_xlat28.x = fma(u_xlat1.y, float(u_xlat16_11.x), UnityPerCamera._WorldSpaceCameraPos.xyzx.y);
    u_xlat14.x = (-u_xlat14.x) + u_xlat28.x;
    u_xlat14.x = max(u_xlat14.x, -127.0);
    u_xlat14.x = (-u_xlat14.x) * float(FGlobals.gFogParams[5].z);
    u_xlat14.x = exp2(u_xlat14.x);
    u_xlat16_11.x = (-u_xlat16_11.x) + half(1.0);
    u_xlat28.x = u_xlat1.y * float(u_xlat16_11.x);
    u_xlat28.x = u_xlat28.x * float(FGlobals.gFogParams[5].z);
    u_xlat28.x = max(u_xlat28.x, -64.0);
    u_xlat28.x = min(u_xlat28.x, -0.00100000005);
    u_xlat2.x = exp2((-u_xlat28.x));
    u_xlat2.x = (-u_xlat2.x) + 1.0;
    u_xlat2.x = u_xlat2.x / u_xlat28.x;
    u_xlatb28 = 0.00999999978<(-u_xlat28.x);
    u_xlat28.x = (u_xlatb28) ? u_xlat2.x : 0.693147004;
    u_xlat14.x = u_xlat28.x * u_xlat14.x;
    u_xlat16_52 = half(u_xlat14.x * (-float(u_xlat16_52)));
    u_xlat16_52 = u_xlat16_52 * FGlobals.gFogParams[4].w;
    u_xlat16_52 = exp2(u_xlat16_52);
    u_xlat16_52 = max(u_xlat16_52, FGlobals.gFogParams[5].x);
    u_xlat16_14.xy = max(FGlobals.gFogParams[9].xy, half2(9.99999975e-05, 9.99999975e-05));
    u_xlat2.x = u_xlat0.x + (-float(FGlobals.gFogParams[1].z));
    u_xlat16_14.xy = half2(1.0, 1.0) / u_xlat16_14.xy;
    u_xlat14.x = float(u_xlat16_14.x) * u_xlat2.x;
    u_xlat14.x = clamp(u_xlat14.x, 0.0f, 1.0f);
    u_xlat2.x = fma(u_xlat14.x, -2.0, 3.0);
    u_xlat14.x = u_xlat14.x * u_xlat14.x;
    u_xlat14.x = u_xlat14.x * u_xlat2.x;
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[5].y));
    u_xlat0.x = float(u_xlat16_14.y) * u_xlat0.x;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat28.x = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat28.x;
    u_xlat16_10.xyz = half3(u_xlat14.xxx * float3(u_xlat16_10.xyz));
    u_xlat16_28 = u_xlat16_46 + half(-1.0);
    u_xlat14.x = fma(u_xlat14.x, float(u_xlat16_28), 1.0);
    u_xlat16_28 = u_xlat16_52 + half(-1.0);
    u_xlat0.x = fma(u_xlat0.x, float(u_xlat16_28), 1.0);
    u_xlat16_46 = half((-u_xlat0.x) + 1.0);
    u_xlat16_10.xyz = half3(u_xlat0.xxx * float3(u_xlat16_10.xyz));
    u_xlat16_1.xyz = fma(FGlobals.gFogParams[4].xyz, half3(u_xlat16_46), u_xlat16_10.xyz);
    u_xlat16_1.w = half(u_xlat14.x * u_xlat0.x);
    if(u_xlatb3.z){
        u_xlat16_10.xy = half2(fma(input.TEXCOORD0.xz, float2(FGlobals.gFogParams[8].xy), float2(FGlobals.gFogParams[8].zw)));
        u_xlat16_46 = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_10.xy), level(0.0)).x;
        u_xlat16_46 = log2(u_xlat16_46);
        u_xlat16_46 = u_xlat16_46 * FGlobals.gFogParams[7].y;
        u_xlat16_46 = exp2(u_xlat16_46);
        u_xlat16_10.x = half(fma((-u_xlat0.x), u_xlat14.x, 1.0));
        u_xlat16_1.w = fma(u_xlat16_46, u_xlat16_10.x, u_xlat16_1.w);
        u_xlat16_1.xyz = fma(half3(u_xlat16_46), (-u_xlat16_1.xyz), u_xlat16_1.xyz);
    }
    u_xlatb0 = half(0.0)<FGlobals._ScreenCenterFogParams0.z;
    u_xlat2.xyz = input.TEXCOORD0.yyy * UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[1].xyw;
    u_xlat2.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[0].xyw, input.TEXCOORD0.xxx, u_xlat2.xyz);
    u_xlat2.xyz = fma(UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[2].xyw, input.TEXCOORD0.zzz, u_xlat2.xyz);
    u_xlat2.xyz = u_xlat2.xyz + UnityPerFrame.hlslcc_mtx4x4unity_MatrixVP[3].xyw;
    u_xlat14.xy = u_xlat2.xy / u_xlat2.zz;
    u_xlat14.xy = fma(u_xlat14.xy, float2(0.5, 0.5), float2(0.5, 0.5));
    u_xlat16_2.xy = FGlobals._ScreenCenterFogParams1.xy + half2(0.5, 0.5);
    u_xlat14.xy = u_xlat14.xy + (-float2(u_xlat16_2.xy));
    u_xlat14.x = dot(u_xlat14.xy, u_xlat14.xy);
    u_xlat14.x = sqrt(u_xlat14.x);
    u_xlat16_46 = half(u_xlat14.x + (-float(FGlobals._ScreenCenterFogParams0.x)));
    u_xlat16_10.x = half(1.0) / FGlobals._ScreenCenterFogParams0.y;
    u_xlat16_46 = u_xlat16_46 * u_xlat16_10.x;
    u_xlat16_46 = clamp(u_xlat16_46, 0.0h, 1.0h);
    u_xlat16_10.x = fma(u_xlat16_46, half(-2.0), half(3.0));
    u_xlat16_46 = u_xlat16_46 * u_xlat16_46;
    u_xlat16_46 = fma((-u_xlat16_10.x), u_xlat16_46, half(1.0));
    u_xlat16_10.x = u_xlat16_46 * FGlobals._ScreenCenterFogParams0.z;
    u_xlat16_46 = fma((-u_xlat16_46), FGlobals._ScreenCenterFogParams0.z, half(1.0));
    u_xlat16_2.xyz = u_xlat16_1.xyz * half3(u_xlat16_46);
    u_xlat16_46 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_2.w = fma(u_xlat16_10.x, u_xlat16_46, u_xlat16_1.w);
    u_xlat16_1 = (bool(u_xlatb0)) ? u_xlat16_2 : u_xlat16_1;
    output.SV_TARGET0.xyz = fma(u_xlat16_4.xyz, u_xlat16_1.www, u_xlat16_1.xyz);
    output.SV_TARGET0.w = half(u_xlat42);
    return output;
}
