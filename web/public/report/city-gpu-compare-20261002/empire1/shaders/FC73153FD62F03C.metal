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
    float _AlphaTex_Wrap ;
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
    float4 _TwistTex_ST ;
    float _TwistOffsetX ;
    float _TwistOffsetY ;
    float _TwistRotator ;
    float _TwistIntensity ;
    float4 _AlphaMask_ST ;
    float _AlphaMaskRotator ;
    float _AlphaMaskIntensity ;
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
    sampler sampler_TwistTex [[ sampler (2) ]],
    sampler sampler_AlphaMask [[ sampler (3) ]],
    texture2d<half, access::sample > _TwistTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _MainTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _AlphaMask [[ texture(2) ]] ,
    texture2d<half, access::sample > _FXTex [[ texture(3) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    half2 u_xlat16_0;
    float4 u_xlat1;
    half4 u_xlat16_1;
    float4 u_xlat2;
    bool2 u_xlatb2;
    float4 u_xlat3;
    bool4 u_xlatb3;
    float4 u_xlat4;
    bool4 u_xlatb4;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    float3 u_xlat7;
    float3 u_xlat9;
    float2 u_xlat14;
    float2 u_xlat16;
    half u_xlat16_16;
    float2 u_xlat17;
    float u_xlat23;
    half u_xlat16_26;
    u_xlat0.xy = FGlobals._Time.yy * float2(FGlobals._TwistOffsetX, FGlobals._TwistOffsetY);
    u_xlat0.xy = fract(u_xlat0.xy);
    u_xlat14.x = FGlobals._TwistRotator * 3.14159274;
    u_xlat1.x = sin(u_xlat14.x);
    u_xlat2.x = cos(u_xlat14.x);
    u_xlat3.x = (-u_xlat1.x);
    u_xlat3.y = u_xlat2.x;
    u_xlat3.z = u_xlat1.x;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat14.xy = u_xlat1.xy + float2(-0.5, -0.5);
    u_xlat1.x = dot(u_xlat14.yx, u_xlat3.xy);
    u_xlat1.y = dot(u_xlat14.yx, u_xlat3.yz);
    u_xlat1.xy = u_xlat1.xy + float2(0.5, 0.5);
    u_xlat1.xy = fma(u_xlat1.xy, FGlobals._TwistTex_ST.xy, FGlobals._TwistTex_ST.zw);
    u_xlat0.xy = u_xlat0.xy + u_xlat1.xy;
    u_xlat16_0.xy = _TwistTex.sample(sampler_TwistTex, u_xlat0.xy).xy;
    u_xlat16_1 = fma(u_xlat16_0.xyxy, half4(2.0, 2.0, 2.0, 2.0), half4(-1.0, -1.0, -1.0, -1.0));
    u_xlat0.x = FGlobals._MainTexRotator * 3.14159274;
    u_xlat2.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat3.x = (-u_xlat0.x);
    u_xlat3.y = u_xlat2.x;
    u_xlat3.z = u_xlat0.x;
    u_xlat0.y = dot(u_xlat14.yx, u_xlat3.yz);
    u_xlat0.x = dot(u_xlat14.yx, u_xlat3.xy);
    u_xlat0.xy = u_xlat0.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._MainTex_ST.xy, FGlobals._MainTex_ST.zw);
    u_xlat2.xy = FGlobals._Time.yy * float2(FGlobals._MainTexOffsetX, FGlobals._MainTexOffsetY);
    u_xlat2.xy = fract(u_xlat2.xy);
    u_xlat2.xy = u_xlat0.xy + u_xlat2.xy;
    u_xlat0.x = FGlobals._FXTexRotator * 3.14159274;
    u_xlat3.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat4.x = (-u_xlat0.x);
    u_xlat4.y = u_xlat3.x;
    u_xlat4.z = u_xlat0.x;
    u_xlat17.y = dot(u_xlat14.yx, u_xlat4.yz);
    u_xlat17.x = dot(u_xlat14.yx, u_xlat4.xy);
    u_xlat0.xy = u_xlat17.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._FXTex_ST.xy, FGlobals._FXTex_ST.zw);
    u_xlat3.xy = FGlobals._Time.yy * float2(FGlobals._FXTexOffsetX, FGlobals._FXTexOffsetY);
    u_xlat3.xy = fract(u_xlat3.xy);
    u_xlat2.zw = u_xlat0.xy + u_xlat3.xy;
    u_xlat1 = fma(float4(u_xlat16_1), float4(FGlobals._TwistIntensity), u_xlat2);
    u_xlat0.xy = u_xlat1.xy;
    u_xlat0.xy = clamp(u_xlat0.xy, 0.0f, 1.0f);
    u_xlat2.xy = fract(u_xlat1.xy);
    u_xlatb3 = (float4(FGlobals._MainTex_Wrap, FGlobals._MainTex_Wrap, FGlobals._AlphaTex_Wrap, FGlobals._AlphaTex_Wrap)>=float4(0.5, 1.5, 0.5, 1.5));
    u_xlat3 = select(float4(0.0, 0.0, 0.0, 0.0), float4(1.0, 1.0, 1.0, 1.0), bool4(u_xlatb3));
    u_xlatb4 = (float4(0.5, 1.5, 2.5, 0.5)>=float4(FGlobals._MainTex_Wrap, FGlobals._MainTex_Wrap, FGlobals._MainTex_Wrap, FGlobals._AlphaTex_Wrap));
    u_xlat4 = select(float4(0.0, 0.0, 0.0, 0.0), float4(1.0, 1.0, 1.0, 1.0), bool4(u_xlatb4));
    u_xlat16.xy = u_xlat3.xy * u_xlat4.yz;
    u_xlat2.xy = u_xlat2.xy * u_xlat16.xx;
    u_xlat2.xy = fma(u_xlat4.xx, u_xlat1.xy, u_xlat2.xy);
    u_xlat16_16 = _FXTex.sample(sampler_FXTex, u_xlat1.zw).x;
    u_xlat16_16 = u_xlat16_16 + half(-0.5);
    u_xlat0.xy = fma(u_xlat16.yy, u_xlat0.xy, u_xlat2.xy);
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, u_xlat0.xy);
    u_xlat16_5.xyz = log2(u_xlat16_1.xyz);
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_5.xyz = exp2(u_xlat16_5.xyz);
    u_xlat0.x = FGlobals._AlphaMaskRotator * 3.14159274;
    u_xlat2.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat4.x = (-u_xlat0.x);
    u_xlat4.y = u_xlat2.x;
    u_xlat4.z = u_xlat0.x;
    u_xlat0.y = dot(u_xlat14.yx, u_xlat4.yz);
    u_xlat0.x = dot(u_xlat14.yx, u_xlat4.xy);
    u_xlat0.xy = u_xlat0.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._AlphaMask_ST.xy, FGlobals._AlphaMask_ST.zw);
    u_xlat14.xy = fract(u_xlat0.xy);
    u_xlatb2.xy = (float2(1.5, 2.5)>=float2(FGlobals._AlphaTex_Wrap));
    u_xlat2.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb2.xy));
    u_xlat2.xy = u_xlat3.zw * u_xlat2.xy;
    u_xlat14.xy = u_xlat14.xy * u_xlat2.xx;
    u_xlat14.xy = fma(u_xlat4.ww, u_xlat0.xy, u_xlat14.xy);
    u_xlat0.xy = u_xlat0.xy;
    u_xlat0.xy = clamp(u_xlat0.xy, 0.0f, 1.0f);
    u_xlat0.xy = fma(u_xlat2.yy, u_xlat0.xy, u_xlat14.xy);
    u_xlat16_0.x = _AlphaMask.sample(sampler_AlphaMask, u_xlat0.xy).x;
    u_xlat0.yzw = float3(u_xlat16_0.xxx) * float3(u_xlat16_5.xyz);
    u_xlat0.x = float(u_xlat16_0.x) * float(u_xlat16_1.w);
    u_xlat0 = u_xlat0 * float4(FGlobals._AlphaMaskIntensity);
    u_xlat0 = clamp(u_xlat0, 0.0f, 1.0f);
    u_xlat2.x = (-FGlobals._DissolveStartOffset) + 1.0;
    u_xlat2.x = fma(float(u_xlat16_16), u_xlat2.x, 0.5);
    u_xlat2.x = u_xlat2.x + (-FGlobals._Dissolve);
    u_xlat2.x = u_xlat2.x * FGlobals._EdgeWidth;
    u_xlat2.x = clamp(u_xlat2.x, 0.0f, 1.0f);
    u_xlat9.x = (-u_xlat2.x) + 1.0;
    u_xlat9.xyz = u_xlat9.xxx * FGlobals._FXColor.xyz;
    u_xlat9.xyz = fma(u_xlat9.xyz, float3(FGlobals._FXColorIntensity), u_xlat0.yzw);
    u_xlatb3.x = 0.0<FGlobals._DissolveEdgeColor;
    u_xlat7.xyz = (u_xlatb3.x) ? u_xlat9.xyz : u_xlat0.yzw;
    u_xlat7.xyz = u_xlat2.xxx * u_xlat7.xyz;
    u_xlat7.xyz = u_xlat7.xyz * float3(input.TEXCOORD2.xyz);
    u_xlat9.x = u_xlat0.x * u_xlat2.x;
    u_xlat0.x = fma((-u_xlat0.x), u_xlat2.x, 1.0);
    u_xlat7.xyz = u_xlat7.xyz * u_xlat9.xxx;
    u_xlat2.x = u_xlat9.x * FGlobals._TintColor.w;
    u_xlat2.x = u_xlat2.x * float(input.TEXCOORD2.w);
    u_xlat7.xyz = u_xlat7.xyz * FGlobals._TintColor.xyz;
    u_xlat7.xyz = u_xlat7.xyz * FGlobals._TintColor.www;
    u_xlat7.xyz = u_xlat7.xyz * float3(input.TEXCOORD2.www);
    u_xlat9.xy = float2(FGlobals._FinalAlpha) * float2(FGlobals._adjustToggle, FGlobals._GLOBAL_SKILL_ALPHA);
    u_xlat23 = (-FGlobals._adjustToggle) + 1.0;
    u_xlat9.x = fma(u_xlat9.y, u_xlat23, u_xlat9.x);
    u_xlat7.xyz = u_xlat7.xyz * u_xlat9.xxx;
    u_xlat2.x = u_xlat9.x * u_xlat2.x;
    u_xlat9.x = input.TEXCOORD9.w * FGlobals._SP_DistortIntensity;
    u_xlat0.x = fma(u_xlat9.x, u_xlat0.x, input.TEXCOORD9.w);
    u_xlat9.x = fma(FGlobals._ZBufferParams.z, input.SV_Target1, FGlobals._ZBufferParams.w);
    u_xlat9.x = float(1.0) / u_xlat9.x;
    u_xlat0.x = (-u_xlat0.x) + u_xlat9.x;
    u_xlat0.x = u_xlat0.x / FGlobals._SP_EdgeWidth;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat9.x = (-u_xlat0.x) + 1.0;
    u_xlat16.x = FGlobals._WorldSpaceCameraPos.xyzx.y + (-FGlobals._DisableDepthFade_FromCameraHeight);
    u_xlat16.x = u_xlat16.x / FGlobals._DisableDepthFade_CameraHeightRange;
    u_xlat16.x = clamp(u_xlat16.x, 0.0f, 1.0f);
    u_xlat0.x = fma(u_xlat16.x, u_xlat9.x, u_xlat0.x);
    u_xlat0.x = (-u_xlat0.x) + 1.0;
    u_xlat0.x = u_xlat0.x * FGlobals._SP_EdgeDown;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat0.x = (-u_xlat0.x) + 1.0;
    u_xlat7.xyz = u_xlat0.xxx * u_xlat7.xyz;
    u_xlat0.x = u_xlat0.x * u_xlat2.x;
    u_xlat0.x = u_xlat0.x * FGlobals._AlphaBlend;
    u_xlat2.x = input.TEXCOORD0.y + (-float(FGlobals._WaterLevel));
    u_xlat2.x = u_xlat2.x + (-float(FGlobals.gWaterLevelParam));
    u_xlat2.x = u_xlat2.x / float(FGlobals._WL_EdgeWidth);
    u_xlat2.x = clamp(u_xlat2.x, 0.0f, 1.0f);
    u_xlat16_5.xyz = half3(u_xlat7.xyz * u_xlat2.xxx);
    output.SV_Target0.w = half(u_xlat0.x * u_xlat2.x);
    u_xlat16_5.xyz = u_xlat16_5.xyz / half3(FGlobals._ExposureValue);
    u_xlat16_6.xyz = FGlobals.gLightBuffer[11].yyy * FGlobals.gLightBuffer[12].xyz;
    u_xlat16_6.xyz = u_xlat16_6.xyz * half3(0.200000003, 0.200000003, 0.200000003);
    u_xlat16_6.xyz = log2(u_xlat16_6.xyz);
    u_xlat16_26 = half(FGlobals._AdaptionBias + 0.100000001);
    u_xlat16_26 = u_xlat16_26 * half(2.20000005);
    u_xlat16_6.xyz = u_xlat16_6.xyz * half3(u_xlat16_26);
    u_xlat16_6.xyz = exp2(u_xlat16_6.xyz);
    output.SV_Target0.xyz = u_xlat16_5.xyz * u_xlat16_6.xyz;
    return output;
}
