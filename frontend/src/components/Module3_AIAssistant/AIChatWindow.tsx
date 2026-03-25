import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
  onQueryCurrentProfile?: () => void
  onCancelSearch?: () => void
  onAskAIAboutText?: (text: string) => void
  onRetryAIHealth?: () => void
  aiIssueMessage?: string | null
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
  onQueryCurrentProfile,
  onCancelSearch,
  onAskAIAboutText,
  onRetryAIHealth,
  aiIssueMessage = null,
  language = 'chinese',
  username = null,
  onFavorite,
  onUnfavorite
}) => {
  const [input, setInput] = useState('')
  const [askAiBubble, setAskAiBubble] = useState<{ text: string; top: number; left: number } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const syncSelectionBubble = useCallback(() => {
    if (!isOpen || !onAskAIAboutText) {
      setAskAiBubble(null)
      return
    }
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setAskAiBubble(null)
      return
    }
    const text = sel.toString().trim()
    if (text.length < 2) {
      setAskAiBubble(null)
      return
    }
    const range = sel.getRangeAt(0)
    const fromNode = (node: Node | null): Element | null => {
      const el =
        node?.nodeType === Node.TEXT_NODE ? (node as Text).parentElement : (node as Element | null)
      if (!el) return null
      if (el.closest('[data-selection-excluded],button,a,input,textarea,select,[role="button"]')) return null
      return el.closest('[data-chat-selectable]') ?? null
    }
    const a = fromNode(sel.anchorNode)
    const f = fromNode(sel.focusNode)
    if (!a || a !== f || !a.contains(range.commonAncestorContainer)) {
      setAskAiBubble(null)
      return
    }
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      setAskAiBubble(null)
      return
    }
    setAskAiBubble({ text, top: rect.top, left: rect.right })
  }, [isOpen, onAskAIAboutText])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !onAskAIAboutText) return
    let t: number
    const onSel = () => {
      window.clearTimeout(t)
      t = window.setTimeout(syncSelectionBubble, 20)
    }
    document.addEventListener('selectionchange', onSel)
    document.addEventListener('mouseup', onSel)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('selectionchange', onSel)
      document.removeEventListener('mouseup', onSel)
    }
  }, [isOpen, onAskAIAboutText, syncSelectionBubble])

  useEffect(() => {
    if (!isOpen || !onAskAIAboutText) return
    const onScroll = () => setAskAiBubble(null)
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [isOpen, onAskAIAboutText])

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
    if (suggestion === '当前技能' || suggestion === 'Current skills') {
      onQueryCurrentProfile?.()
      setInput('')
      return
    }
    if (suggestion === '更新个人信息' || suggestion === 'Update my profile') {
      const prefix = language === 'english'
        ? 'I want to add more info about me: '
        : '我想补充我的信息：'
      setInput(prefix)
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.setSelectionRange(prefix.length, prefix.length)
        }
      }, 0)
      return
    }
    setInput(suggestion)
    await onSendMessage(suggestion)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {askAiBubble &&
            onAskAIAboutText &&
            createPortal(
              <button
                type="button"
                className="pointer-events-auto rounded-md border border-primary bg-primary px-2 py-1 text-xs font-medium text-white shadow-md transition hover:bg-primaryDark"
                style={{
                  position: 'fixed',
                  top: Math.max(8, askAiBubble.top - 30),
                  left: askAiBubble.left + 4,
                  zIndex: 1002
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const t = askAiBubble.text
                  setAskAiBubble(null)
                  window.getSelection()?.removeAllRanges()
                  onAskAIAboutText(t)
                }}
              >
                {language === 'english' ? 'Ask AI?' : '问问AI？'}
              </button>,
              document.body
            )}
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
              {aiIssueMessage && (
                <div className="mb-3 rounded-md border border-yellow-400/40 bg-yellow-300/15 px-3 py-2 text-sm text-text">
                  <div>{aiIssueMessage}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRetryAIHealth?.()}
                      className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                      {language === 'english' ? 'Retry' : '重试检测'}
                    </button>
                    <a
                      href="https://ollama.com/download"
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline"
                    >
                      {language === 'english' ? 'Install Ollama' : '查看 Ollama 安装'}
                    </a>
                  </div>
                </div>
              )}
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
                    <span className="text-xs text-text/70" data-chat-selectable>
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
