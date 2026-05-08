# CLAUDE.md - 项目指引

## 环境信息

- **操作系统**: Windows（Git Bash / MSYS2 终端）
- **Node.js**: v20，路径使用 Windows 格式（`K:\...`）
- **工作目录**: `/k/AI/PerfAnalysisTool_Codebuddy`

## Bash 命令注意事项

1. **不要使用 `/dev/stdin`**：Windows 没有此文件，管道输出不能用 `node -e "readFileSync('/dev/stdin')"`。改用 `| head -N` 截取或写到项目内临时文件
2. **不要使用 `/tmp`**：Windows 没有此目录。临时文件放到项目目录内（如 `.claude/skills/unity-profiler-analysis/output/`）
3. **node require 相对路径**：`node -e` 的 cwd 是启动目录而非脚本所在目录。要么用绝对路径，要么先 `cd` 到目标目录再执行
4. **Write 工具**：写入已有文件前必须先 Read 一次，否则会被工具拒绝
