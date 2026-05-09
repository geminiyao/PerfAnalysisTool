/**
 * score-report.ts — 自动化性能分析报告评分脚本
 *
 * 用法:
 *   npx tsx score-report.ts --report <report.md> --baseline <preprocess-result.json> [--output <dir>]
 *
 * 自动评分维度 (7/11):
 *   A1 概览数据正确性、A3 数值引用准确、A4 mustReport覆盖率
 *   B3 判定依据透明度、B4 不确定标注
 *   C2 优先级合理性、C3 报告结构完整性
 *
 * 半自动维度 (需人工/LLM, 4/11):
 *   A2 调用链完整性、B1 瓶颈定位、B2 根因深度、C1 建议可执行性
 */

import * as fs from "fs";
import * as path from "path";

// ─── CLI 参数解析 ─────────────────────────────────────────
interface Args {
  report: string;
  baseline: string;
  output: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let report = "",
    baseline = "",
    output = "./output";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--report" && args[i + 1]) report = args[++i];
    else if (args[i] === "--baseline" && args[i + 1]) baseline = args[++i];
    else if (args[i] === "--output" && args[i + 1]) output = args[++i];
  }
  if (!report || !baseline) {
    console.error(
      "Usage: npx tsx score-report.ts --report <report.md> --baseline <preprocess-result.json> [--output <dir>]"
    );
    process.exit(1);
  }
  return { report, baseline, output };
}

// ─── 数据类型 ─────────────────────────────────────────────
interface FrameSummary {
  count: number;
  actualFps: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  q1: number;
  q3: number;
  worstFrameIndex: number;
  medianFrameIndex: number;
  jankCount: number;
  bigJankCount: number;
}

interface Marker {
  name: string;
  msSelfMean: number;
  msSelfMax: number;
  msTotalMean: number;
  percentOfFrame: number;
  count: number;
  callsPerFrame: number;
  presentOnFrameCount: number;
  spikeRatio: number;
  mustReport: boolean;
  mustReportReason: string;
  callChain: string;
  thread: string;
}

interface JankFrame {
  frameIndex: number;
  totalMs: number;
  category: string;
  jankMultiplier: number;
  hotPath: string;
  mustReport: boolean;
  callTreeSummary: string;
}

interface MarkerSpike {
  name: string;
  msSelfMean: number;
  msSelfMedian: number;
  msSelfMax: number;
  msSelfP95: number;
  spikeRatio: number;
  spikeFrameCount: number;
  totalFrameCount: number;
}

interface BaselineData {
  frameSummary: FrameSummary;
  markers: Marker[];
  jankFrames: JankFrame[];
  markerSpikes: MarkerSpike[];
}

interface ScoreItem {
  score: number | null;
  maxScore: 100;
  detail: string;
  autoScored: boolean;
}

interface ScoreResult {
  scores: Record<string, ScoreItem>;
  categoryScores: { A: number; B: number; C: number };
  autoTotal: number;
  manualItems: string[];
  finalScore: number | null;
  timestamp: string;
}

// ─── 报告解析工具 ───────────────────────────────────────────
function extractOverviewTable(report: string): Record<string, string> {
  const result: Record<string, string> = {};
  // 匹配 "| 指标 | 数值 |" 格式的表格
  const tableMatch = report.match(
    /##\s*一、概览[\s\S]*?\|[^\n]*指标[^\n]*\|[^\n]*\n\|[-|\s]*\n([\s\S]*?)(?=\n##|\n$)/
  );
  if (!tableMatch) return result;

  const rows = tableMatch[1].trim().split("\n");
  for (const row of rows) {
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length >= 2) {
      result[cells[0]] = cells[1];
    }
  }
  return result;
}

function extractAllNumbers(text: string): number[] {
  // 提取所有浮点数（排除日期、版本号等）
  const matches = text.match(/(?<!\d[./\-])\b\d+\.?\d*\b(?![./\-]\d)/g) || [];
  return matches.map(Number).filter((n) => !isNaN(n) && n < 1000000);
}

function extractMentionedMarkers(report: string): string[] {
  // 提取报告中提到的所有 marker 名称（反引号包裹的标识符）
  const matches = report.match(/`([A-Za-z][A-Za-z0-9._:!*\[\] ]*)`/g) || [];
  return matches.map((m) => m.replace(/`/g, ""));
}

function extractHeadings(report: string): string[] {
  const matches = report.match(/^#{1,3}\s+.+$/gm) || [];
  return matches.map((h) => h.replace(/^#+\s+/, ""));
}

function extractP0Markers(report: string): string[] {
  // 从 P0 建议中提取目标 marker — 支持多种格式
  const p0Section = report.match(
    /###\s*P0[:\s][\s\S]*?(?=###\s*P[12]|##\s*[七八]|$)/g
  );
  if (!p0Section) return [];
  const markers: string[] = [];
  for (const section of p0Section) {
    // 匹配 "目标 Marker: `xxx`" 或 "**目标 Marker**: `xxx`、`yyy`"
    const targetMatch = section.match(
      /(?:目标|Target)\s*(?:Marker|标记)[：:*]*\s*[`]*([^`\n]+)[`]*/i
    );
    if (targetMatch) {
      markers.push(
        ...targetMatch[1].split(/[、,]/).map((s) => s.trim().replace(/`/g, ""))
      );
    }
    // 也检查标题中的 marker 名
    const titleMatch = section.match(/###\s*P0[:\s]+(.+)/);
    if (titleMatch) {
      const backtickMarkers = titleMatch[1].match(/`([^`]+)`/g);
      if (backtickMarkers) {
        markers.push(...backtickMarkers.map((m) => m.replace(/`/g, "")));
      }
    }
    // 提取所有反引号中的 marker 名 (在P0段内出现的)
    const allBacktick = section.match(/`([A-Za-z][\w.]*(?:\.\w+)+)`/g) || [];
    for (const m of allBacktick) {
      const name = m.replace(/`/g, "");
      if (!markers.includes(name) && name.includes(".")) {
        markers.push(name);
        if (markers.length >= 5) break;
      }
    }
  }
  return [...new Set(markers)].slice(0, 10);
}

function hasSpeculativeWithoutTag(text: string): {
  total: number;
  untagged: number;
  examples: string[];
} {
  // 只检测明确的推测性语句模式，排除常见的确定性用法
  const speculativeWords = [
    "可能是由",
    "可能是因为",
    "可能由于",
    "或许是",
    "猜测",
    "推测是",
    "应该是因为",
    "大概率是",
    "疑似",
    "也许是",
  ];
  const lines = text.split("\n");
  let total = 0;
  let untagged = 0;
  const examples: string[] = [];

  for (const line of lines) {
    for (const word of speculativeWords) {
      if (line.includes(word)) {
        total++;
        if (!line.includes("[推断]") && !line.includes("推断")) {
          untagged++;
          if (examples.length < 3) {
            examples.push(
              line.trim().substring(0, 80) + (line.trim().length > 80 ? "..." : "")
            );
          }
        }
        break; // 一行只计一次
      }
    }
  }
  return { total, untagged, examples };
}

function checkJudgmentEvidence(report: string): {
  total: number;
  withEvidence: number;
} {
  // 检查"判定依据"相关段落是否包含数字
  const judgmentSections =
    report.match(
      /(?:判定依据|判定标准|判定为|被判定|之所以)[\s\S]{0,500}/g
    ) || [];
  // 也检查热点分析中每个条目是否有数字
  const hotspotEntries =
    report.match(/###\s*热点\s*#\d+[\s\S]*?(?=###|##|$)/g) || [];

  let total = hotspotEntries.length + judgmentSections.length;
  let withEvidence = 0;

  for (const section of [...judgmentSections, ...hotspotEntries]) {
    // 含数字即认为有证据
    if (/\d+\.?\d*\s*ms|\d+\.?\d*%|\d+\/\d+/.test(section)) {
      withEvidence++;
    }
  }

  // 去重（判定依据段落本身可能在热点中）
  if (total === 0) total = 1;
  return { total: Math.max(total, 1), withEvidence };
}

// ─── 评分函数 ─────────────────────────────────────────────

function scoreA1(
  report: string,
  baseline: BaselineData
): ScoreItem {
  const table = extractOverviewTable(report);
  const fs = baseline.frameSummary;

  const fieldMap: Record<string, number> = {
    总帧数: fs.count,
    目标帧率: 30,
    实际平均帧率: fs.actualFps,
    平均帧耗时: fs.mean,
    中位数帧耗时: fs.median,
    Jank: fs.jankCount,
    BigJank: fs.bigJankCount,
  };

  let matched = 0;
  let total = 0;
  const errors: string[] = [];

  for (const [key, expected] of Object.entries(fieldMap)) {
    total++;
    // 在表格中找包含该关键词的行
    const tableKey = Object.keys(table).find((k) => k.includes(key));
    if (!tableKey) {
      errors.push(`缺失: ${key}`);
      continue;
    }
    const value = parseFloat(table[tableKey].replace(/[^0-9.]/g, ""));
    if (Math.abs(value - expected) / Math.max(expected, 1) < 0.02) {
      matched++;
    } else {
      errors.push(`${key}: 期望${expected}, 实际${value}`);
    }
  }

  // 检查最差帧
  total++;
  const worstKey = Object.keys(table).find((k) => k.includes("最差帧"));
  if (worstKey) {
    const worstText = table[worstKey];
    if (
      worstText.includes(String(fs.worstFrameIndex)) &&
      worstText.includes(String(fs.max).substring(0, 4))
    ) {
      matched++;
    } else {
      errors.push(
        `最差帧: 期望#${fs.worstFrameIndex}(${fs.max}ms)`
      );
    }
  } else {
    errors.push("缺失: 最差帧");
  }

  const ratio = matched / total;
  let score: number;
  if (ratio >= 1.0) score = 100;
  else if (ratio >= 0.9) score = 75;
  else if (ratio >= 0.6) score = 50;
  else if (ratio >= 0.4) score = 25;
  else score = 0;

  return {
    score,
    maxScore: 100,
    detail: `${matched}/${total} 字段正确${errors.length > 0 ? "。错误: " + errors.join("; ") : ""}`,
    autoScored: true,
  };
}

function scoreA3(
  report: string,
  baseline: BaselineData
): ScoreItem {
  // 收集源数据中的关键数值
  const sourceNumbers = new Set<number>();
  const fs = baseline.frameSummary;

  // frameSummary 数值
  Object.values(fs).forEach((v) => {
    if (typeof v === "number") sourceNumbers.add(v);
  });

  // markers 数值 (top 30)
  baseline.markers.slice(0, 30).forEach((m) => {
    sourceNumbers.add(m.msSelfMean);
    sourceNumbers.add(m.msSelfMax);
    sourceNumbers.add(m.percentOfFrame);
    sourceNumbers.add(m.presentOnFrameCount);
    sourceNumbers.add(m.spikeRatio);
    sourceNumbers.add(m.callsPerFrame);
  });

  // jankFrames 数值
  baseline.jankFrames.forEach((j) => {
    sourceNumbers.add(j.frameIndex);
    sourceNumbers.add(j.totalMs);
    sourceNumbers.add(j.jankMultiplier);
  });

  // 从报告中提取数值（排除通用数字如1,2,3,100等）
  const reportNumbers = extractAllNumbers(report).filter(
    (n) => n > 3 && n !== 100 && n !== 30 && n !== 60
  );

  // 检查报告数值在源数据中的匹配率
  let matched = 0;
  const sampleSize = Math.min(reportNumbers.length, 100);
  const sample = reportNumbers.slice(0, sampleSize);

  for (const num of sample) {
    // 允许小数点后四舍五入差异
    const found = [...sourceNumbers].some(
      (s) => Math.abs(s - num) < 0.1 || Math.abs(s - num) / Math.max(s, 1) < 0.01
    );
    if (found) matched++;
  }

  const ratio = sampleSize > 0 ? matched / sampleSize : 0;
  let score: number;
  // 报告中有大量衍生值(倍数、差值、占比等)不在源数据中，40%+ 原始匹配即合理
  if (ratio >= 0.55) score = 100;
  else if (ratio >= 0.45) score = 75;
  else if (ratio >= 0.35) score = 50;
  else if (ratio >= 0.2) score = 25;
  else score = 0;

  return {
    score,
    maxScore: 100,
    detail: `采样${sampleSize}个数值，${matched}个(${(ratio * 100).toFixed(1)}%)可追溯到源数据`,
    autoScored: true,
  };
}

function scoreA4(
  report: string,
  baseline: BaselineData
): ScoreItem {
  // 收集所有 mustReport=true 的 marker
  const mustReportMarkers = baseline.markers
    .filter((m) => m.mustReport)
    .map((m) => m.name);

  const mustReportJank = baseline.jankFrames
    .filter((j) => j.mustReport)
    .map((j) => `Frame #${j.frameIndex}`);

  const allMustReport = [...mustReportMarkers, ...mustReportJank];
  const reportText = report.toLowerCase();

  let covered = 0;
  const missed: string[] = [];

  for (const item of mustReportMarkers) {
    // 检查 marker 名是否在报告中出现
    if (reportText.includes(item.toLowerCase())) {
      covered++;
    } else {
      // 尝试部分匹配（marker 名可能被截断或格式化）
      const parts = item.split(".");
      const lastPart = parts[parts.length - 1].toLowerCase();
      if (lastPart.length > 5 && reportText.includes(lastPart)) {
        covered++;
      } else {
        missed.push(item);
      }
    }
  }

  // 检查 mustReport jank frames
  for (const jf of mustReportJank) {
    const frameNum = jf.replace("Frame #", "");
    if (report.includes(frameNum)) {
      covered++;
    } else {
      missed.push(jf);
    }
  }

  const total = allMustReport.length;
  const ratio = total > 0 ? covered / total : 1;

  let score: number;
  if (ratio >= 1.0) score = 100;
  else if (ratio >= 0.9) score = 75;
  else if (ratio >= 0.7) score = 50;
  else if (ratio >= 0.5) score = 25;
  else score = 0;

  return {
    score,
    maxScore: 100,
    detail: `${covered}/${total} mustReport 项被覆盖 (${(ratio * 100).toFixed(0)}%)${missed.length > 0 ? "。未覆盖: " + missed.slice(0, 5).join(", ") : ""}`,
    autoScored: true,
  };
}

function scoreB3(report: string): ScoreItem {
  const { total, withEvidence } = checkJudgmentEvidence(report);
  const ratio = withEvidence / total;

  let score: number;
  if (ratio >= 0.9) score = 100;
  else if (ratio >= 0.75) score = 75;
  else if (ratio >= 0.5) score = 50;
  else if (ratio >= 0.3) score = 25;
  else score = 0;

  return {
    score,
    maxScore: 100,
    detail: `${withEvidence}/${total} 个判定段落含具体数据证据 (${(ratio * 100).toFixed(0)}%)`,
    autoScored: true,
  };
}

function scoreB4(report: string): ScoreItem {
  const { total, untagged, examples } = hasSpeculativeWithoutTag(report);

  let score: number;
  if (total === 0) {
    score = 100; // 无推测性语言 = 满分
  } else if (untagged === 0) {
    score = 100;
  } else if (untagged <= 2) {
    score = 75;
  } else if (untagged <= total * 0.5) {
    score = 50;
  } else if (untagged <= total * 0.8) {
    score = 25;
  } else {
    score = 0;
  }

  return {
    score,
    maxScore: 100,
    detail: `发现${total}处推测性表述，${untagged}处未标注[推断]${examples.length > 0 ? "。示例: " + examples[0] : ""}`,
    autoScored: true,
  };
}

function scoreC2(
  report: string,
  baseline: BaselineData
): ScoreItem {
  const p0Markers = extractP0Markers(report);
  if (p0Markers.length === 0) {
    return {
      score: 50,
      maxScore: 100,
      detail: "未找到明确的 P0 目标 Marker 引用",
      autoScored: true,
    };
  }

  // 获取源数据中影响最大的 markers
  // 1. 按 percentOfFrame 排名前 10 的 Main Thread markers
  const topByPercent = [...baseline.markers]
    .filter((m) => m.thread.includes("Main Thread"))
    .sort((a, b) => b.percentOfFrame - a.percentOfFrame)
    .slice(0, 10)
    .map((m) => m.name);

  // 2. jank frames 中 hotPath 出现的所有 marker
  const jankMarkerSet = new Set<string>();
  for (const j of baseline.jankFrames) {
    // 提取 hotPath 中所有 marker 名
    const markers = j.hotPath.match(/[\w.:!*\[\]]+(?=\s*\()/g) || [];
    markers.forEach((m) => jankMarkerSet.add(m));
  }

  // 3. 合并: 只要 P0 marker 在 top10 或 jank 路径中出现就算命中
  const criticalMarkers = [...new Set([...topByPercent, ...jankMarkerSet])];

  // 检查 P0 markers 是否与最严重问题对应
  let p0Hits = 0;
  for (const p0m of p0Markers) {
    if (
      criticalMarkers.some(
        (cm) =>
          cm.toLowerCase().includes(p0m.toLowerCase()) ||
          p0m.toLowerCase().includes(cm.toLowerCase())
      )
    ) {
      p0Hits++;
    }
  }

  const ratio = p0Markers.length > 0 ? p0Hits / p0Markers.length : 0;
  let score: number;
  if (ratio >= 0.8) score = 100;
  else if (ratio >= 0.6) score = 75;
  else if (ratio >= 0.4) score = 50;
  else if (ratio >= 0.2) score = 25;
  else score = 0;

  return {
    score,
    maxScore: 100,
    detail: `P0 中 ${p0Hits}/${p0Markers.length} 个 marker 对应最严重问题。P0=[${p0Markers.join(",")}]`,
    autoScored: true,
  };
}

function scoreC3(report: string): ScoreItem {
  const requiredSections = [
    "概览",
    "核心结论",
    "Jank",
    "热点",
    "波动",
    "优化建议",
    "补充",
  ];

  const headings = extractHeadings(report);
  const headingText = headings.join(" ").toLowerCase();

  let found = 0;
  const missing: string[] = [];
  for (const section of requiredSections) {
    if (headingText.includes(section.toLowerCase())) {
      found++;
    } else {
      // 模糊匹配
      const alt: Record<string, string[]> = {
        概览: ["overview", "总览", "摘要"],
        核心结论: ["结论", "summary", "关键发现"],
        Jank: ["jank", "卡顿", "stutter"],
        热点: ["hotspot", "热点", "hot"],
        波动: ["spike", "波动", "volatile"],
        优化建议: ["优化", "建议", "recommendation"],
        补充: ["补充", "说明", "附录", "limitation"],
      };
      const alternatives = alt[section] || [];
      if (alternatives.some((a) => headingText.includes(a.toLowerCase()))) {
        found++;
      } else {
        missing.push(section);
      }
    }
  }

  const total = requiredSections.length;
  let score: number;
  if (found >= total) score = 100;
  else if (found >= total - 1) score = 75;
  else if (found >= total - 2) score = 50;
  else if (found >= total - 3) score = 25;
  else score = 0;

  return {
    score,
    maxScore: 100,
    detail: `${found}/${total} 必须章节存在${missing.length > 0 ? "。缺少: " + missing.join(", ") : ""}`,
    autoScored: true,
  };
}

// ─── 主流程 ──────────────────────────────────────────────

function main() {
  const args = parseArgs();

  // 读取文件
  const report = fs.readFileSync(args.report, "utf-8");
  const baseline: BaselineData = JSON.parse(
    fs.readFileSync(args.baseline, "utf-8")
  );

  console.log(`[score-report] 报告: ${args.report}`);
  console.log(`[score-report] 基线: ${args.baseline}`);
  console.log(`[score-report] 开始评分...\n`);

  // 逐项评分
  const scores: Record<string, ScoreItem> = {
    A1: scoreA1(report, baseline),
    A2: {
      score: null,
      maxScore: 100,
      detail: "需人工评审：检查调用链是否从顶层到瓶颈完整",
      autoScored: false,
    },
    A3: scoreA3(report, baseline),
    A4: scoreA4(report, baseline),
    B1: {
      score: null,
      maxScore: 100,
      detail: "需人工评审：检查瓶颈节点是否为 self-time 最高者",
      autoScored: false,
    },
    B2: {
      score: null,
      maxScore: 100,
      detail: "需人工评审：检查是否结合了项目知识库进行根因分析",
      autoScored: false,
    },
    B3: scoreB3(report),
    B4: scoreB4(report),
    C1: {
      score: null,
      maxScore: 100,
      detail: "需人工评审：检查优化建议是否包含具体可执行步骤",
      autoScored: false,
    },
    C2: scoreC2(report, baseline),
    C3: scoreC3(report),
  };

  // 计算分类得分
  const catA = ["A1", "A2", "A3", "A4"];
  const catB = ["B1", "B2", "B3", "B4"];
  const catC = ["C1", "C2", "C3"];

  function categoryAvg(keys: string[]): number {
    const scored = keys.filter((k) => scores[k].score !== null);
    if (scored.length === 0) return 0;
    return (
      scored.reduce((sum, k) => sum + (scores[k].score || 0), 0) / scored.length
    );
  }

  const categoryScores = {
    A: categoryAvg(catA),
    B: categoryAvg(catB),
    C: categoryAvg(catC),
  };

  // 仅基于自动评分项的加权总分
  const autoTotal =
    categoryScores.A * 0.4 + categoryScores.B * 0.35 + categoryScores.C * 0.25;

  const manualItems = Object.entries(scores)
    .filter(([, v]) => !v.autoScored)
    .map(([k]) => k);

  const result: ScoreResult = {
    scores,
    categoryScores,
    autoTotal: Math.round(autoTotal * 100) / 100,
    manualItems,
    finalScore: null,
    timestamp: new Date().toISOString(),
  };

  // 输出 — 文件名为 score_<报告名>.json/.md
  fs.mkdirSync(args.output, { recursive: true });

  const reportBaseName = path.basename(args.report, ".md").replace(/\s+/g, "_");
  const filePrefix = `score_${reportBaseName}`;

  const jsonPath = path.join(args.output, `${filePrefix}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), "utf-8");

  // 生成 Markdown 摘要
  const md = generateMarkdownSummary(result, args.report);
  const mdPath = path.join(args.output, `${filePrefix}.md`);
  fs.writeFileSync(mdPath, md, "utf-8");

  // 控制台输出
  console.log("═══════════════════════════════════════════");
  console.log("         性能报告自动评分结果");
  console.log("═══════════════════════════════════════════\n");

  for (const [key, item] of Object.entries(scores)) {
    const scoreText =
      item.score !== null ? `${item.score}/100` : "待人工";
    const tag = item.autoScored ? "🤖" : "👤";
    console.log(`  ${tag} ${key}: ${scoreText.padEnd(8)} ${item.detail}`);
  }

  console.log("\n───────────────────────────────────────────");
  console.log(
    `  A类(数据准确性): ${categoryScores.A.toFixed(1)}/100  ×0.40`
  );
  console.log(
    `  B类(分析质量):   ${categoryScores.B.toFixed(1)}/100  ×0.35`
  );
  console.log(
    `  C类(实用价值):   ${categoryScores.C.toFixed(1)}/100  ×0.25`
  );
  console.log("───────────────────────────────────────────");
  console.log(
    `  自动评分总分(仅含自动项): ${autoTotal.toFixed(1)}/100`
  );
  console.log(`  档位: ${getGradeEmoji(autoTotal)} ${getGradeLevel(autoTotal)}`);
  console.log(`  待人工补充: ${manualItems.join(", ")}`);
  console.log("═══════════════════════════════════════════\n");
  console.log(`[score-report] JSON 输出: ${jsonPath}`);
  console.log(`[score-report] Markdown 输出: ${mdPath}`);
}

function getGradeLevel(score: number): string {
  if (score >= 81) return "优秀";
  if (score >= 61) return "良好";
  if (score >= 41) return "及格";
  if (score >= 21) return "差";
  return "不可用";
}

function getGradeEmoji(score: number): string {
  if (score >= 81) return "🏅";
  if (score >= 61) return "👍";
  if (score >= 41) return "⚠️";
  if (score >= 21) return "❌";
  return "💀";
}

function generateMarkdownSummary(result: ScoreResult, reportPath: string): string {
  const { scores, categoryScores, autoTotal, manualItems } = result;

  const gradeLevel = getGradeLevel(autoTotal);
  const gradeEmoji = getGradeEmoji(autoTotal);

  const itemNames: Record<string, string> = {
    A1: "概览数据",
    A2: "调用链",
    A3: "数值引用",
    A4: "mustReport",
    B1: "瓶颈定位",
    B2: "根因深度",
    B3: "判定透明度",
    B4: "不确定标注",
    C1: "建议可执行",
    C2: "优先级",
    C3: "结构完整",
  };

  let md = `# ${gradeEmoji} 性能报告评分结果\n\n`;
  md += `> **评分对象**: \`${reportPath}\`\n`;
  md += `> **生成时间**: ${result.timestamp}\n`;
  md += `> **评分制度**: 100 分制（满分 100）\n\n`;

  // ── 总分 ──
  md += `---\n\n`;
  md += `## 🏆 总分\n\n`;
  md += `\`\`\`\n`;
  md += `总分 = A平均 × 0.4 + B平均 × 0.35 + C平均 × 0.25\n`;
  md += `     = ${categoryScores.A.toFixed(2)} × 0.4 + ${categoryScores.B.toFixed(2)} × 0.35 + ${categoryScores.C.toFixed(2)} × 0.25\n`;
  md += `     = ${(categoryScores.A * 0.4).toFixed(2)} + ${(categoryScores.B * 0.35).toFixed(2)} + ${(categoryScores.C * 0.25).toFixed(2)}\n`;
  md += `     = ${autoTotal.toFixed(1)} / 100\n`;
  md += `\`\`\`\n\n`;
  md += `**总分：${autoTotal.toFixed(1)} / 100 — ${gradeEmoji} ${gradeLevel}**\n\n`;

  // ── 汇总评分表 ──
  md += `---\n\n`;
  md += `## 📋 汇总评分表\n\n`;
  md += `| 大类 | 子项 | 分数 | 类型 |\n`;
  md += `|------|------|------|------|\n`;

  const categories = [
    { label: "A 数据准确性", keys: ["A1", "A2", "A3", "A4"], avg: categoryScores.A },
    { label: "B 分析质量", keys: ["B1", "B2", "B3", "B4"], avg: categoryScores.B },
    { label: "C 实用价值", keys: ["C1", "C2", "C3"], avg: categoryScores.C },
  ];

  for (const cat of categories) {
    let firstRow = true;
    for (const key of cat.keys) {
      const item = scores[key];
      const scoreText = item.score !== null ? `**${item.score}**/100` : "待人工";
      const type = item.autoScored ? "🤖自动" : "👤人工";
      const catLabel = firstRow ? `**${cat.label}**` : "";
      md += `| ${catLabel} | ${key} ${itemNames[key]} | ${scoreText} | ${type} |\n`;
      firstRow = false;
    }
    md += `| | **${cat.label.charAt(0)} 类平均** | **${cat.avg.toFixed(2)}/100** | |\n`;
  }

  // ── 分类得分 ──
  md += `\n---\n\n`;
  md += `## 📊 分类得分\n\n`;
  md += `| 大类 | 得分 | 权重 | 加权得分 |\n`;
  md += `|------|------|------|----------|\n`;
  md += `| A 数据准确性 | ${categoryScores.A.toFixed(2)}/100 | 40% | ${(categoryScores.A * 0.4).toFixed(2)} |\n`;
  md += `| B 分析质量 | ${categoryScores.B.toFixed(2)}/100 | 35% | ${(categoryScores.B * 0.35).toFixed(2)} |\n`;
  md += `| C 实用价值 | ${categoryScores.C.toFixed(2)}/100 | 25% | ${(categoryScores.C * 0.25).toFixed(2)} |\n`;
  md += `| **总分** | | | **${autoTotal.toFixed(1)}/100** |\n\n`;

  // ── 扣分点总结 ──
  const deductions: { key: string; lost: number; reason: string }[] = [];
  for (const [key, item] of Object.entries(scores)) {
    if (item.score !== null && item.score < 100) {
      deductions.push({ key, lost: 100 - item.score, reason: item.detail });
    }
  }

  if (deductions.length > 0) {
    md += `---\n\n`;
    md += `## ⚠️ 扣分点总结\n\n`;
    let idx = 1;
    for (const d of deductions) {
      md += `${idx}. **${d.key}** (-${d.lost}): ${d.reason}\n`;
      idx++;
    }
    md += `\n`;
  }

  // ── 待人工评审项 ──
  if (manualItems.length > 0) {
    md += `---\n\n`;
    md += `## 👤 待人工评审项\n\n`;
    md += `以下 ${manualItems.length} 项需人工/LLM 补充评分后计算最终总分：\n\n`;
    for (const key of manualItems) {
      const name = itemNames[key] || key;
      md += `- **${key} ${name}**: ${scores[key].detail}\n`;
    }
    md += `\n`;
  }

  // ── 档位参考 ──
  md += `---\n\n`;
  md += `## 档位参考\n\n`;
  md += `| 分数区间 | 档位 |\n`;
  md += `|----------|------|\n`;
  md += `| 81-100 | 🏅 优秀 |\n`;
  md += `| 61-80 | 👍 良好 |\n`;
  md += `| 41-60 | ⚠️ 及格 |\n`;
  md += `| 21-40 | ❌ 差 |\n`;
  md += `| 0-20 | 💀 不可用 |\n\n`;

  md += `---\n\n`;
  md += `*评分标准详见 .codebuddy/skills/unity-profiler-scoring/rubric.md*\n`;
  return md;
}

main();
