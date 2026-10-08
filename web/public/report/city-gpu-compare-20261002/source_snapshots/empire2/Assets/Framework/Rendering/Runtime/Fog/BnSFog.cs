using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

[ExecuteInEditMode]
public class BnSFog : MonoBehaviour
{
    public RenderLayerMaskEnum RenderLayer = RenderLayerMaskEnum.Default;
    [Header("============ 大气雾 ============")]
    [Tooltip("是否启用大气雾")]
    public bool EnableAtmosphericFog = true;
    [Tooltip("大气雾的基础高度（最浓的地方的高度）")]
    public float AtmosphericBaseZ = 0;
    [Tooltip("大气雾的浓度")]
    public float AtmosphericDensity = 1;
    [Tooltip("大气雾的最大透明度")]
    [Range(0,1)]
    public float AtmosphericMaxOpacity = 1;
    [Tooltip("开始产生大气雾的距离")]
    public float AtmosphericStartDistance = 100;
    [Tooltip("大气雾渐隐范围：雾气从 StartDistance 到 StartDistance+FadeInRange 范围内平滑淡入，0 表示硬截断（向后兼容）")]
    public float AtmosphericFadeInRange = 0;
    [Tooltip("大气雾漫延的高度")]
    public float AtmosphericScaleHeight = 50;
    [Tooltip("方向光的颜色的增强系数")]
    public float SunInscatterIntensity = 1;
    [Tooltip("控制瑞利散射强度的系数，越大效果越明显")]
    public float RayleighScatterCoeff = 1;
    [Tooltip("瑞利散射的颜色")]
    public Color RayleighTintColor = Color.white;
    [Tooltip("控制米氏散射强度的系数，越大效果越明显")]
    public float MieScatterCoeff = 1;
    [Tooltip("控制米氏散射扩散程度的系数，越大越集中")]
    [Range(0, 1)]
    public float MieAsymmetry= 0.8f;
    [Tooltip("米氏散射的颜色")]
    public Color MieTintColor = Color.white;
    [Tooltip("高低地适配大气雾：开启后，大气雾使用 (物体Y - 地形VT采样Y) 作为相对高度参与高度衰减计算，使高海拔区域也能获得与低海拔一致的大气散射效果；需 Shader 已 include VTCommon.cginc 才会真正生效")]
    public bool EnableTerrainAdaptiveAtmosFog = false;

    [Header("============ 高度雾 ============")]
    [Tooltip("是否启用高度雾")]
    public bool EnableHeightFog = true;
    [Tooltip("高度雾的基础高度（最浓的地方的高度）")]
    public float HeightFogBaseZ = 0;
    [Tooltip("高度雾的颜色")]
    public Color HeightFogColor = Color.white;
    [Tooltip("高度雾的浓度")]
    public float HeightFogDensity = 1;
    [Tooltip("高度雾的最大透明度")]
    [Range(0, 1)]
    public float HeightFogMaxOpacity = 0.8f;
    [Tooltip("开始产生高度雾的距离")]
    public float HeightFogStartDistance = 0;
    [Tooltip("高度雾渐隐范围：雾气从 StartDistance 到 StartDistance+FadeInRange 范围内平滑淡入，0 表示硬截断（向后兼容）")]
    public float HeightFogFadeInRange = 0;
    [Tooltip("高度雾漫延的高度")]
    public float HeightFogScaleHeight = 50;
    [Tooltip("高低地适配高度雾：开启后，高度雾使用 (物体Y - 地形VT采样Y) 作为相对高度参与衰减计算，使高海拔区域也能获得与低海拔一致的雾效；需 Shader 已 include VTCommon.cginc 才会真正生效")]
    public bool EnableTerrainAdaptiveHeightFog = false;


    [Header("============ 遮罩 (仅城内) ============")]
    [Tooltip("是否启用遮罩")]
    public bool EnableFogMask = false;
    [Tooltip("遮罩贴图")]
    public Texture2D FogMask;
    [Tooltip("遮罩贴图UV调整")]
    public Vector4 FogMaskUVScaleOffset = new Vector4(1.0f, 1.0f, 0.0f, 0.0f);
    [Tooltip("遮罩强度")] 
    public float FogMaskStrength = 1.0f;

    [Header("============ 屏幕中央雾效 ============")]
    [Tooltip("是否启用屏幕中央雾效")]
    public bool EnableScreenCenterFog = false;
    [Tooltip("雾气最大浓度")]
    [Range(0f, 1f)]
    public float SCFogMaxDensity = 0.6f;
    [System.Obsolete("遮罩模式不再使用独立雾颜色，此字段已废弃")]
    [HideInInspector]
    public Color SCFogColor = Color.white;
    [Tooltip("中心点偏移（屏幕空间XY偏移，适配SLG俯视角）")]
    public Vector2 SCFogCenterOffset = Vector2.zero;
    [Tooltip("世界空间清晰半径（单位：世界坐标距离）")]
    public float SCFogWorldClearRadius = 0.5f;
    [Tooltip("世界空间渐隐宽度（单位：世界坐标距离）")]
    public float SCFogWorldFadeWidth = 1.0f;
    [Tooltip("地面高度平面Y值（用于射线求交计算世界空间中心位置）")]
    public float SCFogGroundHeight = 0f;
    [Tooltip("使用屏幕空间UV距离计算模式（消除高度差异，确保不同高度雾效一致）")]
    [HideInInspector]public bool UseScreenSpaceCalculation = true;

    static readonly Vector4 BetaRayleighScattering = new Vector4(5.8e-3f, 1.35e-2f, 3.31e-2f); // Equation 1, REK 04
    static readonly Vector4 BetaMieScattering = new Vector4(4e-3f, 4e-3f, 4e-3f); // Equation 4

    [SerializeField, HideInInspector]
    float BetaRayleighScatter;
    [SerializeField, HideInInspector]
    float BetaMieScatter;
    [SerializeField, HideInInspector]
    float AtmosphericMinOpacity;
    [SerializeField, HideInInspector]
    float HeightFogMinOpacity;
    [SerializeField, HideInInspector]
    float AtmosphericFalloff;
    [SerializeField, HideInInspector]
    float HeightFogFalloff;


    private static readonly int ID_gFogParams = Shader.PropertyToID("gFogParams");
    private static readonly int ID_BnSFog_FogMaskTex = Shader.PropertyToID("BnSFog_FogMaskTex");
    // ScreenCenterFog 独立全局变量ID
    private static readonly int ID_ScreenCenterFogParams0 = Shader.PropertyToID("_ScreenCenterFogParams0");
    private static readonly int ID_ScreenCenterFogParams1 = Shader.PropertyToID("_ScreenCenterFogParams1");
    private static readonly int ID_ScreenCenterFogParams2 = Shader.PropertyToID("_ScreenCenterFogParams2");
    // Please see GlobalParameters.cginc!
    private static Vector4[] paramsTmp = new Vector4[5];
    private static Vector4[] paramsTmp2 = new Vector4[2];
    // ScreenCenterFog 脏标记
    private Vector4 m_LastSCFogParams0;
    private Vector4 m_LastSCFogParams1;
    private Vector4 m_LastSCFogParams2;

    public void OnEnable()
    {
        // Register to the rendering manager.
        RenderPipelineUtil.RegisterBnSFog(this);
    }

    public void OnDisable()
    {
        // Unregister to the rendering manager.
        RenderPipelineUtil.UnregisterBnSFog(this);
    }

    public bool Apply(Vector4[] s_gFogParams, Camera cam)
    {
        AtmosphericDensity = Mathf.Max(0, AtmosphericDensity);
        AtmosphericStartDistance = Mathf.Max(0, AtmosphericStartDistance);
        AtmosphericScaleHeight = Mathf.Max(0, AtmosphericScaleHeight);
        SunInscatterIntensity = Mathf.Max(0, SunInscatterIntensity);
        RayleighScatterCoeff = Mathf.Max(0, RayleighScatterCoeff);
        MieScatterCoeff = Mathf.Max(0, MieScatterCoeff);
        HeightFogDensity = Mathf.Max(0, HeightFogDensity);
        HeightFogStartDistance = Mathf.Max(0, HeightFogStartDistance);
        HeightFogScaleHeight = Mathf.Max(0, HeightFogScaleHeight);

        BetaRayleighScatter = RayleighScatterCoeff * BetaRayleighScattering.x;
        BetaMieScatter = MieScatterCoeff * BetaMieScattering.x;
        AtmosphericMinOpacity = 1 - AtmosphericMaxOpacity;
        HeightFogMinOpacity = 1 - HeightFogMaxOpacity;
        AtmosphericFalloff = 1f / AtmosphericScaleHeight;
        HeightFogFalloff = 1f / HeightFogScaleHeight;

        // Shader.SetGlobalFloat("BnSFog_AtmosBaseZ", AtmosphericBaseZ);
        // Shader.SetGlobalFloat("BnSFog_AtmosFogDensity", EnableAtmosphericFog ? AtmosphericDensity : 0);
        // Shader.SetGlobalFloat("BnSFog_AtmosMinOpacity", AtmosphericMinOpacity);
        // Shader.SetGlobalFloat("BnSFog_BetaRs", BetaRayleighScatter);
        // Shader.SetGlobalFloat("BnSFog_BetaMs", BetaMieScatter);
        // Shader.SetGlobalFloat("BnSFog_MieG", MieAsymmetry);
        // Shader.SetGlobalColor("BnSFog_AlbedoR", RayleighTintColor);
        // Shader.SetGlobalColor("BnSFog_AlbedoM", MieTintColor);
        // Shader.SetGlobalFloat("BnSFog_AtmosStartDist", AtmosphericStartDistance);
        // Shader.SetGlobalFloat("BnSFog_AtmosFalloff", AtmosphericFalloff);
        // Shader.SetGlobalFloat("BnSFog_SunInscatterIntensity", SunInscatterIntensity);
        // Shader.SetGlobalFloat("BnSFog_HeightFogBaseZ", HeightFogBaseZ);
        // Shader.SetGlobalColor("BnSFog_HeightFogColor", HeightFogColor);
        // Shader.SetGlobalFloat("BnSFog_HeightFogDensity", EnableHeightFog ? HeightFogDensity / 1000f : 0);
        // Shader.SetGlobalFloat("BnSFog_HeightFogMinOpacity", HeightFogMinOpacity);
        // Shader.SetGlobalFloat("BnSFog_HeightFogStartDist", HeightFogStartDistance);
        // Shader.SetGlobalFloat("BnSFog_HeightFogFalloff", HeightFogFalloff);
        
        //Shader.SetGlobalFloat("BnSFog_FogMaskEnabled", EnableFogMask ? 1.0f : 0.0f);
        //Shader.SetGlobalFloat("BnSFog_FogMaskStrength", Mathf.Max(0.1f, FogMaskStrength));
        Shader.SetGlobalTexture(ID_BnSFog_FogMaskTex, (FogMask && enabled && gameObject.activeInHierarchy) ? FogMask : Texture2D.whiteTexture);
        //Shader.SetGlobalVector("BnSFog_FogMaskUVScaleOffset", FogMaskUVScaleOffset);

        bool isFogDirty = false;


        // Use parameters array to save the performance of draw call.
        var atDensity = (EnableAtmosphericFog && enabled && gameObject.activeInHierarchy) ? AtmosphericDensity : 0;
        paramsTmp[0] = new Vector4(AtmosphericBaseZ, atDensity, AtmosphericMinOpacity, BetaRayleighScatter);
        paramsTmp[1] = new Vector4(BetaMieScatter, MieAsymmetry, AtmosphericStartDistance, AtmosphericFalloff);
        var tmpRayleighTintColor = RenderingUtils.GammaToLinear(RayleighTintColor);
        paramsTmp[2] = new Vector4(tmpRayleighTintColor.r, tmpRayleighTintColor.g, tmpRayleighTintColor.b, SunInscatterIntensity);
        var tmpMieTintColor = RenderingUtils.GammaToLinear(MieTintColor);
        paramsTmp[3] = new Vector4(tmpMieTintColor.r, tmpMieTintColor.g, tmpMieTintColor.b, HeightFogBaseZ);
        var tmpHeightFogColor = RenderingUtils.GammaToLinear(HeightFogColor);
        var hDensity = (EnableHeightFog && enabled && gameObject.activeInHierarchy) ? HeightFogDensity / 1000f : 0;
        paramsTmp[4] = new Vector4(tmpHeightFogColor.r, tmpHeightFogColor.g, tmpHeightFogColor.b, hDensity);
        float enableFogMask = (EnableFogMask && enabled && gameObject.activeInHierarchy) ? 1.0f : 0.0f;
        float fogMaskStrength = (EnableFogMask && enabled && gameObject.activeInHierarchy)
            ? Mathf.Max(0.1f, FogMaskStrength)
            : 0.0f;
        float terrainAdapt = (EnableHeightFog && EnableTerrainAdaptiveHeightFog && enabled && gameObject.activeInHierarchy) ? 1.0f : 0.0f;
        float terrainAdaptAtmos = (EnableAtmosphericFog && EnableTerrainAdaptiveAtmosFog && enabled && gameObject.activeInHierarchy) ? 1.0f : 0.0f;
        paramsTmp2[0] = new Vector4(enableFogMask, fogMaskStrength, terrainAdapt, terrainAdaptAtmos);
        paramsTmp2[1] = FogMaskUVScaleOffset;

        for(int i=0;i<paramsTmp.Length;++i)
        {
            if(!paramsTmp[i].Equals(s_gFogParams[i]))
            {
                s_gFogParams[i] = paramsTmp[i];
                isFogDirty = true;
            }
        }
        
        // 这个因为w给另一个fog用了，没法比较整个vector
        if(s_gFogParams[5].x != HeightFogMinOpacity)
        {
            s_gFogParams[5].x = HeightFogMinOpacity;
            isFogDirty = true;
        }

        if(s_gFogParams[5].y != HeightFogStartDistance)
        {
            s_gFogParams[5].y = HeightFogStartDistance;
            isFogDirty = true;
        }

        if(s_gFogParams[5].z != HeightFogFalloff)
        {
            s_gFogParams[5].z = HeightFogFalloff;
            isFogDirty = true;
        }

        // gFogParams[9]: FadeInRange 参数（x=大气雾, y=高度雾）
        float atmosFadeInRange = Mathf.Max(0, AtmosphericFadeInRange);
        float heightFadeInRange = Mathf.Max(0, HeightFogFadeInRange);
        var fadeInRangeParam = new Vector4(atmosFadeInRange, heightFadeInRange, 0, 0);
        if (!fadeInRangeParam.Equals(s_gFogParams[9]))
        {
            s_gFogParams[9] = fadeInRangeParam;
            isFogDirty = true;
        }

        // s_gFogParams[6] is for lobby Fog
        if (!paramsTmp2[0].Equals(s_gFogParams[7]))
        {
            s_gFogParams[7] = paramsTmp2[0];
            isFogDirty = true;
        }
        if (!paramsTmp2[1].Equals(s_gFogParams[8]))
        {
            s_gFogParams[8] = paramsTmp2[1];
            isFogDirty = true;
        }

        // ScreenCenterFog 参数计算与传递
        isFogDirty |= ApplyScreenCenterFog(cam);

        return isFogDirty;
    }

    /// <summary>
    /// 计算并传递 ScreenCenterFog 遮罩参数到GPU全局变量。
    /// 遮罩模式：中心区域消除雾效，边缘保持原有雾效。
    /// 参数打包方式（屏幕空间UV模式）：
    ///   _ScreenCenterFogParams0: (ClearRadius, FadeWidth, MaxDensity, Reserved)
    ///   _ScreenCenterFogParams1: (CenterOffset.x, CenterOffset.y, Reserved, Reserved)
    ///   _ScreenCenterFogParams2: (AspectRatio, 0, 0, 1.0)  -- w=1.0 为屏幕UV模式标识
    /// </summary>
    private bool ApplyScreenCenterFog(Camera cam)
    {
        float effectiveMaxDensity = 0f;
        Vector4 params2 = Vector4.zero;

        if (EnableScreenCenterFog && enabled && gameObject.activeInHierarchy)
        {
            if (cam != null)
            {
                if (UseScreenSpaceCalculation)
                {
                    // 屏幕空间UV模式：传递宽高比，w=1.0作为模式标识
                    effectiveMaxDensity = SCFogMaxDensity;
                    params2 = new Vector4(cam.aspect, 0f, 0f, 1.0f);
                }
                else
                {
                    // 世界空间XZ模式：射线-地面求交计算世界中心位置
                    Vector3 camPos = cam.transform.position;
                    Vector3 camFwd = cam.transform.forward;

                    float denom = camFwd.y;
                    if (Mathf.Abs(denom) > 1e-6f)
                    {
                        float t = (SCFogGroundHeight - camPos.y) / denom;
                        if (t > 0f)
                        {
                            Vector3 worldCenterPos = camPos + camFwd * t;
                            effectiveMaxDensity = SCFogMaxDensity;
                            params2 = new Vector4(worldCenterPos.x, worldCenterPos.y, worldCenterPos.z, 0f);
                        }
                    }
                }
            }
        }

        Vector4 params0 = new Vector4(SCFogWorldClearRadius, SCFogWorldFadeWidth, effectiveMaxDensity, 0f);
        Vector4 params1 = new Vector4(SCFogCenterOffset.x, SCFogCenterOffset.y, 0f, 0f);

        if (!params0.Equals(m_LastSCFogParams0) || !params1.Equals(m_LastSCFogParams1) || !params2.Equals(m_LastSCFogParams2))
        {
            m_LastSCFogParams0 = params0;
            m_LastSCFogParams1 = params1;
            m_LastSCFogParams2 = params2;
            Shader.SetGlobalVector(ID_ScreenCenterFogParams0, params0);
            Shader.SetGlobalVector(ID_ScreenCenterFogParams1, params1);
            Shader.SetGlobalVector(ID_ScreenCenterFogParams2, params2);
            return true;
        }
        return false;
    }

    public static bool ApplyDefault(Vector4[] s_gFogParams)
    {
        bool isDirty = false;
        for(int i=0;i<paramsTmp.Length;++i)
        {   
            if(!s_gFogParams[i].Equals(Vector4.one))
            {
                s_gFogParams[i] = Vector4.one;
                isDirty = true;
            }
        }

        // 这个因为w给另一个fog用了，没法比较整个vector
        if(s_gFogParams[5].x != 1)
        {
            s_gFogParams[5].x = 1;
            isDirty = true;
        }

        if(s_gFogParams[5].y != 1)
        {
            s_gFogParams[5].y = 1;
            isDirty = true;
        }

        if(s_gFogParams[5].z != 1)
        {
            s_gFogParams[5].z = 1;
            isDirty = true;
        }
        
        if (s_gFogParams[7] != Vector4.zero)
        {
            s_gFogParams[7] = Vector4.zero;
            isDirty = true;
        }
        if (s_gFogParams[8] != new Vector4(1, 1, 0, 0))
        {
            s_gFogParams[8] = new Vector4(1, 1, 0, 0);
            isDirty = true;
        }

        // gFogParams[9]: FadeInRange 重置为 0（无渐隐效果）
        if (s_gFogParams[9] != Vector4.zero)
        {
            s_gFogParams[9] = Vector4.zero;
            isDirty = true;
        }

        // ScreenCenterFog 重置为零向量（MaxDensity=0，不产生任何雾效）
        Shader.SetGlobalVector(ID_ScreenCenterFogParams0, Vector4.zero);
        Shader.SetGlobalVector(ID_ScreenCenterFogParams1, Vector4.zero);
        Shader.SetGlobalVector(ID_ScreenCenterFogParams2, Vector4.zero);

        return isDirty;
    }


}
