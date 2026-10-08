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
    float _NoiseTiling ;
    float4 _OffsetSize ;
    float _SinX ;
    float _SinY ;
    float _RoadSmoothInten ;
    float _EdgeBlend ;
    float _RoadAlpha ;
    float4 _BuildBlendParams ;
    float4 _Splat0Param0 ;
    float4 _Splat0Param1 ;
    float4 _Splat0Param2 ;
    float4 _Splat1Param0 ;
    float4 _Splat1Param1 ;
    float4 _Splat1Param2 ;
    float4 _MoveBuildBlendParams ;
};

struct Mtl_FragmentIn
{
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
    half4 SV_Target1 [[ color(xlt_remap_o[1]) ]];
    half4 SV_Target2 [[ color(xlt_remap_o[2]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    sampler sampler_SplatMap0 [[ sampler (0) ]],
    sampler sampler_SplatMap1 [[ sampler (1) ]],
    sampler sampler_BlendMap [[ sampler (2) ]],
    sampler sampler_NoiseMap [[ sampler (3) ]],
    sampler sampler_BlendSplatTex [[ sampler (4) ]],
    sampler sampler_BlendSplatTex1 [[ sampler (5) ]],
    sampler sampler_MaskTex [[ sampler (6) ]],
    sampler sampler_SplatMapLast0 [[ sampler (7) ]],
    sampler sampler_SplatMapLast1 [[ sampler (8) ]],
    texture2d<half, access::sample > _NoiseMap [[ texture(0) ]] ,
    texture2d<half, access::sample > _BlendMap [[ texture(1) ]] ,
    texture2d<half, access::sample > _SplatMap0 [[ texture(2) ]] ,
    texture2d<half, access::sample > _SplatMap1 [[ texture(3) ]] ,
    texture2d<half, access::sample > _MaskTex [[ texture(4) ]] ,
    texture2d<half, access::sample > _SplatMapLast0 [[ texture(5) ]] ,
    texture2d<half, access::sample > _SplatMapLast1 [[ texture(6) ]] ,
    texture2d<half, access::sample > _BlendSplatTex [[ texture(7) ]] ,
    texture2d<half, access::sample > _BlendSplatTex1 [[ texture(8) ]] ,
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float4 u_xlat0;
    half4 u_xlat16_0;
    float4 u_xlat1;
    half4 u_xlat16_1;
    bool3 u_xlatb1;
    float4 u_xlat2;
    half4 u_xlat16_2;
    half u_xlat16_3;
    float4 u_xlat4;
    half4 u_xlat16_4;
    half4 u_xlat16_5;
    float2 u_xlat6;
    half4 u_xlat16_6;
    half2 u_xlat16_7;
    float2 u_xlat9;
    half2 u_xlat16_9;
    half2 u_xlat16_11;
    float2 u_xlat16;
    half2 u_xlat16_16;
    float u_xlat24;
    u_xlat0.xy = fma(input.TEXCOORD0.xy, float2(1.0, 0.5), float2(0.25, 0.25));
    u_xlat16.xy = u_xlat0.xy * float2(FGlobals._NoiseTiling);
    u_xlat0.xy = fma(u_xlat0.xy, FGlobals._OffsetSize.zz, FGlobals._OffsetSize.yx);
    u_xlat16_16.xy = _NoiseMap.sample(sampler_NoiseMap, u_xlat16.xy).xz;
    u_xlat1.x = float(u_xlat16_16.x) * FGlobals._RoadSmoothInten;
    u_xlat9.xy = u_xlat0.yx + float2(300.0, 300.0);
    u_xlat9.xy = fma(u_xlat9.xy, float2(0.001666, 0.001666), float2(-0.000832999998, -0.000832999998));
    u_xlat1.x = fma(u_xlat9.x, 200.0, u_xlat1.x);
    u_xlat1.x = sin(u_xlat1.x);
    u_xlat2.x = fma(u_xlat1.x, FGlobals._SinX, u_xlat9.y);
    u_xlat16_3 = half(fma(u_xlat9.y, 200.0, 1.0));
    u_xlat1.x = fma(float(u_xlat16_16.x), FGlobals._RoadSmoothInten, float(u_xlat16_3));
    u_xlat1.x = sin(u_xlat1.x);
    u_xlat2.y = fma(u_xlat1.x, FGlobals._SinY, u_xlat9.x);
    u_xlat16_1.x = _BlendMap.sample(sampler_BlendMap, u_xlat9.yx, level(0.0)).y;
    u_xlat16_9.xy = _BlendMap.sample(sampler_BlendMap, u_xlat2.xy, level(0.0)).xz;
    u_xlat16_3 = u_xlat16_9.y + u_xlat16_9.x;
    u_xlat16_3 = u_xlat16_1.x + u_xlat16_3;
    u_xlat16_3 = clamp(u_xlat16_3, 0.0h, 1.0h);
    u_xlat16_3 = (-u_xlat16_3) + half(1.0);
    u_xlat1.x = float(u_xlat16_3) * FGlobals._EdgeBlend;
    u_xlat1.xy = fma(u_xlat1.xx, float2(6.0, 6.0), float2(u_xlat16_16.yx));
    u_xlat1.xy = clamp(u_xlat1.xy, 0.0f, 1.0f);
    u_xlat1.xy = u_xlat1.xy * float2(0.300000012, 0.5);
    u_xlat2 = (-FGlobals._Splat0Param0) + FGlobals._Splat0Param1;
    u_xlat2 = fma(float4(u_xlat16_16.xxxx), u_xlat2, FGlobals._Splat0Param0);
    u_xlat4 = (-u_xlat2) + FGlobals._Splat0Param2;
    u_xlat2 = fma(u_xlat1.xxxx, u_xlat4, u_xlat2);
    u_xlat16_4 = _SplatMap0.sample(sampler_SplatMap0, input.TEXCOORD0.xy, level(0.0));
    u_xlat4 = (-u_xlat2) + float4(u_xlat16_4);
    u_xlat16.x = float(u_xlat16_3) + FGlobals._RoadAlpha;
    u_xlat16.x = clamp(u_xlat16.x, 0.0f, 1.0f);
    u_xlat16_3 = u_xlat16_3 * half(100.0);
    u_xlat16_3 = min(u_xlat16_3, half(1.0));
    u_xlat16_3 = fma(u_xlat16_3, half(0.100000001), u_xlat16_16.y);
    u_xlat16_3 = clamp(u_xlat16_3, 0.0h, 1.0h);
    u_xlat2 = fma(u_xlat16.xxxx, u_xlat4, u_xlat2);
    u_xlat16_4 = _SplatMapLast0.sample(sampler_SplatMapLast0, input.TEXCOORD0.xy, level(0.0));
    u_xlat16_4 = half4((-u_xlat2) + float4(u_xlat16_4));
    u_xlat1.xz = u_xlat0.xy + (-FGlobals._MoveBuildBlendParams.xy);
    u_xlat0.xy = u_xlat0.xy + (-FGlobals._BuildBlendParams.xy);
    u_xlat0.xy = fma(FGlobals._BuildBlendParams.zz, float2(0.550000012, 0.550000012), u_xlat0.xy);
    u_xlat1.xz = fma(FGlobals._MoveBuildBlendParams.zz, float2(0.5, 0.5), u_xlat1.xz);
    u_xlat24 = float(1.0) / FGlobals._MoveBuildBlendParams.z;
    u_xlat16_11.xy = half2(fma((-u_xlat1.xz), float2(u_xlat24), float2(0.5, 0.5)));
    u_xlat16_11.xy = -abs(u_xlat16_11.xy) + half2(0.5, 0.5);
    u_xlatb1.xz = (u_xlat16_11.xy>=half2(0.0, 0.0));
    u_xlat16_11.x = (u_xlatb1.x) ? half(1.0) : half(0.0);
    u_xlat16_11.y = (u_xlatb1.z) ? half(1.0) : half(0.0);
    u_xlat16_11.x = u_xlat16_11.y * u_xlat16_11.x;
    u_xlat16_5 = _MaskTex.sample(sampler_MaskTex, input.TEXCOORD0.xy, level(0.0));
    u_xlat16_5 = fma(u_xlat16_11.xxxx, (-u_xlat16_5), u_xlat16_5);
    u_xlat16_6 = (-u_xlat16_5) + half4(1.0, 1.0, 1.0, 1.0);
    u_xlat24 = FGlobals._BuildBlendParams.z * 1.10000002;
    u_xlat24 = float(1.0) / u_xlat24;
    u_xlat16_11.xy = half2(fma((-u_xlat0.xy), float2(u_xlat24), float2(0.5, 0.5)));
    u_xlat0.xy = fma(u_xlat0.xy, float2(u_xlat24), float2(-0.5, -0.5));
    u_xlat16_11.xy = -abs(u_xlat16_11.xy) + half2(0.5, 0.5);
    u_xlatb1.xz = (u_xlat16_11.xy>=half2(0.0, 0.0));
    u_xlat16_11.x = (u_xlatb1.x) ? half(1.0) : half(0.0);
    u_xlat16_11.y = (u_xlatb1.z) ? half(1.0) : half(0.0);
    u_xlat16_11.x = u_xlat16_11.y * u_xlat16_11.x;
    u_xlat16_5 = fma(u_xlat16_11.xxxx, u_xlat16_6, u_xlat16_5);
    u_xlat16_2 = half4(fma(float4(u_xlat16_5.xxxx), float4(u_xlat16_4), u_xlat2));
    u_xlat6.x = dot(u_xlat0.xy, float2(-0.000203653181, -1.0));
    u_xlat6.y = dot(u_xlat0.xy, float2(1.0, -0.000203653181));
    u_xlat0.xy = u_xlat6.xy + float2(0.5, 0.5);
    u_xlat16_4 = _BlendSplatTex.sample(sampler_BlendSplatTex, u_xlat0.xy, level(0.0));
    u_xlat16_4 = (-u_xlat16_2) + u_xlat16_4;
    u_xlat16_11.xy = half2((-u_xlat0.xy) + float2(0.5, 0.5));
    u_xlat16_6 = _BlendSplatTex1.sample(sampler_BlendSplatTex1, u_xlat0.xy, level(0.0));
    u_xlat16_11.xy = -abs(u_xlat16_11.xy) + half2(0.5, 0.5);
    u_xlat16_11.xy = u_xlat16_11.xy * half2(8.0, 8.0);
    u_xlat16_11.xy = clamp(u_xlat16_11.xy, 0.0h, 1.0h);
    u_xlat16_7.xy = fma(u_xlat16_11.xy, half2(-2.0, -2.0), half2(3.0, 3.0));
    u_xlat16_11.xy = u_xlat16_11.xy * u_xlat16_11.xy;
    u_xlat16_11.xy = u_xlat16_11.xy * u_xlat16_7.xy;
    u_xlat16_11.x = u_xlat16_11.y * u_xlat16_11.x;
    u_xlat16_2 = fma(u_xlat16_11.xxxx, u_xlat16_4, u_xlat16_2);
    output.SV_Target0 = u_xlat16_2;
    u_xlat2 = (-FGlobals._Splat1Param0) + FGlobals._Splat1Param1;
    u_xlat2 = fma(float4(u_xlat16_3), u_xlat2, FGlobals._Splat1Param0);
    u_xlat4 = (-u_xlat2) + FGlobals._Splat1Param2;
    u_xlat1 = fma(u_xlat1.yyyy, u_xlat4, u_xlat2);
    u_xlat16_2 = _SplatMap1.sample(sampler_SplatMap1, input.TEXCOORD0.xy, level(0.0));
    u_xlat2 = (-u_xlat1) + float4(u_xlat16_2);
    u_xlat0 = fma(u_xlat16.xxxx, u_xlat2, u_xlat1);
    u_xlat16_1 = _SplatMapLast1.sample(sampler_SplatMapLast1, input.TEXCOORD0.xy, level(0.0));
    u_xlat16_1 = half4((-u_xlat0) + float4(u_xlat16_1));
    u_xlat16_0 = half4(fma(float4(u_xlat16_5.xxxx), float4(u_xlat16_1), u_xlat0));
    output.SV_Target2 = u_xlat16_5;
    u_xlat16_1 = (-u_xlat16_0) + u_xlat16_6;
    u_xlat16_0 = fma(u_xlat16_11.xxxx, u_xlat16_1, u_xlat16_0);
    output.SV_Target1 = u_xlat16_0;
    return output;
}
