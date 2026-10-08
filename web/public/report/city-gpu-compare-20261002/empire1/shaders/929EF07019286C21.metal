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
    half4 _RV ;
    half _FlashDistance ;
    half _FlashSpeed ;
    half _FlashWeight ;
    half4 _FlashLightColor ;
    half _FlashLightIntensity ;
    half _FlashStartTime ;
    half _NormalBlend ;
    half _OnceFlash ;
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

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    half2 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    sampler sampler_NormalTex [[ sampler (0) ]],
    texture2d<half, access::sample > _NormalTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    half3 u_xlat16_0;
    bool u_xlatb0;
    float u_xlat1;
    half4 u_xlat16_1;
    float u_xlat2;
    half4 u_xlat16_2;
    float3 u_xlat3;
    half3 u_xlat16_3;
    half4 u_xlat16_4;
    half u_xlat16_5;
    float u_xlat6;
    bool2 u_xlatb6;
    half3 u_xlat16_7;
    half u_xlat16_10;
    half u_xlat16_16;
    float u_xlat18;
    half u_xlat16_22;
    u_xlat16_0.x = dot(FGlobals._RV.xyz, FGlobals._RV.xyz);
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * FGlobals._RV.xyz;
    u_xlat1 = sin(float(FGlobals._RV.w));
    u_xlat2 = cos(float(FGlobals._RV.w));
    u_xlat18 = (-u_xlat2) + 1.0;
    u_xlat16_7.xyz = u_xlat16_0.yyz * u_xlat16_0.xyy;
    u_xlat0.xy = float2(u_xlat16_0.zx) * float2(u_xlat1);
    u_xlat3.x = fma(float(u_xlat16_7.x), u_xlat18, u_xlat0.x);
    u_xlat3.y = fma(float(u_xlat16_7.y), u_xlat18, u_xlat2);
    u_xlat3.z = fma(float(u_xlat16_7.z), u_xlat18, (-u_xlat0.y));
    u_xlat0.x = dot(input.TEXCOORD0.xyz, u_xlat3.xyz);
    u_xlat6 = (-float(FGlobals._FlashStartTime)) + UnityPerCamera._Time.y;
    u_xlat16_4.x = half(u_xlat6 * float(FGlobals._FlashSpeed));
    u_xlatb6.xy = (half2(FGlobals._OnceFlash)==half2(0.0, 1.0));
    u_xlat16_10 = fract(u_xlat16_4.x);
    u_xlat16_10 = u_xlat16_10 * FGlobals._FlashDistance;
    u_xlat16_10 = fma(u_xlat16_10, half(3.0), (-FGlobals._FlashDistance));
    u_xlat16_16 = half(u_xlat0.x + (-float(u_xlat16_10)));
    u_xlat16_22 = half(1.0) / FGlobals._FlashWeight;
    u_xlat16_16 = u_xlat16_22 * u_xlat16_16;
    u_xlat16_16 = clamp(u_xlat16_16, 0.0h, 1.0h);
    u_xlat16_5 = fma(u_xlat16_16, half(-2.0), half(3.0));
    u_xlat16_16 = u_xlat16_16 * u_xlat16_16;
    u_xlat16_16 = u_xlat16_16 * u_xlat16_5;
    u_xlat16_16 = (u_xlatb6.x) ? u_xlat16_16 : half(u_xlat0.x);
    if(u_xlatb6.y){
        u_xlatb0 = u_xlat16_4.x<half(1.0);
        if(u_xlatb0){
            u_xlat16_4.x = (-u_xlat16_10) + u_xlat16_16;
            u_xlat16_4.x = u_xlat16_22 * u_xlat16_4.x;
            u_xlat16_4.x = clamp(u_xlat16_4.x, 0.0h, 1.0h);
            u_xlat16_10 = fma(u_xlat16_4.x, half(-2.0), half(3.0));
            u_xlat16_4.x = u_xlat16_4.x * u_xlat16_4.x;
            u_xlat16_16 = u_xlat16_4.x * u_xlat16_10;
        } else {
            output.SV_Target0 = half4(0.0, 0.0, 0.0, 0.0);
            return output;
        }
    }
    u_xlat16_0.xy = _NormalTex.sample(sampler_NormalTex, float2(input.TEXCOORD2.xy)).xy;
    u_xlat16_4.xw = fma(u_xlat16_0.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_4.y = (-u_xlat16_4.w);
    u_xlat16_4.xy = u_xlat16_4.xy;
    u_xlat16_4.xy = clamp(u_xlat16_4.xy, 0.0h, 1.0h);
    u_xlat16_16 = u_xlat16_16;
    u_xlat16_16 = clamp(u_xlat16_16, 0.0h, 1.0h);
    u_xlat16_22 = (-u_xlat16_16) + half(1.0);
    u_xlat16_0.x = u_xlat16_22 * u_xlat16_16;
    u_xlat16_1 = FGlobals._FlashLightColor.wxyz * half4(FGlobals._FlashLightIntensity);
    u_xlat16_2 = u_xlat16_0.xxxx * u_xlat16_1;
    u_xlat16_4.x = dot(u_xlat16_4.xy, u_xlat16_2.xx);
    u_xlat16_0.x = fma((-u_xlat16_0.x), u_xlat16_1.x, u_xlat16_4.x);
    u_xlat0.w = fma(float(FGlobals._NormalBlend), float(u_xlat16_0.x), float(u_xlat16_2.x));
    u_xlat0.w = clamp(u_xlat0.w, 0.0f, 1.0f);
    u_xlat16_3.xyz = fma(u_xlat16_2.yzw, u_xlat16_4.xxx, (-u_xlat16_2.yzw));
    u_xlat0.xyz = fma(float3(FGlobals._NormalBlend), float3(u_xlat16_3.xyz), float3(u_xlat16_2.yzw));
    output.SV_Target0 = half4(u_xlat0);
    return output;
}
