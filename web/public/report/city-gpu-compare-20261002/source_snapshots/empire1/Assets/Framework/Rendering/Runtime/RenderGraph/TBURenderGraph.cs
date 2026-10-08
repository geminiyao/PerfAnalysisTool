using System;
using System.Collections.Generic;
using UnityEngine.Rendering;
using UnityEngine.Profiling;
using UnityEngine.Rendering.Universal;
using UnityEngine;
using TBU.Rendering;

[Flags]
public enum DepthAccess
{
    ///<summary>Read Access.</summary>
    Read = 1 << 0,
    ///<summary>Write Access.</summary>
    Write = 1 << 1,
    ///<summary>Read and Write Access.</summary>
    ReadWrite = Read | Write,
}
public enum TBURenderGraphResourceType
{
    Texture = 0,
    ComputeBuffer,
    Count
}

public class TBURenderGraphDebugData
{
    public struct PassDebugData
    {
        public string name;
        public List<int> resourceReadLists;
        public List<int> resourceWriteLists;
        public RenderBufferLoadAction[] colorLoad;
        public RenderBufferStoreAction[] colorStore;
        public RenderBufferLoadAction depthLoad;
        public RenderBufferStoreAction depthStore;
        public bool doSetRenderTargetColor;
        public bool doSetRenderTargetDepth;
        public bool culled;
        // We have this member instead of removing the pass altogether because we need the full list of passes in order to be able to remap them correctly when we remove them from display in the viewer.
        public bool generateDebugData;
    }

    public struct ResourceDebugData
    {
        public string name;
        public bool imported;
        public int creationPassIndex;
        public int releasePassIndex;

        public List<int> consumerList;
        public List<int> producerList;
    }

    public List<PassDebugData> passList = new List<PassDebugData>();
    public List<ResourceDebugData> resourceLists = new List<ResourceDebugData>();

    public void Clear()
    {
        passList.Clear();

        // Create if needed
        resourceLists = new List<ResourceDebugData>();

        resourceLists.Clear();
    }
}

public struct RenderGraphParameters
{
    ///<summary>Identifier for this render graph execution.</summary>
    public string executionName;
    ///<summary>Index of the current frame being rendered.</summary>
    public int currentFrameIndex;
    ///<summary> Controls whether to enable Renderer List culling or not.</summary>
    public bool rendererListCulling;
    ///<summary>Scriptable Render Context used by the render pipeline.</summary>
    public ScriptableRenderContext scriptableRenderContext;
    ///<summary>Command Buffer used to execute graphic commands.</summary>
    public CommandBuffer commandBuffer;
}

public class TBURenderGraph
{
    public static TBURenderGraph current = null;
    public static readonly int kMaxMRTCount = 8;
    ScriptableRenderer m_Renderer;

    internal struct TBUCompiledResourceInfo
    {
        public List<int> producers;
        public List<int> consumers;
        public int refCount;
        public bool imported;

        public void Reset()
        {
            if (producers == null)
                producers = new List<int>();
            if (consumers == null)
                consumers = new List<int>();

            producers.Clear();
            consumers.Clear();
            refCount = 0;
            imported = false;
        }
    }

    internal struct TBUCompiledPassInfo
    {
        public static TBUCompiledPassInfo NULL = new TBUCompiledPassInfo();
        public TBURenderGraphPass pass;
        public List<int> resourceCreateList;
        public List<int> resourceReleaseList;
        public int refCount;
        public bool culled;
        public bool hasSideEffect;
        public int syncToPassIndex; // Index of the pass that needs to be waited for.
        public int syncFromPassIndex; // Smaller pass index that waits for this pass.
        public bool needGraphicsFence;
        public GraphicsFence fence;

        public bool enableAsyncCompute;
        public bool allowPassCulling { get { return pass.allowPassCulling; } }

        public void Reset(TBURenderGraphPass pass)
        {
            this.pass = pass;
            enableAsyncCompute = pass.enableAsyncCompute;

            if (resourceCreateList == null)
            {
                resourceCreateList = new List<int>();
                resourceReleaseList = new List<int>();
            }

            resourceCreateList.Clear();
            resourceReleaseList.Clear();

            refCount = 0;
            culled = false;
            hasSideEffect = false;
            syncToPassIndex = -1;
            syncFromPassIndex = -1;
            needGraphicsFence = false;
        }
    }

    public string name;
    public static bool requireDebugData { get; set; } = false;
    private bool lastFrameDebugDataOn = false; 

    TBURenderGraphResourceRegistry m_Resources;
    TBUTextureHandle m_BackBufferHandle;
    TBURenderGraphPass m_CurrentPass;
    TBURenderGraphPass m_LastPass;
    List<TBURenderGraphPass> m_RenderPasses = new List<TBURenderGraphPass>(64);
    Dictionary<ScriptableRenderPass, int> m_RenderPassesMap = new Dictionary<ScriptableRenderPass, int>(64);
    DynamicArray<TBUCompiledResourceInfo> m_CompiledResourcesInfos = new DynamicArray<TBUCompiledResourceInfo>();
    DynamicArray<TBUCompiledPassInfo> m_CompiledPassInfos = new DynamicArray<TBUCompiledPassInfo>();
    TBURenderGraphPassPool m_TBURenderGraphPassPool = new TBURenderGraphPassPool(null,null);

    public TBURenderGraph(ScriptableRenderer renderer)
    {
        this.m_Renderer = renderer;
        MobileBaseRenderer mbr = renderer as MobileBaseRenderer;
        this.name = mbr == null ? $"ScriptableRender_{s_RegisteredGraphs.Count}" : $"{s_RegisteredGraphs.Count} : {mbr.Name}";
        m_Resources = new TBURenderGraphResourceRegistry();

        m_CompiledResourcesInfos = new DynamicArray<TBUCompiledResourceInfo>();

        s_RegisteredGraphs.Add(renderer,this);
        onGraphRegistered?.Invoke(this); 
    }

    bool m_HasRenderGraphBegun;
    bool m_IsInExecute = false;
    bool m_UseDepthDrawAfterBloom = false;
    public bool IsUseDepthDrawAfterBloom
    {
        get {  return m_UseDepthDrawAfterBloom; }
        set { m_UseDepthDrawAfterBloom = value; }
    }

    TBUTextureHandle m_CameraTargetColor;
    TBUTextureHandle m_CameraTargetDepth;


    TBURenderGraphDebugData m_DebugData = new TBURenderGraphDebugData();

    public TBURenderGraphDebugData GetDebugData()
    {
        return m_DebugData;
    }

    public delegate void OnGraphRegisteredDelegate(TBURenderGraph graph);
    public static event OnGraphRegisteredDelegate onGraphRegistered;
    public static event OnGraphRegisteredDelegate onGraphUnregistered;
    public delegate void OnExecutionRegisteredDelegate(TBURenderGraph graph);

    static Dictionary<ScriptableRenderer, TBURenderGraph> s_RegisteredGraphs = new Dictionary<ScriptableRenderer, TBURenderGraph>();
    public static Dictionary<ScriptableRenderer, TBURenderGraph> GetRegisteredRenderGraphs()
    {
        return s_RegisteredGraphs;
    }

    public static TBURenderGraph GetInstance(ScriptableRenderer renderer)
    {
        TBURenderGraph result = null;
        if(s_RegisteredGraphs.TryGetValue(renderer ,out result))
        {
            return result;
        }
        else
        {
            var renderGraph = new TBURenderGraph(renderer);
            return renderGraph;
        }
    }

    public ScriptableRenderer Renderer{
        get{ return m_Renderer; }
    }

    public TBURenderGraphPass AddRenderPass(ScriptableRenderPass pass, string passName)
    {
        var renderPass = m_TBURenderGraphPassPool.Get();
        renderPass.Initialize(m_RenderPasses.Count, passName);
        m_RenderPassesMap.Add(pass, m_RenderPasses.Count);
        m_RenderPasses.Add(renderPass);
        return renderPass;
    }

    public TBURenderGraphPass GetRenderPass(ScriptableRenderPass pass)
    {
        int index = -1;
        if(m_RenderPassesMap.TryGetValue(pass, out index))
        {
            return m_RenderPasses[index];
        }
        return null;
    }

    public void ConfigureCameraTarget(ref TBUTextureHandle color, ref TBUTextureHandle depth)
    {   
        m_CameraTargetColor = color;
        m_CameraTargetDepth = depth;
    }

    internal void CreateCameraTarget()
    {
        m_IsInExecute = true;
        RenderTargetIdentifier color = BuiltinRenderTextureType.CameraTarget;
        RenderTargetIdentifier depth = BuiltinRenderTextureType.CameraTarget;
        if(m_CameraTargetColor.IsValid())
        {
            m_Resources.CreateAndClearTexture(m_CameraTargetColor.handle);
            color = m_CameraTargetColor.renderTargetIdentifier;
        }

        if(m_CameraTargetDepth.IsValid())
        {
            var memoryless = RenderTextureMemoryless.None;
            //如果不需要读Depth，并且支持DepthFetch的话，可以设置成memoryless
            var desc = m_Resources.GetTextureResourceDesc(m_CameraTargetDepth.handle);
            if(!m_CameraTargetDepth.HasRead() && RenderingUtils.IsSupportDepthFetch())
            {
                if(desc.desc.msaaSamples > 1)
                    memoryless = RenderTextureMemoryless.MSAA;
                else
                    memoryless = RenderTextureMemoryless.Depth;
            }
            else
            {
                if(desc.desc.msaaSamples > 1 && RenderingUtils.IsSupportDepthAutoResolve())
                    memoryless = RenderTextureMemoryless.MSAA;
                else
                    memoryless = RenderTextureMemoryless.None;
            }
            m_Resources.CreateAndClearTexture(m_CameraTargetDepth.handle,true, memoryless);
            depth = m_CameraTargetDepth.renderTargetIdentifier;
        }

        m_Renderer.ConfigureCameraTarget(color,depth);
        m_IsInExecute = false;
    }

    internal bool GetCompiledPassInfo(ScriptableRenderPass pass, out TBUCompiledPassInfo info)
    {
        int index = -1;
        if(m_RenderPassesMap.TryGetValue(pass, out index))
        {
            info = m_CompiledPassInfos[index];
            return true;
        }
        info = TBUCompiledPassInfo.NULL;
        return false;
    }

    internal void CheckCreateOrGetTexture()
    {
        #if UNITY_EDITOR
        if(m_IsInExecute)
            Debug.LogError("[RenderGraph] 禁止在Execute中执行Get/CreateTexture操作，请移至Setup中");
        #endif
    }

    internal void CheckGetRenderTexture()
    {
        #if UNITY_EDITOR
        if(!m_IsInExecute)
            Debug.LogError("[RenderGraph] 禁止在Execute以外的地方获取RenderTexture");
        #endif
    }

    internal void CheckTextureUsedStatus(TBURenderGraphPass pass , int resIndex)
    {
        #if UNITY_EDITOR
        if (!m_Resources.IsHandleRead(resIndex) && !m_Resources.IsHandleWrite(resIndex))
        {
            var resDecs = m_Resources.GetTextureResourceDesc(resIndex);
            Debug.LogError($"[RenderGraph] {pass.name}中的{resDecs.name}不含有任何Read/Write引用，请调用ReadTexture/WriteTexture标记");
        }
        #endif
    }

    /// <summary>
    /// 创建贴图Handle
    /// </summary>
    /// <param name="type"></param>
    /// <param name="usage"></param>
    /// <param name="desc"></param>
    /// <returns></returns>
    public TBUTextureHandle CreateTexture(CameraType type, RenderTextureUsage usage, RenderTextureDescriptor desc)
    {
        CheckCreateOrGetTexture();
        return m_Resources.CreateTexture(new TBUTextureDecs(type,usage,desc));
    }   

    /// <summary>
    /// 创建贴图Handle
    /// </summary>
    /// <param name="type"></param>
    /// <param name="usage"></param>
    /// <param name="desc"></param>
    /// <param name="result"></param>
    public void CreateTexture(CameraType type, RenderTextureUsage usage, RenderTextureDescriptor desc, out TBUTextureHandle result)
    {
        CheckCreateOrGetTexture();
        result = m_Resources.CreateTexture(new TBUTextureDecs(type,usage,desc));
    }   

    /// <summary>
    /// 存在一些贴图，初始化一次后可能创建他的Pass不再执行，但是需要一直存在这张图，则调用这个接口来获取
    /// </summary>
    /// <param name="type"></param>
    /// <param name="usage"></param>
    /// <param name="desc"></param>
    /// <returns></returns>
    public TBUTextureHandle CreateOrGetTexture(CameraType type, RenderTextureUsage usage, RenderTextureDescriptor desc)
    {
        CheckCreateOrGetTexture();
        return m_Resources.CreateOrGetTexture(new TBUTextureDecs(type,usage,desc));
    }   

    /// <summary>
    /// 存在一些贴图，初始化一次后可能创建他的Pass不再执行，但是需要一直存在这张图，则调用这个接口来获取
    /// </summary>
    /// <param name="type"></param>
    /// <param name="usage"></param>
    /// <param name="desc"></param>
    /// <param name="result"></param>
    public void CreateOrGetTexture(CameraType type, RenderTextureUsage usage, RenderTextureDescriptor desc, out TBUTextureHandle result)
    {
        CheckCreateOrGetTexture();
        result = m_Resources.CreateOrGetTexture(new TBUTextureDecs(type,usage,desc));
    }   

    public TBUTextureHandle ImportBackbuffer(RenderTargetIdentifier rt)
    {
        m_BackBufferHandle = m_Resources.ImportBackbuffer(rt);
        return m_BackBufferHandle;
    }

    /// <summary>
    /// 获取贴图Handle，若没创建过会报错
    /// </summary>
    /// <param name="type"></param>
    /// <param name="usage"></param>
    /// <returns></returns>
    public TBUTextureHandle GetTexture(CameraType type, RenderTextureUsage usage)
    {
        CheckCreateOrGetTexture();
        return m_Resources.GetTexture(type,usage);
    }

    /// <summary>
    /// 获取贴图Handle，若没创建过会报错
    /// </summary>
    /// <param name="type"></param>
    /// <param name="usage"></param>
    /// <param name="result"></param>
    public void GetTexture(CameraType type, RenderTextureUsage usage, out TBUTextureHandle result)
    {
        CheckCreateOrGetTexture();
        result = m_Resources.GetTexture(type,usage);
    }

    /// <summary>
    /// 获取贴图Handle，当不确定前面是否创建过时使用，若没创建不会报错，在Configure或Execute中调用IsValid确认是否已创建
    /// </summary>
    /// <param name="type"></param>
    /// <param name="usage"></param>
    /// <param name="result"></param>
    public void GetTextureNoCheck(CameraType type, RenderTextureUsage usage, out TBUTextureHandle result)
    {
        CheckCreateOrGetTexture();
        result = m_Resources.GetTexture(type,usage,false);
    }

    /// <summary>
    /// 获取贴图Handle，当不确定前面是否创建过时使用，若没创建不会报错，在Configure或Execute中调用IsValid确认是否已创建
    /// </summary>
    /// <param name="type"></param>
    /// <param name="usage"></param>
    /// <param name="result"></param>
    public TBUTextureHandle GetTextureNoCheck(CameraType type, RenderTextureUsage usage)
    {
        CheckCreateOrGetTexture();
        return m_Resources.GetTexture(type,usage,false);
    }

    public TBUTextureHandle GetBackBuffer()
    {
        return m_BackBufferHandle;
    }

    /// <summary>
    /// 创建本Pass使用的中间贴图，原则上其他pass不使用，但也有例外情况，比如Bloom的RT4
    /// </summary>
    /// <param name="pass"></param>
    /// <param name="type"></param>
    /// <param name="usage"></param>
    /// <param name="desc"></param>
    /// <returns></returns>
    public TBUTextureHandle CreateTransientTexture(TBURenderGraphPass pass, CameraType type, RenderTextureUsage usage, RenderTextureDescriptor desc)
    {
        var result = m_Resources.CreateTexture(new TBUTextureDecs(type,usage,desc), pass.index);
        pass.AddTransientResource(result);
        return result;
    }

    /// <summary>
    /// 创建本Pass使用的中间贴图，原则上其他pass不使用，但也有例外情况，比如Bloom的RT4
    /// </summary>
    /// <param name="pass"></param>
    /// <param name="type"></param>
    /// <param name="usage"></param>
    /// <param name="desc"></param>
    /// <param name="result"></param>
    public void CreateTransientTexture(TBURenderGraphPass pass, CameraType type, RenderTextureUsage usage, RenderTextureDescriptor desc, out TBUTextureHandle result)
    {
        result = m_Resources.CreateTexture(new TBUTextureDecs(type,usage,desc), pass.index);
        pass.AddTransientResource(result);
    }

    public void Setup()
    {
        m_HasRenderGraphBegun = true;
        current = this;
        TBURenderGraphResourceRegistry.current = m_Resources;
    }

    public void Execute()
    {
        if (requireDebugData)
        {
            GenerateDebugData();
        }

        ClearCompiledGraph();
        m_IsInExecute = false;
    }

    public void CompileRenderGraph()
    {
        InitializeCompilationData();
        CountReferences();

        UpdateResourceAllocationAndSynchronization();
    }

    void InitResourceInfosData(DynamicArray<TBUCompiledResourceInfo> resourceInfos, int count)
    {
        resourceInfos.Resize(count);
        for (int i = 0; i < resourceInfos.size; ++i)
            resourceInfos[i].Reset();
    }

    void InitializeCompilationData()
    {
        InitResourceInfosData(m_CompiledResourcesInfos, m_Resources.GetTextureResourceCount());

        m_CompiledPassInfos.Resize(m_RenderPasses.Count);
        for (int i = 0; i < m_CompiledPassInfos.size; ++i)
            m_CompiledPassInfos[i].Reset(m_RenderPasses[i]);
    }

    void CountReferences()
    {
        for (int passIndex = 0; passIndex < m_CompiledPassInfos.size; ++passIndex)
        {
            ref TBUCompiledPassInfo passInfo = ref m_CompiledPassInfos[passIndex];

            var resourceRead = passInfo.pass.resourceReadLists;
            foreach (var resource in resourceRead)
            {
                ref TBUCompiledResourceInfo info = ref m_CompiledResourcesInfos[resource.handle];
                info.consumers.Add(passIndex);
                info.refCount++;
            }

            var resourceWrite = passInfo.pass.resourceWriteLists;
            foreach (var resource in resourceWrite)
            {
                ref TBUCompiledResourceInfo info = ref m_CompiledResourcesInfos[resource.handle];
                info.producers.Add(passIndex);

                // Writing to an imported texture is considered as a side effect because we don't know what users will do with it outside of render graph.
                passInfo.hasSideEffect = info.imported;
                passInfo.refCount++;
            }

            foreach (var resourceIndex in passInfo.pass.transientResourceList)
            {
                ref TBUCompiledResourceInfo info = ref m_CompiledResourcesInfos[resourceIndex.handle];
                info.refCount++;
                info.consumers.Add(passIndex);
                info.producers.Add(passIndex);
            }
        }
    }

    int GetFirstValidWriteIndex(in TBUCompiledResourceInfo info)
    {
        if (info.producers.Count == 0)
            return -1;

        var producers = info.producers;
        for (int i = 0; i < producers.Count; i++)
        {
            if (!m_CompiledPassInfos[producers[i]].culled)
                return producers[i];
        }

        return -1;
    }

    int GetLatestValidReadIndex(in TBUCompiledResourceInfo info)
    {
        if (info.consumers.Count == 0)
            return -1;

        var consumers = info.consumers;
        for (int i = consumers.Count - 1; i >= 0; --i)
        {
            if (!m_CompiledPassInfos[consumers[i]].culled)
                return consumers[i];
        }

        return -1;
    }

    int GetLatestValidWriteIndex(in TBUCompiledResourceInfo info)
    {
        if (info.producers.Count == 0)
            return -1;

        var producers = info.producers;
        for (int i = producers.Count - 1; i >= 0; --i)
        {
            if (!m_CompiledPassInfos[producers[i]].culled)
                return producers[i];
        }

        return -1;
    }

    void UpdateResourceAllocationAndSynchronization()
    {
        var resourceInfos = m_CompiledResourcesInfos;
        // Now push resources to the release list of the pass that reads it last.
        for (int i = 0; i < resourceInfos.size; ++i)
        {
            TBUCompiledResourceInfo resourceInfo = resourceInfos[i];

            // Resource creation
            int firstWriteIndex = GetFirstValidWriteIndex(resourceInfo);
            // Index -1 can happen for imported resources (for example an imported dummy black texture will never be written to but does not need creation anyway)
            // Or when the only pass that was writting to this resource was culled dynamically by renderer lists
            if (firstWriteIndex != -1)
                m_CompiledPassInfos[firstWriteIndex].resourceCreateList.Add(i);

            var latestValidReadIndex = GetLatestValidReadIndex(resourceInfo);
            var latestValidWriteIndex = GetLatestValidWriteIndex(resourceInfo);

            // Sometimes, a texture can be written by a pass after the last pass that reads it.
            // In this case, we need to extend its lifetime to this pass otherwise the pass would get an invalid texture.
            // This is exhibited in cases where a pass might produce more than one output and one of them isn't used.
            // Ex: Transparent pass in HDRP that writes to the color buffer and motion vectors.
            // If TAA/MotionBlur aren't used, the movecs are never read after the transparent pass and it would raise this error.
            // Because of that, it's hard to make this an actual error.
            // Commented out code to check such cases if needed.
            //if (latestValidReadIndex != -1 && (latestValidWriteIndex > latestValidReadIndex))
            //{
            //    var name = m_Resources.GetRenderGraphResourceName((RenderGraphResourceType)type, i);
            //    var lastPassReadName = m_CompiledPassInfos[latestValidReadIndex].pass.name;
            //    var lastPassWriteName = m_CompiledPassInfos[latestValidWriteIndex].pass.name;
            //    Debug.LogError($"Resource {name} is written again after the last pass that reads it.\nLast pass read: {lastPassReadName}\nLast pass write: {lastPassWriteName}");
            //}

            // For not imported resources, make sure we don't try to release them if they were never created (due to culling).
            bool shouldRelease = !(firstWriteIndex == -1 && !resourceInfo.imported);
            int lastReadPassIndex = shouldRelease ? Math.Max(latestValidWriteIndex, latestValidReadIndex) : -1;

            // Texture release
            if (lastReadPassIndex != -1)
            {
                // In case of async passes, we need to extend lifetime of resource to the first pass on the graphics pipeline that wait for async passes to be over.
                // Otherwise, if we freed the resource right away during an async pass, another non async pass could reuse the resource even though the async pipe is not done.
                if (m_CompiledPassInfos[lastReadPassIndex].enableAsyncCompute)
                {
                    int currentPassIndex = lastReadPassIndex;
                    int firstWaitingPassIndex = m_CompiledPassInfos[currentPassIndex].syncFromPassIndex;
                    // Find the first async pass that is synchronized by the graphics pipeline (ie: passInfo.syncFromPassIndex != -1)
                    while (firstWaitingPassIndex == -1 && currentPassIndex < m_CompiledPassInfos.size)
                    {
                        currentPassIndex++;
                        if (m_CompiledPassInfos[currentPassIndex].enableAsyncCompute)
                            firstWaitingPassIndex = m_CompiledPassInfos[currentPassIndex].syncFromPassIndex;
                    }

                    // Finally add the release command to the pass before the first pass that waits for the compute pipe.
                    ref TBUCompiledPassInfo passInfo = ref m_CompiledPassInfos[Math.Max(0, firstWaitingPassIndex - 1)];
                    passInfo.resourceReleaseList.Add(i);

                    // Fail safe in case render graph is badly formed.
                    if (currentPassIndex == m_CompiledPassInfos.size)
                    {
                        TBURenderGraphPass invalidPass = m_RenderPasses[lastReadPassIndex];
                        throw new InvalidOperationException($"Asynchronous pass {invalidPass.name} was never synchronized on the graphics pipeline.");
                    }
                }
                else
                {
                    ref TBUCompiledPassInfo passInfo = ref m_CompiledPassInfos[lastReadPassIndex];
                    passInfo.resourceReleaseList.Add(i);
                }
            }
        }
    }

    void GenerateDebugData()
    {
        if (!requireDebugData) 
        {
            lastFrameDebugDataOn = false;
            CleanupDebugData(); 
            return;
        }

        if(!lastFrameDebugDataOn)
        {
            lastFrameDebugDataOn = true;
            CleanupDebugData(); 
            return;
        }

        var debugData = m_DebugData;
         
        debugData.Clear();

        for (int i = 0; i < m_CompiledResourcesInfos.size; ++i)
        {
            ref var resourceInfo = ref m_CompiledResourcesInfos[i];
            TBURenderGraphDebugData.ResourceDebugData newResource = new TBURenderGraphDebugData.ResourceDebugData();
            newResource.name = m_Resources.GetRenderGraphResourceName(i);
            newResource.creationPassIndex = -1;
            newResource.releasePassIndex = -1;

            newResource.consumerList = new List<int>(resourceInfo.consumers);
            newResource.producerList = new List<int>(resourceInfo.producers);

            UpdateImportedResourceLifeTime(ref newResource, newResource.consumerList);
            UpdateImportedResourceLifeTime(ref newResource, newResource.producerList);

            debugData.resourceLists.Add(newResource);
        }

        for (int i = 0; i < m_CompiledPassInfos.size; ++i)
        {
            ref TBUCompiledPassInfo passInfo = ref m_CompiledPassInfos[i];

            TBURenderGraphDebugData.PassDebugData newPass = new TBURenderGraphDebugData.PassDebugData();
            newPass.name = passInfo.pass.name;
            newPass.culled = passInfo.culled;
            newPass.generateDebugData = passInfo.pass.generateDebugData;
            newPass.resourceReadLists = new List<int>();
            newPass.resourceWriteLists = new List<int>();
            newPass.colorLoad = passInfo.pass.colorLoadActions;
            newPass.depthLoad = passInfo.pass.depthLoadAction;
            newPass.colorStore = passInfo.pass.colorStoreActions;
            newPass.depthStore = passInfo.pass.depthStoreAction;
            newPass.doSetRenderTargetColor = passInfo.pass.doSetRenderTargetColor;
            newPass.doSetRenderTargetDepth = passInfo.pass.doSetRenderTargetDepth;

            newPass.resourceReadLists = new List<int>();
            newPass.resourceWriteLists = new List<int>();

            foreach (var resourceRead in passInfo.pass.resourceReadLists)
                newPass.resourceReadLists.Add(resourceRead.handle);
            foreach (var resourceWrite in passInfo.pass.resourceWriteLists)
                newPass.resourceWriteLists.Add(resourceWrite.handle);

            foreach(var resourceTransient in passInfo.pass.transientResourceList)
            {
                newPass.resourceReadLists.Add(resourceTransient.handle);
                newPass.resourceWriteLists.Add(resourceTransient.handle);
            }

            foreach (var resourceCreate in passInfo.resourceCreateList)
            {
                var res = debugData.resourceLists[resourceCreate];
                if (res.imported)
                    continue;
                res.creationPassIndex = i;
                debugData.resourceLists[resourceCreate] = res;
            }

            foreach (var resourceRelease in passInfo.resourceReleaseList)
            {
                var res = debugData.resourceLists[resourceRelease];
                if (res.imported)
                    continue;
                res.releasePassIndex = i;
                debugData.resourceLists[resourceRelease] = res;
            }

            debugData.passList.Add(newPass);
        }
    }

    void ClearRenderPasses()
    {
        foreach (var pass in m_RenderPasses)
        {
            pass.Clear();
            m_TBURenderGraphPassPool.Release(pass);
        }
        m_RenderPasses.Clear();
        m_RenderPassesMap.Clear();
    }

    void ClearCompiledGraph()
    {
        ClearRenderPasses();
        m_Resources.Clear();
        m_CompiledResourcesInfos.Clear();
        m_CompiledPassInfos.Clear();

        m_CameraTargetColor = TBUTextureHandle.nullHandle;
        m_CameraTargetDepth = TBUTextureHandle.nullHandle;
    }

    void UpdateImportedResourceLifeTime(ref TBURenderGraphDebugData.ResourceDebugData data, List<int> passList)
    {
        foreach (var pass in passList)
        {
            if (data.creationPassIndex == -1)
                data.creationPassIndex = pass;
            else
                data.creationPassIndex = Math.Min(data.creationPassIndex, pass);

            if (data.releasePassIndex == -1)
                data.releasePassIndex = pass;
            else
                data.releasePassIndex = Math.Max(data.releasePassIndex, pass);
        }
    }

    public TBUTextureDecs GetRenderGraphTextureResourceDesc(int handle)
    {
        TBUTextureDecs desc = m_Resources.GetTextureResourceDesc(handle);
        return desc;
    }

    void CleanupDebugData()
    {
        m_DebugData.Clear();
    }

    public void Cleanup()
    {
        s_RegisteredGraphs.Remove(this.m_Renderer);
        onGraphUnregistered?.Invoke(this);
    }

    public static void ClearRegisteredGraphs()
    {
        s_RegisteredGraphs.Clear();
    }

    public static void OnBeginExecutePass(ScriptableRenderContext context, ScriptableRenderer renderer, ScriptableRenderPass renderPass)
    {
        var renderGraph = TBURenderGraph.GetInstance(renderer);
        renderGraph.m_IsInExecute = true;
        renderGraph.m_LastPass = renderGraph.m_CurrentPass;
        renderGraph.m_CurrentPass = renderGraph.GetRenderPass(renderPass);

        TBUCompiledPassInfo info;
        if(renderGraph.GetCompiledPassInfo(renderPass,out info))
        {
            foreach(var index in info.resourceCreateList)
            {
                renderGraph.CheckTextureUsedStatus(renderGraph.m_CurrentPass, index);
                renderGraph.m_Resources.CreateAndClearTexture(index);
            }
        }
        else
        {
            Debug.LogError($"{renderPass} 未初始化RenderGraphPass");
        }
    }

    public static void OnEndExecutePass(ScriptableRenderContext context, ScriptableRenderer renderer, ScriptableRenderPass renderPass)
    {
        var renderGraph = TBURenderGraph.GetInstance(renderer);
        TBUCompiledPassInfo info;
        if(renderGraph.GetCompiledPassInfo(renderPass,out info))
        {
            foreach(var index in info.resourceReleaseList)
            {
                renderGraph.m_Resources.ReleaseTexture(index);
            }
        }
        else
        {
            Debug.LogError($"{renderPass} 未初始化RenderGraphPass");
        }

        renderGraph.m_IsInExecute = false;
    }

    public static void OnBeginExecuteRenderer(ScriptableRenderContext context, ScriptableRenderer renderer)
    {
        // Create CameraTarget
        var renderGraph = TBURenderGraph.GetInstance(renderer);
        renderGraph.CreateCameraTarget();
        renderGraph.IsUseDepthDrawAfterBloom = false;
    }

    public static void SetupCommonCameraTarget(in CameraData cameraData, TBUBasePass pass, RenderBufferLoadAction colorLoadAction, RenderBufferLoadAction depthLoadActin, out TBUTextureHandle sceneColorHnd, out TBUTextureHandle sceneDepthStencilHnd, out TBUTextureHandle motionVectorHnd)
    {
        motionVectorHnd = TBUTextureHandle.nullHandle;

        var cameraType = cameraData.camera.cameraType;
        var renderGraph = pass.RenderGraph;
        var renderGraphPass = pass.RenderGraphPass;
        sceneColorHnd = renderGraph.GetTexture(cameraType, RenderTextureUsage.SCENE_COLOR_MAP_NAME);
        sceneDepthStencilHnd = renderGraph.GetTexture(cameraType, RenderTextureUsage.SCENE_DEPTH_STENCIL_NAME);
        var desc = renderGraph.m_Resources.GetTextureResourceDesc(sceneColorHnd.handle);
        bool isMsaa = desc.desc.msaaSamples > 1;

        renderGraphPass.SetColorBuffer(sceneColorHnd,0,colorLoadAction, RenderBufferStoreAction.Store);
        // depth的StoreAction依赖于贴图是否为memoryless，这里不再判断DontCare
        renderGraphPass.SetDepthBuffer(sceneDepthStencilHnd,DepthAccess.Write,depthLoadActin,RenderBufferStoreAction.Store); 
        
        if (RenderingUtils.IsSupportImageblock())
        {
            // 申请一张memoryless的depth attachment定义implicit imageblock
            var m_sceneImageblockDepthHnd = renderGraph.GetTexture(cameraType, RenderTextureUsage.SCENE_IMAGEBLOCK_DEPTH_NAME);
            renderGraphPass.SetColorBuffer(m_sceneImageblockDepthHnd,1,RenderBufferLoadAction.DontCare,RenderBufferStoreAction.DontCare);
            if(RenderPipelineConfig.IsMotionVectorEnable() && colorLoadAction == RenderBufferLoadAction.DontCare)
            {
                motionVectorHnd = renderGraph.GetTexture(cameraType, RenderTextureUsage.MOTION_VECTOR_MASK_MAP);
                renderGraphPass.SetColorBuffer(motionVectorHnd,2,RenderBufferLoadAction.DontCare,RenderBufferStoreAction.Store);
            }
        }
        else
        {   
            if(RenderPipelineConfig.IsMotionVectorEnable() && colorLoadAction == RenderBufferLoadAction.DontCare)
            {
                motionVectorHnd = renderGraph.GetTexture(cameraType, RenderTextureUsage.MOTION_VECTOR_MASK_MAP);
                renderGraphPass.SetColorBuffer(motionVectorHnd,1,RenderBufferLoadAction.DontCare,RenderBufferStoreAction.Store);
            }
        }
    }

    public static void SetupAfterBloomAndBeforeDOFCameraTarget(bool useDepth, in CameraData cameraData, TBUBasePass pass, out TBUTextureHandle sceneColorHnd, out TBUTextureHandle sceneDepthStencilHnd)
    {
        var cameraType = cameraData.camera.cameraType;
        var renderGraph = pass.RenderGraph;
        var renderGraphPass = pass.RenderGraphPass;
        sceneColorHnd = renderGraph.GetTexture(cameraType, RenderTextureUsage.SCENE_COLOR_MAP_NAME);
        renderGraphPass.SetColorBuffer(sceneColorHnd,0,RenderBufferLoadAction.Load, RenderBufferStoreAction.Store);

        if(useDepth || renderGraph.IsUseDepthDrawAfterBloom)
        {
            renderGraph.IsUseDepthDrawAfterBloom = true;
            sceneDepthStencilHnd = renderGraph.GetTexture(cameraType, RenderTextureUsage.SCENE_DEPTH_STENCIL_NAME);
            renderGraphPass.SetDepthBuffer(sceneDepthStencilHnd,DepthAccess.ReadWrite,RenderBufferLoadAction.Load, RenderBufferStoreAction.DontCare); 
        }
        else
        {
            sceneDepthStencilHnd = TBUTextureHandle.nullHandle;
        }
    }
}
