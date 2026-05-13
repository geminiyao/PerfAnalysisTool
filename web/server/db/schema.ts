import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

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
