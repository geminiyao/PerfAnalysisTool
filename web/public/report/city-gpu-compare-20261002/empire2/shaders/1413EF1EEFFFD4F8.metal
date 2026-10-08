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
    half4 gLightBuffer [116];
    float4 _FXColor ;
    float _AlphaBlend ;
    float _Dissolve ;
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
    float4 _AlphaMaskChannel ;
    float _SP_EdgeWidth ;
    float _SP_EdgeDown ;
    float _SP_DistortIntensity ;
    float _DisableDepthFade_FromCameraHeight ;
    float _DisableDepthFade_CameraHeightRange ;
    float _AdaptionBias ;
    float _GLOBAL_SKILL_ALPHA ;
    float _adjustToggle ;
    half _BaseMapAlphaPower ;
    float _BottomClipHeight ;
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
    float2 u_xlat0;
    half2 u_xlat16_0;
    bool u_xlatb0;
    float4 u_xlat1;
    half4 u_xlat16_1;
    float4 u_xlat2;
    float4 u_xlat3;
    bool4 u_xlatb3;
    float4 u_xlat4;
    bool4 u_xlatb4;
    half3 u_xlat16_5;
    float3 u_xlat6;
    float3 u_xlat8;
    float2 u_xlat12;
    float2 u_xlat14;
    half u_xlat16_14;
    float2 u_xlat15;
    float u_xlat20;
    half u_xlat16_23;
    u_xlat0.x = input.TEXCOORD0.y + (-FGlobals._BottomClipHeight);
    u_xlatb0 = u_xlat0.x<0.0;
    if(((int(u_xlatb0) * int(0xffffffffu)))!=0){discard_fragment();}
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
    u_xlat16_1 = fma(u_xlat16_0.xyxy, half4(2.0, 2.0, 2.0, 2.0), half4(-1.0, -1.0, -1.0, -1.0));
    u_xlat0.x = FGlobals._MainTexRotator * 3.14159274;
    u_xlat2.x = cos(u_xlat0.x);
    u_xlat0.x = sin(u_xlat0.x);
    u_xlat3.x = (-u_xlat0.x);
    u_xlat3.y = u_xlat2.x;
    u_xlat3.z = u_xlat0.x;
    u_xlat0.y = dot(u_xlat12.yx, u_xlat3.yz);
    u_xlat0.x = dot(u_xlat12.yx, u_xlat3.xy);
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
    u_xlat15.y = dot(u_xlat12.yx, u_xlat4.yz);
    u_xlat15.x = dot(u_xlat12.yx, u_xlat4.xy);
    u_xlat0.xy = u_xlat15.xy + float2(0.5, 0.5);
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
    u_xlat14.xy = u_xlat3.xy * u_xlat4.yz;
    u_xlat2.xy = u_xlat2.xy * u_xlat14.xx;
    u_xlat2.xy = fma(u_xlat4.xx, u_xlat1.xy, u_xlat2.xy);
    u_xlat16_14 = _FXTex.sample(sampler_FXTex, u_xlat1.zw).x;
    u_xlat16_14 = u_xlat16_14 + half(-0.5);
    u_xlat0.xy = fma(u_xlat14.yy, u_xlat0.xy, u_xlat2.xy);
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, u_xlat0.xy);
    u_xlat16_5.xyz = log2(u_xlat16_1.xyz);
    u_xlat16_0.x = log2(u_xlat16_1.w);
    u_xlat16_0.x = u_xlat16_0.x * FGlobals._BaseMapAlphaPower;
    u_xlat16_0.x = exp2(u_xlat16_0.x);
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_5.xyz = exp2(u_xlat16_5.xyz);
    u_xlat6.x = FGlobals._AlphaMaskRotator * 3.14159274;
    u_xlat2.x = sin(u_xlat6.x);
    u_xlat3.x = cos(u_xlat6.x);
    u_xlat4.x = (-u_xlat2.x);
    u_xlat4.y = u_xlat3.x;
    u_xlat4.z = u_xlat2.x;
    u_xlat2.y = dot(u_xlat12.yx, u_xlat4.yz);
    u_xlat2.x = dot(u_xlat12.yx, u_xlat4.xy);
    u_xlat6.xy = u_xlat2.xy + float2(0.5, 0.5);
    u_xlat6.xy = fma(u_xlat6.xy, FGlobals._AlphaMask_ST.xy, FGlobals._AlphaMask_ST.zw);
    u_xlat2.xy = fract(u_xlat6.xy);
    u_xlatb3.xy = (float2(1.5, 2.5)>=float2(FGlobals._AlphaTex_Wrap));
    u_xlat3.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb3.xy));
    u_xlat3.xy = u_xlat3.zw * u_xlat3.xy;
    u_xlat2.xy = u_xlat2.xy * u_xlat3.xx;
    u_xlat2.xy = fma(u_xlat4.ww, u_xlat6.xy, u_xlat2.xy);
    u_xlat6.xy = u_xlat6.xy;
    u_xlat6.xy = clamp(u_xlat6.xy, 0.0f, 1.0f);
    u_xlat6.xy = fma(u_xlat3.yy, u_xlat6.xy, u_xlat2.xy);
    u_xlat16_1 = _AlphaMask.sample(sampler_AlphaMask, u_xlat6.xy);
    u_xlat6.x = dot(float4(u_xlat16_1), FGlobals._AlphaMaskChannel);
    u_xlat2.xyw = u_xlat6.xxx * float3(u_xlat16_5.xyz);
    u_xlat0.x = u_xlat6.x * float(u_xlat16_0.x);
    u_xlat0.x = u_xlat0.x * FGlobals._AlphaMaskIntensity;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat6.xyz = u_xlat2.xyw * float3(FGlobals._AlphaMaskIntensity);
    u_xlat6.xyz = clamp(u_xlat6.xyz, 0.0f, 1.0f);
    u_xlat2.x = (-FGlobals._DissolveStartOffset) + 1.0;
    u_xlat2.x = fma(float(u_xlat16_14), u_xlat2.x, 0.5);
    u_xlat2.x = u_xlat2.x + (-FGlobals._Dissolve);
    u_xlat2.x = u_xlat2.x * FGlobals._EdgeWidth;
    u_xlat2.x = clamp(u_xlat2.x, 0.0f, 1.0f);
    u_xlat8.x = (-u_xlat2.x) + 1.0;
    u_xlat8.xyz = u_xlat8.xxx * FGlobals._FXColor.xyz;
    u_xlat8.xyz = fma(u_xlat8.xyz, float3(FGlobals._FXColorIntensity), u_xlat6.xyz);
    u_xlatb3.x = 0.0<FGlobals._DissolveEdgeColor;
    u_xlat6.xyz = (u_xlatb3.x) ? u_xlat8.xyz : u_xlat6.xyz;
    u_xlat6.xyz = u_xlat2.xxx * u_xlat6.xyz;
    u_xlat6.xyz = u_xlat6.xyz * float3(input.TEXCOORD2.xyz);
    u_xlat6.xyz = u_xlat6.xyz * FGlobals._TintColor.xyz;
    u_xlat8.x = u_xlat0.x * u_xlat2.x;
    u_xlat0.x = fma((-u_xlat0.x), u_xlat2.x, 1.0);
    u_xlat6.xyz = u_xlat6.xyz * u_xlat8.xxx;
    u_xlat2.x = u_xlat8.x * FGlobals._TintColor.w;
    u_xlat2.x = u_xlat2.x * float(input.TEXCOORD2.w);
    u_xlat6.xyz = u_xlat6.xyz * FGlobals._TintColor.www;
    u_xlat6.xyz = u_xlat6.xyz * float3(input.TEXCOORD2.www);
    u_xlat8.xy = float2(FGlobals._FinalAlpha) * float2(FGlobals._adjustToggle, FGlobals._GLOBAL_SKILL_ALPHA);
    u_xlat20 = (-FGlobals._adjustToggle) + 1.0;
    u_xlat8.x = fma(u_xlat8.y, u_xlat20, u_xlat8.x);
    u_xlat6.xyz = u_xlat6.xyz * u_xlat8.xxx;
    u_xlat2.x = u_xlat8.x * u_xlat2.x;
    u_xlat8.x = input.TEXCOORD9.w * FGlobals._SP_DistortIntensity;
    u_xlat0.x = fma(u_xlat8.x, u_xlat0.x, input.TEXCOORD9.w);
    u_xlat8.x = fma(FGlobals._ZBufferParams.z, input.SV_Target1, FGlobals._ZBufferParams.w);
    u_xlat8.x = float(1.0) / u_xlat8.x;
    u_xlat0.x = (-u_xlat0.x) + u_xlat8.x;
    u_xlat0.x = u_xlat0.x / FGlobals._SP_EdgeWidth;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat8.x = (-u_xlat0.x) + 1.0;
    u_xlat14.x = FGlobals._WorldSpaceCameraPos.xyzx.y + (-FGlobals._DisableDepthFade_FromCameraHeight);
    u_xlat14.x = u_xlat14.x / FGlobals._DisableDepthFade_CameraHeightRange;
    u_xlat14.x = clamp(u_xlat14.x, 0.0f, 1.0f);
    u_xlat0.x = fma(u_xlat14.x, u_xlat8.x, u_xlat0.x);
    u_xlat0.x = (-u_xlat0.x) + 1.0;
    u_xlat0.x = u_xlat0.x * FGlobals._SP_EdgeDown;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat0.x = (-u_xlat0.x) + 1.0;
    u_xlat6.xyz = u_xlat0.xxx * u_xlat6.xyz;
    u_xlat0.x = u_xlat0.x * u_xlat2.x;
    u_xlat0.x = u_xlat0.x * FGlobals._AlphaBlend;
    output.SV_Target0.w = half(u_xlat0.x);
    u_xlat16_5.xyz = FGlobals.gLightBuffer[11].yyy * FGlobals.gLightBuffer[12].xyz;
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(0.200000003, 0.200000003, 0.200000003);
    u_xlat16_5.xyz = log2(u_xlat16_5.xyz);
    u_xlat16_23 = half(FGlobals._AdaptionBias + 0.100000001);
    u_xlat16_23 = u_xlat16_23 * half(2.20000005);
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(u_xlat16_23);
    u_xlat16_5.xyz = exp2(u_xlat16_5.xyz);
    output.SV_Target0.xyz = half3(u_xlat6.xyz * float3(u_xlat16_5.xyz));
    return output;
}
