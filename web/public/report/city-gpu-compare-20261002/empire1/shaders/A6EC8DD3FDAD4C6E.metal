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
    float4 _Time ;
    half4 gLightBuffer [115];
    half gWaterLevelParam ;
    float _AlphaBlend ;
    half _ExposureValue ;
    float4 _MainTex_ST ;
    float _MainTex_Wrap ;
    float _AlphaTex_Wrap ;
    float4 _TintColor ;
    float _FinalAlpha ;
    float _MainTexOffsetX ;
    float _MainTexOffsetY ;
    float _MainTexRotator ;
    float4 _TwistTex_ST ;
    float _TwistOffsetX ;
    float _TwistOffsetY ;
    float _TwistRotator ;
    float _TwistIntensity ;
    float4 _AlphaMask_ST ;
    float _AlphaMaskRotator ;
    float _AlphaMaskIntensity ;
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
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_TwistTex [[ sampler (1) ]],
    sampler sampler_AlphaMask [[ sampler (2) ]],
    texture2d<half, access::sample > _TwistTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _MainTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _AlphaMask [[ texture(2) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    half2 u_xlat16_0;
    float2 u_xlat1;
    half4 u_xlat16_1;
    bool2 u_xlatb1;
    float4 u_xlat2;
    bool4 u_xlatb2;
    float4 u_xlat3;
    bool4 u_xlatb3;
    half3 u_xlat16_4;
    half3 u_xlat16_5;
    float3 u_xlat6;
    float2 u_xlat12;
    float2 u_xlat13;
    half u_xlat16_22;
    u_xlat0.xy = FGlobals._Time.yy * float2(FGlobals._TwistOffsetX, FGlobals._TwistOffsetY);
    u_xlat0.xy = fract(u_xlat0.xy);
    u_xlat12.x = FGlobals._TwistRotator * 3.14159274;
    u_xlat1.x = sin(u_xlat12.x);
    u_xlat2.x = cos(u_xlat12.x);
    u_xlat3.x = (-u_xlat1.x);
    u_xlat3.y = u_xlat2.x;
    u_xlat3.z = u_xlat1.x;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat12.xy = u_xlat1.xy + float2(-0.5, -0.5);
    u_xlat1.x = dot(u_xlat12.yx, u_xlat3.xy);
    u_xlat1.y = dot(u_xlat12.yx, u_xlat3.yz);
    u_xlat1.xy = u_xlat1.xy + float2(0.5, 0.5);
    u_xlat1.xy = fma(u_xlat1.xy, FGlobals._TwistTex_ST.xy, FGlobals._TwistTex_ST.zw);
    u_xlat0.xy = u_xlat0.xy + u_xlat1.xy;
    u_xlat16_0.xy = _TwistTex.sample(sampler_TwistTex, u_xlat0.xy).xy;
    u_xlat16_4.xy = fma(u_xlat16_0.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat0.x = FGlobals._MainTexRotator * 3.14159274;
    u_xlat1.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat2.x = (-u_xlat0.x);
    u_xlat2.y = u_xlat1.x;
    u_xlat2.z = u_xlat0.x;
    u_xlat0.y = dot(u_xlat12.yx, u_xlat2.yz);
    u_xlat0.x = dot(u_xlat12.yx, u_xlat2.xy);
    u_xlat0.xy = u_xlat0.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._MainTex_ST.xy, FGlobals._MainTex_ST.zw);
    u_xlat1.xy = FGlobals._Time.yy * float2(FGlobals._MainTexOffsetX, FGlobals._MainTexOffsetY);
    u_xlat1.xy = fract(u_xlat1.xy);
    u_xlat0.xy = u_xlat0.xy + u_xlat1.xy;
    u_xlat0.xy = fma(float2(u_xlat16_4.xy), float2(FGlobals._TwistIntensity), u_xlat0.xy);
    u_xlat1.xy = u_xlat0.xy;
    u_xlat1.xy = clamp(u_xlat1.xy, 0.0f, 1.0f);
    u_xlat13.xy = fract(u_xlat0.xy);
    u_xlatb2 = (float4(FGlobals._MainTex_Wrap, FGlobals._MainTex_Wrap, FGlobals._AlphaTex_Wrap, FGlobals._AlphaTex_Wrap)>=float4(0.5, 1.5, 0.5, 1.5));
    u_xlat2 = select(float4(0.0, 0.0, 0.0, 0.0), float4(1.0, 1.0, 1.0, 1.0), bool4(u_xlatb2));
    u_xlatb3 = (float4(0.5, 1.5, 2.5, 0.5)>=float4(FGlobals._MainTex_Wrap, FGlobals._MainTex_Wrap, FGlobals._MainTex_Wrap, FGlobals._AlphaTex_Wrap));
    u_xlat3 = select(float4(0.0, 0.0, 0.0, 0.0), float4(1.0, 1.0, 1.0, 1.0), bool4(u_xlatb3));
    u_xlat2.xy = u_xlat2.xy * u_xlat3.yz;
    u_xlat13.xy = u_xlat13.xy * u_xlat2.xx;
    u_xlat0.xy = fma(u_xlat3.xx, u_xlat0.xy, u_xlat13.xy);
    u_xlat0.xy = fma(u_xlat2.yy, u_xlat1.xy, u_xlat0.xy);
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, u_xlat0.xy);
    u_xlat16_4.xyz = log2(u_xlat16_1.xyz);
    u_xlat16_4.xyz = u_xlat16_4.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_4.xyz = exp2(u_xlat16_4.xyz);
    u_xlat0.x = FGlobals._AlphaMaskRotator * 3.14159274;
    u_xlat1.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat3.x = (-u_xlat0.x);
    u_xlat3.y = u_xlat1.x;
    u_xlat3.z = u_xlat0.x;
    u_xlat0.y = dot(u_xlat12.yx, u_xlat3.yz);
    u_xlat0.x = dot(u_xlat12.yx, u_xlat3.xy);
    u_xlat0.xy = u_xlat0.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._AlphaMask_ST.xy, FGlobals._AlphaMask_ST.zw);
    u_xlat12.xy = fract(u_xlat0.xy);
    u_xlatb1.xy = (float2(1.5, 2.5)>=float2(FGlobals._AlphaTex_Wrap));
    u_xlat1.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb1.xy));
    u_xlat1.xy = u_xlat2.zw * u_xlat1.xy;
    u_xlat12.xy = u_xlat12.xy * u_xlat1.xx;
    u_xlat12.xy = fma(u_xlat3.ww, u_xlat0.xy, u_xlat12.xy);
    u_xlat0.xy = u_xlat0.xy;
    u_xlat0.xy = clamp(u_xlat0.xy, 0.0f, 1.0f);
    u_xlat0.xy = fma(u_xlat1.yy, u_xlat0.xy, u_xlat12.xy);
    u_xlat16_0.x = _AlphaMask.sample(sampler_AlphaMask, u_xlat0.xy).x;
    u_xlat0.yzw = float3(u_xlat16_0.xxx) * float3(u_xlat16_4.xyz);
    u_xlat0.x = float(u_xlat16_0.x) * float(u_xlat16_1.w);
    u_xlat0 = u_xlat0 * float4(FGlobals._AlphaMaskIntensity);
    u_xlat0 = clamp(u_xlat0, 0.0f, 1.0f);
    u_xlat6.xyz = u_xlat0.yzw * float3(input.TEXCOORD2.xyz);
    u_xlat6.xyz = u_xlat0.xxx * u_xlat6.xyz;
    u_xlat0.x = u_xlat0.x * FGlobals._TintColor.w;
    u_xlat6.xyz = u_xlat6.xyz * FGlobals._TintColor.xyz;
    u_xlat0.yzw = u_xlat6.xyz * FGlobals._TintColor.www;
    u_xlat0 = u_xlat0 * float4(input.TEXCOORD2.wwww);
    u_xlat1.xy = float2(FGlobals._FinalAlpha) * float2(FGlobals._adjustToggle, FGlobals._GLOBAL_SKILL_ALPHA);
    u_xlat13.x = (-FGlobals._adjustToggle) + 1.0;
    u_xlat1.x = fma(u_xlat1.y, u_xlat13.x, u_xlat1.x);
    u_xlat0 = u_xlat0 * u_xlat1.xxxx;
    u_xlat0.x = u_xlat0.x * FGlobals._AlphaBlend;
    u_xlat1.x = input.TEXCOORD0.y + (-float(FGlobals._WaterLevel));
    u_xlat1.x = u_xlat1.x + (-float(FGlobals.gWaterLevelParam));
    u_xlat1.x = u_xlat1.x / float(FGlobals._WL_EdgeWidth);
    u_xlat1.x = clamp(u_xlat1.x, 0.0f, 1.0f);
    u_xlat16_4.xyz = half3(u_xlat0.yzw * u_xlat1.xxx);
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
