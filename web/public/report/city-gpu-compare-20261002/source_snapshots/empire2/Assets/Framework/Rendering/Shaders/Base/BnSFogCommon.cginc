#ifndef BNS_FOG_COMMON_CGINC_
#define BNS_FOG_COMMON_CGINC_
//#include "UnityLightingCommon.cginc"
#include "../Base/Lighting.cginc"
#include "GlobalParameters.cginc"

#ifndef BNS_FULL_PIXEL_FOG
#define BNS_FULL_PIXEL_FOG 1
#endif

//#define BNS_PIXEL_MIE

#if BNS_FULL_PIXEL_FOG	// 全部在Pixel Shader中计算
	#define BNS_FOG_COORDS(idx) 
	#define BNS_TRANSFER_FOG(o, worldPos) 
		#define BNS_APPLY_FOG(i, col, worldPos) half4 bnsPixelFog = CalcBnSFogColor(worldPos); col.rgb = col.rgb * bnsPixelFog.a + bnsPixelFog.rgb;
#else
	#ifdef BNS_PIXEL_MIE	// 米氏散射在Pixel Shader中计算
		#define BNS_FOG_COORDS(idx) half4 bnsFogCoe : TEXCOORD##idx;
		#define BNS_TRANSFER_FOG(o, worldPos) o.bnsFogCoe = CalcBnSFogCoe(worldPos);
		#define BNS_APPLY_FOG(i, col, worldPos) half4 bnsPixelFog = ApplyBnsFogCoe(worldPos, i.bnsFogCoe); col.rgb = col.rgb * bnsPixelFog.a + bnsPixelFog.rgb;
	#else					// 全部在Vertex Shader中计算
		#define BNS_FOG_COORDS(idx) half4 bnsFogColor : TEXCOORD##idx;
		#define BNS_TRANSFER_FOG(o, worldPos) o.bnsFogColor = CalcBnSFogColor(worldPos);
		#define BNS_APPLY_FOG(i, col, worldPos) col.rgb = col.rgb * i.bnsFogColor.a + i.bnsFogColor.rgb;
	#endif
#endif

// See GlobalParameters.cginc
// half BnSFog_AtmosBaseZ;
// half BnSFog_AtmosFogDensity;
// half BnSFog_AtmosMinOpacity;
// half BnSFog_BetaRs;
// half BnSFog_BetaMs;
// half BnSFog_MieG;
// half3 BnSFog_AlbedoR;
// half3 BnSFog_AlbedoM;
// half BnSFog_AtmosStartDist;
// half BnSFog_AtmosFalloff;
// half BnSFog_SunInscatterIntensity;
// half BnSFog_HeightFogBaseZ;
// half3 BnSFog_HeightFogColor;
// half BnSFog_HeightFogDensity;
// half BnSFog_HeightFogMinOpacity;
// half BnSFog_HeightFogStartDist;
// half BnSFog_HeightFogFalloff;

// half BnSFog_FogMaskEnabled;
// half BnSFog_FogMaskStrength;
// half4 BnSFog_FogMaskUVScaleOffset;
Texture2D<half> BnSFog_FogMaskTex;
SamplerState BnsFog_LinearClampSampler;

#define MAX_FOG_COLOR_COUNT 16

// sampler2D _WeatherIndexTex;
// float4 _WeatherRayleighColors[MAX_FOG_COLOR_COUNT];
// float4 _WeatherMieColors[MAX_FOG_COLOR_COUNT];
// float4 _WeatherHeightFogColors[MAX_FOG_COLOR_COUNT];
int _WeatherFogColorCount;

// ========== 三张雾色纹理路径（已在WeatherMgr.cs中禁用）==========
// 由 WeatherMgr 在 m_UseColorTextures = true 时下发：
//   _WeatherRayleighColorTex / _WeatherMieColorTex / _WeatherHeightFogColorTex
//   分别存放 Rayleigh / Mie / HeightFog 三种雾色，与 mask 同分辨率并已高斯模糊。
// 采样方式说明：受材质最大 16 个 sampler2D 的硬件限制，此处改用 Texture2D +
// 共享 SamplerState（复用上面 BnSFog_FogMaskTex 使用的 BnsFog_LinearClampSampler），
// 使三张纹理共享 1 个 sampler slot，节省 2 个 slot。
// Texture2D _WeatherRayleighColorTex;
// Texture2D _WeatherMieColorTex;
// Texture2D _WeatherHeightFogColorTex;

struct WeatherFogColors
{
    float4 rayleighTintColor;
    float4 mieTintColor;
    float4 heightFogColor;
};

// 根据世界坐标采样获取当前位置的三个雾效颜色
// - _UseWeatherColorTex >= 0.5：新路径，直接用世界 UV 双线性采样三张颜色纹理，
//   得到区域边界柔和过渡的雾色（依赖 wrapMode = Clamp 处理越界）。
// - 否则：走原路径，采样 _WeatherIndexTex 得到索引后查颜色数组。
/*
WeatherFogColors SampleWeatherFogColors(float3 worldPos)
{
    float2 worldUV = WorldPosToWorldUV(worldPos);

    WeatherFogColors result;
    //if (_UseWeatherColorTex >= 0.5)
    {
        // 颜色纹理路径：三张纹理共享 BnsFog_LinearClampSampler，三次双线性采样
        // 区域边界因 Bilinear + 高斯模糊而自然过渡；使用 SampleLevel(mip=0) 保证在 vertex/pixel 通用
        result.rayleighTintColor = _WeatherRayleighColorTex.SampleLevel(BnsFog_LinearClampSampler, worldUV, 0.0);
        result.mieTintColor      = _WeatherMieColorTex.SampleLevel(BnsFog_LinearClampSampler,      worldUV, 0.0);
        result.heightFogColor    = _WeatherHeightFogColorTex.SampleLevel(BnsFog_LinearClampSampler, worldUV, 0.0);
    }
    //else
    //{
    //    // 索引贴图路径（原有行为，保持向后兼容）
    //    // 采样 R8 索引贴图，linear空间，值范围 [0, 1]
    //    float rawIndex = tex2D(_WeatherIndexTex, worldUV).r;
    //    // R8 贴图存储的是 byte 值 / 255.0，还原为整数索引
    //    int index = (int)(rawIndex * 255.0 + 0.5);
    //    index = clamp(index, 0, _WeatherFogColorCount - 1);
    //    result.rayleighTintColor = _WeatherRayleighColors[index];
    //    result.mieTintColor      = _WeatherMieColors[index];
    //    result.heightFogColor    = _WeatherHeightFogColors[index];
    //}
    return result;
}
*/

// ScreenCenterFog - 屏幕中央雾效遮罩（中心清晰，边缘保持雾效）
// 参数打包方式（屏幕空间UV模式）：
//   _ScreenCenterFogParams0: (ClearRadius, FadeWidth, MaxDensity, Reserved)
//   _ScreenCenterFogParams1: (CenterOffset.x, CenterOffset.y, Reserved, Reserved)
//   _ScreenCenterFogParams2: (AspectRatio, 0, 0, 1.0)
half4 _ScreenCenterFogParams0;
half4 _ScreenCenterFogParams1;
half4 _ScreenCenterFogParams2;


half Rayleigh(half Mu)
{
    return (3.0 / (16.0 * PI)) * (1.0 + Mu * Mu);
}

half Mie(half Mu, half g) 
{
	return 1.5 * 1.0 / (4.0 * PI) * (1.0 - g * g) * pow( abs(1.0 + (g * g) - 2.0 * g * Mu), -3.0/2.0) * (1.0 + Mu * Mu) / (2.0 + g * g);
	//return (1.0 - g * g) / (4.0 * PI * Pow2(1.0 + g * g - 1.8 * g * mu));
}

#ifndef UNITY_CG_INCLUDED
inline half3 GammaToLinearSpace (half3 sRGB)
{
    // Approximate version from http://chilliant.blogspot.com.au/2012/08/srgb-approximations-for-hlsl.html?m=1
    return sRGB * (sRGB * (sRGB * 0.305306011h + 0.682171111h) + 0.012522878h);

    // Precise version, useful for debugging.
    //return half3(GammaToLinearSpaceExact(sRGB.r), GammaToLinearSpaceExact(sRGB.g), GammaToLinearSpaceExact(sRGB.b));
}

inline half3 LinearToGammaSpace (half3 linRGB)
{
    linRGB = max(linRGB, half3(0.h, 0.h, 0.h));
    // An almost-perfect approximation from http://chilliant.blogspot.com.au/2012/08/srgb-approximations-for-hlsl.html?m=1
    return max(1.055h * pow(linRGB, 0.416666667h) - 0.055h, 0.h);

    // Exact version, useful for debugging.
    //return half3(LinearToGammaSpaceExact(linRGB.r), LinearToGammaSpaceExact(linRGB.g), LinearToGammaSpaceExact(linRGB.b));
}
#endif

static const half FLT_EPSILON2 = 0.01f;

#ifdef FOG_TERRAIN_ADAPT_ON
#include "../Terrain/VTCommon.cginc"
#endif

// 通用 VT 地形高度采样函数，返回地形 Y 值。
// 当 FOG_TERRAIN_ADAPT_ON 宏未定义时返回 0（表示无地形偏移）。
float GetTerrainHeightFromVT(float3 WorldPos)
{
#ifdef FOG_TERRAIN_ADAPT_ON
    TerrainVTResult vtResult = SampleFromVTByWorldPos(WorldPos);
    // 对 VT 采样结果做范围保护，防止异常数据导致 NaN/Inf
    return clamp(vtResult.worldY, -1e6, 1e6);
#else
    return 0;
#endif
}

// 兼容包装：VT y 替代 WorldPos.y 参与高度雾衰减，使高海拔区域也能获得与低海拔一致的雾效。
// 未 include VTCommon.cginc 的 Shader 自动跳过 VT 采样，保持原始行为。
float AdjustWorldPosYForHeightFog(float3 WorldPos)
{
#ifdef FOG_TERRAIN_ADAPT_ON
    if (BnSFog_TerrainAdaptHeightFog > 0.5)
    {
        float terrainY = GetTerrainHeightFromVT(WorldPos);
        return WorldPos.y - terrainY;
    }
#endif
    return WorldPos.y;
}

half CalcFogFalloff(half BaseZ, float EyePosZ, float EyeToWorldZ, half Falloff, half StartRatio)
{
// #if 1
// 	// Exponential falloff for start distance 
// 	if (StartRatio > 0)
// 	{
		float Exponent = max(-127.f, EyePosZ + EyeToWorldZ * StartRatio - BaseZ);
		float OrigTerms = exp2(-Exponent * Falloff);
		EyeToWorldZ *= (1 - StartRatio);
//	}
// #else
// 	// Linear falloff for start distance 
//     OrigTerms *= (1 - StartRatio);
// 	EyeToWorldZ *= (1 - StartRatio);
// #endif

    float t = clamp(EyeToWorldZ * Falloff,-64.f, -0.001);
	float LineIntegral = ( 1.0f - exp2(-t) ) / t;
	//half LineIntegralTaylor = log(2.0) - ( 0.5 * Pow2( log(2.0) ) ) * t; // Taylor expansion around 0
	//half LineIntegralTaylor = 0.693147f - 0.045309529f * t; // Taylor expansion around 0
	half LineIntegralTaylor = 0.693147f;
	half LineIntegralFinal = OrigTerms * ( abs(t) > FLT_EPSILON2 ? LineIntegral : LineIntegralTaylor );

	return LineIntegralFinal;
}

half4 CalcBnSFogColor(half3 WorldPos)
{
    float3 EyePos = _WorldSpaceCameraPos;
    
	float3 EyeToWorld = WorldPos - EyePos;
    half3 V = SafeNormalize(EyeToWorld);
    half D = length(EyeToWorld);

	half D_Atmospheric = max(0, D - BnSFog_AtmosStartDist);

	//-----------------------------------------
	// 地形高度适配：统一执行一次 VT 采样，供大气雾和高度雾共享
	float terrainY = 0;
#ifdef FOG_TERRAIN_ADAPT_ON
	if (BnSFog_TerrainAdaptAtmosFog > 0.5 || BnSFog_TerrainAdaptHeightFog > 0.5)
	{
		terrainY = GetTerrainHeightFromVT(WorldPos);
	}
#endif

#if (SHADER_LOD > 200)
	//-----------------------------------------
    // Atmospheric Fog
    const half BetaT = BnSFog_BetaRs + BnSFog_BetaMs;

	// 大气雾地形适配：使用相对地形高度参与衰减计算
	float atmosEyeToWorldY = EyeToWorld.y;
	half atmosD = D_Atmospheric;
#ifdef FOG_TERRAIN_ADAPT_ON
	if (BnSFog_TerrainAdaptAtmosFog > 0.5)
	{
		float adjustedAtmosWorldY = WorldPos.y - terrainY;
		atmosEyeToWorldY = adjustedAtmosWorldY - EyePos.y;
		float atmosAdjustedD = length(float3(EyeToWorld.x, atmosEyeToWorldY, EyeToWorld.z));
		atmosD = max(0, atmosAdjustedD - BnSFog_AtmosStartDist);
	}
#endif

	half AtmosFalloff = CalcFogFalloff(BnSFog_AtmosBaseZ, EyePos.y, atmosEyeToWorldY, BnSFog_AtmosFalloff,
		saturate(BnSFog_AtmosStartDist / D));
    half T_Atmos = max(exp2(-atmosD * AtmosFalloff * BetaT * BnSFog_AtmosFogDensity), BnSFog_AtmosMinOpacity);

	half3 sunDirection = DirectionalLightDir.xyz;
    half Nu = dot(sunDirection, V);

    half3 SingleR = BnSFog_AlbedoR * BnSFog_BetaRs * Rayleigh(Nu);
    half3 SingleM = BnSFog_AlbedoM * BnSFog_BetaMs * Mie(Nu, BnSFog_MieG);

	half3 sunColor = DirectionalLightColor.xyz;
#ifdef UNITY_COLORSPACE_GAMMA
        sunColor = GammaToLinearSpace(sunColor);
#endif
	sunColor *= BnSFog_SunInscatterIntensity;
    half3 Inscatter = sunColor * (SingleR + SingleM) / BetaT;

    half4 GlobalFog = half4(Inscatter * (1 - T_Atmos), T_Atmos);
#endif
	//-----------------------------------------
    // Height Fog

	// 高低地适配高度雾：使用缓存的 terrainY 计算相对高度
	float adjustedWorldY = WorldPos.y;
    float heightFogBaseZ = BnSFog_HeightFogBaseZ;
#ifdef FOG_TERRAIN_ADAPT_ON
	if (BnSFog_TerrainAdaptHeightFog > 0.5)
	{
		adjustedWorldY = WorldPos.y - terrainY;
	    heightFogBaseZ += terrainY;
	}
#endif
	//float adjustedEyeToWorldY = adjustedWorldY - EyePos.y;
    //D = length(float3(WorldPos.x, WorldPos.y, WorldPos.z) - EyePos);
    half D_HeightFog = max(0, D - BnSFog_HeightFogStartDist);
	half HeightFalloff = CalcFogFalloff(heightFogBaseZ, EyePos.y, EyeToWorld.y, BnSFog_HeightFogFalloff,
		saturate(BnSFog_HeightFogStartDist / D));
    half T_Height = max(exp2(-D_HeightFog * HeightFalloff * BnSFog_HeightFogDensity), BnSFog_HeightFogMinOpacity);

	// FadeInRange 遮罩：在 [StartDist, StartDist+FadeInRange] 范围内平滑淡入雾效
	// FadeInRange=0 时 max(...,0.0001) 保证 smoothstep 两端相等退化为 step，向后兼容
	half atmosFadeMask = smoothstep(BnSFog_AtmosStartDist,
		BnSFog_AtmosStartDist + max(BnSFog_AtmosFadeInRange, 0.0001h), D);
	half heightFadeMask = smoothstep(BnSFog_HeightFogStartDist,
		BnSFog_HeightFogStartDist + max(BnSFog_HeightFadeInRange, 0.0001h), D);

	// Blend 
	half4 OutColor;
#if (SHADER_LOD > 200)
	// 对大气雾和高度雾分别应用渐隐遮罩后再混合
	half4 GlobalFogFaded = half4(GlobalFog.rgb * atmosFadeMask, lerp(1.0h, GlobalFog.a, atmosFadeMask));
	half T_HeightFaded = lerp(1.0h, T_Height, heightFadeMask);
	OutColor.rgb = BnSFog_HeightFogColor * (1 - T_HeightFaded) + GlobalFogFaded.rgb * T_HeightFaded;
	OutColor.a = (T_HeightFaded * GlobalFogFaded.a);
#else
	half T_HeightFaded = lerp(1.0h, T_Height, heightFadeMask); 
	OutColor.rgb = BnSFog_HeightFogColor * (1 - T_HeightFaded);
	OutColor.a = T_HeightFaded;
#endif

    // fog Mask
    if(BnSFog_FogMaskEnabled > 0.5f)
    {
        float2 maskUV = WorldPos.xz * BnSFog_FogMaskUVScaleOffset.xy +  BnSFog_FogMaskUVScaleOffset.zw;
        
        half mask = BnSFog_FogMaskTex.SampleLevel(BnsFog_LinearClampSampler, maskUV, 0.0);
        mask = pow(mask, BnSFog_FogMaskStrength);
        OutColor.a = lerp(OutColor.a, 1, mask);
        OutColor.rgb = lerp(OutColor.rgb, 0, mask);
    }
#ifdef UNITY_COLORSPACE_GAMMA
        OutColor.rgb = LinearToGammaSpace(OutColor.rgb);
#endif

    // ScreenCenterFog - 屏幕中央雾效遮罩（中心清晰，边缘保持雾效）
    // 当 MaxDensity > 0 时才计算，否则零开销
    half scFogMaxDensity = _ScreenCenterFogParams0.z;
    if (scFogMaxDensity > 0)
    {
        half scClearRadius = _ScreenCenterFogParams0.x;
        half scFadeWidth   = _ScreenCenterFogParams0.y;

        half scDist;

        // 屏幕空间UV模式：通过VP矩阵将世界坐标转换为屏幕UV
        {
            float4 clipPos = mul(UNITY_MATRIX_VP, float4((float3)WorldPos, 1.0));
            float2 screenUV = (clipPos.xy / clipPos.w) * 0.5 + 0.5;

            // 屏幕空间中心 = (0.5, 0.5) + CenterOffset
            float2 screenCenter = float2(0.5, 0.5) + float2(_ScreenCenterFogParams1.x, _ScreenCenterFogParams1.y);

            // 宽高比修正，确保圆形遮罩区域在非正方形屏幕上保持正圆
            float aspectRatio = _ScreenCenterFogParams2.x;
            float2 delta = screenUV - screenCenter;
            //delta.x *= aspectRatio;

            scDist = (half)length(delta);
        }

        // smoothstep 平滑过渡：中心=1（清晰），边缘=0（保持雾效）
        half scFogMask = (1.0 - smoothstep(scClearRadius, scClearRadius + scFadeWidth, scDist)) * scFogMaxDensity;

        // 用遮罩减弱原有雾效：中心区域消除雾效，边缘保持原有雾效
        OutColor.rgb *= (1.0 - scFogMask);
        OutColor.a = lerp(OutColor.a, 1.0, scFogMask);
    }
    
	return OutColor;
}

#ifdef DEBUG_FOG_VIEW
// 调试用：返回 D_HeightFog 的归一化值，用于可视化高度雾距离
half3 CalcDebugHeightFogValue(half3 WorldPos)
{
    float3 EyePos = _WorldSpaceCameraPos;
    float3 EyeToWorld = WorldPos - EyePos;
    half D = length(EyeToWorld);
    half D_HeightFog = max(0, D - BnSFog_HeightFogStartDist);
    return EyePos.xyz;//saturate(D_HeightFog / 500.0);
}
#endif

half4 CalcBnSFogCoe(half3 WorldPos)
{
	half3 EyePos = _WorldSpaceCameraPos;
	half3 EyeToWorld = WorldPos - EyePos;
    half3 V = SafeNormalize(EyeToWorld);
    half D = length(EyeToWorld);

	half D_Atmospheric = max(0, D - BnSFog_AtmosStartDist);
	half D_HeightFog = max(0, D - BnSFog_HeightFogStartDist);

	//-----------------------------------------
	// 地形高度适配：统一执行一次 VT 采样，供大气雾和高度雾共享
	float terrainY = 0;
#ifdef FOG_TERRAIN_ADAPT_ON
	if (BnSFog_TerrainAdaptAtmosFog > 0.5 || BnSFog_TerrainAdaptHeightFog > 0.5)
	{
		terrainY = GetTerrainHeightFromVT(WorldPos);
	}
#endif

	//-----------------------------------------
    // Atmospheric Fog
    const half BetaT = BnSFog_BetaRs + BnSFog_BetaMs;

	// 大气雾地形适配：使用相对地形高度参与衰减计算
	float atmosEyeToWorldY = EyeToWorld.y;
	half atmosD = D_Atmospheric;
#ifdef FOG_TERRAIN_ADAPT_ON
	if (BnSFog_TerrainAdaptAtmosFog > 0.5)
	{
		float adjustedAtmosWorldY = WorldPos.y - terrainY;
		atmosEyeToWorldY = adjustedAtmosWorldY - EyePos.y;
		float atmosAdjustedD = length(float3(EyeToWorld.x, atmosEyeToWorldY, EyeToWorld.z));
		atmosD = max(0, atmosAdjustedD - BnSFog_AtmosStartDist);
	}
#endif

	half AtmosFalloff = CalcFogFalloff(BnSFog_AtmosBaseZ, EyePos.y, atmosEyeToWorldY, BnSFog_AtmosFalloff,
		saturate(BnSFog_AtmosStartDist / D));
    half T_Atmos = max(exp2(-atmosD * AtmosFalloff * BetaT * BnSFog_AtmosFogDensity), BnSFog_AtmosMinOpacity);

	half3 sunDirection = DirectionalLightDir.xyz;
    half Nu = dot(sunDirection, V);

	half3 sunColor = DirectionalLightColor;
#ifdef UNITY_COLORSPACE_GAMMA
        sunColor = GammaToLinearSpace(sunColor);
#endif
	sunColor *= BnSFog_SunInscatterIntensity;

	//-----------------------------------------
    // Height Fog

	// 高低地适配高度雾：使用缓存的 terrainY 计算相对高度
	float adjustedWorldY = WorldPos.y;
#ifdef FOG_TERRAIN_ADAPT_ON
	if (BnSFog_TerrainAdaptHeightFog > 0.5)
	{
		adjustedWorldY = WorldPos.y - terrainY;
	}
#endif
	float adjustedEyeToWorldY = adjustedWorldY - EyePos.y;

	half HeightFalloff = CalcFogFalloff(BnSFog_HeightFogBaseZ, EyePos.y, adjustedEyeToWorldY, BnSFog_HeightFogFalloff,
		saturate(BnSFog_HeightFogStartDist / D));
    half T_Height = max(exp2(-D_HeightFog * HeightFalloff * BnSFog_HeightFogDensity), BnSFog_HeightFogMinOpacity);

	// FadeInRange 遮罩（顶点着色器路径，与 CalcBnSFogColor 保持一致）
	half atmosFadeMask = smoothstep(BnSFog_AtmosStartDist,
		BnSFog_AtmosStartDist + max(BnSFog_AtmosFadeInRange, 0.0001h), D);
	half heightFadeMask = smoothstep(BnSFog_HeightFogStartDist,
		BnSFog_HeightFogStartDist + max(BnSFog_HeightFadeInRange, 0.0001h), D);

	half T_HeightFaded = lerp(1.0h, T_Height, heightFadeMask);
	half T_AtmosFaded  = lerp(1.0h, T_Atmos,  atmosFadeMask);

	half4 OutColor;
	OutColor.r = T_HeightFaded;
	OutColor.g = (1 - T_AtmosFaded) * sunColor / BetaT * BnSFog_BetaRs * Rayleigh(Nu) * T_HeightFaded;
	OutColor.b = sunColor / BetaT * BnSFog_BetaMs * T_HeightFaded * (1 - T_AtmosFaded);
	OutColor.a = T_AtmosFaded * T_HeightFaded;

	return OutColor;
}

half4 ApplyBnsFogCoe(half3 WorldPos, half4 coe)
{
	half3 EyePos = _WorldSpaceCameraPos;
	half3 EyeToWorld = WorldPos - EyePos;
    half3 V = SafeNormalize(EyeToWorld);
	half3 sunDirection = DirectionalLightDir.xyz;
    half Nu = dot(sunDirection, V);

	half4 OutColor;
	OutColor.rgb = BnSFog_HeightFogColor * (1 - coe.r);
	OutColor.rgb += BnSFog_AlbedoR * coe.g;
	OutColor.rgb += BnSFog_AlbedoM * Mie(Nu, BnSFog_MieG) * coe.b;

	OutColor.a = coe.a;

	return OutColor;
}
#endif