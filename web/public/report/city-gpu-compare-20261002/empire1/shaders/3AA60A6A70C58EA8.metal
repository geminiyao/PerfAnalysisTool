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
    float4 _MainTex_ST ;
    float4 _TintColor ;
    float4 _MainColor ;
    float _ColorIntensity ;
    float _AlphaBlend ;
    float _MainTexOffsetX ;
    float _MainTexOffsetY ;
    float _MainTexRotator ;
    float4 _FXTex_ST ;
    float _FXTexOffsetX ;
    float _FXTexOffsetY ;
    float _FXTexRotator ;
    float4 _FXColor ;
    float _FXColorIntensity ;
    float _EdgeWidth ;
    float _DissolveStartOffset ;
    float _Dissolve ;
    float _DissolveEdgeColor ;
    float4 _TwistTex_ST ;
    float _TwistOffsetX ;
    float _TwistOffsetY ;
    float _TwistRotator ;
    float _TwistIntensity ;
    float4 _AlphaMask_ST ;
    float _AlphaMaskRotator ;
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
    float SV_Target1 [[ color(xlt_remap_o[1]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_FXTex [[ sampler (1) ]],
    sampler sampler_TwistTex [[ sampler (2) ]],
    sampler sampler_AlphaMask [[ sampler (3) ]],
    texture2d<half, access::sample > _TwistTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _AlphaMask [[ texture(1) ]] ,
    texture2d<half, access::sample > _MainTex [[ texture(2) ]] ,
    texture2d<half, access::sample > _FXTex [[ texture(3) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float2 u_xlat0;
    half2 u_xlat16_0;
    float4 u_xlat1;
    half4 u_xlat16_1;
    float4 u_xlat2;
    bool u_xlatb2;
    float3 u_xlat3;
    float3 u_xlat4;
    half3 u_xlat16_5;
    float3 u_xlat6;
    half u_xlat16_6;
    float2 u_xlat12;
    float2 u_xlat15;
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
    u_xlat16_0.x = _FXTex.sample(sampler_FXTex, u_xlat1.zw).x;
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, u_xlat1.xy);
    u_xlat16_0.x = u_xlat16_0.x + half(-0.5);
    u_xlat6.x = (-FGlobals._DissolveStartOffset) + 1.0;
    u_xlat0.x = fma(float(u_xlat16_0.x), u_xlat6.x, 0.5);
    u_xlat0.x = u_xlat0.x + (-FGlobals._Dissolve);
    u_xlat0.x = u_xlat0.x * FGlobals._EdgeWidth;
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
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
    u_xlat16_6 = _AlphaMask.sample(sampler_AlphaMask, u_xlat6.xy).x;
    u_xlat12.x = fma((-float(u_xlat16_6)), u_xlat0.x, 1.0);
    u_xlat0.x = u_xlat0.x * float(u_xlat16_6);
    u_xlat6.xyz = u_xlat12.xxx * FGlobals._FXColor.xyz;
    u_xlat6.xyz = fma(u_xlat6.xyz, float3(FGlobals._FXColorIntensity), float3(u_xlat16_1.xyz));
    u_xlatb2 = 0.0<FGlobals._DissolveEdgeColor;
    u_xlat6.xyz = (bool(u_xlatb2)) ? u_xlat6.xyz : float3(u_xlat16_1.xyz);
    u_xlat16_5.xyz = log2(input.TEXCOORD2.xyz);
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(0.454545468, 0.454545468, 0.454545468);
    u_xlat16_5.xyz = exp2(u_xlat16_5.xyz);
    u_xlat6.xyz = u_xlat6.xyz * float3(u_xlat16_5.xyz);
    u_xlat6.xyz = u_xlat6.xyz * float3(FGlobals._ColorIntensity);
    u_xlat2 = FGlobals._TintColor * FGlobals._MainColor;
    u_xlat6.xyz = u_xlat6.xyz * u_xlat2.xyz;
    u_xlat1.x = float(u_xlat16_1.w) * u_xlat2.w;
    u_xlat1.x = u_xlat1.x * float(input.TEXCOORD2.w);
    u_xlat0.x = u_xlat0.x * u_xlat1.x;
    u_xlat1.xyz = u_xlat0.xxx * u_xlat6.xyz;
    u_xlat1.w = u_xlat0.x * FGlobals._AlphaBlend;
    output.SV_TARGET0 = half4(u_xlat1);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
