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
    half4 _MainTex_ST ;
    half4 _MainTex_TexelSize ;
    half4 _TintColorHDR ;
    half4 _RoughnessScale ;
    half _OpacityMaskClipValue ;
    half _MipScale ;
    half _VertexOcclusionIntensity ;
    half4 _HueVariation ;
    half4 _SnowColor ;
    half _SnowLevel ;
    half _SnowNoise ;
    half _SnowNoiseInvert ;
    half _SnowIntensity ;
    half _SnowWetness ;
    half _SnowOcclusion ;
    half _ShowSnowDirectly ;
    float _ShadowAmount ;
    half4 gLightBuffer [115];
    float4 gShadowParams0 [6];
    half gShadowmapFuncEnabled ;
    half gShadowEnableDynamicShadow ;
    half _WeatherSplitOn ;
    float4 CloudSpeed ;
    float4 CloudParam ;
    float4 CloudOffset ;
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
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    half3 TEXCOORD5 [[ user(TEXCOORD5) ]] ;
    half TEXCOORD9 [[ user(TEXCOORD9) ]] ;
    half4 TEXCOORD7 [[ user(TEXCOORD7) ]] ;
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]] ;
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]] ;
    half4 TEXCOORD20 [[ user(TEXCOORD20) ]] ;
};

struct Mtl_FragmentOut
{
    half4 SV_TARGET0 [[ color(xlt_remap_o[0]) ]];
    float SV_Target1 [[ color(xlt_remap_o[1]) ]];
};

constexpr sampler _mtl_xl_shadow_sampler(address::clamp_to_edge, filter::linear, compare_func::greater_equal);
fragment Mtl_FragmentOut xlatMtlMain(
    constant FGlobals_Type& FGlobals [[ buffer(0) ]],
    constant UnityPerCamera_Type& UnityPerCamera [[ buffer(1) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_NormalTex [[ sampler (1) ]],
    sampler samplerCloudTex [[ sampler (2) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(1) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(2) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(3) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(4) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_linear_clamp_compare_sampler(compare_func::greater_equal,filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float3 u_xlat0;
    half4 u_xlat16_0;
    bool u_xlatb0;
    half4 u_xlat16_1;
    half3 u_xlat16_2;
    half3 u_xlat16_3;
    float4 u_xlat4;
    half4 u_xlat16_4;
    half4 u_xlat16_5;
    float3 u_xlat6;
    half3 u_xlat16_6;
    float3 u_xlat7;
    float3 u_xlat8;
    half3 u_xlat16_8;
    bool2 u_xlatb8;
    bool2 u_xlatb9;
    float u_xlat10;
    half u_xlat16_10;
    bool u_xlatb10;
    half u_xlat16_13;
    half3 u_xlat16_15;
    float u_xlat20;
    half u_xlat16_20;
    bool u_xlatb20;
    half2 u_xlat16_21;
    half u_xlat16_23;
    half2 u_xlat16_24;
    bool2 u_xlatb28;
    float u_xlat30;
    half u_xlat16_30;
    half u_xlat16_31;
    half u_xlat16_32;
    half u_xlat16_33;
    half u_xlat16_34;
    float u_xlat36;
    half u_xlat16_36;
    half u_xlat10_36;
    bool u_xlatb36;
    float u_xlat37;
    half u_xlat16_37;
    half u_xlat10_37;
    bool u_xlatb37;
    bool u_xlatb38;
    u_xlat0.x = input.TEXCOORD0.w;
    u_xlat0.y = input.TEXCOORD1.w;
    u_xlat16_1.xy = half2(fma(u_xlat0.xy, float2(FGlobals._MainTex_ST.xy), float2(FGlobals._MainTex_ST.zw)));
    u_xlat16_0 = _MainTex.sample(sampler_MainTex, float2(u_xlat16_1.xy));
    u_xlat16_2.xyz = (-u_xlat16_0.xyz) + FGlobals._HueVariation.xyz;
    u_xlat16_2.xyz = fma(input.TEXCOORD9, u_xlat16_2.xyz, u_xlat16_0.xyz);
    u_xlat16_21.x = max(u_xlat16_0.z, u_xlat16_0.y);
    u_xlat16_21.x = max(u_xlat16_0.x, u_xlat16_21.x);
    u_xlat16_31 = max(u_xlat16_2.z, u_xlat16_2.y);
    u_xlat16_31 = max(u_xlat16_31, u_xlat16_2.x);
    u_xlat16_21.x = u_xlat16_21.x / u_xlat16_31;
    u_xlat16_21.x = fma(u_xlat16_21.x, half(0.5), half(0.5));
    u_xlat16_2.xyz = u_xlat16_21.xxx * u_xlat16_2.xyz;
    u_xlat16_2.xyz = clamp(u_xlat16_2.xyz, 0.0h, 1.0h);
    u_xlat16_3.xyz = u_xlat16_2.xyz * FGlobals._TintColorHDR.xyz;
    u_xlat16_21.xy = u_xlat16_1.xy * FGlobals._MainTex_TexelSize.zw;
    u_xlat16_4.xy = dfdx(u_xlat16_21.xy);
    u_xlat16_21.xy = dfdy(u_xlat16_21.xy);
    u_xlat16_32 = dot(u_xlat16_4.xy, u_xlat16_4.xy);
    u_xlat16_21.x = dot(u_xlat16_21.xy, u_xlat16_21.xy);
    u_xlat16_21.x = max(u_xlat16_21.x, u_xlat16_32);
    u_xlat16_21.x = log2(u_xlat16_21.x);
    u_xlat16_21.x = u_xlat16_21.x * half(0.5);
    u_xlat16_21.x = max(u_xlat16_21.x, half(0.0));
    u_xlat16_21.x = fma(u_xlat16_21.x, FGlobals._MipScale, half(1.0));
    u_xlat0.x = float(u_xlat16_0.w) * float(u_xlat16_21.x);
    u_xlat16_10 = fma(u_xlat16_0.w, u_xlat16_21.x, (-FGlobals._OpacityMaskClipValue));
    u_xlat20 = dfdx(u_xlat0.x);
    u_xlat0.x = dfdy(u_xlat0.x);
    u_xlat0.x = abs(u_xlat0.x) + abs(u_xlat20);
    u_xlat0.x = max(u_xlat0.x, 9.99999975e-05);
    u_xlat0.x = float(u_xlat16_10) / u_xlat0.x;
    u_xlat0.x = u_xlat0.x + 0.5;
    u_xlat16_1 = _NormalTex.sample(sampler_NormalTex, float2(u_xlat16_1.xy));
    u_xlat16_32 = u_xlat16_1.z + u_xlat16_1.z;
    u_xlat16_4.yz = fma(u_xlat16_1.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_4.xw = (-u_xlat16_4.zz);
    u_xlat16_33 = dot(u_xlat16_4.yw, u_xlat16_4.yw);
    u_xlat16_33 = min(u_xlat16_33, half(1.0));
    u_xlat16_33 = (-u_xlat16_33) + half(1.0);
    u_xlat16_33 = sqrt(u_xlat16_33);
    u_xlatb10 = half(0.0)!=FGlobals._WeatherSplitOn;
    u_xlatb20 = input.TEXCOORD20.z<input.TEXCOORD20.w;
    u_xlat16_15.yz = input.TEXCOORD20.zw * half2(0.5, 1.0);
    u_xlat16_24.x = fma((-input.TEXCOORD20.z), half(0.5), half(1.0));
    u_xlat16_15.x = (u_xlatb20) ? input.TEXCOORD20.y : u_xlat16_24.x;
    u_xlat16_24.x = dot(FGlobals._RoughnessScale.xyz, u_xlat16_15.xyz);
    u_xlatb20 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_15.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_34 = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_15.x = (u_xlatb20) ? FGlobals.gLightBuffer[8].x : u_xlat16_34;
    u_xlat16_24.y = dot(FGlobals._RoughnessScale.xyz, u_xlat16_15.xyz);
    u_xlat16_24.xy = u_xlat16_1.zz * u_xlat16_24.xy;
    u_xlat16_24.x = (u_xlatb10) ? u_xlat16_24.x : u_xlat16_24.y;
    u_xlat16_34 = input.TEXCOORD5.y + (-FGlobals._SnowLevel);
    u_xlat16_34 = u_xlat16_34 / FGlobals._SnowWetness;
    u_xlat16_34 = clamp(u_xlat16_34, 0.0h, 1.0h);
    u_xlat16_5.x = u_xlat16_1.z + FGlobals._SnowNoiseInvert;
    u_xlat16_32 = fma((-u_xlat16_32), FGlobals._SnowNoiseInvert, u_xlat16_5.x);
    u_xlat16_32 = log2(u_xlat16_32);
    u_xlat16_32 = u_xlat16_32 * FGlobals._SnowNoise;
    u_xlat16_32 = exp2(u_xlat16_32);
    u_xlat16_32 = u_xlat16_32 * FGlobals._SnowIntensity;
    u_xlat16_32 = u_xlat16_32 * u_xlat16_34;
    u_xlat16_34 = log2(input.TEXCOORD2.w);
    u_xlat16_34 = u_xlat16_34 * FGlobals._SnowOcclusion;
    u_xlat16_34 = exp2(u_xlat16_34);
    u_xlat16_32 = u_xlat16_32 * u_xlat16_34;
    u_xlat16_32 = clamp(u_xlat16_32, 0.0h, 1.0h);
    u_xlatb20 = FGlobals._ShowSnowDirectly<half(1.0);
    u_xlat16_34 = u_xlat16_32 * input.TEXCOORD20.w;
    u_xlat16_5.x = u_xlat16_32 * FGlobals.gLightBuffer[8].z;
    u_xlat16_34 = (u_xlatb10) ? u_xlat16_34 : u_xlat16_5.x;
    u_xlat16_32 = (u_xlatb20) ? u_xlat16_34 : u_xlat16_32;
    u_xlat16_34 = (-u_xlat16_32) + half(1.0);
    u_xlat16_34 = fma(FGlobals._RoughnessScale.w, u_xlat16_32, u_xlat16_34);
    u_xlat16_24.x = u_xlat16_34 * u_xlat16_24.x;
    u_xlat16_2.xyz = fma((-u_xlat16_2.xyz), FGlobals._TintColorHDR.xyz, FGlobals._SnowColor.xyz);
    u_xlat16_2.xyz = fma(half3(u_xlat16_32), u_xlat16_2.xyz, u_xlat16_3.xyz);
    u_xlat16_32 = max(u_xlat16_24.x, half(0.119999997));
    u_xlat16_32 = min(u_xlat16_32, half(1.0));
    u_xlat16_3.x = half(u_xlat0.x + (-float(FGlobals._OpacityMaskClipValue)));
    u_xlatb0 = u_xlat16_3.x<half(0.0);
    if(((int(u_xlatb0) * int(0xffffffffu)))!=0){discard_fragment();}
    u_xlat16_3.xyz = u_xlat16_4.xxx * input.TEXCOORD4.xyz;
    u_xlat16_3.xyz = fma(input.TEXCOORD3.xyz, u_xlat16_4.yyy, u_xlat16_3.xyz);
    u_xlat16_3.xyz = fma(input.TEXCOORD5.xyz, half3(u_xlat16_33), u_xlat16_3.xyz);
    u_xlat16_0.x = dot(u_xlat16_3.xyz, u_xlat16_3.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * u_xlat16_3.xyz;
    u_xlat6.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat30 = dot(u_xlat6.xyz, u_xlat6.xyz);
    u_xlat30 = max(u_xlat30, 0.00100000005);
    u_xlat30 = rsqrt(u_xlat30);
    u_xlat7.xyz = float3(u_xlat30) * u_xlat6.xyz;
    u_xlatb36 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb36){
        u_xlat8.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat36 = min(u_xlat8.z, 0.999000013);
        u_xlat36 = u_xlat36 + FGlobals.gShadowParams0[4].z;
        u_xlat36 = (-u_xlat36) + 1.0;
        u_xlat10_37 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat8.xy, saturate(u_xlat36), level(0.0)));
        u_xlatb28.xy = (float2(1.0, 1.0)<u_xlat8.xy);
        u_xlatb28.x = u_xlatb28.y || u_xlatb28.x;
        u_xlatb9.xy = (u_xlat8.xy<float2(0.0, 0.0));
        u_xlatb38 = u_xlatb9.y || u_xlatb9.x;
        u_xlatb28.x = u_xlatb38 || u_xlatb28.x;
        u_xlat16_3.x = (u_xlatb28.x) ? half(1.0) : half(0.0);
        u_xlat16_3.x = half(max(float(u_xlat10_37), float(u_xlat16_3.x)));
        u_xlatb37 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb37){
            u_xlat8.xy = fma(u_xlat8.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_36 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat8.xy, saturate(u_xlat36), level(0.0)));
            u_xlatb28.xy = (float2(1.0, 1.0)<u_xlat8.xy);
            u_xlatb37 = u_xlatb28.y || u_xlatb28.x;
            u_xlatb8.xy = (u_xlat8.xy<float2(0.0, 0.0));
            u_xlatb8.x = u_xlatb8.y || u_xlatb8.x;
            u_xlatb37 = u_xlatb37 || u_xlatb8.x;
            u_xlat16_13 = (u_xlatb37) ? half(1.0) : half(0.0);
            u_xlat16_13 = half(max(float(u_xlat10_36), float(u_xlat16_13)));
            u_xlat16_3.x = min(u_xlat16_3.x, u_xlat16_13);
        }
        u_xlatb36 = input.TEXCOORD0.y<-30.0;
        u_xlat16_3.x = (u_xlatb36) ? half(1.0) : u_xlat16_3.x;
    } else {
        u_xlat16_3.x = half(1.0);
    }
    u_xlat4 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat4 = fma(u_xlat4, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat4 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat4);
    u_xlat16_36 = CloudTex.sample(samplerCloudTex, u_xlat4.xy).y;
    u_xlat16_37 = CloudTex.sample(samplerCloudTex, u_xlat4.zw).w;
    u_xlat16_13 = u_xlat16_37 * half(0.5);
    u_xlat16_13 = fma(u_xlat16_36, half(0.5), u_xlat16_13);
    u_xlat16_36 = fma((-u_xlat16_13), u_xlat16_13, u_xlat16_13);
    u_xlat37 = fma((-float(u_xlat16_13)), float(u_xlat16_13), FGlobals.CloudParam.y);
    u_xlat16_36 = half(1.0) / u_xlat16_36;
    u_xlat36 = float(u_xlat16_36) * u_xlat37;
    u_xlat36 = clamp(u_xlat36, 0.0f, 1.0f);
    u_xlat37 = fma(u_xlat36, -2.0, 3.0);
    u_xlat36 = u_xlat36 * u_xlat36;
    u_xlat36 = u_xlat36 * u_xlat37;
    u_xlat36 = fma((-u_xlat36), FGlobals.CloudParam.z, 1.0);
    u_xlat36 = clamp(u_xlat36, 0.0f, 1.0f);
    u_xlatb37 = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_13 = (u_xlatb37) ? half(u_xlat36) : half(1.0);
    u_xlat16_3.x = min(u_xlat16_13, u_xlat16_3.x);
    u_xlat16_13 = dot(float3(u_xlat16_0.xyz), u_xlat7.xyz);
    u_xlat16_5.xyz = fma(half3(u_xlat16_32), half3(-1.0, -0.0274999999, 0.25), half3(1.0, 0.0425000004, 0.25));
    u_xlat16_23 = u_xlat16_5.x * u_xlat16_5.x;
    u_xlat16_33 = u_xlat16_13 * half(-9.27999973);
    u_xlat16_33 = exp2(u_xlat16_33);
    u_xlat16_23 = min(u_xlat16_33, u_xlat16_23);
    u_xlat16_23 = fma(u_xlat16_23, u_xlat16_5.x, u_xlat16_5.y);
    u_xlat7.xyz = float3(u_xlat16_2.xyz) * input.TEXCOORD8.xyz;
    u_xlat36 = FGlobals._ShadowAmount * FGlobals.gShadowParams0[5].z;
    u_xlat16_8.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_5.xyw = half3(fma(u_xlat6.xyz, float3(u_xlat30), float3(FGlobals.gLightBuffer[11].xyz)));
    u_xlat16_30 = dot(u_xlat16_5.xyw, u_xlat16_5.xyw);
    u_xlat16_30 = max(u_xlat16_30, half(0.00100000005));
    u_xlat16_30 = rsqrt(u_xlat16_30);
    u_xlat16_6.xyz = half3(u_xlat16_30) * u_xlat16_5.xyw;
    u_xlat16_30 = dot(u_xlat16_0.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_30 = max(u_xlat16_30, half(0.0));
    u_xlat16_33 = dot(u_xlat16_0.xyz, u_xlat16_6.xyz);
    u_xlat16_33 = max(u_xlat16_33, half(0.0));
    u_xlatb0 = u_xlat16_13>=half(0.0);
    u_xlat16_10 = fma((-u_xlat16_33), u_xlat16_33, half(1.0));
    u_xlat16_32 = u_xlat16_32 * u_xlat16_32;
    u_xlat16_20 = u_xlat16_32 * u_xlat16_33;
    u_xlat16_10 = fma(u_xlat16_20, u_xlat16_20, u_xlat16_10);
    u_xlat16_10 = u_xlat16_32 / u_xlat16_10;
    u_xlat16_10 = u_xlat16_10 * u_xlat16_10;
    u_xlat16_10 = min(u_xlat16_10, half(128.0));
    u_xlat16_10 = u_xlat16_10 * u_xlat16_5.z;
    u_xlat10 = float(u_xlat16_10) * float(u_xlat16_23);
    u_xlat0.x = u_xlatb0 ? u_xlat10 : float(0.0);
    u_xlat0.xyz = u_xlat0.xxx + float3(u_xlat16_2.xyz);
    u_xlat0.xyz = float3(u_xlat16_30) * u_xlat0.xyz;
    u_xlat0.xyz = float3(u_xlat16_8.xyz) * u_xlat0.xyz;
    u_xlat6.xyz = fma(u_xlat0.xyz, float3(u_xlat16_3.xxx), (-u_xlat0.xyz));
    u_xlat0.xyz = fma(float3(u_xlat36), u_xlat6.xyz, u_xlat0.xyz);
    u_xlat0.xyz = fma(u_xlat7.xyz, float3(FGlobals.gLightBuffer[9].xyz), u_xlat0.xyz);
    u_xlat16_2.xyz = half3(float3(u_xlat16_1.www) * u_xlat0.xyz);
    u_xlat16_32 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_32 = min(u_xlat16_32, half(1.0));
    u_xlat16_3.x = (-u_xlat16_32) + half(1.0);
    u_xlat16_32 = fma(FGlobals._VertexOcclusionIntensity, u_xlat16_3.x, u_xlat16_32);
    u_xlat16_2.xyz = half3(u_xlat16_32) * u_xlat16_2.xyz;
    output.SV_TARGET0.xyz = fma(u_xlat16_2.xyz, input.TEXCOORD7.www, input.TEXCOORD7.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
