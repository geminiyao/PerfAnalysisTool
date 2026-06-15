import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

/** 分析会话表 - 每次分析为一个 session */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull().default(0),
  filePath: text('file_path'),
  status: text('status').notNull().default('pending'), // pending | queued | running | completed | failed
  createdBy: text('created_by').notNull().default(''),
  projectName: text('project_name').notNull().default(''),
  version: text('version').notNull().default(''),
  branch: text('branch'),
  device: text('device'),
  scene: text('scene'),
  notes: text('notes'),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
  duration: integer('duration'),
  error: text('error'),
});

/** simpleperf 分析会话表 */
export const simpleperfSessions = sqliteTable('simpleperf_sessions', {
  id: text('id').primaryKey(),
  runId: text('run_id'),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull().default(0),
  perfDataPath: text('perf_data_path').notNull(),
  binaryCachePath: text('binary_cache_path'),
  status: text('status').notNull().default('pending'),
  projectName: text('project_name').notNull().default(''),
  version: text('version').notNull().default(''),
  branch: text('branch'),
  buildId: text('build_id'),
  device: text('device'),
  scene: text('scene'),
  notes: text('notes'),
  resultJsonPath: text('result_json_path'),
  resultTextPath: text('result_text_path'),
  foldedPath: text('folded_path'),
  flamegraphPath: text('flamegraph_path'),
  aiReportPath: text('ai_report_path'),
  error: text('error'),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
  duration: integer('duration'),
}, table => ({
  statusIdx: index('idx_simpleperf_sessions_status').on(table.status),
  createdAtIdx: index('idx_simpleperf_sessions_created_at').on(table.createdAt),
  runIdx: index('idx_simpleperf_sessions_run_id').on(table.runId),
}));

/** 统一资产表 - 管理原始文件和分析产物 */
export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(),
  assetType: text('asset_type').notNull(),
  source: text('source').notNull(),
  fileName: text('file_name').notNull(),
  fileSize: integer('file_size').notNull().default(0),
  sha256: text('sha256').notNull(),
  storageBackend: text('storage_backend').notNull().default('local'),
  localPath: text('local_path'),
  remoteKey: text('remote_key'),
  mimeType: text('mime_type'),
  metadataJson: text('metadata_json'),
  createdAt: integer('created_at').notNull(),
}, table => ({
  sha256Idx: index('idx_assets_sha256').on(table.sha256),
  typeIdx: index('idx_assets_asset_type').on(table.assetType),
  createdAtIdx: index('idx_assets_created_at').on(table.createdAt),
}));

/** Session 与 Asset 的关系表 */
export const sessionAssets = sqliteTable('session_assets', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  sessionType: text('session_type').notNull(),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => ({
  sessionIdx: index('idx_session_assets_session').on(table.sessionId, table.sessionType),
  assetIdx: index('idx_session_assets_asset_id').on(table.assetId),
}));

/** 指标表 - 从 preprocess-result.json 中提取的关键数值 */
export const metrics = sqliteTable('metrics', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  totalFrames: integer('total_frames').notNull().default(0),
  avgFrameMs: real('avg_frame_ms').notNull().default(0),
  maxFrameMs: real('max_frame_ms').notNull().default(0),
  medianFrameMs: real('median_frame_ms').notNull().default(0),
  p95FrameMs: real('p95_frame_ms').notNull().default(0),
  fps: real('fps').notNull().default(0),
  jankCount: integer('jank_count').notNull().default(0),
  jankRate: real('jank_rate').notNull().default(0),
  bigJankCount: integer('big_jank_count').notNull().default(0),
  topMarkerCount: integer('top_marker_count').notNull().default(0),
  topMarkerTotalMs: real('top_marker_total_ms').notNull().default(0),
  spikeCount: integer('spike_count').notNull().default(0),
});

/** 标签表 - 灵活分类和筛选 */
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
});

/** 报告表 - AI 生成的分析报告 */
export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  content: text('content'),
  score: real('score'),
  createdAt: integer('created_at').notNull(),
});

/** 优化方案表 - 每条 issue 的 AI 优化建议 */
export const optimizeResults = sqliteTable('optimize_results', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  issueKey: text('issue_key').notNull(),
  issueType: text('issue_type').notNull(),
  result: text('result'),
  sourceFiles: text('source_files'),
  createdAt: integer('created_at').notNull(),
});

// ============================================================
// Maple ILOpt 同步采样专用表
// ============================================================

/**
 * maple_runs — 每次同步采样 run 的元信息。
 * 由 maple_sample.py 采样完成后上传，包含所有原始文件路径和 clock_monotonic 时间戳。
 */
export const mapleRuns = sqliteTable('maple_runs', {
  id: text('id').primaryKey(),              // run_label，如 maple_base_Pixel7_20260611_1430
  label: text('label').notNull(),           // base / opt
  device: text('device').notNull().default(''),
  scene: text('scene').notNull().default(''),
  durationSec: integer('duration_sec').notNull().default(0),
  frameCount: integer('frame_count'),
  monoNsStart: text('mono_ns_start'),       // 用 text 存 bigint（JS 无 int64）
  monoNsEnd: text('mono_ns_end'),
  // 文件路径（服务端本地存储）
  perfDataPath: text('perf_data_path'),     // perf.data
  ptracePath: text('ptrace_path'),          // trace.pftrace
  pdataPaths: text('pdata_paths'),          // JSON array of .pdata file paths
  metaJson: text('meta_json'),              // 原始 meta.json 内容
  // 状态
  status: text('status').notNull().default('pending'), // pending | analyzing | completed | failed
  error: text('error'),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
}, table => ({
  labelIdx: index('idx_maple_runs_label').on(table.label),
  statusIdx: index('idx_maple_runs_status').on(table.status),
  createdAtIdx: index('idx_maple_runs_created_at').on(table.createdAt),
}));

/**
 * maple_pdata_results — Unity Profiler .pdata 自动解析结果。
 * 每个 run 对应一行，存储帧均指标和帧分布。
 */
export const maplePdataResults = sqliteTable('maple_pdata_results', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => mapleRuns.id, { onDelete: 'cascade' }),
  // 帧时间指标
  totalFrames: integer('total_frames').notNull().default(0),
  avgFrameMs: real('avg_frame_ms').notNull().default(0),
  p50FrameMs: real('p50_frame_ms').notNull().default(0),
  p95FrameMs: real('p95_frame_ms').notNull().default(0),
  p99FrameMs: real('p99_frame_ms').notNull().default(0),
  maxFrameMs: real('max_frame_ms').notNull().default(0),
  // Unity Profiler 关键 marker 帧均（ms/frame）
  scriptingMs: real('scripting_ms').notNull().default(0),          // BehaviourUpdate / Scripting
  waitForTargetFpsMs: real('wait_for_target_fps_ms').notNull().default(0),
  renderingMs: real('rendering_ms').notNull().default(0),
  physicsMs: real('physics_ms').notNull().default(0),
  gcAllocCount: integer('gc_alloc_count').notNull().default(0),     // 帧均 GC.Alloc 次数
  gcAllocBytes: real('gc_alloc_bytes').notNull().default(0),        // 帧均 GC.Alloc 字节
  // 慢帧
  slowFrames33Count: integer('slow_frames_33_count').notNull().default(0),  // >33ms
  slowFrames50Count: integer('slow_frames_50_count').notNull().default(0),  // >50ms
  slowFrames33Rate: real('slow_frames_33_rate').notNull().default(0),
  // 原始帧分布（JSON，供前端绘制直方图）
  frameDistJson: text('frame_dist_json'),
  // 原始 marker 汇总（JSON，供前端查看 top markers）
  topMarkersJson: text('top_markers_json'),
  createdAt: integer('created_at').notNull(),
}, table => ({
  runIdx: index('idx_maple_pdata_run_id').on(table.runId),
}));

/**
 * maple_perfetto_results — perfetto trace 自动解析结果。
 * 使用 perfetto TraceProcessor Python API（pip install perfetto）解析。
 */
export const maplePerfettoResults = sqliteTable('maple_perfetto_results', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => mapleRuns.id, { onDelete: 'cascade' }),
  // 采样窗口（从 atrace CombinedProfile_xxx 色块提取）
  profileWindowStartNs: text('profile_window_start_ns'),
  profileWindowEndNs: text('profile_window_end_ns'),
  profileWindowDurMs: real('profile_window_dur_ms'),
  // UnityMain 线程调度
  mainThreadRunningPct: real('main_thread_running_pct'),    // Running 时间占比 %
  mainThreadRunnablePct: real('main_thread_runnable_pct'),  // Runnable（被抢占）%
  mainThreadSleepingPct: real('main_thread_sleeping_pct'),  // Sleeping（等 vsync/GPU）%
  // CPU 频率（均值 MHz）
  cpuFreqAvgMhz: real('cpu_freq_avg_mhz'),
  // GPU
  gpuFreqAvgMhz: real('gpu_freq_avg_mhz'),
  gpuUtilizationPct: real('gpu_utilization_pct'),           // 如果设备驱动上报
  // 帧时长（从 Choreographer 提取）
  frameP50Ms: real('frame_p50_ms'),
  frameP95Ms: real('frame_p95_ms'),
  frameP99Ms: real('frame_p99_ms'),
  frameAvgMs: real('frame_avg_ms'),
  // Binder
  binderCallCount: integer('binder_call_count'),
  binderAvgDurMs: real('binder_avg_dur_ms'),
  // 内存（PSS MB）
  pssMb: real('pss_mb'),
  // 状态（perfetto 解析可能因设备不支持某些 counter 而部分失败）
  parseStatus: text('parse_status').notNull().default('ok'), // ok | partial | failed
  parseNotes: text('parse_notes'),                           // 部分字段缺失时的说明
  createdAt: integer('created_at').notNull(),
}, table => ({
  runIdx: index('idx_maple_perfetto_run_id').on(table.runId),
}));

/**
 * maple_compare_reports — 两次 run（base vs opt）对比报告。
 * 整合 simpleperf + pdata + perfetto 三个维度，自动生成结论。
 */
export const mapleCompareReports = sqliteTable('maple_compare_reports', {
  id: text('id').primaryKey(),
  baseRunId: text('base_run_id').notNull().references(() => mapleRuns.id),
  optRunId: text('opt_run_id').notNull().references(() => mapleRuns.id),
  // simpleperf 核心指标（从 maple_compare.py 输出的 JSON 读入）
  simpleperfJsonPath: text('simpleperf_json_path'),
  il2cppBasePct: real('il2cpp_base_pct'),
  il2cppOptPct: real('il2cpp_opt_pct'),
  il2cppDeltaPp: real('il2cpp_delta_pp'),
  il2cppBaseMs: real('il2cpp_base_ms'),
  il2cppOptMs: real('il2cpp_opt_ms'),
  il2cppDeltaPct: real('il2cpp_delta_pct'),
  // Unity Profiler 对比（从 pdata_results 计算）
  scriptingBaseMsPerFrame: real('scripting_base_ms_per_frame'),
  scriptingOptMsPerFrame: real('scripting_opt_ms_per_frame'),
  scriptingDeltaPct: real('scripting_delta_pct'),
  slowFramesBasePct: real('slow_frames_base_pct'),
  slowFramesOptPct: real('slow_frames_opt_pct'),
  // perfetto 对比
  mainRunningBasePct: real('main_running_base_pct'),
  mainRunningOptPct: real('main_running_opt_pct'),
  frameP95BaseMs: real('frame_p95_base_ms'),
  frameP95OptMs: real('frame_p95_opt_ms'),
  // 结论
  conclusionJson: text('conclusion_json'),  // { isOptEffective, confidence, notes[] }
  reportText: text('report_text'),          // 完整文本报告
  createdAt: integer('created_at').notNull(),
}, table => ({
  baseIdx: index('idx_maple_compare_base').on(table.baseRunId),
  optIdx: index('idx_maple_compare_opt').on(table.optRunId),
}));

export const mapleCompareSessions = sqliteTable('maple_compare_sessions', {
  id: text('id').primaryKey(),
  label: text('label').notNull().default(''),
  device: text('device').notNull().default(''),
  scene: text('scene').notNull().default(''),
  baseDir: text('base_dir'),
  optDir: text('opt_dir'),
  status: text('status').notNull().default('pending'),
  error: text('error'),
  resultJsonPath: text('result_json_path'),
  reportMdPath: text('report_md_path'),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
  duration: integer('duration'),
}, table => ({
  statusIdx: index('idx_maple_compare_sessions_status').on(table.status),
  createdAtIdx: index('idx_maple_compare_sessions_created_at').on(table.createdAt),
}));
