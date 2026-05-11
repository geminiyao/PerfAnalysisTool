import path from 'path';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { getConfig } from '../utils/config.js';
import { executeCli, type AnalysisJob } from './cli-executor.js';
import { extractMetrics } from './metrics-extractor.js';
import { emitProgress } from '../routes/analysis.js';
import type { CliProvider } from '../../shared/types.js';

interface QueueItem {
  sessionId: string;
  cliProvider: CliProvider;
  addedAt: number;
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

  /** 将分析任务加入队列，返回队列位置 */
  enqueue(sessionId: string, cliProvider: CliProvider = 'codebuddy'): number {
    this.queue.push({ sessionId, cliProvider, addedAt: Date.now() });
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
      await this.executeJob(item.sessionId, item.cliProvider);
    } catch (err: any) {
      console.error(`Analysis failed for ${item.sessionId}:`, err);
    } finally {
      this.running = null;
      this.totalProcessed++;
      // 继续处理下一个
      this.processNext();
    }
  }

  /** 执行单个分析任务 */
  private async executeJob(sessionId: string, cliProvider: CliProvider): Promise<void> {
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
      pdataPath: session.filePath,
      outputDir,
      cliProvider,
    };

    const result = await executeCli(job);

    const endTime = Date.now();
    const duration = endTime - startTime;

    if (result.success) {
      // 提取指标存入数据库
      try {
        await extractMetrics(sessionId, outputDir);
      } catch (err: any) {
        console.warn(`Metrics extraction warning for ${sessionId}:`, err.message);
      }

      await db.update(sessions).set({
        status: 'completed',
        completedAt: endTime,
        duration,
      }).where(eq(sessions.id, sessionId));
    } else {
      await db.update(sessions).set({
        status: 'failed',
        error: result.error?.slice(0, 1000),
        completedAt: endTime,
        duration,
      }).where(eq(sessions.id, sessionId));
    }
  }
}

/** 全局单例队列 */
export const analysisQueue = new AnalysisQueue();
