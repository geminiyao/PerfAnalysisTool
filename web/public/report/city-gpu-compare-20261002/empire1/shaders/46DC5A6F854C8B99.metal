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
    float3 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    half TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    half4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    float2 TEXCOORD5 [[ user(TEXCOORD5) ]] ;
    float3 TEXCOORD6 [[ user(TEXCOORD6) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_FontTex [[ sampler (1) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _FontTex [[ texture(1) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    half4 u_xlat16_0;
    bool u_xlatb0;
    float u_xlat1;
    half4 u_xlat16_1;
    half4 u_xlat16_2;
    float u_xlat3;
    bool u_xlatb3;
    float u_xlat6;
    half u_xlat16_6;
    float u_xlat9;
    u_xlat0.x = dot(input.TEXCOORD6.xy, input.TEXCOORD6.xy);
    u_xlat0.x = rsqrt(u_xlat0.x);
    u_xlat0.xy = u_xlat0.xx * input.TEXCOORD6.xy;
    u_xlat6 = fma(abs(u_xlat0.y), -0.0187292993, 0.0742610022);
    u_xlat6 = fma(u_xlat6, abs(u_xlat0.y), -0.212114394);
    u_xlat6 = fma(u_xlat6, abs(u_xlat0.y), 1.57072878);
    u_xlat9 = -abs(u_xlat0.y) + 1.0;
    u_xlat9 = sqrt(u_xlat9);
    u_xlat1 = u_xlat9 * u_xlat6;
    u_xlat1 = fma(u_xlat1, -2.0, 3.14159274);
    u_xlatb3 = u_xlat0.y<(-u_xlat0.y);
    u_xlatb0 = u_xlat0.x<0.0;
    u_xlat3 = u_xlatb3 ? u_xlat1 : float(0.0);
    u_xlat3 = fma(u_xlat6, u_xlat9, u_xlat3);
    u_xlat6 = u_xlat3 * 57.295784;
    u_xlat3 = fma((-u_xlat3), 57.295784, 360.0);
    u_xlat0.x = (u_xlatb0) ? u_xlat3 : u_xlat6;
    u_xlat3 = max(input.TEXCOORD6.z, 0.0);
    u_xlat3 = min(u_xlat3, 360.0);
    u_xlat0.x = (-u_xlat3) + u_xlat0.x;
    u_xlatb0 = u_xlat0.x<0.0;
    if(((int(u_xlatb0) * int(0xffffffffu)))!=0){discard_fragment();}
    u_xlat0.x = float(input.TEXCOORD3) * input.TEXCOORD5.x;
    u_xlat3 = min(u_xlat0.x, 1.0);
    u_xlat0.x = u_xlat0.x * 0.5;
    u_xlat3 = sqrt(u_xlat3);
    u_xlat16_6 = _FontTex.sample(sampler_FontTex, input.TEXCOORD0.xy).w;
    u_xlat6 = (-float(u_xlat16_6)) + input.TEXCOORD5.y;
    u_xlat9 = fma(u_xlat6, input.TEXCOORD5.x, u_xlat0.x);
    u_xlat9 = clamp(u_xlat9, 0.0f, 1.0f);
    u_xlat0.x = fma(u_xlat6, input.TEXCOORD5.x, (-u_xlat0.x));
    u_xlat0.x = clamp(u_xlat0.x, 0.0f, 1.0f);
    u_xlat0.x = (-u_xlat0.x) + 1.0;
    u_xlat3 = u_xlat3 * u_xlat9;
    u_xlat16_1.xyz = input.TEXCOORD2.www * input.TEXCOORD2.xyz;
    u_xlat16_1.w = input.TEXCOORD2.w;
    u_xlat16_2.xyz = input.TEXCOORD1.www * input.TEXCOORD1.xyz;
    u_xlat16_2.w = input.TEXCOORD1.w;
    u_xlat16_1 = u_xlat16_1 + (-u_xlat16_2);
    u_xlat16_1 = half4(fma(float4(u_xlat3), float4(u_xlat16_1), float4(u_xlat16_2)));
    u_xlat16_1.w = half(u_xlat0.x * float(u_xlat16_1.w));
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, input.TEXCOORD0.xy);
    u_xlat16_1 = fma((-u_xlat16_0), input.TEXCOORD1, u_xlat16_1);
    u_xlat16_0 = u_xlat16_0 * input.TEXCOORD1;
    u_xlat0 = fma(input.TEXCOORD0.zzzz, float4(u_xlat16_1), float4(u_xlat16_0));
    output.SV_Target0 = half4(u_xlat0);
    return output;
}
