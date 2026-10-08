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
    half4 gLightBuffer [115];
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
    float4 _FoamTex_ST ;
    half4 _WaterColor1 ;
    half4 _WaterColor2 ;
    float _ColorRange ;
    float _Distortion ;
    float _SpecularLevel ;
    float _EdgeOpacity ;
    float _Opacity ;
    half _OpacityMaskEnabled ;
    half _ShoreAlphaClip ;
    half _ShoreAlphaIntensity ;
    float _VertexWaveTiling ;
    float _VertexWaveSpeed ;
    float _VertexWaveIntensity ;
    float _VertexShoreTiling ;
    float _VertexShoreSpeed ;
    float _VertexShoreIntensity ;
    float4 _WaveDirection ;
    float _WPO_MasterSpeed ;
    float4 _WPO_WaveSpeed ;
    float4 _WPO_WaveScale ;
    float4 _WPO_WaveIntensity ;
    half4 _ShoreFoamColor ;
    float _ShoreDepthRange ;
    float _ShoreWaveFoamTiling ;
    float _ShoreWaveRampSize ;
    float _ShoreWaveNoiseClip ;
    float _ShoreAreaOffset ;
    float _ShoreWaveIntensity ;
    float _ShoreWaveBumpIntensity ;
    float _SpecularTiling ;
    float _SpecularIntensity ;
    float4 _SpecularPower ;
    float4 _SpecularDir ;
    float4 _NoiseScale ;
    float4 _ShoreMask_UV ;
    float t5_intensity ;
    float4 t5_uv1 ;
    float4 t5_uv2 ;
    float4 t5_control ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    half3 TEXCOORD5 [[ user(TEXCOORD5) ]] ;
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]] ;
    float4 TEXCOORD9 [[ user(TEXCOORD9) ]] ;
    float4 TEXCOORD10 [[ user(TEXCOORD10) ]] ;
    float4 TEXCOORD11 [[ user(TEXCOORD11) ]] ;
    float SV_Target1 [[ color(xlt_remap_i[1]) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_TARGET0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(2) ]],
    sampler sampler_ShoreMask [[ sampler (0) ]],
    sampler samplert5 [[ sampler (1) ]],
    sampler sampler_ShoreWaveRamp [[ sampler (2) ]],
    sampler sampler_ShoreWaveRamp2 [[ sampler (3) ]],
    sampler sampler_NoiseTex [[ sampler (4) ]],
    sampler sampler_FoamTex [[ sampler (5) ]],
    sampler sampler_SpecTex [[ sampler (6) ]],
    sampler sampler_SSPRRT [[ sampler (7) ]],
    sampler sampler_2DSpecCube0 [[ sampler (8) ]],
    texture2d<half, access::sample > _ShoreMask [[ texture(0) ]] ,
    texture2d<half, access::sample > t5 [[ texture(1) ]] ,
    texture2d<half, access::sample > _FoamTex [[ texture(2) ]] ,
    texture2d<half, access::sample > _NoiseTex [[ texture(3) ]] ,
    texture2d<half, access::sample > _ShoreWaveRamp2 [[ texture(4) ]] ,
    texture2d<half, access::sample > _ShoreWaveRamp [[ texture(5) ]] ,
    texture2d<half, access::sample > _SpecTex [[ texture(6) ]] ,
    texture2d<half, access::sample > _SSPRRT [[ texture(7) ]] ,
    texture2d<half, access::sample > _2DSpecCube0 [[ texture(8) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    half4 u_xlat16_0;
    float3 u_xlat1;
    half3 u_xlat16_1;
    float3 u_xlat2;
    half4 u_xlat16_2;
    half3 u_xlat16_3;
    float4 u_xlat4;
    half2 u_xlat16_4;
    float3 u_xlat5;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    half3 u_xlat16_7;
    half3 u_xlat16_8;
    float3 u_xlat9;
    float u_xlat11;
    half u_xlat16_11;
    half3 u_xlat16_12;
    float2 u_xlat18;
    half u_xlat16_18;
    half u_xlat16_20;
    half u_xlat16_21;
    float2 u_xlat22;
    half2 u_xlat16_26;
    float u_xlat27;
    bool u_xlatb27;
    float u_xlat28;
    bool u_xlatb28;
    float u_xlat29;
    bool u_xlatb29;
    half u_xlat16_30;
    half u_xlat16_34;
    u_xlat0.x = UnityPerCamera._Time.y * 0.100000001;
    u_xlat0.x = fract(u_xlat0.x);
    u_xlat0.x = fma(input.TEXCOORD0.x, 0.0166666675, u_xlat0.x);
    u_xlat0.x = u_xlat0.x * 6.28318977;
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat0.xy = u_xlat0.xx * float2(0.0, 0.400000006);
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat0.xy = fma(u_xlat1.xy, float2(UnityPerMaterial._ShoreWaveFoamTiling), u_xlat0.xy);
    u_xlat18.xy = (-input.TEXCOORD0.zx) / UnityPerMaterial.t5_uv1.zz;
    u_xlat1.x = UnityPerCamera._Time.y;
    u_xlat1.y = input.TEXCOORD10.w;
    u_xlat18.xy = fma(UnityPerMaterial.t5_uv1.xy, u_xlat1.xy, u_xlat18.xy);
    u_xlat16_2.xyz = t5.sample(samplert5, u_xlat18.xy).xyz;
    u_xlat16_3.xyz = fma(u_xlat16_2.xyz, half3(2.0, 2.0, 2.0), half3(-1.0, -1.0, -1.0));
    u_xlat18.xy = (-input.TEXCOORD0.zx) / UnityPerMaterial.t5_uv2.zz;
    u_xlat18.xy = fma(UnityPerMaterial.t5_uv2.xy, u_xlat1.xy, u_xlat18.xy);
    u_xlat16_1.xyz = t5.sample(samplert5, u_xlat18.xy).xyz;
    u_xlat16_3.xyz = fma(u_xlat16_1.xyz, half3(2.0, 2.0, 2.0), u_xlat16_3.xyz);
    u_xlat16_1.xyz = u_xlat16_3.xyz + half3(-1.0, -1.0, -2.0);
    u_xlat1.xyz = fma(float3(UnityPerMaterial.t5_intensity), float3(u_xlat16_1.xyz), float3(0.0, 0.0, 1.0));
    u_xlat18.xy = input.TEXCOORD0.xz + (-UnityPerMaterial._ShoreMask_UV.xy);
    u_xlat18.xy = u_xlat18.xy / UnityPerMaterial._ShoreMask_UV.zz;
    u_xlat16_2 = _ShoreMask.sample(sampler_ShoreMask, u_xlat18.xy);
    u_xlat16_3.x = (-u_xlat16_2.z) + half(1.0);
    u_xlat1.xyz = fma(input.TEXCOORD10.xyz, float3(u_xlat16_3.xxx), u_xlat1.xyz);
    u_xlat0.xy = fma(u_xlat1.xy, float2(0.0299999993, 0.0299999993), u_xlat0.xy);
    u_xlat16_0.xy = _FoamTex.sample(sampler_FoamTex, u_xlat0.xy).yz;
    u_xlat18.x = fma(UnityPerCamera._Time.y, 0.0500000007, float(u_xlat16_3.x));
    u_xlat18.x = u_xlat18.x / UnityPerMaterial._ShoreWaveRampSize;
    u_xlatb27 = u_xlat18.x>=(-u_xlat18.x);
    u_xlat18.x = fract(abs(u_xlat18.x));
    u_xlat18.x = (u_xlatb27) ? u_xlat18.x : (-u_xlat18.x);
    u_xlat18.x = u_xlat18.x * UnityPerMaterial._ShoreWaveRampSize;
    u_xlat22.x = u_xlat18.x / UnityPerMaterial._ShoreWaveRampSize;
    u_xlat4.y = float(0.5);
    u_xlat22.y = float(0.5);
    u_xlat16_5.xyz = _ShoreWaveRamp.sample(sampler_ShoreWaveRamp, u_xlat22.xy).xyw;
    u_xlat16_12.x = dot(u_xlat16_5.xxy, u_xlat16_0.xxy);
    u_xlat16_21 = fma(u_xlat16_5.z, half(2.0), half(-1.0));
    u_xlat18.xy = u_xlat1.xy * UnityPerMaterial._NoiseScale.yy;
    u_xlat18.xy = fma((-input.TEXCOORD0.zx), UnityPerMaterial._NoiseScale.xx, u_xlat18.xy);
    u_xlat18.xy = u_xlat18.xy + UnityPerMaterial._NoiseScale.zw;
    u_xlat16_18 = _NoiseTex.sample(sampler_NoiseTex, u_xlat18.xy).z;
    u_xlat16_30 = log2(u_xlat16_2.z);
    u_xlat16_30 = u_xlat16_30 * half(20.0);
    u_xlat16_30 = exp2(u_xlat16_30);
    u_xlat16_30 = u_xlat16_18 + u_xlat16_30;
    u_xlat18.x = float(u_xlat16_30) + (-UnityPerMaterial._ShoreWaveNoiseClip);
    u_xlat18.x = clamp(u_xlat18.x, 0.0f, 1.0f);
    u_xlat27 = (-UnityPerMaterial._ShoreWaveNoiseClip) + 1.0;
    u_xlat18.x = u_xlat18.x / u_xlat27;
    u_xlat27 = u_xlat18.x;
    u_xlat27 = clamp(u_xlat27, 0.0f, 1.0f);
    u_xlat27 = u_xlat27 * float(u_xlat16_12.x);
    u_xlat27 = float(u_xlat16_2.w) * u_xlat27;
    u_xlat28 = (-UnityPerMaterial._ShoreAreaOffset) + 1.0;
    u_xlat22.x = float(u_xlat16_2.z) + (-UnityPerMaterial._ShoreAreaOffset);
    u_xlat22.x = clamp(u_xlat22.x, 0.0f, 1.0f);
    u_xlat28 = u_xlat22.x / u_xlat28;
    u_xlat27 = u_xlat27 * u_xlat28;
    u_xlat28 = u_xlat28;
    u_xlat28 = clamp(u_xlat28, 0.0f, 1.0f);
    u_xlat28 = (-u_xlat28) + 1.0;
    u_xlat22.x = fma(UnityPerCamera._ZBufferParams.z, input.SV_Target1, UnityPerCamera._ZBufferParams.w);
    u_xlat22.x = float(1.0) / u_xlat22.x;
    u_xlat22.x = u_xlat22.x + (-input.TEXCOORD9.w);
    u_xlat4.x = u_xlat22.x / UnityPerMaterial._ShoreDepthRange;
    u_xlat4.x = clamp(u_xlat4.x, 0.0f, 1.0f);
    u_xlat22.x = u_xlat22.x / UnityPerMaterial._EdgeOpacity;
    u_xlat22.x = clamp(u_xlat22.x, 0.0f, 1.0f);
    u_xlat16_4.xy = _ShoreWaveRamp2.sample(sampler_ShoreWaveRamp2, u_xlat4.xy).xy;
    u_xlat16_12.x = dot(u_xlat16_4.xy, u_xlat16_0.xy);
    u_xlat0.x = max(u_xlat27, float(u_xlat16_12.x));
    u_xlat16_12.x = half(fma(u_xlat0.x, UnityPerMaterial._ShoreWaveIntensity, u_xlat22.x));
    u_xlat16_12.x = clamp(u_xlat16_12.x, 0.0h, 1.0h);
    u_xlat0.x = u_xlat0.x * UnityPerMaterial._ShoreWaveIntensity;
    u_xlat9.x = float(u_xlat16_12.x) * UnityPerMaterial._Opacity;
    u_xlat16_12.x = fma(u_xlat16_2.w, UnityPerMaterial._OpacityMaskEnabled, (-UnityPerMaterial._OpacityMaskEnabled));
    u_xlat16_12.x = u_xlat16_12.x + half(1.0);
    u_xlat4.w = u_xlat9.x * float(u_xlat16_12.x);
    u_xlat16_12.xz = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_12.xy = half2(u_xlat16_21) * u_xlat16_12.xz;
    u_xlat16_12.xy = u_xlat16_2.zz * u_xlat16_12.xy;
    u_xlat9.xy = u_xlat18.xx * float2(u_xlat16_12.xy);
    u_xlat2.xy = u_xlat9.xy * float2(UnityPerMaterial._ShoreWaveBumpIntensity);
    u_xlat2.z = 0.0;
    u_xlat9.xyz = u_xlat1.xyz + u_xlat2.xyz;
    u_xlat1.x = dot(float3(input.TEXCOORD3.xyz), u_xlat9.xyz);
    u_xlat1.y = dot(float3(input.TEXCOORD4.xyz), u_xlat9.xyz);
    u_xlat1.z = dot(float3(input.TEXCOORD5.xyz), u_xlat9.xyz);
    u_xlat2.x = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat2.x = max(u_xlat2.x, 0.00100000005);
    u_xlat2.x = rsqrt(u_xlat2.x);
    u_xlat1.xyz = u_xlat1.xyz * u_xlat2.xxx;
    u_xlat2.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat29 = dot(u_xlat2.xyz, u_xlat2.xyz);
    u_xlat29 = max(u_xlat29, 0.00100000005);
    u_xlat29 = rsqrt(u_xlat29);
    u_xlat5.xyz = float3(u_xlat29) * u_xlat2.xyz;
    u_xlat16_12.xyz = half3(fma(u_xlat2.xyz, float3(u_xlat29), float3(FGlobals.gLightBuffer[13].xxx)));
    u_xlat2.x = dot((-u_xlat5.xyz), u_xlat1.xyz);
    u_xlat2.x = u_xlat2.x + u_xlat2.x;
    u_xlat1.xyz = fma(u_xlat1.xyz, (-u_xlat2.xxx), (-u_xlat5.xyz));
    u_xlat2.x = dot(UnityPerMaterial._SpecularDir.xyz, UnityPerMaterial._SpecularDir.xyz);
    u_xlat2.x = max(u_xlat2.x, 0.00100000005);
    u_xlat2.x = rsqrt(u_xlat2.x);
    u_xlat2.xyz = u_xlat2.xxx * UnityPerMaterial._SpecularDir.xyz;
    u_xlat1.x = dot(u_xlat1.xyz, u_xlat2.xyz);
    u_xlat1.x = clamp(u_xlat1.x, 0.0f, 1.0f);
    u_xlat1.x = log2(u_xlat1.x);
    u_xlat1.xyz = u_xlat1.xxx * UnityPerMaterial._SpecularPower.xyz;
    u_xlat1.xyz = exp2(u_xlat1.xyz);
    u_xlat16_2.xyz = _SpecTex.sample(sampler_SpecTex, input.TEXCOORD11.xy).xyz;
    u_xlat16_6.xyz = _SpecTex.sample(sampler_SpecTex, input.TEXCOORD11.zw).xyz;
    u_xlat16_2.xyz = u_xlat16_2.xyz * u_xlat16_6.xyz;
    u_xlat1.xy = u_xlat1.xy * float2(u_xlat16_2.xy);
    u_xlat1.x = u_xlat1.y + u_xlat1.x;
    u_xlat1.x = fma(float(u_xlat16_2.z), u_xlat1.z, u_xlat1.x);
    u_xlat1.x = u_xlat1.x * UnityPerMaterial._SpecularIntensity;
    u_xlat1.xyz = fma(u_xlat0.xxx, float3(UnityPerMaterial._ShoreFoamColor.xyz), u_xlat1.xxx);
    u_xlat16_2.xyz = fma(UnityPerMaterial._WaterColor2.xyz, half3(0.100000001, 0.100000001, 0.100000001), (-UnityPerMaterial._WaterColor1.xyz));
    u_xlat16_2.xyz = fma(u_xlat16_3.xxx, u_xlat16_2.xyz, UnityPerMaterial._WaterColor1.xyz);
    u_xlat1.xyz = fma(u_xlat1.xyz, u_xlat4.www, float3(u_xlat16_2.xyz));
    u_xlat2.xyz = u_xlat1.xyz * input.TEXCOORD8.xyz;
    u_xlat16_7.xyz = half3(u_xlat9.yyy * float3(input.TEXCOORD4.xyz));
    u_xlat16_7.xyz = half3(fma(float3(input.TEXCOORD3.xyz), u_xlat9.xxx, float3(u_xlat16_7.xyz)));
    u_xlat16_7.xyz = half3(fma(float3(input.TEXCOORD5.xyz), u_xlat9.zzz, float3(u_xlat16_7.xyz)));
    u_xlat0.xy = u_xlat9.xy * float2(UnityPerMaterial._Distortion);
    u_xlat0.xy = float2(u_xlat28) * u_xlat0.xy;
    u_xlat16_18 = dot(u_xlat16_7.xyz, u_xlat16_7.xyz);
    u_xlat16_18 = max(u_xlat16_18, half(0.00100000005));
    u_xlat16_18 = rsqrt(u_xlat16_18);
    u_xlat16_6.xyz = half3(u_xlat16_18) * u_xlat16_7.xyz;
    u_xlat16_3.x = dot((-u_xlat5.xyz), float3(u_xlat16_6.xyz));
    u_xlat16_3.x = u_xlat16_3.x + u_xlat16_3.x;
    u_xlat16_7.xyz = half3(fma(float3(u_xlat16_6.xyz), (-float3(u_xlat16_3.xxx)), (-u_xlat5.xyz)));
    u_xlat16_3.x = dot(float3(u_xlat16_6.xyz), u_xlat5.xyz);
    u_xlat16_18 = dot(u_xlat16_7.xyz, u_xlat16_7.xyz);
    u_xlat16_18 = max(u_xlat16_18, half(0.00100000005));
    u_xlat16_18 = rsqrt(u_xlat16_18);
    u_xlat16_5.xyz = half3(u_xlat16_18) * u_xlat16_7.xyz;
    u_xlat16_7.x = fma(u_xlat16_5.y, half(8.0), half(8.0));
    u_xlat16_7.x = sqrt(u_xlat16_7.x);
    u_xlat16_7.xy = u_xlat16_5.xz / u_xlat16_7.xx;
    u_xlat16_7.xy = u_xlat16_7.xy + half2(0.5, 0.5);
    u_xlat16_5.xyz = _2DSpecCube0.sample(sampler_2DSpecCube0, float2(u_xlat16_7.xy), level(1.16351998)).xyz;
    u_xlat18.xy = input.TEXCOORD9.xy / input.TEXCOORD9.ww;
    u_xlat16_7.xy = half2(fma(u_xlat0.xy, float2(0.5, 0.5), u_xlat18.xy));
    u_xlat0 = float4(_SSPRRT.sample(sampler_SSPRRT, float2(u_xlat16_7.xy)));
    u_xlatb28 = 1.0<u_xlat0.w;
    u_xlatb29 = u_xlat0.w<0.100000001;
    u_xlatb28 = u_xlatb28 || u_xlatb29;
    u_xlat16_0 = (bool(u_xlatb28)) ? half4(0.0, 0.0, 0.0, 0.0) : half4(u_xlat0);
    u_xlat16_7.xyz = fma((-u_xlat16_5.xyz), half3(FGlobals._SpecCubePower), u_xlat16_0.xyz);
    u_xlat16_8.xyz = u_xlat16_5.xyz * half3(FGlobals._SpecCubePower);
    u_xlat16_7.xyz = fma(u_xlat16_0.www, u_xlat16_7.xyz, u_xlat16_8.xyz);
    u_xlat16_34 = u_xlat16_3.x * half(-9.27999973);
    u_xlatb28 = u_xlat16_3.x>=half(0.0);
    u_xlat16_3.x = exp2(u_xlat16_34);
    u_xlat16_3.x = min(u_xlat16_3.x, half(0.774399996));
    u_xlat16_3.x = fma(u_xlat16_3.x, half(0.879999995), half(0.0392000005));
    u_xlat16_8.xy = fma(u_xlat16_3.xx, half2(-1.03999996, 1.03999996), half2(0.971359968, -0.0373599976));
    u_xlat16_26.xy = half2(float2(UnityPerMaterial._SpecularLevel) * float2(4.0, 0.0799999982));
    u_xlat16_26.x = u_xlat16_26.x;
    u_xlat16_26.x = clamp(u_xlat16_26.x, 0.0h, 1.0h);
    u_xlat16_3.x = u_xlat16_26.x * u_xlat16_8.y;
    u_xlat16_3.x = fma(u_xlat16_26.y, u_xlat16_8.x, u_xlat16_3.x);
    u_xlat16_7.xyz = u_xlat16_3.xxx * u_xlat16_7.xyz;
    u_xlat16_34 = dot(float3(0.212500006, 0.715399981, 0.0720999986), input.TEXCOORD8.xyz);
    u_xlat16_34 = u_xlat16_34 * FGlobals.gLightBuffer[10].w;
    u_xlat16_34 = clamp(u_xlat16_34, 0.0h, 1.0h);
    u_xlat16_7.xyz = half3(u_xlat16_34) * u_xlat16_7.xyz;
    u_xlat16_7.xyz = u_xlat16_7.xyz * FGlobals.gLightBuffer[10].xyz;
    u_xlat16_7.xyz = half3(fma(u_xlat2.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_7.xyz)));
    u_xlat16_2.x = dot(u_xlat16_12.xyz, u_xlat16_12.xyz);
    u_xlat16_2.x = max(u_xlat16_2.x, half(0.00100000005));
    u_xlat16_2.x = rsqrt(u_xlat16_2.x);
    u_xlat16_2.xyz = u_xlat16_2.xxx * u_xlat16_12.xyz;
    u_xlat16_12.x = dot(u_xlat16_6.xyz, u_xlat16_2.xyz);
    u_xlat16_2.x = dot(u_xlat16_6.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_2.x = max(u_xlat16_2.x, half(0.0));
    u_xlat16_12.x = max(u_xlat16_12.x, half(0.0));
    u_xlat16_11 = fma((-u_xlat16_12.x), u_xlat16_12.x, half(1.0));
    u_xlat16_20 = u_xlat16_12.x * half(0.0143999998);
    u_xlat16_11 = fma(u_xlat16_20, u_xlat16_20, u_xlat16_11);
    u_xlat16_11 = half(0.0143999998) / u_xlat16_11;
    u_xlat16_11 = u_xlat16_11 * u_xlat16_11;
    u_xlat16_11 = min(u_xlat16_11, half(128.0));
    u_xlat16_11 = u_xlat16_11 * u_xlat16_3.x;
    u_xlat11 = float(u_xlat16_11) * 0.280000001;
    u_xlat28 = u_xlatb28 ? u_xlat11 : float(0.0);
    u_xlat1.xyz = float3(u_xlat28) + u_xlat1.xyz;
    u_xlat1.xyz = float3(u_xlat16_2.xxx) * u_xlat1.xyz;
    u_xlat16_2.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat4.xyz = fma(u_xlat1.xyz, float3(u_xlat16_2.xyz), float3(u_xlat16_7.xyz));
    output.SV_TARGET0 = half4(u_xlat4);
    return output;
}
