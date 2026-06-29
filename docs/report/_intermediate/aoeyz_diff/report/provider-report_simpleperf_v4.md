# simpleperf 单源 性能分析报告 · v4.1（自动生成）

> 数据列只放纯数字。`base` = 基线采集；`cur` = 当前采集。

## §0 结论先行

**本次采集**（MateXs2 / stressmove / 20s）相比 base 野外空场景：

- **系统总工作量上升 +30.7%**，其中**业务层（项目自身代码）绝对工作量 +70.1%**。
- **4 项业务模块出现显著负载变化**（详见 §4）：
  - ECS Burst Job 工作量 +4506 samples（+878.4%）—— 已下沉 Worker 并行，**不阻塞主线程**
  - Wwise 音频中间件 +4404 samples（+1261.9%）—— wwise_worker
  - MeshUI 迭代位置刷新 +931 samples（NEW）—— main_thread
  - Lua VM 解释执行 +345 samples（+24.0%）—— 
- **未观察到 CPU 侧 GPU bound 信号**（主线程 `GfxDeviceClient::WaitForPendingPresent` 仅 20 样本）。但 simpleperf 不直接观测 GPU 顶点处理时间，**GPU 实际工作量需 perfetto GPU counter / RenderDoc 复核**。

按 ROI 排序的优化方向（详细见 §4）：

1. **Wwise 战斗音效复杂度审视** —— 中间件唯一红线
2. **MeshUI 迭代位置刷新优化** —— MUIControlManager.OnLateUpdate + MUILayout.Set3DPosition
3. **行军线刷新增量化** —— OutSideViewArmyLineMgr.UpdateStraightMoveLine
4. **GPU Instancing 数据上传 dirty flag** —— RHI 线程 ConstantBuffersGLES.UpdateBuffers

## §1 采集元信息与质量门

### 1.1 元信息

| 项 | base | cur |
|---|---|---|
| 总采样数 | 36,133 | 47,228 |
| 系统总工作量比 | 1.000 | 1.307 |

### 1.2 符号化质量

| 指标 | base | cur | 判定 |
|---|---|---|---|
| 总状态 | PASS | PASS | 🟢 |
| 应用层符号化率 | 99.7% | 91.8% | 🟢 |
| unknown% | 0.4% | 6.3% | 🟢 |

## §2 库（so）维度对比

### 2.1 库占比（按绝对增量降序）

| 库 | 绝对增量 | 增量% | cur abs | base abs | 占比 cur % |
|---|---|---|---|---|---|
| lib_burst_generated | +4506 | +878.4% | 5,019 | 513 | 10.63% |
| libAkSoundEngine | +4404 | +1261.9% | 4,753 | 349 | 10.06% |
| libil2cpp | +1602 | +22.6% | 8,682 | 7,080 | 18.38% |
| libc | +631 | +22.3% | 3,459 | 2,828 | 7.33% |
| libxlua | +561 | +29.1% | 2,488 | 1,927 | 5.27% |
| libunity | -428 | -2.8% | 14,664 | 15,092 | 31.05% |
| libart | -244 | -26.3% | 683 | 927 | 1.45% |
| libgui | -188 | -100.0% | 0 | 188 | 0.00% |
| linker64 | +186 | +86.9% | 400 | 214 | 0.85% |
| libm | -139 | -18.7% | 604 | 743 | 1.28% |
| JIT_cache | -38 | -8.6% | 405 | 443 | 0.86% |
| libGLESv2_adreno | +27 | +0.6% | 4,802 | 4,775 | 10.17% |

## §3 线程维度对比

### 3.1 线程占比 + 身份识别（按绝对增量降序）

| 真实身份 | 绝对增量 | 增量% | cur abs | base abs | cur % | comm | tid |
|---|---|---|---|---|---|---|---|
| **Wwise 工作线程** | +4512 | +1178.1% | 4,895 | 383 | 10.36% | NativeThread | 19814 |
| **主线程** | +2045 | +12.7% | 18,167 | 16,122 | 38.47% | UnityMain | 19292 |
| **Job Worker** | +1035 | +114.7% | 1,937 | 902 | 4.10% | Thread-129 | 19461 |
| **Job Worker** | +1000 | +112.6% | 1,888 | 888 | 4.00% | Thread-135 | 19460 |
| **Job Worker** | +975 | +110.4% | 1,858 | 883 | 3.94% | Thread-158 | 19459 |
| **Job Worker** | +972 | +109.0% | 1,864 | 892 | 3.95% | Thread-136 | 19462 |
| **RHI 线程** | +303 | +3.1% | 10,017 | 9,714 | 21.21% | Thread-102 | 19471 |
| **音频回调（系统）** | +217 | +64.2% | 555 | 338 | 1.18% | AAudio_1 | 19826 |
| **Render 线程** | +189 | +4.5% | 4,410 | 4,221 | 9.34% | UnityGfxRenderS | 19472 |
| **Lua MtGC 工作线程** | -141 | -30.6% | 320 | 461 | 0.68% | UnityMain | 19816 |
| **unidentified** | -97 | -100.0% | 0 | 97 | 0.00% | Binder:19184_7 | 19435 |
| **unidentified** | -57 | -100.0% | 0 | 57 | 0.00% | Binder:19184_3 | 19215 |
| **unidentified** | +38 | NEW | 38 | 0 | 0.08% | Thread-102 | 20993 |
| **unidentified** | +32 | NEW | 32 | 0 | 0.07% | Binder:19184_6 | 19380 |
| **unidentified** | +23 | NEW | 23 | 0 | 0.05% | Binder:19184_2 | 19202 |

### 3.2 同名 UnityMain 陷阱

多条线程 comm 可能都叫 `UnityMain`；Provider 已用 `{comm}#{tid}` 复合 key + identity 消歧。

## §4 全局性能热点 Top-N

### 4.1 Top-N 总表

| # | 判定 | 业务模块 | 所在线程 | base abs | cur abs | 增量 abs | 增量% |
|---|---|---|---|---|---|---|---|
| 1 | 🟢 | ECS Burst Job 工作量 | job_worker × 4 | 513 | 5,019 | +4506 | +878.4% |
| 2 | 🔴 | Wwise 音频中间件 | wwise_worker | 349 | 4,753 | +4404 | +1261.9% |
| 3 | 🔴 | MeshUI 迭代位置刷新 | main_thread | 0 | 931 | +931 | NEW |
| 4 | 🟢 | Lua VM 解释执行 |  | 1,435 | 1,780 | +345 | +24.0% |
| 5 | 🟢 | URP 主线程渲染配置 |  | 0 | 299 | +299 | NEW |
| 6 | 🟢 | 行军线刷新（OutSideViewArmyLineMgr） | main_thread | 0 | 224 | +224 | NEW |
| 7 | 🟢 | RHI DrawCall 提交 |  | 742 | 652 | -90 | -12.1% |
| 8 | 🟢 | RHI 常量缓冲上传 |  | 244 | 263 | +19 | +7.8% |
| 9 | 🟢 | 网络消息处理 |  | 0 | 13 | +13 | NEW |
| 10 | 🟢 | Lua GC 工作线程 | lua_mtgc_worker | 2 | 7 | +5 | +250.0% |

## §5 主线程深度分析

### 5.1 主线程 PlayerLoop 阶段表

| 阶段 | base abs | cur abs | base 主线程% | cur 主线程% | 增量% | 判定 |
|---|---|---|---|---|---|---|
| Update.ScriptRunBehaviourUpdate | 2624 | 5948 | — | 32.74% | +126.7% | 🟢 |
| PreLateUpdate.ScriptRunBehaviourLateUpdate | 1673 | 2730 | — | 15.03% | +63.2% | 🟢 |
| EarlyUpdate.UpdateTextureStreamingManager | 450 | 289 | — | 1.59% | -35.8% | 🟢 |
| PreLateUpdate.ParticleSystemBeginUpdateAll | 26 | 166 | — | 0.91% | +538.5% | 🟢 |
| PostLateUpdate.PlayerSendFrameComplete | 500 | 377 | — | 2.08% | -24.6% | 🟢 |
| PostLateUpdate.PlayerUpdateCanvases | 326 | 224 | — | 1.24% | -31.3% | 🟢 |
| PreLateUpdate.LegacyAnimationUpdate | 45 | 137 | — | 0.75% | +204.4% | 🟢 |
| PostLateUpdate.UpdateAllRenderers | 39 | 100 | — | 0.55% | +156.4% | 🟢 |
| PostLateUpdate.PlayerEmitCanvasGeometry | 172 | 120 | — | 0.66% | -30.2% | 🟢 |
| PostLateUpdate.FinishFrameRendering | 165 | 122 | — | 0.67% | -26.1% | 🟢 |
| PostLateUpdate.ParticleSystemEndUpdateAll | 4 | 43 | — | 0.24% | +975.0% | 🟢 |
| LuaMultiThreadGC.main | 23 | 10 | — | 0.05% | -56.5% | 🟢 |
| PreUpdate.SendMouseEvents | 61 | 64 | — | 0.35% | +4.9% | 🟢 |

### 5.2 主线程完整调用树

```
ExecutePlayerLoop(NativePlayerLoopSystem*) (12,521 / 68.92%) [wrapper] 📈🟡
│  ├─ ExecutePlayerLoop(NativePlayerLoopSystem*) (12,513 / 68.88%) 📈🟡
│  │  ├─ InitPlayerLoopCallbacks()::UpdateScriptRunBehaviourUpdateRegistrator::Forward() (.llvm.16267668533460447892) (5,948 / 32.74%) [wrapper] 📈🟡
│  │  │  ├─ BehaviourManager::Update() (5,947 / 32.73%) [wrapper] 📈🟡
│  │  │  │  ├─ void BaseBehaviourManager::CommonUpdate<BehaviourManager>() (5,946 / 32.73%) [wrapper] 📈🟡
│  │  │  │  │  ├─ MonoBehaviour::CallUpdateMethod(int) (5,921 / 32.59%) [wrapper] 📈🟡
│  │  │  │  │  │  ├─ ScriptingInvocation::Invoke(ScriptingExceptionPtr*, bool) (5,887 / 32.41%) [wrapper] 🟡
│  │  │  │  │  │  │  ├─ il2cpp::vm::Runtime::Invoke(MethodInfo const*, void*, void**, Il2CppException**) (5,865 / 32.28%) [wrapper] 🟡
│  │  │  │  │  │  │  │  ├─ RuntimeInvoker_TrueVoid_t22962CB4C05B1D89B55A6E1139F0E87A90987017(void (*)(), MethodInfo const*, void*, void**) (5,865 / 32.28%) [wrapper] 📈🟡
│  │  │  │  │  │  │  │  │  ├─ GameLauncher_Update_m3CAA53A4029FEAB80C4F555EDC3A798C14E01B7E (5,510 / 30.33%) [wrapper] 📈🟡
│  │  │  │  │  │  │  │  │  │  ├─ FrameworkCore_OnUpdate_m652ED8A40EC3FBF48D8118DECF2E23454BBF4479 (5,472 / 30.12%) 📈🟡
│  │  │  │  │  │  │  │  │  │  │  ├─ LuaMgr_OnUpdate_m2AF3D721C056492E9FFB6ACA3D308C1F7A2B9FB9 (2,613 / 14.38%) [wrapper] 📈🟡
│  │  │  │  │  │  │  │  │  │  │  │  ├─ BaseLuaMgr_OnUpdate_m9A065F7A5031DFE36B42D8C5B127D546C5B9377D (2,610 / 14.37%) [wrapper] 📈🟡
│  │  │  │  │  │  │  │  │  │  │  ├─ MapManager_OnUpdate_mDE1EB897580A108B6670AF5381B3330E0CF79E80 (2,526 / 13.90%) 📈🟡
│  │  │  │  │  │  │  │  │  │  │  │  ├─ BattleUIManager_OnUpdate_m7C2141EB895B437A7223329DAC1E15F0C77708B4 (1,104 / 6.08%) 📈🟡
│  │  │  │  │  │  │  │  │  │  │  │  ├─ OutSideViewArmyLineMgr_OnUpdate_m450638A78FFDC4DEA693CB2280FA264FA228C173 (988 / 5.44%) [wrapper] 📈🟡
│  │  │  │  │  │  │  │  │  │  │  │  ├─ MapEntityEffectMgr_OnUpdate_m3D3CDC70DA182EF20EBF6F30F974CA7C168BC4C5 (152 / 0.83%) [wrapper] 📈🟢
│  │  │  │  │  │  │  │  │  │  │  ├─ TServerManager_OnUpdate_m80773458F9F83BF6D7DF1EF478586936F69D3F57 (134 / 0.73%) [wrapper] 🟢
│  │  │  │  │  │  │  │  │  │  │  │  ├─ TServer_Tick_m98221E764E372B16A64880AA588038C415377B57 (124 / 0.68%) 🟢
│  │  │  │  │  │  │  │  │  ├─ AndroidActivityResolution_Update_m1063668C765A2FD46433032CB856EC54615B1D33 (106 / 0.59%) [wrapper] 🟢
│  │  │  │  │  │  │  │  │  │  ├─ AndroidActivityResolution_IsInMultiWindowMode_mDBEDF4EF2EFCF2F4F63BB83EF701A4A347A02D75 (106 / 0.59%) [wrapper] 🟢
│  │  │  │  │  │  │  │  │  │  │  ├─ AndroidJavaObject__Call_TisBoolean_tB53F6830F670160873277339AA58F15CAED4399C_mEBA0037C435AC77FA752193AEBECC3F65F684468_gshared (103 / 0.57%) 🟢
│  │  ├─ InitPlayerLoopCallbacks()::PreLateUpdateScriptRunBehaviourLateUpdateRegistrator::Forward() (.llvm.16267668533460447892) (2,730 / 15.03%) [wrapper] 📈🟡
│  │  │  ├─ LateBehaviourManager::Update() (2,728 / 15.02%) [wrapper] 📈🟡
│  │  │  │  ├─ MonoBehaviour::CallUpdateMethod(int) (2,717 / 14.96%) [wrapper] 📈🟡
│  │  │  │  │  ├─ ScriptingInvocation::Invoke(ScriptingExceptionPtr*, bool) (2,699 / 14.86%) [wrapper] 🟡
│  │  │  │  │  │  ├─ il2cpp::vm::Runtime::Invoke(MethodInfo const*, void*, void**, Il2CppException**) (2,680 / 14.75%) [wrapper] 🟡
│  │  │  │  │  │  │  ├─ RuntimeInvoker_TrueVoid_t22962CB4C05B1D89B55A6E1139F0E87A90987017(void (*)(), MethodInfo const*, void*, void**) (2,678 / 14.74%) 📈🟡
│  │  │  │  │  │  │  │  ├─ GameLauncher_LateUpdate_mB162FBFCC2D0D45FD5873DFCDE3F4B29CE3ACEF9 (2,107 / 11.60%) [wrapper] 📈🟡
│  │  │  │  │  │  │  │  │  ├─ FrameworkCore_OnLateUpdate_mBB7DEC38A01DB20BC2FB415E90B060CF9A7B83B3 (2,101 / 11.56%) 📈🟡
│  │  │  │  │  │  │  │  │  │  ├─ MeshUIManager_OnLateUpdate_mD1A233FAD58F6CA85ECA50F7F3FEA41B5C5F5A10 (1,079 / 5.94%) 📈🟡
│  │  │  │  │  │  │  │  │  │  │  ├─ MUIControlManager_OnLateUpdate_mAD91DCD286F79F662FBC4BA326869C568D9A631C (544 / 3.00%) 📈🟢
│  │  │  │  │  │  │  │  │  │  │  ├─ MUIRenderManager_OnUpdate_mEE323D76AA53F08E0DB503AD970ED0467C4AE3E1 (368 / 2.03%) [wrapper] 📈🟢
│  │  │  │  │  │  │  │  │  │  │  │  ├─ MUIRendererBase_TryUpload_mD4C30976C6AC2D6FE923AA72D0D34AE0443801CE (365 / 2.01%) [wrapper] 📈🟢
│  │  │  │  │  │  │  │  │  │  │  ├─ MUILayoutManager_OnUpdate_mCF0395574A581508205E341F055FDE282CAEDDD6 (146 / 0.81%) 📈🟢
│  │  │  │  │  │  │  │  │  │  ├─ BaseLuaMgr_OnLateUpdate_m40AB4EA85860DC8CC0ECF0133C5B5D223EDD2079 (483 / 2.66%) [wrapper] 🟢
│  │  │  │  │  │  │  │  │  │  │  ├─ Action_Invoke_mC8D676E5DDF967EC5D23DD0E96FB52AA499817FD (479 / 2.64%) [wrapper] 🟢
│  │  │  │  │  │  │  │  │  │  │  │  ├─ DelegateBridge___Gen_Delegate_Imp97_m3166332F1CCE1D5910DF530886E0BABC11C9ED20 (477 / 2.62%) [wrapper] 🟢
│  │  │  │  │  │  │  │  │  │  ├─ MapManager_OnLateUpdate_mA939E4C349C95A28D3EBF000584EA2672FD00AA2 (478 / 2.63%) 🟢
│  │  │  │  │  │  │  │  │  │  │  ├─ WorldEnvironmentMeshItemMgr_OnLateUpdate_m4A81799EFC29F286B51EE9794E7578A4B1F897EB (143 / 0.79%) 🟢
│  │  │  │  │  │  │  │  │  │  │  ├─ OutsideViewTreeMgr_OnLateUpdate_mF45F83ED18D7247A29817E50F6A55B35C1327E6A (130 / 0.71%) 🟢
│  │  │  │  │  │  │  │  │  │  │  │  ├─ ViewHandle_UpdateView_m39F016D9A9D05A79D7707FD8D06876CE44CE0910 (102 / 0.56%) [wrapper] 🟢
│  │  │  │  │  │  │  │  ├─ FrameworkCore_OnPostLateUpdate_m4050866BB9A34678AA5D1900381D9DF0FA301467 (288 / 1.58%) 📈🟢
│  │  │  │  │  │  │  │  │  ├─ DotsManager_OnPostLateUpdate_m0DADC6FF74CB81A2D74FB352BE8496D2A3888CA1 (221 / 1.22%) 📈🟢
│  │  │  │  │  │  │  │  │  │  ├─ DotsArmyViewEntityMgr_OnPostLateUpdate_mD831CC33C5886655B9E6FFF89B62533E11DB36FB (157 / 0.86%) 📈🟢
│  │  │  │  │  │  │  │  │  │  │  ├─ DotsArmyViewEntityMgr_OnUpdateCreateEntity_m079956692597A3A5BECF0CCFA43F4ECC3BDAED78 (117 / 0.65%) 📈🟢
│  │  │  │  │  │  │  │  │  │  │  │  ├─ DotsArmyViewEntityMgr_HandleViewOp_m2A3D9945FD6DEF5EFF753F7779F73A1C586C6848 (104 / 0.57%) [wrapper] 📈🟢
│  │  ├─ ScriptingInvocation::Invoke(ScriptingExceptionPtr*, bool) (1,699 / 9.35%) [wrapper] 🟡
│  │  │  ├─ il2cpp::vm::Runtime::Invoke(MethodInfo const*, void*, void**, Il2CppException**) (1,693 / 9.32%) [wrapper] 🟡
│  │  │  │  ├─ RuntimeInvoker_TrueVoid_t22962CB4C05B1D89B55A6E1139F0E87A90987017(void (*)(), MethodInfo const*, void*, void**) (1,690 / 9.30%) [wrapper] 🟡
│  │  │  │  │  ├─ UpdateFunction_Invoke_m6C0E9E5082FCEEF018602FD40A43E613360D410D (1,688 / 9.29%) [wrapper] 🟡
│  │  │  │  │  │  ├─ ComponentSystem_Update_mAE72864D55CA50D9254DCB6D80778D42EA0EBBAD (1,598 / 8.80%) [wrapper] 🟡
│  │  │  │  │  │  │  ├─ ComponentSystemGroup_UpdateAllSystems_m85CAF07C55B79B97FA9CC91EAD8998E69588B4A2 (1,562 / 8.60%) 🟡
│  │  │  │  │  │  │  │  ├─ ComponentSystem_Update_mAE72864D55CA50D9254DCB6D80778D42EA0EBBAD (894 / 4.92%) [wrapper] 🟢
│  │  │  │  │  │  │  │  │  ├─ ComponentSystemGroup_UpdateAllSystems_m85CAF07C55B79B97FA9CC91EAD8998E69588B4A2 (822 / 4.53%) 🟢
│  │  │  │  │  │  │  │  │  │  ├─ JobComponentSystem_Update_mFFA4D358B16ED646660215CA62EB9BB514A9A3F7 (412 / 2.27%) 🟢
│  │  │  │  │  │  │  │  │  │  │  ├─ ParentSystem_OnUpdate_mC680AD488F27ADBA3F0926F396AA485CF99F4D77 (114 / 0.62%) 📈🟢
│  │  │  │  │  │  │  │  │  │  │  │  ├─ ParentSystem_UpdateNewParents_mD634270BBE222F898FF7877AA84A8825D6A9791B (98 / 0.54%) 🟢
│  │  │  │  │  │  │  │  │  │  ├─ ComponentSystem_Update_mAE72864D55CA50D9254DCB6D80778D42EA0EBBAD (373 / 2.05%) 🟢
│  │  │  │  │  │  │  │  │  │  │  ├─ ComponentSystemGroup_UpdateAllSystems_m85CAF07C55B79B97FA9CC91EAD8998E69588B4A2 (328 / 1.81%) [wrapper] 🟢
│  │  │  │  │  │  │  │  │  │  │  │  ├─ JobComponentSystem_Update_mFFA4D358B16ED646660215CA62EB9BB514A9A3F7 (315 / 1.73%) 🟢
│  │  │  │  │  │  │  │  ├─ JobComponentSystem_Update_mFFA4D358B16ED646660215CA62EB9BB514A9A3F7 (618 / 3.40%) 🟢
│  │  │  │  │  │  │  │  │  ├─ MoveChain_SoldierMoveSystem_OnUpdate_mF5B423C990DA3A2BE0A0D3D76848627741DE99FD (118 / 0.65%) 🟢
│  │  ├─ InitPlayerLoopCallbacks()::PostLateUpdatePlayerSendFrameCompleteRegistrator::Forward() (.llvm.16267668533460447892) (377 / 2.08%) [wrapper] 🟢
│  │  │  ├─ PlayerSendFrameComplete(bool) (377 / 2.08%) [wrapper] 🟢
│  │  │  │  ├─ DelayedCallManager::Update(int) (376 / 2.07%) [wrapper] 🟢
│  │  │  │  │  ├─ Coroutine::Run(bool*) (372 / 2.05%) [wrapper] 🟢
│  │  │  │  │  │  ├─ Coroutine::InvokeMoveNext(ScriptingExceptionPtr*) (361 / 1.99%) [wrapper] 🟢
│  │  │  │  │  │  │  ├─ ScriptingInvocation::Invoke(ScriptingExceptionPtr*, bool) (359 / 1.98%) [wrapper] 🟢
│  │  │  │  │  │  │  │  ├─ il2cpp::vm::Runtime::Invoke(MethodInfo const*, void*, void**, Il2CppException**) (358 / 1.97%) [wrapper] 🟢
│  │  │  │  │  │  │  │  │  ├─ RuntimeInvoker_FalseVoid_t22962CB4C05B1D89B55A6E1139F0E87A90987017_RuntimeObject_IntPtr_t(void (*)(), MethodInfo const*, void*, void**) (358 / 1.97%) [wrapper] 🟢
│  │  │  │  │  │  │  │  │  │  ├─ SetupCoroutine_InvokeMoveNext_m9106BA4E8AE0E794B17F184F1021A53F1D071F31 (358 / 1.97%) [wrapper] 🟢
│  │  │  │  │  │  │  │  │  │  │  ├─ U3CEndOfFrameU3Ed__23_MoveNext_m283B65DE5F40015A71B645BF575DED15BEF045A4 (354 / 1.95%) 🟢
│  │  │  │  │  │  │  │  │  │  │  │  ├─ FrameworkCore_OnEndOfFrame_m54BA777532ECEDAC4C6C3D2BBBC1B9D16F39A2EA (259 / 1.42%) 🟢
│  │  │  │  │  │  │  │  │  │  │  │  ├─ FrameworkCore_OnPostEndOfFrame_mFA643523E45043F9E1255D3FD099A6E6079AA161 (93 / 0.51%) [wrapper] 🟢
│  │  ├─ InitPlayerLoopCallbacks()::EarlyUpdateUpdateTextureStreamingManagerRegistrator::Forward() (.llvm.16267668533460447892) (289 / 1.59%) [wrapper] 🟢
│  │  │  ├─ TextureStreamingManager::Update() (289 / 1.59%) 🟢
│  │  │  │  ├─ RendererUpdateManager::UpdateSingleRenderer(Renderer&, RendererScene&) (114 / 0.63%) 🟢
│  │  ├─ InitPlayerLoopCallbacks()::PostLateUpdatePlayerUpdateCanvasesRegistrator::Forward() (.llvm.16267668533460447892) (224 / 1.24%) [wrapper] 🟢
│  │  │  ├─ UI::InitializeCanvasManager()::UIEventsWillRenderCanvasesRegistrator::Forward() (222 / 1.22%) 🟢
│  │  │  │  ├─ ScriptingInvocation::Invoke(ScriptingExceptionPtr*, bool) (134 / 0.74%) [wrapper] 🟢
│  │  │  │  │  ├─ il2cpp::vm::Runtime::Invoke(MethodInfo const*, void*, void**, Il2CppException**) (134 / 0.74%) [wrapper] 🟢
│  │  │  │  │  │  ├─ RuntimeInvoker_FalseVoid_t22962CB4C05B1D89B55A6E1139F0E87A90987017(void (*)(), MethodInfo const*, void*, void**) (134 / 0.74%) [wrapper] 🟢
│  │  │  │  │  │  │  ├─ WillRenderCanvases_Invoke_m115F44E08A802F1800D79D3B92EE1A575AD08834 (131 / 0.72%) [wrapper] 🟢
│  │  │  │  │  │  │  │  ├─ CanvasUpdateRegistry_PerformUpdate_m394F8B8FDD92DFCDFEEF86767B7A294B04211719 (129 / 0.71%) 🟢
│  │  ├─ ParticleSystem::InitializeClass()::PreLateUpdateParticleSystemBeginUpdateAllRegistrator::Forward() (166 / 0.91%) [wrapper] 📈🟢
│  │  │  ├─ ParticleSystem::BeginUpdateAll() (166 / 0.91%) 📈🟢
│  │  │  │  ├─ ParticleSystem::BeginUpdate(dynamic_array<ParticleSystem*, 0ul> const&, float) (91 / 0.50%) 🟢
│  │  ├─ AnimationManager::InitializeClass()::PreLateUpdateLegacyAnimationUpdateRegistrator::Forward() (.llvm.16223922044866121682) (137 / 0.75%) [wrapper] 🟢
│  │  │  ├─ AnimationManager::Update() (135 / 0.74%) [wrapper] 🟢
│  │  │  │  ├─ Animation::UpdateAnimation(double) (127 / 0.70%) 🟢
│  │  │  │  │  ├─ Animation::SampleInternal() (94 / 0.52%) 🟢
```

## §5.3 红线扫描（probe 清单）

| probe | 实测值 | 单位 | 判定 |
|---|---|---|---|
| LegacyAnimationUpdate | 0.114 | ms/帧 | 🟢 green |
| BattleUIManager OnUpdate | 0.133 | %main | 🟢 green |
| MapManager OnUpdate | 0.042 | %main | 🟢 green |
| MapManager LateUpdate | 0.033 | %main | 🟢 green |
| MeshUI 子树 | 5.124 | %main | 🔴 red |
| OutSideViewArmyLineMgr | 0.518 | %main | 🟢 green |
| Job Worker 均衡度 | 4.219 | % | 🟢 green |
| 主线程 Job 等待 | 0.139 | %global | 🟢 green |
| ParticleSystem 合计 | 0.174 | ms/帧 | 🟢 green |
| Boehm GC 后台 | 0.565 | %global | 🟢 green |
| GPU bound 主信号 | 0.043 | %global | 🟢 green |
| eglSwapBuffers（辅助） | 4.309 | %rhi | 🟢 green |
| LuaMgr OnLateUpdate | 0.007 | %main | 🟢 green |
| LuaMgr OnUpdate | 0.018 | %main | 🟢 green |
| Lua GC worker | 0.014 | %global | 🟢 green |
| Lua 总负载 | 3.032 | %global | 🟢 green |
| Wwise 音频中间件 | 10.063 | %global | 🔴 red |
| 网络消息（TServerManager 子树） | 0.068 | %main | 🟢 green |
| URP Foliage/Tree | 0.087 | %main | 🟢 green |
| URP 后处理 | 0.026 | %main | 🟢 green |
| MobileBaseRenderer Setup | 0.175 | %main | 🟢 green |
| URP ShadowPass | 0.144 | %main | 🟢 green |
| 资源加载平均 | 0.000 | ms/帧 | 🟢 green |
| RHI 常量缓冲上传 | 18.893 | %rhi | 🟢 green |
| RHI DrawCall | 53.440 | %rhi | 🟢 green |
| PlayerUpdateCanvases | 0.187 | ms/帧 | 🟢 green |

## §10 运行时函数反查清单

### 10.x `__memcpy` 反查（cur 3.14% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.85 | rhi_thread | ConstantBuffersGLES::UpdateCB(CbKey, void const*, unsigned l < GfxDeviceWorker:: | RHI / GPU Instancing |
| 0.85 | rhi_thread | !!!0000!e9a0267a4c3f12c4fb16e257d3a26e!272cf717f5! < !!!0000!9c0715a0352375a9ec2 | 未分类 |
| 0.55 | render_thread | InstancingBatcher::RenderInstancesWithBuffer(TranscriptRende < TranscriptRenderi | RHI / GPU Instancing |
| 0.32 | main_thread | Mesh::SetVertexData(void const*, unsigned long, unsigned lon < Mesh_CUSTOM_Inter | MeshUI 顶点上传 |
| 0.21 | rhi_thread | !!!0000!f56be09eb88f86833124f1df42e945!272cf717f5! < !!!0000!6b200851123c7898055 | 未分类 |
| 0.13 | main_thread | MUIRendererBase_FreshVertexAttribute_TisVector3_tDCF05E21F63 < MUIRendererBase_S | MeshUI 顶点上传 |
| 0.10 | rhi_thread | GLESGpuProgramApplier::ApplyVector(GpuProgramParameters::Val < GlslGpuProgramGLE | 未分类 |
| 0.07 | main_thread | ShaderPropertySheet::SetArrayProperty(ShaderLab::FastPropert < RenderingCommandB | URP / 命令缓冲 |

### 10.x `GC_end_stubborn_change` 反查（cur 0.25% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.12 | main_thread | Enumerator_MoveNext_m04F91EFB2C11DE1ED39627288DD2CF031EC8819 < MUIControlManager | MeshUI |
| 0.04 | main_thread | Enumerator_MoveNext_m38B1099DDAD7EEDE2F4CDAB11C095AC784AC2E3 < MUILayout_Set3DPo | MeshUI |
| 0.02 | main_thread | Scripting::UnityEngine::Rendering::OnDemandRenderingProxy::G < TimeManager::GetS | 未分类 |
| 0.02 | main_thread | Enumerator__ctor_m39C8C3D04576F8D63AF941CC77EE5871393388F0_g < MUILayout_Set3DPo | MeshUI |
| 0.01 | main_thread | Renderer_Get_Custom_PropRenderingLayerMask(ScriptingBackendN < PlanarShadow_Rese | URP / 阴影 |
| 0.01 | main_thread | BatchRenderer_FlushAndClear_m21A50B75CA713F655AC19C8E676B1D5 < OutsideTreeTypeRe | URP / 树木 Instancing |
| 0.01 | main_thread | ObjectPool_TryGetValue_m60D748FCB3168707904489FF819FAB2CBD5E < ObjectTranslator_ | 未分类 |
| 0.01 | main_thread | Enumerator_MoveNext_m2E3757A7C76D2E1DB0B77D03FF3DE7406334779 < OutsideTreeTypeRe | URP / 树木 Instancing |

### 10.x `MemoryManager::Allocate` 反查（cur 0.74% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.13 | render_thread | GfxDeviceClient::MapConstantBuffers(void**, CbKey const*, un < InstancingBatcher | RHI / GPU Instancing |
| 0.12 | main_thread | RenderingCommandBuffer::RenderingCommandBuffer(MemLabelId co < ScriptableRenderC | URP / 命令缓冲 |
| 0.11 | main_thread | core::StringStorageDefault<char>::allocate(unsigned long) < core::StringStorageD | URP / 命令缓冲 |
| 0.09 | main_thread | ScriptableRenderContext::ExecuteCommandBuffer(RenderingComma < ScriptableRenderC | URP / 命令缓冲 |
| 0.06 | main_thread | TranscriptScriptableRenderContext::CopyFrom(ScriptableRender < ScriptableRenderC | URP / 后处理 |
| 0.06 | render_thread | void InstancingBatcher::FillInstanceBufferWithJob<Instancing < InstancingBatcher | RHI / GPU Instancing |
| 0.05 | main_thread | MemoryManager::Reallocate(void*, unsigned long, unsigned lon < dynamic_array_det | 未分类 |
| 0.05 | main_thread | MemoryManager::Reallocate(void*, unsigned long, unsigned lon < dynamic_array_det | 未分类 |

### 10.x `__ieee754_powf` 反查（cur 0.72% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.49 | rhi_thread | UI::UIGeometryJob(UI::UIGeometryJobData*) < JobQueue::Exec(JobInfo*, long long,  | UGUI 几何 Job |
| 0.19 | job_worker | UI::UIGeometryJob(UI::UIGeometryJobData*) < JobQueue::Exec(JobInfo*, long long,  | UGUI 几何 Job |
| 0.02 | rhi_thread | UI::UIGeometryJob(UI::UIGeometryJobData*) < Thread-102 | UGUI 几何 Job |
| 0.01 | job_worker | UI::UIGeometryJob(UI::UIGeometryJobData*) < Thread-158 | UGUI 几何 Job |
| 0.01 | job_worker | UI::UIGeometryJob(UI::UIGeometryJobData*) < Thread-129 | UGUI 几何 Job |
| 0.01 | job_worker | UI::UIGeometryJob(UI::UIGeometryJobData*) < Thread-135 | UGUI 几何 Job |

### 10.x `XXH32` 反查（cur 0.37% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.33 | render_thread | TranscriptRenderingCommandBuffer::ExecuteCommandBuffer(Trans < TranscriptScripta | URP / 命令缓冲 |
| 0.01 | render_thread | ShaderLab::Program::GetMatchingSubProgram(Shader const*, Sha < ShaderLab::Shader | 未分类 |
| 0.01 | main_thread | ScriptableRenderContext::ExtractAndExecuteRenderPipelineNoCl < RenderManager::Re | URP / 命令缓冲 |
| 0.01 | main_thread | core::hash_set<core::pair<core::basic_string<char, core::Str < profiling::Profil | 未分类 |
| 0.01 | render_thread | ExecuteDrawRenderersCommand(TranscriptDrawRenderersCommand&, < TranscriptScripta | URP / 命令缓冲 |
| 0.00 | render_thread | core::hash_set<core::pair<core::basic_string<char, core::Str < profiling::Profil | 未分类 |

### 10.x `BucketAllocator::Allocate` 反查（cur 0.13% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.07 | main_thread | DualThreadAllocator<DynamicHeapAllocator>::Allocate(unsigned < MemoryManager::Al | 未分类 |
| 0.02 | main_thread | DualThreadAllocator<DynamicHeapAllocator>::Allocate(unsigned < MemoryManager::Al | 未分类 |
| 0.01 | main_thread | DualThreadAllocator<DynamicHeapAllocator>::Allocate(unsigned < MemoryManager::Al | 未分类 |
| 0.01 | main_thread | BucketAllocator::Reallocate(void*, unsigned long, int) < DualThreadAllocator<Dyn | 未分类 |
| 0.00 | job_worker | BucketAllocator::Reallocate(void*, unsigned long, int) < DualThreadAllocator<Dyn | 未分类 |
| 0.00 | render_thread | DualThreadAllocator<DynamicHeapAllocator>::Allocate(unsigned < MemoryManager::Al | 未分类 |
| 0.00 | job_worker | DualThreadAllocator<DynamicHeapAllocator>::Allocate(unsigned < MemoryManager::Al | 未分类 |

### 10.x `je_free` 反查（cur 0.30% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.17 | rhi_thread | BufferManagerGLES::AcquireBuffer(unsigned long, DataBufferGL < ConstantBuffersGL | RHI / GPU Instancing |
| 0.04 | rhi_thread | !!!0000!7f33d0bc81c9ba6ce29b813f4019b6!272cf717f5! < GfxDeviceWorker::RunCommand | 未分类 |
| 0.02 | render_thread | std::__ndk1::__tree<unsigned long long, std::__ndk1::less<un < TranscriptRenderi | URP / 命令缓冲 |
| 0.01 | rhi_thread | BufferManagerGLES::AcquireBuffer(unsigned long, DataBufferGL < GfxDeviceGLES::Be | 未分类 |
| 0.01 | rhi_thread | !!!0000!ae9df5840a3b187aa9f98544704c1f!272cf717f5! < !!!0000!d0051afa8fb0bb02a68 | 未分类 |
| 0.01 | rhi_thread | GfxDeviceWorker::RunCommand(ThreadedStreamBuffer&) < GfxDeviceWorker::RunExt(Thr | 未分类 |
| 0.01 | rhi_thread | BufferManagerGLES::AcquireBuffer(unsigned long, DataBufferGL < GfxDeviceGLES::Up | 未分类 |
| 0.01 | render_thread | TranscriptRenderingCommandBuffer::ExecuteCommandBuffer(Trans < TranscriptScripta | URP / 命令缓冲 |

### 10.x `GC_mark_from` 反查（cur 0.10% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.07 | main_thread | GC_mark_some < GC_stopped_mark < GC_try_to_collect_inner | 未分类 |
| 0.02 | main_thread | GC_mark_some < GC_collect_a_little_inner < GC_collect_a_little | 未分类 |
| 0.01 | main_thread | GC_mark_some < GC_stopped_mark < GC_collect_a_little_inner | 未分类 |

### 10.x `je_malloc` 反查（cur 0.10% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.05 | rhi_thread | malloc < operator new(unsigned long) < BufferManagerGLES::AdvanceFrame() | 未分类 |
| 0.02 | render_thread | malloc < operator new(unsigned long) < InstancingBatcher::BuildFrom(GpuProgramPa | RHI / GPU Instancing |
| 0.01 | main_thread | malloc < operator new(unsigned long) < UI::CanvasManager::AddDirtyRenderer(UI::C | 未分类 |
| 0.00 | choreographer | malloc < operator new(unsigned long) < std::__1::basic_string<char, std::__1::ch | 未分类 |
| 0.00 | rhi_thread | malloc < operator new(unsigned long) < android::RefBase::RefBase() | 未分类 |
| 0.00 | unidentified | malloc < libGVoice.so[+3dde98] < libGVoice.so[+40621c] | 未分类 |
| 0.00 | unidentified | malloc < operator new(unsigned long) < android::TransactionCompletedListener::on | 未分类 |
| 0.00 | rhi_thread | malloc < operator new(unsigned long) < std::__1::pair<std::__1::__hash_iterator< | 未分类 |

### 10.x `tlsf_memalign` 反查（cur 0.25% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.10 | main_thread | DynamicHeapAllocator::Allocate(unsigned long, int) < MemoryManager::Allocate(uns | URP / 命令缓冲 |
| 0.05 | main_thread | DynamicHeapAllocator::Allocate(unsigned long, int) < MemoryManager::Allocate(uns | URP / 命令缓冲 |
| 0.02 | main_thread | DynamicHeapAllocator::Allocate(unsigned long, int) < MemoryManager::Allocate(uns | 未分类 |
| 0.02 | render_thread | DynamicHeapAllocator::Allocate(unsigned long, int) < DynamicHeapAllocator::Reall | 未分类 |
| 0.02 | main_thread | DynamicHeapAllocator::Allocate(unsigned long, int) < MemoryManager::Allocate(uns | URP / 命令缓冲 |
| 0.01 | main_thread | DynamicHeapAllocator::Allocate(unsigned long, int) < MemoryManager::Allocate(uns | 未分类 |
| 0.01 | main_thread | DynamicHeapAllocator::Allocate(unsigned long, int) < MemoryManager::Allocate(uns | 未分类 |
| 0.01 | main_thread | DynamicHeapAllocator::Allocate(unsigned long, int) < DynamicHeapAllocator::Reall | 未分类 |

### 10.x `memmove` 反查（cur 0.03% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.01 | main_thread | MUIRendererBase_FreshVertexAttribute_TisVector3_tDCF05E21F63 < MUIRendererBase_S | MeshUI 顶点上传 |
| 0.00 | job_worker | ExecuteJobCopyData(ManagedJobData*, void (*)(void*, void*, v < ForwardJobForEach | 未分类 |
| 0.00 | render_thread | InstancingProps::NewConstant(ShaderLab::FastPropertyName, un < InstancingBatcher | RHI / GPU Instancing |
| 0.00 | audio_callback | libAkSoundEngine.so[+19b5d8] < libAkSoundEngine.so[+19b63c] < libAkSoundEngine.s | Wwise |
| 0.00 | rhi_thread | !!!0000!8c9f5a62f5a016bcd3b71c1e0c3a1d!272cf717f5! < !!!0000!f56be09eb88f8683312 | 未分类 |
| 0.00 | rhi_thread | !!!0000!e9a0267a4c3f12c4fb16e257d3a26e!272cf717f5! < !!!0000!9c0715a0352375a9ec2 | 未分类 |
| 0.00 | render_thread | GfxDeviceClient::SetShaderPropertiesCopied(ShaderPropertyShe < InstancingBatcher | RHI / GPU Instancing |
| 0.00 | render_thread | GfxDeviceClient::SetShaderPropertiesCopied(ShaderPropertyShe < InstancingBatcher | RHI / GPU Instancing |

### 10.x `il2cpp::vm::Object::NewAllocSpecific` 反查（cur 0.09% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.03 | main_thread | il2cpp::icalls::mscorlib::System::Runtime::InteropServices:: < SafeBuffer_Read_T | 未分类 |
| 0.02 | main_thread | il2cpp::vm::Runtime::InvokeConvertArgs(MethodInfo const*, vo < il2cpp::icalls::m | 未分类 |
| 0.01 | main_thread | MUIEventManager_IsScreenPositionOverUGUI_mE15DD4CAE4CAE9965C < MUIEventManager_O | 未分类 |
| 0.01 | main_thread | SdfFontManager_OnUpdate_m084571798FC9A26BC2CF18902ED24457DBD < FrameworkCore_OnU | 未分类 |
| 0.01 | main_thread | GUILayoutUtility_Begin_m6876A33199599688408A4AD364069090E833 < RuntimeInvoker_Fa | 未分类 |
| 0.01 | main_thread | il2cpp::vm::Object::Box(Il2CppClass*, void*) < U3CU3Ec__DisplayClass3_0_U3CgenFi | 未分类 |
| 0.00 | main_thread | ConcurrentDictionary_2_GetValues_m56101D84A36D41B9E12027BF8C < PocoManager_Updat | 未分类 |
| 0.00 | main_thread | il2cpp::vm::Object::Box(Il2CppClass*, void*) < AutoDisposeList_1_GetEnumerator_m | C# 迭代器 |

### 10.x `ThreadsafeLinearAllocator::Allocate` 反查（cur 0.40% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.12 | render_thread | MemoryManager::Allocate(unsigned long, unsigned long, MemLab < GfxDeviceClient:: | RHI / GPU Instancing |
| 0.06 | main_thread | MemoryManager::Allocate(unsigned long, unsigned long, MemLab < TranscriptScripta | URP / 命令缓冲 |
| 0.06 | render_thread | MemoryManager::Allocate(unsigned long, unsigned long, MemLab < void InstancingBa | RHI / GPU Instancing |
| 0.04 | main_thread | MemoryManager::Allocate(unsigned long, unsigned long, MemLab < TranscriptRenderi | URP / 命令缓冲 |
| 0.03 | render_thread | MemoryManager::Allocate(unsigned long, unsigned long, MemLab < MemoryManager::Re | 未分类 |
| 0.03 | render_thread | MemoryManager::Allocate(unsigned long, unsigned long, MemLab < TranscriptRenderi | URP / 命令缓冲 |
| 0.02 | main_thread | MemoryManager::Allocate(unsigned long, unsigned long, MemLab < AllocatorManager_ | 未分类 |
| 0.02 | job_worker | MemoryManager::Allocate(unsigned long, unsigned long, MemLab < TrackOverflowStac | 未分类 |

### 10.x `tlsf_free` 反查（cur 0.14% global）

| global% | 线程 | caller 链 | 业务模块 |
|---|---|---|---|
| 0.06 | main_thread | DynamicHeapAllocator::Deallocate(void*) < DualThreadAllocator<DynamicHeapAllocat | 未分类 |
| 0.05 | main_thread | DynamicHeapAllocator::Deallocate(void*) < DualThreadAllocator<DynamicHeapAllocat | 未分类 |
| 0.02 | main_thread | DynamicHeapAllocator::Deallocate(void*) < DualThreadAllocator<DynamicHeapAllocat | 未分类 |
| 0.01 | render_thread | DynamicHeapAllocator::Deallocate(void*) < DynamicHeapAllocator::Reallocate(void* | 未分类 |
| 0.01 | render_thread | DynamicHeapAllocator::Deallocate(void*) < DualThreadAllocator<DynamicHeapAllocat | 未分类 |

## §11 本源能力边界

| 想回答的问题 | simpleperf 能/否 | 替代源 |
|---|---|---|
| 帧级耗时（哪帧卡）| ❌ | Unity Profiler |
| 主线程在算 vs 在等 | ❌ | perfetto sched |
| Wwise 内部事件级归因 | ❌ | Wwise Profiler |
| native 中间件真实 CPU 占用 | ✅ | — |
| 运行时函数反查到业务模块 | ✅ | — |

