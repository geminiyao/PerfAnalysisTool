import path from 'path';
import fs from 'fs';
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
      pdataPath: session.filePath,
      outputDir,
      cliProvider,
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
}

/** 全局单例队列 */
export const analysisQueue = new AnalysisQueue();
