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
    half4 gLightBuffer [115];
    float4 gLightPosition [32];
    half4 gFogParams [9];
    float4 gShadowParams0 [6];
    half gShadowmapFuncEnabled ;
    half _SpecCubePower ;
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

struct UnityPerMaterial_Type
{
    half4 _MainTex_ST ;
    half4 _TintColor ;
    half4 _BackColor ;
    half4 _FrontColor ;
    half _NormalStrength ;
    half _RoughnessMin ;
    half _RoughnessMax ;
    half _OcclusionStrength ;
    half _ColorIntensity ;
    half _TextureLodBias ;
    half _VertexOcclusionIntensity ;
    half _PointLightFactor ;
    half _LightLayerMask ;
    half2 _MetallicRange ;
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    half3 TEXCOORD5 [[ user(TEXCOORD5) ]] ;
    half TEXCOORD10 [[ user(TEXCOORD10) ]] ;
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]] ;
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]] ;
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
    constant UnityPerMaterial_Type& UnityPerMaterial [[ buffer(2) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_NormalTex [[ sampler (1) ]],
    sampler sampler_2DSpecCube0 [[ sampler (2) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(1) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(2) ]] ,
    texture2d<half, access::sample > _2DSpecCube0 [[ texture(3) ]] ,
    float4 mtl_FragCoord [[ position ]],
    bool mtl_FrontFace [[ front_facing ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_linear_clamp_compare_sampler(compare_func::greater_equal,filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float3 u_xlat0;
    half3 u_xlat16_0;
    float3 u_xlat1;
    half4 u_xlat16_1;
    half4 u_xlat16_2;
    uint4 u_xlatu2;
    half3 u_xlat16_3;
    half3 u_xlat16_4;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    float3 u_xlat7;
    half3 u_xlat16_7;
    float4 u_xlat8;
    half3 u_xlat16_8;
    int4 u_xlati8;
    uint2 u_xlatu8;
    bool2 u_xlatb8;
    half3 u_xlat16_9;
    float3 u_xlat10;
    half3 u_xlat16_10;
    float3 u_xlat11;
    half3 u_xlat16_12;
    half3 u_xlat16_13;
    half3 u_xlat16_17;
    half u_xlat16_18;
    half2 u_xlat16_20;
    half u_xlat16_24;
    half u_xlat16_32;
    float u_xlat36;
    half u_xlat16_36;
    int u_xlati36;
    bool2 u_xlatb36;
    float u_xlat42;
    float u_xlat43;
    half u_xlat16_43;
    half u_xlat10_43;
    int u_xlati43;
    bool u_xlatb43;
    half u_xlat16_45;
    half u_xlat16_46;
    half u_xlat16_47;
    half u_xlat16_48;
    half u_xlat16_49;
    int u_xlati49;
    bool u_xlatb49;
    float u_xlat50;
    half u_xlat16_50;
    int u_xlati50;
    half u_xlat16_52;
    u_xlat0.x = ((mtl_FrontFace ? 0xffffffffu : uint(0)) != uint(0)) ? 1.0 : -1.0;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat16_2.xy = half2(fma(u_xlat1.xy, float2(UnityPerMaterial._MainTex_ST.xy), float2(UnityPerMaterial._MainTex_ST.zw)));
    u_xlat16_1 = _MainTex.sample(sampler_MainTex, float2(u_xlat16_2.xy));
    u_xlat16_2 = _NormalTex.sample(sampler_NormalTex, float2(u_xlat16_2.xy));
    u_xlat16_3.xy = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_3.z = (-u_xlat16_3.y);
    u_xlat16_17.x = dot(u_xlat16_3.xz, u_xlat16_3.xz);
    u_xlat16_17.x = min(u_xlat16_17.x, half(1.0));
    u_xlat16_17.x = (-u_xlat16_17.x) + half(1.0);
    u_xlat16_4.z = sqrt(u_xlat16_17.x);
    u_xlat16_4.xy = u_xlat16_3.xz * half2(UnityPerMaterial._NormalStrength);
    u_xlat16_3.x = (-UnityPerMaterial._MetallicRange.xxyx.y) + UnityPerMaterial._MetallicRange.xxyx.z;
    u_xlat16_3.x = fma(u_xlat16_2.w, u_xlat16_3.x, UnityPerMaterial._MetallicRange.xxyx.y);
    u_xlat16_17.xyz = u_xlat16_1.xyz * UnityPerMaterial._TintColor.xyz;
    u_xlat16_17.xyz = u_xlat16_17.xyz * half3(UnityPerMaterial._ColorIntensity);
    u_xlat16_5.xyz = (uint((mtl_FrontFace ? 0xffffffffu : uint(0))) != uint(0)) ? UnityPerMaterial._FrontColor.xyz : UnityPerMaterial._BackColor.xyz;
    u_xlat16_6.xyz = u_xlat16_17.xyz * u_xlat16_5.xyz;
    u_xlat16_46 = u_xlat16_1.w + half(-1.0);
    u_xlat16_46 = fma(UnityPerMaterial._OcclusionStrength, u_xlat16_46, half(1.0));
    u_xlat16_47 = (-UnityPerMaterial._RoughnessMin) + UnityPerMaterial._RoughnessMax;
    u_xlat16_47 = fma(u_xlat16_2.z, u_xlat16_47, UnityPerMaterial._RoughnessMin);
    u_xlat16_47 = max(u_xlat16_47, half(0.119999997));
    u_xlat16_47 = min(u_xlat16_47, half(1.0));
    u_xlat0.xyz = u_xlat0.xxx * float3(u_xlat16_4.xyz);
    u_xlat16_4.xyz = half3(u_xlat0.yyy * float3(input.TEXCOORD4.xyz));
    u_xlat16_4.xyz = half3(fma(float3(input.TEXCOORD3.xyz), u_xlat0.xxx, float3(u_xlat16_4.xyz)));
    u_xlat16_4.xyz = half3(fma(float3(input.TEXCOORD5.xyz), u_xlat0.zzz, float3(u_xlat16_4.xyz)));
    u_xlat16_0.x = dot(u_xlat16_4.xyz, u_xlat16_4.xyz);
    u_xlat16_0.x = max(u_xlat16_0.x, half(0.00100000005));
    u_xlat16_0.x = rsqrt(u_xlat16_0.x);
    u_xlat16_0.xyz = u_xlat16_0.xxx * u_xlat16_4.xyz;
    u_xlat1.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat42 = dot(u_xlat1.xyz, u_xlat1.xyz);
    u_xlat42 = max(u_xlat42, 0.00100000005);
    u_xlat42 = rsqrt(u_xlat42);
    u_xlat7.xyz = float3(u_xlat42) * u_xlat1.xyz;
    u_xlatb43 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb43){
        u_xlat8.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat43 = min(u_xlat8.z, 0.999000013);
        u_xlat43 = u_xlat43 + FGlobals.gShadowParams0[4].z;
        u_xlat43 = (-u_xlat43) + 1.0;
        u_xlat10_43 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat8.xy, saturate(u_xlat43), level(0.0)));
        u_xlatb36.xy = (float2(1.0, 1.0)<u_xlat8.xy);
        u_xlatb49 = u_xlatb36.y || u_xlatb36.x;
        u_xlatb8.xy = (u_xlat8.xy<float2(0.0, 0.0));
        u_xlatb8.x = u_xlatb8.y || u_xlatb8.x;
        u_xlatb49 = u_xlatb49 || u_xlatb8.x;
        u_xlat16_4.x = (u_xlatb49) ? half(1.0) : half(0.0);
        u_xlat16_4.x = half(max(float(u_xlat10_43), float(u_xlat16_4.x)));
        u_xlatb43 = input.TEXCOORD0.y<-30.0;
        u_xlat16_4.x = (u_xlatb43) ? half(1.0) : u_xlat16_4.x;
    } else {
        u_xlat16_4.x = half(1.0);
    }
    u_xlat16_9.xyz = u_xlat16_3.xxx * u_xlat16_6.xyz;
    u_xlat16_17.xyz = fma(u_xlat16_17.xyz, u_xlat16_5.xyz, (-u_xlat16_9.xyz));
    u_xlat16_18 = fma((-u_xlat16_3.x), half(0.0399999991), half(0.0399999991));
    u_xlat16_5.xyz = fma(u_xlat16_6.xyz, u_xlat16_3.xxx, half3(u_xlat16_18));
    u_xlat16_18 = dot(float3(u_xlat16_0.xyz), u_xlat7.xyz);
    u_xlat16_2 = fma(half4(u_xlat16_47), half4(-1.0, -0.0274999999, -0.572000027, 0.0219999999), half4(1.0, 0.0425000004, 1.03999996, -0.0399999991));
    u_xlat16_32 = u_xlat16_2.x * u_xlat16_2.x;
    u_xlat16_6.x = u_xlat16_18 * half(-9.27999973);
    u_xlat16_6.x = exp2(u_xlat16_6.x);
    u_xlat16_32 = min(u_xlat16_32, u_xlat16_6.x);
    u_xlat16_32 = fma(u_xlat16_32, u_xlat16_2.x, u_xlat16_2.y);
    u_xlat16_6.xy = fma(half2(u_xlat16_32), half2(-1.03999996, 1.03999996), u_xlat16_2.zw);
    u_xlat16_32 = u_xlat16_5.y * half(50.0);
    u_xlat16_32 = clamp(u_xlat16_32, 0.0h, 1.0h);
    u_xlat16_32 = u_xlat16_32 * u_xlat16_6.y;
    u_xlat16_5.xyz = fma(u_xlat16_5.xyz, u_xlat16_6.xxx, half3(u_xlat16_32));
    u_xlat16_32 = dot(float3(0.212500006, 0.715399981, 0.0720999986), input.TEXCOORD8.xyz);
    u_xlat16_32 = u_xlat16_32 * FGlobals.gLightBuffer[10].w;
    u_xlat16_32 = clamp(u_xlat16_32, 0.0h, 1.0h);
    u_xlat8.xyz = float3(u_xlat16_17.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_6.x = dot((-u_xlat7.xyz), float3(u_xlat16_0.xyz));
    u_xlat16_6.x = u_xlat16_6.x + u_xlat16_6.x;
    u_xlat16_6.xyz = half3(fma(float3(u_xlat16_0.xyz), (-float3(u_xlat16_6.xxx)), (-u_xlat7.xyz)));
    u_xlat16_43 = dot(u_xlat16_6.xyz, u_xlat16_6.xyz);
    u_xlat16_43 = max(u_xlat16_43, half(0.00100000005));
    u_xlat16_43 = rsqrt(u_xlat16_43);
    u_xlat16_7.xyz = half3(u_xlat16_43) * u_xlat16_6.xyz;
    u_xlat16_6.x = fma((-u_xlat16_47), half(0.699999988), half(1.70000005));
    u_xlat16_6.x = u_xlat16_47 * u_xlat16_6.x;
    u_xlat16_6.x = u_xlat16_6.x * half(6.0);
    u_xlat16_20.x = fma(u_xlat16_7.y, half(8.0), half(8.0));
    u_xlat16_20.x = sqrt(u_xlat16_20.x);
    u_xlat16_20.xy = u_xlat16_7.xz / u_xlat16_20.xx;
    u_xlat16_20.xy = u_xlat16_20.xy + half2(0.5, 0.5);
    u_xlat16_7.xyz = _2DSpecCube0.sample(sampler_2DSpecCube0, float2(u_xlat16_20.xy), level(float(u_xlat16_6.x))).xyz;
    u_xlat16_6.xyz = u_xlat16_7.xyz * half3(FGlobals._SpecCubePower);
    u_xlat16_48 = (-u_xlat16_47) + half(1.0);
    u_xlat16_48 = u_xlat16_48 * u_xlat16_48;
    u_xlat16_3.x = u_xlat16_3.x * u_xlat16_48;
    u_xlat16_48 = (-u_xlat16_46) + half(1.0);
    u_xlat16_3.x = fma(u_xlat16_3.x, u_xlat16_48, u_xlat16_46);
    u_xlat16_6.xyz = u_xlat16_3.xxx * u_xlat16_6.xyz;
    u_xlat16_6.xyz = u_xlat16_5.xyz * u_xlat16_6.xyz;
    u_xlat16_6.xyz = half3(u_xlat16_32) * u_xlat16_6.xyz;
    u_xlat16_6.xyz = u_xlat16_6.xyz * FGlobals.gLightBuffer[10].xyz;
    u_xlat16_6.xyz = half3(fma(u_xlat8.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_6.xyz)));
    u_xlat16_7.xyz = half3(0.318309873, 0.318309873, 0.318309873) * FGlobals.gLightBuffer[12].xyz;
    u_xlat16_9.xyz = half3(fma(u_xlat1.xyz, float3(u_xlat42), float3(FGlobals.gLightBuffer[11].xyz)));
    u_xlat16_43 = dot(u_xlat16_9.xyz, u_xlat16_9.xyz);
    u_xlat16_43 = max(u_xlat16_43, half(0.00100000005));
    u_xlat16_43 = rsqrt(u_xlat16_43);
    u_xlat16_8.xyz = half3(u_xlat16_43) * u_xlat16_9.xyz;
    u_xlat16_43 = dot(u_xlat16_0.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_43 = max(u_xlat16_43, half(0.0));
    u_xlat16_3.x = dot(u_xlat16_0.xyz, u_xlat16_8.xyz);
    u_xlat16_3.x = max(u_xlat16_3.x, half(0.0));
    u_xlatb49 = u_xlat16_18>=half(0.0);
    u_xlat16_18 = (u_xlatb49) ? half(1.0) : half(0.0);
    u_xlat16_5.xyz = u_xlat16_5.xyz * half3(u_xlat16_18);
    u_xlat16_18 = fma(u_xlat16_47, half(0.25), half(0.25));
    u_xlat16_49 = fma((-u_xlat16_3.x), u_xlat16_3.x, half(1.0));
    u_xlat16_32 = u_xlat16_47 * u_xlat16_47;
    u_xlat16_8.x = u_xlat16_3.x * u_xlat16_32;
    u_xlat16_49 = fma(u_xlat16_8.x, u_xlat16_8.x, u_xlat16_49);
    u_xlat16_49 = u_xlat16_32 / u_xlat16_49;
    u_xlat16_49 = u_xlat16_49 * u_xlat16_49;
    u_xlat16_49 = min(u_xlat16_49, half(128.0));
    u_xlat16_49 = u_xlat16_18 * u_xlat16_49;
    u_xlat16_8.xyz = fma(u_xlat16_5.xyz, half3(u_xlat16_49), u_xlat16_17.xyz);
    u_xlat16_8.xyz = half3(u_xlat16_43) * u_xlat16_8.xyz;
    u_xlat16_7.xyz = u_xlat16_7.xyz * u_xlat16_8.xyz;
    u_xlat16_8.xyz = fma(u_xlat16_7.xyz, u_xlat16_4.xxx, (-u_xlat16_7.xyz));
    u_xlat7.xyz = fma(FGlobals.gShadowParams0[5].zzz, float3(u_xlat16_8.xyz), float3(u_xlat16_7.xyz));
    u_xlat7.xyz = float3(u_xlat16_6.xyz) + u_xlat7.xyz;
    u_xlatb43 = UnityPerMaterial._LightLayerMask==half(0.0);
    u_xlatu2 = uint4(float4(FGlobals.gLightBuffer[18]));
    u_xlatu8.xy = (bool(u_xlatb43)) ? u_xlatu2.xz : u_xlatu2.yw;
    u_xlatu8.xy = min(u_xlatu8.xy, uint2(0x4u, 0x4u));
    u_xlati43 = int(float(UnityPerMaterial._LightLayerMask));
    u_xlati43 = u_xlati43 << 0x2;
    u_xlat16_6.x = half(0.0);
    u_xlat16_6.y = half(0.0);
    u_xlat16_6.z = half(0.0);
    u_xlati49 = 0x0;
    while(true){
        u_xlatb36.x = u_xlati49>=int(u_xlatu8.x);
        if(u_xlatb36.x){break;}
        u_xlati36 = u_xlati43 + u_xlati49;
        u_xlat10.xyz = (-input.TEXCOORD0.xyz) + FGlobals.gLightPosition[u_xlati36].xyz;
        u_xlat50 = dot(u_xlat10.xyz, u_xlat10.xyz);
        u_xlat50 = max(u_xlat50, 0.00100000005);
        u_xlat50 = rsqrt(u_xlat50);
        u_xlat11.xyz = float3(u_xlat50) * u_xlat10.xyz;
        u_xlati50 = u_xlati36 + 0x13;
        u_xlat16_3.x = dot(u_xlat10.xyz, u_xlat10.xyz);
        u_xlat16_4.x = max(u_xlat16_3.x, half(9.99999975e-05));
        u_xlat16_4.x = half(1.0) / u_xlat16_4.x;
        u_xlat16_3.x = half(float(u_xlat16_3.x) * FGlobals.gLightPosition[u_xlati36].w);
        u_xlat16_3.x = fma((-u_xlat16_3.x), u_xlat16_3.x, half(1.0));
        u_xlat16_3.x = max(u_xlat16_3.x, half(0.0));
        u_xlat16_3.x = u_xlat16_3.x * u_xlat16_3.x;
        u_xlat16_3.x = u_xlat16_3.x * u_xlat16_4.x;
        u_xlat16_9.xyz = u_xlat16_3.xxx * FGlobals.gLightBuffer[u_xlati50].xyz;
        u_xlat16_12.xyz = half3(fma(u_xlat1.xyz, float3(u_xlat42), u_xlat11.xyz));
        u_xlat16_36 = dot(u_xlat16_12.xyz, u_xlat16_12.xyz);
        u_xlat16_36 = max(u_xlat16_36, half(0.00100000005));
        u_xlat16_36 = rsqrt(u_xlat16_36);
        u_xlat16_10.xyz = half3(u_xlat16_36) * u_xlat16_12.xyz;
        u_xlat36 = dot(float3(u_xlat16_0.xyz), u_xlat11.xyz);
        u_xlat36 = max(u_xlat36, 0.0);
        u_xlat16_3.x = dot(u_xlat16_0.xyz, u_xlat16_10.xyz);
        u_xlat16_3.x = max(u_xlat16_3.x, half(0.0));
        u_xlat16_50 = fma((-u_xlat16_3.x), u_xlat16_3.x, half(1.0));
        u_xlat16_10.x = u_xlat16_32 * u_xlat16_3.x;
        u_xlat16_50 = fma(u_xlat16_10.x, u_xlat16_10.x, u_xlat16_50);
        u_xlat16_50 = u_xlat16_32 / u_xlat16_50;
        u_xlat16_50 = u_xlat16_50 * u_xlat16_50;
        u_xlat16_50 = min(u_xlat16_50, half(128.0));
        u_xlat16_50 = u_xlat16_18 * u_xlat16_50;
        u_xlat16_10.xyz = fma(u_xlat16_5.xyz, half3(u_xlat16_50), u_xlat16_17.xyz);
        u_xlat10.xyz = float3(u_xlat36) * float3(u_xlat16_10.xyz);
        u_xlat16_6.xyz = half3(fma(u_xlat10.xyz, float3(u_xlat16_9.xyz), float3(u_xlat16_6.xyz)));
        u_xlati49 = u_xlati49 + 0x1;
    }
    u_xlat16_6.xyz = half3(fma(float3(UnityPerMaterial._PointLightFactor), float3(u_xlat16_6.xyz), u_xlat7.xyz));
    u_xlat7.x = float(0.0);
    u_xlat7.y = float(0.0);
    u_xlat7.z = float(0.0);
    u_xlati49 = int(0x0);
    while(true){
        u_xlatb8.x = u_xlati49>=int(u_xlatu8.y);
        if(u_xlatb8.x){break;}
        u_xlati8.x = u_xlati43 + u_xlati49;
        u_xlati36 = u_xlati8.x + 0x8;
        u_xlat10.xyz = (-input.TEXCOORD0.xyz) + FGlobals.gLightPosition[u_xlati36].xyz;
        u_xlat36 = dot(u_xlat10.xyz, u_xlat10.xyz);
        u_xlat36 = max(u_xlat36, 0.00100000005);
        u_xlat36 = rsqrt(u_xlat36);
        u_xlat11.xyz = float3(u_xlat36) * u_xlat10.xyz;
        u_xlati8.xzw = u_xlati8.xxx * int3(0x3, 0x3, 0x3) + int3(0x1b, 0x1d, 0x1c);
        u_xlat16_52 = dot(FGlobals.gLightBuffer[u_xlati8.z].xyz, FGlobals.gLightBuffer[u_xlati8.z].xyz);
        u_xlat16_52 = max(u_xlat16_52, half(0.00100000005));
        u_xlat16_52 = rsqrt(u_xlat16_52);
        u_xlat16_13.xyz = half3(u_xlat16_52) * FGlobals.gLightBuffer[u_xlati8.z].xyz;
        u_xlat16_3.x = dot(u_xlat10.xyz, u_xlat10.xyz);
        u_xlat16_4.x = max(u_xlat16_3.x, half(9.99999975e-05));
        u_xlat16_4.x = half(1.0) / u_xlat16_4.x;
        u_xlat16_3.x = u_xlat16_3.x * FGlobals.gLightBuffer[u_xlati8.w].z;
        u_xlat16_3.x = fma((-u_xlat16_3.x), u_xlat16_3.x, half(1.0));
        u_xlat16_3.x = max(u_xlat16_3.x, half(0.0));
        u_xlat16_3.x = u_xlat16_3.x * u_xlat16_3.x;
        u_xlat16_3.x = u_xlat16_3.x * u_xlat16_4.x;
        u_xlat36 = dot(u_xlat11.xyz, (-float3(u_xlat16_13.xyz)));
        u_xlat16_4.x = FGlobals.gLightBuffer[u_xlati8.w].w * FGlobals.gLightBuffer[u_xlati8.w].x;
        u_xlat36 = fma((-u_xlat36), float(FGlobals.gLightBuffer[u_xlati8.w].w), (-float(u_xlat16_4.x)));
        u_xlat36 = clamp(u_xlat36, 0.0f, 1.0f);
        u_xlat36 = u_xlat36 * u_xlat36;
        u_xlat36 = float(u_xlat16_3.x) * u_xlat36;
        u_xlat8.xzw = float3(u_xlat36) * float3(FGlobals.gLightBuffer[u_xlati8.x].xyz);
        u_xlat16_9.xyz = half3(fma(u_xlat1.xyz, float3(u_xlat42), float3(u_xlat16_13.xyz)));
        u_xlat16_10.x = dot(u_xlat16_9.xyz, u_xlat16_9.xyz);
        u_xlat16_10.x = max(u_xlat16_10.x, half(0.00100000005));
        u_xlat16_10.x = rsqrt(u_xlat16_10.x);
        u_xlat16_10.xyz = u_xlat16_9.xyz * u_xlat16_10.xxx;
        u_xlat16_52 = dot(u_xlat16_0.xyz, u_xlat16_13.xyz);
        u_xlat16_52 = max(u_xlat16_52, half(0.0));
        u_xlat16_3.x = dot(u_xlat16_0.xyz, u_xlat16_10.xyz);
        u_xlat16_3.x = max(u_xlat16_3.x, half(0.0));
        u_xlat16_10.x = fma((-u_xlat16_3.x), u_xlat16_3.x, half(1.0));
        u_xlat16_24 = u_xlat16_32 * u_xlat16_3.x;
        u_xlat16_10.x = fma(u_xlat16_24, u_xlat16_24, u_xlat16_10.x);
        u_xlat16_10.x = u_xlat16_32 / u_xlat16_10.x;
        u_xlat16_10.x = u_xlat16_10.x * u_xlat16_10.x;
        u_xlat16_10.x = min(u_xlat16_10.x, half(128.0));
        u_xlat16_10.x = u_xlat16_18 * u_xlat16_10.x;
        u_xlat16_10.xyz = fma(u_xlat16_5.xyz, u_xlat16_10.xxx, u_xlat16_17.xyz);
        u_xlat16_10.xyz = half3(u_xlat16_52) * u_xlat16_10.xyz;
        u_xlat7.xyz = fma(float3(u_xlat16_10.xyz), u_xlat8.xzw, u_xlat7.xyz);
        u_xlati49 = u_xlati49 + 0x1;
    }
    u_xlat0.xyz = fma(float3(UnityPerMaterial._PointLightFactor), u_xlat7.xyz, float3(u_xlat16_6.xyz));
    u_xlat16_3.xyz = half3(float3(u_xlat16_46) * u_xlat0.xyz);
    u_xlat16_45 = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_45 = min(u_xlat16_45, half(1.0));
    u_xlat16_4.x = (-u_xlat16_45) + half(1.0);
    u_xlat16_45 = fma(UnityPerMaterial._VertexOcclusionIntensity, u_xlat16_4.x, u_xlat16_45);
    u_xlat16_3.xyz = fma(u_xlat16_3.xyz, half3(u_xlat16_45), (-FGlobals.gFogParams[6].yzw));
    output.SV_TARGET0.xyz = fma(input.TEXCOORD10, u_xlat16_3.xyz, FGlobals.gFogParams[6].yzw);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
