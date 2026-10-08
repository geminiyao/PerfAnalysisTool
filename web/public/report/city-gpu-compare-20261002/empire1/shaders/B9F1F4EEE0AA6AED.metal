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
    float4 gShadowParams0 [6];
    half gShadowmapFuncEnabled ;
    half gShadowEnableDynamicShadow ;
    float4 CloudSpeed ;
    float4 CloudParam ;
    float4 CloudOffset ;
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
    half4 _TintColorHDR ;
    half4 _RoughnessScale ;
    half _Roughness ;
    half4 _Metallic ;
    half _TextureLodBias ;
    half _VertexOcclusionIntensity ;
    half _TeamColorIntensity ;
    half _TeamMaskScale ;
    float _FrameNum ;
    float _FrameRate ;
    half4 _TextUVModify ;
    half _AlphaControl ;
    half4 _WeaponNoise_ST ;
    half4 _WpemissiveColor ;
    half _WpemissiveIntensity ;
    half _IsWeapon ;
    half _FlowSpeed ;
    half _FlowShappen ;
    half _FlowWeight ;
    half _FlowRotate ;
    half _WpNoiseMin ;
    half _WpNoiseMax ;
    half _WpNoiseIntensity ;
};

struct UnityDrawCallInfo_Type
{
    int unity_BaseInstanceID ;
    int unity_InstanceCount ;
};

struct ColorPropsArray_Type
{
    float4 _TeamColor ;
    float4 _HighlightColor ;
};

struct UnityInstancing_ColorProps_Type
{
    ColorPropsArray_Type ColorPropsArray [2];
};

struct TextUVPropsArray_Type
{
    float4 _TextUVRect0 ;
    float4 _TextUVRect1 ;
};

struct UnityInstancing_TextUVProps_Type
{
    TextUVPropsArray_Type TextUVPropsArray [2];
};

struct TextRealSizesPropsArray_Type
{
    float4 _TextRealSize0 ;
    float4 _TextRealSize1 ;
};

struct UnityInstancing_TextRealSizesProps_Type
{
    TextRealSizesPropsArray_Type TextRealSizesPropsArray [2];
};

struct CustomUVTransformPropsArray_Type
{
    float4 _CustomUVTransform ;
    float4 _Reversed3 ;
};

struct UnityInstancing_CustomUVTransformProps_Type
{
    CustomUVTransformPropsArray_Type CustomUVTransformPropsArray [2];
};

struct Mtl_FragmentIn
{
    float4 TEXCOORD0 [[ user(TEXCOORD0) ]] ;
    float4 TEXCOORD1 [[ user(TEXCOORD1) ]] ;
    half4 TEXCOORD2 [[ user(TEXCOORD2) ]] ;
    half4 TEXCOORD3 [[ user(TEXCOORD3) ]] ;
    half4 TEXCOORD4 [[ user(TEXCOORD4) ]] ;
    half3 TEXCOORD5 [[ user(TEXCOORD5) ]] ;
    half4 TEXCOORD7 [[ user(TEXCOORD7) ]] ;
    float3 TEXCOORD8 [[ user(TEXCOORD8) ]] ;
    float4 TEXCOORD14 [[ user(TEXCOORD14) ]] ;
    uint SV_InstanceID0 [[ user(SV_InstanceID0) ]]  [[ flat ]];
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
    constant UnityDrawCallInfo_Type& UnityDrawCallInfo [[ buffer(3) ]],
    const constant ColorPropsArray_Type* UnityInstancing_ColorProps [[ buffer(4) ]],
    const constant TextUVPropsArray_Type* UnityInstancing_TextUVProps [[ buffer(5) ]],
    const constant TextRealSizesPropsArray_Type* UnityInstancing_TextRealSizesProps [[ buffer(6) ]],
    const constant CustomUVTransformPropsArray_Type* UnityInstancing_CustomUVTransformProps [[ buffer(7) ]],
    sampler sampler_MainTex [[ sampler (0) ]],
    sampler sampler_NormalTex [[ sampler (1) ]],
    sampler sampler_GlobalTextTexture [[ sampler (2) ]],
    sampler samplerCloudTex [[ sampler (3) ]],
    sampler sampler_2DSpecCube0 [[ sampler (4) ]],
    texture2d<half, access::sample > _MainTex [[ texture(0) ]] ,
    texture2d<half, access::sample > _NormalTex [[ texture(1) ]] ,
    texture2d<half, access::sample > _GlobalTextTexture [[ texture(2) ]] ,
    texture2d<half, access::sample > CloudTex [[ texture(3) ]] ,
    depth2d<float, access::sample > CachedShadowMap [[ texture(4) ]] ,
    depth2d<float, access::sample > CachedDynamicShadowMap [[ texture(5) ]] ,
    texture2d<half, access::sample > _2DSpecCube0 [[ texture(6) ]] ,
    float4 mtl_FragCoord [[ position ]],
    Mtl_FragmentIn input [[ stage_in ]])
{
    Mtl_FragmentOut output;
    constexpr sampler shadow_linear_clamp_compare_sampler(compare_func::greater_equal,filter::linear,mip_filter::nearest,address::clamp_to_edge);
    float4 hlslcc_FragCoord = float4(mtl_FragCoord.xyz, 1.0/mtl_FragCoord.w);
    float4 u_xlat0;
    half4 u_xlat16_0;
    int u_xlati0;
    bool u_xlatb0;
    float2 u_xlat1;
    half4 u_xlat16_1;
    half4 u_xlat16_2;
    half4 u_xlat16_3;
    half4 u_xlat16_4;
    half3 u_xlat16_5;
    half3 u_xlat16_6;
    half4 u_xlat16_7;
    float3 u_xlat8;
    half3 u_xlat16_8;
    bool2 u_xlatb8;
    half3 u_xlat16_9;
    bool u_xlatb9;
    float3 u_xlat10;
    half3 u_xlat16_10;
    float3 u_xlat11;
    half3 u_xlat16_11;
    float3 u_xlat12;
    bool2 u_xlatb12;
    half3 u_xlat16_13;
    bool u_xlatb14;
    half u_xlat16_18;
    half3 u_xlat16_19;
    half u_xlat16_23;
    float u_xlat28;
    bool u_xlatb28;
    half u_xlat16_32;
    half2 u_xlat16_34;
    bool2 u_xlatb40;
    half u_xlat16_46;
    half u_xlat16_47;
    half u_xlat16_48;
    float u_xlat50;
    half u_xlat16_50;
    bool u_xlatb50;
    float u_xlat51;
    half u_xlat16_51;
    half u_xlat10_51;
    bool u_xlatb51;
    float u_xlat52;
    half u_xlat16_52;
    half u_xlat10_52;
    bool u_xlatb52;
    bool u_xlatb53;
    u_xlati0 = int(input.SV_InstanceID0) + UnityDrawCallInfo.unity_BaseInstanceID;
    u_xlat1.x = input.TEXCOORD0.w;
    u_xlat1.y = input.TEXCOORD1.w;
    u_xlat16_2.xy = half2(fma(u_xlat1.xy, float2(UnityPerMaterial._MainTex_ST.xy), float2(UnityPerMaterial._MainTex_ST.zw)));
    u_xlati0 = u_xlati0 << 0x1;
    u_xlat16_2.xy = half2(fma(float2(u_xlat16_2.xy), UnityInstancing_CustomUVTransformProps[u_xlati0 / 2]._CustomUVTransform.xy, UnityInstancing_CustomUVTransformProps[u_xlati0 / 2]._CustomUVTransform.zw));
    u_xlat16_3 = _MainTex.sample(sampler_MainTex, float2(u_xlat16_2.xy));
    u_xlat16_2 = _NormalTex.sample(sampler_NormalTex, float2(u_xlat16_2.xy));
    u_xlat16_4.yz = fma(u_xlat16_2.xy, half2(2.0, 2.0), half2(-1.0, -1.0));
    u_xlat16_4.xw = (-u_xlat16_4.zz);
    u_xlat16_32 = dot(u_xlat16_4.yw, u_xlat16_4.yw);
    u_xlat16_32 = min(u_xlat16_32, half(1.0));
    u_xlat16_32 = (-u_xlat16_32) + half(1.0);
    u_xlat16_32 = sqrt(u_xlat16_32);
    u_xlat16_5.xyz = u_xlat16_3.xyz * UnityPerMaterial._TintColorHDR.xyz;
    u_xlat16_46 = (-u_xlat16_3.w) + half(1.0);
    u_xlat16_46 = u_xlat16_46 * UnityPerMaterial._TeamMaskScale;
    u_xlat16_46 = min(u_xlat16_46, half(1.0));
    u_xlat16_6.xyz = half3(fma(UnityInstancing_ColorProps[u_xlati0 / 2]._TeamColor.xyz, float3(UnityPerMaterial._TeamColorIntensity), float3(-1.0, -1.0, -1.0)));
    u_xlat16_6.xyz = fma(half3(u_xlat16_46), u_xlat16_6.xyz, half3(1.0, 1.0, 1.0));
    u_xlat16_5.xyz = half3(fma(float3(u_xlat16_5.xyz), float3(u_xlat16_6.xyz), UnityInstancing_ColorProps[u_xlati0 / 2]._HighlightColor.xyz));
    u_xlatb14 = 0.0!=UnityInstancing_TextUVProps[u_xlati0 / 2]._TextUVRect1.z;
    u_xlat28 = (u_xlatb14) ? 1.20000005 : 0.699999988;
    u_xlat16_6.xy = half2(u_xlat1.xy + float2(UnityPerMaterial._TextUVModify.xy));
    u_xlat16_6.xy = u_xlat16_6.xy + half2(-0.5, -0.5);
    u_xlat16_6.xy = u_xlat16_6.xy * UnityPerMaterial._TextUVModify.zw;
    u_xlat16_6.xy = half2(fma(float2(u_xlat16_6.xy), float2(u_xlat28), float2(0.5, 0.5)));
    u_xlatb28 = half(0.5)<u_xlat16_6.x;
    u_xlatb28 = u_xlatb28 && u_xlatb14;
    u_xlat16_1 = (bool(u_xlatb28)) ? half4(UnityInstancing_TextUVProps[u_xlati0 / 2]._TextUVRect1) : half4(UnityInstancing_TextUVProps[u_xlati0 / 2]._TextUVRect0);
    u_xlat16_3 = (bool(u_xlatb28)) ? half4(UnityInstancing_TextRealSizesProps[u_xlati0 / 2]._TextRealSize1) : half4(UnityInstancing_TextRealSizesProps[u_xlati0 / 2]._TextRealSize0);
    u_xlat0.x = (u_xlatb28) ? -0.449999988 : 0.449999988;
    u_xlat16_46 = (u_xlatb14) ? half(u_xlat0.x) : half(0.0);
    u_xlat16_6.z = u_xlat16_46 + u_xlat16_6.x;
    u_xlatb0 = u_xlat16_1.z<half(0.0);
    u_xlat16_7.x = (-u_xlat16_1.z);
    u_xlat16_6.xy = (bool(u_xlatb0)) ? u_xlat16_6.yz : u_xlat16_6.zy;
    u_xlat16_34.xy = (bool(u_xlatb0)) ? u_xlat16_3.yx : u_xlat16_3.xy;
    u_xlat16_7.yz = u_xlat16_3.wz;
    u_xlat16_7.w = u_xlat16_1.z;
    u_xlat16_0.xyz = (bool(u_xlatb0)) ? u_xlat16_7.xyz : u_xlat16_7.wzy;
    u_xlat16_6.xy = (-u_xlat16_34.xy) + u_xlat16_6.xy;
    u_xlat16_34.xy = max(u_xlat16_0.yz, half2(0.00100000005, 0.00100000005));
    u_xlat16_6.xy = u_xlat16_6.xy / u_xlat16_34.xy;
    u_xlat16_6.xy = u_xlat16_6.xy + half2(-0.5, -0.5);
    u_xlat16_0.w = u_xlat16_1.w;
    u_xlat16_6.xy = u_xlat16_0.xw * u_xlat16_6.xy;
    u_xlat16_34.xy = u_xlat16_6.xy * half2(2.0, -2.0);
    u_xlat16_34.xy = u_xlat16_0.xw + -abs(u_xlat16_34.xy);
    u_xlatb8.xy = (half2(0.0, 0.0)<u_xlat16_34.xy);
    u_xlatb8.x = u_xlatb8.y && u_xlatb8.x;
    u_xlat16_46 = (u_xlatb8.x) ? half(1.0) : half(0.0);
    u_xlat16_6.xy = fma(u_xlat16_6.xy, half2(1.0, -1.0), u_xlat16_1.xy);
    u_xlat16_8.x = _GlobalTextTexture.sample(sampler_GlobalTextTexture, float2(u_xlat16_6.xy)).w;
    u_xlat16_46 = u_xlat16_46 * u_xlat16_8.x;
    u_xlat16_8.xyz = (-u_xlat16_5.xyz) + half3(1.0, 1.0, 1.0);
    u_xlat16_8.xyz = fma(half3(u_xlat16_46), u_xlat16_8.xyz, u_xlat16_5.xyz);
    u_xlatb50 = FGlobals.gLightBuffer[8].y<FGlobals.gLightBuffer[8].z;
    u_xlat16_19.yz = FGlobals.gLightBuffer[8].yz * half2(0.5, 1.0);
    u_xlat16_46 = fma((-FGlobals.gLightBuffer[8].y), half(0.5), half(1.0));
    u_xlat16_19.x = (u_xlatb50) ? FGlobals.gLightBuffer[8].x : u_xlat16_46;
    u_xlat16_46 = dot(UnityPerMaterial._RoughnessScale.xyz, u_xlat16_19.xyz);
    u_xlat16_46 = u_xlat16_2.z * u_xlat16_46;
    u_xlat16_46 = max(u_xlat16_46, half(0.119999997));
    u_xlat16_46 = min(u_xlat16_46, half(1.0));
    u_xlat16_5.xyz = u_xlat16_4.xxx * input.TEXCOORD4.xyz;
    u_xlat16_5.xyz = fma(input.TEXCOORD3.xyz, u_xlat16_4.yyy, u_xlat16_5.xyz);
    u_xlat16_4.xyz = fma(input.TEXCOORD5.xyz, half3(u_xlat16_32), u_xlat16_5.xyz);
    u_xlat16_50 = dot(u_xlat16_4.xyz, u_xlat16_4.xyz);
    u_xlat16_50 = max(u_xlat16_50, half(0.00100000005));
    u_xlat16_50 = rsqrt(u_xlat16_50);
    u_xlat16_9.xyz = u_xlat16_4.xyz * half3(u_xlat16_50);
    u_xlat10.xyz = (-input.TEXCOORD0.xyz) + UnityPerCamera._WorldSpaceCameraPos.xyzx.xyz;
    u_xlat50 = dot(u_xlat10.xyz, u_xlat10.xyz);
    u_xlat50 = max(u_xlat50, 0.00100000005);
    u_xlat50 = rsqrt(u_xlat50);
    u_xlat11.xyz = float3(u_xlat50) * u_xlat10.xyz;
    u_xlatb51 = FGlobals.gShadowmapFuncEnabled>=half(0.5);
    if(u_xlatb51){
        u_xlat12.xyz = input.TEXCOORD14.xyz / input.TEXCOORD14.www;
        u_xlat51 = min(u_xlat12.z, 0.999000013);
        u_xlat51 = u_xlat51 + FGlobals.gShadowParams0[4].z;
        u_xlat51 = (-u_xlat51) + 1.0;
        u_xlat10_52 = half(CachedShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat12.xy, saturate(u_xlat51), level(0.0)));
        u_xlatb40.xy = (float2(1.0, 1.0)<u_xlat12.xy);
        u_xlatb53 = u_xlatb40.y || u_xlatb40.x;
        u_xlatb40.xy = (u_xlat12.xy<float2(0.0, 0.0));
        u_xlatb40.x = u_xlatb40.y || u_xlatb40.x;
        u_xlatb53 = u_xlatb53 || u_xlatb40.x;
        u_xlat16_4.x = (u_xlatb53) ? half(1.0) : half(0.0);
        u_xlat16_4.x = half(max(float(u_xlat10_52), float(u_xlat16_4.x)));
        u_xlatb52 = half(0.0)<FGlobals.gShadowEnableDynamicShadow;
        if(u_xlatb52){
            u_xlat12.xy = fma(u_xlat12.xy, FGlobals.gShadowParams0[5].ww, (-FGlobals.gShadowParams0[5].xy));
            u_xlat10_51 = half(CachedDynamicShadowMap.sample_compare(_mtl_xl_shadow_sampler, u_xlat12.xy, saturate(u_xlat51), level(0.0)));
            u_xlatb40.xy = (float2(1.0, 1.0)<u_xlat12.xy);
            u_xlatb52 = u_xlatb40.y || u_xlatb40.x;
            u_xlatb12.xy = (u_xlat12.xy<float2(0.0, 0.0));
            u_xlatb53 = u_xlatb12.y || u_xlatb12.x;
            u_xlatb52 = u_xlatb52 || u_xlatb53;
            u_xlat16_18 = (u_xlatb52) ? half(1.0) : half(0.0);
            u_xlat16_18 = half(max(float(u_xlat10_51), float(u_xlat16_18)));
            u_xlat16_4.x = min(u_xlat16_4.x, u_xlat16_18);
        }
        u_xlatb51 = input.TEXCOORD0.y<-30.0;
        u_xlat16_4.x = (u_xlatb51) ? half(1.0) : u_xlat16_4.x;
    } else {
        u_xlat16_4.x = half(1.0);
    }
    u_xlat0 = fma(input.TEXCOORD0.xzxz, float4(0.5, 0.5, 0.5, 0.5), float4(0.5, 0.5, 0.5, 0.5));
    u_xlat0 = fma(u_xlat0, FGlobals.CloudParam.xxxx, FGlobals.CloudOffset);
    u_xlat0 = fma((-FGlobals.CloudSpeed), UnityPerCamera._Time.xxxx, u_xlat0);
    u_xlat16_51 = CloudTex.sample(samplerCloudTex, u_xlat0.xy).y;
    u_xlat16_52 = CloudTex.sample(samplerCloudTex, u_xlat0.zw).w;
    u_xlat16_18 = u_xlat16_52 * half(0.5);
    u_xlat16_18 = fma(u_xlat16_51, half(0.5), u_xlat16_18);
    u_xlat16_51 = fma((-u_xlat16_18), u_xlat16_18, u_xlat16_18);
    u_xlat52 = fma((-float(u_xlat16_18)), float(u_xlat16_18), FGlobals.CloudParam.y);
    u_xlat16_51 = half(1.0) / u_xlat16_51;
    u_xlat51 = float(u_xlat16_51) * u_xlat52;
    u_xlat51 = clamp(u_xlat51, 0.0f, 1.0f);
    u_xlat52 = fma(u_xlat51, -2.0, 3.0);
    u_xlat51 = u_xlat51 * u_xlat51;
    u_xlat51 = u_xlat51 * u_xlat52;
    u_xlat51 = fma((-u_xlat51), FGlobals.CloudParam.z, 1.0);
    u_xlat51 = clamp(u_xlat51, 0.0f, 1.0f);
    u_xlatb52 = float(0.0)!=FGlobals.CloudParam.w;
    u_xlat16_18 = (u_xlatb52) ? half(u_xlat51) : half(1.0);
    u_xlat16_4.x = min(u_xlat16_18, u_xlat16_4.x);
    u_xlat16_5.xyz = fma((-u_xlat16_8.xyz), u_xlat16_2.www, u_xlat16_8.xyz);
    u_xlat16_18 = fma((-u_xlat16_2.w), half(0.0399999991), half(0.0399999991));
    u_xlat16_6.xyz = fma(u_xlat16_8.xyz, u_xlat16_2.www, half3(u_xlat16_18));
    u_xlat16_18 = dot(float3(u_xlat16_9.xyz), u_xlat11.xyz);
    u_xlat16_0 = fma(half4(u_xlat16_46), half4(-1.0, -0.0274999999, -0.572000027, 0.0219999999), half4(1.0, 0.0425000004, 1.03999996, -0.0399999991));
    u_xlat16_32 = u_xlat16_0.x * u_xlat16_0.x;
    u_xlat16_47 = u_xlat16_18 * half(-9.27999973);
    u_xlat16_47 = exp2(u_xlat16_47);
    u_xlat16_32 = min(u_xlat16_32, u_xlat16_47);
    u_xlat16_32 = fma(u_xlat16_32, u_xlat16_0.x, u_xlat16_0.y);
    u_xlat16_7.xy = fma(half2(u_xlat16_32), half2(-1.03999996, 1.03999996), u_xlat16_0.zw);
    u_xlat16_32 = u_xlat16_6.y * half(50.0);
    u_xlat16_32 = clamp(u_xlat16_32, 0.0h, 1.0h);
    u_xlat16_32 = u_xlat16_32 * u_xlat16_7.y;
    u_xlat16_6.xyz = fma(u_xlat16_6.xyz, u_xlat16_7.xxx, half3(u_xlat16_32));
    u_xlat16_32 = dot(float3(0.212500006, 0.715399981, 0.0720999986), input.TEXCOORD8.xyz);
    u_xlat16_32 = u_xlat16_32 * FGlobals.gLightBuffer[10].w;
    u_xlat16_32 = clamp(u_xlat16_32, 0.0h, 1.0h);
    u_xlat8.xyz = float3(u_xlat16_5.xyz) * input.TEXCOORD8.xyz;
    u_xlat16_47 = dot((-u_xlat11.xyz), float3(u_xlat16_9.xyz));
    u_xlat16_47 = u_xlat16_47 + u_xlat16_47;
    u_xlat16_7.xyz = half3(fma(float3(u_xlat16_9.xyz), (-float3(u_xlat16_47)), (-u_xlat11.xyz)));
    u_xlat16_51 = dot(u_xlat16_7.xyz, u_xlat16_7.xyz);
    u_xlat16_51 = max(u_xlat16_51, half(0.00100000005));
    u_xlat16_51 = rsqrt(u_xlat16_51);
    u_xlat16_11.xyz = u_xlat16_7.xyz * half3(u_xlat16_51);
    u_xlat16_47 = fma((-u_xlat16_46), half(0.699999988), half(1.70000005));
    u_xlat16_47 = u_xlat16_46 * u_xlat16_47;
    u_xlat16_47 = u_xlat16_47 * half(6.0);
    u_xlat16_48 = fma(u_xlat16_11.y, half(8.0), half(8.0));
    u_xlat16_48 = sqrt(u_xlat16_48);
    u_xlat16_7.xy = u_xlat16_11.xz / half2(u_xlat16_48);
    u_xlat16_7.xy = u_xlat16_7.xy + half2(0.5, 0.5);
    u_xlat16_11.xyz = _2DSpecCube0.sample(sampler_2DSpecCube0, float2(u_xlat16_7.xy), level(float(u_xlat16_47))).xyz;
    u_xlat16_7.xyz = u_xlat16_11.xyz * half3(FGlobals._SpecCubePower);
    u_xlat16_7.xyz = u_xlat16_6.xyz * u_xlat16_7.xyz;
    u_xlat16_7.xyz = half3(u_xlat16_32) * u_xlat16_7.xyz;
    u_xlat16_7.xyz = u_xlat16_7.xyz * FGlobals.gLightBuffer[10].xyz;
    u_xlat16_7.xyz = half3(fma(u_xlat8.xyz, float3(FGlobals.gLightBuffer[9].xyz), float3(u_xlat16_7.xyz)));
    u_xlat16_8.xyz = FGlobals.gLightBuffer[12].xyz * half3(0.318309873, 0.318309873, 0.318309873);
    u_xlat16_13.xyz = half3(fma(u_xlat10.xyz, float3(u_xlat50), float3(FGlobals.gLightBuffer[11].xyz)));
    u_xlat16_50 = dot(u_xlat16_13.xyz, u_xlat16_13.xyz);
    u_xlat16_50 = max(u_xlat16_50, half(0.00100000005));
    u_xlat16_50 = rsqrt(u_xlat16_50);
    u_xlat16_10.xyz = half3(u_xlat16_50) * u_xlat16_13.xyz;
    u_xlat16_50 = dot(u_xlat16_9.xyz, FGlobals.gLightBuffer[11].xyz);
    u_xlat16_50 = max(u_xlat16_50, half(0.0));
    u_xlat16_32 = dot(u_xlat16_9.xyz, u_xlat16_10.xyz);
    u_xlat16_32 = max(u_xlat16_32, half(0.0));
    u_xlatb9 = u_xlat16_18>=half(0.0);
    u_xlat16_18 = (u_xlatb9) ? half(1.0) : half(0.0);
    u_xlat16_6.xyz = u_xlat16_6.xyz * half3(u_xlat16_18);
    u_xlat16_18 = fma(u_xlat16_46, half(0.25), half(0.25));
    u_xlat16_9.x = fma((-u_xlat16_32), u_xlat16_32, half(1.0));
    u_xlat16_46 = u_xlat16_46 * u_xlat16_46;
    u_xlat16_23 = u_xlat16_46 * u_xlat16_32;
    u_xlat16_9.x = fma(u_xlat16_23, u_xlat16_23, u_xlat16_9.x);
    u_xlat16_9.x = u_xlat16_46 / u_xlat16_9.x;
    u_xlat16_9.x = u_xlat16_9.x * u_xlat16_9.x;
    u_xlat16_9.x = min(u_xlat16_9.x, half(128.0));
    u_xlat16_9.x = u_xlat16_18 * u_xlat16_9.x;
    u_xlat16_9.xyz = fma(u_xlat16_6.xyz, u_xlat16_9.xxx, u_xlat16_5.xyz);
    u_xlat16_9.xyz = half3(u_xlat16_50) * u_xlat16_9.xyz;
    u_xlat16_8.xyz = u_xlat16_8.xyz * u_xlat16_9.xyz;
    u_xlat16_9.xyz = fma(u_xlat16_8.xyz, u_xlat16_4.xxx, (-u_xlat16_8.xyz));
    u_xlat8.xyz = fma(FGlobals.gShadowParams0[5].zzz, float3(u_xlat16_9.xyz), float3(u_xlat16_8.xyz));
    u_xlat8.xyz = float3(u_xlat16_7.xyz) + u_xlat8.xyz;
    u_xlat16_4.x = input.TEXCOORD2.w * input.TEXCOORD2.w;
    u_xlat16_4.x = min(u_xlat16_4.x, half(1.0));
    u_xlat16_18 = (-u_xlat16_4.x) + half(1.0);
    u_xlat16_4.x = fma(UnityPerMaterial._VertexOcclusionIntensity, u_xlat16_18, u_xlat16_4.x);
    u_xlat16_4.xyz = half3(float3(u_xlat16_4.xxx) * u_xlat8.xyz);
    output.SV_TARGET0.xyz = fma(u_xlat16_4.xyz, input.TEXCOORD7.www, input.TEXCOORD7.xyz);
    output.SV_TARGET0.w = half(1.0);
    output.SV_Target1 = hlslcc_FragCoord.z;
    return output;
}
