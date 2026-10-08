using UnityEngine;
using UnityEngine.Profiling;
using UnityEngine.Rendering;
using System.Collections.Generic;
using UnityEngine.Experimental.Rendering;
using com.tencent.nk.xlsRes;
using TBU.Rendering;
using ASTC_BLOCKSIZE = TextureCompressor.ASTC_BLOCKSIZE;

public partial class TerrainVT
{
    public const string PassName_RenderToVT = "RENDERTOVT";
    public const string PassName_RenderToVT_WorldY = "RENDERTOVT_WORLDY";
    public const string PassName_RenderToVT_Metallic = "RENDERTOVT_METALLIC";

    public static bool IsMaterialCompatible(Material material) =>
        material != null && material.FindPass(PassName_RenderToVT) >= 0;

    public static bool VTArrayCreatedReadable = false;
    
    public class VTRenderer
    {
        public Mesh FullScreenMesh;

        public const int DefaultVTMipCount = 2;
        // MipShift 关闭：page 重绘走 QuadNode.RedrawCurrentMip，只重画当前被采样的那一级 mip，
        // 粗 mip 允许留旧内容。MipShift 会把粗 mip 拷成另一个结点的 mip0，与此前提冲突。
        public const bool DefaultUseMipShift = false;
        public const bool DefaultUseASTCCompress = true;
#if ENABLE_PROFILER
        public const string ProfilerSampleAstc = "[VT] ASTC";
        public const string ProfilerSampleAstcCopyToArray = "[VT] ASTC.CopyToArray";
#endif

        public static int VTMipCount = DefaultVTMipCount; // Mip为1时，VT系统不处理MipShift、Mip0限帧等操作
        public static int MaxVTMip = VTMipCount - 1; // [0, MaxVTMip]
        public static float fVTMipCountRcp = 1.0f / VTMipCount;
        public static bool UseMipShift = DefaultUseMipShift;

        public static bool UseASTCCompress = DefaultUseASTCCompress;
        public static bool RenderToClipFirst = false; // 非ASTC的情况下：是否直接绘制到RT上（而不是先到中间商 clipRTAlbedo 上）
        public static bool ForceLimitedMemoryMode = false; // 内存受限
        public static bool IsEmulatorDevice => TssHelper.IsEmulatorDevice();

        public static ASTC_BLOCKSIZE DefaultAstcBlockSize = ASTC_BLOCKSIZE.ASTC_4x4;
        public static ASTC_BLOCKSIZE AstcBlockSize = (ASTC_BLOCKSIZE)(-1);

        public static Dictionary<ASTC_BLOCKSIZE, TextureFormat> AstcFormatMapping =
            new Dictionary<ASTC_BLOCKSIZE, TextureFormat>
        {
            { ASTC_BLOCKSIZE.ASTC_4x4, TextureFormat.ASTC_4x4},
            { ASTC_BLOCKSIZE.ASTC_5x5, TextureFormat.ASTC_5x5},
            { ASTC_BLOCKSIZE.ASTC_6x6, TextureFormat.ASTC_6x6},
        };

        public static int GetAstcBlockSize(ASTC_BLOCKSIZE blockSize)
        {
            switch (blockSize)
            {
                case ASTC_BLOCKSIZE.ASTC_5x5: return 5;
                case ASTC_BLOCKSIZE.ASTC_6x6: return 6;
                default: return 4;
            }
        }

        public const int DefaultPageSize = 512;
        public static int PageSize = DefaultPageSize;
        public static int AstcPageSizePercent = 100;

        public RenderTexture clipRTAlbedo; // [ASTC] 与 [非ASTC]
        public RenderTexture clipRTNormal; // [ASTC] 与 [非ASTC]
        public RenderTexture clipRTWorldY; // [ASTC] 与 [非ASTC] R16或R8，R通道单独存 WorldY

        // public RenderTexture clipRTAlbedoForBlend; // [ToDo:link] Cliff_RenderToVT
        // public RenderTexture clipRTNormalForBlend; // [ToDo:link] Cliff_RenderToVT

        public RenderTexture clipAlbedoTexArrayRT; // [非ASTC]
        public RenderTexture clipNormalTexArrayRT; // [非ASTC]
        public RenderTexture clipWorldYTexArrayRT; // [非ASTC]
        // public RenderTexture clipRTWorldNormalArray; // [VT:WorldNormal]

        public TextureCompressor Compressor; // [ASTC]
        public Texture2DArray clipAlbedoTexArray2D; // [ASTC]
        public Texture2DArray clipNormalTexArray2D; // [ASTC]
        public Texture2DArray clipWorldYTexArray2D; // [ASTC] 但 WorldY 不压缩，R16或R8
        public RenderTexture clipRTCompressedAlbedo; // [ASTC] 压缩器的块图，Albedo 与 Normal 各一张
        public RenderTexture clipRTCompressedNormal; // [ASTC]

        public static readonly int ID_VT_AlbedoTex = Shader.PropertyToID("_VT_AlbedoTex");
        public static readonly int ID_VT_NormalTex = Shader.PropertyToID("_VT_NormalTex");
        public static readonly int ID_VT_WorldYTex = Shader.PropertyToID("_VT_WorldYTex");
        // public static readonly int ID_VT_WorldNormalTex = Shader.PropertyToID("_VT_WorldNormalTex"); // [VT:WorldNormal]
        public static readonly int ID_VT_PageSize = Shader.PropertyToID("_VT_PageSize");
        public static readonly int ID_VT_MaxVTMip = Shader.PropertyToID("_VT_MaxVTMip");
        public static readonly int ID_VT_PageUVScale = Shader.PropertyToID("_VT_PageUVScale");

        private bool UseR16ForWorldY = false;
        private TextureFormat WorldYTexFormat => UseR16ForWorldY ? TextureFormat.R16 : TextureFormat.R8;
        private RenderTextureFormat WorldYRTFormat => UseR16ForWorldY ? RenderTextureFormat.R16 : RenderTextureFormat.R8;

        private bool CheckWorldYTextureFormat()
        {
            if (!SystemInfo.SupportsTextureFormat(TextureFormat.R16))
            {
                Debug.LogWarning("CheckWorldYTextureFormat: TextureFormat.R16 Failed");
                return false;
            }

            if (!SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.R16))
            {
                Debug.LogWarning("CheckWorldYTextureFormat: RenderTextureFormat.R16 Failed");
                return false;
            }

            return true;
        }
        
        public VTRenderer()
        {
            if (UseASTCCompress && !CheckASTCCompressSupport())
            {
                UseASTCCompress = false;
            }

            if (UseASTCCompress || IsEmulatorDevice)
            {
                RenderToClipFirst = true;
            }

            Debug.LogWarning($"TerrainVT.UseASTCCompress: {UseASTCCompress}  {RenderToClipFirst}");

            UseR16ForWorldY = CheckWorldYTextureFormat();
            if (IsEmulatorDevice)
            {
                UseR16ForWorldY = false; // 模拟器不开 R16
            }
            Debug.LogWarning($"TerrainVT.UseR16ForWorldY: {UseR16ForWorldY}");

            FullScreenMesh = ConstructFullscreenMesh();
            InitPageCapacity();
            // 必须在创建源 RT 前恢复 Mip 配置；上一个池可能以 ASTC 5x5/6x6 的单 Mip 退出。
            if (UseASTCCompress)
            {
                AstcBlockSize = DefaultAstcBlockSize;
            }
            SetMipCount(DefaultVTMipCount);
            InitRTs();
        }

        /// 设置 VT Mip 层级数量，并同步更新 MaxVTMip、fVTMipCountRcp、UseMipShift
        public static void SetMipCount(int mipCount)
        {
            if (UseASTCCompress && AstcBlockSize != ASTC_BLOCKSIZE.ASTC_4x4)
            {
                // 只在ASTC_4x4的情况下支持Mip
                mipCount = 1;
                Debug.LogWarning($"VT.MipShift disabled: ASTC {AstcBlockSize} ");
            }
            
            VTMipCount = mipCount;
            MaxVTMip = VTMipCount - 1;
            fVTMipCountRcp = 1.0f / VTMipCount;

            // UseMipShift 初始化
            UseMipShift = DefaultUseMipShift;
            if (VTMipCount <= 1)
            {
                UseMipShift = false;
            }
            if (UseMipShift)
            {
                // 只在支持GraphicsCopy的情况下开启MipShift
                UseMipShift = WorldTexArrayCtrl.DoesSystemSupportGraphicsCopy();
                Debug.LogWarning($"VT.MipShift disabled: 不支持WorldTexArrayCtrl.DoesSystemSupportGraphicsCopy()");
            }
        }

        public static int TreeDepthBias = 0;
        public static bool ForceNoDecal = false;

        // 极简模式（压测用）
        public static void SetSimplestMode(bool isSimplestMode)
        {
            if (isSimplestMode)
            {
                TreeDepthBias = -1;
                ForceNoDecal = true;
            }
            else
            {
                TreeDepthBias = 0;
                ForceNoDecal = false;
            }

            if (TerrainVT_Manager.ActiveTerrainVT != null)
            {
                TerrainVT_Manager.ActiveTerrainVT.NeedToForceRedraw = true;
            }
        }

        public static void SetTreeDepthBias(int _treeDepthBias)
        {
            TreeDepthBias = _treeDepthBias;
        }

        public static void SetForceNoDecal(bool _forceNoDecal)
        {
            if (ForceNoDecal == _forceNoDecal) return;

            ForceNoDecal = _forceNoDecal;
            if (TerrainVT_Manager.ActiveTerrainVT != null)
            {
                TerrainVT_Manager.ActiveTerrainVT.NeedToForceRedraw = true;
            }
        }
        
        public static bool ForceNoCliffWorldY = false;
        // 包边石是否写入VT高度
        public static void EnableCliffWorldY(bool _enableCliffWorldY)
        {
            ForceNoCliffWorldY = !_enableCliffWorldY;
        }

        public int MinTreeDepth = 0;
        public int MaxTreeDepth = 0;
        public static int MaxTreeDepth_High = 5;
        public static int MaxTreeDepth_Low = 4;

        // indexRT的R通道中，分配了7位给到PhysicIndex，这个限定了Page数量最多128个
        public static int PageCapacity_UpperBound = 128;
        public static int PageCapacity_High = 64;
        public static int PageCapacity_Low = 48;
        public int PageCapacity = PageCapacity_High;

        private void InitPageCapacity()
        {
            // var recommendLevel = DeviceLevel.DeviceLevelSuperHigh;
            // if (AOE.GameCore.Performance != null)
            // {
            //     recommendLevel = AOE.GameCore.Performance.RecommendLevel;
            // }

            var memorySize = SystemInfo.systemMemorySize;
            bool isLowMemoryHardware = memorySize > 0 && memorySize < 4000; //RAM小于4G时
            bool LowMemoryMode = ForceLimitedMemoryMode || isLowMemoryHardware;
            if (LowMemoryMode)
            {
                MaxTreeDepth = MaxTreeDepth_Low;
                PageCapacity = PageCapacity_Low;
            }
            else
            {
                MaxTreeDepth = MaxTreeDepth_High;
                PageCapacity = PageCapacity_High;
            }

#if UNITY_EDITOR && AOE_ART
            PageCapacity = PageCapacity_UpperBound; // Art工程提升预览品质
#endif

            if (PageCapacity > PageCapacity_UpperBound)
            {
                PageCapacity = PageCapacity_UpperBound;
                Debug.LogError($"VT.InitPageCapacity: {PageCapacity} 超出最大上限({PageCapacity_UpperBound}");
            }

            Debug.Log($"VT.InitPageCapacity: {ForceLimitedMemoryMode} {SystemInfo.systemMemorySize}MB #{PageCapacity} #{MaxTreeDepth}");
        }

        public void SetShaderParam()
        {
            Shader.SetGlobalTexture(ID_VT_AlbedoTex, UseASTCCompress ? (Texture)clipAlbedoTexArray2D : clipAlbedoTexArrayRT);
            Shader.SetGlobalTexture(ID_VT_NormalTex, UseASTCCompress ? (Texture)clipNormalTexArray2D : clipNormalTexArrayRT);
            Shader.SetGlobalTexture(ID_VT_WorldYTex, UseASTCCompress ? (Texture)clipWorldYTexArray2D : clipWorldYTexArrayRT);

            // cbForRenderSlice.SetGlobalTexture("_VTAlbedoForBlend", clipRTAlbedoForBlend); // [ToDo:link] Cliff_RenderToVT
            // cbForRenderSlice.SetGlobalTexture("_VTNormalForBlend", clipRTNormalForBlend); // [ToDo:link] Cliff_RenderToVT

            // 以下几个参数需要为 Global，因为采样VT的材质（山、石头等）也需要访问这几个Uniform
            // Shader.SetGlobalTexture(ID_VT_WorldNormalTex, clipRTWorldNormalArray); // [VT:WorldNormal]
            Shader.SetGlobalInt(ID_VT_PageSize, PageSize);
            Shader.SetGlobalInt(ID_VT_MaxVTMip, MaxVTMip);

            // ASTC按块对齐后数组实际尺寸可能 > PageSize（如5x5→515），归一化采样UV需按此缩放校正
            float pageUVScale = 1.0f;
            if (UseASTCCompress && clipAlbedoTexArray2D != null && clipAlbedoTexArray2D.width > 0)
            {
                pageUVScale = (float)PageSize / clipAlbedoTexArray2D.width;
            }
            Shader.SetGlobalFloat(ID_VT_PageUVScale, pageUVScale);
        }

        /// 运行时动态切换 ASTC 压缩块大小（4x4 / 5x5 / 6x6 循环切换）。
        /// 切换后会重建 Texture2DArray、刷新 Shader 参数，并让当前共享池重新预热。
        /// 仅在 UseASTCCompress == true 时有效。
        public void SwitchAstcBlockSize()
        {
            if (!UseASTCCompress) return;

            // 循环切换：4x4 -> 5x5 -> 6x6 -> 4x4
            ASTC_BLOCKSIZE newAstcBlockSize = ASTC_BLOCKSIZE.ASTC_4x4;
            if (AstcBlockSize == ASTC_BLOCKSIZE.ASTC_4x4)
                newAstcBlockSize = ASTC_BLOCKSIZE.ASTC_5x5;
            else if (AstcBlockSize == ASTC_BLOCKSIZE.ASTC_5x5)
                newAstcBlockSize = ASTC_BLOCKSIZE.ASTC_6x6;

            SetAstcBlockSize(newAstcBlockSize);

            Debug.LogWarning($"VT.SwitchAstcBlockSize -> {AstcBlockSize} (block={GetAstcBlockSize(AstcBlockSize)})");
        }

        public void SetAstcBlockSize(ASTC_BLOCKSIZE astcBlockSize)
        {
            // AstcBlockSize 是静态的：切场景 Dispose 后值仍保留，但 Texture2DArray 已释放。
            // 仅比较块大小会跳过第二次 InitRTs 的建图，CopyTexture 目标为 null。
            bool arraysReady = clipAlbedoTexArray2D != null
                && clipNormalTexArray2D != null
                && clipWorldYTexArray2D != null;
            if (AstcBlockSize == astcBlockSize && arraysReady)
            {
                return;
            }

            AstcBlockSize = astcBlockSize;
            Debug.LogWarning($"TerrainVT.UseASTCCompress: {AstcBlockSize} {AstcFormatMapping[AstcBlockSize]}");
            if (!UseASTCCompress) return;

            SetMipCount(DefaultVTMipCount);
            // 旧索引不能采新建空池；先关采样并使已有页状态失效，再释放纹理。
            TerrainVT_Manager.InvalidatePhysicalPool(this);
            hasPendingRenderCommands = false;
            cbForRenderSlice.Clear();
            RebuildAstcTexArrays();
            SetShaderParam();
        }

        /// 获取当前 ASTC 块大小的显示文本（如 "4x4"、"5x5"、"6x6"）
        public static string GetAstcBlockSizeLabel()
        {
            int block = GetAstcBlockSize(AstcBlockSize);
            return $"{block}x{block}";
        }

        /// 重建 VT 的 Texture2DArray（释放旧的并按新块大小重新创建）
        /// Albedo/Normal 按 ASTC 块大小对齐，WorldY 不压缩（R16或R8）
        private void RebuildAstcTexArrays()
        {
            // 释放旧的 Texture2DArray
            RenderPipelineUtil.DestroyTexture(ref clipAlbedoTexArray2D);
            RenderPipelineUtil.DestroyTexture(ref clipNormalTexArray2D);
            RenderPipelineUtil.DestroyTexture(ref clipWorldYTexArray2D);

            // 按新块大小计算对齐后的尺寸
            if (!AstcFormatMapping.TryGetValue(AstcBlockSize, out var textureFormat))
            {
                textureFormat = TextureFormat.ASTC_4x4;
            }

            bool isLinear = true;
            bool vtUseMipMap = VTMipCount > 1;
            int astcBlock = GetAstcBlockSize(AstcBlockSize);
            int alignedPageSize = (PageSize + astcBlock - 1) / astcBlock * astcBlock;

            if (VTArrayCreatedReadable)
                clipAlbedoTexArray2D = new Texture2DArray(alignedPageSize, alignedPageSize, PageCapacity, textureFormat, vtUseMipMap, isLinear);
            else
                clipAlbedoTexArray2D = new Texture2DArray(alignedPageSize, alignedPageSize, PageCapacity, textureFormat, vtUseMipMap, isLinear, false);
            clipAlbedoTexArray2D.wrapMode = TextureWrapMode.Clamp;
            clipAlbedoTexArray2D.name = "clipAlbedoTexArray";
            if (VTArrayCreatedReadable)
                clipAlbedoTexArray2D.Apply(false, true);

            if (VTArrayCreatedReadable)
                clipNormalTexArray2D = new Texture2DArray(alignedPageSize, alignedPageSize, PageCapacity, textureFormat, vtUseMipMap, isLinear);
            else
                clipNormalTexArray2D = new Texture2DArray(alignedPageSize, alignedPageSize, PageCapacity, textureFormat, vtUseMipMap, isLinear, false);
            clipNormalTexArray2D.wrapMode = TextureWrapMode.Clamp;
            clipNormalTexArray2D.name = "clipNormalTexArray";
            if (VTArrayCreatedReadable)
                clipNormalTexArray2D.Apply(false, true);

            // WorldY 不做ASTC压缩，格式为 R16（不支持时回退 R8），尺寸不按块对齐，
            // 采样时也不需要 _VT_PageUVScale 校正
            if (VTArrayCreatedReadable)
                clipWorldYTexArray2D = new Texture2DArray(PageSize, PageSize, PageCapacity, WorldYTexFormat, vtUseMipMap, isLinear);
            else
                clipWorldYTexArray2D = new Texture2DArray(PageSize, PageSize, PageCapacity, WorldYTexFormat, vtUseMipMap, isLinear, false);
            clipWorldYTexArray2D.wrapMode = TextureWrapMode.Clamp;
            clipWorldYTexArray2D.name = "clipWorldYTexArray";
            if (VTArrayCreatedReadable)
                clipWorldYTexArray2D.Apply(false, true);
        }

        public void Dispose()
        {
            hasPendingRenderCommands = false;
            cbForRenderSlice?.Clear();
            cbForRenderSlice?.Dispose();
            cbForRenderSlice = null;

            Compressor?.Dispose();
            Compressor = null;

            ReleaseRTs();
        }

        private bool CheckASTCCompressSupport()
        {
            if (Application.isEditor) return false;
            if (IsEmulatorDevice) return false;
            if (Application.platform != RuntimePlatform.Android &&
                Application.platform != RuntimePlatform.IPhonePlayer)
            {
                return false;
            }

            if (!SystemInfo.IsFormatSupported(GraphicsFormat.R32G32B32A32_UInt, FormatUsage.Render))
            {
                Debug.LogWarning("CheckASTCCompressSupport: GraphicsFormat.R32G32B32A32_UInt Failed");
                return false;
            }

            if (!SystemInfo.SupportsRenderTextureFormat(RenderTextureFormat.ARGBInt))
            {
                Debug.LogWarning("CheckASTCCompressSupport: RenderTextureFormat.ARGBInt Failed");
                return false;
            }

            if (!SystemInfo.SupportsTextureFormat(TextureFormat.ASTC_4x4) ||
                !SystemInfo.SupportsTextureFormat(TextureFormat.ASTC_5x5) ||
                !SystemInfo.SupportsTextureFormat(TextureFormat.ASTC_6x6))
            {
                Debug.LogWarning("CheckASTCCompressSupport: SupportsTextureFormat ASTC Failed");
                return false;
            }

            return true;
        }

        private RenderTargetIdentifier[] renderColorRT; 
        private RenderTargetIdentifier renderDepthRT; 
        private void InitRTs()
        {
            bool vtUseMipMap = VTMipCount > 1;

            if (RenderToClipFirst)
            {
                clipRTAlbedo = new RenderTexture(PageSize, PageSize, 0,
                    RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB)
                {
                    name = "clipRTAlbedo",
                    hideFlags = HideFlags.DontSave,
                    useMipMap = vtUseMipMap,
                    autoGenerateMips = false,
                };
                clipRTAlbedo.Create();

                clipRTNormal = new RenderTexture(PageSize, PageSize, 0,
                    RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear)
                {
                    name = "clipRTNormal",
                    hideFlags = HideFlags.DontSave,
                    useMipMap = vtUseMipMap,
                    autoGenerateMips = false,
                };
                clipRTNormal.Create();

                clipRTWorldY = new RenderTexture(PageSize, PageSize, 0,
                    WorldYRTFormat, RenderTextureReadWrite.Linear)
                {
                    name = "clipRTWorldY",
                    hideFlags = HideFlags.DontSave,
                    useMipMap = vtUseMipMap,
                    autoGenerateMips = false,
                };
                clipRTWorldY.Create();

                // clipRTAlbedoForBlend = new RenderTexture(clipRTAlbedo.descriptor); // [ToDo:link] Cliff_RenderToVT
                // clipRTAlbedoForBlend.Create(); // [ToDo:link] Cliff_RenderToVT
                // clipRTNormalForBlend = new RenderTexture(clipRTNormal.descriptor); // [ToDo:link] Cliff_RenderToVT
                // clipRTNormalForBlend.Create(); // [ToDo:link] Cliff_RenderToVT

                renderColorRT = new RenderTargetIdentifier[] {clipRTAlbedo, clipRTNormal, clipRTWorldY};
                renderDepthRT = clipRTAlbedo.depthBuffer;
            }

            if (UseASTCCompress)
            {
                Compressor = new TextureCompressor();
                SetAstcBlockSize(DefaultAstcBlockSize);
            }
            else
            {
                clipAlbedoTexArrayRT = new RenderTexture(PageSize, PageSize, 0, RenderTextureFormat.ARGB32)
                {
                    name = "clipRTAlbedoArray",
                    hideFlags = HideFlags.DontSave,
                    volumeDepth = PageCapacity,
                    wrapMode = TextureWrapMode.Clamp,
                    dimension = TextureDimension.Tex2DArray,
                    useMipMap = vtUseMipMap,
                    autoGenerateMips = false,
                };
                clipAlbedoTexArrayRT.Create();

                clipNormalTexArrayRT = new RenderTexture(PageSize, PageSize, 0, RenderTextureFormat.ARGB32,
                    RenderTextureReadWrite.Linear)
                {
                    name = "clipRTNormalArray",
                    hideFlags = HideFlags.DontSave,
                    volumeDepth = PageCapacity,
                    wrapMode = TextureWrapMode.Clamp,
                    dimension = TextureDimension.Tex2DArray,
                    useMipMap = vtUseMipMap,
                    autoGenerateMips = false
                };
                clipNormalTexArrayRT.Create();

                clipWorldYTexArrayRT = new RenderTexture(PageSize, PageSize, 0, WorldYRTFormat,
                    RenderTextureReadWrite.Linear)
                {
                    name = "clipRTWorldYArray",
                    hideFlags = HideFlags.DontSave,
                    volumeDepth = PageCapacity,
                    wrapMode = TextureWrapMode.Clamp,
                    dimension = TextureDimension.Tex2DArray,
                    useMipMap = vtUseMipMap,
                    autoGenerateMips = false
                };
                clipWorldYTexArrayRT.Create();

                if (!RenderToClipFirst)
                {
                    renderColorRT = new RenderTargetIdentifier[]
                    {
                        clipAlbedoTexArrayRT, clipNormalTexArrayRT, clipWorldYTexArrayRT
                    };
                    renderDepthRT = clipAlbedoTexArrayRT.depthBuffer;
                }

                SetMipCount(DefaultVTMipCount);
                SetShaderParam();
                
                // [VT:WorldNormal]
                // clipRTWorldNormalArray = new RenderTexture(PageSize, PageSize, 0, RenderTextureFormat.ARGB32,
                //     RenderTextureReadWrite.Linear)
                // {
                //     hideFlags = HideFlags.DontSave,
                //     volumeDepth = PageCapacity,
                //     wrapMode = TextureWrapMode.Clamp,
                //     dimension = TextureDimension.Tex2DArray,
                //     useMipMap = vtUseMipMap,
                //     autoGenerateMips = false
                // };
                // clipRTWorldNormalArray.name = "clipRTWorldNormalArray";
                // clipRTWorldNormalArray.hideFlags = HideFlags.DontSave;
                // clipRTWorldNormalArray.Create();
                // renderColorRT = new RenderTargetIdentifier[] { clipRTAlbedoArray, clipRTNormalArray, clipRTWorldNormalArray };
                // renderDepthRT = clipRTAlbedoArray.depthBuffer;
            }
        }

        private void ReleaseRTs()
        {
            RenderPipelineUtil.DestroyTexture(ref clipAlbedoTexArrayRT);
            RenderPipelineUtil.DestroyTexture(ref clipNormalTexArrayRT);
            RenderPipelineUtil.DestroyTexture(ref clipWorldYTexArrayRT);

            RenderPipelineUtil.DestroyTexture(ref clipRTAlbedo);
            RenderPipelineUtil.DestroyTexture(ref clipRTNormal);
            RenderPipelineUtil.DestroyTexture(ref clipRTWorldY);

            // RenderPipelineUtil.DestroyTexture(ref clipRTAlbedoForBlend); // [ToDo:link] Cliff_RenderToVT
            // RenderPipelineUtil.DestroyTexture(ref clipRTNormalForBlend); // [ToDo:link] Cliff_RenderToVT

            RenderPipelineUtil.DestroyTexture(ref clipAlbedoTexArray2D);
            RenderPipelineUtil.DestroyTexture(ref clipNormalTexArray2D);
            RenderPipelineUtil.DestroyTexture(ref clipWorldYTexArray2D);

            // 静态块大小不能跨 VTRenderer 生命周期残留，否则下次 SetAstcBlockSize 会误判已建图
            AstcBlockSize = (ASTC_BLOCKSIZE)(-1);
            
            // RenderPipelineUtil.DestroyTexture(ref clipRTWorldNormalArray); // [VT:WorldNormal]
        }

        public struct RenderTask
        {
            public int physicTexIndex;
            public int renderingMip;
            public TileInfo tileInfo;
            public Vector4 patchInfo;
            public Vector4 nodeArea;
            public List<MeshInfoRef> listMeshInfoIndex;

            public RenderTask(int _physicTexIndex, int _renderingMip, TileInfo _tileInfo, Vector4 _patchInfo, Vector4 _nodeArea, List<MeshInfoRef> _listMeshInfoIndex)
            {
                physicTexIndex = _physicTexIndex;
                renderingMip = _renderingMip;
                tileInfo = _tileInfo;
                patchInfo = _patchInfo;
                nodeArea = _nodeArea;
                listMeshInfoIndex = _listMeshInfoIndex;
            }
        }

        public static readonly int ID_VT_PatchST = Shader.PropertyToID("_VT_PatchST");
        private CommandBuffer cbForRenderSlice = new CommandBuffer() {name = "VT.RenderTask"};
        private bool hasPendingRenderCommands;
        private Matrix4x4 ViewMatrix_AxisY = Matrix4x4.Rotate(Quaternion.Euler(-90, 0, 0));

        private bool isRTForBlendReady_ForThisRender = false; // 每次绘制时单独重置
        // private void CheckRTForBlend(int iMipLv)
        // {
        //     if (isRTForBlendReady_ForThisRender) return;
        //
        //     isRTForBlendReady_ForThisRender = true;
        //
        //     // 拷贝一份，给名城地面和包边石RenderToVT做 Blend操作
        //     cbForRenderSlice.CopyTexture(clipRTAlbedo, 0, iMipLv, clipRTAlbedoForBlend, 0, iMipLv);
        //     cbForRenderSlice.CopyTexture(clipRTNormal, 0, iMipLv, clipRTNormalForBlend, 0, iMipLv);
        //     cbForRenderSlice.SetGlobalFloat("_MipForVTBlend", iMipLv);
        // }

        public bool Render(TerrainVT vtComp, RenderTask renderTask)
        {
            return TryRender(vtComp, renderTask, out bool textureMipsReady) && textureMipsReady;
        }

        // 返回值表示本页是否已录入绘制；源纹理清晰度单独返回，不能把“无绘制”当成预热完成。
        internal bool TryRender(TerrainVT vtComp, RenderTask renderTask, out bool textureMipsReady)
        {
            textureMipsReady = false;
            int iMipLv = renderTask.renderingMip;
            int physicTexIndex = renderTask.physicTexIndex;

            if (!vtComp.dictTerrainMeshMat.TryGetValue(renderTask.tileInfo.TileIndex, out var meshMat) ||
                meshMat == null || meshMat.terrainMesh == null || meshMat.terrainMaterial == null ||
                meshMat.terrainMesh.subMeshCount <= 0 || meshMat.renderToVTPassIndex < 0 ||
                meshMat.renderToVTPassIndex >= meshMat.terrainMaterial.passCount)
            {
                return false;
            }

            textureMipsReady = true;

            int targetSlice = RenderToClipFirst ? 0 : physicTexIndex;
            cbForRenderSlice.SetRenderTarget(renderColorRT, renderDepthRT, iMipLv, CubemapFace.Unknown, targetSlice);

            var TerrainMaterial = meshMat.terrainMaterial;
            var passIndexRenderToVT = meshMat.renderToVTPassIndex;

            bool UseTerrainMesh = true; // 使用 TerrainMesh（而非Quad）的原因：需要输出地形高度值到VT（以及有可能的地形法线）
            if (UseTerrainMesh) // 支持输出地形的【世界法线】与【世界坐标高度】 // [VT:WorldNormal]
            {
                cbForRenderSlice.SetViewMatrix(ViewMatrix_AxisY);

                var pathchInfo = renderTask.patchInfo;
                float fullTerrainSize = vtComp.TerrainSize;
                float singleTileTerrainSize = fullTerrainSize / vtComp.TileCount;

                float width = singleTileTerrainSize * pathchInfo.x;
                float height = singleTileTerrainSize * pathchInfo.y;
                float left = singleTileTerrainSize * renderTask.tileInfo.TileX + singleTileTerrainSize * pathchInfo.z;
                float up = singleTileTerrainSize * renderTask.tileInfo.TileY + singleTileTerrainSize *  pathchInfo.w;
                Vector4 worldOrthoSize = new Vector4(left, left + width, up, up + height);
                
                if (vtComp.Pivot == PivotType.Center)
                {
                    var halfTerrainSize = fullTerrainSize * 0.5f;
                    worldOrthoSize.x -= halfTerrainSize;
                    worldOrthoSize.y -= halfTerrainSize;
                    worldOrthoSize.z -= halfTerrainSize;
                    worldOrthoSize.w -= halfTerrainSize;
                }

                // 立即写材质属性、不录进 CommandBuffer，多个 page 合批后所有 draw 都会读到
                // 最后一次设的值。这里恒为 (1,1,0,0)，与 page 无关，所以合批是安全的。
                TerrainMaterial.SetVector(ID_VT_PatchST, new Vector4(1, 1, 0, 0));
                cbForRenderSlice.SetProjectionMatrix(Matrix4x4.Ortho(
                    worldOrthoSize.x, worldOrthoSize.y, worldOrthoSize.z, worldOrthoSize.w, -200, 200));
                
                var TerrainMesh = meshMat.terrainMesh;
                if (!cbForRenderSlice.DrawMesh(TerrainMesh, Matrix4x4.identity, TerrainMaterial, 0,
                                               passIndexRenderToVT, true, requestedMipmapLevel: 0))
                {
                    textureMipsReady = false;
                }
            }
            else
            {
                // UseTerrainMesh 恒为 true，此分支当前不可达。若要启用：patchInfo 是逐 page 变化的，
                // 而这里是立即写材质属性，必须先换成 MaterialPropertyBlock，否则与上面的合批冲突。
                TerrainMaterial.SetVector(ID_VT_PatchST, renderTask.patchInfo);
                cbForRenderSlice.SetViewMatrix(Matrix4x4.identity);
                cbForRenderSlice.SetProjectionMatrix(Matrix4x4.Ortho(-1, 1, -1, 1, -1, 1));
                if (!cbForRenderSlice.DrawMesh(FullScreenMesh, Matrix4x4.identity, TerrainMaterial, 0,
                                               passIndexRenderToVT, true, requestedMipmapLevel: 0))
                {
                    textureMipsReady = false;
                }
            }

            isRTForBlendReady_ForThisRender = false;

            // 【绘制】大面积地面 MeshInfo（不参与 hashMeshInfoIndex，仅按 bounds 检测绘制）
            foreach (var kvp in vtComp.dictBigAreaGround)
            {
                var meshInfo = kvp.Value;
                if (meshInfo == null || !meshInfo.isValid || !meshInfo.isVisible) continue;

                if (vtComp.CheckBoundsOverlapsArea(meshInfo.boundsInfo, renderTask.nodeArea))
                {
                    // CheckRTForBlend(iMipLv);
                    // 【Draw】 Blend到当前VT Page中，AmbientOcclusion因为是 a 通道，被顶点色顶替做了 alpha blend，同时自己的值被抛弃
                    //         WorldY 在独立的 R16 目标上，此 Pass 输出 alpha=0 以保留VT中已有的值
                    if (!cbForRenderSlice.DrawMesh(meshInfo.mesh, meshInfo.matrix, meshInfo.material, 0,
                                                   meshInfo.passIndexRenderToVT, true, requestedMipmapLevel: 0))
                    {
                        textureMipsReady = false;
                    }
                }
            }

            // 【绘制】包边石的高度信息（用于渲染时获取地面高度）
            // 接缝包边石最多跨进 8 邻接 Tile，按 3x3 查表，避免扫全图 dict。
            if (!ForceNoCliffWorldY)
            {
                DrawCliffWorldY(vtComp, renderTask);
            }

            // 【绘制】地形上撒的Decal、资源田的Decal（hashMeshInfoIndex 已按 drawOrder 插入排序，直接顺序遍历即可保证绘制顺序）
            if (vtComp.DrawDecal && TerrainVT.HardwareSupportsDecal && !ForceNoDecal)
            {
                // HideTerrainDetail(镜头拉高)时，仅 DecalType.Persist 的 Decal 保留绘制到 VT；
                // 其余 Decal(Normal / Resource 以及 Forest/SubEntity 等默认 None 的 Decal)维持原有隐藏行为。
                // KeepDetail 开启时档位被强制为 0，HideTerrainDetail 恒为 false，全部 Decal 照常绘制。
                bool hideTerrainDetail = RenderPipelineUtil.HideTerrainDetail;
                for (int i = 0; i < renderTask.listMeshInfoIndex.Count; ++i)
                {
                    int meshIndex = renderTask.listMeshInfoIndex[i].meshInfoIndex;
                    if (vtComp.dictMeshInfo.TryGetValue(meshIndex, out var meshInfo))
                    {
                        if (!meshInfo.isVisible || !meshInfo.isValid) continue;
                        if (hideTerrainDetail && meshInfo.decalType != DecalType.Persist) continue;
                        if (!cbForRenderSlice.DrawMesh(meshInfo.mesh, meshInfo.matrix, meshInfo.material, 0,
                                                       meshInfo.passIndexRenderToVT, true,
                                                       requestedMipmapLevel: 0))
                        {
                            textureMipsReady = false;
                        }
                        
                        // 【Draw】 再绘制一次，把Decal的Metallic 绘制到VT中
                        if (meshInfo.passIndexRenderToVT_Metallic >= 0)
                        {
                            if (!cbForRenderSlice.DrawMesh(meshInfo.mesh, meshInfo.matrix, meshInfo.material, 0,
                                    meshInfo.passIndexRenderToVT_Metallic, true,
                                    requestedMipmapLevel: 0))
                            {
                                textureMipsReady = false;
                            }
                        }
                    }
                }
            }

            if (UseASTCCompress)
            {
                // Albedo 与 Normal 尺寸、mip、块大小全都相同，压缩时块坐标与块内采样偏移也完全一致，
                // 所以合成一次 MRT 压缩 pass：每页少一次 SetRenderTarget 与一次全屏 draw。
                // 源(clipRTCompressed*)是未压缩的 R32G32B32A32_UInt“块图”(每个texel=一个ASTC块, 共 ceil(PageSize/block) 个)，
                // 目标(clipAlbedoTexArray2D)是 ASTC 压缩贴图、尺寸已按块大小向上对齐(见RebuildAstcTexArrays)，两者字节布局完全一致。
                // 必须用【整 Subresource】重载：带 region 的重载在 Unity 2021+ 会先把 srcWidth 乘以目标块大小换算成 texel，
                // 再拿这个值去校验源纹理(128块*4 => 512 > 源的128)，必然报 "region not fitting in source element"。
                // 整 Subresource 重载不做 region 校验，按块整体对拷，对 4x4/5x5/6x6 都成立。
#if ENABLE_PROFILER
                cbForRenderSlice.BeginSample(ProfilerSampleAstc);
#endif
                Compressor.CompressTexturePair(cbForRenderSlice, clipRTAlbedo, clipRTNormal,
                    out clipRTCompressedAlbedo, out clipRTCompressedNormal,
                    AstcBlockSize, iMipLv, clipRTAlbedo.width, clipRTAlbedo.height, VTMipCount);
#if ENABLE_PROFILER
                cbForRenderSlice.BeginSample(ProfilerSampleAstcCopyToArray);
#endif
                cbForRenderSlice.CopyTexture(clipRTCompressedAlbedo, 0, iMipLv,
                    clipAlbedoTexArray2D, physicTexIndex, iMipLv);
                cbForRenderSlice.CopyTexture(clipRTCompressedNormal, 0, iMipLv,
                    clipNormalTexArray2D, physicTexIndex, iMipLv);
#if ENABLE_PROFILER
                cbForRenderSlice.EndSample(ProfilerSampleAstcCopyToArray);
#endif

                // WorldY 跳过压缩直接整块拷贝（源与目标同格式且尺寸相同）
                cbForRenderSlice.CopyTexture(clipRTWorldY, 0, iMipLv,
                    clipWorldYTexArray2D, physicTexIndex, iMipLv);
#if ENABLE_PROFILER
                cbForRenderSlice.EndSample(ProfilerSampleAstc);
#endif
            }
            else if (RenderToClipFirst)
            {
                // 虽然<不压缩>的时候，可以直接绘制到 clipAlbedoTexArrayRT 和 clipNormalTexArrayRT 的指定 Slice
                // 但是我们在绘制 Decal、名城地面 到 VT的过程中，有可能有访问 VT内容的需求（做Blend操作）
                // 为了避免对同一张RT又读又写，所以需要 clipRTAlbedo 与 clipRTNormal 做中间Buffer
                cbForRenderSlice.CopyTexture(clipRTAlbedo, 0, iMipLv,
                    0, 0, clipRTAlbedo.width >> iMipLv, clipRTAlbedo.height >> iMipLv,
                    clipAlbedoTexArrayRT, physicTexIndex, iMipLv, 0, 0);
                cbForRenderSlice.CopyTexture(clipRTNormal, 0, iMipLv,
                    0, 0, clipRTNormal.width >> iMipLv, clipRTNormal.height >> iMipLv,
                    clipNormalTexArrayRT, physicTexIndex, iMipLv, 0, 0);
                cbForRenderSlice.CopyTexture(clipRTWorldY, 0, iMipLv,
                    0, 0, clipRTWorldY.width >> iMipLv, clipRTWorldY.height >> iMipLv,
                    clipWorldYTexArrayRT, physicTexIndex, iMipLv, 0, 0);
            }

            hasPendingRenderCommands = true;
            return true;
        }

        /// 一帧内所有 page 的绘制录进同一个 CommandBuffer，帧末统一提交。
        /// 每次 ExecuteCommandBuffer 都要重新切 RenderTarget，在 tile-based GPU 上等于一整轮
        /// 3 张 PageSize MRT 的 load/store，逐 page 提交会把这部分开销放大到 page 数量倍。
        /// 注意：MipShift 用的是立即执行的 Graphics.CopyTexture，读 page 前必须先调用本方法。
        public void FlushRenderCommands()
        {
            if (!hasPendingRenderCommands) return;
#if ENABLE_PROFILER
            if (!GMRenderPassToggle.IsVTSubmitEnabled())
            {
                hasPendingRenderCommands = false;
                cbForRenderSlice.Clear();
                return;
            }
#endif
            Profiler.BeginSample("[VT] Flush");
            hasPendingRenderCommands = false;

            // 压缩器不再逐页复位 RenderTarget（那会给每页多两个 pass 断点），
            // 改成整批录完后在这里解绑一次，避免把中间块图留在 RenderTarget 上带出本 CommandBuffer。
            cbForRenderSlice.SetRenderTarget(BuiltinRenderTextureType.None);

            Graphics.ExecuteCommandBuffer(cbForRenderSlice);
            cbForRenderSlice.Clear();
            Profiler.EndSample();
        }

        // 本 Page 所属 Tile + 8 邻接。包边石只跨接缝，不会落到更远的 Tile。
        private void DrawCliffWorldY(TerrainVT vtComp, RenderTask renderTask)
        {
            int tileX = renderTask.tileInfo.TileX;
            int tileY = renderTask.tileInfo.TileY;
            int tileCount = renderTask.tileInfo.TileCount;
            // 换算到世界 XZ 一次，之后所有包围盒比较都在世界空间做，省掉逐 MeshInfo 的 WorldBoundsToTerrainArea
            var nodeWorldBounds = vtComp.TerrainAreaToWorldBounds(renderTask.nodeArea);

            int displayLod = 0;
            var worldTileStreaming = WorldTileStreaming.instance;
            if (worldTileStreaming != null)
                displayLod = worldTileStreaming.DisplayLod;

            for (int dy = -1; dy <= 1; ++dy)
            {
                int ny = tileY + dy;
                if ((uint)ny >= (uint)tileCount) continue;
                for (int dx = -1; dx <= 1; ++dx)
                {
                    int nx = tileX + dx;
                    if ((uint)nx >= (uint)tileCount) continue;

                    int neighborIndex = ny * tileCount + nx;
                    if (!vtComp.dictMeshInfoOneTile.TryGetValue(neighborIndex, out var meshInfoOneTile))
                        continue;
                    var list = meshInfoOneTile.listMeshInfo;
                    if (list == null) continue;

                    if (meshInfoOneTile.hasUnionBounds &&
                        !CheckAreaOverlapsArea(meshInfoOneTile.unionBounds, nodeWorldBounds))
                        continue;

                    for (int i = 0; i < list.Count; ++i)
                    {
                        var meshInfo = list[i];
                        if (meshInfo == null) continue;

                        // 包围盒先筛：isValid 是两次 UnityEngine.Object 原生判空，
                        // 放在这之后，只有真正落进本 page 的少数几个才需要付这个代价
                        if (!CheckAreaOverlapsArea(meshInfo.boundsInfo, nodeWorldBounds)) continue;
                        if (meshInfo.passIndexRenderToVT < 0 || !meshInfo.isValid) continue;

                        // 与包边石画面同一档 Mesh LOD
                        Mesh drawMesh = meshInfo.mesh;
                        if (meshInfo.lodInfo != null)
                        {
                            var lodMesh = WorldTileRendering.GetCurrentUsedMesh(meshInfo.lodInfo, displayLod);
                            if (lodMesh != null)
                                drawMesh = lodMesh;
                        }

                        // CheckRTForBlend(iMipLv); // [ToDo:link] Cliff_RenderToVT
                        // 包边石只写入高度，不需要处理Mip Streaming
                        cbForRenderSlice.DrawMesh(drawMesh, meshInfo.matrix, meshInfo.material, 0,
                            meshInfo.passIndexRenderToVT, false);
                    }
                }
            }
        }

        // [0] leftDown  [1] rightDown  [2] leftUp  [3] rightUp
        public Vector2Int GetMipOffset(int childMipSize, int idxChild)
        {
            Vector2Int mipOffset = Vector2Int.zero;
            if (idxChild == 0)
            {
                mipOffset.x = 0;
                mipOffset.y = 0;
            }
            else if (idxChild == 1)
            {
                mipOffset.x = childMipSize;
                mipOffset.y = 0;
            }
            else if (idxChild == 2)
            {
                mipOffset.x = 0;
                mipOffset.y = childMipSize;
            }
            else
            {
                mipOffset.x = childMipSize;
                mipOffset.y = childMipSize;
            }

            return mipOffset;
        }

        public void MipShiftToChild(int parentSlice, int childSlice, int startParentMip, int endParentMip, int idxChild)
        {
#if ENABLE_PROFILER
            if (!GMRenderPassToggle.IsVTSubmitEnabled())
            {
                return;
            }
#endif
            for (int iSrcMip = startParentMip; iSrcMip <= endParentMip; ++iSrcMip)
            {
                int iDstMip = iSrcMip + 1;
                int childMipSize = PageSize >> iDstMip;

                var mipOffset = GetMipOffset(childMipSize, idxChild);

                Texture sourceAlbedoArray = UseASTCCompress ? (Texture)clipAlbedoTexArray2D : clipAlbedoTexArrayRT;
                Texture sourceNormalArray = UseASTCCompress ? (Texture)clipNormalTexArray2D : clipNormalTexArrayRT;
                Texture sourceWorldYArray = UseASTCCompress ? (Texture)clipWorldYTexArray2D : clipWorldYTexArrayRT;

                // 直接从 parentSlice 的子区域拷贝到 childSlice
                Graphics.CopyTexture(sourceAlbedoArray, parentSlice, iSrcMip, mipOffset.x, mipOffset.y, childMipSize, childMipSize,
                    sourceAlbedoArray, childSlice, iDstMip, 0, 0);

                Graphics.CopyTexture(sourceNormalArray, parentSlice, iSrcMip, mipOffset.x, mipOffset.y, childMipSize, childMipSize,
                    sourceNormalArray, childSlice, iDstMip, 0, 0);

                Graphics.CopyTexture(sourceWorldYArray, parentSlice, iSrcMip, mipOffset.x, mipOffset.y, childMipSize, childMipSize,
                    sourceWorldYArray, childSlice, iDstMip, 0, 0);
            }
        }

        public void MipShiftToParent(int parentSlice, int childSlice, int startChildMip, int endChildMip, int idxChild)
        {
#if ENABLE_PROFILER
            if (!GMRenderPassToggle.IsVTSubmitEnabled())
            {
                return;
            }
#endif
            for (int iSrcMip = startChildMip; iSrcMip <= endChildMip; ++iSrcMip)
            {
                int iDstMip = iSrcMip - 1;
                int childMipSize = PageSize >> iSrcMip;
                var mipOffset = GetMipOffset(childMipSize, idxChild);

                Texture sourceAlbedoArray = UseASTCCompress ? (Texture)clipAlbedoTexArray2D : clipAlbedoTexArrayRT;
                Texture sourceNormalArray = UseASTCCompress ? (Texture)clipNormalTexArray2D : clipNormalTexArrayRT;
                Texture sourceWorldYArray = UseASTCCompress ? (Texture)clipWorldYTexArray2D : clipWorldYTexArrayRT;

                // 直接从 childSlice 拷贝到 parentSlice 的子区域
                Graphics.CopyTexture(sourceAlbedoArray, childSlice, iSrcMip, 0, 0, childMipSize, childMipSize,
                    sourceAlbedoArray, parentSlice, iDstMip, mipOffset.x, mipOffset.y);

                Graphics.CopyTexture(sourceNormalArray, childSlice, iSrcMip, 0, 0, childMipSize, childMipSize,
                    sourceNormalArray, parentSlice, iDstMip, mipOffset.x, mipOffset.y);

                Graphics.CopyTexture(sourceWorldYArray, childSlice, iSrcMip, 0, 0, childMipSize, childMipSize,
                    sourceWorldYArray, parentSlice, iDstMip, mipOffset.x, mipOffset.y);
            }
        }
    }

    public static Mesh ConstructFullscreenMesh()
    {
        float topV = 1.0f;
        float bottomV = 0.0f;

        Mesh FullscreenMesh = new Mesh {name = "Fullscreen Quad"};
        FullscreenMesh.SetVertices(new List<Vector3>
        {
            new Vector3(-1.0f, -1.0f, 0.0f),
            new Vector3(-1.0f, 1.0f, 0.0f),
            new Vector3(1.0f, -1.0f, 0.0f),
            new Vector3(1.0f, 1.0f, 0.0f)
        });

        FullscreenMesh.SetUVs(0, new List<Vector2>
        {
            new Vector2(0.0f, bottomV),
            new Vector2(0.0f, topV),
            new Vector2(1.0f, bottomV),
            new Vector2(1.0f, topV)
        });

        FullscreenMesh.SetIndices(new[] {0, 1, 2, 2, 1, 3}, MeshTopology.Triangles, 0, false);
        FullscreenMesh.UploadMeshData(true);
        return FullscreenMesh;
    }

    public class PhysicIndexManager
    {
        private Queue<int> physicIndexRepository;
        public int TotalCount { get; private set; }
        public PhysicIndexManager(int totalPhysicIndexCount)
        {
            TotalCount = totalPhysicIndexCount;

            physicIndexRepository = new Queue<int>(TotalCount);
            for (int i = InvalidPhysicIndex + 1; i < TotalCount; i++) // 从InvalidPhysicIndex+1开始，InvalidPhysicIndex作为无效值
            {
                physicIndexRepository.Enqueue(i);
            }
        }

        public int FreeCount => physicIndexRepository.Count;

        public void ResetPhysicIndex(QuadNode quadNode)
        {
            if (quadNode.physicTexIndex > InvalidPhysicIndex)
            {
                physicIndexRepository.Enqueue(quadNode.physicTexIndex);
            }

            quadNode.physicTexIndex = InvalidPhysicIndex;
        }

        public int RequestPhysicIndex()
        {
            int physicIndex = physicIndexRepository.Count > 0 ? physicIndexRepository.Dequeue() : InvalidPhysicIndex;
            if (physicIndex == InvalidPhysicIndex)
            {
                Debug.LogError("RequestPhysicIndex Result {InvalidPhysicIndex}");
            }

            return physicIndex;
        }
    }

    /// IndexRT 的索引写入：把本帧所有脏 QuadNode 的矩形攒起来，用一次 DrawMeshInstanced 画完。
    /// 原先是逐结点 SetRenderTarget + SetViewport + DrawMesh，而 IndexRT 是
    /// rootSize x rootSize（rootSize = singleTileRootSize * TileCount，主世界 32 个地块、
    /// MaxTreeDepth=5 时为 1024x1024），在 tile-based GPU 上每开一轮 render pass 都要
    /// load/store 整张图，全量重绘时会放大到 page 数量倍。这里收敛成一个 pass、一个 draw。
    private class IndexInstancedWriter
    {
        private static readonly int ID_Color = Shader.PropertyToID("_Color");

        private readonly Mesh quadMesh;
        private readonly RenderTexture destRT;
        private readonly float invRootSize;
        private readonly Matrix4x4[] matrices;
        private readonly Vector4[] colors;
        private readonly MaterialPropertyBlock propertyBlock = new MaterialPropertyBlock();

        private Material material;
        private CommandBuffer cmd;
        private int instanceCount;

        public IndexInstancedWriter(Mesh _quadMesh, RenderTexture _destRT, int rootSize, int maxInstancePerBatch)
        {
            quadMesh = _quadMesh;
            destRT = _destRT;
            invRootSize = 1.0f / rootSize;

            matrices = new Matrix4x4[maxInstancePerBatch];
            colors = new Vector4[maxInstancePerBatch];

            RenderPipelineUtil.CreateMaterial(ref material, BuiltInShader.VT_INDEX_WRITE_SHADER_URL);
            #if UNITY_EDITOR && LINK_TEST
            material.shader = Shader.Find(material.shader.name);
            #endif
            material.enableInstancing = true;
            cmd = new CommandBuffer { name = "VT.IndexWrite" };
        }

        public void Dispose()
        {
            RenderPipelineUtil.DestroyMaterial(ref material);

            instanceCount = 0;
            cmd?.Clear();
            cmd?.Dispose();
            cmd = null;
        }

        private static readonly Matrix4x4 identityMatrix = Matrix4x4.identity;
        private static readonly Matrix4x4 orthoMatrix = Matrix4x4.Ortho(-1, 1, -1, 1, -1, 1);

        /// destX / destY / destSize 是 IndexRT 上的像素矩形，原点在左下角（与原先 SetViewport 一致）。
        /// 基础 mesh 是 [-1,1] 的 quad、半边长为 1，所以缩放取矩形边长占全图的比例即可。
        public void FillSubRegion(byte value, int destX, int destY, int destSize)
        {
            if (instanceCount >= matrices.Length)
            {
                // 分阶段重绘切换 mip 位的那一帧，同一个结点会先后写入两次，可能超过一批的容量
                Flush();
            }

            float scale = destSize * invRootSize;
            float centerX = (2.0f * destX + destSize) * invRootSize - 1.0f;
            float centerY = (2.0f * destY + destSize) * invRootSize - 1.0f;

            matrices[instanceCount] = Matrix4x4.TRS(new Vector3(centerX, centerY, 0),
                Quaternion.identity, new Vector3(scale, scale, 1));
            colors[instanceCount] = new Vector4(value / 255.0f, 0, 0, 0);
            ++instanceCount;
        }

        public void Flush()
        {
            if (instanceCount == 0) return;
#if ENABLE_PROFILER
            if (!GMRenderPassToggle.IsVTSubmitEnabled())
            {
                instanceCount = 0;
                cmd.Clear();
                return;
            }
#endif

            // 数组长度固定为 maxInstancePerBatch，Shader 只会读到 instanceCount 之前的元素
            propertyBlock.SetVectorArray(ID_Color, colors);

            cmd.SetRenderTarget(destRT);
            cmd.SetViewMatrix(identityMatrix);
            cmd.SetProjectionMatrix(orthoMatrix);
            cmd.DrawMeshInstanced(quadMesh, 0, material, 0, matrices, instanceCount, propertyBlock);

            Graphics.ExecuteCommandBuffer(cmd);
            cmd.Clear();

            instanceCount = 0;
        }
    }

    // 用于避免频繁的 string 传递（高频调用Shader.EnableKeyword与Shader.DisableKeyword时）
    public class ShaderKeywordCache
    {
        private string ShaderKeyword;
        private bool Inited = false;
        private bool InternalState = false;
        public bool State
        {
            get
            {
                CheckInit();
                return InternalState;
            }
        }

        public ShaderKeywordCache(string _shaderKeyword)
        {
            ShaderKeyword = _shaderKeyword;
        }

        // 需要有 CheckInit的原因：Shader.IsKeywordEnabled无法在成员变量声明并初始化的同时调用，所以这里进行延迟初始化
        private void CheckInit()
        {
            if (!Inited)
            {
                Inited = true;
                InternalState = Shader.IsKeywordEnabled(ShaderKeyword);
            }
        }

        public void EnableKeyword() => ToggleKeyword(true);
        public void DisableKeyword() => ToggleKeyword(false);

        public void ToggleKeyword(bool newState)
        {
            CheckInit();
            if (InternalState == newState) return;

            InternalState = newState;
            if (newState) Shader.EnableKeyword(ShaderKeyword);
            else Shader.DisableKeyword(ShaderKeyword);
        }
    }

    public const int InvalidPhysicIndex = -1;
    public const int InvalidMeshToVTIndex = 0; // UnityEngine.Object.GetInstanceID() 不会等于0

    public static bool IsMeshToVTIndexValid(int index) => index != InvalidMeshToVTIndex;

    public class VTMeshInfoIndexList
    {
        public List<int> listMeshInfoIndex;
    }

    public class VTMeshInfoList
    {
        public List<MeshInfo> listMeshInfo;
        public Vector4 unionBounds; // 与 MeshInfo.boundsInfo 同格式，注册时算一次
        public bool hasUnionBounds;

        public void RefreshUnionBounds()
        {
            hasUnionBounds = false;
            unionBounds = Vector4.zero;
            if (listMeshInfo == null) return;

            for (int i = 0; i < listMeshInfo.Count; ++i)
            {
                var meshInfo = listMeshInfo[i];
                if (meshInfo == null || !meshInfo.isValid) continue;

                if (!hasUnionBounds)
                {
                    unionBounds = meshInfo.boundsInfo;
                    hasUnionBounds = true;
                }
                else
                {
                    var b = meshInfo.boundsInfo;
                    unionBounds.x = unionBounds.x < b.x ? unionBounds.x : b.x;
                    unionBounds.y = unionBounds.y < b.y ? unionBounds.y : b.y;
                    unionBounds.z = unionBounds.z > b.z ? unionBounds.z : b.z;
                    unionBounds.w = unionBounds.w > b.w ? unionBounds.w : b.w;
                }
            }
        }
    }

    // enum值大的后画，会blend盖住enum值小的
    public enum MeshDrwaOrder
    {
        Default, // WorldTileStreaming的默认情况
        SubEntity, // OutsideSubEntityMgr
        PersistDecal, // WorldTileStreaming中传递过来的PersistDecal，一般是山脚的修饰Decal或者地貌过渡的Decal
        ResourceDecal, // WorldTileStreaming传递过来的ResourceDecal（跟随资源田显示与隐藏）
        ForestRenderer, // OutsideForestRenderer（资源田本身的Decal）
    }

    // QuadNode 记录 meshInfoIndex 时一并内联 drawOrder：插入排序只比较 drawOrder，
    // 不必为了拿排序键去回查 dictMeshInfo（那会让插入退化成 O(n) 次字典查找）
    public struct MeshInfoRef
    {
        public int meshInfoIndex;
        public MeshDrwaOrder drawOrder;

        public MeshInfoRef(int _meshInfoIndex, MeshDrwaOrder _drawOrder)
        {
            meshInfoIndex = _meshInfoIndex;
            drawOrder = _drawOrder;
        }
    }

    public class MeshInfo
    {
        public Material material;
        public Matrix4x4 matrix;
        public Vector4 boundsInfo; // [x: Bounds.min.x, y: Bounds.min.z, z: Bounds.max.x, w: Bounds.max.z]
        public Mesh mesh;
        // 包边石：绘制高度时按当前 DisplayLod 取 mesh，null 则用 mesh
        public WorldTileStreaming.MeshLODInfo lodInfo;
        public int passIndexRenderToVT;
        public int passIndexRenderToVT_Metallic;
        public bool isVisible;
        public MeshDrwaOrder drawOrder; // 绘制优先级，数值越小越先绘制
        public DecalType decalType; // Decal 类型：HideTerrainDetail(镜头拉高)时，仅 Permanent 仍绘制到 VT，其余维持隐藏。默认 None

        public bool isValid => mesh != null && material != null;

        public static Bounds TransformBounds(Matrix4x4 m, Bounds b)
        {
            Vector3 center = m.MultiplyPoint3x4(b.center);
            Vector3 e = b.extents;
    
            // 每个轴的新 extent = 原 extents 在该轴上投影的绝对值之和
            Vector3 newExtents = new Vector3(
                Mathf.Abs(m.m00) * e.x + Mathf.Abs(m.m01) * e.y + Mathf.Abs(m.m02) * e.z,
                Mathf.Abs(m.m10) * e.x + Mathf.Abs(m.m11) * e.y + Mathf.Abs(m.m12) * e.z,
                Mathf.Abs(m.m20) * e.x + Mathf.Abs(m.m21) * e.y + Mathf.Abs(m.m22) * e.z
            );
    
            return new Bounds(center, newExtents * 2f);
        }

        public MeshInfo(Matrix4x4 _matrix, Mesh _mesh, Material _material, bool visible = true, MeshDrwaOrder _drawOrder = MeshDrwaOrder.Default, DecalType _decalType = DecalType.None)
        {
            mesh = _mesh;
            material = _material;
            matrix = _matrix;
            var transformedBounds = TransformBounds(_matrix, _mesh.bounds);
            boundsInfo = new Vector4(
                transformedBounds.min.x, transformedBounds.min.z,
                transformedBounds.max.x, transformedBounds.max.z);
            passIndexRenderToVT = material.FindPass(PassName_RenderToVT);
            passIndexRenderToVT_Metallic = material.FindPass(PassName_RenderToVT_Metallic);
            isVisible = visible;
            drawOrder = _drawOrder;
            decalType = _decalType;

#if UNITY_EDITOR && LINK_TEST
            // material.shader = Shader.Find(material.shader.name);
#endif
        }
        
        public MeshInfo(Mesh _mesh, Material _material, bool visible = true, MeshDrwaOrder _drawOrder = MeshDrwaOrder.Default, DecalType _decalType = DecalType.None)
        {
            mesh = _mesh;
            material = _material;
            matrix = Matrix4x4.identity;

            var meshBounds = mesh.bounds;
            boundsInfo = new Vector4(meshBounds.min.x, meshBounds.min.z, meshBounds.max.x, meshBounds.max.z);
            passIndexRenderToVT = material.FindPass(PassName_RenderToVT);
            passIndexRenderToVT_Metallic = material.FindPass(PassName_RenderToVT_Metallic);
            isVisible = visible;
            drawOrder = _drawOrder;
            decalType = _decalType;

#if UNITY_EDITOR && LINK_TEST
            // material.shader = Shader.Find(material.shader.name);
#endif
        }
    }
}
