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
    float FilmSlope ;
    float FilmToe ;
    float FilmShoulder ;
    float FilmBlackClip ;
    float FilmWhiteClip ;
    float BlueCorrection ;
    float ExpandGamut ;
};

struct Mtl_FragmentIn
{
    float2 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_Target0 [[ color(xlt_remap_o[0]) ]];
};

fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    float3 u_xlat0;
    bool u_xlatb0;
    float3 u_xlat1;
    half3 u_xlat16_1;
    int u_xlati1;
    bool2 u_xlatb1;
    float4 u_xlat2;
    half3 u_xlat16_2;
    float3 u_xlat3;
    int u_xlati3;
    half3 u_xlat16_4;
    float3 u_xlat5;
    float3 u_xlat6;
    bool3 u_xlatb6;
    bool3 u_xlatb7;
    float3 u_xlat8;
    float3 u_xlat9;
    bool u_xlatb9;
    float u_xlat16;
    float2 u_xlat17;
    float u_xlat24;
    half u_xlat16_24;
    bool u_xlatb24;
    bool u_xlatb25;
    float u_xlat27;
    float u_xlat29;
    float u_xlat30;
    u_xlat0.x = input.TEXCOORD0.x * 32.0;
    u_xlat0.x = floor(u_xlat0.x);
    u_xlat1.x = fma(input.TEXCOORD0.x, 32.0, (-u_xlat0.x));
    u_xlat0.z = u_xlat0.x * 0.0322580636;
    u_xlat1.y = input.TEXCOORD0.y;
    u_xlat1.xy = u_xlat1.xy + float2(-0.015625, -0.015625);
    u_xlat0.xy = u_xlat1.xy * float2(1.03225803, 1.03225803);
    u_xlat0.xyz = u_xlat0.xyz + float3(-0.434017599, -0.434017599, -0.434017599);
    u_xlat0.xyz = u_xlat0.xyz * float3(14.0, 14.0, 14.0);
    u_xlat0.xyz = exp2(u_xlat0.xyz);
    u_xlat0.xyz = fma(u_xlat0.xyz, float3(0.180000007, 0.180000007, 0.180000007), float3(-0.00266771927, -0.00266771927, -0.00266771927));
    u_xlat16_2.x = dot(float3(0.613191485, 0.33951208, 0.0473663323), u_xlat0.xyz);
    u_xlat16_2.y = dot(float3(0.0702069029, 0.916335821, 0.0134500116), u_xlat0.xyz);
    u_xlat16_2.z = dot(float3(0.0206188709, 0.109567292, 0.869606733), u_xlat0.xyz);
    u_xlat0.x = dot(half3(1.37041271, -0.329291314, -0.0636827648), u_xlat16_2.xyz);
    u_xlat0.y = dot(half3(-0.0834341869, 1.09709096, -0.0108615728), u_xlat16_2.xyz);
    u_xlat0.z = dot(half3(-0.0257932581, -0.0986256376, 1.20369434), u_xlat16_2.xyz);
    u_xlat0.xyz = (-float3(u_xlat16_2.xyz)) + u_xlat0.xyz;
    u_xlat16_24 = dot(u_xlat16_2.xyz, half3(0.272228718, 0.674081743, 0.0536895171));
    u_xlat16_1.xyz = u_xlat16_2.xyz / half3(u_xlat16_24);
    u_xlat16_24 = u_xlat16_24 * u_xlat16_24;
    u_xlat24 = float(u_xlat16_24) * FGlobals.ExpandGamut;
    u_xlat24 = u_xlat24 * -4.0;
    u_xlat24 = exp2(u_xlat24);
    u_xlat24 = (-u_xlat24) + 1.0;
    u_xlat16_1.xyz = u_xlat16_1.xyz + half3(-1.0, -1.0, -1.0);
    u_xlat16_1.x = dot(u_xlat16_1.xyz, u_xlat16_1.xyz);
    u_xlat16_1.x = u_xlat16_1.x * half(-4.0);
    u_xlat16_1.x = exp2(u_xlat16_1.x);
    u_xlat16_1.x = (-u_xlat16_1.x) + half(1.0);
    u_xlat24 = u_xlat24 * float(u_xlat16_1.x);
    u_xlat0.xyz = fma(float3(u_xlat24), u_xlat0.xyz, float3(u_xlat16_2.xyz));
    u_xlat1.x = dot(float3(0.938639402, 1.02359565e-10, 0.0613606237), u_xlat0.xyz);
    u_xlat1.y = dot(float3(8.36008554e-11, 0.830794156, 0.169205874), u_xlat0.xyz);
    u_xlat1.z = dot(float3(2.13187367e-12, -5.63307213e-12, 1.0), u_xlat0.xyz);
    u_xlat1.xyz = (-u_xlat0.xyz) + u_xlat1.xyz;
    u_xlat0.xyz = fma(float3(FGlobals.BlueCorrection), u_xlat1.xyz, u_xlat0.xyz);
    u_xlat9.x = dot(float3(0.695452213, 0.140678704, 0.163869068), u_xlat0.xyz);
    u_xlat9.y = dot(float3(0.0447945632, 0.859671116, 0.0955343172), u_xlat0.xyz);
    u_xlat9.z = dot(float3(-0.00552588236, 0.00402521016, 1.00150073), u_xlat0.xyz);
    u_xlat0.xyz = (-u_xlat9.yxz) + u_xlat9.zyx;
    u_xlat0.xy = u_xlat0.xy * u_xlat9.zy;
    u_xlat0.x = u_xlat0.y + u_xlat0.x;
    u_xlat0.x = fma(u_xlat9.x, u_xlat0.z, u_xlat0.x);
    u_xlat0.x = sqrt(u_xlat0.x);
    u_xlat8.x = u_xlat9.y + u_xlat9.z;
    u_xlat8.x = u_xlat9.x + u_xlat8.x;
    u_xlat0.x = fma(u_xlat0.x, 1.75, u_xlat8.x);
    u_xlat8.x = u_xlat0.x * 0.333333343;
    u_xlat8.x = 0.0799999982 / u_xlat8.x;
    u_xlat16 = min(u_xlat9.y, u_xlat9.x);
    u_xlat16 = min(u_xlat9.z, u_xlat16);
    u_xlat16 = max(u_xlat16, 1.00000001e-10);
    u_xlat24 = max(u_xlat9.y, u_xlat9.x);
    u_xlat24 = max(u_xlat9.z, u_xlat24);
    u_xlat3.xy = max(float2(u_xlat24), float2(1.00000001e-10, 0.00999999978));
    u_xlat16 = (-u_xlat16) + u_xlat3.x;
    u_xlat8.y = u_xlat16 / u_xlat3.y;
    u_xlat8.xz = u_xlat8.xy + float2(-0.5, -0.400000006);
    u_xlati1 = int((0.0<u_xlat8.z) ? 0xFFFFFFFFu : uint(0));
    u_xlati3 = int((u_xlat8.z<0.0) ? 0xFFFFFFFFu : uint(0));
    u_xlat24 = u_xlat8.z * 2.5;
    u_xlat24 = -abs(u_xlat24) + 1.0;
    u_xlat24 = max(u_xlat24, 0.0);
    u_xlat24 = fma((-u_xlat24), u_xlat24, 1.0);
    u_xlati1 = (-u_xlati1) + u_xlati3;
    u_xlat1.x = float(u_xlati1);
    u_xlat24 = fma(u_xlat1.x, u_xlat24, 1.0);
    u_xlat24 = u_xlat24 * 0.0250000004;
    u_xlat8.x = u_xlat8.x * u_xlat24;
    u_xlatb1.x = u_xlat0.x>=0.479999989;
    u_xlatb0 = 0.159999996>=u_xlat0.x;
    u_xlat8.x = (u_xlatb1.x) ? 0.0 : u_xlat8.x;
    u_xlat0.x = (u_xlatb0) ? u_xlat24 : u_xlat8.x;
    u_xlat0.x = u_xlat0.x + 1.0;
    u_xlat2.yzw = u_xlat0.xxx * u_xlat9.xyz;
    u_xlat8.x = fma((-u_xlat9.x), u_xlat0.x, 0.0299999993);
    u_xlat24 = fma(u_xlat9.y, u_xlat0.x, (-u_xlat2.w));
    u_xlat24 = u_xlat24 * 1.73205078;
    u_xlat1.x = fma(u_xlat2.y, 2.0, (-u_xlat2.z));
    u_xlat0.x = fma((-u_xlat9.z), u_xlat0.x, u_xlat1.x);
    u_xlat1.x = max(abs(u_xlat0.x), abs(u_xlat24));
    u_xlat1.x = float(1.0) / u_xlat1.x;
    u_xlat9.x = min(abs(u_xlat0.x), abs(u_xlat24));
    u_xlat1.x = u_xlat1.x * u_xlat9.x;
    u_xlat9.x = u_xlat1.x * u_xlat1.x;
    u_xlat17.x = fma(u_xlat9.x, 0.0208350997, -0.0851330012);
    u_xlat17.x = fma(u_xlat9.x, u_xlat17.x, 0.180141002);
    u_xlat17.x = fma(u_xlat9.x, u_xlat17.x, -0.330299497);
    u_xlat9.x = fma(u_xlat9.x, u_xlat17.x, 0.999866009);
    u_xlat17.x = u_xlat9.x * u_xlat1.x;
    u_xlat17.x = fma(u_xlat17.x, -2.0, 1.57079637);
    u_xlatb25 = abs(u_xlat0.x)<abs(u_xlat24);
    u_xlat17.x = u_xlatb25 ? u_xlat17.x : float(0.0);
    u_xlat1.x = fma(u_xlat1.x, u_xlat9.x, u_xlat17.x);
    u_xlatb9 = u_xlat0.x<(-u_xlat0.x);
    u_xlat9.x = u_xlatb9 ? -3.14159274 : float(0.0);
    u_xlat1.x = u_xlat9.x + u_xlat1.x;
    u_xlat9.x = min(u_xlat0.x, u_xlat24);
    u_xlat0.x = max(u_xlat0.x, u_xlat24);
    u_xlatb0 = u_xlat0.x>=(-u_xlat0.x);
    u_xlatb24 = u_xlat9.x<(-u_xlat9.x);
    u_xlatb0 = u_xlatb0 && u_xlatb24;
    u_xlat0.x = (u_xlatb0) ? (-u_xlat1.x) : u_xlat1.x;
    u_xlat0.x = u_xlat0.x * 57.2957802;
    u_xlatb1.xy = (u_xlat2.zw==u_xlat2.yz);
    u_xlatb24 = u_xlatb1.y && u_xlatb1.x;
    u_xlat0.x = (u_xlatb24) ? 0.0 : u_xlat0.x;
    u_xlatb24 = u_xlat0.x<0.0;
    u_xlat1.x = u_xlat0.x + 360.0;
    u_xlat0.x = (u_xlatb24) ? u_xlat1.x : u_xlat0.x;
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlat0.x = min(u_xlat0.x, 360.0);
    u_xlatb24 = 180.0<u_xlat0.x;
    u_xlat1.x = u_xlat0.x + -360.0;
    u_xlat0.x = (u_xlatb24) ? u_xlat1.x : u_xlat0.x;
    u_xlat0.x = u_xlat0.x * 0.0148148146;
    u_xlat0.x = -abs(u_xlat0.x) + 1.0;
    u_xlat0.x = max(u_xlat0.x, 0.0);
    u_xlat24 = fma(u_xlat0.x, -2.0, 3.0);
    u_xlat0.x = u_xlat0.x * u_xlat0.x;
    u_xlat0.x = u_xlat0.x * u_xlat24;
    u_xlat16_4.x = half(u_xlat0.x * u_xlat0.x);
    u_xlat0.x = u_xlat8.y * float(u_xlat16_4.x);
    u_xlat0.x = u_xlat8.x * u_xlat0.x;
    u_xlat2.x = fma(u_xlat0.x, 0.180000007, u_xlat2.y);
    u_xlat0.x = dot(float3(1.45143926, -0.236510754, -0.214928567), u_xlat2.xzw);
    u_xlat0.y = dot(float3(-0.0765537769, 1.17622972, -0.0996759236), u_xlat2.xzw);
    u_xlat0.z = dot(float3(0.00831614807, -0.00603244966, 0.997716308), u_xlat2.xzw);
    u_xlat0.xyz = max(u_xlat0.xyz, float3(0.0, 0.0, 0.0));
    u_xlat24 = dot(u_xlat0.xyz, float3(0.272228718, 0.674081743, 0.0536895171));
    u_xlat0.xyz = (-float3(u_xlat24)) + u_xlat0.xyz;
    u_xlat0.xyz = fma(u_xlat0.xyz, float3(0.959999979, 0.959999979, 0.959999979), float3(u_xlat24));
    u_xlat0.xyz = log2(u_xlat0.xyz);
    u_xlat1.xy = float2(FGlobals.FilmBlackClip) + float2(1.0, 0.180000007);
    u_xlat24 = u_xlat1.x + (-FGlobals.FilmToe);
    u_xlat1.x = u_xlat1.y / u_xlat24;
    u_xlat9.x = u_xlat1.x + -1.0;
    u_xlat9.x = (-u_xlat9.x) + 1.0;
    u_xlat1.x = u_xlat1.x / u_xlat9.x;
    u_xlat1.x = log2(u_xlat1.x);
    u_xlat1.x = u_xlat1.x * 0.346573591;
    u_xlat9.x = u_xlat24 / FGlobals.FilmSlope;
    u_xlat1.x = fma((-u_xlat1.x), u_xlat9.x, -0.744727492);
    u_xlatb9 = 0.800000012<FGlobals.FilmToe;
    u_xlat17.xy = (-float2(FGlobals.FilmToe)) + float2(0.819999993, 1.0);
    u_xlat17.xy = u_xlat17.xy / float2(FGlobals.FilmSlope);
    u_xlat17.x = u_xlat17.x + -0.744727492;
    u_xlat1.x = (u_xlatb9) ? u_xlat17.x : u_xlat1.x;
    u_xlat3.xyz = fma(u_xlat0.xyz, float3(0.30103001, 0.30103001, 0.30103001), (-u_xlat1.xxx));
    u_xlat9.x = FGlobals.FilmSlope * -2.0;
    u_xlat9.x = u_xlat9.x / u_xlat24;
    u_xlat24 = u_xlat24 + u_xlat24;
    u_xlat5.xyz = u_xlat3.xyz * u_xlat9.xxx;
    u_xlat5.xyz = u_xlat5.xyz * float3(1.44269502, 1.44269502, 1.44269502);
    u_xlat5.xyz = exp2(u_xlat5.xyz);
    u_xlat5.xyz = u_xlat5.xyz + float3(1.0, 1.0, 1.0);
    u_xlat5.xyz = float3(u_xlat24) / u_xlat5.xyz;
    u_xlat5.xyz = u_xlat5.xyz + (-float3(FGlobals.FilmBlackClip));
    u_xlat24 = (-u_xlat1.x) + u_xlat17.y;
    u_xlat9.xyz = fma(u_xlat0.xyz, float3(0.30103001, 0.30103001, 0.30103001), float3(u_xlat24));
    u_xlat9.xyz = u_xlat9.xyz * float3(FGlobals.FilmSlope);
    u_xlat6.xyz = u_xlat0.xyz * float3(0.30103001, 0.30103001, 0.30103001);
    u_xlatb7.xyz = (u_xlat6.xyz<u_xlat1.xxx);
    {
        float3 hlslcc_movcTemp = u_xlat5;
        hlslcc_movcTemp.x = (u_xlatb7.x) ? u_xlat5.x : u_xlat9.x;
        hlslcc_movcTemp.y = (u_xlatb7.y) ? u_xlat5.y : u_xlat9.y;
        hlslcc_movcTemp.z = (u_xlatb7.z) ? u_xlat5.z : u_xlat9.z;
        u_xlat5 = hlslcc_movcTemp;
    }
    u_xlat27 = FGlobals.FilmShoulder / FGlobals.FilmSlope;
    u_xlat24 = (-u_xlat24) + u_xlat27;
    u_xlat0.xyz = fma(u_xlat0.xyz, float3(0.30103001, 0.30103001, 0.30103001), (-float3(u_xlat24)));
    u_xlat27 = FGlobals.FilmSlope + FGlobals.FilmSlope;
    u_xlat29 = FGlobals.FilmWhiteClip + 1.0;
    u_xlat30 = u_xlat29 + (-FGlobals.FilmShoulder);
    u_xlat27 = u_xlat27 / u_xlat30;
    u_xlat30 = u_xlat30 + u_xlat30;
    u_xlat0.xyz = u_xlat0.xyz * float3(u_xlat27);
    u_xlat0.xyz = u_xlat0.xyz * float3(1.44269502, 1.44269502, 1.44269502);
    u_xlat0.xyz = exp2(u_xlat0.xyz);
    u_xlat0.xyz = u_xlat0.xyz + float3(1.0, 1.0, 1.0);
    u_xlat0.xyz = float3(u_xlat30) / u_xlat0.xyz;
    u_xlat0.xyz = (-u_xlat0.xyz) + float3(u_xlat29);
    u_xlatb6.xyz = (float3(u_xlat24)<u_xlat6.xyz);
    {
        float3 hlslcc_movcTemp = u_xlat0;
        hlslcc_movcTemp.x = (u_xlatb6.x) ? u_xlat0.x : u_xlat9.x;
        hlslcc_movcTemp.y = (u_xlatb6.y) ? u_xlat0.y : u_xlat9.y;
        hlslcc_movcTemp.z = (u_xlatb6.z) ? u_xlat0.z : u_xlat9.z;
        u_xlat0 = hlslcc_movcTemp;
    }
    u_xlat0.xyz = (-u_xlat5.xyz) + u_xlat0.xyz;
    u_xlat9.x = (-u_xlat1.x) + u_xlat24;
    u_xlatb24 = u_xlat24<u_xlat1.x;
    u_xlat1.xyz = u_xlat3.xyz / u_xlat9.xxx;
    u_xlat1.xyz = clamp(u_xlat1.xyz, 0.0f, 1.0f);
    u_xlat3.xyz = (-u_xlat1.xyz) + float3(1.0, 1.0, 1.0);
    u_xlat1.xyz = (bool(u_xlatb24)) ? u_xlat3.xyz : u_xlat1.xyz;
    u_xlat3.xyz = fma((-u_xlat1.xyz), float3(2.0, 2.0, 2.0), float3(3.0, 3.0, 3.0));
    u_xlat1.xyz = u_xlat1.xyz * u_xlat1.xyz;
    u_xlat1.xyz = u_xlat3.xyz * u_xlat1.xyz;
    u_xlat0.xyz = fma(u_xlat1.xyz, u_xlat0.xyz, u_xlat5.xyz);
    u_xlat24 = dot(u_xlat0.xyz, float3(0.272228718, 0.674081743, 0.0536895171));
    u_xlat0.xyz = (-float3(u_xlat24)) + u_xlat0.xyz;
    u_xlat0.xyz = fma(u_xlat0.xyz, float3(0.930000007, 0.930000007, 0.930000007), float3(u_xlat24));
    u_xlat0.xyz = max(u_xlat0.xyz, float3(0.0, 0.0, 0.0));
    u_xlat1.x = dot(float3(1.06537485, 1.44678506e-06, -0.0653710067), u_xlat0.xyz);
    u_xlat1.y = dot(float3(-3.45525592e-07, 1.20366347, -0.203667715), u_xlat0.xyz);
    u_xlat1.z = dot(float3(1.9865448e-08, 2.12079581e-08, 0.999999583), u_xlat0.xyz);
    u_xlat1.xyz = (-u_xlat0.xyz) + u_xlat1.xyz;
    u_xlat0.xyz = fma(float3(FGlobals.BlueCorrection), u_xlat1.xyz, u_xlat0.xyz);
    u_xlat16_4.x = dot(float3(1.70505154, -0.621790707, -0.0832583979), u_xlat0.xyz);
    u_xlat16_4.y = dot(float3(-0.130257145, 1.14080286, -0.0105485283), u_xlat0.xyz);
    u_xlat16_4.z = dot(float3(-0.0240032747, -0.128968775, 1.15297174), u_xlat0.xyz);
    u_xlat16_4.xyz = max(u_xlat16_4.xyz, half3(0.0, 0.0, 0.0));
    u_xlat16_4.xyz = log2(u_xlat16_4.xyz);
    u_xlat16_4.xyz = u_xlat16_4.xyz * half3(0.454545468, 0.454545468, 0.454545468);
    u_xlat16_4.xyz = exp2(u_xlat16_4.xyz);
    output.SV_Target0.xyz = u_xlat16_4.xyz * half3(0.952381015, 0.952381015, 0.952381015);
    output.SV_Target0.w = half(0.952381015);
    return output;
}
