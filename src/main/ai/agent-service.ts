/**
 * AI Agent Service - integrates @tencent-ai/agent-sdk for real AI analysis.
 *
 * Phase 1.5: Uses DeepAnalysisContext for enriched prompts,
 * injects Unity CPU knowledge as system prompt,
 * and provides fallback report when AI fails.
 */
import { BrowserWindow, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { ProfileAnalysisResult } from '../profiler/types'
import {
  buildAnalysisPrompt,
  buildFollowUpPrompt,
  buildFallbackReport,
  DeepAnalysisContext
} from './prompt-builder'

// Load Unity CPU knowledge base from .md file (easy to edit without recompiling)
function loadKnowledgeBase(): string {
  try {
    const mdPath = path.join(__dirname, 'unity-cpu-knowledge.md')
    return fs.readFileSync(mdPath, 'utf-8')
  } catch (e: any) {
    console.warn(`[AI] Failed to load knowledge base md: ${e.message}, using fallback`)
    return 'You are a Unity game performance analysis expert. Respond in Chinese. Use Markdown format.'
  }
}

// Load Performance Analysis Skill from .claude/skills/ (standard skill location)
function loadAnalysisSkill(): string {
  try {
    // Try standard skill location first
    const skillPath = path.join(process.cwd(), '.claude', 'skills', 'unity-profiler-analysis', 'SKILL.md')
    if (fs.existsSync(skillPath)) {
      return fs.readFileSync(skillPath, 'utf-8')
    }
    // Fallback: bundled copy next to this file
    const bundledPath = path.join(__dirname, 'performance-analysis-skill.md')
    if (fs.existsSync(bundledPath)) {
      return fs.readFileSync(bundledPath, 'utf-8')
    }
    return ''
  } catch (e: any) {
    console.warn(`[AI] Failed to load analysis skill: ${e.message}`)
    return ''
  }
}

/**
 * Build complete system prompt by combining knowledge base + analysis skill.
 */
function buildSystemPrompt(): string {
  const knowledge = loadKnowledgeBase()
  const skill = loadAnalysisSkill()

  const parts: string[] = []
  parts.push(knowledge)
  if (skill) {
    parts.push('\n---\n')
    parts.push(skill)
  }
  return parts.join('\n')
}

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
 * Run AI analysis with streaming partial messages for real-time text rendering.
 *
 * Phase 1.5: accepts DeepAnalysisContext for enriched prompts.
 * Falls back to deterministic report on AI failure.
 *
 * Message format sent to renderer:
 *   { type: 'delta', content: string, done: boolean }  -- incremental text
 *   { type: 'done', content: string }                   -- final complete text
 *   { type: 'error', error: string }                    -- error occurred
 */
export async function analyzeWithAIStreaming(
  win: BrowserWindow,
  analysis: ProfileAnalysisResult,
  deep?: DeepAnalysisContext,
  userPrompt?: string
): Promise<{ success: boolean; error?: string }> {
  const prompt = userPrompt
    ? buildFollowUpPrompt(userPrompt, analysis, deep)
    : buildAnalysisPrompt(analysis, deep)

  console.log(`[AI] Prompt length: ${prompt.length} chars`)

  abortAnalysis()

  let sdk: typeof import('@tencent-ai/agent-sdk')
  try {
    sdk = await loadSdk()
  } catch (e: any) {
    // SDK load failed -> fallback to deterministic report
    console.warn(`[AI] SDK load failed, using fallback report: ${e.message}`)
    return sendFallbackReport(win, analysis, deep, e.message)
  }

  const abortController = new AbortController()
  activeAbortController = abortController

  // Use Unity CPU knowledge + Analysis Skill as system prompt, with optional user override
  const systemPromptAppend = agentConfig.systemPromptAppend || buildSystemPrompt()

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
          // AI returned error -> fallback
          console.warn(`[AI] AI returned error, using fallback: ${errorMsg}`)
          return sendFallbackReport(win, analysis, deep, errorMsg)
        }
      } else if (message.type === 'error') {
        console.warn(`[AI] Stream error, using fallback: ${message.error}`)
        return sendFallbackReport(win, analysis, deep, message.error)
      }
    }

    // If AI returned empty, use fallback
    if (!accumulatedText.trim()) {
      console.warn('[AI] Empty response, using fallback')
      return sendFallbackReport(win, analysis, deep, 'AI returned empty response')
    }

    // Log successful analysis
    saveAnalysisLog(prompt, accumulatedText)

    win.webContents.send('ai:stream', { type: 'done', content: accumulatedText })
    return { success: true }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return { success: true }
    }
    // Any exception -> fallback
    console.warn(`[AI] Exception, using fallback: ${e.message}`)
    return sendFallbackReport(win, analysis, deep, e.message)
  } finally {
    if (activeAbortController === abortController) {
      activeAbortController = null
    }
  }
}

/**
 * Send deterministic fallback report when AI is unavailable.
 */
function sendFallbackReport(
  win: BrowserWindow,
  analysis: ProfileAnalysisResult,
  deep?: DeepAnalysisContext,
  errorReason?: string
): { success: boolean; error?: string } {
  const report = buildFallbackReport(analysis, deep)
  // Log fallback report
  saveAnalysisLog('(fallback)', report, errorReason)
  win.webContents.send('ai:stream', { type: 'done', content: report })
  return { success: true, error: errorReason ? `Fallback used: ${errorReason}` : undefined }
}

/**
 * Save prompt + AI response to a timestamped log file for version comparison.
 * Logs are saved to: <project>/logs/ai-analysis/
 */
function saveAnalysisLog(prompt: string, response: string, error?: string): void {
  try {
    const logDir = path.join(path.dirname(app.getAppPath()), 'logs', 'ai-analysis')
    fs.mkdirSync(logDir, { recursive: true })

    const now = new Date()
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const logFile = path.join(logDir, `${ts}.md`)

    const content = `# AI Analysis Log - ${now.toLocaleString('zh-CN')}

## Prompt (${prompt.length} chars)

\`\`\`
${prompt}
\`\`\`

## AI Response (${response.length} chars)

${response}

${error ? `## Error\n\n${error}\n` : ''}
`
    fs.writeFileSync(logFile, content, 'utf8')
    console.log(`[AI] Analysis log saved: ${logFile}`)
  } catch (e: any) {
    console.warn(`[AI] Failed to save log: ${e.message}`)
  }
}
