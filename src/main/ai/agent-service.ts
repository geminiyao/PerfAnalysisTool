/**
 * AI Agent Service - integrates @tencent-ai/agent-sdk for real AI analysis.
 *
 * Uses the query() API for one-shot analysis and streams results back
 * to renderer via IPC events.
 */
import { BrowserWindow } from 'electron'
import { ProfileAnalysisResult } from '../profiler/types'
import { buildAnalysisPrompt, buildFollowUpPrompt } from './prompt-builder'

// SDK is loaded dynamically to handle cases where it may not be available
let sdkModule: typeof import('@tencent-ai/agent-sdk') | null = null

async function loadSdk(): Promise<typeof import('@tencent-ai/agent-sdk')> {
  if (!sdkModule) {
    try {
      sdkModule = await import('@tencent-ai/agent-sdk')
    } catch (e: any) {
      throw new Error(`Failed to load @tencent-ai/agent-sdk: ${e.message}`)
    }
  }
  return sdkModule
}

interface AgentConfig {
  /** Override the model to use */
  model?: string
  /** Max conversation turns */
  maxTurns?: number
  /** Permission mode */
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
  /** Custom system prompt append */
  systemPromptAppend?: string
  /** Path to codebuddy-code CLI executable (optional) */
  pathToCodebuddyCode?: string
}

let agentConfig: AgentConfig = {
  maxTurns: 3,
  permissionMode: 'bypassPermissions'
}

// Track active query for abort support
let activeAbortController: AbortController | null = null

export function setAgentConfig(config: Partial<AgentConfig>): void {
  agentConfig = { ...agentConfig, ...config }
}

export function getAgentConfig(): AgentConfig {
  return { ...agentConfig }
}

/**
 * Abort the currently running AI analysis if any.
 */
export function abortAnalysis(): void {
  if (activeAbortController) {
    activeAbortController.abort()
    activeAbortController = null
  }
}

/**
 * Run AI analysis on profiler data.
 * Streams results back to the renderer via IPC 'ai:stream' events.
 *
 * Message format sent to renderer:
 *   { type: 'delta', content: string, done: boolean }  -- incremental text
 *   { type: 'done', content: string }                   -- final complete text
 *   { type: 'error', error: string }                    -- error occurred
 */
export async function analyzeWithAI(
  win: BrowserWindow,
  analysis: ProfileAnalysisResult,
  userPrompt?: string
): Promise<{ success: boolean; error?: string }> {
  const prompt = userPrompt
    ? buildFollowUpPrompt(userPrompt, analysis)
    : buildAnalysisPrompt(analysis)

  // Abort any previous running query
  abortAnalysis()

  let sdk: typeof import('@tencent-ai/agent-sdk')
  try {
    sdk = await loadSdk()
  } catch (e: any) {
    const errorMsg = e.message || 'Failed to load Agent SDK'
    win.webContents.send('ai:stream', { type: 'error', error: errorMsg })
    return { success: false, error: errorMsg }
  }

  const abortController = new AbortController()
  activeAbortController = abortController

  const systemPromptAppend = agentConfig.systemPromptAppend ||
    '你是一个Unity游戏性能分析专家。请用中文回答，使用Markdown格式。' +
    '专注于识别性能瓶颈、分析异常帧、提供具体可操作的优化建议。'

  try {
    const q = sdk.query({
      prompt,
      options: {
        abortController,
        permissionMode: agentConfig.permissionMode || 'bypassPermissions',
        maxTurns: agentConfig.maxTurns || 3,
        model: agentConfig.model,
        pathToCodebuddyCode: agentConfig.pathToCodebuddyCode,
        systemPrompt: { append: systemPromptAppend },
        // Disable all tools - we only need text analysis, no file operations
        tools: [],
        // Don't persist sessions for ephemeral analysis
        persistSession: false
      }
    })

    let accumulatedText = ''

    for await (const message of q) {
      // Check if aborted
      if (abortController.signal.aborted) {
        win.webContents.send('ai:stream', {
          type: 'done',
          content: accumulatedText || '(Analysis aborted)'
        })
        return { success: true }
      }

      if (message.type === 'assistant') {
        // Complete assistant message
        for (const block of message.message.content) {
          if (block.type === 'text') {
            accumulatedText += block.text
            win.webContents.send('ai:stream', {
              type: 'delta',
              content: accumulatedText,
              done: false
            })
          }
        }
      } else if (message.type === 'result') {
        // Query completed
        if (message.subtype === 'success' && message.result) {
          // result field may contain final text
          if (message.result && !accumulatedText) {
            accumulatedText = message.result
          }
        } else if (message.is_error) {
          const errors = 'errors' in message ? (message.errors || []) : []
          const errorMsg = errors.join('; ') || 'AI analysis encountered an error'
          win.webContents.send('ai:stream', { type: 'error', error: errorMsg })
          return { success: false, error: errorMsg }
        }
      } else if (message.type === 'error') {
        win.webContents.send('ai:stream', {
          type: 'error',
          error: message.error || 'Unknown error'
        })
        return { success: false, error: message.error }
      }
    }

    // Send final done
    win.webContents.send('ai:stream', {
      type: 'done',
      content: accumulatedText
    })

    return { success: true }
  } catch (e: any) {
    const errorMsg = e.message || 'AI analysis failed'
    // Don't send error for intentional aborts
    if (e.name !== 'AbortError') {
      win.webContents.send('ai:stream', { type: 'error', error: errorMsg })
    }
    return { success: false, error: errorMsg }
  } finally {
    if (activeAbortController === abortController) {
      activeAbortController = null
    }
  }
}

/**
 * Run AI analysis with streaming partial messages for real-time text rendering.
 * This provides finer-grained streaming than analyzeWithAI.
 */
export async function analyzeWithAIStreaming(
  win: BrowserWindow,
  analysis: ProfileAnalysisResult,
  userPrompt?: string
): Promise<{ success: boolean; error?: string }> {
  const prompt = userPrompt
    ? buildFollowUpPrompt(userPrompt, analysis)
    : buildAnalysisPrompt(analysis)

  console.log(`[AI] Prompt length: ${prompt.length} chars`)
  console.log(`[AI] Prompt content:\n${prompt}`)

  abortAnalysis()

  let sdk: typeof import('@tencent-ai/agent-sdk')
  try {
    sdk = await loadSdk()
  } catch (e: any) {
    const errorMsg = e.message || 'Failed to load Agent SDK'
    win.webContents.send('ai:stream', { type: 'error', error: errorMsg })
    return { success: false, error: errorMsg }
  }

  const abortController = new AbortController()
  activeAbortController = abortController

  const systemPromptAppend =
    '你是一个Unity游戏性能分析专家。请用中文回答，使用Markdown格式。' +
    '专注于识别性能瓶颈、分析异常帧、提供具体可操作的优化建议。'

  try {
    const q = sdk.query({
      prompt,
      options: {
        abortController,
        permissionMode: agentConfig.permissionMode || 'bypassPermissions',
        maxTurns: agentConfig.maxTurns || 3,
        model: agentConfig.model,
        pathToCodebuddyCode: agentConfig.pathToCodebuddyCode,
        systemPrompt: { append: systemPromptAppend },
        tools: [],
        persistSession: false,
        // Enable partial messages for fine-grained streaming
        includePartialMessages: true
      }
    })

    let accumulatedText = ''

    for await (const message of q) {
      if (abortController.signal.aborted) {
        win.webContents.send('ai:stream', {
          type: 'done',
          content: accumulatedText || '(Analysis aborted)'
        })
        return { success: true }
      }

      if (message.type === 'stream_event') {
        // Partial streaming message - fine-grained text deltas
        const event = message.event
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            accumulatedText += event.delta.text
            win.webContents.send('ai:stream', {
              type: 'delta',
              content: accumulatedText,
              done: false
            })
          }
        }
      } else if (message.type === 'assistant') {
        // Complete assistant message (fallback if partial not available)
        for (const block of message.message.content) {
          if (block.type === 'text' && !accumulatedText) {
            accumulatedText = block.text
            win.webContents.send('ai:stream', {
              type: 'delta',
              content: accumulatedText,
              done: false
            })
          }
        }
      } else if (message.type === 'result') {
        if (message.is_error) {
          const errors = 'errors' in message ? (message.errors || []) : []
          const errorMsg = errors.join('; ') || 'AI analysis error'
          win.webContents.send('ai:stream', { type: 'error', error: errorMsg })
          return { success: false, error: errorMsg }
        }
      } else if (message.type === 'error') {
        win.webContents.send('ai:stream', { type: 'error', error: message.error })
        return { success: false, error: message.error }
      }
    }

    win.webContents.send('ai:stream', { type: 'done', content: accumulatedText })
    return { success: true }
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      win.webContents.send('ai:stream', { type: 'error', error: e.message })
    }
    return { success: false, error: e.message }
  } finally {
    if (activeAbortController === abortController) {
      activeAbortController = null
    }
  }
}
