#ifndef BNS_FOG_COMMON_CGINC_
#define BNS_FOG_COMMON_CGINC_
//#include "UnityLightingCommon.cginc"
#include "../Base/Lighting.cginc"
#include "GlobalParameters.cginc"

#ifndef BNS_FULL_PIXEL_FOG
#define BNS_FULL_PIXEL_FOG 0
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


half Rayleigh(half Mu)
{
    return (3.0 / (16.0 * PI)) * (1.0 + Mu * Mu);
}

half Mie(half Mu, half g) 
{
	return 1.5 * 1.0 / (4.0 * PI) * (1.0 - g * g) * pow( abs(1.0 + (g * g) - 2.0 * g * Mu), -3.0/2.0) * (1.0 + Mu * Mu) / (2.0 + g * g);
	//return (1.0 - g * g) / (4.0 * PI * Pow2(1.0 + g * g - 1.8 * g * mu));
}

static const half FLT_EPSILON2 = 0.01f;

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

    float t = max(-64.f, EyeToWorldZ * Falloff);
	float LineIntegral = ( 1.0f - exp2(-t) ) / t;
	//half LineIntegralTaylor = log(2.0) - ( 0.5 * Pow2( log(2.0) ) ) * t; // Taylor expansion around 0
	//half LineIntegralTaylor = 0.693147f - 0.045309529f * t; // Taylor expansion around 0
	half LineIntegralTaylor = 0.693147f;
	half LineIntegralFinal = OrigTerms * ( abs(t) > FLT_EPSILON2 ? LineIntegral : LineIntegralTaylor );

	return LineIntegralFinal;
}

half4 CalcBnSFogColor(half3 WorldPos)
{
	if (gFogFuncEnabled < 0.5h)
		return half4(0.0h, 0.0h, 0.0h, 1.0h);

	float3 EyePos = _WorldSpaceCameraPos;
	float3 EyeToWorld = WorldPos - EyePos;
    half3 V = SafeNormalize(EyeToWorld);
    half D = length(EyeToWorld);

	half D_Atmospheric = max(0, D - BnSFog_AtmosStartDist);
	half D_HeightFog = max(0, D - BnSFog_HeightFogStartDist);

#if (SHADER_LOD > 200)
	//-----------------------------------------
    // Atmospheric Fog
    const half BetaT = BnSFog_BetaRs + BnSFog_BetaMs;

	half AtmosFalloff = CalcFogFalloff(BnSFog_AtmosBaseZ, EyePos.y, EyeToWorld.y, BnSFog_AtmosFalloff,
		saturate(BnSFog_AtmosStartDist / D));
    half T_Atmos = max(exp2(-D_Atmospheric * AtmosFalloff * BetaT * BnSFog_AtmosFogDensity), BnSFog_AtmosMinOpacity);

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

	half HeightFalloff = CalcFogFalloff(BnSFog_HeightFogBaseZ, EyePos.y, EyeToWorld.y, BnSFog_HeightFogFalloff,
		saturate(BnSFog_HeightFogStartDist / D));
    half T_Height = max(exp2(-D_HeightFog * HeightFalloff * BnSFog_HeightFogDensity), BnSFog_HeightFogMinOpacity);

	// Blend 
	half4 OutColor;
#if (SHADER_LOD > 200)
	OutColor.rgb = BnSFog_HeightFogColor * (1 - T_Height) + GlobalFog.rgb * T_Height;
	OutColor.a = (T_Height * GlobalFog.a);
#else
	OutColor.rgb = BnSFog_HeightFogColor * (1 - T_Height);
	OutColor.a = T_Height;
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
    
	return OutColor;
}

half4 CalcBnSFogCoe(half3 WorldPos)
{
	if (gFogFuncEnabled < 0.5h)
		return half4(1.0h, 0.0h, 0.0h, 1.0h);

	half3 EyePos = _WorldSpaceCameraPos;
	half3 EyeToWorld = WorldPos - EyePos;
    half3 V = SafeNormalize(EyeToWorld);
    half D = length(EyeToWorld);

	half D_Atmospheric = max(0, D - BnSFog_AtmosStartDist);
	half D_HeightFog = max(0, D - BnSFog_HeightFogStartDist);

	//-----------------------------------------
    // Atmospheric Fog
    const half BetaT = BnSFog_BetaRs + BnSFog_BetaMs;

	half AtmosFalloff = CalcFogFalloff(BnSFog_AtmosBaseZ, EyePos.y, EyeToWorld.y, BnSFog_AtmosFalloff,
		saturate(BnSFog_AtmosStartDist / D));
    half T_Atmos = max(exp2(-D_Atmospheric * AtmosFalloff * BetaT * BnSFog_AtmosFogDensity), BnSFog_AtmosMinOpacity);

	half3 sunDirection = DirectionalLightDir.xyz;
    half Nu = dot(sunDirection, V);

	half3 sunColor = DirectionalLightColor;
#ifdef UNITY_COLORSPACE_GAMMA
        sunColor = GammaToLinearSpace(sunColor);
#endif
	sunColor *= BnSFog_SunInscatterIntensity;

	//-----------------------------------------
    // Height Fog

	half HeightFalloff = CalcFogFalloff(BnSFog_HeightFogBaseZ, EyePos.y, EyeToWorld.y, BnSFog_HeightFogFalloff,
		saturate(BnSFog_HeightFogStartDist / D));
    half T_Height = max(exp2(-D_HeightFog * HeightFalloff * BnSFog_HeightFogDensity), BnSFog_HeightFogMinOpacity);

	half4 OutColor;
	OutColor.r = T_Height;
	OutColor.g = (1 - T_Atmos) * sunColor / BetaT * BnSFog_BetaRs * Rayleigh(Nu) * T_Height;
	OutColor.b = sunColor / BetaT * BnSFog_BetaMs * T_Height * (1 - T_Atmos);
	OutColor.a = T_Atmos * T_Height;

	return OutColor;
}

half4 ApplyBnsFogCoe(half3 WorldPos, half4 coe)
{
	if (gFogFuncEnabled < 0.5h)
		return half4(0.0h, 0.0h, 0.0h, 1.0h);

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
