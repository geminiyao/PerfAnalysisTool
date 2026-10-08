//使用场景：城外 大地图中名城等建筑物内的水体
//与城内的简化小水体的区分在接受阴影
Shader "AOE/World/Water3c_World_inCity"
{
    Properties
    {
        [Header(Instruction)]
        _INSTRUCTION ("用于城外大地图中建筑内的水体", int) = 0

        [Group(g1, Water Color)]
        [Sub(g1,1)]_WaterColor1 ("Water Color Light", color) = (0.17, 0.182, 0.245, 1) //#tips:水面边缘的颜色
        [Sub(g1,1)]_WaterColor2 ("Water Color Dark", color) = (0.1, 0.35, 0.43, 1) //#tips:水面中心的颜色
        [Sub(g1, 1)] _WaterColorLOD ("Water Color LOD", color) = (0.04, 0.23,0.22, 1) //#tips:LOD低于200时使用此值设置水面颜色
        [Float(g1, 4, 1)] _ColorRange ("Water Color Range", float) = 10 //#tips:设置水面边缘颜色和中心颜色的范围
        [Float(g1,2,0,1,1)] _Opacity ("Water Opacity", float) = 0.9 //#tips:水体透明度
        [Sub(g1, 1)] _SpecularLevel ("Water Specular Intensity [0, 1]", Range(0.0, 5.0)) = 0.5 //#tips:控制水面对天空盒的反射强度
        
        
        _AlphaClip("Alpha Clip (LOD100)", Range(0,1)) = 0.3 //shoreAlphaClip
        _AlphaIntensity("Alpha Intensity(LOD100)",float) = 0.98 //shoreAlphaIntensity

        [Group(g2, Water Edge)]
        [SubToggle(g2,EDGE_OPACITY_VERT_COLOR_MODE,1)] _EdgeOpacityVertexColorMode("Enable Edge Opacity (with Vertex Color)", Float) = 0 //#tips:当模型有顶点颜色代表深度时启用（水体模型下为平地）
        [SubHideIfDisabledFloat(g2,EDGE_OPACITY_VERT_COLOR_MODE,1)] _EdgeOpacityRange("Edge Opacity Range", float) = 0.5 //#tips:水面边缘的透明程度
        [SubToggle(g2,EDGE_OPACITY_MODE,1)] _EdgeOpacityMode ("Enable Edge Opacity (with Depth Avaliable)", Float) = 0 //#tips:当水体模型下非平地时启用
        [SubHideIfDisabledFloat(g2,EDGE_OPACITY_MODE,1)] _EdgeOpacity("Edge Opacity", float) = 0.5  //#tips:水面边缘的透明程度

        [Group(g3, Water Foam)]
        [SubToggle(g3,FOAM_MODE,1)] _FoamMode("Enable Foam (Only when there is depth or vertexColor of depth)", Float) = 0//#tips:开启水面中央与边缘的泡沫
        [HideIfDisabled(FOAM_MODE)] _EdgeFoamColor("Foam Color", color) = (0.4,0.4,0.4,1.0)
        [HideIfDisabled(FOAM_MODE)] _EdgeFoamRange("Edge Foam Range", float) = 2.2
        [HideIfDisabled(FOAM_MODE)] _EdgeFoamPower("Edge Foam Power", float) = 4
        [HideIfDisabled(FOAM_MODE)] _EdgeFoamTiling("Edge Foam Tiling", float) = 2.2
        [HideIfDisabled(FOAM_MODE)] _EdgeFoamOpacity("Edge Foam Opacity", Range(0.0, 1.0)) = 0.5
        [HideIfDisabled(FOAM_MODE)] _EdgeFoamDistortion ("Edge Foam Distortion", float) = 0.2 //#tips:设置水面边缘泡沫贴图的扭曲度
        [Space]
        
        [HideIfDisabled(FOAM_MODE)] _WaveFoamRange ("Wave Foam Range (The foam in the centre)", float) = 2.2
        [HideIfDisabled(FOAM_MODE)] _WaveFoamOpacity ("Wave Foam Opacity", Range(0.0, 1.0)) = 1.0
        [HideIfDisabled(FOAM_MODE)] _WaveFoamOpacityLOD ("Wave Foam Opacity LOD", Range(0.0, 1.0)) = 0.2
        [HideIfDisabled(FOAM_MODE)] _WaveFoamDistortion ("Wave Foam Distortion", float) = 0.02
        [HideIfDisabled(FOAM_MODE)] _WaveFoamTiling ("Wave Foam Tiling(XY:first layer; ZW:second layer)", vector) = (4, 4, 4, 4)
        [HideIfDisabled(FOAM_MODE)] _WaveFoamOffset ("Wave Foam Speed(XY:first layer; ZW:second layer)", vector) = (0, 0, 0, 0)

        [Group(g4, Specular)]
        [SubToggle(g4,SPECULAR_MODE,1)] _SpecMode ("Enable Specular", Float) = 0 //#tips: 开启水面高光
        _SpecularTiling ("Specular Map Tiling", float) = 10.24
        [HideIfDisabled(SPECULAR_MODE)] _SpecularIntensity ("Specular Intensity", float) = 256
        _SpecularPower ("Specular Power (XYZ)", vector) = (10, 40, 75, 0)
        [HideIfDisabled(SPECULAR_MODE)] _SpecularDir ("Specular Direction (XYZ)", vector) = (0, 1, -0.3, 0)

        [Group(g5, Texture Map)]

        [HideIfDisabled(FOAM_MODE)][NoScaleOffset] _ShoreWaveRamp ("Shore Ramp", 2D) = "black" {}
        [HideIfDisabled(FOAM_MODE)][NoScaleOffset]_FoamTex ("Foam Texture (Only be effective when edgeFoam/waveFoam is enabled)", 2D) = "black" {}
        
        [HideIfDisabled(SPECULAR_MODE)][NoScaleOffset] _SpecTex ("Fake Specular Texture", 2D) = "black" {}

        [Group(g6,Wave Normal)]
        [NoScaleOffset]t5 ("Wave Normal", 2D) = "bump" {}
        
        [Float(g6, 2, 0, 100, 1)]t5_intensity ("Wave Normal Intensity", float) = 0.5
        [Vector(g6, 1, 1)]t5_uv1 ("Wave Normal UV1 (XY:Speed Z:Tiling)", vector) = (-0.1, 0.1, 10.0, 0)
        [Vector(g6, 1, 1)]t5_uv2 ("Wave Normal UV2 (XY:Speed Z:Tiling)", vector) = (0.1, 0.15, 12.5, 0)
        [Vector(g6, 1, 1)]t5_control ("Wave Normal UV (X:Amplitude Y:Speed Z:Scale W:Scale)", vector) = (5.0, 0.05, 90, 6.28319)

    }
//LOD_400_BEGIN
    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent-1" "IgnoreProjector" = "True" }
        Fog { Mode Off }
        LOD 400

        Pass
        {
            Name "FORWARD"
            Tags { "LightMode" = "WaterPass" }

            ZWrite Off
            Blend SrcAlpha OneMinusSrcAlpha

            CGPROGRAM

            #pragma vertex MobileBasePassVertex
            #pragma fragment MobileBasePassFragment
            
            #pragma enable_cbuffer
            #pragma multi_compile_instancing
            
            
            #define SHADOWMAP_FUNC_ON 1
            #define UNIFORM_SHADOW_MODE 1

            #pragma multi_compile __ LOOK_DEV SHADERPASS_FULL_SCREEN_DEBUG
            #pragma target 4.5 SHADERPASS_FULL_SCREEN_DEBUG

            #pragma multi_compile __ DEPTH_FETCH_ON

            #pragma shader_feature SPECULAR_MODE
            #pragma shader_feature EDGE_OPACITY_MODE
            #pragma shader_feature EDGE_OPACITY_VERT_COLOR_MODE
            #pragma shader_feature FOAM_MODE
            
            #define AOE_WATER               1
            #define DIFFUSE_SH_ON           1
            #define SPECULAR_REFLECTION_ON  1

            #define SHADOW_MAP_ON           1          
            #define DYNAMIC_SHADOW_MAP_ON 1
            #define SOFT_SHADOW_PCF_4X4     1

            #define ALPHA_BLEND_ON          1
            #define PROJECTED_POS_ON        1
            #define CLOUD_SHADOW_ON         1
            #define SHADER_LOD              400
            #define FOG_FUNC_ON
            #define FOG_ON                  1
            #define FOG_TERRAIN_ADAPT_ON
            #define IMAGEBLOCK_DEPTH_READ   1

            #include "Water3c_small_Input.cginc"
            #include "Water3c_small.cginc"

			
			ENDCG
        }
    }
//LOD_400_END

    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent-1" "IgnoreProjector" = "True" }
        Fog { Mode Off }
        LOD 300

        Pass
        {
            Name "FORWARD"
            Tags { "LightMode" = "WaterPass" }

            ZWrite Off
            Blend SrcAlpha OneMinusSrcAlpha

            CGPROGRAM

            #pragma vertex MobileBasePassVertex
            #pragma fragment MobileBasePassFragment
            
            #pragma enable_cbuffer
            #pragma multi_compile_instancing
            #pragma instancing_options forcemaxcount:128

            
            #define SHADOWMAP_FUNC_ON 1
            #define UNIFORM_SHADOW_MODE 1

            #pragma multi_compile __ LOOK_DEV SHADERPASS_FULL_SCREEN_DEBUG
            #pragma target 4.5 SHADERPASS_FULL_SCREEN_DEBUG


            // 给云真机用
            #pragma multi_compile __ DEPTH_FETCH_ON

            #pragma shader_feature SPECULAR_MODE
            #pragma shader_feature EDGE_OPACITY_MODE
            #pragma shader_feature EDGE_OPACITY_VERT_COLOR_MODE
            #pragma shader_feature FOAM_MODE
            
            
            #define AOE_WATER               1
            #define DIFFUSE_SH_ON           1
            #define SPECULAR_REFLECTION_ON  1
            #define SHADOW_MAP_ON           1          
            #define DYNAMIC_SHADOW_MAP_ON 1
            #define SOFT_SHADOW_PCF_4X4     1
            
            #define ALPHA_BLEND_ON          1
            #define PROJECTED_POS_ON        1
            #define SHADER_LOD              300
            #define FOG_FUNC_ON
            #define FOG_ON                  1
            #define FOG_TERRAIN_ADAPT_ON
            #define IMAGEBLOCK_DEPTH_READ 1
            #define REFLECTION_DISTORTION   1

            #include "Water3c_small_Input.cginc"
            #include "Water3c_small.cginc"

			
			ENDCG
        }
    }

    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent-1" "IgnoreProjector" = "True" }
        Fog { Mode Off }
        LOD 200

        Pass
        {
            Name "FORWARD"
            Tags { "LightMode" = "WaterPass" }
            ZWrite Off
            Blend SrcAlpha OneMinusSrcAlpha

            CGPROGRAM

            #pragma vertex MobileBasePassVertex
            #pragma fragment MobileBasePassFragment
            
            #pragma enable_cbuffer
            #pragma multi_compile_instancing
            #pragma instancing_options forcemaxcount:128
            
            #define SHADOWMAP_FUNC_ON 1
            #define UNIFORM_SHADOW_MODE 1

            #pragma multi_compile __ LOOK_DEV SHADERPASS_FULL_SCREEN_DEBUG
            #pragma target 4.5 SHADERPASS_FULL_SCREEN_DEBUG

            #pragma multi_compile __ DEPTH_FETCH_ON
            
            #pragma shader_feature EDGE_OPACITY_MODE
            #pragma shader_feature EDGE_OPACITY_VERT_COLOR_MODE

            #define AOE_WATER               1
            #define DIFFUSE_SH_ON           1
            #define SPECULAR_REFLECTION_ON  1

            #define SHADOW_MAP_ON           1
            #define DYNAMIC_SHADOW_MAP_ON   0
            #define SOFT_SHADOW_PCF_2X2     1

            #define ALPHA_BLEND_ON          1
            #define PROJECTED_POS_ON        1
            #define SHADER_LOD              200
            //#define FOG_FUNC_ON
            //#define FOG_ON                  1
            #define IMAGEBLOCK_DEPTH_READ 1

            #include "Water3c_small_Input.cginc"
            #include "Water3c_small.cginc"

			
			ENDCG
        }
    }

    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent-1" "IgnoreProjector" = "True" }
        Fog { Mode Off }
        LOD 100

        Pass
        {
            Name "FORWARD"
            Tags { "LightMode" = "WaterPass" }
            // Tags { "LightMode" = "ForwardPass" }
            ZWrite Off
            Blend SrcAlpha OneMinusSrcAlpha

            CGPROGRAM

            #pragma vertex MobileBasePassVertex
            #pragma fragment MobileBasePassFragment
            
            #pragma enable_cbuffer
            #pragma multi_compile_instancing
            #pragma instancing_options forcemaxcount:128
            
            #define SHADOWMAP_FUNC_ON 1
            #define UNIFORM_SHADOW_MODE 1

            #pragma multi_compile __ LOOK_DEV SHADERPASS_FULL_SCREEN_DEBUG
            #pragma target 4.5 SHADERPASS_FULL_SCREEN_DEBUG

            #pragma multi_compile __ DEPTH_FETCH_ON
            
            #define AOE_WATER               1
            #define DIFFUSE_SH_ON           1
            #define SPECULAR_REFLECTION_ON  1

            #define SHADOW_MAP_ON           1
            #define DYNAMIC_SHADOW_MAP_ON   0
            #define SOFT_SHADOW_PCF_2X2     1
            
            #define ALPHA_BLEND_ON          1
            #define PROJECTED_POS_ON        1
            #define SHADER_LOD              100
            #define IMAGEBLOCK_DEPTH_READ 1

            #include "Water3c_small_Input.cginc"
            #include "Water3c_small.cginc"

			
			ENDCG
        } 
    }
    FallBack Off
    CustomEditor "Tencent.Timitbu.Render.CustomShaderGUI.PowerGUI"
}
