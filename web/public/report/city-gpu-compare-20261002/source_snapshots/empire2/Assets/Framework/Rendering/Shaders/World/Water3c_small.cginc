#ifndef WATER_SMALL_CGINC
#define WATER_SMALL_CGINC

#define LIGHTING_FAKE_SPECULAR 1

#if (SHADER_LOD > 100)
#define GET_VS_MATERIAL_INPUT_PARAMETER(i,j) GetVSMaterialInputParameter(i,j)
#endif
#define GET_FS_MATERIAL_INPUT_PARAMETER(i) GetFSMaterialInputParameter(i)

#if (SHADER_LOD > 200)

#define DCL_EXT_PARAMS \
    float4 PackedData0; \
    float4 PackedData2; 

#define DCL_VSOUT_EXT_PARAMS \
    float4 PackedData0 : TEXCOORD10; \
    float4 PackedData2 : TEXCOORD11;

#define TRANSFER_EXT_PARAMS(a, b) \
    b.PackedData0 = a.PackedData0; \
    b.PackedData2 = a.PackedData2;

#else

    #define DCL_EXT_PARAMS \
        float4 PackedData0;

    #define DCL_VSOUT_EXT_PARAMS \
        float4 PackedData0 : TEXCOORD10;

    #define TRANSFER_EXT_PARAMS(a, b) \
        b.PackedData0 = a.PackedData0;

#endif

#define LOD_DEBUG_OFF		    1

#include "../Base/Common.cginc"
#include "../Base/PlanarReflection.cginc"


half3 GradientMap_Multi(float greyScale, float index, sampler2D tex, float number)
{
    float num = 1.0 / ceil(number);
    float4 uv = float4(greyScale, num * ceil(index) + num * 0.5, 0, 0);
    return tex2Dlod(tex, uv).xyz;
}

float3 MS_VertexAnimationTools_MorphTargets(float animation, sampler2D normal, float2 uv)
{
    float numberTargets = 64.0;
    float time = animation * (numberTargets - 1.0);
    float index = floor(time);
    half factor = frac(time);
    half3 gradient_3 = GradientMap_Multi(uv.x, index + 1, normal, numberTargets);
    half3 gradient_4 = GradientMap_Multi(uv.x, index, normal, numberTargets);
    half3 gradient_lerp = lerp(gradient_4, gradient_3, factor);
    return gradient_lerp * 2.0 - 1.0;
}

float MF_OceanWavesWPO(float3 worldPos)
{
    float masterSpeed = _WPO_MasterSpeed;
    float3 waveSpeed = _WPO_WaveSpeed.xyz;
    float3 waveScale = _WPO_WaveScale.xyz;
    float3 waveIntensity = _WPO_WaveIntensity.xyz * _WPO_WaveIntensity.w;
    
    float time = _Time.y * masterSpeed;
    float3 speed = (worldPos.xxz / waveScale - time * waveSpeed) * 6.28319;
    float3 wave = waveIntensity * sin(speed);
    float scalar = (wave.x + wave.y + wave.z) * 2.0;
    return scalar;
}

#if (SHADER_LOD > 200)
// #ifndef NEW_FAKE_SPECULAR_MODE
#ifdef SPECULAR_MODE
float4 MF_FakeSpecular_UV(float3 worldPos)
{
    // float2 pos = float2(-worldPos.x, worldPos.z) / _SpecularTiling;
    float2 pos = float2(worldPos.z, -worldPos.x) / _SpecularTiling;
    float time = _Time.y * 0.5;
    float2 uv1 = pos + time * float2(0.1, 0.05);
    float2 uv2 = pos * 1.5 + time * float2(-0.05, -0.1);
    return float4(uv1, uv2);
}
#endif
#endif

VSMaterialInputParameter GetVSMaterialInputParameter(VertexShaderInput input, VertexShaderMaterialParameter parameter)
{
    VSMaterialInputParameter o = (VSMaterialInputParameter)0;
    
    float3 worldPos = parameter.WorldPosition;
    float2 uv1 = input.UV1;

    //float3 wave = MF_OceanWavesWPO(worldPos.xyz);

#if (SHADER_LOD > 200)
    //float4 noise = float4(0.0,0.0,0.0,1.0);//tex2Dlod(_NoiseTex, float4(-worldPos.zx * 0.01 + wave.zx * 0.05, 0, 0));

    //float waveTime = (worldPos.x / _VertexWaveTiling + _Time.y) * _VertexWaveSpeed;
    //float3 waveNormal = MS_VertexAnimationTools_MorphTargets(waveTime, _WaveNormal, uv1);
    // waveNormal = lerp(float3(0, 0, 1), waveNormal, input.VertexColor.x);

    //float shoreTime = (dot(worldPos.zx / _VertexShoreTiling, _WaveDirection.zw) - _Time.y) * _VertexShoreSpeed;
    //float3 shoreNormal = MS_VertexAnimationTools_MorphTargets(shoreTime, _ShoreNormal, uv1);

    //waveNormal = waveNormal * noise.x * _VertexWaveIntensity + shoreNormal * noise.y * _VertexShoreIntensity;
    //o.PackedData0.xyz = float3(0, 0, 0);//waveNormal;
    o.PackedData0.z = 0.0;
    o.PackedData0.x = input.VertexColor.w;
#else
    // o.PackedData0.xyz = float3(0, 0, 1);
    o.PackedData0.z = 1.0;
    o.PackedData0.x = input.VertexColor.w;
#endif
    
    // o.PackedData0.w = MF_OceanWavesWPO(worldPos.xyz);
    o.WorldPositionOffset = float3(0, 0, 0);//float3(0, wave.y, 0);
    
    // float foamIntensity_1 = sin(worldPos.x / _EdgeFoamRandom.x + _EdgeFoamRandom.z) * 0.5 + 0.5;
    // float foamIntensity_2 = sin(worldPos.x / _EdgeFoamRandom.y + _EdgeFoamRandom.w) * 0.5 + 0.5;
    // o.PackedData1.xy = float2(foamIntensity_1, foamIntensity_2);
    // o.PackedData1.xy *= o.PackedData1.xy;
    
    // float bump_time2 = 5.0 * sin((_Time.y * 0.05 + worldPos.x / 90) * 6.28319);
    // float bump_time2 = t5_control.x * sin((_Time.y * t5_control.y + worldPos.x / t5_control.z) * t5_control.w);
    // o.PackedData1.z = bump_time2;
    // o.PackedData0.w = bump_time2;
    
    // float edgeFoam_uv2_w = sin((-worldPos.x / 75 + frac(_Time.y * 0.1)) * 6.28319);
    // o.PackedData1.w = edgeFoam_uv2_w;

#if (SHADER_LOD > 200)
    // #ifndef NEW_FAKE_SPECULAR_MODE
    #ifdef SPECULAR_MODE
        o.PackedData2 = MF_FakeSpecular_UV(worldPos);
    #else
        o.PackedData2 = float4(0, 0, 0, 0);
    #endif
#endif
    
    return o;
}

float2 MF_Foam_Motion(float3 worldPos, float2 uv, float tiling, float speed, float offset, float variation)
{
    float time = frac(_Time.y * speed) + worldPos.x / variation;
    return uv * tiling + offset * sin(time * 6.28319) * float2(0, 0.1);
}

#if (SHADER_LOD > 200)
    // #ifndef NEW_FAKE_SPECULAR_MODE
    #ifdef SPECULAR_MODE
        float MF_FakeSpecular(float4 uv, sampler2D tex, float3 customLightDir, float3 viewDir, float3 worldN)
        {
            float3 specTex_1 = Tex2D(tex, uv.xy).xyz;
            float3 specTex_2 = Tex2D(tex, uv.zw).xyz;

            float R = saturate(dot(reflect(-viewDir, worldN), customLightDir));
            float specLevel_1 = pow(R, _SpecularPower.x);
            float specLevel_2 = pow(R, _SpecularPower.y);
            float specLevel_3 = pow(R, _SpecularPower.z);

            float spec_1 = specTex_1.x * specTex_2.x * specLevel_1;
            float spec_2 = specTex_1.y * specTex_2.y * specLevel_2;
            float spec_3 = specTex_1.z * specTex_2.z * specLevel_3;

            float final = (spec_1 + spec_2 + spec_3) * _SpecularIntensity;
            return final;
        }
    // #else
    //     float3 NewFakeSpecular(float gloss, float3 customLightDir, float3 viewDir, float3 worldN, float3 vertexTangent, float3 vertexNormal)
    //     {
    //         float3 h = SafeNormalize(-customLightDir - viewDir);
    //         float2 sc;
	//         sincos(_FakeSpecAnisoDir * 6.283185, sc.x, sc.y);
    //         float3 tangent = sc.y * vertexTangent + sc.x * vertexNormal;
    //         tangent = tangent - worldN * dot(tangent, worldN);
    //         tangent = SafeNormalize(tangent);
    //         float3 bitangent = SafeNormalize(cross(worldN, tangent));
    //         h = SafeNormalize(h - bitangent * dot(h, bitangent) * _FakeSpecAnisotropic);
    //         float nh = saturate(dot(worldN, h));
    //         float spec = pow(nh, gloss * 128);
    //         float3 final = spec * _FakeSpecColor * _FakeSpecIntensity;
    //         return final;
    //     }
    #endif
#endif

#if (SHADER_LOD > 100)
float UE_DepthFade(float sceneDepth, float pixelDepth, float fadeDistance)
{
    return saturate((sceneDepth - pixelDepth) / fadeDistance);
}
#endif

fixed3 UnpackNormalmapRGorAG(fixed4 packednormal)
{
    // This do the trick
    packednormal.x *= packednormal.w;

    fixed3 normal;
    normal.xy = packednormal.xy * 2 - 1;
    normal.z = sqrt(1 - saturate(dot(normal.xy, normal.xy)));
    return normal;
}

inline fixed3 UnpackNormal(fixed4 packednormal)
{
#if defined(UNITY_NO_DXT5nm)
    return packednormal.xyz * 2 - 1;
#else
    return UnpackNormalmapRGorAG(packednormal);
#endif
}

inline float3 UnityWorldSpaceViewDir( in float3 worldPos )
{
    return _WorldSpaceCameraPos.xyz - worldPos;
}

FSMaterialInputParameter GetFSMaterialInputParameter(FragmentShaderInput i)
{
    FSMaterialInputParameter o = GetDefaultFSMaterialInputParameter();
   
    float4 WaveNormal = float4(0,0,i.PackedData0.z,0);//i.PackedData0.xyzw;
    float3 worldPos = i.AbsoluteWorldPosition.xyz;
    // float4 PackedData = i.PackedData1.xyzw;
// #if (SHADER_LOD > 200)
//     float4 SpecularUV = i.PackedData2.xyzw;
//     float3 viewDir = SafeNormalize(UnityWorldSpaceViewDir(worldPos));
// #endif

#if (SHADER_LOD > 100)
    //====== Depth =============================================
    #if defined(DEPTH_FETCH_ON_ANDROID) || defined(DEPTH_FETCH_ON_IOS)
        float sceneDepth = LinearEyeDepth(i.depth);
    #elif defined(SHADER_API_VULKAN) &&  defined(DEPTH_FETCH_ON)
        float sceneDepth = LinearEyeDepth(UNITY_READ_FRAMEBUFFER_INPUT(0, i.ProjectedPos).r);
    #else
		float sceneDepth = LinearEyeDepth(SAMPLE_DEPTH_TEXTURE_PROJ(SceneDepthCopyTex, UNITY_PROJ_COORD(i.ProjectedPos)));
    #endif
    float pixelDepth = i.ProjectedPos.w;
    //float waterRange = depthDiff / _ColorRange;
    #ifndef EDGE_OPACITY_VERT_COLOR_MODE
        float waterRange = UE_DepthFade(sceneDepth, pixelDepth, _ColorRange);
    #else
        float vertColA = i.PackedData0.x;
        float waterRange = saturate(vertColA * _ColorRange);// + _ColorRange * 0.5); 
    #endif
#endif

    //====== Shore Map =============================================
    //float2 shoreMaskUV = (worldPos.xz - _ShoreMask_UV.xy) / _ShoreMask_UV.z;
    //fixed4 shoreMask = Tex2D(_ShoreMask, shoreMaskUV.xy);

    //shoreMask.xy = shoreMask.xy * 2.0 - 1.0;

    //fixed shoreRange = 0.0;//shoreMask.z;
    //fixed waterRange = saturate(1.0-_ColorRange);// 1.0;//1.0 - shoreMask.z;
    //fixed waterRange = UE_DepthFade(sceneDepth, pixelDepth, _ColorRange);

    //====== Normal Map =============================================
    float bump_time1 = _Time.y;
    float bump_time2 = 0;//WaveNormal.w;
    // float bump_time2 = 0;
    float2 bump_uv = float2(-worldPos.z, -worldPos.x);
    float2 bump_uv1 = bump_uv / t5_uv1.z + t5_uv1.xy * float2(bump_time1, bump_time2);
    float2 bump_uv2 = bump_uv / t5_uv2.z + t5_uv2.xy * float2(bump_time1, bump_time2);

    float3 bump1 = UnpackNormal(Tex2D(t5, bump_uv1));
    float3 bump2 = UnpackNormal(Tex2D(t5, bump_uv2));
    float3 bump12 = bump1 + bump2;
    float3 bump = lerp(float3(0, 0, 1), bump12, t5_intensity);

#if (SHADER_LOD > 200)
    //bump += WaveNormal.xyz * waterRange;
#endif

#ifdef FOAM_MODE
#if (SHADER_LOD > 200)
    //====== Edge Foam =============================================
    #ifndef EDGE_OPACITY_VERT_COLOR_MODE
        float shoreDepthRange = UE_DepthFade(sceneDepth, pixelDepth, _EdgeFoamRange);
        shoreDepthRange *= _EdgeFoamPower;

        float waveFoamRange = 1.0 - UE_DepthFade(sceneDepth, pixelDepth, _WaveFoamRange);//for wave foam
    #else
        float shoreDepthRange = saturate(vertColA * _EdgeFoamRange);

        float waveFoamRange = saturate(vertColA * _WaveFoamRange);//for wave foam
    #endif

    float2 edgeFoam_uv = -worldPos.xz * _EdgeFoamTiling;
    float4 edgeFoamMap = Tex2D(_FoamTex, edgeFoam_uv + bump.xy * _EdgeFoamDistortion);

    float4 waveRamp = Tex2D(_ShoreWaveRamp, float2(shoreDepthRange, 0.5));
    float edgeFoam = waveRamp.x * edgeFoamMap.y + waveRamp.y * edgeFoamMap.z;

    edgeFoam *= _EdgeFoamOpacity;

    //====== Wave Foam =============================================
    float4 waveFoam_uv =  i.UV0.xyxy * _WaveFoamTiling + _Time.y * _WaveFoamOffset + bump.xyxy * _WaveFoamDistortion;
    float4 waveFoamMap = Tex2D(_FoamTex, waveFoam_uv.xy);
    float4 waveFoamMap_2 = Tex2D(_FoamTex, waveFoam_uv.zw);
    // float waveFoam = waveFoamMap.y * waveFoamMap_2.x * max(waveFoamMap.w, waveFoamMap_2.w) * waveFoamRange;
    float waveFoam = dot(waveFoamMap.xyz, waveFoamMap_2.xyz) * waveFoamRange;

    waveFoam = waveFoam * _WaveFoamOpacity;// waveFoam * waveFoam * _WaveFoamOpacity;
#else
    // float2 waveFoam_uv =  i.UV0.xy * _WaveFoamTiling + _Time.y * _WaveFoamOffset + bump.xy * _WaveFoamDistortion;
    // float4 waveFoamMap = Tex2D(_FoamTex, waveFoam_uv.xy);

    // float waveFoam = dot(waveFoamMap.xyz, half3(0.3,0.3,0.3));
    // waveFoam = waveFoam * waveFoam * _WaveFoamOpacity * _WaveFoamOpacityLOD;
#endif
#endif

#if (SHADER_LOD > 100)
    //====== Albedo =============================================
    //float colorRange = waterRange;

    //float2 screenPos = i.ProjectedPos.xy / i.ProjectedPos.w;
    //float2 offset = bump.xy * _Distortion;
    // fixed4 refraction = Tex2D( SceneColorCopyTex, screenPos + offset * (1.0 - saturate(shoreArea)));
    
    fixed4 refraction = 0.1f;
    fixed3 albedo = _WaterColor1.rgb;
    o.BaseColor = lerp(albedo.rgb, refraction.rgb * _WaterColor2.rgb, waterRange);
#else
    o.BaseColor = _WaterColorLOD.rgb;
#endif

#if (SHADER_LOD > 100)
    //====== Opacity =============================================
    
    #ifdef EDGE_OPACITY_MODE
        float opacity = UE_DepthFade(sceneDepth, pixelDepth, _EdgeOpacity);
        #if (SHADER_LOD > 200) 
            #ifdef FOAM_MODE
                opacity += edgeFoam;
            #endif
        #endif
        o.Opacity = saturate(opacity) * _Opacity;    
    #elif defined(EDGE_OPACITY_VERT_COLOR_MODE)
        float opacity = vertColA / _EdgeOpacityRange;//vertColA * vertColA / _EdgeOpacityRange;
        o.Opacity = saturate(opacity*opacity) * _Opacity;
    #else
         o.Opacity = _Opacity;
    #endif
    //half opacityMask = shoreMask.w * _OpacityMaskEnabled + (1.0 - _OpacityMaskEnabled);
    //saturate(opacity) * _Opacity ;//* opacityMask;
#else
    o.Opacity =  min(_AlphaIntensity,1);//min(1.0 * _ShoreAlphaIntensity,1);//min(shoreMask.w * _ShoreAlphaIntensity,1);
    o.Opacity = max(o.Opacity - _AlphaClip,0) / (1- _AlphaClip);//max(o.Opacity - _ShoreAlphaClip,0) / (1- _ShoreAlphaClip);
#endif

#if (SHADER_LOD > 200)
    //====== Specular =============================================
    float4 SpecularUV = i.PackedData2.xyzw;
    float3 viewDir = SafeNormalize(UnityWorldSpaceViewDir(worldPos));

    // #ifndef NEW_FAKE_SPECULAR_MODE
    #ifdef SPECULAR_MODE
        float3 worldN;
        worldN = float3(0, 1, 0);

        float specular = MF_FakeSpecular(SpecularUV, _SpecTex, SafeNormalize(_SpecularDir.xyz), viewDir, worldN);
    #else
        float specular = 0;
    #endif
    //     float3 specBump = lerp(float3(0, 0, 1), bump12, _FakeSpecNormalIntensity);//lerp(float3(0, 0, 1), bump12, _FakeSpecNormalIntensity) + waveBump * _FakeSpecWaveIntensity;

    //     float3 worldN;
    //     // worldN.x = dot(i.TangentToWorld[0].xyz, specBump);
    //     // worldN.y = dot(i.TangentToWorld[1].xyz, specBump);
    //     // worldN.z = dot(i.TangentToWorld[2].xyz, specBump);
    //     // worldN = SafeNormalize(worldN);
    //     float3 tangent = i.TangentToWorld[0].xyz;
    //     float3 binormal = i.TangentToWorld[1].xyz;
    //     float3 normal = i.TangentToWorld[2].xyz;
    //     worldN = SafeNormalize(tangent * specBump.x + binormal * specBump.y + normal * specBump.z);
    //     float3 specular = NewFakeSpecular(_FakeSpecGloss, SafeNormalize(_FakeSpecDir.xyz), viewDir, worldN, i.TangentToWorld[0].xyz, i.TangentToWorld[2].xyz);
    
#endif

//====== Output =============================================

    //====== Output =============================================
#if (SHADER_LOD > 200)
    #ifdef FOAM_MODE
        o.BaseColor += (max(edgeFoam, waveFoam) * _EdgeFoamColor.rgb + specular) * o.Opacity;
    #else
        o.BaseColor += specular * o.Opacity;
    #endif
    // o.EmissiveColor = (waveFoam * _ShoreFoamColor.rgb + specular) * o.Opacity;
    // o.BaseColor += specular * o.Opacity;
    
    /*
    #if defined(PLANAR_REFLECTION_FUNC_ON)
        //worldN.xyz = normalize(worldN.xyz + float3(0, 10, 0));
        fixed3 planarReflection = SimplePlanarReflection(worldPos.xyz, worldN.xyz, _ReflectionDistortion, _ReflectionLevel);
        planarReflection.xyz /= 1 + max(max(planarReflection.x, planarReflection.y), planarReflection.z);
        // o.EmissiveColor += planarReflection.xyz * o.Opacity;
        o.BaseColor += planarReflection.xyz * o.Opacity;
    #endif
    */

// #ifdef REFLECTION_DISTORTION
//     o.ReflectionOffset = offset;//* (1.0 - saturate(shoreArea));
// #endif
#endif

    o.Specular = _SpecularLevel;
    o.Normal = bump;
    o.Metallic = 0;
    o.Roughness = 0.08;
    
    return o;
}

#include "../Base/MobileBasePass.cginc"

#endif //!WATER_3C_CGINC