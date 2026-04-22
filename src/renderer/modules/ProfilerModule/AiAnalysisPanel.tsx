import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Drawer, Input, Button } from 'antd'
import { Send, X, Brain } from 'lucide-react'
import { useProfilerStore } from '@/store/profilerStore'

const AiAnalysisPanel: React.FC = () => {
  const {
    aiDrawerOpen, setAiDrawerOpen, aiMessages, addAiMessage,
    updateAiMessage, aiLoading, setAiLoading, analysisData
  } = useProfilerStore()
  const [inputValue, setInputValue] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const cleanup = window.electronAPI.ai.onStream((data: any) => {
      if (data.type === 'delta') {
        const lastMsg = useProfilerStore.getState().aiMessages
        const assistantMsg = lastMsg.find(m => m.isStreaming)
        if (assistantMsg) {
          updateAiMessage(assistantMsg.id, data.content, !data.done)
        }
      }
      if (data.type === 'done') {
        setAiLoading(false)
        const lastMsg = useProfilerStore.getState().aiMessages
        const streamingMsg = lastMsg.find(m => m.isStreaming)
        if (streamingMsg) {
          updateAiMessage(streamingMsg.id, data.content, false)
        }
      }
    })
    cleanupRef.current = cleanup
    return () => { cleanup() }
  }, [updateAiMessage, setAiLoading])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [aiMessages])

  const handleAnalyze = useCallback(async (userPrompt?: string) => {
    if (!analysisData) return
    if (aiLoading) return

    setAiLoading(true)

    if (userPrompt) {
      addAiMessage({
        id: `user-${Date.now()}`,
        role: 'user',
        content: userPrompt,
        timestamp: Date.now()
      })
    }

    const assistantId = `assistant-${Date.now()}`
    addAiMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true
    })

    const result = await window.electronAPI.ai.analyze(userPrompt || '')
    if (!result.success) {
      updateAiMessage(assistantId, `Error: ${result.error || 'Analysis failed'}`, false)
      setAiLoading(false)
    }
  }, [analysisData, aiLoading, setAiLoading, addAiMessage, updateAiMessage])

  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    setInputValue('')
    handleAnalyze(text)
  }, [inputValue, handleAnalyze])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#e2e8f0' }}>
          <Brain size={18} style={{ color: '#7c3aed' }} />
          <span style={{ fontWeight: 600 }}>AI Performance Analysis</span>
        </div>
      }
      placement="right"
      width={480}
      open={aiDrawerOpen}
      onClose={() => setAiDrawerOpen(false)}
      closeIcon={<X size={16} style={{ color: '#94a3b8' }} />}
      styles={{
        header: { background: '#131325', borderBottom: '1px solid rgba(124,58,237,0.2)', padding: '12px 16px' },
        body: { background: '#0d0d1a', padding: 0, display: 'flex', flexDirection: 'column' },
        wrapper: {}
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Messages area */}
        <div ref={scrollRef} style={{
          flex: 1, overflow: 'auto', padding: '12px 16px',
          display: 'flex', flexDirection: 'column', gap: 12
        }}>
          {aiMessages.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', flex: 1, gap: 12, color: '#64748b'
            }}>
              <Brain size={40} style={{ opacity: 0.3, color: '#7c3aed' }} />
              <div style={{ fontSize: 13, textAlign: 'center' }}>
                Click the button below to start AI analysis
              </div>
              <Button
                type="primary"
                icon={<Brain size={14} />}
                onClick={() => handleAnalyze()}
                loading={aiLoading}
                disabled={!analysisData}
                style={{ background: 'linear-gradient(135deg, #7c3aed, #3b82f6)', border: 'none' }}
              >
                Start Analysis
              </Button>
            </div>
          )}

          {aiMessages.map((msg) => (
            <div key={msg.id} style={{
              padding: '8px 12px', borderRadius: 8,
              background: msg.role === 'user' ? 'rgba(124,58,237,0.15)' : 'rgba(19,19,37,0.8)',
              border: `1px solid ${msg.role === 'user' ? 'rgba(124,58,237,0.3)' : 'rgba(59,130,246,0.15)'}`,
              maxWidth: '100%'
            }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                {msg.role === 'user' ? 'You' : 'AI Assistant'}
                {msg.isStreaming && <span style={{ color: '#7c3aed', marginLeft: 8 }}>typing...</span>}
              </div>
              <div style={{
                fontSize: 12, color: '#e2e8f0', lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                fontFamily: 'Roboto, sans-serif'
              }}>
                {msg.content || (msg.isStreaming ? '...' : '')}
              </div>
            </div>
          ))}
        </div>

        {/* Input area */}
        <div style={{
          padding: '8px 12px', borderTop: '1px solid rgba(124,58,237,0.2)',
          background: 'rgba(19,19,37,0.6)', display: 'flex', gap: 8, alignItems: 'flex-end'
        }}>
          <Input.TextArea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a follow-up question..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            style={{
              flex: 1, background: 'rgba(13,13,26,0.8)', border: '1px solid rgba(124,58,237,0.2)',
              color: '#e2e8f0', fontSize: 12, resize: 'none'
            }}
          />
          <Button
            type="primary"
            icon={<Send size={14} />}
            onClick={handleSend}
            loading={aiLoading}
            disabled={!inputValue.trim() || !analysisData}
            style={{
              background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
              border: 'none', height: 32, width: 32, padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          />
        </div>
      </div>
    </Drawer>
  )
}

export default AiAnalysisPanel
