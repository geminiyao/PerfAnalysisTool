#ifndef VT_COMMON_CGINC
#define VT_COMMON_CGINC

int _VT_RootSize;
int _VT_PageSize;
int _VT_MaxVTMip;
// ASTC按块对齐时 = PageSize / 对齐后的数组尺寸(如 512/515)；非ASTC 或 4x4 时为 1。
// 用于把节点局部UV[0,1]缩放到数组中实际内容所在的[0, PageSize/aligned)区间。未设置(0)时按1处理。
float _VT_PageUVScale;
Texture2D _VT_IndexTex;
SamplerState sampler_VT_IndexTex;

// 默认值0，runtime通过代码设置为1
uniform float _TERRAIN_VT_HEIGHT_SCALE;

UNITY_DECLARE_TEX2DARRAY_NOSAMPLER(_VT_AlbedoTex);
UNITY_DECLARE_TEX2DARRAY_NOSAMPLER(_VT_NormalTex);
// WorldY 独占一张 R8 数组：该数组不参与ASTC压缩，以保留高度的完整8bit精度
UNITY_DECLARE_TEX2DARRAY_NOSAMPLER(_VT_WorldYTex);
SamplerState vt_linear_clamp_sampler;
// UNITY_DECLARE_TEX2DARRAY(_VT_WorldNormalTex); // [VT:WorldNormal]

float4 _VT_TerrainTileInfo; // r: tileCount g: MaxTreeDepth b: CurrentTreeDepth a: [Unused] 0
float4 _VT_TerrainInfo; // r: terrainSize g: 1/terrainSize b: terrainOffset.x a: terrainOffset.z
float2 WorldPosToUV(float3 worldPos)
{
    float2 worldUV = float2(
        saturate((worldPos.x - _VT_TerrainInfo.b) * _VT_TerrainInfo.g),
        saturate((worldPos.z - _VT_TerrainInfo.a) * _VT_TerrainInfo.g));

    return worldUV;
}

float4 _VT_TerrainHeightInfo; // [r]: Height Min [g]: Height Max [b]: TreeDepthInvert [a]: terrainOffset.y
float WorldYToRatio01(float worldY)
{
    // 此处转换时，不需要处理 _VT_TerrainHeightInfo.a 的偏移
    // 因为：在RenderToVT阶段，使用的是定制的 DrawMesh 过程，详见 VTRenderer.Render 函数
    float heightRange = max(_VT_TerrainHeightInfo.g - _VT_TerrainHeightInfo.r, 0.01);
    return saturate((worldY - _VT_TerrainHeightInfo.r) / heightRange);
}
float Ratio01ToWorldY(float ratio01)
{
    return lerp(_VT_TerrainHeightInfo.r, _VT_TerrainHeightInfo.g, ratio01) + _VT_TerrainHeightInfo.a;
}

// 半八面体编码（Hemi-Octahedron + Diamond-to-Square旋转）：将Y>0的半球法线映射到[0,1]^2
// 原理：先做八面体投影（Y>0时落在菱形|x|+|z|<=1内），再通过45度旋转将菱形展开填充整个正方形
float2 HemiOctEncode(float3 n)
{
    // 八面体投影：除以L1范数，得到菱形内坐标 oct in [-1,1], |oct.x|+|oct.y|<=1
    float t = abs(n.x) + abs(n.y) + abs(n.z);
    float2 oct = n.xz / t;
    // 45度旋转：菱形 -> 正方形（旋转后范围变为[-1,1]^2）
    float2 sq = float2(oct.x + oct.y, oct.x - oct.y);
    // 映射到[0,1]
    return sq * 0.5 + 0.5;
}

float3 HemiOctDecode(float2 encoded)
{
    // 从[0,1]还原到[-1,1]（正方形空间）
    float2 sq = encoded * 2.0 - 1.0;
    // 逆45度旋转：正方形 -> 菱形
    float2 oct = float2(sq.x + sq.y, sq.x - sq.y) * 0.5;
    // 半八面体解码：Y = 1 - |x| - |z|（保证Y>=0）
    float3 n = float3(oct.x, 1.0 - abs(oct.x) - abs(oct.y), oct.y);
    return normalize(n);
}

// .w = Metallic（WorldY 已迁移到 _VT_WorldYTex）。
// 注意：在 ALPHA_BLEND_ON 的 RenderToVT Pass 中，.w 被硬件混合征用为 SrcAlpha 因子，
// 无法同时承载 Metallic，此时 Metallic 需由独立的 RENDERTOVT_METALLIC Pass 单独写入。
float4 EncodeWorldNormalRoughness(float3 worldNormal, float roughness, float metallic = 0)
{
    // 使用半八面体编码WorldNormal（Y值始终大于0）
    float2 encodedNormal = HemiOctEncode(worldNormal);
    return float4(encodedNormal, roughness, metallic);
}

void DecodeWorldNormalRoughness(float4 worldNormalRoughness, out float3 worldNormal, out float roughness, out float metallic)
{
    // 使用半八面体解码WorldNormal（Y值始终大于0）
    worldNormal = HemiOctDecode(worldNormalRoughness.xy);

    roughness = worldNormalRoughness.z;
    metallic = worldNormalRoughness.w;
}

// WorldY 输出到独立的 R8 目标（RenderToVT 的 SV_Target2），只有 .r 会被写入贴图。
// .a 不落盘，仅作为硬件混合因子：RenderToVT 各 Pass 统一使用 Blend SrcAlpha OneMinusSrcAlpha,
// 因此传 1 表示写入自身 WorldY，传 0 表示保留VT中已有的 WorldY。
float4 EncodeWorldY(float worldY, float writeWeight = 1)
{
    return float4(WorldYToRatio01(worldY), 0, 0, writeWeight);
}

float3x3 CreateTangentToWorldPerVertex(float3 normal, float3 tangent, float tangentSign)
{
    float sign = tangentSign * unity_WorldTransformParams.w;
    float3 binormal = cross(normal, tangent) * sign;
    return float3x3(tangent, binormal, normal);
}

struct TerrainVTRaw
{
    float4 albedoAO;
    float4 worldNormalRoughness;
};

struct TerrainVTResult
{
    float3 albedo;
    float3 normal;

    float ao;
    float roughness;
    float metallic;

    float worldY;
};

// 统一解码 IndexRT + 计算 localUV：
//   IndexRT 使用 R8 格式：低7位 physicIndex，高1位 availableMip
//   depth 全局统一，通过 _VT_TerrainTileInfo.b (CurrentTreeDepth) 获取
//   nodeSize = singleTileRootSize >> CurrentTreeDepth = 1 << (MaxTreeDepth - CurrentTreeDepth)
// 输出：physicIndex、availableMipmap、localUV（节点内 [0,1] 局部UV）
void DecodeVTIndexAndLocalUV(float2 inputUV, out float physicIndex, out float availableMipmap, out float2 localUV)
{
    float indexR = _VT_IndexTex.SampleLevel(sampler_VT_IndexTex, inputUV, 0).r;
    uint packed = (uint)(indexR * 255.0 + 0.5);
    physicIndex = (float)(packed & 0x7Fu);
    availableMipmap = (float)(packed >> 7u);

    int depthShift = (int)_VT_TerrainTileInfo.g - (int)_VT_TerrainTileInfo.b;
    float nodeSize = (float)(1 << depthShift);
    float2 wpos = inputUV * _VT_RootSize;
    float2 nodeXZ = floor(wpos / nodeSize) * nodeSize;
    localUV = saturate((wpos - nodeXZ) / nodeSize);
}

TerrainVTResult SampleFromVT(float2 inputUV, float mipBias = 0)
{
    float physicIndex, availableMipmap;
    float2 localUV;
    DecodeVTIndexAndLocalUV(inputUV, physicIndex, availableMipmap, localUV);

    float mipmap = min(availableMipmap, _VT_MaxVTMip);
    float2 vtSampleUV = localUV * (_VT_PageUVScale > 0.0 ? _VT_PageUVScale : 1.0);
    float4 albedoAO = _VT_AlbedoTex.SampleLevel(vt_linear_clamp_sampler, float3(vtSampleUV, physicIndex), mipmap);
    float4 worldNormalRoughness = _VT_NormalTex.SampleLevel(vt_linear_clamp_sampler, float3(vtSampleUV, physicIndex), mipmap);
    // WorldY 数组不做ASTC块对齐，尺寸恒等于 PageSize，所以用 localUV 而非 vtSampleUV
    float worldYRatio01 = _VT_WorldYTex.SampleLevel(vt_linear_clamp_sampler, float3(localUV, physicIndex), mipmap).r;
    // [VT:WorldNormal]
    // float4 worldNormalWorldY = UNITY_SAMPLE_TEX2DARRAY_LOD(_VT_WorldNormalTex, float3(localUV, physicIndex), mipmap);

    TerrainVTResult result;
    result.albedo = albedoAO.xyz;
    result.ao = albedoAO.w;
    result.worldY = Ratio01ToWorldY(worldYRatio01);

    DecodeWorldNormalRoughness(worldNormalRoughness, result.normal, result.roughness, result.metallic);

    return result;
}

TerrainVTResult SampleFromVTByTerrainLocalPos(float3 terrainLocalPos, float mipBias = 0)
{
    float2 terrainLocalUV = float2(
        saturate(terrainLocalPos.x * _VT_TerrainInfo.g), saturate(terrainLocalPos.z * _VT_TerrainInfo.g));
    return SampleFromVT(terrainLocalUV, mipBias);
}

TerrainVTResult SampleFromVTByWorldPos(float3 worldPos, float mipBias = 0)
{
    float2 worldUV = WorldPosToUV(worldPos);
    return SampleFromVT(worldUV, mipBias);
}

TerrainVTRaw SampleVTRawByWorldPos(float3 worldPos, float mipBias = 0)
{
    float2 inputUV = WorldPosToUV(worldPos);

    float physicIndex, availableMipmap;
    float2 localUV;
    DecodeVTIndexAndLocalUV(inputUV, physicIndex, availableMipmap, localUV);

    float mipmap = 0;
    mipmap = clamp(mipmap, availableMipmap, _VT_MaxVTMip);

    TerrainVTRaw vtRaw;
    float2 vtSampleUV = localUV * (_VT_PageUVScale > 0.0 ? _VT_PageUVScale : 1.0);
    vtRaw.albedoAO = _VT_AlbedoTex.SampleLevel(vt_linear_clamp_sampler, float3(vtSampleUV, physicIndex), mipmap);
    vtRaw.worldNormalRoughness = _VT_NormalTex.SampleLevel(vt_linear_clamp_sampler, float3(vtSampleUV, physicIndex), mipmap);

    return vtRaw;
}

#if defined(VT_DEBUG_VIEW) || defined(INDEX_DEBUG_VIEW)
float4x4 _VT_MATRIX_VP;
float _VT_ShowClip;
sampler2D _VT_DebugTexWithNum;
float _VT_DebugColorRatio;
void VTDebugView(inout float3 baseColor, float3 worldPos, float2 inputUV, float clipViewArea)
{
    float physicIndex, availableMipmap;
    float2 localUV;
    DecodeVTIndexAndLocalUV(inputUV, physicIndex, availableMipmap, localUV);
    float mipmap = availableMipmap;

    // float debugLineValue = saturate(1 - fwidth(physicIndex));
    // float physicPow = pow(physicIndex, 0.5);
    // float3 debugColor = debugLineValue * float3(frac(pow(2.71828, physicPow)), frac(pow(3.14159, physicPow)), frac(pow(1.732, physicPow)));

#if UNITY_UV_STARTS_AT_TOP
    float2 tileUV = float2(floor(physicIndex % 16), 15 - floor(physicIndex / 16));
#else
    float2 tileUV = float2(floor(physicIndex % 16), floor(physicIndex / 16));
#endif
    float2 debugUV = (tileUV + localUV) / 16;
    float3 debugColor = tex2Dlod(_VT_DebugTexWithNum, float4(debugUV, 0, 0));
    baseColor = lerp(baseColor, debugColor, _VT_DebugColorRatio);
    // baseColor = debugColor;

    float4 projectpos = mul(_VT_MATRIX_VP, float4(worldPos, 1));
    float x = projectpos.x / projectpos.w;
    float y = projectpos.y / projectpos.w;
    baseColor *= (_VT_ShowClip < 1) || ((abs(x) < 1) && (abs(y) < 1));
}

// Index Debug: 将地形图层Index0映射到数字贴图进行可视化
// indexValue: 经过 PackIndexReplaceLut 后的索引值，范围 0~255
// localUV: 在每个Index区域内[0,1]变化的UV，用于在数字贴图格子内采样出完整的数字
void IndexDebugView(inout float3 baseColor, float indexValue, float2 localUV)
{
    float idx = clamp(indexValue, 0, 255);
#if UNITY_UV_STARTS_AT_TOP
    float2 tileUV = float2(floor(idx % 16), 15 - floor(idx / 16));
#else
    float2 tileUV = float2(floor(idx % 16), floor(idx / 16));
#endif
    float2 debugUV = (tileUV + localUV) / 16;
    float3 debugColor = tex2Dlod(_VT_DebugTexWithNum, float4(debugUV, 0, 0));
    baseColor = lerp(baseColor, debugColor, _VT_DebugColorRatio);
}
#endif

#endif
