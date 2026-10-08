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
    float _AlphaBlend ;
    float4 _MainTex_ST ;
    float _MainTex_Wrap ;
    float4 _TintColor ;
    float _FinalAlpha ;
    float _MainTexOffsetX ;
    float _MainTexOffsetY ;
    float _MainTexRotator ;
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
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    half4 u_xlat16_0;
    bool u_xlatb0;
    float2 u_xlat1;
    bool2 u_xlatb1;
    float3 u_xlat2;
    bool3 u_xlatb2;
    float3 u_xlat3;
    half3 u_xlat16_4;
    float3 u_xlat5;
    half3 u_xlat16_5;
    float u_xlat6;
    half u_xlat16_6;
    float2 u_xlat10;
    float u_xlat11;
    half u_xlat16_19;
    u_xlat0.x = input.TEXCOORD0.y + (-FGlobals._BottomClipHeight);
    u_xlatb0 = u_xlat0.x<0.0;
    if(((int(u_xlatb0) * int(0xffffffffu)))!=0){discard_fragment();}
    u_xlat0.x = input.TEXCOORD0.w;
    u_xlat0.y = input.TEXCOORD1.w;
    u_xlat0.xy = u_xlat0.xy + float2(-0.5, -0.5);
    u_xlat10.x = FGlobals._MainTexRotator * 3.14159274;
    u_xlat1.x = sin(u_xlat10.x);
    u_xlat2.x = cos(u_xlat10.x);
    u_xlat3.x = (-u_xlat1.x);
    u_xlat3.y = u_xlat2.x;
    u_xlat3.z = u_xlat1.x;
    u_xlat1.y = dot(u_xlat0.yx, u_xlat3.yz);
    u_xlat1.x = dot(u_xlat0.yx, u_xlat3.xy);
    u_xlat0.xy = u_xlat1.xy + float2(0.5, 0.5);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._MainTex_ST.xy, FGlobals._MainTex_ST.zw);
    u_xlat10.xy = FGlobals._Time.yy * float2(FGlobals._MainTexOffsetX, FGlobals._MainTexOffsetY);
    u_xlat10.xy = fract(u_xlat10.xy);
    u_xlat0.xy = u_xlat10.xy + u_xlat0.xy;
    u_xlat10.xy = fract(u_xlat0.xy);
    u_xlatb1.xy = (float2(FGlobals._MainTex_Wrap)>=float2(0.5, 1.5));
    u_xlat1.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb1.xy));
    u_xlatb2.xyz = (float3(0.5, 1.5, 2.5)>=float3(FGlobals._MainTex_Wrap));
    u_xlat2.xyz = select(float3(0.0, 0.0, 0.0), float3(1.0, 1.0, 1.0), bool3(u_xlatb2.xyz));
    u_xlat1.xy = u_xlat1.xy * u_xlat2.yz;
    u_xlat10.xy = u_xlat10.xy * u_xlat1.xx;
    u_xlat10.xy = fma(u_xlat2.xx, u_xlat0.xy, u_xlat10.xy);
    u_xlat0.xy = u_xlat0.xy;
    u_xlat0.xy = clamp(u_xlat0.xy, 0.0f, 1.0f);
    u_xlat0.xy = fma(u_xlat1.yy, u_xlat0.xy, u_xlat10.xy);
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, u_xlat0.xy);
    u_xlat16_4.xyz = log2(u_xlat16_0.xyz);
    u_xlat16_0.x = log2(u_xlat16_0.w);
    u_xlat16_0.x = u_xlat16_0.x * FGlobals._BaseMapAlphaPower;
    u_xlat16_0.x = exp2(u_xlat16_0.x);
    u_xlat16_4.xyz = u_xlat16_4.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_4.xyz = exp2(u_xlat16_4.xyz);
    u_xlat16_5.xyz = u_xlat16_4.xyz * input.TEXCOORD2.xyz;
    u_xlat5.xyz = float3(u_xlat16_5.xyz) * FGlobals._TintColor.xyz;
    u_xlat5.xyz = float3(u_xlat16_0.xxx) * u_xlat5.xyz;
    u_xlat5.xyz = u_xlat5.xyz * FGlobals._TintColor.www;
    u_xlat0.yzw = u_xlat5.xyz * float3(input.TEXCOORD2.www);
    u_xlat1.xy = float2(FGlobals._FinalAlpha) * float2(FGlobals._adjustToggle, FGlobals._GLOBAL_SKILL_ALPHA);
    u_xlat11 = (-FGlobals._adjustToggle) + 1.0;
    u_xlat1.x = fma(u_xlat1.y, u_xlat11, u_xlat1.x);
    u_xlat16_6 = (-u_xlat16_0.x) + half(1.0);
    u_xlat0.x = float(u_xlat16_0.x) * FGlobals._TintColor.w;
    u_xlat0.x = u_xlat0.x * float(input.TEXCOORD2.w);
    u_xlat0 = u_xlat0 * u_xlat1.xxxx;
    u_xlat1.x = input.TEXCOORD9.w * FGlobals._SP_DistortIntensity;
    u_xlat1.x = fma(u_xlat1.x, float(u_xlat16_6), input.TEXCOORD9.w);
    u_xlat6 = fma(FGlobals._ZBufferParams.z, input.SV_Target1, FGlobals._ZBufferParams.w);
    u_xlat6 = float(1.0) / u_xlat6;
    u_xlat1.x = (-u_xlat1.x) + u_xlat6;
    u_xlat1.x = u_xlat1.x / FGlobals._SP_EdgeWidth;
    u_xlat1.x = clamp(u_xlat1.x, 0.0f, 1.0f);
    u_xlat6 = (-u_xlat1.x) + 1.0;
    u_xlat11 = FGlobals._WorldSpaceCameraPos.xyzx.y + (-FGlobals._DisableDepthFade_FromCameraHeight);
    u_xlat11 = u_xlat11 / FGlobals._DisableDepthFade_CameraHeightRange;
    u_xlat11 = clamp(u_xlat11, 0.0f, 1.0f);
    u_xlat1.x = fma(u_xlat11, u_xlat6, u_xlat1.x);
    u_xlat1.x = (-u_xlat1.x) + 1.0;
    u_xlat1.x = u_xlat1.x * FGlobals._SP_EdgeDown;
    u_xlat1.x = clamp(u_xlat1.x, 0.0f, 1.0f);
    u_xlat1.x = (-u_xlat1.x) + 1.0;
    u_xlat0 = u_xlat0 * u_xlat1.xxxx;
    u_xlat0.x = u_xlat0.x * FGlobals._AlphaBlend;
    output.SV_Target0.w = half(u_xlat0.x);
    u_xlat16_4.xyz = FGlobals.gLightBuffer[11].yyy * FGlobals.gLightBuffer[12].xyz;
    u_xlat16_4.xyz = u_xlat16_4.xyz * half3(0.200000003, 0.200000003, 0.200000003);
    u_xlat16_4.xyz = log2(u_xlat16_4.xyz);
    u_xlat16_19 = half(FGlobals._AdaptionBias + 0.100000001);
    u_xlat16_19 = u_xlat16_19 * half(2.20000005);
    u_xlat16_4.xyz = u_xlat16_4.xyz * half3(u_xlat16_19);
    u_xlat16_4.xyz = exp2(u_xlat16_4.xyz);
    output.SV_Target0.xyz = half3(u_xlat0.yzw * float3(u_xlat16_4.xyz));
    return output;
}
