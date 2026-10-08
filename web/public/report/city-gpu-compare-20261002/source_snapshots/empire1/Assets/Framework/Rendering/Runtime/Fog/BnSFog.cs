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
    [Tooltip("高度雾漫延的高度")]
    public float HeightFogScaleHeight = 50;

    [Header("============ 遮罩 (仅城内) ============")]
    [Tooltip("是否启用遮罩")]
    public bool EnableFogMask = false;
    [Tooltip("遮罩贴图")]
    public Texture2D FogMask;
    [Tooltip("遮罩贴图UV调整")]
    public Vector4 FogMaskUVScaleOffset = new Vector4(1.0f, 1.0f, 0.0f, 0.0f);
    [Tooltip("遮罩强度")] 
    public float FogMaskStrength = 1.0f;
    
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
    // Please see GlobalParameters.cginc!
    private static Vector4[] paramsTmp = new Vector4[5];
    private static Vector4[] paramsTmp2 = new Vector4[2];

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

    public bool Apply(Vector4[] s_gFogParams)
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
        paramsTmp2[0] = new Vector4(enableFogMask, fogMaskStrength, 0.0f, 0.0f);
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
        return isFogDirty;
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

        return isDirty;
    }


}
