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
    float4 _Time ;
    float3 _WorldSpaceCameraPos ;
    float4 _ZBufferParams ;
    half4 gLightBuffer [115];
    half gWaterLevelParam ;
    float4 _FXColor ;
    float _AlphaBlend ;
    float _Dissolve ;
    half _ExposureValue ;
    float4 _MainTex_ST ;
    float _MainTex_Wrap ;
    float4 _TintColor ;
    float _FinalAlpha ;
    float _MainTexOffsetX ;
    float _MainTexOffsetY ;
    float _MainTexRotator ;
    float4 _FXTex_ST ;
    float _FXTexOffsetX ;
    float _FXTexOffsetY ;
    float _FXTexRotator ;
    float _FXColorIntensity ;
    float _EdgeWidth ;
    float _DissolveStartOffset ;
    float _DissolveEdgeColor ;
    float _SP_EdgeWidth ;
    float _SP_EdgeDown ;
    float _SP_DistortIntensity ;
    float _DisableDepthFade_FromCameraHeight ;
    float _DisableDepthFade_CameraHeightRange ;
    half _WaterLevel ;
    half _WL_EdgeWidth ;
    float _AdaptionBias ;
    float _GLOBAL_SKILL_ALPHA ;
    float _adjustToggle ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    float SV_Target1 [[ color(xlt_remap_i[1]) ]] ;
    float4 TEXCOORD9 [[ user(TEXCOORD9) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_FXTex [[ sampler (1) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _FXTex [[ texture(1) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    half u_xlat16_0;
    float2 u_xlat1;
    half4 u_xlat16_1;
    bool u_xlatb1;
    float3 u_xlat2;
    bool3 u_xlatb2;
    float2 u_xlat3;
    half3 u_xlat16_4;
    half3 u_xlat16_5;
    float3 u_xlat6;
    float2 u_xlat7;
    float2 u_xlat12;
    float2 u_xlat13;
    bool2 u_xlatb13;
    float u_xlat19;
    half u_xlat16_22;
    u_xlat0.x = FGlobals._MainTexRotator * 3.14159274;
    u_xlat1.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat2.x = (-u_xlat0.x);
    u_xlat3.x = input.TEXCOORD0.w;
    u_xlat3.y = input.TEXCOORD1.w;
    u_xlat6.xy = u_xlat3.xy + float2(-0.5, -0.5);
    u_xlat2.y = u_xlat1.x;
    u_xlat2.z = u_xlat0.x;
    u_xlat1.y = dot(u_xlat6.yx, u_xlat2.yz);
    u_xlat1.x = dot(u_xlat6.yx, u_xlat2.xy);
    u_xlat0.xw = u_xlat1.xy + float2(0.5, 0.5);
    u_xlat0.xw = fma(u_xlat0.xw, FGlobals._MainTex_ST.xy, FGlobals._MainTex_ST.zw);
    u_xlat1.xy = FGlobals._Time.yy * float2(FGlobals._MainTexOffsetX, FGlobals._MainTexOffsetY);
    u_xlat1.xy = fract(u_xlat1.xy);
    u_xlat0.xw = u_xlat0.xw + u_xlat1.xy;
    u_xlat1.xy = fract(u_xlat0.xw);
    u_xlatb13.xy = (float2(FGlobals._MainTex_Wrap)>=float2(0.5, 1.5));
    u_xlat13.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb13.xy));
    u_xlatb2.xyz = (float3(0.5, 1.5, 2.5)>=float3(FGlobals._MainTex_Wrap));
    u_xlat2.xyz = select(float3(0.0, 0.0, 0.0), float3(1.0, 1.0, 1.0), bool3(u_xlatb2.xyz));
    u_xlat13.xy = u_xlat13.xy * u_xlat2.yz;
    u_xlat1.xy = u_xlat1.xy * u_xlat13.xx;
    u_xlat1.xy = fma(u_xlat2.xx, u_xlat0.xw, u_xlat1.xy);
    u_xlat0.xw = u_xlat0.xw;
    u_xlat0.xw = clamp(u_xlat0.xw, 0.0f, 1.0f);
    u_xlat0.xw = fma(u_xlat13.yy, u_xlat0.xw, u_xlat1.xy);
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, u_xlat0.xw);
    u_xlat16_4.xyz = log2(u_xlat16_1.xyz);
    u_xlat16_4.xyz = u_xlat16_4.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_4.xyz = exp2(u_xlat16_4.xyz);
    u_xlat0.x = FGlobals._FXTexRotator * 3.14159274;
    u_xlat1.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat2.x = (-u_xlat0.x);
    u_xlat2.y = u_xlat1.x;
    u_xlat2.z = u_xlat0.x;
    u_xlat1.y = dot(u_xlat6.yx, u_xlat2.yz);
    u_xlat1.x = dot(u_xlat6.yx, u_xlat2.xy);
    u_xlat0.xy = u_xlat1.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._FXTex_ST.xy, FGlobals._FXTex_ST.zw);
    u_xlat12.xy = FGlobals._Time.yy * float2(FGlobals._FXTexOffsetX, FGlobals._FXTexOffsetY);
    u_xlat12.xy = fract(u_xlat12.xy);
    u_xlat0.xy = u_xlat12.xy + u_xlat0.xy;
    u_xlat16_0 = _FXTex.sample(sampler_FXTex, u_xlat0.xy).x;
    u_xlat16_0 = u_xlat16_0 + half(-0.5);
    u_xlat6.x = (-FGlobals._DissolveStartOffset) + 1.0;
    u_xlat0.x = fma(float(u_xlat16_0), u_xlat6.x, 0.5);
    u_xlat0.x = u_xlat0.x + (-FGlobals._Dissolve);
    u_xlat0.x = u_xlat0.x * FGlobals._EdgeWidth;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat6.x = (-u_xlat0.x) + 1.0;
    u_xlat6.xyz = u_xlat6.xxx * FGlobals._FXColor.xyz;
    u_xlat6.xyz = fma(u_xlat6.xyz, float3(FGlobals._FXColorIntensity), float3(u_xlat16_4.xyz));
    u_xlatb1 = 0.0<FGlobals._DissolveEdgeColor;
    u_xlat6.xyz = (bool(u_xlatb1)) ? u_xlat6.xyz : float3(u_xlat16_4.xyz);
    u_xlat6.xyz = u_xlat0.xxx * u_xlat6.xyz;
    u_xlat6.xyz = u_xlat6.xyz * float3(input.TEXCOORD2.xyz);
    u_xlat1.x = u_xlat0.x * float(u_xlat16_1.w);
    u_xlat0.x = fma((-float(u_xlat16_1.w)), u_xlat0.x, 1.0);
    u_xlat6.xyz = u_xlat6.xyz * u_xlat1.xxx;
    u_xlat1.x = u_xlat1.x * FGlobals._TintColor.w;
    u_xlat1.x = u_xlat1.x * float(input.TEXCOORD2.w);
    u_xlat6.xyz = u_xlat6.xyz * FGlobals._TintColor.xyz;
    u_xlat6.xyz = u_xlat6.xyz * FGlobals._TintColor.www;
    u_xlat6.xyz = u_xlat6.xyz * float3(input.TEXCOORD2.www);
    u_xlat7.xy = float2(FGlobals._FinalAlpha) * float2(FGlobals._adjustToggle, FGlobals._GLOBAL_SKILL_ALPHA);
    u_xlat19 = (-FGlobals._adjustToggle) + 1.0;
    u_xlat7.x = fma(u_xlat7.y, u_xlat19, u_xlat7.x);
    u_xlat6.xyz = u_xlat6.xyz * u_xlat7.xxx;
    u_xlat1.x = u_xlat7.x * u_xlat1.x;
    u_xlat7.x = input.TEXCOORD9.w * FGlobals._SP_DistortIntensity;
    u_xlat0.x = fma(u_xlat7.x, u_xlat0.x, input.TEXCOORD9.w);
    u_xlat7.x = fma(FGlobals._ZBufferParams.z, input.SV_Target1, FGlobals._ZBufferParams.w);
    u_xlat7.x = float(1.0) / u_xlat7.x;
    u_xlat0.x = (-u_xlat0.x) + u_xlat7.x;
    u_xlat0.x = u_xlat0.x / FGlobals._SP_EdgeWidth;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat7.x = (-u_xlat0.x) + 1.0;
    u_xlat13.x = FGlobals._WorldSpaceCameraPos.xyzx.y + (-FGlobals._DisableDepthFade_FromCameraHeight);
    u_xlat13.x = u_xlat13.x / FGlobals._DisableDepthFade_CameraHeightRange;
    u_xlat13.x = clamp(u_xlat13.x, 0.0f, 1.0f);
    u_xlat0.x = fma(u_xlat13.x, u_xlat7.x, u_xlat0.x);
    u_xlat0.x = (-u_xlat0.x) + 1.0;
    u_xlat0.x = u_xlat0.x * FGlobals._SP_EdgeDown;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat0.x = (-u_xlat0.x) + 1.0;
    u_xlat6.xyz = u_xlat0.xxx * u_xlat6.xyz;
    u_xlat0.x = u_xlat0.x * u_xlat1.x;
    u_xlat0.x = u_xlat0.x * FGlobals._AlphaBlend;
    u_xlat1.x = input.TEXCOORD0.y + (-float(FGlobals._WaterLevel));
    u_xlat1.x = u_xlat1.x + (-float(FGlobals.gWaterLevelParam));
    u_xlat1.x = u_xlat1.x / float(FGlobals._WL_EdgeWidth);
    u_xlat1.x = clamp(u_xlat1.x, 0.0f, 1.0f);
    u_xlat16_4.xyz = half3(u_xlat6.xyz * u_xlat1.xxx);
    output.SV_Target0.w = half(u_xlat0.x * u_xlat1.x);
    u_xlat16_4.xyz = u_xlat16_4.xyz / half3(FGlobals._ExposureValue);
    u_xlat16_5.xyz = FGlobals.gLightBuffer[11].yyy * FGlobals.gLightBuffer[12].xyz;
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(0.200000003, 0.200000003, 0.200000003);
    u_xlat16_5.xyz = log2(u_xlat16_5.xyz);
    u_xlat16_22 = half(FGlobals._AdaptionBias + 0.100000001);
    u_xlat16_22 = u_xlat16_22 * half(2.20000005);
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(u_xlat16_22);
    u_xlat16_5.xyz = exp2(u_xlat16_5.xyz);
    output.SV_Target0.xyz = u_xlat16_4.xyz * u_xlat16_5.xyz;
    return output;
}
