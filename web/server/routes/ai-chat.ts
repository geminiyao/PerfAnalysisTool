import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import path from 'path';
import { getConfig } from '../utils/config.js';
import {
  createOrGetAiSession,
  destroyAiSession,
  getAvailableAiModels,
  type ThinkingConfig,
} from '../services/ai-agent-session.js';

interface ChatRequestBody {
  message?: string;
  model?: string;
  thinking?: 'adaptive' | 'enabled' | 'disabled';
  thinkingBudget?: number;
  contextType?: 'simpleperf' | 'profiler' | 'general';
  sessionId?: string;
}

export async function aiChatRoutes(app: FastifyInstance) {
  app.get('/ai/models', async () => ({ success: true, data: await getAvailableAiModels() }));

  app.post('/ai/chat', async (request, reply) => {
    const body = (request.body || {}) as ChatRequestBody;
    const message = (body.message || '').trim();
    const model = body.model || 'claude-sonnet-4.6';
    const contextType = body.contextType || 'simpleperf';

    if (!message) {
      return reply.status(400).send({ success: false, error: 'Message is required' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const writeEvent = (event: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const userMsgId = randomUUID();
    writeEvent({ type: 'user_message', id: userMsgId, content: message, createdAt: new Date().toISOString() });

    if (model === 'mock') {
      await streamMock(writeEvent, contextType);
      reply.raw.end();
      return;
    }

    const startedAt = Date.now();
    const sessionKey = body.sessionId || 'ai-workbench-default';
    const thinking = buildThinkingConfig(body.thinking || 'adaptive', body.thinkingBudget);
    const prompt = buildPrompt(message, contextType, body.thinking || 'adaptive');
    const entry = createOrGetAiSession(sessionKey, { model, thinking });

    try {
      if (model && model !== entry.model) {
        await entry.session.setModel(model);
        entry.model = model;
      }

      await entry.session.send(prompt);

      let assistantContent = '';
      let toolCalls = 0;
      let statsSent = false;

      for await (const msg of entry.session.stream()) {
        entry.lastActive = Date.now();
        const event = msg as any;

        if (event.type === 'assistant') {
          for (const block of event.message?.content || []) {
            if (block.type === 'text' && block.text) {
              assistantContent += block.text;
              writeEvent({ type: 'text', content: block.text });
            } else if (block.type === 'tool_use') {
              toolCalls++;
              writeEvent({
                type: 'tool_use',
                toolName: block.name || 'unknown',
                toolInput: formatToolInput(block.input),
              });
            }
          }
        } else if (event.type === 'stream_event') {
          for (const block of event.message?.content || []) {
            if (block.type === 'text' && block.text) {
              assistantContent += block.text;
              writeEvent({ type: 'delta', content: block.text });
            }
          }
        } else if (event.type === 'result') {
          const stats = extractTokenStats(event, toolCalls, startedAt);
          statsSent = true;
          if (event.subtype === 'success' && event.result && !assistantContent) {
            assistantContent = event.result;
            writeEvent({ type: 'text', content: event.result });
          }
          writeEvent({ type: 'stats', ...stats });
        }
      }

      if (!statsSent) {
        writeEvent({ type: 'stats', ...emptyStats(toolCalls, Date.now() - startedAt) });
      }
      writeEvent({ type: 'done', content: assistantContent });
    } catch (err: any) {
      console.error('[ai-chat] Stream error:', err);
      destroyAiSession(sessionKey);
      writeEvent({ type: 'error', message: err.message || 'AI 对话失败' });
    } finally {
      reply.raw.end();
    }
  });
}

function buildThinkingConfig(thinking: NonNullable<ChatRequestBody['thinking']>, thinkingBudget?: number): ThinkingConfig {
  if (thinking === 'enabled') return { type: 'enabled', budgetTokens: thinkingBudget || 10000 };
  if (thinking === 'disabled') return { type: 'disabled' };
  return { type: 'adaptive' };
}

function buildPrompt(message: string, contextType: NonNullable<ChatRequestBody['contextType']>, thinking: NonNullable<ChatRequestBody['thinking']>) {
  const config = getConfig();
  const simpleperfRoot = path.resolve(config.skillProjectPath, 'simpleperf').replace(/\\/g, '/');
  const sourceRoot = (config.sourceProjectPath || '').replace(/\\/g, '/');

  const context = contextType === 'simpleperf'
    ? [
        `当前场景: Android native simpleperf 性能分析验证。`,
        `simpleperf 工具链目录: ${simpleperfRoot}。`,
        `请优先参考 simpleperf/README.md 中的分析口径。`,
        sourceRoot ? `源码根目录: ${sourceRoot}。` : `源码根目录尚未配置，如需源码定位请提示用户在 Settings 配置。`,
      ].join(' ')
    : `当前场景: 通用性能分析。`;

  return [
    context,
    `Thinking 模式: ${thinking}。`,
    `请用中文回答，输出结构包含: 结论摘要、证据、风险点、下一步验证建议。`,
    `用户问题: ${message}`,
  ].join(' ');
}

function extractTokenStats(event: any, toolCalls: number, startedAt: number) {
  const usage = event.usage || event.message?.usage || event.stats || {};
  const inputTokens = usage.input_tokens || usage.inputTokens || 0;
  const outputTokens = usage.output_tokens || usage.outputTokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || usage.cacheReadTokens || 0;
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    totalTokens: inputTokens + outputTokens,
    numTurns: event.num_turns || event.numTurns || 0,
    toolCalls,
    costUsd: event.total_cost_usd || event.cost_usd || event.totalCostUsd || 0,
    durationMs: event.duration_ms || event.durationMs || Date.now() - startedAt,
  };
}

function emptyStats(toolCalls: number, durationMs: number) {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    numTurns: 0,
    toolCalls,
    costUsd: 0,
    durationMs,
  };
}

function formatToolInput(input: unknown): string {
  if (typeof input === 'string') return input.slice(0, 300);
  return JSON.stringify(input || {}).slice(0, 300);
}

async function streamMock(writeEvent: (event: Record<string, unknown>) => void, contextType: string) {
  const chunks = [
    `# Mock AI 分析\n\n`,
    `当前已进入 ${contextType} 验证模式。\n\n`,
    `- 大语言模型选择、快捷提示词、流式输出链路正常。\n`,
    `- 单轮 token/工具统计展示链路正常。\n`,
    `- 后续可接入真实 simpleperf 产物，如 perf.data 分析 JSON、folded stack、热点表。\n`,
  ];
  for (const chunk of chunks) {
    await new Promise(resolve => setTimeout(resolve, 250));
    writeEvent({ type: 'delta', content: chunk });
  }
  writeEvent({
    type: 'stats',
    inputTokens: 1234,
    outputTokens: 567,
    cacheReadTokens: 890,
    totalTokens: 1801,
    numTurns: 1,
    toolCalls: 2,
    costUsd: 0.0012,
    durationMs: 1200,
  });
  writeEvent({ type: 'done' });
}
