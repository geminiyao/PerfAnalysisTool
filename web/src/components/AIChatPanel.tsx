import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Input, Select, Space, Spin, Tag, Tooltip, Typography } from 'antd';
import { CompressOutlined, ExpandOutlined, ReloadOutlined, RobotOutlined, SendOutlined, StopOutlined, ThunderboltOutlined, ToolOutlined } from '@ant-design/icons';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const { TextArea } = Input;
const { Text } = Typography;
const BASE_URL = '/cpu/api';

const markdownComponents: Components = {
  h1: ({ children }) => <h1 style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', margin: '16px 0 8px', borderBottom: '1px solid #2d3748', paddingBottom: 6 }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', margin: '14px 0 6px' }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, color: '#cbd5e1', margin: '12px 0 4px' }}>{children}</h3>,
  h4: ({ children }) => <h4 style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', margin: '10px 0 4px' }}>{children}</h4>,
  p: ({ children }) => <p style={{ margin: '8px 0', lineHeight: 1.7 }}>{children}</p>,
  strong: ({ children }) => <strong style={{ color: '#e2e8f0', fontWeight: 600 }}>{children}</strong>,
  em: ({ children }) => <em style={{ color: '#a5b4c8' }}>{children}</em>,
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) return <code style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 12 }}>{children}</code>;
    return <code style={{ background: '#1e293b', color: '#93c5fd', padding: '2px 5px', borderRadius: 3, fontSize: 12, fontFamily: 'Consolas, Monaco, monospace', border: '1px solid #334155' }}>{children}</code>;
  },
  pre: ({ children }) => <pre style={{ background: '#0d1117', padding: 12, borderRadius: 6, border: '1px solid #21262d', overflow: 'auto', maxHeight: 420, margin: '8px 0', fontSize: 12, lineHeight: 1.5 }}>{children}</pre>,
  ul: ({ children }) => <ul style={{ margin: '6px 0', paddingLeft: 20 }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: '6px 0', paddingLeft: 20 }}>{children}</ol>,
  li: ({ children }) => <li style={{ margin: '3px 0', lineHeight: 1.6, color: '#b8c5d6' }}>{children}</li>,
  blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid #4a5568', margin: '8px 0', paddingLeft: 12, color: '#8b9ab5' }}>{children}</blockquote>,
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid #2d3748', margin: '12px 0' }} />,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }}>{children}</a>,
  table: ({ children }) => <div style={{ overflowX: 'auto' }}><table style={{ borderCollapse: 'collapse', width: '100%', margin: '8px 0' }}>{children}</table></div>,
  th: ({ children }) => <th style={{ border: '1px solid #334155', padding: '6px 8px', color: '#e2e8f0', background: '#1e293b' }}>{children}</th>,
  td: ({ children }) => <td style={{ border: '1px solid #334155', padding: '6px 8px', color: '#b8c5d6' }}>{children}</td>,
};

interface ModelInfo {
  modelId: string;
  name: string;
  description?: string;
}

interface TokenStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalTokens?: number;
  numTurns: number;
  toolCalls: number;
  costUsd: number;
  durationMs: number;
}

interface ToolCallInfo {
  name: string;
  input: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  createdAt: string;
  isFirstPrompt?: boolean;
  metadata?: {
    tokenStats?: TokenStats;
    toolCalls?: ToolCallInfo[];
  };
}

interface AIChatPanelProps {
  contextType?: 'simpleperf' | 'profiler' | 'general';
  initialPrompt?: string;
}

const QUICK_TEMPLATES = [
  { label: '分析 simpleperf 热点', value: '请基于 simpleperf 的三层分析策略，说明如何判断 native CPU 热点和可靠证据。' },
  { label: '生成验证计划', value: '请给出 simpleperf 单次分析、A/B 对比、火焰图验证的黑盒验收步骤。' },
  { label: '解释采集要求', value: '请说明 perf.data 与 binary_cache/符号文件需要满足哪些条件，为什么。' },
  { label: '风险排查', value: '如果 simpleperf 分析结果函数名缺失或火焰图异常，应该如何排查？' },
];

const fallbackModels: ModelInfo[] = [
  { modelId: 'claude-sonnet-4.6', name: 'Claude Sonnet 4.6', description: '平衡性能与速度' },
  { modelId: 'claude-opus-4.6', name: 'Claude Opus 4.6', description: '最强推理能力' },
  { modelId: 'deepseek-v3-2-volc-ioa', name: 'DeepSeek V3.2', description: '高性价比' },
  { modelId: 'hunyuan-2.0-thinking-ioa', name: 'Hunyuan 2.0 Thinking', description: '深度思考模型' },
  { modelId: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', description: 'Google 旗舰模型' },
  { modelId: 'gpt-5.4', name: 'GPT 5.4', description: 'OpenAI 最新模型' },
  { modelId: 'glm-5.0-turbo-ioa', name: 'GLM 5.0 Turbo', description: '智谱高速模型' },
  { modelId: 'kimi-k2.5-ioa', name: 'Kimi K2.5', description: 'Moonshot 模型' },
  { modelId: 'mock', name: 'Mock 验证模型', description: '不消耗 token' },
];

const AIChatPanel: React.FC<AIChatPanelProps> = ({ contextType = 'simpleperf', initialPrompt }) => {
  const [models, setModels] = useState<ModelInfo[]>(fallbackModels);
  const [selectedModel, setSelectedModel] = useState(fallbackModels[0].modelId);
  const [thinkingMode, setThinkingMode] = useState<'adaptive' | 'enabled' | 'disabled'>('adaptive');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState(initialPrompt || '');
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallInfo[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());
  const abortRef = useRef(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch(`${BASE_URL}/ai/models`)
      .then(res => res.json())
      .then(data => {
        if (data?.success && Array.isArray(data.data) && data.data.length > 0) {
          setModels(data.data);
          if (!data.data.some((m: ModelInfo) => m.modelId === selectedModel)) {
            setSelectedModel(data.data[0].modelId);
          }
        }
      })
      .catch(() => setModels(fallbackModels));
  }, []);

  useEffect(() => {
    if (initialPrompt) setInputValue(initialPrompt);
  }, [initialPrompt]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [messages, streamingContent, streamingToolCalls]);

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? inputValue).trim();
    if (!content || isStreaming) return;

    abortRef.current = false;
    setInputValue('');
    setStreamingContent('');
    setStreamingToolCalls([]);
    setIsStreaming(true);

    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, { id: tempId, role: 'user', content, createdAt: new Date().toISOString() }]);

    let assistantText = '';
    let userMsgHandled = false;
    let pendingStats: TokenStats | null = null;
    let pendingToolCalls: ToolCallInfo[] = [];

    try {
      const res = await fetch(`${BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, model: selectedModel, thinking: thinkingMode, contextType }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || 'AI 请求失败');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!abortRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          const event = JSON.parse(line.slice(6));

          if (event.type === 'user_message' && !userMsgHandled) {
            userMsgHandled = true;
            setMessages(prev => [...prev.filter(m => m.id !== tempId), {
              id: event.id,
              role: 'user',
              content: event.content,
              createdAt: event.createdAt || new Date().toISOString(),
              isFirstPrompt: event.isFirstPrompt,
            }]);
            if (event.isFirstPrompt) {
              setExpandedPrompts(prev => new Set(prev).add(event.id));
            }
          } else if (event.type === 'delta' || event.type === 'text') {
            assistantText += event.content || '';
            setStreamingContent(assistantText);
          } else if (event.type === 'tool_use') {
            const toolInfo: ToolCallInfo = {
              name: event.toolName || 'unknown',
              input: typeof event.toolInput === 'string' ? event.toolInput : JSON.stringify(event.toolInput || {}),
            };
            pendingToolCalls = [...pendingToolCalls, toolInfo];
            setStreamingToolCalls([...pendingToolCalls]);
          } else if (event.type === 'stats') {
            pendingStats = {
              inputTokens: event.inputTokens || 0,
              outputTokens: event.outputTokens || 0,
              cacheReadTokens: event.cacheReadTokens || 0,
              totalTokens: event.totalTokens || ((event.inputTokens || 0) + (event.outputTokens || 0)),
              numTurns: event.numTurns || 0,
              toolCalls: event.toolCalls || pendingToolCalls.length,
              costUsd: event.costUsd || 0,
              durationMs: event.durationMs || 0,
            };
          } else if (event.type === 'done') {
            const nextMsgs: ChatMessage[] = [];
            if (assistantText) {
              nextMsgs.push({
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: assistantText,
                model: selectedModel,
                createdAt: new Date().toISOString(),
                metadata: pendingToolCalls.length > 0 ? { toolCalls: pendingToolCalls } : undefined,
              });
            }
            if (pendingStats) {
              nextMsgs.push({ id: `stats-${Date.now()}`, role: 'system', content: '', createdAt: new Date().toISOString(), metadata: { tokenStats: pendingStats } });
            }
            if (nextMsgs.length > 0) setMessages(prev => [...prev, ...nextMsgs]);
            setStreamingContent('');
            setStreamingToolCalls([]);
          } else if (event.type === 'error') {
            setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'assistant', content: `错误: ${event.message || event.error}`, createdAt: new Date().toISOString() }]);
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => [...prev.filter(m => m.id !== tempId), { id: `err-${Date.now()}`, role: 'assistant', content: `连接失败: ${err.message}`, createdAt: new Date().toISOString() }]);
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      setStreamingToolCalls([]);
    }
  }, [contextType, inputValue, isStreaming, selectedModel, thinkingMode]);

  const stopStreaming = () => {
    abortRef.current = true;
    setIsStreaming(false);
  };

  const clearChat = () => {
    setMessages([]);
    setStreamingContent('');
    setStreamingToolCalls([]);
  };

  const togglePromptExpand = (msgId: string) => {
    setExpandedPrompts(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const renderTokenStats = (stats: TokenStats) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, padding: '10px 14px', background: '#1a2332', borderRadius: 8, border: '1px solid #2a4a6a' }}>
      <StatCell label="输入 Token" value={stats.inputTokens.toLocaleString()} color="#60a5fa" />
      <StatCell label="输出 Token" value={stats.outputTokens.toLocaleString()} color="#34d399" />
      {stats.cacheReadTokens > 0 && <StatCell label="缓存读取" value={stats.cacheReadTokens.toLocaleString()} color="#a78bfa" />}
      <StatCell label="对话轮次" value={stats.numTurns} color="#fbbf24" />
      <StatCell label="工具调用" value={stats.toolCalls} color="#fb923c" />
      <StatCell label="耗时" value={formatDuration(stats.durationMs)} color="#e2e8f0" />
      {stats.costUsd > 0 && <StatCell label="费用" value={`$${stats.costUsd.toFixed(4)}`} color="#f472b6" />}
    </div>
  );

  const renderMessage = (msg: ChatMessage) => {
    if (msg.metadata?.tokenStats) {
      return (
        <div key={msg.id}>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>对话统计</span>
            <span style={{ color: '#475569' }}>{formatTime(msg.createdAt)}</span>
          </div>
          {renderTokenStats(msg.metadata.tokenStats)}
        </div>
      );
    }

    if (msg.role === 'system') {
      return (
        <div key={msg.id}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 600, color: '#64748b' }}>系统</span>
            <span style={{ color: '#64748b', fontSize: 11 }}>{formatTime(msg.createdAt)}</span>
          </div>
          <pre style={{ fontSize: 11, color: '#8b9ab5', background: '#0d1117', padding: 10, borderRadius: 6, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{msg.content}</pre>
        </div>
      );
    }

    if (msg.role === 'user' && msg.isFirstPrompt) {
      const expanded = expandedPrompts.has(msg.id);
      return (
        <div key={msg.id}>
          <MessageHeader role="user" createdAt={msg.createdAt} />
          <div style={{ cursor: 'pointer', color: '#a78bfa', fontSize: 12 }} onClick={() => togglePromptExpand(msg.id)}>
            {expanded ? <CompressOutlined /> : <ExpandOutlined />} 分析提示词 ({msg.content.length} 字符) {expanded ? '收起' : '展开查看'}
          </div>
          {expanded && <PromptBlock content={msg.content} />}
        </div>
      );
    }

    const isUser = msg.role === 'user';
    return (
      <div key={msg.id}>
        <MessageHeader role={msg.role} createdAt={msg.createdAt} model={msg.model ? modelName(msg.model, models) : undefined} />
        {msg.metadata?.toolCalls && msg.metadata.toolCalls.length > 0 && renderToolCalls(msg.id, msg.metadata.toolCalls)}
        <div style={{ color: isUser ? '#94a3b8' : '#c8d1dc', fontSize: 12, lineHeight: 1.7 }}>
          {isUser ? <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div> : <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content}</ReactMarkdown>}
        </div>
      </div>
    );
  };

  const renderToolCalls = (msgId: string, tools: ToolCallInfo[]) => (
    <div style={{ marginBottom: 8 }}>
      {tools.map((tc, i) => {
        const tcKey = `${msgId}-tool-${i}`;
        const isExpanded = expandedToolCalls.has(tcKey);
        return (
          <div key={tcKey} style={{ marginBottom: 4, background: '#12151a', border: '1px solid #1e2433', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ padding: '5px 10px', fontSize: 11, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setExpandedToolCalls(prev => { const next = new Set(prev); next.has(tcKey) ? next.delete(tcKey) : next.add(tcKey); return next; })}>
              <ToolOutlined style={{ color: '#8b5cf6', fontSize: 11 }} />
              <span style={{ color: '#94a3b8', fontWeight: 500 }}>{tc.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#475569' }}>{isExpanded ? '收起' : '展开'}</span>
            </div>
            {isExpanded && <pre style={{ margin: 0, padding: '6px 10px', fontSize: 10, color: '#64748b', background: '#0a0c10', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 120, overflow: 'auto' }}>{tc.input}</pre>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ borderRadius: 8, border: '1px solid #303540', background: '#1a1d23', display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #303540', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space>
          <RobotOutlined style={{ color: '#a78bfa' }} />
          <Text style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>AI 对话</Text>
        </Space>
        <Tooltip title="重置对话">
          <Button size="small" type="text" icon={<ReloadOutlined />} onClick={clearChat} style={{ color: '#64748b' }} />
        </Tooltip>
      </div>

      <div ref={messagesContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', fontSize: 12 }}>
        {messages.length === 0 && !isStreaming && (
          <div style={{ padding: '20px 0' }}>
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>快速开始:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {QUICK_TEMPLATES.map(t => (
                <Tag key={t.label} icon={<ThunderboltOutlined />} style={{ cursor: 'pointer', background: '#262a33', border: '1px solid #3b4252', color: '#94a3b8', borderRadius: 6, padding: '4px 12px', fontSize: 13 }} onClick={() => setInputValue(t.value)}>
                  {t.label}
                </Tag>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={msg.id} style={{ marginBottom: idx < messages.length - 1 ? 16 : 0, paddingBottom: idx < messages.length - 1 ? 16 : 0, borderBottom: idx < messages.length - 1 ? '1px solid #1e2433' : 'none' }}>
            {renderMessage(msg)}
          </div>
        ))}

        {isStreaming && streamingContent && (
          <div style={{ marginTop: messages.length > 0 ? 16 : 0, paddingTop: messages.length > 0 ? 16 : 0, borderTop: messages.length > 0 ? '1px solid #1e2433' : 'none' }}>
            <MessageHeader role="assistant" />
            {streamingToolCalls.length > 0 && <div style={{ marginBottom: 8 }}>{streamingToolCalls.map((tc, i) => <div key={`stream-tool-${i}`} style={{ marginBottom: 3, padding: '4px 10px', background: '#12151a', border: '1px solid #1e2433', borderRadius: 5, fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}><ToolOutlined style={{ color: '#8b5cf6', fontSize: 11 }} /><span style={{ color: '#94a3b8', fontWeight: 500 }}>{tc.name}</span></div>)}</div>}
            <div style={{ color: '#c8d1dc', fontSize: 12, lineHeight: 1.7 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{streamingContent}</ReactMarkdown>
              <span style={{ color: '#a78bfa' }}>▊</span>
            </div>
          </div>
        )}

        {isStreaming && !streamingContent && <div style={{ padding: '12px 0', textAlign: 'center' }}><Spin size="small" /> <Text style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>思考中...</Text></div>}
      </div>

      <div style={{ padding: '12px 16px', borderTop: '1px solid #303540' }}>
        <TextArea
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          autoSize={{ minRows: 3, maxRows: 8 }}
          disabled={isStreaming}
          style={{ background: '#262a33', border: '1px solid #3b4252', borderRadius: 8, color: '#e2e8f0', fontSize: 13, resize: 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <Space size={8}>
            <Select size="small" value={selectedModel} onChange={setSelectedModel} style={{ minWidth: 180 }} options={models.map(m => ({ value: m.modelId, label: m.name || m.modelId }))} disabled={isStreaming} />
            <Select size="small" value={thinkingMode} onChange={setThinkingMode} style={{ minWidth: 108 }} disabled={isStreaming} options={[{ value: 'adaptive', label: '自适应' }, { value: 'enabled', label: '深度思考' }, { value: 'disabled', label: '无思考' }]} />
          </Space>
          {isStreaming ? <Button size="small" danger icon={<StopOutlined />} onClick={stopStreaming}>停止</Button> : <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => sendMessage()} disabled={!inputValue.trim()}>发送</Button>}
        </div>
      </div>
    </div>
  );
};

function MessageHeader({ role, createdAt, model }: { role: 'user' | 'assistant' | 'system'; createdAt?: string; model?: string }) {
  const isUser = role === 'user';
  return (
    <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontWeight: 600, color: isUser ? '#60a5fa' : '#a78bfa' }}>{isUser ? '你' : 'AI'}</span>
      {model && <span style={{ color: '#64748b', fontSize: 11 }}>{model}</span>}
      {createdAt && <span style={{ color: '#64748b', fontSize: 11, marginLeft: 'auto' }}>{formatTime(createdAt)}</span>}
    </div>
  );
}

function PromptBlock({ content }: { content: string }) {
  return <pre style={{ marginTop: 8, fontSize: 11, color: '#c8d1dc', background: '#0a0a12', padding: 10, borderRadius: 6, border: '1px solid #21262d', maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'Consolas, Monaco, monospace', lineHeight: 1.5 }}>{content}</pre>;
}

function StatCell({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return <div style={{ textAlign: 'center' }}><div style={{ fontSize: 11, color: '#64748b' }}>{label}</div><div style={{ fontSize: 15, color, fontWeight: 600 }}>{value}</div></div>;
}

function modelName(modelId: string, models: ModelInfo[]): string {
  return models.find(m => m.modelId === modelId)?.name || modelId;
}

function formatTime(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

export default AIChatPanel;
