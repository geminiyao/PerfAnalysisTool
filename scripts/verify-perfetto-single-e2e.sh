#!/usr/bin/env bash
# verify-perfetto-single-e2e.sh
# 在新 session 中验证 perfetto 单次形态 e2e（骨架 → LLM 填空 → 质量门）
# 用法：bash scripts/verify-perfetto-single-e2e.sh

set -e
cd "$(dirname "$0")/.." 2>/dev/null || cd /k/AI/PerfAnalysisTool_Codebuddy

OUT_DIR="docs/report/_intermediate/e2e_sprint7_single"
SKEL="$OUT_DIR/skeleton.md"
PROMPT="$OUT_DIR/prompt.txt"
REPORT="$OUT_DIR/run1.md"
LOG="$OUT_DIR/run1.log"
QUALITY="$OUT_DIR/quality.json"

if [[ ! -f "$SKEL" ]]; then
  echo "[ERR] skeleton 不存在，先在仓库根跑过 Sprint 1-7 才有这个文件: $SKEL"
  exit 1
fi
if [[ ! -f "$PROMPT" ]]; then
  echo "[ERR] prompt 不存在: $PROMPT"
  exit 1
fi

echo "=== Step 1/3: 重置 run1.md = 骨架 ==="
cp "$SKEL" "$REPORT"
echo "  $REPORT  ($(wc -l < "$REPORT") 行, $(grep -c LLM_FILL "$REPORT") 个 LLM_FILL)"

echo "=== Step 2/3: 跑 codebuddy（~10 分钟）==="
START=$(date +%s)
codebuddy -p \
  --output-format text \
  -y --dangerously-skip-permissions \
  --allowedTools "Read,Write,Edit,Bash,Grep" \
  < "$PROMPT" \
  > "$LOG" 2>&1
RC=$?
ELAPSED=$(($(date +%s) - START))
echo "  codebuddy rc=$RC  耗时 ${ELAPSED}s"
echo "  报告 $(wc -l < "$REPORT") 行  LLM_FILL 残留 $(grep -c LLM_FILL "$REPORT")"

if [[ $RC -ne 0 ]]; then
  echo "[FAIL] codebuddy 退出码非 0，看日志: $LOG"
  tail -30 "$LOG"
  exit 2
fi

echo "=== Step 3/3: 跑质量门 validate ==="
PYTHONIOENCODING=utf-8 python scripts/validate_perfetto_report.py \
  --report "$REPORT" \
  --skeleton "$SKEL" \
  --quality-out "$QUALITY"
VRC=$?

echo
echo "=== 验证完成 ==="
echo "  报告: $REPORT"
echo "  日志: $LOG"
echo "  质量门 JSON: $QUALITY"
echo "  validate rc=$VRC （0=PASS / 1=有 warn / 2=hard-fail）"

if [[ $VRC -eq 0 || $VRC -eq 1 ]]; then
  TIER=$(python -c "import json; print(json.load(open('$QUALITY')).get('tier','?'))" 2>/dev/null)
  echo "  ✅ 单次 e2e PASS  Tier=$TIER"
else
  echo "  ❌ 单次 e2e FAIL"
  exit 3
fi
