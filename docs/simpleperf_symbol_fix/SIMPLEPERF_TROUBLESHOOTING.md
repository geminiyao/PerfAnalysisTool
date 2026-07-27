# simpleperf 火焰图采样事故复盘 (Postmortem)

> **日期**：2026-06-18 ~ 2026-06-19
> **耗时**：约 2 天定位 + 修复
> **影响**：aoeyz 项目用 simpleperf 采集到的火焰图调用栈完全错乱，无法用于性能分析
> **根因**：流水线产出的符号包 `.dbg.so` 文件，`.eh_frame` 区段被 strip 成 NOBITS，且文件名带 `.dbg` 后缀
> **状态**：已修复（应用层有绕过方案，流水线侧建议长期修复）

---

## 1. 问题背景

### 业务场景

aoeyz 项目（Unity + IL2CPP + xLua 架构）需要做性能分析，使用 Android NDK 自带的 simpleperf 工具采集火焰图。常规命令：

```bash
python app_profiler.py -p com.tencent.aoeyz \
    -r "-e cpu-cycles:u -f 1000 -g --duration 10" \
    -o perf.data \
    -lib ./symbols
python report_html.py
```

### 看到的现象

打开 `report.html`，UnityMain 线程的火焰图调用栈**严重异常**：

```
栈顶（应该看到）：               栈顶（实际看到）：
  __start_thread                   dummy::SuiteTLSModule_Dummy
  └─ __pthread_start                kUnitTestCategory::Test
     └─ ...                         key_GetPubKey_Return_
        └─ UnityPlayerLoop          CorrectKey_And_Raise_
           └─ PlayerLoop            NoError_ForValidKey::
              └─ ExecutePlayerLoop  RunImpl() const
                 └─ il2cpp::Runtime::Invoke    └─ il2cpp::Runtime::Invoke
                    └─ GameLauncher_Update        └─ GameLauncher_Update
                       └─ ... (业务代码)              └─ ... (业务代码)
```

调用栈下半段（`il2cpp::Runtime::Invoke` 以下到 PC 的部分）是**正确**的；上半段（应该到线程入口）被一个看起来像 unit-test 的奇怪符号截断。

许多 IL2CPP 函数也只显示 `libil2cpp.so[+offset]`、没有翻译成符号名。

### 用于对照的两份历史数据

| 文件 | 状态 | 说明 |
|---|---|---|
| `perf_battle_after.data` + `report_before.html` | ✅ 正常 | 旧 tmaoe 项目，调用栈展开到 `__start_thread` 完整层级 |
| 当前 `perf.data` + `report.html` | ❌ 异常 | aoeyz 项目，栈顶是 `dummy::...RunImpl` |

业务方一开始判断："旧的能用，新的不能用，问题应该是符号包发错版本"。

---

## 2. 排查过程：走过的弯路

下面按时间顺序记录五轮分析，**前四轮都是错误结论**，最后由业务方提供的对照实验把根因逼出来。

### 轮次 1（错）：怀疑符号包发错版本

**初步猜想**：`symbols/libunity.dbg.so` 是 development build，跟设备上跑的 release `libunity.so` 代码段排布不一样，导致符号查表错位，错误地把 release 中某条指令翻译成了 dev build 里的 unit-test 函数。

**佐证**（看起来很合理）：
- `dummy::SuiteTLSModule_DummykUnitTestCategory::Testkey_GetPubKey...::RunImpl` 这名字根本就是 unit test fixture 风格
- Unity 的 internal selftest module 名字就长这样

**被推翻的方式**：
```bash
readelf -n symbols/libunity.dbg.so   # build_id = 31a7ede0...
readelf -n binary_cache/.../libunity.so  # build_id = 31a7ede0...  完全一致
```
build_id 一致 = 代码字节级相同 = 同一次构建产出。结论被推翻。

**教训**：build_id 是代码内容指纹，符号包不可能"对不上"。

### 轮次 2（错）：怀疑 ICF / 函数折叠

**初步猜想**：`-fmerge-functions` / ICF (Identical Code Folding) 把多个内容相同的函数折叠到同一地址，simpleperf 从所有 alias 里挑了一个"最唬人"的名字显示。

**佐证**：
- nm -C 看到 `0xc7361c` 这个地址有 **6795 个不同 demangled 符号**指向它（确实是 ICF 折叠的析构函数）

**被推翻的方式**：
```bash
nm -C -S libunity.so | grep "Testkey_GetPubKey...RunImpl"
# 发现 dummy::SuiteTLSModule_Dummy 那个 RunImpl 单独占 0x28b8a0c..0x28b8e7c (size 0x470)
# 该地址只有这一个符号，没有 alias
```
所以这个函数**真的存在**且只有这一个符号，不是 ICF 的产物。

### 轮次 3（错）：怀疑 IL2CPP unwind 信息缺失

**初步猜想**：`il2cpp::vm::Runtime::Invoke` 调用 IL2CPP 生成的 C# 函数时，那段生成代码没有正确的 `.eh_frame`，DWARF unwinder 在这一帧无法继续往上展开。

**佐证**：
- 几乎所有"假栈顶 = dummy::RunImpl"的样本，往内层数第二帧 100% 是 `il2cpp::vm::Runtime::Invoke`（即栈在它的 caller 还原上断了）

**被推翻的方式**：
```bash
objdump --dwarf=frames libil2cpp.dbg.so | grep "Runtime::Invoke"
# 看到 FDE pc=0x2593fcc..0x2594090，CFI 完整保存 x19-x22, x29(fp), x30(lr)
```
`Runtime::Invoke` 的 .eh_frame 是好的，问题不在它身上。

### 轮次 4（错）：怀疑栈上 stale LR 误读

**初步猜想**：unwinder 找不到 `Runtime::Invoke` 的真正 caller 时，**误读了栈上某个旧的 LR 值** —— 这个值是 UnityMain 线程启动早期跑过 unit-test 时压栈遗留的 0x28b8abc，指向 dummy::RunImpl 内部的 BL 返回点。

**佐证**：
- 95% 的"假栈顶"样本精确命中**同一个虚拟地址 0x28b8ab8**
- 该地址反汇编是 `bl <UnitTest::MemoryOutStream::MemoryOutStream>`，刚好是某个 BL 调用之前的位置
- 用完全独立的 `--call-graph fp`（不读 .eh_frame，纯走 frame pointer chain）也得到了**同样**的假栈顶
- 两种独立 unwind 算法收敛到同一个错误地址 → 该地址确实存在于栈上某个槽位

**这一轮的结论解释了"为什么栈顶名字稳定一致"**，但**没回答**"为什么 tmaoe 老数据没这个问题"。

**被推翻的方式（关键转折，由用户提供）**：

业务方做了一个**绝佳的对照实验**：
- `perf_tmaoe_good.data`：tmaoe 项目，带 `-lib symbols_tmaoe`，栈正常
- `perf_tmaoe_bad.data`：**同一个 tmaoe APK、同一个手机、同一时刻**，不带 `-lib`，栈坏！
- 而且坏的现象跟 aoeyz 一模一样（同样的 `dummy::SuiteTLSModule_Dummy::RunImpl` 假栈顶）

这彻底**击破了**前四轮所有围绕"代码 / 符号 / unwind 算法"的猜测：
- 同一个 APK ➜ 排除"业务代码 / IL2CPP 版本"差异
- 同一个手机 ➜ 排除"ROM / 内核"差异
- 同一时刻 ➜ 排除时间相关因素
- **唯一的变量**就是 simpleperf 在采样时用的符号文件

---

## 3. 真正的根因（轮次 5，验证锁定）

### 关键发现

`symbols/libunity.dbg.so` 的 `.eh_frame` 区段被 strip 成了 **NOBITS**！

```bash
$ readelf -S symbols/libunity.dbg.so | grep eh_frame
[13] .eh_frame_hdr     NOBITS   ...   <无内容>
[14] .eh_frame         NOBITS   ...   <无内容>
```

而设备上 stripped 的 `libunity.so` 反而是 PROGBITS（有内容）：

```bash
$ readelf -S /data/app/.../libunity.so | grep eh_frame
[13] .eh_frame_hdr     PROGBITS  ...  size=0x7bb2c
[14] .eh_frame         PROGBITS  ...  size=0x2066ac
```

> **NOBITS** = ELF section header 里登记了这个区段，但**文件里没有任何字节**（节省体积，运行时按需 zero-fill）。
> **PROGBITS** = section 实际占用文件字节，里面有数据。

### 失败的完整链路

simpleperf 采样时做用户态 DWARF unwind 的步骤：

1. 内核 perf 采样：抓 PC + 一段用户栈（默认 64KB）
2. simpleperf 在用户态用 libunwindstack 展开栈，**读每一帧所属 .so 的 `.eh_frame`** 来计算 CFA 还原 LR
3. simpleperf 找 .so 的优先级：
   - **优先**：`--symfs` 指向的目录（即手机 `/data/local/tmp/native_libs/`，由 `app_profiler.py -lib` 推过去的 .dbg.so）
   - **次选**：设备实际加载路径（`/data/app/.../libunity.so`）
   - **匹配机制**：build_id 校验

> **关键陷阱**：build_id 只校验代码段内容，**不校验 `.eh_frame` 是否被掏空**。所以一个 `.text` 完整、`.eh_frame=NOBITS` 的 .dbg.so 也能通过 build_id 校验。

4. simpleperf 拿到这个 .dbg.so，读 `.eh_frame` → 读到空数据 → unwind 在 libunity / libil2cpp 内的所有帧上失败
5. 失败之后：在剩余栈数据里找一个"看起来像返回地址"的值（恰好是 0x28b8abc 这种 stale LR） → 当成"上层 caller" → 假栈顶呈现为 `dummy::RunImpl`

### `.eh_frame` 为什么会变成 NOBITS

最常见的成因是流水线用了 `objcopy --only-keep-debug`：

```bash
llvm-objcopy --only-keep-debug libunity.so libunity.dbg.so   # ← 罪魁祸首
```

这条命令的语义是"只保留调试信息"，它会把所有 ALLOC sections（运行时要加载到内存的，包括 `.text` / `.eh_frame` / `.eh_frame_hdr`）改成 NOBITS（空壳）—— 它的本意是"调试文件不需要重复保存代码段"，只保留 `.debug_*` 即可。

但它没考虑到：**simpleperf 的 user-stack DWARF unwind 偏偏需要 `.eh_frame`**，于是踩坑。

### 为什么 tmaoe 历史数据没问题

`symbols_tmaoe/libunity.dbg.so` 的 `.eh_frame` **也是 NOBITS** —— 但 tmaoe 流水线的 `libil2cpp.dbg.so` 的 `.eh_frame` 是 PROGBITS 完整的。tmaoe 的 UnityMain 热点路径主要在 IL2CPP 里，libunity 的 .eh_frame 缺失影响小，于是栈大致正常。

aoeyz 这次更严重，是因为 `symbols/libunity.dbg.so` 和 `symbols/libil2cpp.dbg.so` 都缺 .eh_frame，且 UnityMain 的真实热点函数（包括那个内置 unit-test 函数 RunImpl）就在 libunity 内，于是 unwind 一到 libunity 的帧就断。

### 最终对照表

| 数据 | 是否带 `-lib` | 设备 native_libs/ 状态 | UnityMain 走到 `__start_thread` 比例 | 假栈顶 dummy::RunImpl |
|---|---|---|---|---|
| tmaoe_good | symbols_tmaoe | 推了 tmaoe 的 .dbg.so | **65.3%** ✅ | 0 |
| tmaoe_bad | 无 | 残留 aoeyz 的 .dbg.so（build_id 不匹配则退到设备 .so） | 8.1% | 56.7% |
| aoeyz perf.data | symbols | 推了 aoeyz 的 .dbg.so | 3.8% | **62.2%** ❌ |
| **aoeyz_nolibs**（关键验证） | **无** | **删空** | **77.0%** ✅✅ | **0** |

最后这一行是决定性的：**清空手机 native_libs，aoeyz 同一个 APK 同一台手机，问题立刻消失**。

### 顺带发现的第二个 bug

修好 unwind 后又发现：报告里 libil2cpp 函数全部显示 `libil2cpp.so[+offset]` 而不是函数名。

排查 `binary_cache_builder.py` 的源码（第 79-115 行）发现：它用**文件名精确匹配**来挑 `-lib` 目录里的符号文件 —— 找的是 `libil2cpp.so`，但你的符号文件叫 `libil2cpp.dbg.so`，文件名不匹配，根本没尝试拷贝。

> 注意：采样阶段是按 build_id 匹配（不看文件名），所以 .dbg 后缀不是问题；但报告阶段是文件名匹配，.dbg 后缀就直接 fail。这是 simpleperf 工具内部的不一致。

---

## 4. 解决方案

### 方案 A：彻底修复（流水线侧，推荐报给打包同事）

两个独立 bug，都在生成 `.dbg.so` 的脚本里。

**A1. `.eh_frame` 必须是 PROGBITS**

把流水线里的：
```bash
llvm-objcopy --only-keep-debug libunity.so libunity.dbg.so      # ❌ 错
```

改为：
```bash
llvm-objcopy \
    --keep-section=.eh_frame \
    --keep-section=.eh_frame_hdr \
    --keep-section=.ARM.exidx \
    --keep-section=.ARM.extab \
    --only-keep-debug \
    libunity.so libunity.dbg.so                                  # ✅ 对
```

或者最保险 —— **直接保存 `-g` 编译链接出来未 strip 的版本**作为 .dbg.so（Unity 中可在 Player Settings → Create symbols.zip 选择 "Debugging" 级别得到这种文件）。

**A2. 文件名不要加 .dbg 后缀**

`libunity.dbg.so` 应该叫 `libunity.so`（放在 `symbols/arm64/` 这种独立目录里以避免与设备 .so 冲突），这样 `binary_cache_builder.py` 就能直接匹配。

**A3. 一行验收命令**

流水线产出后跑一下：
```bash
aarch64-linux-android-readelf -S libunity.dbg.so | grep eh_frame
```
- ✅ 正常：`.eh_frame    PROGBITS  ...  <非零 size>`
- ❌ 还坏：`.eh_frame    NOBITS    ...`

### 方案 B：应用侧绕过（已落地，立即可用）

在流水线修好之前的工作流。**思路**：
- **采样阶段**：不带 `-lib`，让 simpleperf 用设备 stripped .so 的完整 `.eh_frame` 做 unwind
- **报告阶段**：把 `.dbg.so` 重命名为 `.so` 后注入 binary_cache，让 `binary_cache_builder` 能匹配上做符号化

> 这个方案利用了 **`.eh_frame` 只在采样时需要、符号名只在报告时需要** 的事实，把两阶段所需文件分别处理。

详见下一节"采集 SOP"和 `profile.bat` 一键脚本。

---

## 5. 采集 SOP（标准操作流程）

### 一键脚本（推荐）

仓库根目录的 [`profile.bat`](./profile.bat) 已经把整个流程封装好。用法：

```bat
profile.bat <package_name> [duration_sec] [output_basename] [symbols_dir]

REM 例子：
profile.bat com.tencent.aoeyz                          REM 默认 10s 采样，符号目录 symbols/
profile.bat com.tencent.aoeyz 30                       REM 30s 采样
profile.bat com.tencent.aoeyz 10 perf_battle           REM 输出 perf_battle.data / .html
profile.bat com.tencent.aoeyz 10 perf_battle symbols_aoeyz       REM 用 symbols_aoeyz/ 而不是 symbols/
profile.bat com.tencent.tmaoe 10 perf_tmaoe symbols_tmaoe        REM 切换到 tmaoe 的符号包
profile.bat com.tencent.aoeyz 10 perf D:\some\other\symbols      REM 绝对路径也支持
```

第 4 个参数 `symbols_dir` 可选，**默认是 `symbols`**。支持：
- 相对路径（相对脚本所在目录）
- 绝对路径
- 该目录必须存在，否则脚本会明确报错

脚本会自动：
1. 把 `symbols/*.dbg.so` 重命名为 `*.so` 复制到 `symbols_renamed/`
2. **清空手机 `/data/local/tmp/native_libs/`**（关键步骤）
3. 录制（不带 `-lib`）
4. 用 `symbols_renamed/` 注入 binary_cache
5. 出 html 报告
6. **自检**：跑 `_selfcheck.py` 量化 UnityMain 栈顶分布，输出 `[OK] HEALTHY` / `[FAIL] BROKEN` 判定

### 手动操作流程（如果脚本失效，回退到手动）

```bash
# === STEP 0: 准备 symbols_renamed/（首次或符号包更新后做一次）===
mkdir symbols_renamed
for f in symbols/*.dbg.so; do
    base=$(basename "$f" .dbg.so)
    cp "$f" "symbols_renamed/$base.so"
done
cp symbols/*.so symbols_renamed/ 2>/dev/null  # 没 .dbg 后缀的也复制（注意去重）

# === STEP 1: 清掉手机上残留的 native_libs（极重要！）===
adb shell rm -rf /data/local/tmp/native_libs/

# === STEP 2: 录制（不带 -lib）===
python app_profiler.py -p com.tencent.aoeyz \
    -r "-e cpu-cycles:u -f 1000 -g --duration 10" \
    -o perf.data

# === STEP 3: 注入符号到 binary_cache（用 symbols_renamed/）===
python binary_cache_builder.py -i perf.data -lib ./symbols_renamed

# === STEP 4: 出报告 ===
python report_html.py -i perf.data -o report.html
```

### 自检 / 验证产出是否正确

打开 `*.html`，UnityMain 线程的栈顶应该是 `__start_thread`，**不应**该看到 `dummy::SuiteTLSModule_Dummy::...::RunImpl`。

或者命令行快速 check：

```bash
./bin/windows/x86_64/simpleperf.exe report-sample --show-callchain --symdir ./binary_cache -i perf.data -o samples.tmp 2>nul
python _selfcheck.py samples.tmp
```

期望输出：
```
[OK] HEALTHY: stacks unwound correctly to __start_thread
```

### 后续采集需要注意的几个坑

1. **永远先 `adb shell rm -rf /data/local/tmp/native_libs/`**。即使你这次录制不带 `-lib`，只要手机上之前有过这个目录，`app_profiler.py` 第 206 行的逻辑会自动加 `--symfs /data/local/tmp/native_libs/`，又把 simpleperf 引到坏的 .dbg.so 上去。这是最容易复发的"幽灵 bug"。`profile.bat` 已包含这一步。

2. **永远不要直接 `python app_profiler.py -lib symbols/`** —— 在流水线没修好之前，这条命令会把 `.eh_frame=NOBITS` 的 `.dbg.so` 推到手机上，污染所有后续的录制。

3. **应用换 build / 重新安装后**：build_id 会变。手机上 `/data/local/tmp/native_libs/` 里残留的 .dbg.so build_id 跟新版对不上时，simpleperf 退而求其次去用 stripped 设备 .so，这"反而"会让栈正常 —— 但容易让人误以为问题修了。所以**流程上每次都先清空 native_libs**，结果才稳定可控。

4. **`-lib` 在采样阶段唯一有用的场景**：当流水线产出的 `.dbg.so` 是带完整 `.eh_frame` 的（PROGBITS）时，`-lib` 可以让 simpleperf 在 unwind 阶段读到 `.debug_frame`（DWARF unwind 的另一份信息），覆盖率比 `.eh_frame` 还高一些。但只要流水线还在产 NOBITS，就只能"不带 -lib + 重命名后 report 阶段注入"。

---

## 6. 经验教训

### 关于诊断方法

1. **build_id 校验通过 ≠ 文件正确**。build_id 只看代码段（`.text` / `.rodata`），完全不知道 `.eh_frame` / `.symtab` / `.debug_*` 是否被掏空。后续遇到符号 / unwind 问题时，**永远先 `readelf -S` 确认相关 section 是 PROGBITS 而不是 NOBITS**。

2. **对照实验是定位问题的最强手段**。前四轮分析总共用了 100+ 个工具调用、几小时时间、走了 4 个错误方向。最后是用户提供的 "tmaoe 同 APK 同设备 + 有/无 -lib" 一组对照实验，1 分钟就把根因锁定方向。**遇到诡异问题时，第一时间应该想"我怎么构造一个最小对照实验"，而不是先扎进细节里**。

3. **当多个独立技术路径收敛到同一个错误现象时，问题大概率不在这些路径里**，而是在它们的"共同前提"中。我用 DWARF unwind 和 frame pointer unwind 两种独立算法都得到了相同的假栈顶，应该立刻警觉到"问题不在 unwind 算法"，而在它们共同读取的"栈数据来源"上 —— 但当时被假栈顶地址的精确一致性迷惑了，绕了一大圈。

4. **`call-graph fp` 是 unwind 故障的好对照工具**。fp 不依赖 `.eh_frame`，完全独立。当 dwarf 和 fp 都有同样问题时，问题不在 unwind；只有 dwarf 坏 fp 好时，才是 .eh_frame 的事。

### 关于工具链

1. **`objcopy --only-keep-debug` 不适合做性能分析符号包**。它的设计目标是 gdb 调试，gdb 不需要 `.eh_frame`（gdb 用 `.debug_frame`），但 simpleperf 需要。

2. **simpleperf 工具内部存在不一致**：采样阶段按 build_id 匹配 `.so`，但 `binary_cache_builder.py`（报告阶段）按文件名精确匹配。这两个机制脱节，导致 `.dbg.so` 后缀文件采样有效报告无效。

3. **`app_profiler.py` 的 `--symfs` 隐式开启**（只要 `/data/local/tmp/native_libs/` 存在）是一个隐藏的、文档没怎么说清楚的行为，是这次问题最大的"幽灵"放大器。

### 关于流水线

1. 符号包格式应该有**自动化验收**：CI / 流水线末尾跑一条 `readelf -S libxxx.dbg.so | grep eh_frame | grep -v NOBITS` 就能避免这次 2 天的人力成本。

2. **符号包发布前应该用 simpleperf 真采一次**，跑一遍自检脚本，作为入库准入条件。

---

## 附录 A：相关文件

```
simpleperf/
├── profile.bat                          # 一键采样脚本（绕过方案 B 的封装）
├── _selfcheck.py                        # 自检脚本，量化栈顶分布
├── SIMPLEPERF_TROUBLESHOOTING.md        # 本文档
├── symbols/                             # 流水线下载的符号包（.dbg.so 后缀，.eh_frame=NOBITS，目前是坏的）
├── symbols_renamed/                     # 由 profile.bat 自动生成（去掉 .dbg 后缀）
├── binary_cache/                        # 由 binary_cache_builder.py 生成
├── perf.data / report.html              # aoeyz 旧的坏数据，留作对照
├── perf_aoeyz_nolibs.data               # 关键验证：清空 native_libs 后采的，UnityMain → __start_thread 77%
├── report_aoeyz_fixed.html              # 上面那份数据生成的正常报告
├── perf_tmaoe_good.data                 # 业务方提供的对照：带 -lib，正常
├── perf_tmaoe_bad.data                  # 业务方提供的对照：不带 -lib（残留 native_libs），坏
└── perf_battle_after.data               # 历史 tmaoe 老数据，正常
```

## 附录 B：本次排查涉及的工具命令汇总

```bash
# 检查 .so 的 .eh_frame 是 PROGBITS 还是 NOBITS（最重要的一行）
aarch64-linux-android-readelf -S libxxx.so | grep eh_frame

# 看一个 .so 的 build_id
aarch64-linux-android-readelf -n libxxx.so | grep "Build ID"

# 看 perf.data 里期望的某个 .so 的 build_id
./bin/windows/x86_64/simpleperf.exe dump perf.data | grep -B1 "lib/arm64/libunity.so$" | grep build_id

# Dump 所有 sample 的完整 callchain（用于做栈顶分布统计）
./bin/windows/x86_64/simpleperf.exe report-sample --show-callchain \
    --symdir ./binary_cache -i perf.data -o samples.txt

# 看某个地址在所有符号里被多少 alias 覆盖（ICF 检测）
aarch64-linux-android-nm -C -S libxxx.so | awk '$1=="00000000028b8a0c" {print}'

# 反汇编某个地址范围
aarch64-linux-android-objdump -d --start-address=0x28b8a0c --stop-address=0x28b8e7c -C libxxx.so

# 看 .eh_frame 的 FDE 是否覆盖某个函数
aarch64-linux-android-objdump --dwarf=frames libxxx.so | grep -A2 "pc=0*2593fcc"

# 看手机 /data/local/tmp/native_libs/ 里残留了什么
adb shell ls -la /data/local/tmp/native_libs/
adb shell cat /data/local/tmp/native_libs/build_id_list

# 强制清理（每次采样前都该跑）
adb shell rm -rf /data/local/tmp/native_libs/
```
