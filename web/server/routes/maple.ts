/**
 * maple.ts - Maple ILOpt 同步采样数据的 API 路由。
 *
 * 端点：
 *   POST /api/maple/runs          上传一次采样 run（multipart：meta.json + 文件）
 *   POST /api/maple/runs/:id/analyze  触发分析
 *   GET  /api/maple/runs          列出所有 runs（按时间倒序）
 *   GET  /api/maple/runs/:id      获取单个 run 详情（含分析结果）
 *   POST /api/maple/compare       对比 base vs opt run，生成报告
 *   GET  /api/maple/compare/:id   获取对比报告
 *   DELETE /api/maple/runs/:id    删除 run 及所有关联数据
 */

import { FastifyInstance } from 'fastify';
import { eq, desc, inArray } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getDb } from '../db/index.js';
import {
  mapleRuns,
  maplePdataResults,
  maplePerfettoResults,
  mapleCompareReports,
} from '../db/schema.js';
import { analyzeRun } from '../services/maple-analyzer.js';
import { getConfig } from '../utils/config.js';
import type { MultipartFile } from '@fastify/multipart';

// 存储目录
function getMapleDir(): string {
  const config = getConfig();
  const dir = path.join(config.dataDir ?? '.', 'maple');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getRunDir(runId: string): string {
  const dir = path.join(getMapleDir(), runId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// 生成对比报告文本
// ---------------------------------------------------------------------------
function buildCompareReportText(base: any, opt: any, bPdata: any, oPdata: any, bPerf: any, oPerf: any): string {
  const lines: string[] = [];
  lines.push('='.repeat(72));
  lines.push('Maple ILOpt 性能对比报告（自动生成）');
  lines.push(`  base 版本 : ${base.id}`);
  lines.push(`  opt  版本 : ${opt.id}`);
  lines.push(`  设备      : ${base.device}`);
  lines.push(`  场景      : ${base.scene}`);
  lines.push('='.repeat(72));

  lines.push('\n【Unity Profiler 对比】');
  lines.push('-'.repeat(72));
  if (bPdata && oPdata) {
    const scriptDelta = bPdata.scriptingMs > 0
      ? ((oPdata.scriptingMs - bPdata.scriptingMs) / bPdata.scriptingMs * 100).toFixed(1)
      : 'N/A';
    const p95Delta = bPdata.p95FrameMs > 0
      ? ((oPdata.p95FrameMs - bPdata.p95FrameMs) / bPdata.p95FrameMs * 100).toFixed(1)
      : 'N/A';
    lines.push(`  ${'指标'.padEnd(36)} ${'base'.padStart(10)} ${'opt'.padStart(10)}  ${'变化'.padStart(10)}`);
    lines.push(`  ${'-'.repeat(70)}`);
    lines.push(`  ${'帧均总耗时 (ms/frame)'.padEnd(36)} ${bPdata.avgFrameMs.toFixed(2).padStart(10)} ${oPdata.avgFrameMs.toFixed(2).padStart(10)}  ${(((oPdata.avgFrameMs - bPdata.avgFrameMs) / bPdata.avgFrameMs * 100).toFixed(1) + '%').padStart(10)}`);
    lines.push(`  ${'帧时间 P95 (ms)'.padEnd(36)} ${bPdata.p95FrameMs.toFixed(2).padStart(10)} ${oPdata.p95FrameMs.toFixed(2).padStart(10)}  ${(p95Delta + '%').padStart(10)}`);
    lines.push(`  ${'Scripting 帧均 (ms/frame)'.padEnd(36)} ${bPdata.scriptingMs.toFixed(3).padStart(10)} ${oPdata.scriptingMs.toFixed(3).padStart(10)}  ${(scriptDelta + '%').padStart(10)}`);
    lines.push(`  ${'WaitForTargetFPS 帧均 (ms)'.padEnd(36)} ${bPdata.waitForTargetFpsMs.toFixed(3).padStart(10)} ${oPdata.waitForTargetFpsMs.toFixed(3).padStart(10)}`);
    lines.push(`  ${'慢帧(>33ms)占比'.padEnd(36)} ${(bPdata.slowFrames33Rate * 100).toFixed(1).padStart(9)}% ${(oPdata.slowFrames33Rate * 100).toFixed(1).padStart(9)}%`);
    lines.push(`  ${'总帧数'.padEnd(36)} ${String(bPdata.totalFrames).padStart(10)} ${String(oPdata.totalFrames).padStart(10)}`);
  } else {
    lines.push('  (pdata 分析结果不可用)');
  }

  lines.push('\n【perfetto 验证摘要】');
  lines.push('-'.repeat(72));
  if (bPerf && oPerf && bPerf.parseStatus !== 'failed' && oPerf.parseStatus !== 'failed') {
    const fmtPct = (v: number | null | undefined) => v != null ? v.toFixed(1) + '%' : 'N/A';
    const fmtMs = (v: number | null | undefined) => v != null ? v.toFixed(2) + 'ms' : 'N/A';
    lines.push(`  ${'指标'.padEnd(40)} ${'base'.padStart(12)} ${'opt'.padStart(12)}`);
    lines.push(`  ${'-'.repeat(68)}`);
    lines.push(`  ${'UnityMain Running 占比'.padEnd(40)} ${fmtPct(bPerf.mainThreadRunningPct).padStart(12)} ${fmtPct(oPerf.mainThreadRunningPct).padStart(12)}`);
    lines.push(`  ${'UnityMain Runnable 占比'.padEnd(40)} ${fmtPct(bPerf.mainThreadRunnablePct).padStart(12)} ${fmtPct(oPerf.mainThreadRunnablePct).padStart(12)}`);
    lines.push(`  ${'GPU 频率均值 (MHz)'.padEnd(40)} ${(bPerf.gpuFreqAvgMhz != null ? bPerf.gpuFreqAvgMhz.toFixed(0) : 'N/A').padStart(12)} ${(oPerf.gpuFreqAvgMhz != null ? oPerf.gpuFreqAvgMhz.toFixed(0) : 'N/A').padStart(12)}`);
    lines.push(`  ${'帧时长 P95'.padEnd(40)} ${fmtMs(bPerf.frameP95Ms).padStart(12)} ${fmtMs(oPerf.frameP95Ms).padStart(12)}`);
    lines.push(`  ${'Binder 等待均值'.padEnd(40)} ${fmtMs(bPerf.binderAvgDurMs).padStart(12)} ${fmtMs(oPerf.binderAvgDurMs).padStart(12)}`);
    if (bPerf.parseNotes || oPerf.parseNotes) {
      lines.push(`\n  [注] base: ${bPerf.parseNotes ?? 'ok'}  |  opt: ${oPerf.parseNotes ?? 'ok'}`);
    }
  } else {
    const note = bPerf?.parseNotes || oPerf?.parseNotes || 'perfetto 解析结果不可用';
    lines.push(`  (${note})`);
  }

  lines.push('\n【simpleperf 结果】（由 maple_compare.py 生成，见 simpleperfJsonPath）');
  lines.push('-'.repeat(72));
  lines.push('  il2cpp CPU 占比及函数级 Diff 请查看 web 界面的 simpleperf 报告页面');

  lines.push('\n【自动结论】');
  lines.push('-'.repeat(72));
  const conclusions: string[] = [];
  if (bPdata && oPdata) {
    const scriptPct = bPdata.scriptingMs > 0
      ? (oPdata.scriptingMs - bPdata.scriptingMs) / bPdata.scriptingMs * 100
      : null;
    if (scriptPct != null) {
      if (scriptPct < -2) conclusions.push(`✓ Scripting 帧均下降 ${Math.abs(scriptPct).toFixed(1)}%，Unity Profiler 层面收益明显`);
      else if (scriptPct < 0) conclusions.push(`~ Scripting 帧均下降 ${Math.abs(scriptPct).toFixed(1)}%，幅度较小`);
      else conclusions.push(`! Scripting 帧均无下降（+${scriptPct.toFixed(1)}%），请核查`);
    }
    const slowImprove = bPdata.slowFrames33Rate - oPdata.slowFrames33Rate;
    if (slowImprove > 0.01) conclusions.push(`✓ 慢帧率改善 ${(slowImprove * 100).toFixed(1)}pp`);
  }
  if (bPerf && oPerf && bPerf.frameP95Ms != null && oPerf.frameP95Ms != null) {
    const p95d = (oPerf.frameP95Ms - bPerf.frameP95Ms) / bPerf.frameP95Ms * 100;
    if (p95d < -3) conclusions.push(`✓ perfetto 帧时长 P95 下降 ${Math.abs(p95d).toFixed(1)}%`);
    if (bPerf.gpuUtilizationPct != null && bPerf.gpuUtilizationPct > 85) {
      conclusions.push('! GPU 利用率偏高，CPU 收益可能被 GPU 瓶颈稀释');
    }
  }
  if (conclusions.length === 0) conclusions.push('暂无足够数据生成自动结论，请查看详细指标');
  for (const c of conclusions) lines.push(`  ${c}`);

  lines.push('\n' + '='.repeat(72));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------
export async function mapleRoutes(app: FastifyInstance) {

  /**
   * POST /api/maple/runs
   * 上传一次采样 run。
   * body: multipart
   *   - meta: JSON string（meta.json 内容）
   *   - perf_data: 二进制文件（可选）
   *   - ptrace: 二进制文件（可选）
   *   - pdata_*: 一个或多个 .pdata 文件（可选）
   *   - simpleperf_json: JSON 文件（maple_compare.py 输出，可选）
   */
  app.post('/maple/runs', async (request, reply) => {
    const parts = request.parts();
    let metaStr = '';
    const savedFiles: Record<string, string> = {};

    // 先解析元信息，再处理文件
    const fileBuffers: Array<{ fieldname: string; filename: string; buf: Buffer }> = [];

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'meta') {
        metaStr = part.value as string;
      } else if (part.type === 'file') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk);
        fileBuffers.push({ fieldname: part.fieldname, filename: part.filename, buf: Buffer.concat(chunks) });
      }
    }

    if (!metaStr) return reply.status(400).send({ error: '缺少 meta 字段' });

    let meta: any;
    try { meta = JSON.parse(metaStr); } catch { return reply.status(400).send({ error: 'meta 不是合法 JSON' }); }

    const runId = meta.run_label || meta.label || randomUUID();
    const runDir = getRunDir(runId);

    // 保存文件
    const pdataPaths: string[] = [];
    for (const { fieldname, filename, buf } of fileBuffers) {
      const savePath = path.join(runDir, filename || fieldname);
      fs.writeFileSync(savePath, buf);
      savedFiles[fieldname] = savePath;
      if (filename?.endsWith('.pdata') || fieldname.startsWith('pdata')) {
        pdataPaths.push(savePath);
      }
    }

    const db = getDb();
    await db.insert(mapleRuns).values({
      id: runId,
      label: meta.label || runId,
      device: meta.device || '',
      scene: meta.scene || '',
      durationSec: meta.duration_sec || 0,
      frameCount: meta.frame_count || null,
      monoNsStart: meta.mono_ns_start != null ? String(meta.mono_ns_start) : null,
      monoNsEnd: meta.mono_ns_end != null ? String(meta.mono_ns_end) : null,
      perfDataPath: savedFiles['perf_data'] || null,
      ptracePath: savedFiles['ptrace'] || null,
      pdataPaths: pdataPaths.length > 0 ? JSON.stringify(pdataPaths) : null,
      metaJson: metaStr,
      status: 'pending',
      createdAt: Date.now(),
    }).onConflictDoUpdate({
      target: mapleRuns.id,
      set: {
        frameCount: meta.frame_count || null,
        monoNsStart: meta.mono_ns_start != null ? String(meta.mono_ns_start) : null,
        monoNsEnd: meta.mono_ns_end != null ? String(meta.mono_ns_end) : null,
        perfDataPath: savedFiles['perf_data'] || null,
        ptracePath: savedFiles['ptrace'] || null,
        pdataPaths: pdataPaths.length > 0 ? JSON.stringify(pdataPaths) : null,
        metaJson: metaStr,
        status: 'pending',
      }
    });

    return reply.send({ runId, status: 'pending', message: '上传成功，调用 /analyze 开始分析' });
  });

  /**
   * POST /api/maple/runs/:id/analyze
   * 触发对指定 run 的分析（pdata + perfetto）。
   */
  app.post('/maple/runs/:id/analyze', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const run = await db.select().from(mapleRuns).where(eq(mapleRuns.id, id)).get();
    if (!run) return reply.status(404).send({ error: `run not found: ${id}` });

    // 异步触发，立即返回
    setImmediate(() => analyzeRun(id).catch(e => console.error('[maple routes] analyzeRun error:', e)));

    return reply.send({ runId: id, status: 'analyzing' });
  });

  /**
   * GET /api/maple/runs
   * 列出所有 runs。
   */
  app.get('/maple/runs', async (_request, reply) => {
    const db = getDb();
    const runs = await db.select().from(mapleRuns).orderBy(desc(mapleRuns.createdAt)).all();
    return reply.send(runs);
  });

  /**
   * GET /api/maple/runs/:id
   * 获取单个 run 详情，含 pdata + perfetto 分析结果。
   */
  app.get('/maple/runs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const [run, pdata, perfetto] = await Promise.all([
      db.select().from(mapleRuns).where(eq(mapleRuns.id, id)).get(),
      db.select().from(maplePdataResults).where(eq(maplePdataResults.runId, id)).get(),
      db.select().from(maplePerfettoResults).where(eq(maplePerfettoResults.runId, id)).get(),
    ]);
    if (!run) return reply.status(404).send({ error: `run not found: ${id}` });
    return reply.send({ run, pdataResult: pdata ?? null, perfettoResult: perfetto ?? null });
  });

  /**
   * POST /api/maple/compare
   * 对比 base vs opt，生成综合报告。
   * body: { baseRunId, optRunId, simpleperfJsonPath? }
   */
  app.post('/maple/compare', async (request, reply) => {
    const { baseRunId, optRunId, simpleperfJsonPath } = request.body as {
      baseRunId: string;
      optRunId: string;
      simpleperfJsonPath?: string;
    };

    const db = getDb();
    const [base, opt, bPdata, oPdata, bPerf, oPerf] = await Promise.all([
      db.select().from(mapleRuns).where(eq(mapleRuns.id, baseRunId)).get(),
      db.select().from(mapleRuns).where(eq(mapleRuns.id, optRunId)).get(),
      db.select().from(maplePdataResults).where(eq(maplePdataResults.runId, baseRunId)).get(),
      db.select().from(maplePdataResults).where(eq(maplePdataResults.runId, optRunId)).get(),
      db.select().from(maplePerfettoResults).where(eq(maplePerfettoResults.runId, baseRunId)).get(),
      db.select().from(maplePerfettoResults).where(eq(maplePerfettoResults.runId, optRunId)).get(),
    ]);

    if (!base || !opt) return reply.status(404).send({ error: 'base 或 opt run 不存在' });

    const reportText = buildCompareReportText(base, opt, bPdata, oPdata, bPerf, oPerf);

    // 计算结论 JSON
    const scriptingDelta = (bPdata && oPdata && bPdata.scriptingMs > 0)
      ? (oPdata.scriptingMs - bPdata.scriptingMs) / bPdata.scriptingMs * 100
      : null;
    const isOptEffective = scriptingDelta != null ? scriptingDelta < -1 : null;
    const conclusionJson = JSON.stringify({ isOptEffective, scriptingDeltaPct: scriptingDelta });

    const reportId = randomUUID();
    await db.insert(mapleCompareReports).values({
      id: reportId,
      baseRunId,
      optRunId,
      simpleperfJsonPath: simpleperfJsonPath || null,
      il2cppBasePct: null,
      il2cppOptPct: null,
      il2cppDeltaPp: null,
      il2cppBaseMs: null,
      il2cppOptMs: null,
      il2cppDeltaPct: null,
      scriptingBaseMsPerFrame: bPdata?.scriptingMs ?? null,
      scriptingOptMsPerFrame: oPdata?.scriptingMs ?? null,
      scriptingDeltaPct: scriptingDelta,
      slowFramesBasePct: bPdata ? bPdata.slowFrames33Rate * 100 : null,
      slowFramesOptPct: oPdata ? oPdata.slowFrames33Rate * 100 : null,
      mainRunningBasePct: bPerf?.mainThreadRunningPct ?? null,
      mainRunningOptPct: oPerf?.mainThreadRunningPct ?? null,
      frameP95BaseMs: bPerf?.frameP95Ms ?? null,
      frameP95OptMs: oPerf?.frameP95Ms ?? null,
      conclusionJson,
      reportText,
      createdAt: Date.now(),
    });

    return reply.send({ reportId, reportText, conclusionJson });
  });

  /**
   * GET /api/maple/compare/:id
   * 获取对比报告详情。
   */
  app.get('/maple/compare/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const report = await db.select().from(mapleCompareReports)
      .where(eq(mapleCompareReports.id, id)).get();
    if (!report) return reply.status(404).send({ error: 'report not found' });

    const [base, opt, bPdata, oPdata, bPerf, oPerf] = await Promise.all([
      db.select().from(mapleRuns).where(eq(mapleRuns.id, report.baseRunId)).get(),
      db.select().from(mapleRuns).where(eq(mapleRuns.id, report.optRunId)).get(),
      db.select().from(maplePdataResults).where(eq(maplePdataResults.runId, report.baseRunId)).get(),
      db.select().from(maplePdataResults).where(eq(maplePdataResults.runId, report.optRunId)).get(),
      db.select().from(maplePerfettoResults).where(eq(maplePerfettoResults.runId, report.baseRunId)).get(),
      db.select().from(maplePerfettoResults).where(eq(maplePerfettoResults.runId, report.optRunId)).get(),
    ]);

    return reply.send({
      report,
      base: { run: base, pdataResult: bPdata, perfettoResult: bPerf },
      opt: { run: opt, pdataResult: oPdata, perfettoResult: oPerf },
    });
  });

  /**
   * DELETE /api/maple/runs/:id
   */
  app.delete('/maple/runs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const run = await db.select().from(mapleRuns).where(eq(mapleRuns.id, id)).get();
    if (!run) return reply.status(404).send({ error: `run not found: ${id}` });

    await db.delete(mapleRuns).where(eq(mapleRuns.id, id));

    // 清理文件目录
    const runDir = path.join(getMapleDir(), id);
    if (fs.existsSync(runDir)) fs.rmSync(runDir, { recursive: true, force: true });

    return reply.send({ deleted: id });
  });
}
