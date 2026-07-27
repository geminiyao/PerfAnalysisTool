import path from 'path';
import fs from 'fs';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { getConfig } from '../utils/config.js';
import { executeCli, type AnalysisJob } from './cli-executor.js';
import { extractMetrics } from './metrics-extractor.js';
import { assetService } from './asset-service.js';
import { emitProgress } from '../routes/analysis.js';
import type { CliProvider, ProgressEvent } from '../../shared/types.js';
import { runPrismPipeline, type PrismPipelineOptions } from './prism-runner.js';

export interface AnalysisParams {
  targetFps?: number;
  jankMultiplier?: number;
  bigJankMultiplier?: number;
  budgetRatio?: number;
}

/** 任务类型：'skill' 走 executeCli（旧路径），'prism' 走 runPrismPipeline（三段管线） */
type TaskType = 'skill' | 'prism';

interface QueueItem {
  sessionId: string;
  cliProvider: CliProvider;
  params?: AnalysisParams;
  addedAt: number;
  taskType: TaskType;          // 新增：默认 'skill'（向后兼容）
  prismOpts?: PrismPipelineOptions;  // 新增：taskType='prism' 时必填
}

interface QueueStatus {
  running: string | null;
  queued: QueueItem[];
  totalProcessed: number;
}

class AnalysisQueue {
  private queue: QueueItem[] = [];
  private running: string | null = null;
  private totalProcessed = 0;

  /**
   * 将分析任务加入队列，返回队列位置。
   * 向后兼容：未传 taskType 时默认 'skill'。
   */
  enqueue(
    sessionId: string,
    cliProvider: CliProvider = 'codebuddy',
    params?: AnalysisParams,
    taskType: TaskType = 'skill',
    prismOpts?: PrismPipelineOptions,
  ): number {
    this.queue.push({ sessionId, cliProvider, params, addedAt: Date.now(), taskType, prismOpts });
    const position = this.queue.length;

    // 如果没有正在运行的任务，立即开始处理
    if (!this.running) {
      this.processNext();
    }

    return position;
  }

  /** 获取队列状态 */
  getStatus(): QueueStatus {
    return {
      running: this.running,
      queued: [...this.queue],
      totalProcessed: this.totalProcessed,
    };
  }

  /** 获取某个任务在队列中的位置（0 表示正在运行，-1 表示不在队列中） */
  getPosition(sessionId: string): number {
    if (this.running === sessionId) return 0;
    const idx = this.queue.findIndex(q => q.sessionId === sessionId);
    return idx === -1 ? -1 : idx + 1;
  }

  /** 处理下一个任务 */
  private async processNext(): Promise<void> {
    if (this.running || this.queue.length === 0) return;

    const item = this.queue.shift()!;
    this.running = item.sessionId;

    try {
      if (item.taskType === 'prism') {
        await this.executePrismJob(item.sessionId, item.prismOpts!);
      } else {
        await this.executeJob(item.sessionId, item.cliProvider, item.params);
      }
    } catch (err: any) {
      console.error(`Analysis failed for ${item.sessionId}:`, err);
    } finally {
      this.running = null;
      this.totalProcessed++;
      // 继续处理下一个
      this.processNext();
    }
  }

  /** 执行单个分析任务（skill 路径，原逻辑） */
  private async executeJob(sessionId: string, cliProvider: CliProvider, params?: AnalysisParams): Promise<void> {
    const config = getConfig();
    const db = getDb();

    // 获取 session 信息
    const session = await db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    if (!session || !session.filePath) {
      await db.update(sessions).set({
        status: 'failed',
        error: '会话不存在或文件路径为空',
        completedAt: Date.now(),
      }).where(eq(sessions.id, sessionId));
      emitProgress({
        sessionId,
        stage: 'failed',
        progress: 0,
        message: '会话不存在或文件路径为空',
        timestamp: Date.now(),
      });
      return;
    }

    // 更新状态为 running
    const startTime = Date.now();
    await db.update(sessions).set({ status: 'running' }).where(eq(sessions.id, sessionId));

    emitProgress({
      sessionId,
      stage: 'preprocessing',
      progress: 5,
      message: '开始分析...',
      timestamp: Date.now(),
    });

    // 准备输出目录
    const outputDir = path.join(config.dataDir, 'results', sessionId);

    // 执行 CLI 分析
    const job: AnalysisJob = {
      sessionId,
      skill: 'unity_profiler',
      inputPath: session.filePath,
      pdataPath: session.filePath,
      outputDir,
      cliProvider,
      params,
    };

    const result = await executeCli(job);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // 保存日志到文件（无论成功失败都保存）
    if (result.logs && result.logs.length > 0) {
      try {
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(
          path.join(outputDir, 'analysis.log'),
          result.logs.join('\n'),
          'utf-8',
        );
        console.log(`[Queue] Logs saved to ${path.join(outputDir, 'analysis.log')} (${result.logs.length} lines)`);
      } catch (err: any) {
        console.warn(`[Queue] Failed to save logs: ${err.message}`);
      }
    }

    if (result.success) {
      // 提取指标存入数据库
      try {
        await extractMetrics(sessionId, outputDir);
        await registerGeneratedAssets(sessionId, outputDir);

        // 全部成功 → completed
        await db.update(sessions).set({
          status: 'completed',
          completedAt: endTime,
          duration,
        }).where(eq(sessions.id, sessionId));

        emitProgress({
          sessionId,
          stage: 'completed',
          progress: 100,
          message: '分析完成，报告已保存',
          timestamp: Date.now(),
          log: '[完成] 指标和报告已写入数据库',
        });
      } catch (err: any) {
        // extractMetrics 失败 → 标记为 failed
        const errMsg = `数据提取失败: ${err.message}`;
        console.error(`[Queue] ${errMsg}`);

        await db.update(sessions).set({
          status: 'failed',
          error: errMsg.slice(0, 1000),
          completedAt: endTime,
          duration,
        }).where(eq(sessions.id, sessionId));

        emitProgress({
          sessionId,
          stage: 'failed',
          progress: 0,
          message: errMsg,
          timestamp: Date.now(),
          log: `[错误] ${errMsg}`,
        });
      }
    } else {
      await db.update(sessions).set({
        status: 'failed',
        error: result.error?.slice(0, 1000),
        completedAt: endTime,
        duration,
      }).where(eq(sessions.id, sessionId));

      emitProgress({
        sessionId,
        stage: 'failed',
        progress: 0,
        message: result.error || '分析失败',
        timestamp: Date.now(),
        log: `[错误] ${result.error || '未知错误'}`,
      });
    }
  }

  /** 执行 Prism 三段管线任务（taskType='prism'） */
  private async executePrismJob(sessionId: string, prismOpts: PrismPipelineOptions): Promise<void> {
    const db = getDb();
    const startTime = Date.now();

    // 更新状态为 running
    await db.update(sessions).set({ status: 'running' }).where(eq(sessions.id, sessionId));

    emitProgress({
      sessionId,
      stage: 'preprocessing',
      progress: 5,
      message: `Prism 三段管线启动 (source=${prismOpts.source}, runId=${prismOpts.runId})`,
      timestamp: Date.now(),
    });

    // 把 Prism onProgress 映射到 SSE ProgressEvent
    // Prism 三阶段：explore(0-33) / narrative(33-66) / render(66-95)，完成时 100
    const stageBase: Record<'explore' | 'narrative' | 'render', number> = {
      explore: 5,
      narrative: 40,
      render: 70,
    };
    const stageSpan: Record<'explore' | 'narrative' | 'render', number> = {
      explore: 35,
      narrative: 30,
      render: 25,
    };

    let lastStage: 'explore' | 'narrative' | 'render' = 'explore';
    let lastProgress = 0;
    let lastActivityMessage = '';

    const onProgress = (stage: 'explore' | 'narrative' | 'render', progress: number, message: string) => {
      lastStage = stage;
      const base = stageBase[stage];
      const span = stageSpan[stage];
      // progress=-1 表示纯日志 (不更新进度百分比)
      if (progress >= 0) {
        lastProgress = base + Math.floor((progress / 100) * span);
      }
      // 记录非心跳消息，供心跳显示当前活动
      if (!message.includes('⏱ 已运行')) {
        lastActivityMessage = message;
      }
      emitProgress({
        sessionId,
        stage: 'analyzing',
        progress: lastProgress,
        message: `[Prism/${stage}] ${message}`,
        timestamp: Date.now(),
      });
    };

    // ★ 心跳计时: 每 15 秒推送已用时间 + 当前活动, 防止长时间无反馈
    const heartbeatTimer = setInterval(() => {
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      const elapsedStr = elapsedSec >= 60 ? `${Math.floor(elapsedSec / 60)}m${elapsedSec % 60}s` : `${elapsedSec}s`;
      const activity = lastActivityMessage ? ` | ${lastActivityMessage}` : '';
      emitProgress({
        sessionId,
        stage: 'analyzing',
        progress: lastProgress,
        message: `[Prism/${lastStage}] ⏱ 已运行 ${elapsedStr}${activity}`,
        timestamp: Date.now(),
      });
    }, 15000);

    const result = await runPrismPipeline({
      ...prismOpts,
      onProgress,
    });

    clearInterval(heartbeatTimer);

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (result.success) {
      // 注册 Prism 产出物到 assets 表（report.html / findings.json / narrative.json）
      try {
        await registerPrismAssets(sessionId, result);
      } catch (err: any) {
        console.warn(`[Queue] Failed to register Prism assets: ${err.message}`);
      }

      await db.update(sessions).set({
        status: 'completed',
        completedAt: endTime,
        duration,
      }).where(eq(sessions.id, sessionId));

      emitProgress({
        sessionId,
        stage: 'completed',
        progress: 100,
        message: 'Prism 报告已生成',
        timestamp: Date.now(),
        log: `[完成] report.html → ${result.reportHtmlPath}`,
      });
    } else {
      await db.update(sessions).set({
        status: 'failed',
        error: (result.error ?? '未知错误').slice(0, 1000),
        completedAt: endTime,
        duration,
      }).where(eq(sessions.id, sessionId));

      emitProgress({
        sessionId,
        stage: 'failed',
        progress: 0,
        message: result.error || 'Prism 管线失败',
        timestamp: Date.now(),
        log: `[错误] ${result.error || '未知错误'}`,
      });
    }
  }
}

async function registerGeneratedAssets(sessionId: string, outputDir: string) {
  const generatedFiles = [
    {
      fileName: 'preprocess-result.json',
      filePath: path.join(outputDir, 'preprocess-result.json'),
      assetType: 'report_json',
      role: 'output',
      mimeType: 'application/json',
    },
    {
      fileName: 'performance-report.md',
      filePath: path.join(outputDir, 'performance-report.md'),
      assetType: 'report_md',
      role: 'report',
      mimeType: 'text/markdown',
    },
  ];

  for (const item of generatedFiles) {
    if (!fs.existsSync(item.filePath)) continue;
    const asset = await assetService.registerExistingFile({
      filePath: item.filePath,
      fileName: item.fileName,
      assetType: item.assetType,
      source: 'generated',
      mimeType: item.mimeType,
      metadata: { sessionId, outputDir },
    });
    await assetService.linkSessionAsset({
      sessionId,
      sessionType: 'profiler',
      assetId: asset.id,
      role: item.role,
    });
  }
}

/** 注册 Prism 三段管线产出物到 assets 表（WT-051a 需求 B） */
async function registerPrismAssets(
  sessionId: string,
  result: { reportHtmlPath?: string; findingsPath?: string; narrativePath?: string },
) {
  const files = [
    {
      fileName: 'report.html',
      filePath: result.reportHtmlPath,
      assetType: 'report_html',
      role: 'report',
      mimeType: 'text/html',
    },
    {
      fileName: 'findings.json',
      filePath: result.findingsPath,
      assetType: 'report_json',
      role: 'output',
      mimeType: 'application/json',
    },
    {
      fileName: 'narrative.json',
      filePath: result.narrativePath,
      assetType: 'report_json',
      role: 'output',
      mimeType: 'application/json',
    },
  ];

  for (const item of files) {
    if (!item.filePath || !fs.existsSync(item.filePath)) continue;
    const asset = await assetService.registerExistingFile({
      filePath: item.filePath,
      fileName: item.fileName,
      assetType: item.assetType,
      source: 'generated',
      mimeType: item.mimeType,
      metadata: { sessionId, prismPipeline: true },
    });
    await assetService.linkSessionAsset({
      sessionId,
      sessionType: 'profiler',
      assetId: asset.id,
      role: item.role,
    });
  }
}

/** 全局单例队列 */
export const analysisQueue = new AnalysisQueue();
