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
    float4 gShadowParams0 [6];
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
    float4 TEXCOORD9 [[ user(TEXCOORD9) ]] ;
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
    sampler sampler_ShoreWaveRamp [[ sampler (0) ]],
    sampler sampler_SpecTex [[ sampler (1) ]],
    sampler sampler_FoamTex [[ sampler (2) ]],
    sampler samplert5 [[ sampler (3) ]],
    sampler samplerCloudTex [[ sampler (4) ]],
    sampler sampler_2DSpecCube0 [[ sampler (5) ]],
    texture2d<half, access::sample > t5 [[ texture(0) ]] ,
    texture2d<half, access::sample > _FoamTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _ShoreWaveRamp [[ texture(2) ]] ,
    texture2d<half, access::sample > _SpecTex [[ texture(3) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(4) ]] ,
    texture2d<half, access::sample > _2DSpecCube0 [[ texture(5) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    half3 u_xlat16_0;
    half4 u_xlat16_1;
    float4 u_xlat2;
    half3 u_xlat16_2;
    float3 u_xlat3;
    half3 u_xlat16_3;
    bool u_xlatb3;
    float3 u_xlat4;
    half3 u_xlat16_4;
    float3 u_xlat5;
    half3 u_xlat16_6;
    half4 u_xlat16_7;
    float3 u_xlat8;
    bool u_xlatb8;
    half3 u_xlat16_9;
    float u_xlat16;
    half u_xlat16_16;
    half u_xlat16_17;
    float2 u_xlat19;
    half2 u_xlat16_19;
    float u_xlat24;
    half u_xlat16_25;
    float u_xlat26;
    half u_xlat16_26;
    u_xlat0 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat0 = fma(u_xlat0, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat0 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat0);
    u_xlat16_16 = CloudTex.sample(samplerCloudTex, u_xlat0.zw).w;
    u_xlat16_0.x = CloudTex.sample(samplerCloudTex, u_xlat0.xy).y;
    u_xlat16_1.x = u_xlat16_16 * half(0.5);
    u_xlat16_1.x = fma(u_xlat16_0.x, half(0.5), u_xlat16_1.x);
    u_xlat16_0.x = fma((-u_xlat16_1.x), u_xlat16_1.x, u_xlat16_1.x);
    u_xlat8.x = fma((-float(u_xlat16_1.x)), float(u_xlat16_1.x), FGlobals.CloudParam.y);
    u_xlat16_0.x = half(1.0) / u_xlat16_0.x;
    u_xlat0.x = float(u_xlat16_0.x) * u_xlat8.x;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat8.x = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat8.x;
    u_xlat0.x = fma((-u_xlat0.x), FGlobals.CloudParam.z, 1.0);
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlatb8 = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_1.x = (u_xlatb8) ? half(u_xlat0.x) : half(1.0);
    u_xlat0.xz = input.TEXCOORD0.ww;
    u_xlat0.yw = input.TEXCOORD1.ww;
    u_xlat2 = UnityPerCamera._Time.yyyy * UnityPerMaterial._WaveFoamOffset;
    u_xlat0 = fma(u_xlat0, UnityPerMaterial._WaveFoamTiling, u_xlat2);
    u_xlat2.xy = (-input.TEXCOORD0.zx) / UnityPerMaterial.t5_uv1.zz;
    u_xlat3.x = UnityPerCamera._Time.y;
    u_xlat3.y = float(0.0);
    u_xlat19.y = float(0.5);
    u_xlat2.xy = fma(UnityPerMaterial.t5_uv1.xy, u_xlat3.xy, u_xlat2.xy);
    u_xlat16_2.xyz = t5.sample(samplert5, u_xlat2.xy).xyz;
    u_xlat16_2.xyz = fma(u_xlat16_2.xyz, half3(2.0, 2.0, 2.0), half3(-1.0, -1.0, -1.0));
    u_xlat4.xy = (-input.TEXCOORD0.zx) / UnityPerMaterial.t5_uv2.zz;
    u_xlat3.xy = fma(UnityPerMaterial.t5_uv2.xy, u_xlat3.xy, u_xlat4.xy);
    u_xlat16_4.xyz = t5.sample(samplert5, u_xlat3.xy).xyz;
    u_xlat16_2.xyz = fma(u_xlat16_4.xyz, half3(2.0, 2.0, 2.0), u_xlat16_2.xyz);
    u_xlat16_2.xyz = u_xlat16_2.xyz + half3(-1.0, -1.0, -2.0);
    u_xlat2.xyz = fma(float3(UnityPerMaterial.t5_intensity), float3(u_xlat16_2.xyz), float3(0.0, 0.0, 1.0));
    u_xlat0 = fma(u_xlat2.xyxy, float4(UnityPerMaterial._WaveFoamDistortion), u_xlat0);
    u_xlat16_4.xyz = _FoamTex.sample(sampler_FoamTex, u_xlat0.xy).xyz;
    u_xlat16_0.xyz = _FoamTex.sample(sampler_FoamTex, u_xlat0.zw).xyz;
    u_xlat16_0.x = dot(u_xlat16_4.xyz, u_xlat16_0.xyz);
    u_xlat8.x = fma(UnityPerCamera._ZBufferParams.z, input.SV_Target1, UnityPerCamera._ZBufferParams.w);
    u_xlat8.x = float(1.0) / u_xlat8.x;
    u_xlat8.x = u_xlat8.x + (-input.TEXCOORD9.w);
    u_xlat16 = u_xlat8.x / UnityPerMaterial._WaveFoamRange;
    u_xlat16 = clamp(u_xlat16, 0.0f, 1.0f);
    u_xlat24 = (-u_xlat16) + 1.0;
    u_xlat26 = UnityPerCamera._WorldSpaceCameraPos.xyzx.y + (-float(UnityPerMaterial._DisableDepthFade_FromCameraHeight));
    u_xlat26 = u_xlat26 / float(UnityPerMaterial._DisableDepthFade_CameraHeightRange);
    u_xlat26 = clamp(u_xlat26, 0.0f, 1.0f);
    u_xlat16 = fma(u_xlat26, u_xlat24, u_xlat16);
    u_xlat16 = (-u_xlat16) + 1.0;
    u_xlat0.x = u_xlat16 * float(u_xlat16_0.x);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * UnityPerMaterial._WaveFoamOpacity;
    u_xlat16 = u_xlat8.x / UnityPerMaterial._EdgeFoamRange;
    u_xlat16 = clamp(u_xlat16, 0.0f, 1.0f);
    u_xlat8.xz = u_xlat8.xx / float2(UnityPerMaterial._ColorRange, UnityPerMaterial._EdgeOpacity);
    u_xlat8.xz = clamp(u_xlat8.xz, 0.0f, 1.0f);
    u_xlat3.x = (-u_xlat16) + 1.0;
    u_xlat16 = fma(u_xlat26, u_xlat3.x, u_xlat16);
    u_xlat19.x = u_xlat16 * UnityPerMaterial._EdgeFoamPower;
    u_xlat16_3.xy = _ShoreWaveRamp.sample(sampler_ShoreWaveRamp, u_xlat19.xy).xy;
    u_xlat19.xy = u_xlat2.xy * float2(UnityPerMaterial._EdgeFoamDistortion);
    u_xlat19.xy = fma((-input.TEXCOORD0.xz), float2(UnityPerMaterial._EdgeFoamTiling), u_xlat19.xy);
    u_xlat16_19.xy = _FoamTex.sample(sampler_FoamTex, u_xlat19.xy).yz;
    u_xlat16_16 = dot(u_xlat16_3.xy, u_xlat16_19.xy);
    u_xlat16 = float(u_xlat16_16) * UnityPerMaterial._EdgeFoamOpacity;
    u_xlat0.x = max(u_xlat0.x, u_xlat16);
    u_xlat16 = dot(UnityPerMaterial._SpecularDir.xyz, UnityPerMaterial._SpecularDir.xyz);
    u_xlat16 = max(u_xlat16, 0.00100000005);
    u_xlat16 = rsqrt(u_xlat16);
    u_xlat3.xyz = float3(u_xlat16) * UnityPerMaterial._SpecularDir.xyz;
    u_xlat4.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat16 = dot(u_xlat4.xyz, u_xlat4.xyz);
    u_xlat16 = max(u_xlat16, 0.00100000005);
    u_xlat16 = rsqrt(u_xlat16);
    u_xlat5.xyz = float3(u_xlat16) * u_xlat4.xyz;
    u_xlat16_9.xyz = half3(fma(u_xlat4.xyz, float3(u_xlat16), float3(FGlobals.gLightBuffer[13].xxx)));
    u_xlat4.xyz = fma(u_xlat5.yyy, float3(0.0, 2.0, 0.0), (-u_xlat5.xyz));
    u_xlat16 = dot(u_xlat4.xyz, u_xlat3.xyz);
    u_xlat16 = clamp(u_xlat16, 0.0f, 1.0f);
    u_xlat16 = log2(u_xlat16);
    u_xlat3.xyz = float3(u_xlat16) * UnityPerMaterial._SpecularPower.xyz;
    u_xlat3.xyz = exp2(u_xlat3.xyz);
    u_xlat16_4.xyz = _SpecTex.sample(sampler_SpecTex, input.TEXCOORD11.xy).xyz;
    u_xlat16_6.xyz = _SpecTex.sample(sampler_SpecTex, input.TEXCOORD11.zw).xyz;
    u_xlat16_4.xyz = u_xlat16_4.xyz * u_xlat16_6.xyz;
    u_xlat3.xy = u_xlat3.xy * float2(u_xlat16_4.xy);
    u_xlat16 = u_xlat3.y + u_xlat3.x;
    u_xlat16 = fma(float(u_xlat16_4.z), u_xlat3.z, u_xlat16);
    u_xlat16 = u_xlat16 * UnityPerMaterial._SpecularIntensity;
    u_xlat3.xyz = fma(u_xlat0.xxx, UnityPerMaterial._EdgeFoamColor.xyz, float3(u_xlat16));
    u_xlat0.xz = (-u_xlat8.xz) + float2(1.0, 1.0);
    u_xlat0.xy = fma(float2(u_xlat26), u_xlat0.xz, u_xlat8.xz);
    u_xlat16_7.xy = (-half2(UnityPerMaterial._Opacity1, UnityPerMaterial._Opacity2)) + half2(1.0, 1.0);
    u_xlat16_7.xy = fma(u_xlat16_7.xy, half2(0.100000001, 0.100000001), half2(UnityPerMaterial._Opacity1, UnityPerMaterial._Opacity2));
    u_xlat16_7.xzw = u_xlat16_7.xxx * UnityPerMaterial._WaterColor1.xyz;
    u_xlat16_4.xyz = fma(u_xlat16_7.yyy, UnityPerMaterial._WaterColor2.xyz, (-u_xlat16_7.xzw));
    u_xlat0.xzw = fma(u_xlat0.xxx, float3(u_xlat16_4.xyz), float3(u_xlat16_7.xzw));
    u_xlat8.x = min(u_xlat0.y, 1.0);
    u_xlat0.xzw = fma(u_xlat3.xyz, u_xlat8.xxx, u_xlat0.xzw);
    u_xlat16_26 = dot(u_xlat16_9.xyz, u_xlat16_9.xyz);
    u_xlat16_26 = max(u_xlat16_26, half(0.00100000005));
    u_xlat16_26 = rsqrt(u_xlat16_26);
    u_xlat16_3.xyz = u_xlat16_9.xyz * half3(u_xlat16_26);
    u_xlat16_9.xyz = half3(u_xlat2.yyy * float3(input.TEXCOORD4.xyz));
    u_xlat16_9.xyz = half3(fma(float3(input.TEXCOORD3.xyz), u_xlat2.xxx, float3(u_xlat16_9.xyz)));
    u_xlat16_9.xyz = half3(fma(float3(input.TEXCOORD5.xyz), u_xlat2.zzz, float3(u_xlat16_9.xyz)));
    u_xlat16_2.x = dot(u_xlat16_9.xyz, u_xlat16_9.xyz);
    u_xlat16_2.x = max(u_xlat16_2.x, half(0.00100000005));
    u_xlat16_2.x = rsqrt(u_xlat16_2.x);
    u_xlat16_2.xyz = u_xlat16_9.xyz * u_xlat16_2.xxx;
    u_xlat16_9.x = dot(u_xlat16_2.xyz, u_xlat16_3.xyz);
    u_xlat16_9.x = max(u_xlat16_9.x, half(0.0));
    u_xlat16_26 = fma((-u_xlat16_9.x), u_xlat16_9.x, half(1.0));
    u_xlat16_3.x = u_xlat16_9.x * half(0.0143999998);
    u_xlat16_26 = fma(u_xlat16_3.x, u_xlat16_3.x, u_xlat16_26);
    u_xlat16_26 = half(0.0143999998) / u_xlat16_26;
    u_xlat16_26 = u_xlat16_26 * u_xlat16_26;
    u_xlat16_26 = min(u_xlat16_26, half(128.0));
    u_xlat16_9.x = dot(float3(u_xlat16_2.xyz), u_xlat5.xyz);
    u_xlat16_17 = u_xlat16_9.x * half(-9.27999973);
    u_xlatb3 = u_xlat16_9.x>=half(0.0);
    u_xlat16_9.x = exp2(u_xlat16_17);
    u_xlat16_9.x = min(u_xlat16_9.x, half(0.774399996));
    u_xlat16_9.x = fma(u_xlat16_9.x, half(0.879999995), half(0.0392000005));
    u_xlat16_9.xy = fma(u_xlat16_9.xx, half2(-1.03999996, 1.03999996), half2(0.971359968, -0.0373599976));
    u_xlat16_7.xy = half2(float2(UnityPerMaterial._SpecularLevel) * float2(4.0, 0.0799999982));
    u_xlat16_7.x = u_xlat16_7.x;
    u_xlat16_7.x = clamp(u_xlat16_7.x, 0.0h, 1.0h);
    u_xlat16_17 = u_xlat16_9.y * u_xlat16_7.x;
    u_xlat16_9.x = fma(u_xlat16_7.y, u_xlat16_9.x, u_xlat16_17);
    u_xlat16_26 = u_xlat16_26 * u_xlat16_9.x;
    u_xlat26 = float(u_xlat16_26) * 0.280000001;
    u_xlat26 = u_xlatb3 ? u_xlat26 : float(0.0);
    u_xlat3.xyz = u_xlat0.xzw + float3(u_xlat26);
    u_xlat0.xzw = u_xlat0.xzw * input.TEXCOORD8.xyz;
    u_xlat16_26 = dot(u_xlat16_2.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_26 = max(u_xlat16_26, half(0.0));
    u_xlat3.xyz = float3(u_xlat16_26) * u_xlat3.xyz;
    u_xlat16_4.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat3.xyz = u_xlat3.xyz * float3(u_xlat16_4.xyz);
    u_xlat4.xyz = fma(u_xlat3.xyz, float3(u_xlat16_1.xxx), (-u_xlat3.xyz));
    u_xlat3.xyz = fma(FGlobals.gShadowParams0[5].zzz, u_xlat4.xyz, u_xlat3.xyz);
    u_xlat16_1.x = dot((-u_xlat5.xyz), float3(u_xlat16_2.xyz));
    u_xlat16_1.x = u_xlat16_1.x + u_xlat16_1.x;
    u_xlat16_1.xzw = half3(fma(float3(u_xlat16_2.xyz), (-float3(u_xlat16_1.xxx)), (-u_xlat5.xyz)));
    u_xlat16_2.x = dot(u_xlat16_1.xzw, u_xlat16_1.xzw);
    u_xlat16_2.x = max(u_xlat16_2.x, half(0.00100000005));
    u_xlat16_2.x = rsqrt(u_xlat16_2.x);
    u_xlat16_2.xyz = u_xlat16_1.xzw * u_xlat16_2.xxx;
    u_xlat16_1.x = fma(u_xlat16_2.y, half(8.0), half(8.0));
    u_xlat16_1.x = sqrt(u_xlat16_1.x);
    u_xlat16_1.xz = u_xlat16_2.xz / u_xlat16_1.xx;
    u_xlat16_1.xz = u_xlat16_1.xz + half2(0.5, 0.5);
    u_xlat16_2.xyz = _2DSpecCube0.sample(sampler_2DSpecCube0, float2(u_xlat16_1.xz), level(1.16351998)).xyz;
    u_xlat16_1.xzw = u_xlat16_2.xyz * half3(FGlobals._SpecCubePower);
    u_xlat16_1.xyz = u_xlat16_9.xxx * u_xlat16_1.xzw;
    u_xlat16_25 = dot(float3(0.212500006, 0.715399981, 0.0720999986), input.TEXCOORD8.xyz);
    u_xlat16_25 = u_xlat16_25 * FGlobals.gLightBuffer[10].w;
    u_xlat16_25 = clamp(u_xlat16_25, 0.0h, 1.0h);
    u_xlat16_1.xyz = half3(u_xlat16_25) * u_xlat16_1.xyz;
    u_xlat16_1.xyz = u_xlat16_1.xyz * FGlobals.gLightBuffer[10].xyz;
    u_xlat16_1.xyz = half3(fma(u_xlat0.xzw, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_1.xyz)));
    u_xlat0.xzw = u_xlat3.xyz + float3(u_xlat16_1.xyz);
    output.SV_TARGET0.xyz = half3(fma(u_xlat0.xzw, float3(input.TEXCOORD7.www), float3(input.TEXCOORD7.xyz)));
    u_xlat0.x = float(input.TEXCOORD2.w) * UnityPerMaterial._VertexAlphaIntensity;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat0.x = u_xlat0.x * u_xlat8.x;
    output.SV_TARGET0.w = half(u_xlat0.x);
    return output;
}
