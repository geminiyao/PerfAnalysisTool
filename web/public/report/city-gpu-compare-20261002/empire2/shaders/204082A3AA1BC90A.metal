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
    half4 _TextureSampleAdd ;
    float4 _ClipRect ;
    half _UseClipRect ;
    half _UseUIAlphaClip ;
    half _UseUIAlphaFade ;
    half _UseUIBlurBlend ;
    float _UseUIAlphaFade2 ;
};

struct Mtl_FragmentIn
{
    half4 COLOR0 [[ user(COLOR0) ]] ;
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    half2 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    float4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
};

struct Mtl_FragmentOut
{
    float4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_AlphaTex [[ sampler (1) ]],
    sampler sampler_FadeTex [[ sampler (2) ]],
    sampler sampler_FadeTex2 [[ sampler (3) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _AlphaTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _FadeTex [[ texture(2) ]] ,
    texture2d<half, access::sample > _FadeTex2 [[ texture(3) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float2 u_xlat0;
    half u_xlat16_0;
    bool4 u_xlatb0;
    half4 u_xlat16_1;
    half4 u_xlat16_2;
    half4 u_xlat16_3;
    half3 u_xlat16_4;
    float2 u_xlat5;
    bool2 u_xlatb5;
    half u_xlat16_6;
    bool u_xlatb6;
    float u_xlat19;
    half u_xlat16_19;
    u_xlatb0 = (half4(0.5, 0.5, 0.5, 0.5)<half4(FGlobals._UseUIBlurBlend, FGlobals._UseClipRect, FGlobals._UseUIAlphaFade, FGlobals._UseUIAlphaClip));
    if(u_xlatb0.x){
        u_xlat16_1 = _MainTex.sample(sampler_MainTex, input.TEXCOORD0.xy);
        u_xlat16_1 = u_xlat16_1 + FGlobals._TextureSampleAdd;
        u_xlat16_1 = u_xlat16_1 * input.COLOR0;
        u_xlat16_2 = u_xlat16_1;
    } else {
        u_xlat16_1 = _MainTex.sample(sampler_MainTex, input.TEXCOORD0.xy);
        u_xlat16_1 = u_xlat16_1 + FGlobals._TextureSampleAdd;
        u_xlat16_3 = _AlphaTex.sample(sampler_AlphaTex, input.TEXCOORD0.xy);
        u_xlat16_3 = u_xlat16_3 + half4(1.0, 1.0, 1.0, 0.0);
        u_xlat16_3 = (-u_xlat16_1) + u_xlat16_3;
        u_xlat16_1 = fma(input.TEXCOORD2.yyyy, u_xlat16_3, u_xlat16_1);
        u_xlat16_1 = u_xlat16_1 * input.COLOR0;
        u_xlat16_2 = u_xlat16_1;
    }
    u_xlat16_4.x = dot(u_xlat16_2.xyz, half3(0.153999999, 0.494899988, 0.0496999994));
    u_xlat16_4.xyz = (-u_xlat16_2.xyz) + u_xlat16_4.xxx;
    u_xlat16_1.xyz = fma(input.TEXCOORD2.xxx, u_xlat16_4.xyz, u_xlat16_2.xyz);
    u_xlat16_2.x = u_xlat16_2.w * input.TEXCOORD2.x;
    u_xlat16_1.w = fma(u_xlat16_2.x, half(-0.100000024), u_xlat16_2.w);
    if(u_xlatb0.y){
        u_xlatb0.xy = (input.TEXCOORD1.xy>=FGlobals._ClipRect.xy);
        u_xlat0.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb0.xy));
        u_xlatb5.xy = (FGlobals._ClipRect.zw>=input.TEXCOORD1.xy);
        u_xlat5.xy = select(float2(0.0, 0.0), float2(1.0, 1.0), bool2(u_xlatb5.xy));
        u_xlat0.xy = u_xlat0.xy * u_xlat5.xy;
        u_xlat0.x = u_xlat0.y * u_xlat0.x;
        u_xlat19 = u_xlat0.x * float(u_xlat16_1.w);
        u_xlat16_1.w = half(u_xlat19);
    }
    if(u_xlatb0.z){
        u_xlat16_0 = _FadeTex.sample(sampler_FadeTex, input.TEXCOORD3.xy).w;
        u_xlat16_0 = u_xlat16_0 * u_xlat16_1.w;
        u_xlatb6 = 0.5<FGlobals._UseUIAlphaFade2;
        if(u_xlatb6){
            u_xlat16_6 = _FadeTex2.sample(sampler_FadeTex2, input.TEXCOORD3.zw).w;
            u_xlat16_19 = u_xlat16_6 * u_xlat16_0;
            u_xlat16_1.w = u_xlat16_19;
        } else {
            u_xlat16_1.w = u_xlat16_0;
        }
    }
    if(u_xlatb0.w){
        u_xlat16_2.x = u_xlat16_1.w + half(-0.00100000005);
        u_xlatb0.x = u_xlat16_2.x<half(0.0);
        if(((int(u_xlatb0.x) * int(0xffffffffu)))!=0){discard_fragment();}
    }
    output.SV_Target0 = float4(u_xlat16_1);
    return output;
}
