import React, { useState, useRef, useEffect } from 'react'
import { Send, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import ChatMessage from './ChatMessage'
import SuggestionButtons from './SuggestionButtons'
import LoadingSpinner from '../shared/LoadingSpinner'
import SearchBubble from './SearchBubble'

interface AIChatWindowProps {
  isOpen: boolean
  onClose: () => void
  messages: any[]
  loading: boolean
  loadingStage: string | null
  searchProgressSeconds?: number | null
  searchStage?: string | null
  onSendMessage: (message: string) => Promise<any>
  onCancelSearch?: () => void
  language?: 'chinese' | 'english'
  username?: string | null
  onFavorite?: (repo: any) => void
  onUnfavorite?: (repoId: string) => void
}

function stageLabel(stage: string | null | undefined, language: 'chinese' | 'english'): string {
  if (!stage) return language === 'chinese' ? '处理中...' : 'Processing...'
  const labels: Record<string, { chinese: string; english: string }> = {
    intent_recognizing: { chinese: '意图识别中...', english: 'Recognizing intent...' },
    concept_explaining: { chinese: '概念解释中...', english: 'Explaining...' },
    generating_reply: { chinese: '思考回复中...', english: 'Thinking...' },
    query_status: { chinese: '查询状态中...', english: 'Querying status...' },
    confirm: { chinese: '确认中...', english: 'Confirming...' },
    search_repo: { chinese: '准备搜索...', english: 'Preparing search...' },
    irrelevant: { chinese: '处理中...', english: 'Processing...' }
  }
  const pair = labels[stage] || { chinese: '处理中...', english: 'Processing...' }
  return language === 'chinese' ? pair.chinese : pair.english
}

const AIChatWindow: React.FC<AIChatWindowProps> = ({
  isOpen,
  onClose,
  messages,
  loading,
  loadingStage = null,
  searchProgressSeconds = null,
  searchStage = null,
  onSendMessage,
  onCancelSearch,
  language = 'chinese',
  username = null,
  onFavorite,
  onUnfavorite
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

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[1000] bg-black/30"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="fixed bottom-[100px] right-4 z-[1001] flex h-[70vh] w-[calc(100%-2rem)] max-w-[500px] flex-col rounded-lg bg-surface shadow-modal sm:right-[30px] sm:h-[600px]"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex items-center justify-between border-b border-border p-5">
              <h3 className="m-0 text-lg font-semibold text-text">
                {language === 'english' ? 'Open Source Contribution Assistant' : '开源贡献智能向导'}
              </h3>
              <button
                onClick={onClose}
                className="inline-flex items-center justify-center px-2 text-text"
                aria-label={language === 'english' ? 'Close' : '关闭'}
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-background p-5">
              {messages.length === 0 && (
                <div className="mt-10 text-center text-text/60">
                  {language === 'english' ? 'Start chatting!' : '开始对话吧！'}
                </div>
              )}
              {messages.map((msg, index) => {
                if (msg.isSearching && onCancelSearch) {
                  return (
                    <div key={`search-${index}`}>
                      <SearchBubble onCancel={onCancelSearch} language={language} progressSeconds={searchProgressSeconds} searchStage={searchStage} />
                      {(msg.searchResults && msg.searchResults.length >= 3) && (
                        <ChatMessage
                          message={{ ...msg, isSearching: false }}
                          language={language}
                          username={username}
                          onFavorite={onFavorite}
                          onUnfavorite={onUnfavorite}
                        />
                      )}
                    </div>
                  )
                }
                return <ChatMessage key={index} message={msg} language={language} username={username} onFavorite={onFavorite} onUnfavorite={onUnfavorite} />
              })}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg bg-primaryLight px-4 py-3">
                    <LoadingSpinner />
                    <span className="text-xs text-text/70">
                      {stageLabel(loadingStage, language)}
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-border bg-surface p-4">
              <form onSubmit={handleSubmit} className="relative">
                <div className="relative mb-3">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={language === 'english' ? 'Type a message...' : '输入消息...'}
                    disabled={loading}
                    className={`w-full rounded-md border bg-surface px-3 py-2 pr-11 text-base outline-none ${loading ? 'border-primary animate-pulse' : 'border-border'}`}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                    onClick={(e) => handleSubmit(e)}
                    className={`absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center justify-center px-2 transition ${
                      (!input.trim() || loading) ? 'cursor-not-allowed text-border' : 'cursor-pointer text-primary'
                    }`}
                    aria-label={language === 'english' ? 'Send' : '发送'}
                  >
                    <Send size={18} />
                  </button>
                </div>
                <SuggestionButtons onSuggestionClick={handleSuggestion} language={language} />
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default AIChatWindow
