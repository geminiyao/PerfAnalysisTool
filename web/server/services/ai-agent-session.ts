import { unstable_v2_createSession as createSession } from '@tencent-ai/agent-sdk';
import type { Message, SessionOptions, ThinkingConfig } from '@tencent-ai/agent-sdk';
import { getConfig } from '../utils/config.js';

export type { Message, ThinkingConfig };

export interface ModelInfo {
  modelId: string;
  name: string;
  description?: string;
}

export interface AiSessionEntry {
  session: ReturnType<typeof createSession>;
  lastActive: number;
  model?: string;
}

const FALLBACK_MODELS: ModelInfo[] = [
  { modelId: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', description: '平衡性能与速度' },
  { modelId: 'claude-opus-4.6', name: 'Claude Opus 4.6', description: '最强推理能力' },
  { modelId: 'deepseek-v3-2-volc-ioa', name: 'DeepSeek V3.2', description: '高性价比' },
  { modelId: 'hunyuan-2.0-thinking-ioa', name: 'Hunyuan 2.0 Thinking', description: '深度思考模型' },
  { modelId: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', description: 'Google 旗舰模型' },
  { modelId: 'gpt-5.4', name: 'GPT 5.4', description: 'OpenAI 最新模型' },
  { modelId: 'glm-5.0-turbo-ioa', name: 'GLM 5.0 Turbo', description: '智谱高速模型' },
  { modelId: 'kimi-k2.5-ioa', name: 'Kimi K2.5', description: 'Moonshot 模型' },
];

const MOCK_MODEL: ModelInfo = { modelId: 'mock', name: 'Mock 验证模型', description: '不调用 AI，仅验证对话 UI 和流式链路' };
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

const sessionPool = new Map<string, AiSessionEntry>();
let cachedModels: ModelInfo[] | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function createOrGetAiSession(
  sessionKey: string,
  options?: { model?: string; thinking?: ThinkingConfig },
): AiSessionEntry {
  const existing = sessionPool.get(sessionKey);
  if (existing) {
    existing.lastActive = Date.now();
    return existing;
  }

  const config = getConfig();
  const env: Record<string, string | undefined> = { ...process.env };
  const sessionOptions: SessionOptions = {
    cwd: config.skillProjectPath,
    env,
    model: options?.model,
    thinking: options?.thinking || { type: 'adaptive' },
    permissionMode: 'bypassPermissions',
    allowedTools: ['Read', 'Grep', 'Glob'],
    includePartialMessages: true,
    systemPrompt: {
      append: buildPerformanceSystemPrompt(),
    },
  };

  const codebuddyPath = config.cliPaths?.codebuddy;
  if (codebuddyPath) {
    sessionOptions.pathToCodebuddyCode = codebuddyPath;
  }

  const session = createSession(sessionOptions);
  const entry: AiSessionEntry = {
    session,
    lastActive: Date.now(),
    model: options?.model,
  };
  sessionPool.set(sessionKey, entry);
  ensureCleanupTimer();
  return entry;
}

export function destroyAiSession(sessionKey: string): void {
  const entry = sessionPool.get(sessionKey);
  if (!entry) return;
  try {
    entry.session.close();
  } catch {
    // ignore
  }
  sessionPool.delete(sessionKey);
}

export async function getAvailableAiModels(): Promise<ModelInfo[]> {
  if (cachedModels) return cachedModels;

  const entry = createOrGetAiSession('_models');
  try {
    await entry.session.connect();
    const models = await entry.session.getAvailableModels();
    if (models?.length) {
      cachedModels = [...models, MOCK_MODEL];
      return cachedModels;
    }
  } catch (err) {
    console.error('[ai-agent-session] Failed to get models:', err);
  }

  cachedModels = [...FALLBACK_MODELS, MOCK_MODEL];
  return cachedModels;
}

function ensureCleanupTimer(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of sessionPool) {
      if (now - entry.lastActive > SESSION_TIMEOUT_MS) {
        destroyAiSession(key);
      }
    }
    if (sessionPool.size === 0 && cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, 60_000);
  cleanupTimer.unref();
}

function buildPerformanceSystemPrompt(): string {
  return [
    '',
    '## 性能分析工作台约束',
    '你是性能分析助手，当前优先服务 Android native simpleperf 验证场景。',
    '请只读取必要的小文件或摘要，避免读取大型原始采样文件。',
    '回答使用中文，结构包含：结论摘要、关键证据、风险点、下一步验证建议。',
    '涉及 simpleperf 时，结论依据优先级为：SO 级 CPU 占比 >= Anchor 子树耗时 >> 函数级 diff。',
  ].join('\n');
}
