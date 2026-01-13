import React, { useState, useRef, useEffect } from 'react'
import { theme } from '../../styles/theme'
import ChatMessage from './ChatMessage'
import SuggestionButtons from './SuggestionButtons'
import LoadingSpinner from '../shared/LoadingSpinner'

interface AIChatWindowProps {
  isOpen: boolean
  onClose: () => void
  messages: any[]
  loading: boolean
  onSendMessage: (message: string) => Promise<any>
}

const AIChatWindow: React.FC<AIChatWindowProps> = ({
  isOpen,
  onClose,
  messages,
  loading,
  onSendMessage
}) => {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const message = input.trim()
    setInput('')
    await onSendMessage(message)
  }

  const handleSuggestion = async (suggestion: string) => {
    setInput(suggestion)
    await onSendMessage(suggestion)
  }

  if (!isOpen) return null

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme.overlay,
          zIndex: 1000
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          right: '30px',
          bottom: '100px',
          width: '500px',
          height: '600px',
          backgroundColor: theme.white,
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          zIndex: 1001,
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '20px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '16px',
            color: theme.text,
            fontWeight: 600
          }}>
            开源贡献智能向导
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: theme.text,
              padding: '0 8px'
            }}
          >
            ×
          </button>
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          backgroundColor: theme.background
        }}>
          {messages.length === 0 && (
            <div style={{
              textAlign: 'center',
              color: theme.text,
              opacity: 0.6,
              marginTop: '40px'
            }}>
              开始对话吧！
            </div>
          )}
          {messages.map((msg, index) => (
            <ChatMessage key={index} message={msg} />
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                padding: '12px 16px',
                backgroundColor: theme.primaryLight,
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <LoadingSpinner />
                <span style={{ fontSize: '12px', color: theme.text, opacity: 0.7 }}>
                  正在思考...
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{
          padding: '16px',
          borderTop: `1px solid ${theme.border}`,
          backgroundColor: theme.white
        }}>
          <form onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入消息..."
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px',
                border: `1px solid ${loading ? theme.primary : theme.border}`,
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none',
                marginBottom: '12px',
                boxSizing: 'border-box',
                animation: loading ? 'pulse 1.5s ease-in-out infinite' : 'none'
              }}
            />
            <SuggestionButtons onSuggestionClick={handleSuggestion} />
          </form>
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { border-color: ${theme.border}; }
            50% { border-color: ${theme.primary}; }
          }
        `}</style>
      </div>
    </>
  )
}

export default AIChatWindow
