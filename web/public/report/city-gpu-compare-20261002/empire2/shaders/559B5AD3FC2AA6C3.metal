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
    float3 _WorldSpaceCameraPos ;
    float4 hlslcc_mtx4x4unity_MatrixVP [4];
    half4 gFogParams [10];
    half4 _ScreenCenterFogParams0 ;
    half4 _ScreenCenterFogParams1 ;
    float4 _EmissiveTex_ST ;
    float4 _EmissiveTex2_ST ;
    float4 _DistortTex_ST ;
    float4 _TintColor ;
    float4 _Speed ;
    float4 _MaskSpeed ;
    float4 _DistortSpeed ;
    float _DistortPower ;
    float _Opacity ;
    float _GLOBAL_SKILL_ALPHA ;
    float _adjustToggle ;
    half4 _ExtraColor ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_TARGET0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_EmissiveTex [[ sampler (0) ]],
    sampler sampler_EmissiveTex2 [[ sampler (1) ]],
    sampler sampler_DistortTex [[ sampler (2) ]],
    texture2d<half, access::sample > _DistortTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _EmissiveTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _EmissiveTex2 [[ texture(2) ]] ,
    texture2d<half, access::sample > BnSFog_FogMaskTex [[ texture(3) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler BnsFog_LinearClampSampler(filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 u_xlat0;
    half3 u_xlat16_0;
    bool u_xlatb0;
    float2 u_xlat1;
    half4 u_xlat16_1;
    half3 u_xlat16_2;
    half3 u_xlat16_3;
    float3 u_xlat4;
    half4 u_xlat16_4;
    float2 u_xlat5;
    half u_xlat16_5;
    bool u_xlatb5;
    float2 u_xlat10;
    half u_xlat16_10;
    float2 u_xlat11;
    float u_xlat15;
    half u_xlat16_17;
    u_xlat0.x = input.TEXCOORD0.w;
    u_xlat0.y = input.TEXCOORD1.w;
    u_xlat10.xy = fma(u_xlat0.xy, FGlobals._DistortTex_ST.xy, FGlobals._DistortTex_ST.zw);
    u_xlat1.xy = FGlobals._Time.yy * FGlobals._DistortSpeed.xy;
    u_xlat1.xy = fract(u_xlat1.xy);
    u_xlat10.xy = u_xlat10.xy + u_xlat1.xy;
    u_xlat16_10 = _DistortTex.sample(sampler_DistortTex, u_xlat10.xy).x;
    u_xlat1.xy = fma(u_xlat0.xy, FGlobals._EmissiveTex_ST.xy, FGlobals._EmissiveTex_ST.zw);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._EmissiveTex2_ST.xy, FGlobals._EmissiveTex2_ST.zw);
    u_xlat11.xy = FGlobals._Time.yy * FGlobals._Speed.xy;
    u_xlat11.xy = fract(u_xlat11.xy);
    u_xlat10.xy = fma(float2(u_xlat16_10), float2(FGlobals._DistortPower), u_xlat11.xy);
    u_xlat10.xy = u_xlat1.xy + u_xlat10.xy;
    u_xlat16_1 = _EmissiveTex.sample(sampler_EmissiveTex, u_xlat10.xy);
    u_xlat16_2.xyz = log2(u_xlat16_1.xyz);
    u_xlat16_2.xyz = u_xlat16_2.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_2.xyz = exp2(u_xlat16_2.xyz);
    u_xlat10.xy = FGlobals._Time.yy * FGlobals._MaskSpeed.xy;
    u_xlat10.xy = fract(u_xlat10.xy);
    u_xlat0.xy = u_xlat0.xy + u_xlat10.xy;
    u_xlat16_0.xyz = _EmissiveTex2.sample(sampler_EmissiveTex2, u_xlat0.xy).xyz;
    u_xlat16_3.xyz = log2(u_xlat16_0.xyz);
    u_xlat16_3.xyz = u_xlat16_3.xyz * half3(2.20000005, 2.20000005, 2.20000005);
    u_xlat16_3.xyz = exp2(u_xlat16_3.xyz);
    u_xlat16_0.xyz = u_xlat16_2.xyz * u_xlat16_3.xyz;
    u_xlat0.xyz = float3(u_xlat16_0.xyz) * FGlobals._TintColor.xyz;
    u_xlat15 = float(u_xlat16_3.x) * FGlobals._Opacity;
    u_xlat0.w = float(u_xlat16_1.w) * u_xlat15;
    u_xlat0 = u_xlat0 * float4(input.TEXCOORD2);
    u_xlat1.xy = u_xlat0.ww * float2(FGlobals._adjustToggle, FGlobals._GLOBAL_SKILL_ALPHA);
    u_xlat15 = (-FGlobals._adjustToggle) + 1.0;
    u_xlat15 = fma(u_xlat1.y, u_xlat15, u_xlat1.x);
    u_xlat16_2.xyz = half3(u_xlat0.xyz * float3(FGlobals._ExtraColor.xyz));
    u_xlat0.xyz = input.TEXCOORD0.xyz + (-FGlobals._WorldSpaceCameraPos.xyzx.xyz);
    u_xlat0.x = dot(u_xlat0.xyz, u_xlat0.xyz);
    u_xlat0.x = sqrt(u_xlat0.x);
    u_xlat16_17 = half(u_xlat0.x + (-float(FGlobals.gFogParams[5].y)));
    u_xlat16_17 = max(u_xlat16_17, half(0.0));
    u_xlat16_3.x = half(float(FGlobals.gFogParams[5].y) / u_xlat0.x);
    u_xlat16_3.x = clamp(u_xlat16_3.x, 0.0h, 1.0h);
    u_xlat10.x = fma(u_xlat0.y, float(u_xlat16_3.x), FGlobals._WorldSpaceCameraPos.xyzx.y);
    u_xlat10.x = u_xlat10.x + (-float(FGlobals.gFogParams[3].w));
    u_xlat10.x = max(u_xlat10.x, -127.0);
    u_xlat10.x = (-u_xlat10.x) * float(FGlobals.gFogParams[5].z);
    u_xlat10.x = exp2(u_xlat10.x);
    u_xlat16_3.x = (-u_xlat16_3.x) + half(1.0);
    u_xlat5.x = u_xlat0.y * float(u_xlat16_3.x);
    u_xlat5.x = u_xlat5.x * float(FGlobals.gFogParams[5].z);
    u_xlat5.x = max(u_xlat5.x, -64.0);
    u_xlat5.x = min(u_xlat5.x, -0.00100000005);
    u_xlat1.x = exp2((-u_xlat5.x));
    u_xlat1.x = (-u_xlat1.x) + 1.0;
    u_xlat1.x = u_xlat1.x / u_xlat5.x;
    u_xlatb5 = 0.00999999978<(-u_xlat5.x);
    u_xlat5.x = (u_xlatb5) ? u_xlat1.x : 0.693147004;
    u_xlat5.x = u_xlat5.x * u_xlat10.x;
    u_xlat16_17 = half(u_xlat5.x * (-float(u_xlat16_17)));
    u_xlat16_17 = u_xlat16_17 * FGlobals.gFogParams[4].w;
    u_xlat16_17 = exp2(u_xlat16_17);
    u_xlat16_17 = max(u_xlat16_17, FGlobals.gFogParams[5].x);
    u_xlat16_5 = max(FGlobals.gFogParams[9].y, half(9.99999975e-05));
    u_xlat0.x = u_xlat0.x + (-float(FGlobals.gFogParams[5].y));
    u_xlat16_5 = half(1.0) / u_xlat16_5;
    u_xlat0.x = float(u_xlat16_5) * u_xlat0.x;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat5.x = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat5.x;
    u_xlat16_5 = u_xlat16_17 + half(-1.0);
    u_xlat0.x = fma(u_xlat0.x, float(u_xlat16_5), 1.0);
    u_xlat16_17 = half((-u_xlat0.x) + 1.0);
    u_xlat16_1.xyz = half3(u_xlat16_17) * FGlobals.gFogParams[4].xyz;
    u_xlatb5 = half(0.5)<FGlobals.gFogParams[7].x;
    if(u_xlatb5){
        u_xlat16_3.xy = half2(fma(input.TEXCOORD0.xz, float2(FGlobals.gFogParams[8].xy), float2(FGlobals.gFogParams[8].zw)));
        u_xlat16_3.x = BnSFog_FogMaskTex.sample(BnsFog_LinearClampSampler, float2(u_xlat16_3.xy), level(0.0)).x;
        u_xlat16_3.x = log2(u_xlat16_3.x);
        u_xlat16_3.x = u_xlat16_3.x * FGlobals.gFogParams[7].y;
        u_xlat16_3.x = exp2(u_xlat16_3.x);
        u_xlat16_1.w = half(fma(float(u_xlat16_3.x), float(u_xlat16_17), u_xlat0.x));
        u_xlat16_1.xyz = fma(u_xlat16_3.xxx, (-u_xlat16_1.xyz), u_xlat16_1.xyz);
    } else {
        u_xlat16_1.w = half(u_xlat0.x);
    }
    u_xlatb0 = half(0.0)<FGlobals._ScreenCenterFogParams0.z;
    u_xlat4.xyz = input.TEXCOORD0.yyy * FGlobals.hlslcc_mtx4x4unity_MatrixVP[1].xyw;
    u_xlat4.xyz = fma(FGlobals.hlslcc_mtx4x4unity_MatrixVP[0].xyw, input.TEXCOORD0.xxx, u_xlat4.xyz);
    u_xlat4.xyz = fma(FGlobals.hlslcc_mtx4x4unity_MatrixVP[2].xyw, input.TEXCOORD0.zzz, u_xlat4.xyz);
    u_xlat4.xyz = u_xlat4.xyz + FGlobals.hlslcc_mtx4x4unity_MatrixVP[3].xyw;
    u_xlat5.xy = u_xlat4.xy / u_xlat4.zz;
    u_xlat5.xy = fma(u_xlat5.xy, float2(0.5, 0.5), float2(0.5, 0.5));
    u_xlat16_4.xy = FGlobals._ScreenCenterFogParams1.xy + half2(0.5, 0.5);
    u_xlat5.xy = u_xlat5.xy + (-float2(u_xlat16_4.xy));
    u_xlat5.x = dot(u_xlat5.xy, u_xlat5.xy);
    u_xlat5.x = sqrt(u_xlat5.x);
    u_xlat16_17 = half(u_xlat5.x + (-float(FGlobals._ScreenCenterFogParams0.x)));
    u_xlat16_3.x = half(1.0) / FGlobals._ScreenCenterFogParams0.y;
    u_xlat16_17 = u_xlat16_17 * u_xlat16_3.x;
    u_xlat16_17 = clamp(u_xlat16_17, 0.0h, 1.0h);
    u_xlat16_3.x = fma(u_xlat16_17, half(-2.0), half(3.0));
    u_xlat16_17 = u_xlat16_17 * u_xlat16_17;
    u_xlat16_17 = fma((-u_xlat16_3.x), u_xlat16_17, half(1.0));
    u_xlat16_3.x = u_xlat16_17 * FGlobals._ScreenCenterFogParams0.z;
    u_xlat16_17 = fma((-u_xlat16_17), FGlobals._ScreenCenterFogParams0.z, half(1.0));
    u_xlat16_4.xyz = u_xlat16_1.xyz * half3(u_xlat16_17);
    u_xlat16_17 = (-u_xlat16_1.w) + half(1.0);
    u_xlat16_4.w = fma(u_xlat16_3.x, u_xlat16_17, u_xlat16_1.w);
    u_xlat16_1 = (bool(u_xlatb0)) ? u_xlat16_4 : u_xlat16_1;
    output.SV_TARGET0.xyz = fma(u_xlat16_2.xyz, u_xlat16_1.www, u_xlat16_1.xyz);
    output.SV_TARGET0.w = half(u_xlat15);
    return output;
}
