/**
 * report-pipeline.ts — 报告生成三段管线可插拔框架契约（DR-44 需求 A1）
 *
 * 三段管线（DR-44 §2.1）：
 *   explore LLM → findings.json
 *   narrative LLM → narrative.json（数据源无关，框架固定提供）
 *   render 纯代码 → report.html（数据源无关，框架固定提供）
 *
 * 每个数据源（unity/perfetto/simpleperf）只实现 explore 侧 + 报告章节模板路径，
 * narrative/render 不暴露在接口里——机制上保证数据源无法绕过 LLM。
 *
 * 参照实现：unity 阶段（explore-service.ts + narrative-prompt.txt + render-html.ts）。
 * 本工单只建框架，unity 接入 registry 是后续工单的事。
 */

import type Database from 'better-sqlite3';

// ─────────────────────── ToolRegistry（数据源特定工具集） ───────────────────────

/**
 * 单个 Prism 查询工具的执行器签名（对齐 tools.cli.ts 的 ToolRunner）。
 * 纯函数：(db, args) → { data, provenance } | unknown。
 */
export type ToolRunner = (
  db: Database.Database | null,
  args: Record<string, unknown>,
) => unknown;

/**
 * 数据源特定的工具集注册表：工具名 → 执行器。
 * 每个数据源在 explore 阶段只允许调用自己注册的工具（数据源无关的 Bash/Read/Write
 * 等通用工具由 explore-service 的 allowedTools 控制，不在这里）。
 */
export type ToolRegistry = Record<string, ToolRunner>;

// ─────────────────────── ReportPipeline 契约 ───────────────────────

/**
 * 数据源接入报告生成三段管线的契约。
 * 每个数据源（unity/perfetto/simpleperf）实现一份，注册到 pipeline registry。
 *
 * 三段管线（DR-44）：
 *   explore LLM → findings.json
 *   narrative LLM → narrative.json（数据源无关，框架提供）
 *   render 纯代码 → report.html（数据源无关，框架提供）
 *
 * 数据源只实现 explore 侧 + 报告模板路径，narrative/render 不写。
 */
export interface ReportPipeline {
  /** 数据源标识（如 'unity' / 'perfetto' / 'simpleperf'） */
  source: string;

  // ── 数据源特定：explore 阶段 ──
  /** explore prompt 路径（如 'prompts/unity-explore-prompt.txt' for unity, 'prompts/perfetto-explore-prompt.txt' for perfetto） */
  explorePromptPath: string;
  /** explore 阶段可用的工具集注册（数据源特定工具） */
  exploreTools: ToolRegistry;

  // ── 数据源特定：报告章节模板（注入 narrative-prompt 的 {{REPORT_TEMPLATE}}） ──
  /** 报告章节模板路径（如 'prompts/report-templates/perfetto-multi-state.txt'）。null = 用默认骨架 */
  reportTemplatePath: string | null;

  // ── 数据源无关：narrative 阶段（框架固定提供，数据源不写） ──
  // narrativePromptPath 固定为 'prompts/narrative-prompt.txt'，不暴露在接口里

  // ── 数据源无关：渲染阶段（框架固定提供，数据源不写） ──
  // renderHtml 固定为 render-html.ts，不暴露在接口里
}

// ─────────────────────── PipelineRegistry ───────────────────────

/** 数据源 pipeline 注册表 */
export interface PipelineRegistry {
  get(source: string): ReportPipeline | undefined;
  register(pipeline: ReportPipeline): void;
  list(): string[];
}

/**
 * 默认的 PipelineRegistry 实现（Map-based）。
 * 用 getDefaultRegistry() 拿单例，或 new DefaultPipelineRegistry() 自建实例。
 */
export class DefaultPipelineRegistry implements PipelineRegistry {
  private readonly pipelines = new Map<string, ReportPipeline>();

  get(source: string): ReportPipeline | undefined {
    return this.pipelines.get(source);
  }

  register(pipeline: ReportPipeline): void {
    this.pipelines.set(pipeline.source, pipeline);
  }

  list(): string[] {
    return Array.from(this.pipelines.keys());
  }
}

// ─────────────────────── 默认 registry 单例 + 工厂 ───────────────────────

let defaultRegistry: PipelineRegistry | null = null;

/** 获取进程级默认 registry 单例。首次调用时惰性创建。 */
export function getDefaultRegistry(): PipelineRegistry {
  if (defaultRegistry === null) {
    defaultRegistry = new DefaultPipelineRegistry();
  }
  return defaultRegistry;
}

/**
 * 工厂函数：按数据源标识从默认 registry 取 pipeline。
 * 未注册时抛错（数据源接入前必须先 register）。
 */
export function getDefaultPipeline(source: string): ReportPipeline {
  const registry = getDefaultRegistry();
  const pipeline = registry.get(source);
  if (!pipeline) {
    throw new Error(
      `getDefaultPipeline: data source "${source}" not registered. ` +
        `Registered sources: [${registry.list().join(', ') || 'none'}]. ` +
        `Call registry.register(...) before requesting a pipeline (DR-44 A1).`,
    );
  }
  return pipeline;
}

// ─────────────────────── 内置 pipeline 注册（WT-027 B4） ───────────────────────

/**
 * 检测报告是单态还是多态（WT-043 需求 C）。
 *
 * 用于数据源（如 unity）的 reportTemplatePath 路由：
 *   - 单态（1 个样本）→ <source>-single-state.txt
 *   - 多态（≥2 个样本）→ <source>-multi-state.txt
 *
 * 实际的模板文件选取在 narrative-service.ts:resolveReportTemplate 里做（基于 outputDir
 * 的目录结构检测）。本函数是契约层占位，供 pipeline 注册时声明"该数据源支持态数路由"。
 *
 * 与 report-utils.ts:detectStateMode(summaries) 不同——那个基于已加载的 summaries 数组，
 * 用于渲染层；这个用于 pipeline 注册层声明数据源支持态数路由。
 */
export function detectStateMode(sampleCount: number): 'single' | 'multi' {
  return sampleCount >= 2 ? 'multi' : 'single';
}

/**
 * 注册内置数据源 pipeline（unity / perfetto）。
 * 在进程启动时调用一次（如 run-perfetto-pipeline.ts 入口）。
 *
 * 注意：exploreTools 这里注册的是"工具名 → 执行器"映射，供 explore 阶段
 * 限制数据源可用工具集。当前实现下 explore-service 通过 allowedTools 控制
 * 通用工具（Bash/Read/Write 等），数据源特定工具由 prompt 引导 LLM 调用
 * tools.cli.ts，此处注册是契约层占位，实际工具执行走 tools.cli.ts。
 */
export function registerBuiltinPipelines(): void {
  const registry = getDefaultRegistry();

  // Unity pipeline（参照实现，已存在）
  // WT-043 需求 C：reportTemplatePath 由 detectStateMode 动态选
  //   - 1 个样本 → unity-single-state.txt
  //   - ≥2 个样本 → unity-multi-state.txt
  // 实际选取在 narrative-service.ts:resolveReportTemplate 里做（基于 outputDir 目录结构）。
  // 这里 reportTemplatePath: null 表示"由 detectStateMode 动态选"，不是"没模板"。
  if (!registry.get('unity')) {
    registry.register({
      source: 'unity',
      explorePromptPath: 'prompts/unity-explore-prompt.txt',
      exploreTools: {},  // unity 工具集由 unity-explore-prompt 引导，tools.cli.ts 执行
      reportTemplatePath: null,  // 由 detectStateMode 动态选 unity-single-state.txt / unity-multi-state.txt
    });
  }

  // Perfetto pipeline（WT-027 B4 注册）
  if (!registry.get('perfetto')) {
    registry.register({
      source: 'perfetto',
      explorePromptPath: 'prompts/perfetto-explore-prompt.txt',
      exploreTools: {},  // perfetto 工具集由 perfetto-explore-prompt 引导，tools.cli.ts 执行
      reportTemplatePath: 'prompts/report-templates/perfetto-multi-state.txt',  // DR-45 断链 2 修复
    });
  }
}
