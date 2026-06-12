# xLua 符号表不显示问题排查 Wiki 与解决方案

## 1. 问题背景

在使用 `simpleperf`、Perfetto 或 `report_html.py` 分析 Android native 性能时，`libxlua.so` 调用栈可能无法显示函数名，只显示模块名和地址，例如：

```text
libxlua.so + 0x123456
```

期望结果应是能显示 native 函数符号，例如：

```text
luaV_execute
xlua::...
```

这类问题通常不是 `simpleperf` 本身导致，而是用于符号化的 `.so` 文件与 APK 内实际运行的 `.so` 不匹配，或者 NoStrip `.so` 缺少必要符号表。

---

## 2. 典型现象

### 2.1 simpleperf 报告中函数名缺失

```text
libxlua.so
  0x0000000000123456
  0x0000000000456789
```

或者：

```text
libxlua.so+0x123456
```

### 2.2 `report_html.py` 无法解析 xLua native 调用栈

即使提供了本地 `.so`，报告中仍然只有模块名和地址。

### 2.3 NoStrip so 存在但符号化无效

例如项目中存在：

```text
Android/Libs/arm64-v8a/libxlua.so
Android/LibsNoStrip/arm64-v8a/libxlua.so
```

但 `LibsNoStrip` 中的 `libxlua.so` 仍无法正确符号化 APK 里的 `libxlua.so`。

---

## 3. 原因分析

xLua 符号不显示的本质原因通常是：**用于符号化的 NoStrip `libxlua.so` 与 APK 中实际运行的 `libxlua.so` 不匹配，或者 NoStrip 文件本身缺少必要符号信息**。

常见原因可以归纳为以下几类。

### 3.1 APK 内 so 与 stripped so 不一致

APK 中真正运行的是：

```text
apk!/lib/arm64-v8a/libxlua.so
```

本地用于对比的 stripped so 通常是：

```text
Android/Libs/arm64-v8a/libxlua.so
```

需要检查：

```text
SHA256(APK 内 libxlua.so) == SHA256(Android/Libs/arm64-v8a/libxlua.so)
```

如果不一致，说明 APK 打包时可能使用了另一份 so，或者本地拿错了产物目录。此时即使 NoStrip 文件存在，也不能保证能符号化当前 APK。

### 3.2 NoStrip so 与 APK 内 so 不是同一次 build

符号化依赖地址布局一致。即使源码相同，只要重新 build 过，函数地址也可能变化。

需要检查：

```text
Build ID(APK 内 libxlua.so) == Build ID(LibsNoStrip/arm64-v8a/libxlua.so)
```

如果 `Build ID` 不一致，基本可以判断当前 NoStrip so 不是这个 APK 对应的符号表，不建议继续用于 `simpleperf` 符号化。

### 3.3 NoStrip so 缺少必要符号表

NoStrip so 至少应包含：

```text
.symtab
```

最好还包含：

```text
.debug_info
.debug_line
```

| Section | 作用 |
|---|---|
| `.dynsym` | 动态导出符号，只能解析少量导出函数 |
| `.symtab` | 完整符号表，可解析本地 native 函数名 |
| `.debug_info` | DWARF 调试信息，可辅助源码级解析 |
| `.debug_line` | 行号信息，可映射到源码行 |

如果 NoStrip so 只有 `.dynsym`，没有 `.symtab`，通常只能看到少量导出符号，大量内部函数无法显示。

### 3.4 strip 参数或后处理流程不一致

理想情况下：

```text
strip(LibsNoStrip/arm64-v8a/libxlua.so) == APK 内 libxlua.so
```

也就是：

```bash
llvm-strip --strip-all LibsNoStrip/arm64-v8a/libxlua.so
```

得到的文件应与 APK 中的 `libxlua.so` 完全一致。

如果不一致，可能原因包括：

- strip 参数不同；
- APK 打包流程额外处理过 so；
- 保留 section 策略不同；
- 对齐方式不同；
- 本地 `LibsNoStrip` 和 APK 不是同一批产物。

如果 `Build ID` 一致但 strip 后字节不一致，一般可认为符号化大概率可用，但应标记为 `PASS_WITH_WARNING`。

### 3.5 Build ID 的作用与局限

`Build ID` 是 ELF 文件中的 note 信息，常见位置是：

```text
.note.gnu.build-id
```

查看方式：

```bash
llvm-readelf -n libxlua.so
```

输出示例：

```text
Build ID: 5392b654860709ab5ba2ee634c478f52fa3f3f14
```

Android NDK / clang / lld 构建出的 `.so` 通常会有 `Build ID`，但它不是 ELF 强制要求。如果链接时使用：

```text
-Wl,--build-id=none
```

则可能没有 `Build ID`。

`Build ID` 一致通常表示两个 `.so` 来自同一次链接产物，地址布局高度可信；`Build ID` 不一致则通常表示符号表不匹配，不建议继续用于符号化。


---

## 4. xLua 符号表校验 Skill

为避免手工解 APK、比对 SHA256、查看 Build ID 和检查 ELF section，当前项目已沉淀一个项目级 Skill：

```text
.codebuddy/skills/android-native-symbol-check/
```

它的目标是回答一个问题：

```text
这份 NoStrip libxlua.so 是否能用于当前 APK 中 libxlua.so 的符号化？
```

Skill 包含：

```text
.codebuddy/skills/android-native-symbol-check/SKILL.md
.codebuddy/skills/android-native-symbol-check/README.md
.codebuddy/skills/android-native-symbol-check/scripts/check_android_so_symbols.py
```

### 4.1 输入与自动推导

核心输入只需要三个文件：

```text
1. APK
2. stripped libxlua.so
3. NoStrip libxlua.so
```

典型路径：

```text
APK:
C:\path\game.apk

stripped so:
G:\...\Android\Libs\arm64-v8a\libxlua.so

NoStrip so:
G:\...\Android\LibsNoStrip\arm64-v8a\libxlua.so
```

工具会从 `stripped so` 或 `NoStrip so` 路径自动推导：

```text
abi     = arm64-v8a
so-name = libxlua.so
apk-so  = lib/arm64-v8a/libxlua.so
```

如果路径中没有 `arm64-v8a`、`armeabi-v7a`、`x86`、`x86_64`，需要额外指定 `--abi` 或 `--apk-so`。

### 4.2 自然语言使用方式

可以直接用自然语言描述路径：

```text
当前 apk 在 C:\path\game.apk，strip so 在 G:\symbols\Libs\arm64-v8a\libxlua.so，no strip so 在 G:\symbols\LibsNoStrip\arm64-v8a\libxlua.so，帮我校验符号表是否可用。
```

CodeBuddy 会自动映射为：

```text
--apk C:\path\game.apk
--stripped-so G:\symbols\Libs\arm64-v8a\libxlua.so
--nostrip-so G:\symbols\LibsNoStrip\arm64-v8a\libxlua.so
```

如果本机找不到 `llvm-readelf` 或 `llvm-strip`，可以补充：

```text
NDK 在 D:\Android\android-ndk-r21e-windows-x86_64
```

对应参数：

```text
--ndk D:\Android\android-ndk-r21e-windows-x86_64
```

### 4.3 脚本使用方式

最简命令：

```powershell
python .codebuddy\skills\android-native-symbol-check\scripts\check_android_so_symbols.py `
  --apk "C:\path\game.apk" `
  --stripped-so "G:\symbols\Libs\arm64-v8a\libxlua.so" `
  --nostrip-so "G:\symbols\LibsNoStrip\arm64-v8a\libxlua.so"
```

指定 Android NDK：

```powershell
python .codebuddy\skills\android-native-symbol-check\scripts\check_android_so_symbols.py `
  --apk "C:\path\game.apk" `
  --stripped-so "G:\symbols\Libs\arm64-v8a\libxlua.so" `
  --nostrip-so "G:\symbols\LibsNoStrip\arm64-v8a\libxlua.so" `
  --ndk "D:\Android\android-ndk-r21e-windows-x86_64"
```

无法从路径推导 ABI 时：

```powershell
python .codebuddy\skills\android-native-symbol-check\scripts\check_android_so_symbols.py `
  --apk "C:\path\game.apk" `
  --stripped-so "G:\symbols\libxlua.so" `
  --nostrip-so "G:\symbols-nostrip\libxlua.so" `
  --abi "arm64-v8a"
```

APK 内 so 路径特殊时：

```powershell
python .codebuddy\skills\android-native-symbol-check\scripts\check_android_so_symbols.py `
  --apk "C:\path\game.apk" `
  --apk-so "lib/arm64-v8a/libxlua.so" `
  --stripped-so "G:\symbols\libxlua.so" `
  --nostrip-so "G:\symbols-nostrip\libxlua.so"
```

### 4.4 校验内容

脚本会自动执行以下校验：

```text
1. 从 APK 解出 lib/<abi>/libxlua.so
2. 计算 APK 内 so、stripped so、NoStrip so 的 SHA256
3. 读取三个 so 的 Build ID
4. 检查 NoStrip so 是否包含 .symtab
5. 检查 NoStrip so 是否包含 .debug_info / .debug_line
6. 对 NoStrip so 执行 llvm-strip --strip-all
7. 比较 strip(NoStrip so) 是否等于 APK 内 so / stripped so
8. 输出 PASS / PASS_WITH_WARNING / FAIL
```

关键匹配条件：

```text
SHA256(APK so) == SHA256(stripped so)
Build ID(APK so) == Build ID(NoStrip so)
SHA256(strip(NoStrip so)) == SHA256(APK so)
NoStrip so has .symtab
```

### 4.5 判定标准

| 结果 | 含义 | 处理建议 |
|---|---|---|
| `PASS` | APK so、stripped so、NoStrip so 强匹配，且 NoStrip 有 `.symtab` | 可以用于 `simpleperf` / Perfetto / `addr2line` 符号化 |
| `PASS_WITH_WARNING` | Build ID 一致且有 `.symtab`，但 strip 反向校验不完全一致或被跳过 | 大概率可用，但建议确认 strip 参数、NDK 工具和 APK 打包流程 |
| `FAIL` | Build ID 不一致、NoStrip 缺少 `.symtab`，或 stripped so 与 APK so 不匹配 | 不建议使用，应重新获取与 APK 同 build 的 NoStrip 产物 |

### 4.6 输出示例

```text
========== Android Native Symbol Check ==========

[Input]
apk         : C:\path\game.apk
apk_so      : lib/arm64-v8a/libxlua.so
stripped_so : G:\symbols\Libs\arm64-v8a\libxlua.so
nostrip_so  : G:\symbols\LibsNoStrip\arm64-v8a\libxlua.so
abi         : arm64-v8a
so_name     : libxlua.so

[Checks]
APK SO SHA256 == Stripped SO SHA256            : PASS
APK SO Build ID == NoStrip SO Build ID         : PASS
strip(NoStrip SO) SHA256 == APK SO SHA256      : PASS
NoStrip SO has .symtab                         : PASS
NoStrip SO has .debug_info                     : PASS
NoStrip SO has .debug_line                     : PASS

[Final]
PASS: NoStrip SO matches the APK SO and contains usable symbols
```

### 4.7 推荐解决流程与归档规范

解决 xLua 符号不显示时，建议按以下顺序处理：

```text
1. 找到当前 APK 对应的 Android/Libs/<abi>/libxlua.so
2. 找到同一次构建产物中的 Android/LibsNoStrip/<abi>/libxlua.so
3. 使用 android-native-symbol-check Skill 校验
4. 只有输出 PASS 或明确接受 PASS_WITH_WARNING 时，才将 NoStrip so 用于 simpleperf 符号化
5. 如果输出 FAIL，重新获取与 APK 同 build 的 LibsNoStrip 产物
```

为避免后续再次出现符号表不显示问题，建议构建产物归档时同时保存：

```text
1. APK
2. Android/Libs/<abi>/libxlua.so
3. Android/LibsNoStrip/<abi>/libxlua.so
4. 构建号 / changelist / commit id
5. Android NDK 版本
```

推荐归档结构：

```text
build-<version>/
  app.apk
  symbols/
    Libs/
      arm64-v8a/
        libxlua.so
    LibsNoStrip/
      arm64-v8a/
        libxlua.so
  build-info.txt
```

---

## 5. 总结

xLua 符号不显示通常不是 `simpleperf` 本身的问题，而是符号文件与 APK 内 `.so` 不匹配，或者 NoStrip `.so` 缺少 `.symtab`。

最终判断应以以下条件为准：

```text
APK 内 so 与 stripped so 一致
NoStrip so 与 APK 内 so Build ID 一致
NoStrip so 包含 .symtab
strip(NoStrip so) 后与 APK 内 so 一致
```

只有满足这些条件，`libxlua.so` 的 native 函数符号才可以可靠显示。

