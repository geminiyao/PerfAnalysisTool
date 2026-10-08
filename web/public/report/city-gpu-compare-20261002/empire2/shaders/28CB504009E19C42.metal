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
struct Mtl_FragmentIn
{
    float4 COLOR0 [[ user(COLOR0) ]] ;
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float2 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    float2 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    float2 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    float2 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    float2 TEXCOORD5 [[ user(TEXCOORD5) ]] ;
};

struct Mtl_FragmentOut
{
    float4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    sampler sampler_MainTex [[ sampler (0) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
        float4 phase0_Input0_3;
        phase0_Input0_3 = float4(input.TEXCOORD2, input.TEXCOORD3);
    float u_xlat0;
    bool u_xlatb0;
    float3 u_xlat1;
    half4 u_xlat16_1;
    bool3 u_xlatb2;
    u_xlat0 = input.TEXCOORD1.x * phase0_Input0_3.y;
    u_xlat0 = u_xlat0 * 1000.0;
    u_xlatb2.xy = (float2(0.0, 0.0)<input.TEXCOORD4.xy);
    u_xlat0 = (u_xlatb2.x) ? input.TEXCOORD4.y : u_xlat0;
    u_xlat0 = (-u_xlat0) + input.TEXCOORD5.x;
    u_xlatb0 = u_xlat0<0.0;
    u_xlatb2.xz = (float2(0.0, 0.0)<phase0_Input0_3.yw);
    u_xlatb0 = u_xlatb2.x && u_xlatb0;
    if(((int(u_xlatb0) * int(0xffffffffu)))!=0){discard_fragment();}
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, input.TEXCOORD0.xy, level(0.0));
    u_xlat0 = float(u_xlat16_1.w) + -0.100000001;
    u_xlatb0 = u_xlat0<0.0;
    if(((int(u_xlatb0) * int(0xffffffffu)))!=0){discard_fragment();}
    u_xlat0 = input.TEXCOORD5.x / phase0_Input0_3.z;
    u_xlat0 = (u_xlatb2.z) ? u_xlat0 : float(u_xlat16_1.w);
    u_xlat1.xyz = float3(u_xlat16_1.xyz) * input.COLOR0.xyz;
    output.SV_Target0.xyz = u_xlat1.xyz * float3(2.5, 2.5, 2.5);
    output.SV_Target0.w = (u_xlatb2.y) ? input.TEXCOORD4.x : u_xlat0;
    return output;
}
