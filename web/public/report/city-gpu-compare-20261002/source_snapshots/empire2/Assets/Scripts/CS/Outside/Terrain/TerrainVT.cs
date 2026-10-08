using System;
using UnityEngine;
using UnityEngine.Profiling;
using UnityEngine.Rendering;
using System.Collections.Generic;
using UnityEngine.Experimental.Rendering;

[ExecuteInEditMode]
// 默认执行顺序为51(>0), 确保本组件的Update/LateUpdate在GameLauncher(order=0, 经FrameworkCore驱动LuaMgr等管理器)之后执行,
// 即Lua侧LateUpdate逻辑完成后, 再进行地形VT的更新
[DefaultExecutionOrder(51)]
public partial class TerrainVT : MonoBehaviour
{
    // 全局只有一份Active TerrainVT（处于激活状态的）
    public static TerrainVT Instance => TerrainVT_Manager.ActiveTerrainVT;

    public bool UseVT = true;
    private bool Inited = false;
    public bool DrawDecal = true;
    public static bool HardwareSupportsDecal => TBU.Rendering.GraphicsQualitySetting.CurrentLevel <= TBU.Rendering.GraphicsQualityLevel.QualityLow;
    [Header("MeshInfo 四叉树 Add 每帧上限，0 表示本帧全部冲完。Del 始终当帧冲完")]
    public int MaxMeshInfoOpsPerFrame = 200;
    public bool KeepDetail = false; // true：_OutsideTerrainDetailLevel 始终为 0，不合并贴图，不隐藏 Decal
    public bool SubEntityDecalToVT = true;
    [Header("使用地形自身的法线 True:使用地形法线 False:地形顶点法线始终向上")]
    public bool UseTerrainNormal = false;
    public bool VTDebugView = false;
    public bool IndexDebugView = false;
    [Header("Scene 中绘制视野 Gizmos（红框采样点），默认关闭")]
    public bool DrawViewGizmos = false;
    [Range(0, 1)] public float DebugViewRatio = 0.25f;
    public bool ShowClip = false;

    [Header("横纵各有多少个地块")]
    public int TileCount = 1;
    [Header("地形的实际尺寸，数值上需要严格对应")]//[EditorReadOnly]
    public float TerrainSize = 1024;
    private float terrainSizeRcp;
    private float singleTileTerrainSize;

    // [EditorReadOnly]
    public float TerrainHeightMin = -30;
    // [EditorReadOnly]
    public float TerrainHeightMax = 30;

    public const float DefaultMaxViewDistance = 1000.0f;
    private float maxViewDistance = DefaultMaxViewDistance;
    private bool forceViewCheck = false;

    // 内城和野外共用 VTRenderer 的物理页。跨 Owner 激活时先关闭 VT 采样，
    // 等当前 TerrainVT 的可见粗 Mip 全部写入并提交后再发布，避免旧页表采到另一套地形内容。
    private bool sharedPoolWarmup;
    private bool sharedPoolWarmupReadyToPublish;
    private bool sharedPoolWarmupHasPendingNode;
    private bool sharedPoolStageTimeoutLogged;
    private int sharedPoolWarmupVisibleNodeCount;
    private int sharedPoolWarmupFrames;
    public void SetMaxViewDistance(float _maxViewDistance)
    {
        maxViewDistance = _maxViewDistance;
        forceViewCheck = true;
        camGroundFrustum?.SetMaxUpDistance(maxViewDistance);
    }

    public enum PivotType
    {
        LeftDown,
        Center,
    }

    public PivotType Pivot = PivotType.LeftDown;
    public bool IsTileOriginLeftUp = true; // true：Tile_00_00在左上角  false：Tile_00_00在左下角 

    public RenderTexture indexRT;
    public VTRenderer vtRenderer;

#if UNITY_EDITOR
    private int MaxUsedPageCount = 0;
    public string PageUsageInfo = "";
    public string PixelDensity = "";
#endif

    private QuadDriver quadDriver;

    // 实现 IComparer<QuadTree>，避免 Lambda 闭包每帧产生 GC 分配
    private class QuadTreeDistanceComparer : IComparer<QuadTree>
    {
        public Vector2 frustumCenter;

        public int Compare(QuadTree treeLeft, QuadTree treeRight)
        {
            var leftDist = (treeLeft.treeAreaCenter - frustumCenter).sqrMagnitude;
            var rightDist = (treeRight.treeAreaCenter - frustumCenter).sqrMagnitude;
            return leftDist.CompareTo(rightDist);
        }
    }
    private readonly QuadTreeDistanceComparer quadTreeDistanceComparer = new QuadTreeDistanceComparer();

    private IndexInstancedWriter indexWriter;
    private ViewChecker viewChecker;
    private PhysicIndexManager physicIndexManager;
    private CamGroundFrustum camGroundFrustum;

    private int rootSize;
    private int singleTileRootSize;

    private void CalculateTerrainOffset()
    {
        terrainOffset = transform.position;
        if (Pivot == PivotType.Center)
        {
            terrainOffset += new Vector3(-0.5f * TerrainSize, 0, -0.5f * TerrainSize);
        }
    }

    public Vector3 terrainOffset;
    public static readonly Vector4 DefaultViewEnlarge = new Vector4(0.12f, 0.08f, 0.12f, 0.12f);
    
    public Vector4 ViewEnlarge { get; set; } = DefaultViewEnlarge;

    public void CheckInit(bool forceInit = false)
    {
        // 仅判断 Inited 不够：[ExecuteInEditMode] 下经历编辑器域重载(Domain Reload)后，
        // 组件实例会保留、但非序列化的运行时对象(camGroundFrustum / quadDriver / viewChecker 等)会被置空，
        // 此时 Inited 可能仍为 true，导致 LateUpdate 直接空引用。用 camGroundFrustum 作为“运行时对象是否存活”的哨兵，
        // 一旦丢失就强制重新初始化(这些对象都在本方法里一起创建)。
        if (!forceInit && Inited && camGroundFrustum != null)
        {
            return;
        }
        
        vtRenderer = TerrainVT_Manager.GetVTRenderer();
        NodeCountNeedForDepth = new int[vtRenderer.MaxTreeDepth + 1];

        CurrentTreeDepth = 0;
        
        lastCamPosition = Vector3.negativeInfinity;

        singleTileTerrainSize = TerrainSize / TileCount;
        singleTileRootSize = 1 << vtRenderer.MaxTreeDepth;
        rootSize = singleTileRootSize * TileCount;
        terrainSizeRcp = 1.0f / TerrainSize;

        // IndexRT格式：R8（每像素1字节），编码方案：
        //   低7位存 physicIndex（取值范围 [0, 127]，当前 PageCapacity 最大 64，足够）
        //   高1位存 availableMip（0 或 1，当 VTRenderer.VTMipCount=1 时，availableMip∈{0,1}）
        // nodeParam.x / nodeParam.z / nodeParam.size 不再存入 indexRT，Shader 侧通过
        //   _VT_TerrainTileInfo.b (CurrentTreeDepth) + _VT_TerrainTileInfo.g (MaxTreeDepth) 重算
        indexRT = new RenderTexture(rootSize, rootSize, 0, RenderTextureFormat.R8, RenderTextureReadWrite.Linear)
        {
            name = "IndexRT",
            hideFlags = HideFlags.DontSave,
            useMipMap = false,
            wrapMode = TextureWrapMode.Clamp,
            autoGenerateMips = false,
            filterMode = FilterMode.Point
        };
        indexRT.Create();

        { // Clear indexRT to Zero
            var prevActiveRT = RenderTexture.active;
            Graphics.SetRenderTarget(indexRT);
            GL.Clear(false, true, Color.clear);
            RenderTexture.active = prevActiveRT;
        }

        // 每个脏结点占一个实例，同帧脏结点数不会超过 PageCapacity（每个都要占一个 physicIndex）
        indexWriter = new IndexInstancedWriter(vtRenderer.FullScreenMesh, indexRT, rootSize, vtRenderer.PageCapacity);
        viewChecker = new ViewChecker();
        physicIndexManager = new PhysicIndexManager(vtRenderer.PageCapacity);
        quadDriver = new QuadDriver(vtRenderer.PageCapacity);
        camGroundFrustum = new CamGroundFrustum(WorldPosToTerrainSpaceXZ01, maxViewDistance, ViewEnlarge);

        UpdateVTMode();

        needRefreshTiles = true;

        for (int tileX = 0; tileX < TileCount; ++tileX)
        {
            for (int tileY = 0; tileY < TileCount; ++tileY)
            {
                var tileIndex = ConvertTileIndex(tileX, ConvertTileY(tileY));
                var tileName = $"Tile_{tileX:00}_{tileY:00}";
                dictTileNameCache[tileIndex] = tileName;
                dictTileNameCacheInvert[tileName] = tileIndex;
            }
        }

        Inited = true;
    }

    public bool EnableMeshToVT => false;

    public static int MaxPixelHeight = 1080; // 最大支持分辨率
    private Vector2Int CalcGameRTSizeForVT(Camera gameCamera)
    {
        var gameRTSize = RenderPipelineUtil.CalcGameRTSize(gameCamera);

        if (gameRTSize.y > MaxPixelHeight)
        {
            float aspectRatio = (float) gameRTSize.x / gameRTSize.y;
            gameRTSize.y = MaxPixelHeight;
            gameRTSize.x = Mathf.RoundToInt(gameRTSize.y * aspectRatio);
        }

        return gameRTSize;
    }

    private int CalcDesiredTreeDepth()
    {
        var groundPos = camGroundFrustum.frustumGroundPos;
        var groundQuarterLength = (groundPos.rightQuarter_WS - groundPos.leftQuarter_WS).magnitude;

        var gameRTSize = CalcGameRTSizeForVT(TerrainCamera);

        float gamePixelPerMeter = gameRTSize.x / groundQuarterLength;
        var pixelsRealNeeded = gamePixelPerMeter * singleTileTerrainSize;

        var depthFloat = Mathf.Log(pixelsRealNeeded / VTRenderer.PageSize, 2);
        int depth = Mathf.RoundToInt(depthFloat);

        // TreeDepthBias 只在这里叠加一次：它偏移的是<目标层级>，后续 RecalcNodeCountNeedForDepth
        // 的统计范围与 UpdateTreeDepth 的降级搜索都以这个目标为起点，三者才是一致的
        depth = Mathf.Clamp(depth + VTRenderer.TreeDepthBias, vtRenderer.MinTreeDepth, vtRenderer.MaxTreeDepth);
        
#if UNITY_EDITOR
        var pixelDensityUsing = (VTRenderer.PageSize << depth) / singleTileTerrainSize;
        PixelDensity = $"{gamePixelPerMeter}  {pixelDensityUsing}  Depth: {depth} / {depthFloat:N2}";
#endif

        return depth;
    }

    private int[] NodeCountNeedForDepth;
    // 计算：在当前视野下，每层深度需要的结点数量
    private void RecalcNodeCountNeedForDepth(int desiredTreeDepth)
    {
        for (int idx = 0; idx < NodeCountNeedForDepth.Length; ++idx)
        {
            NodeCountNeedForDepth[idx] = 0;
        }

        foreach (var quadTree in listQuadTree)
        {
            quadTree.CheckNodeCountForDepth(desiredTreeDepth, viewChecker, NodeCountNeedForDepth);
        }
    }

    public static int NodeCountExtraBudget = 4; // Mip0（VT最精细Mip，每帧可以绘制的Page数量）
    private void UpdateTreeDepth(int desiredTreeDepth)
    {
        int nextUseTreeDepth = desiredTreeDepth;
        while (nextUseTreeDepth > vtRenderer.MinTreeDepth) // 找到结点数量<足够少>的最大的层
        {
            var needCount = NodeCountNeedForDepth[nextUseTreeDepth];
            if (needCount > 0 && needCount <= vtRenderer.PageCapacity - NodeCountExtraBudget)
            {
                break;
            }

            --nextUseTreeDepth;
        }

        CurrentTreeDepth = Mathf.Clamp(nextUseTreeDepth, vtRenderer.MinTreeDepth, vtRenderer.MaxTreeDepth);
    }

    public bool IsVTActive => TerrainVT_Manager.ActiveTerrainVT == this;

    internal void BeginSharedPoolWarmup()
    {
        sharedPoolWarmup = true;
        sharedPoolWarmupReadyToPublish = false;
        sharedPoolWarmupHasPendingNode = false;
        sharedPoolStageTimeoutLogged = false;
        sharedPoolWarmupVisibleNodeCount = 0;
        sharedPoolWarmupFrames = 0;

        // 丢弃上一次停留的阶段状态，但保留页分配与 MeshInfo。旧 IndexRT 此时不会再被采样。
        forceRedrawStage = ForceRedrawStage.None;
        forceRedrawHoldIndexAtMip1 = false;
        forceRedrawHasPendingNode = false;
        forceRedrawStageFrames = 0;

        if (listQuadTree != null)
        {
            foreach (var quadTree in listQuadTree)
            {
                quadTree.InvalidatePhysicalPageContent();
            }
        }

        forceViewCheck = true;
        NeedToForceRedraw = true;
        TerrainVT_Manager.SetUseTerrainVT(false);
    }

    private bool keepDetailOverrideApplied;
    private void SyncKeepDetailOverride()
    {
        bool shouldKeep = IsVTActive && KeepDetail;
        if (shouldKeep == keepDetailOverrideApplied)
        {
            return;
        }

        keepDetailOverrideApplied = shouldKeep;
        RenderPipelineUtil.SetKeepDetailOverride(shouldKeep);
        NeedToForceRedraw = true;
    }

    public void ToggleVTActive(bool isVTActive)
    {
        if (isVTActive)
        {
            TerrainVT_Manager.Activate(this);
        }
        else
        {
            TerrainVT_Manager.Deactivate(this);
        }

        SyncKeepDetailOverride();
        
#if UNITY_EDITOR && AOE_ART
        CheckWorldCliffs_InEditor(isVTActive);
        RegisterEditorDecalUpdate(isVTActive);
        CheckDecals_InEditor(isVTActive);
#endif
    }
    
    private Dictionary<string, int> dictTileNameCacheInvert = new Dictionary<string, int>();
    private Dictionary<int, string> dictTileNameCache = new Dictionary<int, string>();
    private List<QuadTree> listQuadTree = new List<QuadTree>(25);
    private Dictionary<int, Transform> dictTileTransform = new Dictionary<int, Transform>();

    void Awake()
    {
        // TerrainVT 与 TerrainVT_MeshToVT 互斥
        if (GetComponent<TerrainVT_MeshToVT>() != null)
        {
            enabled = false;
            Destroy(this);
            return;
        }

        TerrainVT_Manager.Register(this);
    }

    void OnDestroy()
    {
        Dispose();
    }
    
    void Dispose()
    {
#if UNITY_EDITOR && AOE_ART
        RegisterEditorDecalUpdate(false);
        ClearEditorDecalTracking();
#endif
        RenderPipelineUtil.DestroyTexture(ref indexRT);
        vtRenderer = null;
        indexWriter?.Dispose();
        viewChecker?.Dispose();

        dictMeshInfoOneTile?.Clear();
        pendingMeshInfoOps.Clear();
        pendingAddMeshInfoIndices.Clear();
        dictMeshInfo?.Clear();
        dictMeshInfo = null;

        foreach (var quadTree in listQuadTree)
        {
            quadDriver?.ReleaseQuadTree(quadTree);
        }
        listQuadTree = null;
        quadDriver?.Dispose();

        dictTileTransform.Clear();
        UpdateVTMode(true);

        if (keepDetailOverrideApplied)
        {
            keepDetailOverrideApplied = false;
            RenderPipelineUtil.SetKeepDetailOverride(false);
        }
        
        CameraCtrl = null;

        Inited = false;

        TerrainVT_Manager.Deregister(this);
    }

    private int ConvertTileY(int tileY)
    {
        return IsTileOriginLeftUp ? TileCount - 1 - tileY : tileY;
    }

    public string GetTileName(int tileX, int tileY)
    {
        int tileIndex = ConvertTileIndex(tileX, tileY);
        if (!dictTileNameCache.TryGetValue(tileIndex, out var tileName))
        {
            tileName = $"Tile_{tileX:00}_{tileY:00}";
            dictTileNameCache[tileIndex] = tileName;
        }

        return tileName;
    }

    private void UpdateTileTransformDict(Transform vtTransform)
    {
        dictTileTransform.Clear();

        var childCount = vtTransform.childCount;
        for (int idx = 0; idx < childCount; ++idx)
        {
            var tileTransform = vtTransform.GetChild(idx);
            var transformName = tileTransform.name;
            if (dictTileNameCacheInvert.TryGetValue(transformName, out var tileIndex))
            {
                dictTileTransform[tileIndex] = tileTransform;
            }
        }

        if (TileCount == 1) // TileCount只有一个时，大部分情况下，TerrainVT组件也是<MeshRenderer>自身
        {
            var tileName = GetTileName(0, 0);
            if (!dictTileTransform.ContainsKey(0))
            {
                dictTileTransform[0] = vtTransform;
            }
        }
    }

    private MeshMaterialInfo CreateSingleMaterialMesh(int tileX, int tileY, GameObject tileGo)
    {
        var MeshRenderer = tileGo.GetComponent<MeshRenderer>();
        var terrainMaterial = MeshRenderer.sharedMaterial;
        Mesh terrainMesh = null;

        // var lodByCameraHeight = tileGo.GetComponent<LodByCameraHeight>();
        // if (lodByCameraHeight != null)
        // {
        //     int meshCount = lodByCameraHeight.meshLods.Length;
        //     terrainMesh = lodByCameraHeight.meshLods[meshCount - 1];
        // }

        if (terrainMesh == null)
        {
            var MeshFilter = tileGo.GetComponent<MeshFilter>();
            terrainMesh = MeshFilter.sharedMesh;
        }

        var tileInfo = new TileInfo(TileCount, tileX, tileY);
        if (terrainMesh == null || terrainMaterial == null)
        {
            return null;
        }

        return new MeshMaterialInfo(terrainMesh, terrainMaterial, tileInfo);
    }

    public Camera TerrainCamera;
    private BaseCameraCtrl CameraCtrl;

    public static readonly int ID_VT_TerrainInfo = Shader.PropertyToID("_VT_TerrainInfo");
    public static readonly int ID_VT_TerrainTileInfo = Shader.PropertyToID("_VT_TerrainTileInfo");
    public static readonly int ID_VT_TerrainHeightInfo = Shader.PropertyToID("_VT_TerrainHeightInfo");
    public static readonly int ID_VT_MATRIX_VP = Shader.PropertyToID("_VT_MATRIX_VP");
    public static readonly int ID_VT_CameraTerrainPos = Shader.PropertyToID("_VT_CameraTerrainPos");
    public static readonly int ID_VT_ShowClip = Shader.PropertyToID("_VT_ShowClip");
    public static readonly int ID_VT_DebugTexWithNum = Shader.PropertyToID("_VT_DebugTexWithNum");
    public static readonly int ID_VT_DebugColorRatio = Shader.PropertyToID("_VT_DebugColorRatio");
    public static readonly int ID_VT_Feedback_MVP = Shader.PropertyToID("_VT_Feedback_MVP");
    public static readonly int ID_VT_RootSize = Shader.PropertyToID("_VT_RootSize");
    public static readonly int ID_VT_IndexTex = Shader.PropertyToID("_VT_IndexTex");

    Vector2 WorldPosToTerrainSpaceXZ01(Vector3 worldPos)
    {
        return new Vector2(
            Mathf.Clamp01((worldPos.x - terrainOffset.x) * terrainSizeRcp),
            Mathf.Clamp01((worldPos.z - terrainOffset.z) * terrainSizeRcp)
        );
    }

    Vector3 WorldPosToTerrainSpace(Vector3 worldPos)
    {
        var terrainPos01 = WorldPosToTerrainSpaceXZ01(worldPos);
        return new Vector3(terrainPos01.x * rootSize, worldPos.y - terrainOffset.y, terrainPos01.y * rootSize);
    }

    /// 把世界空间 Bounds 的 XZ 换算到地形 [0,1] 空间，结果格式与 nodeArea 一致 [xMin, yMin, xMax, yMax]。
    /// 对同一个 MeshInfo 而言这是常量，遍历四叉树前算一次即可，不要在每个结点上重复换算。
    /// boundsInfo [x: Bounds.min.x, y: Bounds.min.z, z: Bounds.max.x, w: Bounds.max.z]
    public Vector4 WorldBoundsToTerrainArea(Vector4 boundsInfo)
    {
        return new Vector4(
            (boundsInfo.x - terrainOffset.x) * terrainSizeRcp,
            (boundsInfo.y - terrainOffset.z) * terrainSizeRcp,
            (boundsInfo.z - terrainOffset.x) * terrainSizeRcp,
            (boundsInfo.w - terrainOffset.z) * terrainSizeRcp);
    }

    public Vector4 TerrainAreaToWorldBounds(Vector4 area)
    {
        return new Vector4(
            area.x * TerrainSize + terrainOffset.x,
            area.y * TerrainSize + terrainOffset.z,
            area.z * TerrainSize + terrainOffset.x,
            area.w * TerrainSize + terrainOffset.z);
    }

    // 两个参数需处于同一空间的 [xMin, yMin, xMax, yMax]（地形 [0,1] 或世界 XZ 均可）
    public static bool CheckAreaOverlapsArea(Vector4 meshArea, Vector4 nodeArea)
    {
        return nodeArea.z > meshArea.x && nodeArea.x < meshArea.z &&
               nodeArea.w > meshArea.y && nodeArea.y < meshArea.w;
    }

    bool CheckBoundsOverlapsArea(Vector4 boundsInfo, Vector4 area)
    {
        return CheckAreaOverlapsArea(WorldBoundsToTerrainArea(boundsInfo), area);
    }

    private int CurrentTreeDepth = 0;

    void LateUpdate()
    {
        if (!PerfUpdateEnabled) return;
        if (!IsVTActive) return;
        if (TerrainCamera == null) return;

        unscaledDeltaTime = Time.unscaledDeltaTime;

        CalculateTerrainOffset();
        CheckInit(false);
        SyncKeepDetailOverride();

        bool shouldRecalcNodeCountNeedForDepth = needRefreshTiles;
        Profiler.BeginSample("[VT] RefreshTiles");
        bool addedQuadTreeThisFrame = RefreshTiles(false);
        Profiler.EndSample();

        var camTransform = TerrainCamera.transform;
        var camPosInTerrainSpace = WorldPosToTerrainSpace(camTransform.position);
        if (CameraCtrl != null)
        {
            camPosInTerrainSpace.y -= CameraCtrl.GetCorePlaneY();
        }

        UpdateVTMode();
        CheckDebugView();

        Profiler.BeginSample("[VT] UpdateView");
        if (forceViewCheck || CheckCameraMoved(TerrainCamera.transform.position))
        {
            UpdateViewChecker();
            forceViewCheck = false;
            shouldRecalcNodeCountNeedForDepth = true;
        }
        Profiler.EndSample();

        Profiler.BeginSample("[VT] TreeDepth");
        quadTreeDistanceComparer.frustumCenter = camGroundFrustum.frustumGroundPos.center_TS01;
        listQuadTree.Sort(quadTreeDistanceComparer);

        {
            // 根据像素密度和相机视野，计算并刷新 Tree Depth
            int desiredTreeDepth = CalcDesiredTreeDepth();
            if (shouldRecalcNodeCountNeedForDepth)
            {
                RecalcNodeCountNeedForDepth(desiredTreeDepth);
            }

            UpdateTreeDepth(desiredTreeDepth);
        }
        Profiler.EndSample();

        Shader.SetGlobalVector(ID_VT_TerrainInfo,
            new Vector4(TerrainSize, terrainSizeRcp, terrainOffset.x, terrainOffset.z));
        Shader.SetGlobalVector(ID_VT_TerrainTileInfo,
            new Vector4(TileCount, vtRenderer.MaxTreeDepth, CurrentTreeDepth, 0));

        int TreeDepthInvert = vtRenderer.MaxTreeDepth - CurrentTreeDepth;
        Shader.SetGlobalVector(ID_VT_TerrainHeightInfo,
            new Vector4(TerrainHeightMin, TerrainHeightMax, TreeDepthInvert, terrainOffset.y));
        Shader.SetGlobalVector(ID_VT_CameraTerrainPos, camPosInTerrainSpace);
        Shader.SetGlobalInt(ID_VT_RootSize, rootSize);
        Shader.SetGlobalTexture(ID_VT_IndexTex, indexRT);

        Profiler.BeginSample("[VT] ForceRedraw");
        if (NeedToForceRedraw)
        {
            NeedToForceRedraw = false;
            // 这里的 ForceRedraw，本质上是给所有<可绘制结点>标记一次待重绘，真正的重绘发生在后面的 UpdateByViewRect 函数中
            ForceRedraw();
        }
        Profiler.EndSample();

        // 在 RefreshTiles 之后、UpdateByViewRect 之前冲刷：新地块已建树，本帧 RedrawCurrentMip 能被立刻绘制。
        // Del 当帧冲完，避免镜头拉高集体销毁资源田后 VT page 上残留 Decal。
        // 新 Tile 首次发布 mip1 前必须把已注册的 Add 全部落到新树，
        // 否则分帧队列会让粗 mip 先画一张缺 Decal 的 page，后续 mip0/重绘才突然出现。
        ProcessPendingMeshInfoOps(flushAllAdds: addedQuadTreeThisFrame);

#if ENABLE_PROFILER
        if (GMRenderPassToggle.IsVTSubmitEnabled())
        {
#endif
        Profiler.BeginSample("[VT] UpdateByViewRect");
        forceRedrawHasPendingNode = false;
        if (sharedPoolWarmup)
        {
            sharedPoolWarmupHasPendingNode = false;
            sharedPoolWarmupVisibleNodeCount = 0;
        }
        quadDriver.UpdateByViewRect(CurrentTreeDepth, listQuadTree, viewChecker);
        Profiler.EndSample();

        // 本阶段的 page 是否都画完了，只能等本帧遍历完所有可见结点才知道。
        // 阶段推进会写 IndexRT，必须排在 indexWriter.Flush() 之前
        UpdateForceRedrawStage();
        TryScheduleSharedPoolWarmupPublish();

        // 本帧攒下的所有 page 绘制与 IndexRT 索引写入，在这里一次性提交给 GPU。
        // RenderQuadNode 只会在上面的 UpdateByViewRect 内部被调用到，所以这里是唯一的提交点。
        vtRenderer.FlushRenderCommands();
        Profiler.BeginSample("[VT] IndexFlush");
        indexWriter.Flush();
        Profiler.EndSample();
        PublishSharedPoolWarmupAfterFlush();
#if ENABLE_PROFILER
        }
#endif

#if UNITY_EDITOR
        int usingPageCount = vtRenderer.PageCapacity - physicIndexManager.FreeCount;
        MaxUsedPageCount = usingPageCount > MaxUsedPageCount ? usingPageCount : MaxUsedPageCount;
        PageUsageInfo = $"【{CurrentTreeDepth}】【{MaxUsedPageCount}】 【{usingPageCount} / {vtRenderer.PageCapacity}:{camPosInTerrainSpace.y:N2}】";

        if (RealtimeUpdateInEditor)
        {
            NeedToForceRedraw = true;
        }
#endif


#if UNITY_EDITOR && LINK_TEST
        if (renderCounterThisFrameForAllMip > 0)
        {
            // Debug.Log($"VT.renderCounter 【{Time.frameCount}】 {renderCounterThisFrameForAllMip}  {renderDynamicMeterConsumedThisFrame}");
        }
#endif
        
        renderCounterThisFrameForAllMip = 0;
        renderDynamicMeterConsumedThisFrame = 0;
        hasDrawnMipZeroThisFrame = false;
    }

    public void UpdateCameraCtrl(BaseCameraCtrl _cameraCtrl, float _maxViewDistance = DefaultMaxViewDistance)
    {
        CameraCtrl = _cameraCtrl;
        TerrainCamera = CameraCtrl.GetCamera();
        SetMaxViewDistance(_maxViewDistance);
    }

    private void UpdateViewChecker()
    {
        if (CameraCtrl != null)
        {
            camGroundFrustum.Calculate(TerrainCamera, CameraCtrl.GetCorePlaneY(), CameraCtrl.GetTerrainHeightByWorldPos);
        }
        else
        {
            camGroundFrustum.Calculate(TerrainCamera, 0, null);
        }

        viewChecker.UpdateView(validTileArea, camGroundFrustum);
    }

    private void CheckDebugView()
    {
        if (VTDebugView)
        {
            TerrainVT_Manager.SKC_VT_DEBUG_VIEW.EnableKeyword();
            var debugTex = GenDebugTexture.GetDebugTexture();
            foreach (var meshMat in listTerrainMeshMat)
            {
                var terrainMaterial = meshMat.terrainMaterial;
                terrainMaterial.SetMatrix(ID_VT_MATRIX_VP,
                    TerrainCamera.projectionMatrix * TerrainCamera.worldToCameraMatrix);
                terrainMaterial.SetFloat(ID_VT_ShowClip, ShowClip ? 1 : 0);
                terrainMaterial.SetTexture(ID_VT_DebugTexWithNum, debugTex);
                terrainMaterial.SetFloat(ID_VT_DebugColorRatio, DebugViewRatio);
            }
        }
        else
        {
            TerrainVT_Manager.SKC_VT_DEBUG_VIEW.DisableKeyword();
        }

        TerrainVT_Manager.SKC_TANGENT_SPACE_NORMAL_UP.ToggleKeyword(!UseTerrainNormal);

        if (IndexDebugView)
        {
            TerrainVT_Manager.SKC_INDEX_DEBUG_VIEW.EnableKeyword();
            var debugTex = GenDebugTexture.GetDebugTexture();
            foreach (var meshMat in listTerrainMeshMat)
            {
                var terrainMaterial = meshMat.terrainMaterial;
                terrainMaterial.SetTexture(ID_VT_DebugTexWithNum, debugTex);
                terrainMaterial.SetFloat(ID_VT_DebugColorRatio, 1.0f);
            }
        }
        else
        {
            TerrainVT_Manager.SKC_INDEX_DEBUG_VIEW.DisableKeyword();
        }
    }

    private bool needRefreshTiles = true;
    private HashSet<int> tileIndexToAddQuadTree = new HashSet<int>();
    private HashSet<int> tileIndexToDelQuadTree = new HashSet<int>();

    public void OnTilesUpdated()
    {
        needRefreshTiles = true;
    }

    /// SplitLod模式下，LOD切换后Mesh/Material已被外部替换，
    /// 需要刷新 dictTerrainMeshMat 中缓存的 MeshMaterialInfo 引用，并触发VT重绘
    public void RefreshMeshMaterialReferences()
    {
        if (!Inited) return;

        foreach (var kv in dictTerrainMeshMat)
        {
            var tileIndex = kv.Key;
            var meshMatInfo = kv.Value;

            if (!dictTileTransform.TryGetValue(tileIndex, out var tileTransform) || tileTransform == null)
                continue;

            var meshFilter = tileTransform.gameObject.GetComponent<MeshFilter>();
            var newMesh = meshFilter.sharedMesh;
            meshMatInfo.terrainMesh = newMesh;
        }
    }

    // 初始化Tile信息，或者镜头移动，导致Tile信息刷新（包括ListQuadTree的构建）
    private bool RefreshTiles(bool force)
    {
        if (!force && !needRefreshTiles)
        {
            return false;
        }
        needRefreshTiles = false;

        // 刷新地块信息列表
        tileIndexToAddQuadTree.Clear();
        tileIndexToDelQuadTree.Clear();

        { // 刷新材质与Mesh信息
            UpdateTileTransformDict(transform);

            // 删除过时的
            foreach (var kv in dictTerrainMeshMat)
            {
                var tileIndex = kv.Key;
                if (!dictTileTransform.ContainsKey(tileIndex))
                {
                    tileIndexToDelQuadTree.Add(tileIndex);
                }
            }
            
            foreach (var tileIndex in tileIndexToDelQuadTree)
            {
                dictTerrainMeshMat.Remove(tileIndex);
            }

            // 添加新增的
            foreach (var kv in dictTileTransform)
            {
                var tileIndex = kv.Key;
                ConvertTileIndex(tileIndex, out var tileX, out var tileY);

                var tileTransform = kv.Value;
                if (tileTransform != null && !dictTerrainMeshMat.ContainsKey(tileIndex))
                {
                    var meshMatInfo = CreateSingleMaterialMesh(tileX, tileY, tileTransform.gameObject);
                    if (meshMatInfo != null)
                    {
                        dictTerrainMeshMat.Add(tileIndex, meshMatInfo);
                        tileIndexToAddQuadTree.Add(tileIndex);
                    }
                }
            }

            listTerrainMeshMat.Clear();
            listTerrainMeshMat.AddRange(dictTerrainMeshMat.Values);
        }

        { // 刷新四叉树列表
            for (int idx = listQuadTree.Count - 1; idx >= 0; --idx)
            {
                var quadTree = listQuadTree[idx];
                if (tileIndexToDelQuadTree.Contains(quadTree.TileInfo.TileIndex))
                {
                    quadDriver.ReleaseQuadTree(quadTree);
                    listQuadTree.RemoveAt(idx);
                }
            }

            foreach (var tileIndex in tileIndexToAddQuadTree)
            {
                var info = dictTerrainMeshMat[tileIndex];
                var quadTree = quadDriver.FetchQuadTree(this, rootSize, singleTileRootSize, info.tileInfo, physicIndexManager);
                PopulateExistingMeshInfos(quadTree);
                listQuadTree.Add(quadTree);
            }
        }

        CalcValidArea();

        // 地块增删会改 ViewChecker 的 validArea。镜头大距离跳转时，WorldTileStreaming
        // 可能比 TerrainVT 晚一帧才换地块，而 lastCamPosition 已在跳转当帧更新，
        // 下一帧 CheckCameraMoved 为 false，ViewChecker 会继续用旧 validArea，
        // 新地块 QueryViewVisible 恒为 false，表现为 VT 不刷新。
        if (tileIndexToAddQuadTree.Count > 0 || tileIndexToDelQuadTree.Count > 0)
        {
            forceViewCheck = true;
        }
        
#if UNITY_EDITOR && LINK_TEST
        CheckMaterialCompatibility();
#endif

        return tileIndexToAddQuadTree.Count > 0;
    }

    /// 新建 Tile 的四叉树不会自动经历历史 Add 操作。这里回放已经落入其他树的 MeshInfo，
    /// 保证跨 Tile 的 Decal 以及镜头移动前已注册的 Decal 能进入新 Tile 的首张 page。
    /// 仍在 pendingAddMeshInfoIndices 中的项由紧接着的 ProcessPendingMeshInfoOps 统一处理，避免重复插入。
    private void PopulateExistingMeshInfos(QuadTree quadTree)
    {
        if (quadTree == null || dictMeshInfo == null || dictMeshInfo.Count == 0)
        {
            return;
        }

        foreach (var kv in dictMeshInfo)
        {
            if (pendingAddMeshInfoIndices.Contains(kv.Key))
            {
                continue;
            }

            var meshInfo = kv.Value;
            if (meshInfo == null || !meshInfo.isValid)
            {
                continue;
            }

            var meshArea = WorldBoundsToTerrainArea(meshInfo.boundsInfo);
            quadTree.AddOrDelMeshInfo(kv.Key, meshInfo, meshArea, MeshInfoOp.Add);
        }
    }

    private Vector4 validTileArea = new Vector4(0, 0, 1, 1); // xyzw 分别对应 xMin yMin xMax yMax
    private void CalcValidArea()
    {
        if (listQuadTree.Count == 0)
        {
            validTileArea = new Vector4(0, 0, 1, 1);
            return;
        }

        var firstArea = listQuadTree[0].treeArea;
        validTileArea = firstArea;
        for (int idx = 1; idx < listQuadTree.Count; ++idx)
        {
            var quadTree = listQuadTree[idx];
            var area = quadTree.treeArea;
            validTileArea.x = validTileArea.x < area.x ? validTileArea.x : area.x;
            validTileArea.z = validTileArea.z > area.z ? validTileArea.z : area.z; 
            validTileArea.y = validTileArea.y < area.y ? validTileArea.y : area.y; 
            validTileArea.w = validTileArea.w > area.w ? validTileArea.w : area.w; 
        }
    }

#if UNITY_EDITOR
    [Header("每帧强制重绘VT，只在编辑器生效")]
    public bool RealtimeUpdateInEditor = false;
    
    private void CheckMaterialCompatibility()
    {
        foreach (var meshMat in listTerrainMeshMat)
        {
            var terrainMaterial = meshMat.terrainMaterial;
            if (!IsMaterialCompatible(terrainMaterial))
            {
                Debug.LogError("错误：使用的材质不支持VT，缺少 <RENDERTOVT> Pass", terrainMaterial);
            }
        }
    }
#endif

    // 本帧动态计量初始值。Mip0 消耗 4，非 Mip0 消耗 1；剩余 < 4 时本帧不再绘制 Mip0
    // 上一帧真实间隔超过 SlowFrameIntervalSeconds 时，本帧最多再画 1 个 Mip0
    public const int DefaultRenderLimitForMipZero = 20;
    private const int DynamicMeterCostMipZero = 4;
    private const int DynamicMeterCostNonMipZero = 1;
    private const float SlowFrameIntervalSeconds = 0.036f;
    public static int RenderLimitForMipZero = VTRenderer.VTMipCount > 1
        ? DefaultRenderLimitForMipZero
        : System.Int32.MaxValue;

    public static bool PerfUpdateEnabled { get; private set; } = true;
    public static int PerfRenderPageBudgetForMipZero =>
        RenderLimitForMipZero == System.Int32.MaxValue ? 0 : RenderLimitForMipZero;

    public static void ConfigurePerfDiagnostic(bool updateEnabled, int renderPageBudgetForMipZero)
    {
        PerfUpdateEnabled = updateEnabled;
        RenderLimitForMipZero = renderPageBudgetForMipZero > 0
            ? renderPageBudgetForMipZero
            : System.Int32.MaxValue;
    }

    public static void ResetPerfDiagnostic()
    {
        PerfUpdateEnabled = true;
        RenderLimitForMipZero = VTRenderer.VTMipCount > 1
            ? DefaultRenderLimitForMipZero
            : System.Int32.MaxValue;
    }

    public void RenderQuadNode(QuadNode quadNode)
    {
#if ENABLE_PROFILER
        if (!GMRenderPassToggle.IsVTSubmitEnabled())
        {
            return;
        }
#endif

        if (quadNode.physicTexIndex <= InvalidPhysicIndex)
        {
#if UNITY_EDITOR && LINK_TEST
            Debug.LogError($"Attempt to Render QuadeNode with physicTexIndex {quadNode.physicTexIndex}");
#endif
            return;
        }

        bool isPendingRedraw = quadNode.HasPendingRedraw;
        if (quadNode.availableMip <= 0 && !isPendingRedraw) // 已经绘制完成所有mip
        {
            return;
        }

        int renderingMip;
        if (isPendingRedraw)
        {
            int coarseMip = VTRenderer.MaxVTMip;
            if (forceRedrawStage == ForceRedrawStage.Mip1 && coarseMip > 0)
            {
                // Mip1 阶段只消费粗 mip 请求，mip0 位保留到下一阶段。
                if (!quadNode.IsMipPendingRedraw(coarseMip))
                {
                    return;
                }
                renderingMip = coarseMip;
            }
            else if (forceRedrawHoldIndexAtMip1 && coarseMip > 0 &&
                     quadNode.IsMipPendingRedraw(coarseMip))
            {
                // 索引正在采样 mip1，Decal 变更后先刷可见的 mip1，再按配额补 mip0。
                renderingMip = coarseMip;
            }
            else
            {
                renderingMip = quadNode.GetFinestPendingRedrawMip();
                if (renderingMip < 0)
                {
                    return;
                }
            }
        }
        else
        {
            renderingMip = quadNode.availableMip - 1;
        }

        if (renderingMip == 0)
        {
            // 分阶段重绘的 Mip1 阶段：所有 page 的 mip1 都补画完之前，一律不开工 mip0
            if (forceRedrawStage == ForceRedrawStage.Mip1)
            {
                return;
            }

            // 绘制 Mip0 受本帧动态计量约束：剩余 < Mip0消耗则拒绝；非Mip0始终绘制
            if (RenderLimitForMipZero - renderDynamicMeterConsumedThisFrame < DynamicMeterCostMipZero)
            {
                return;
            }

            // 上一帧间隔超过 36ms 时，本帧最多只画一个 Mip0
            if (unscaledDeltaTime > SlowFrameIntervalSeconds && hasDrawnMipZeroThisFrame)
            {
                return;
            }
        }

        var patchInfo = quadNode.GetUVInSingleTile();
        var renderTask = new VTRenderer.RenderTask(quadNode.physicTexIndex, renderingMip,
            quadNode.tileInfo, patchInfo, quadNode.nodeParam.nodeArea, quadNode.hashMeshInfoIndex);
        // 无有效地块 / Mesh / Pass 时没有录入绘制，不能推进 Mip 或发布旧物理页。
        if (!vtRenderer.TryRender(this, renderTask, out bool textureMipsReady))
        {
            return;
        }

        // 待重绘只是补画指定 mip（内容变更或贴图 mip 未驻留），不推进 availableMip。
        if (!isPendingRedraw)
        {
            quadNode.availableMip = renderingMip;
        }
        if (textureMipsReady)
        {
            quadNode.ClearMipRedraw(renderingMip);
        }
        else
        {
            quadNode.MarkMipForRedraw(renderingMip);
        }

        var nodeParam = quadNode.nodeParam;
        indexWriter.FillSubRegion(quadNode.GetIndexByte(forceRedrawHoldIndexAtMip1),
            nodeParam.x, nodeParam.z, nodeParam.size);

        ++renderCounterThisFrameForAllMip;
        renderDynamicMeterConsumedThisFrame += renderingMip == 0
            ? DynamicMeterCostMipZero
            : DynamicMeterCostNonMipZero;
        if (renderingMip == 0)
        {
            hasDrawnMipZeroThisFrame = true;
        }
        
#if UNITY_EDITOR && LINK_TEST
        // Debug.LogWarning($"VT.RenderQuadNode 【{Time.frameCount}】 {renderCounter}");
#endif
    }

    private int renderCounterThisFrameForAllMip = 0;
    private int renderDynamicMeterConsumedThisFrame = 0;
    private bool hasDrawnMipZeroThisFrame;
    private float unscaledDeltaTime;

    public class MeshMaterialInfo
    {
        public Mesh terrainMesh;
        public Material terrainMaterial;
        public int renderToVTPassIndex;
        public TileInfo tileInfo;

        public MeshMaterialInfo(Mesh _mesh, Material _material, TileInfo _tileInfo)
        {
            terrainMesh = _mesh;
            terrainMaterial = _material;
            renderToVTPassIndex = terrainMaterial.FindPass(PassName_RenderToVT);
            tileInfo = _tileInfo;
        }
    }
    private List<MeshMaterialInfo> listTerrainMeshMat = new List<MeshMaterialInfo>();
    public Dictionary<int, MeshMaterialInfo> dictTerrainMeshMat = new Dictionary<int, MeshMaterialInfo>();
    
    // 强制全量重绘一次
    public bool NeedToForceRedraw;

    /// ForceRedraw 分两个阶段完成，整屏只切换两次，不会出现新旧内容逐页交替：
    ///   Mip1 阶段：把所有 page 的 mip1 重画一遍，期间禁止绘制 mip0，画面仍是旧的 mip0；
    ///   Mip0 阶段：mip1 全部就绪后索引整体切到 mip1（画面一次性换成新内容），
    ///              再按限帧配额逐页补画 mip0，期间写索引时把 mip 位钉在 1；
    ///   Mip0 全部就绪后索引写回真实 mip 位，画面一次性切回 mip0。
    private enum ForceRedrawStage
    {
        None,
        Mip1,
        Mip0,
    }

    /// ForceRedraw 分阶段流程中，对每个持有 page 的结点执行的一步操作
    public enum ForceRedrawStep
    {
        RedrawCurrentMip, // 不分阶段时的即时重绘：只重画当前被采样的那一级 mip
        MarkMip1,         // 给结点排上 mip1 重绘
        BeginMip0,        // 显示整体切到 mip1，并给 mip0 内容陈旧的结点排上 mip0 重绘
        CommitMip0,       // 索引写回真实 mip 位
    }

    // 单个阶段的帧数上限：Mip0 阶段受限帧配额约束，正常是 PageCapacity / 每帧配额 帧就能画完。
    // 贴图 mip 迟迟不驻留会让结点一直欠重绘，这里兜底收尾，避免画面长期停在 mip1
    private const int ForceRedrawStageMaxFrames = 120;

    private ForceRedrawStage forceRedrawStage = ForceRedrawStage.None;
    // 显示被整体钉在 mip1：结点的 availableMip 照常推进到 0，但写索引时 mip 位强制为 1。
    // 跨阶段保持，Mip0 阶段中途又来一次 ForceRedraw 时，已画完的结点不能先掉回 mip0
    private bool forceRedrawHoldIndexAtMip1;
    private bool forceRedrawHasPendingNode; // 本帧是否还有结点欠当前阶段的绘制
    private int forceRedrawStageFrames;

    private void ForceRedraw()
    {
        bool useStagedRedraw = VTRenderer.MaxVTMip > 0;
#if UNITY_EDITOR
        // 逐帧重绘的预览模式下，分阶段流程每帧都会从 Mip1 阶段重启，mip0 永远画不出来
        useStagedRedraw &= !RealtimeUpdateInEditor;
#endif
        if (!useStagedRedraw)
        {
            EndForceRedrawStage();
            ApplyForceRedrawStep(ForceRedrawStep.RedrawCurrentMip);
            return;
        }

        forceRedrawStage = ForceRedrawStage.Mip1;
        forceRedrawStageFrames = 0;
        ApplyForceRedrawStep(ForceRedrawStep.MarkMip1);
    }

    /// 由 QuadNode.UpdateByViewRect 对每个可见叶结点调用，统计页面写入与源纹理质量是否就绪。
    /// Mip1 阶段只检查 mip1 位，同时保留的 mip0 重绘不会阻塞阶段切换。
    private void ReportForceRedrawNode(QuadNode quadNode)
    {
        if (sharedPoolWarmup)
        {
            ++sharedPoolWarmupVisibleNodeCount;
            int coarseMip = VTRenderer.MaxVTMip;
            // 待重绘位只表示源纹理还未达到请求的清晰度；DrawMesh 已写入当前 Owner 内容。
            if (quadNode.physicTexIndex <= InvalidPhysicIndex || quadNode.availableMip > coarseMip)
            {
                sharedPoolWarmupHasPendingNode = true;
            }
        }

        if (forceRedrawStage == ForceRedrawStage.None || forceRedrawHasPendingNode)
        {
            return;
        }

        if (quadNode.physicTexIndex <= InvalidPhysicIndex)
        {
            // 普通重绘仍保留原来仅统计已持有 page 的语义；首次发布必须等待完整覆盖。
            forceRedrawHasPendingNode |= sharedPoolWarmup;
            return;
        }

        int stageMip = forceRedrawStage == ForceRedrawStage.Mip1 ? VTRenderer.MaxVTMip : 0;
        if (quadNode.availableMip > stageMip || quadNode.HasPendingRedrawAtOrAbove(stageMip))
        {
            forceRedrawHasPendingNode = true;
        }
    }

    private void UpdateForceRedrawStage()
    {
        if (forceRedrawStage == ForceRedrawStage.None)
        {
            return;
        }

        bool stageTimeout = ++forceRedrawStageFrames >= ForceRedrawStageMaxFrames;
        // 只有“尚未写入当前 Owner 的粗页”不能超时放行。源贴图清晰度仍使用原有 120 帧兜底。
        bool waitingForWarmupCoverage = sharedPoolWarmup &&
            (sharedPoolWarmupVisibleNodeCount <= 0 || sharedPoolWarmupHasPendingNode);
        if (waitingForWarmupCoverage)
        {
            if (stageTimeout)
            {
                if (!sharedPoolStageTimeoutLogged)
                {
                    sharedPoolStageTimeoutLogged = true;
                    Debug.LogWarning($"TerrainVT shared-pool warmup still has unwritten pages, keep fallback and retry. #{name}", this);
                }
                forceRedrawStageFrames = 0;
            }
            return;
        }

        if (forceRedrawHasPendingNode && !stageTimeout)
        {
            return;
        }

        forceRedrawStageFrames = 0;
        if (forceRedrawStage == ForceRedrawStage.Mip1 && !stageTimeout)
        {
            forceRedrawStage = ForceRedrawStage.Mip0;
            forceRedrawHoldIndexAtMip1 = true;
            sharedPoolStageTimeoutLogged = false;
            ApplyForceRedrawStep(ForceRedrawStep.BeginMip0);
        }
        else
        {
            // Commit 写回真实 availableMip；未画 Mip0 的结点仍采已写好的 Mip1，质量重试继续保留。
            EndForceRedrawStage();
        }
    }

    private void TryScheduleSharedPoolWarmupPublish()
    {
        if (!sharedPoolWarmup || sharedPoolWarmupReadyToPublish)
        {
            return;
        }

        bool warmupReady = sharedPoolWarmupVisibleNodeCount > 0 && !sharedPoolWarmupHasPendingNode;
        if (!warmupReady)
        {
            // 单 Mip / 编辑器实时预览没有 ForceRedrawStage，单独保留一次超时诊断；安全策略仍是继续 fallback。
            if (forceRedrawStage == ForceRedrawStage.None &&
                ++sharedPoolWarmupFrames >= ForceRedrawStageMaxFrames)
            {
                sharedPoolWarmupFrames = 0;
                if (!sharedPoolStageTimeoutLogged)
                {
                    sharedPoolStageTimeoutLogged = true;
                    Debug.LogWarning($"TerrainVT shared-pool warmup timed out, keep fallback and retry. " +
                                   $"Visible={sharedPoolWarmupVisibleNodeCount}, Pending={sharedPoolWarmupHasPendingNode}. #{name}", this);
                }
            }
            return;
        }

        // 两级 Mip 等粗页阶段结束（完成或安全超时）；此时索引只指向已写入的 Mip。
        if (VTRenderer.MaxVTMip > 0 && forceRedrawStage == ForceRedrawStage.Mip1)
        {
            return;
        }

        sharedPoolWarmupFrames = 0;
        sharedPoolWarmupReadyToPublish = true;
    }

    private void PublishSharedPoolWarmupAfterFlush()
    {
        if (!sharedPoolWarmupReadyToPublish)
        {
            return;
        }

        sharedPoolWarmupReadyToPublish = false;
        sharedPoolWarmup = false;
        sharedPoolStageTimeoutLogged = false;

        // 调用点位于物理页和 IndexRT 两次 Flush 之后，首次重新采样的一定是当前 TerrainVT 内容。
        UpdateVTMode();
    }

    // 索引写回真实的 mip 位：availableMip 已经降到 0 的结点由此整屏切到 mip0
    private void EndForceRedrawStage()
    {
        if (forceRedrawStage == ForceRedrawStage.None && !forceRedrawHoldIndexAtMip1)
        {
            return;
        }

        forceRedrawStage = ForceRedrawStage.None;
        forceRedrawHoldIndexAtMip1 = false;
        ApplyForceRedrawStep(ForceRedrawStep.CommitMip0);
    }

    private void ApplyForceRedrawStep(ForceRedrawStep step)
    {
        foreach (var quadTree in listQuadTree)
        {
            quadTree.ApplyForceRedrawStep(step);
        }
    }

    public void UpdateVTMode(bool isDispose = false)
    {
        if (!IsVTActive) return;

        bool enableVTEffect = !isDispose && UseVT && TerrainCamera.enabled && !sharedPoolWarmup;
#if UNITY_EDITOR && AOE_ART
        var tctComp = GetComponent<TerrainChangeTiling>();
        if (tctComp != null && !tctComp.Editor_EnableVTEffectInCity)
        {
            enableVTEffect = false;
        }
#endif

        TerrainVT_Manager.SetUseTerrainVT(enableVTEffect);
    }

    private Vector3 lastCamPosition = Vector3.negativeInfinity;
    private const float sqrCamMoveDistThreshold = 1f;
    bool CheckCameraMoved(Vector3 camPos)
    {
        bool cameraMoved = Vector3.SqrMagnitude(camPos - lastCamPosition) >= sqrCamMoveDistThreshold;
        if (cameraMoved)
        {
            lastCamPosition = camPos;
        }

        return cameraMoved;
    }

    private int nextMeshInfoIndex = -1;
    public Dictionary<int, MeshInfo> dictMeshInfo = new Dictionary<int, MeshInfo>();

    /// 按 Tile 存储的包边石 MeshInfo，用于把高度绘制进 VT（WorldY）。
    /// key 为 ConvertTileIndex 后的 tileIndex。由 WorldTileStreaming 在 smData 加载/回收时增删。
    public Dictionary<int, VTMeshInfoList> dictMeshInfoOneTile = new Dictionary<int, VTMeshInfoList>();

    /// 大面积地面 MeshInfo 字典，不参与 quadNode.hashMeshInfoIndex，仅在渲染时按 bounds 检测绘制
    /// key 为 instanceID
    public Dictionary<int, MeshInfo> dictBigAreaGround = new Dictionary<int, MeshInfo>();

    public enum MeshInfoOp
    {
        Add,
        Del,
        Show,
        Hide,
    }

    private struct PendingMeshInfoOp
    {
        public int meshInfoIndex;
        public MeshInfo meshInfo;
        public MeshInfoOp op;

        public PendingMeshInfoOp(int meshInfoIndex, MeshInfo meshInfo, MeshInfoOp op)
        {
            this.meshInfoIndex = meshInfoIndex;
            this.meshInfo = meshInfo;
            this.op = op;
        }
    }

    private readonly Queue<PendingMeshInfoOp> pendingMeshInfoOps = new Queue<PendingMeshInfoOp>(256);
    private readonly HashSet<int> pendingAddMeshInfoIndices = new HashSet<int>();

    public int RegisterMeshInfo(MeshInfo meshInfo)
    {
        if (!HardwareSupportsDecal || meshInfo == null) return -1;

        int meshInfoIndex = ++nextMeshInfoIndex;
        dictMeshInfo[meshInfoIndex] = meshInfo;
        pendingAddMeshInfoIndices.Add(meshInfoIndex);
        pendingMeshInfoOps.Enqueue(new PendingMeshInfoOp(meshInfoIndex, meshInfo, MeshInfoOp.Add));
        return meshInfoIndex;
    }

    public void DeregisterMeshInfo(int meshInfoIndex)
    {
        if (dictMeshInfo == null) return;

        if (!dictMeshInfo.TryGetValue(meshInfoIndex, out var meshInfo))
        {
            return;
        }

        dictMeshInfo.Remove(meshInfoIndex);

        // Add 还在队列里：直接取消，避免先插入再删除
        if (pendingAddMeshInfoIndices.Remove(meshInfoIndex))
        {
            return;
        }

        if (listQuadTree == null) return;
        pendingMeshInfoOps.Enqueue(new PendingMeshInfoOp(meshInfoIndex, meshInfo, MeshInfoOp.Del));
    }

    /// 只冲刷队列里的 Del：Add 仍留给 LateUpdate 按 MaxMeshInfoOpsPerFrame 分帧。
    /// 供资源田集体销毁 / HideTerrainDetail 在 Update 或更早的 LateUpdate 里调用。
    public void FlushPendingMeshInfoDelOps()
    {
        ProcessPendingMeshInfoOps(flushDelOnly: true);
    }

    private void ProcessPendingMeshInfoOps(bool flushDelOnly = false, bool flushAllAdds = false)
    {
        int count = pendingMeshInfoOps.Count;
        if (count == 0) return;

        int addBudget = flushDelOnly ? 0 : (flushAllAdds ? count : MaxMeshInfoOpsPerFrame);
        if (!flushDelOnly && addBudget <= 0)
            addBudget = count;

        Profiler.BeginSample("[VT] PendingMeshInfo");
        int processedAdd = 0;
        int toProcess = pendingMeshInfoOps.Count;
        for (int i = 0; i < toProcess; ++i)
        {
            var op = pendingMeshInfoOps.Dequeue();
            if (op.op == MeshInfoOp.Add)
            {
                if (!pendingAddMeshInfoIndices.Contains(op.meshInfoIndex))
                    continue;

                if (processedAdd >= addBudget)
                {
                    pendingMeshInfoOps.Enqueue(op);
                    continue;
                }

                pendingAddMeshInfoIndices.Remove(op.meshInfoIndex);
                ApplyMeshInfoOp(op.meshInfoIndex, op.meshInfo, op.op);
                ++processedAdd;
            }
            else
            {
                ApplyMeshInfoOp(op.meshInfoIndex, op.meshInfo, op.op);
            }
        }
        Profiler.EndSample();
    }

    private void ApplyMeshInfoOp(int meshInfoIndex, MeshInfo meshInfo, MeshInfoOp meshInfoOp)
    {
        if (meshInfo == null || listQuadTree == null) return;

        var meshArea = WorldBoundsToTerrainArea(meshInfo.boundsInfo);
        foreach (var quadTree in listQuadTree)
        {
            quadTree.AddOrDelMeshInfo(meshInfoIndex, meshInfo, meshArea, meshInfoOp);
        }
    }

    /// 注册大面积地面 MeshInfo 到 dictBigAreaGround，仅触发 RedrawCurrentMip，不添加到 hashMeshInfoIndex
    public void RegisterBigAreaGround(int instanceID, MeshInfo meshInfo)
    {
        if (meshInfo == null) return;

        dictBigAreaGround[instanceID] = meshInfo;
        var meshArea = WorldBoundsToTerrainArea(meshInfo.boundsInfo);
        foreach (var quadTree in listQuadTree)
        {
            quadTree.RedrawByMeshInfo(meshInfo, meshArea, MeshInfoOp.Add);
        }
    }

    /// 从 dictBigAreaGround 中注销指定 instanceID 的 MeshInfo，仅触发 RedrawCurrentMip，不操作 hashMeshInfoIndex
    public void DeregisterBigAreaGround(int instanceID)
    {
        if (dictBigAreaGround.TryGetValue(instanceID, out var meshInfo))
        {
            var meshArea = WorldBoundsToTerrainArea(meshInfo.boundsInfo);
            foreach (var quadTree in listQuadTree)
            {
                quadTree.RedrawByMeshInfo(meshInfo, meshArea, MeshInfoOp.Del);
            }
            dictBigAreaGround.Remove(instanceID);
        }
    }

    public void ToggleMeshInfoDisplay(int meshInfoIndex, bool visible)
    {
        if (dictMeshInfo.TryGetValue(meshInfoIndex, out var meshInfo))
        {
            if (meshInfo.isVisible == visible) return;

            // 尚未写入四叉树时只改可见标记，Add 冲刷时会带上最新 isVisible
            if (pendingAddMeshInfoIndices.Contains(meshInfoIndex))
            {
                meshInfo.isVisible = visible;
                return;
            }

            MeshInfoOp meshInfoOp = visible ? MeshInfoOp.Show : MeshInfoOp.Hide;
            ApplyMeshInfoOp(meshInfoIndex, meshInfo, meshInfoOp);
            meshInfo.isVisible = visible;
        }
    }

    public void DeregisterMeshInfoList(List<int> listMeshInfoIndex)
    {
        if (listMeshInfoIndex == null) return;

        foreach (var meshInfoIndex in listMeshInfoIndex)
        {
            DeregisterMeshInfo(meshInfoIndex);
        }
    }

    public void ConvertTileIndex(int tileIndex, out int tileX, out int tileY)
    {
        tileX = tileIndex % TileCount;
        tileY = tileIndex / TileCount;
    }

    public int ConvertTileIndex(int tileX, int tileY)
    {
        int tileIndex = tileY * TileCount + tileX;
        return tileIndex;
    }

    public int ConvertTileIndex(Vector2Int TileIndex2D)
    {
        int tileIndex = TileIndex2D.y * TileCount + TileIndex2D.x;
        return tileIndex;
    }

    public void AddVTMeshInfoByTile(Vector2Int TileIndex2D, VTMeshInfoList meshInfoList)
    {
        int tileY = ConvertTileY(TileIndex2D.y);
        int TileIndex = ConvertTileIndex(TileIndex2D.x, tileY);

        if (dictMeshInfoOneTile.TryGetValue(TileIndex, out var oldList))
        {
            RedrawVTMeshInfoList(oldList);
        }

        meshInfoList?.RefreshUnionBounds();
        dictMeshInfoOneTile[TileIndex] = meshInfoList;
        RedrawVTMeshInfoList(meshInfoList);
    }

    public void DelVTMeshInfoByTile(Vector2Int TileIndex2D)
    {
        int tileY = ConvertTileY(TileIndex2D.y);
        int TileIndex = ConvertTileIndex(TileIndex2D.x, tileY);

        if (dictMeshInfoOneTile.TryGetValue(TileIndex, out var meshInfoList))
        {
            RedrawVTMeshInfoList(meshInfoList);
            dictMeshInfoOneTile.Remove(TileIndex);
        }
    }

    /// 按包边石列表的 XZ 包围盒并集，只重绘覆盖到的 VT page。
    /// 用注册时缓存的 unionBounds，不要逐项重算：list 里的 mesh 可能已被 MeshLODInfo.Clear() 置空，
    /// 重算会因为 isValid 全 false 而退化成空操作，恰好漏掉最需要失效的那批 page。
    /// 这里的失效范围也因此与 DrawCliffWorldY 的粗筛范围严格一致（两者读同一份 unionBounds）。
    private void RedrawVTMeshInfoList(VTMeshInfoList meshInfoList)
    {
        if (meshInfoList?.listMeshInfo == null || !meshInfoList.hasUnionBounds || listQuadTree == null) return;

        // RedrawByMeshInfo 只用 meshInfo 判空和读 isVisible，取任意一项即可
        MeshInfo dummy = null;
        var list = meshInfoList.listMeshInfo;
        for (int i = 0; i < list.Count; ++i)
        {
            if (list[i] != null)
            {
                dummy = list[i];
                break;
            }
        }

        if (dummy == null) return;

        var meshArea = WorldBoundsToTerrainArea(meshInfoList.unionBounds);
        foreach (var quadTree in listQuadTree)
        {
            quadTree.RedrawByMeshInfo(dummy, meshArea, MeshInfoOp.Add);
        }
    }
}
