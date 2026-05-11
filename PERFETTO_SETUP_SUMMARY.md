# Perfetto Trace Analysis Setup Summary

## Project Overview
**Project**: PerfAnalysisTool_Codebuddy  
**Location**: `K:\AI\PerfAnalysisTool_Codebuddy\`  
**Purpose**: Performance Analysis Tool for Android Unity games with Perfetto trace support

---

## 1. Trace Processor Binary Location

### ✅ Found: trace_processor_shell.exe

**Path**: `./tools/trace_processor_shell.exe`  
**Size**: 10.2 KB  
**Type**: Windows executable  
**Status**: Available in project

---

## 2. Perfetto Pip Package Setup

### 📦 Dependency Source

**Python Module**: `perfetto.trace_processor`

**Import Location** (in preprocess.py):
```python
from perfetto.trace_processor import TraceProcessor
```

**Installation Method**: Via pip package `perfetto-tools`

```bash
pip install perfetto-tools
```

### No requirements.txt File Found

**Important**: The project does NOT have a `requirements.txt` file in the root directory.  
The perfetto dependency is documented in code but not in a traditional requirements file.

---

## 3. Setup Scripts & Installation

### Main Preprocessing Script

**Path**: `./.claude/skills/perfetto-trace-analysis/scripts/preprocess.py`

**Purpose**: 
- Extracts system-level performance data from .pftrace files
- Analyzes CPU scheduling, frequency, threading, and GPU load
- Generates structured JSON output for Claude analysis

**Usage**:
```bash
python preprocess.py --input <file.pftrace> --target-fps <fps> --output-dir ./output/perfetto
```

**Command-line Arguments**:
- `--input` (required): Path to .pftrace file
- `--target-fps` (optional): Target FPS, default 30
- `--output-dir` (optional): Output directory, default `./output/perfetto`
- `--config` (optional): Custom config.json path
- `--query-frame` (optional): Query specific frame index

### Output Location

**Default Output**: `./output/perfetto/preprocess-result.json`

---

## 4. Configuration Files

### Main Config

**Path**: `./.claude/skills/perfetto-trace-analysis/config.json`

**Key Configuration Parameters**:
```json
{
  "targetFps": 30,
  "gameProcess": "com.tencent.aoeyz",
  "mainThread": { "name": "UnityMain" },
  "renderThread": { "name": "UnityGfxRenderS" },
  "jobWorker": {
    "namePatterns": ["Worker Thread", "Job.Worker"],
    "highUtilizationThreshold": 60,
    "lowUtilizationThreshold": 10
  },
  "gpu": {
    "utilizationHighThreshold": 80,
    "frequencyTrackNames": ["gpu_frequency", "gpufreq", "GPU Frequency"],
    "utilizationTrackNames": ["gpu_utilization", "GPU Utilization", "gpu_busy"]
  },
  "timeSegment": {
    "segmentCount": 3,
    "thermalDegradationThreshold": 0.85,
    "sustainedSlowFrames": 5,
    "sustainedSlowMultiplier": 1.5
  }
}
```

---

## 5. Perfetto Trace Analysis Skill Directory

### Directory Structure

```
.claude/skills/perfetto-trace-analysis/
├── README.md                              ← Skill documentation (comprehensive guide)
├── SKILL.md                               ← Claude execution flow & analysis procedure
├── config.json                            ← Analysis configuration
├── scripts/
│   └── preprocess.py                      ← Main data extraction script
└── references/
    └── perfetto-knowledge.md              ← Analysis knowledge base
```

### Documentation Files

#### README.md
- **Size**: ~8.5 KB
- **Content**: 
  - 8 analysis dimensions (A-H): Frame rate, CPU scheduling, frequency, threading, coordination, interference, GPU, temporal trends
  - Judgment criteria and thresholds
  - Comprehensive output report structure
  - Configuration reference

#### SKILL.md
- **Size**: ~11 KB
- **Content**:
  - When to trigger this skill
  - 4-step execution flow
  - Detailed analysis procedure for dimensions A-H
  - Output format template
  - Quality rules and self-check checklist

#### perfetto-knowledge.md
- **Location**: `./.claude/skills/perfetto-trace-analysis/references/perfetto-knowledge.md`
- **Purpose**: Deep knowledge base for complex analysis (ARM CPU architecture, scheduling, GPU, thermal detection)

---

## 6. Data Processing Pipeline

```
Input: .pftrace file
  ↓
Python: preprocess.py (uses perfetto.trace_processor)
  ├─ Queries: sched_slice, thread_state, cpufreq counter, PlayerLoop
  ├─ Analyzes: CPU scheduling, thermal throttling, thread coordination
  └─ Output: preprocess-result.json (structured data)
  ↓
Claude: Skill reads preprocess-result.json + knowledge base
  ├─ Performs 8-dimension analysis (A-H)
  ├─ Correlates data points
  └─ Generates report
  ↓
Output: perfetto-report_YYYYMMDDHHmmss.md
```

---

## 7. Critical Dependencies

### System Level

| Dependency | Purpose | Status |
|------------|---------|--------|
| Python 3.x | preprocess.py runtime | Required |
| perfetto-tools | TraceProcessor library | **Must be installed via pip** |
| trace_processor_shell.exe | Binary trace processor | ✅ Available |

### Python Dependencies (from preprocess.py)

```python
import argparse          # Standard library
import json             # Standard library
import os               # Standard library
import sys              # Standard library
import statistics       # Standard library
from pathlib import Path  # Standard library
from perfetto.trace_processor import TraceProcessor  # **Requires: pip install perfetto-tools**
```

### Installation Command

```bash
pip install perfetto-tools
```

---

## 8. Project Setup Notes

### Environment (from CLAUDE.md)

- **OS**: Windows (Git Bash / MSYS2)
- **Node.js**: v20
- **Root Directory**: `/k/AI/PerfAnalysisTool_Codebuddy`

### Important Path Notes

1. **No `/dev/stdin`** on Windows
2. **No `/tmp`** directory on Windows
3. Temporary files should be stored in `.claude/skills/perfetto-trace-analysis/output/`
4. Use absolute paths or proper cd handling for Node.js require statements

### Package Manager

**Frontend**: npm (Node.js based)  
**Backend/Scripts**: Python pip

---

## 9. Usage Workflow

### Step 1: Ensure Dependencies Installed

```bash
pip install perfetto-tools
```

### Step 2: Run Preprocessing

```bash
cd K:\AI\PerfAnalysisTool_Codebuddy
python .\.claude\skills\perfetto-trace-analysis\scripts\preprocess.py \
  --input <your-trace.pftrace> \
  --target-fps 30 \
  --output-dir ./output/perfetto
```

### Step 3: Trigger Claude Analysis

Upload `./output/perfetto/preprocess-result.json` to Claude or invoke the perfetto-trace-analysis skill.

### Step 4: Review Report

Output: `./output/perfetto/perfetto-report_YYYYMMDDHHmmss.md`

---

## 10. Verification Checklist

- [x] `trace_processor_shell.exe` found at `./tools/`
- [x] `preprocess.py` imports `from perfetto.trace_processor import TraceProcessor`
- [x] `config.json` exists and contains all analysis parameters
- [x] Skill documentation (README.md, SKILL.md) present
- [x] Knowledge base (perfetto-knowledge.md) available
- [ ] **TODO**: Run `pip install perfetto-tools` to install Python package
- [ ] **TODO**: Test preprocess.py with sample .pftrace file

---

## 11. Summary Table

| Component | Location | Status | Action Required |
|-----------|----------|--------|-----------------|
| trace_processor binary | `./tools/trace_processor_shell.exe` | ✅ Available | None |
| perfetto Python package | PyPI (via pip) | ❌ Not installed | `pip install perfetto-tools` |
| requirements.txt | N/A | ❌ Not found | Create if needed |
| preprocess script | `./.claude/skills/perfetto-trace-analysis/scripts/preprocess.py` | ✅ Available | Use for data extraction |
| config.json | `./.claude/skills/perfetto-trace-analysis/config.json` | ✅ Available | Customize as needed |
| Skill documentation | `./.claude/skills/perfetto-trace-analysis/SKILL.md` | ✅ Available | Reference for analysis |
| Knowledge base | `./.claude/skills/perfetto-trace-analysis/references/perfetto-knowledge.md` | ✅ Available | Reference for complex topics |

