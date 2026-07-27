#!/usr/bin/env bash
# R1 spike runner — runs codebuddy CLI N times with the same skeleton + prompt.
# Each attempt writes output to attempt_<N>/output.md.

set -u
SPIKE_DIR="$(cd "$(dirname "$0")" && pwd)"
SKELETON="$SPIKE_DIR/skeleton.md"
PROMPT_TEMPLATE="$SPIKE_DIR/prompt-template.txt"
N="${1:-5}"

if [[ ! -f "$SKELETON" ]]; then echo "ERR: skeleton not found: $SKELETON"; exit 1; fi
if [[ ! -f "$PROMPT_TEMPLATE" ]]; then echo "ERR: prompt template not found"; exit 1; fi

for i in $(seq 1 "$N"); do
  ATTEMPT_DIR="$SPIKE_DIR/attempt_$i"
  mkdir -p "$ATTEMPT_DIR"
  OUTPUT_PATH="$ATTEMPT_DIR/output.md"
  LOG_PATH="$ATTEMPT_DIR/run.log"
  cp "$SKELETON" "$OUTPUT_PATH"

  PROMPT="$(sed -e "s|{SKELETON_PATH}|$SKELETON|g" -e "s|{OUTPUT_PATH}|$OUTPUT_PATH|g" "$PROMPT_TEMPLATE")"

  echo "=== Attempt $i / $N ==="
  echo "  output: $OUTPUT_PATH"

  # stdin pipe to avoid Windows .cmd long-prompt truncation
  printf '%s' "$PROMPT" | codebuddy -p \
    --output-format text \
    -y --dangerously-skip-permissions \
    --allowedTools "Read,Write,Edit,Bash,Grep" \
    > "$LOG_PATH" 2>&1
  RC=$?
  echo "  rc=$RC log_size=$(stat -c %s "$LOG_PATH" 2>/dev/null || stat -f %z "$LOG_PATH") output_size=$(stat -c %s "$OUTPUT_PATH" 2>/dev/null || stat -f %z "$OUTPUT_PATH")"
done
echo
echo "All $N attempts done. Outputs under $SPIKE_DIR/attempt_*/output.md"
