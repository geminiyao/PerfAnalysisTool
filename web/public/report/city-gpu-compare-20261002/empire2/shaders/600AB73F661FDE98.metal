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
    float4 gShadowParams0 [7];
    float gPlanarShadowEnabled ;
    float4 gPlanarShadowParams ;
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

struct UnityPerMaterial_Type
{
    half4 _WaterColor1 ;
    half4 _WaterColor2 ;
    half4 _WaterColorLOD ;
    float _ColorRange ;
    float _SpecularLevel ;
    float _Opacity ;
    float _AlphaClip ;
    float _AlphaIntensity ;
    float _WPO_MasterSpeed ;
    float4 _WPO_WaveSpeed ;
    float4 _WPO_WaveScale ;
    float4 _WPO_WaveIntensity ;
    float _SpecularTiling ;
    float _SpecularIntensity ;
    float4 _SpecularPower ;
    float4 _SpecularDir ;
    float t5_intensity ;
    float4 t5_uv1 ;
    float4 t5_uv2 ;
    float4 t5_control ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
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
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(2) ]],
    sampler samplert5 [[ sampler (0) ]],
    sampler sampler_SpecTex [[ sampler (1) ]],
    sampler sampler_2DSpecCube0 [[ sampler (2) ]],
    texture2d<half, access::sample > t5 [[ texture(0) ]] ,
    texture2d<half, access::sample > _SpecTex [[ texture(1) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(2) ]] ,
    texture2d<half, access::sample > _2DSpecCube0 [[ texture(3) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_point_clamp_compare_sampler(compare_func::greater_equal,filter::nearest,address::clamp_to_edge);
    float3 u_xlat0;
    float3 u_xlat1;
    half3 u_xlat16_1;
    float u_xlat2;
    half3 u_xlat16_2;
    float3 u_xlat3;
    half3 u_xlat16_3;
    float3 u_xlat4;
    half3 u_xlat16_4;
    float3 u_xlat5;
    bool2 u_xlatb5;
    half3 u_xlat16_6;
    half3 u_xlat16_7;
    float3 u_xlat8;
    half3 u_xlat16_9;
    float3 u_xlat10;
    half3 u_xlat16_10;
    bool u_xlatb10;
    half u_xlat16_12;
    half2 u_xlat16_19;
    float u_xlat20;
    float2 u_xlat21;
    half2 u_xlat16_22;
    bool2 u_xlatb25;
    float u_xlat31;
    half u_xlat16_31;
    half u_xlat10_31;
    bool u_xlatb31;
    half u_xlat16_32;
    half u_xlat16_33;
    bool u_xlatb33;
    float u_xlat34;
    half u_xlat16_34;
    bool u_xlatb34;
    u_xlat0.x = fma(UnityPerCamera._ZBufferParams.z, input.SV_Target1, UnityPerCamera._ZBufferParams.w);
    u_xlat0.x = float(1.0) / u_xlat0.x;
    u_xlat0.x = u_xlat0.x + (-input.TEXCOORD9.w);
    u_xlat0.x = u_xlat0.x / UnityPerMaterial._ColorRange;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat10.xy = (-input.TEXCOORD0.zx) / UnityPerMaterial.t5_uv1.zz;
    u_xlat1.x = UnityPerCamera._Time.y;
    u_xlat1.y = 0.0;
    u_xlat10.xy = fma(UnityPerMaterial.t5_uv1.xy, u_xlat1.xy, u_xlat10.xy);
    u_xlat21.xy = (-input.TEXCOORD0.zx) / UnityPerMaterial.t5_uv2.zz;
    u_xlat1.xy = fma(UnityPerMaterial.t5_uv2.xy, u_xlat1.xy, u_xlat21.xy);
    u_xlat16_10.xyz = t5.sample(samplert5, u_xlat10.xy).xyz;
    u_xlat16_2.xyz = fma(u_xlat16_10.xyz, half3(2.0, 2.0, 2.0), half3(-1.0, -1.0, -1.0));
    u_xlat16_10.xyz = t5.sample(samplert5, u_xlat1.xy).xyz;
    u_xlat16_2.xyz = fma(u_xlat16_10.xyz, half3(2.0, 2.0, 2.0), u_xlat16_2.xyz);
    u_xlat16_10.xyz = u_xlat16_2.xyz + half3(-1.0, -1.0, -2.0);
    u_xlat10.xyz = fma(float3(UnityPerMaterial.t5_intensity), float3(u_xlat16_10.xyz), float3(0.0, 0.0, 1.0));
    u_xlat16_1.xyz = fma(UnityPerMaterial._WaterColor2.xyz, half3(0.100000001, 0.100000001, 0.100000001), (-UnityPerMaterial._WaterColor1.xyz));
    u_xlat1.xyz = fma(u_xlat0.xxx, float3(u_xlat16_1.xyz), float3(UnityPerMaterial._WaterColor1.xyz));
    u_xlat3.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat0.x = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat0.x = max(u_xlat0.x, 0.00100000005);
    u_xlat0.x = rsqrt(u_xlat0.x);
    u_xlat4.xyz = u_xlat0.xxx * u_xlat3.xyz;
    u_xlat31 = dot(UnityPerMaterial._SpecularDir.xyz, UnityPerMaterial._SpecularDir.xyz);
    u_xlat31 = max(u_xlat31, 0.00100000005);
    u_xlat31 = rsqrt(u_xlat31);
    u_xlat5.xyz = float3(u_xlat31) * UnityPerMaterial._SpecularDir.xyz;
    u_xlat16_6.xyz = _SpecTex.sample(sampler_SpecTex, input.TEXCOORD11.xy).xyz;
    u_xlat16_7.xyz = _SpecTex.sample(sampler_SpecTex, input.TEXCOORD11.zw).xyz;
    u_xlat8.xyz = fma(u_xlat4.yyy, float3(0.0, 2.0, 0.0), (-u_xlat4.xyz));
    u_xlat31 = dot(u_xlat8.xyz, u_xlat5.xyz);
    u_xlat31 = clamp(u_xlat31, 0.0f, 1.0f);
    u_xlat31 = log2(u_xlat31);
    u_xlat5.xyz = float3(u_xlat31) * UnityPerMaterial._SpecularPower.xyz;
    u_xlat5.xyz = exp2(u_xlat5.xyz);
    u_xlat16_6.xyz = u_xlat16_6.xyz * u_xlat16_7.xyz;
    u_xlat5.xy = u_xlat5.xy * float2(u_xlat16_6.xy);
    u_xlat31 = u_xlat5.y + u_xlat5.x;
    u_xlat31 = fma(float(u_xlat16_6.z), u_xlat5.z, u_xlat31);
    u_xlat31 = u_xlat31 * UnityPerMaterial._SpecularIntensity;
    u_xlat1.xyz = fma(float3(u_xlat31), float3(UnityPerMaterial._Opacity), u_xlat1.xyz);
    u_xlat16_2.xyz = half3(u_xlat10.yyy * float3(input.TEXCOORD4.xyz));
    u_xlat16_2.xyz = half3(fma(float3(input.TEXCOORD3.xyz), u_xlat10.xxx, float3(u_xlat16_2.xyz)));
    u_xlat16_2.xyz = half3(fma(float3(input.TEXCOORD5.xyz), u_xlat10.zzz, float3(u_xlat16_2.xyz)));
    u_xlat16_10.x = dot(u_xlat16_2.xyz, u_xlat16_2.xyz);
    u_xlat16_10.x = max(u_xlat16_10.x, half(0.00100000005));
    u_xlat16_10.x = rsqrt(u_xlat16_10.x);
    u_xlat16_10.xyz = u_xlat16_10.xxx * u_xlat16_2.xyz;
    u_xlatb31 = 0.5<FGlobals.gPlanarShadowEnabled;
    if(u_xlatb31){
        u_xlatb31 = 0.0>=FGlobals.gShadowParams0[5].z;
        if(u_xlatb31){
            u_xlat16_2.x = half(1.0);
        }
        if(!u_xlatb31){
            u_xlat5.xy = input.TEXCOORD14.xy / input.TEXCOORD14.ww;
            u_xlat31 = input.TEXCOORD0.y + 100.0;
            u_xlat31 = u_xlat31 / FGlobals.gPlanarShadowParams.y;
            u_xlat31 = u_xlat31 + FGlobals.gShadowParams0[4].z;
            u_xlat10_31 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat5.xy, saturate(u_xlat31), level(0.0)));
            u_xlat16_31 = half(float(u_xlat10_31));
            u_xlatb25.xy = (u_xlat5.xy<float2(0.0, 0.0));
            u_xlatb33 = u_xlatb25.y || u_xlatb25.x;
            u_xlatb5.xy = (float2(1.0, 1.0)<u_xlat5.xy);
            u_xlatb34 = u_xlatb5.y || u_xlatb5.x;
            u_xlatb33 = u_xlatb33 || u_xlatb34;
            u_xlatb34 = input.TEXCOORD0.y<-100.0;
            u_xlatb33 = u_xlatb33 || u_xlatb34;
            u_xlat16_34 = u_xlat16_31 + half(-1.0);
            u_xlat34 = fma(FGlobals.gShadowParams0[5].z, float(u_xlat16_34), 1.0);
            u_xlat2 = (u_xlatb33) ? 1.0 : u_xlat34;
            u_xlat16_2.x = half(u_xlat2);
        }
    } else {
        u_xlat16_2.x = half(1.0);
    }
    u_xlat16_12 = dot(float3(u_xlat16_10.xyz), u_xlat4.xyz);
    u_xlat16_22.x = u_xlat16_12 * half(-9.27999973);
    u_xlat16_22.x = exp2(u_xlat16_22.x);
    u_xlat16_22.x = min(u_xlat16_22.x, half(0.774399996));
    u_xlat16_22.x = fma(u_xlat16_22.x, half(0.879999995), half(0.0392000005));
    u_xlat16_22.xy = fma(u_xlat16_22.xx, half2(-1.03999996, 1.03999996), half2(0.971359968, -0.0373599976));
    u_xlat16_9.xy = half2(float2(UnityPerMaterial._SpecularLevel) * float2(4.0, 0.0799999982));
    u_xlat16_9.x = u_xlat16_9.x;
    u_xlat16_9.x = clamp(u_xlat16_9.x, 0.0h, 1.0h);
    u_xlat16_32 = u_xlat16_22.y * u_xlat16_9.x;
    u_xlat16_22.x = fma(u_xlat16_9.y, u_xlat16_22.x, u_xlat16_32);
    u_xlat16_32 = dot(float3(0.212500006, 0.715399981, 0.0720999986), input.TEXCOORD8.xyz);
    u_xlat16_32 = u_xlat16_32 * FGlobals.gLightBuffer[10].w;
    u_xlat16_32 = clamp(u_xlat16_32, 0.0h, 1.0h);
    u_xlat5.xyz = u_xlat1.xyz * input.TEXCOORD8.xyz;
    u_xlat16_9.x = dot((-u_xlat4.xyz), float3(u_xlat16_10.xyz));
    u_xlat16_9.x = u_xlat16_9.x + u_xlat16_9.x;
    u_xlat16_9.xyz = half3(fma(float3(u_xlat16_10.xyz), (-float3(u_xlat16_9.xxx)), (-u_xlat4.xyz)));
    u_xlat16_33 = dot(u_xlat16_9.xyz, u_xlat16_9.xyz);
    u_xlat16_33 = max(u_xlat16_33, half(0.00100000005));
    u_xlat16_33 = rsqrt(u_xlat16_33);
    u_xlat16_4.xyz = half3(u_xlat16_33) * u_xlat16_9.xyz;
    u_xlatb33 = half(0.0)<FGlobals._SpecCubeLodSteps;
    u_xlat34 = float(FGlobals._SpecCubeLodSteps) * 0.193920001;
    u_xlat16_9.x = (u_xlatb33) ? half(u_xlat34) : half(1.16351998);
    u_xlat16_19.x = fma(u_xlat16_4.y, half(8.0), half(8.0));
    u_xlat16_19.x = sqrt(u_xlat16_19.x);
    u_xlat16_19.xy = u_xlat16_4.xz / u_xlat16_19.xx;
    u_xlat16_19.xy = u_xlat16_19.xy + half2(0.5, 0.5);
    u_xlat16_4.xyz = _2DSpecCube0.sample(sampler_2DSpecCube0, float2(u_xlat16_19.xy), level(float(u_xlat16_9.x))).xyz;
    u_xlat16_9.xyz = u_xlat16_4.xyz * half3(FGlobals._SpecCubePower);
    u_xlat16_9.xyz = u_xlat16_22.xxx * u_xlat16_9.xyz;
    u_xlat16_9.xyz = half3(u_xlat16_32) * u_xlat16_9.xyz;
    u_xlat16_9.xyz = u_xlat16_9.xyz * FGlobals.gLightBuffer[10].xyz;
    u_xlat16_9.xyz = half3(fma(u_xlat5.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_9.xyz)));
    u_xlat16_4.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat3.xyz = fma(u_xlat3.xyz, u_xlat0.xxx, float3(FGlobals.gLightBuffer[13].xyz));
    u_xlat0.x = dot(u_xlat3.xyz, u_xlat3.xyz);
    u_xlat0.x = max(u_xlat0.x, 0.00100000005);
    u_xlat0.x = rsqrt(u_xlat0.x);
    u_xlat3.xyz = u_xlat0.xxx * u_xlat3.xyz;
    u_xlat16_32 = dot(u_xlat16_10.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_32 = max(u_xlat16_32, half(0.0));
    u_xlat0.x = dot(float3(u_xlat16_10.xyz), u_xlat3.xyz);
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlatb10 = u_xlat16_12>=half(0.0);
    u_xlat16_3.xyz = half3(u_xlat16_32) * u_xlat16_4.xyz;
    u_xlat20 = fma((-u_xlat0.x), u_xlat0.x, 1.0);
    u_xlat0.x = u_xlat0.x * 0.0143999998;
    u_xlat0.x = fma(u_xlat0.x, u_xlat0.x, u_xlat20);
    u_xlat0.x = 0.0143999998 / u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = min(u_xlat0.x, 128.0);
    u_xlat0.x = u_xlat0.x * float(u_xlat16_22.x);
    u_xlat0.x = u_xlat0.x * 0.280000001;
    u_xlat0.x = u_xlatb10 ? u_xlat0.x : float(0.0);
    u_xlat0.xyz = u_xlat0.xxx + u_xlat1.xyz;
    u_xlat0.xyz = u_xlat0.xyz * float3(u_xlat16_3.xyz);
    output.SV_TARGET0.xyz = half3(fma(u_xlat0.xyz, float3(u_xlat16_2.xxx), float3(u_xlat16_9.xyz)));
    output.SV_TARGET0.w = half(UnityPerMaterial._Opacity);
    return output;
}
