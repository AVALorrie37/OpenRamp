import React, { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ChevronDown, Copy, RefreshCw, Send, Square, X } from 'lucide-react'
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
  onConfirmCollectProfile?: (messageIndex: number, draft: { skills: string[]; preferences: string[] }) => void
  language?: 'chinese' | 'english'
  username?: string | null
  onFavorite?: (repo: any) => void
  onUnfavorite?: (repoId: string) => void
  availableModels?: string[]
  modelSizeMap?: Record<string, string | null | undefined>
  selectedModel?: string
  onModelChange?: (model: string) => void
  onRefreshModels?: () => void
  modelsNotRunning?: boolean
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
    search_intent_mining: { chinese: '分析搜索意图中...', english: 'Analyzing search intent...' },
    irrelevant: { chinese: '处理中...', english: 'Processing...' }
  }
  const pair = labels[stage] || { chinese: '处理中...', english: 'Processing...' }
  return language === 'chinese' ? pair.chinese : pair.english
}

type Rect = { left: number; top: number; width: number; height: number }

const MIN_W = 560
const MIN_H = 360
const EDGE_HANDLE = 8
const CORNER_HANDLE = 14
const STORAGE_KEY = 'openramp.aiChatWindow.rect.v1'

function clampRect(r: Rect, vw: number, vh: number): Rect {
  const width = Math.min(Math.max(MIN_W, r.width), Math.max(MIN_W, vw))
  const height = Math.min(Math.max(MIN_H, r.height), Math.max(MIN_H, vh))
  const left = Math.min(Math.max(0, r.left), Math.max(0, vw - width))
  const top = Math.min(Math.max(0, r.top), Math.max(0, vh - height))
  return { left, top, width, height }
}

function defaultRect(): Rect {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const leftPct = 459 / 1167
  const topPct = 20 / 788
  const widthPct = 648 / 1167
  const heightPct = 0.9

  const w = Math.min(vw - 32, Math.round(vw * widthPct))
  const h = Math.min(vh - 32, Math.round(vh * heightPct))
  return clampRect(
    {
      left: Math.round(vw * leftPct),
      top: Math.round(vh * topPct),
      width: w,
      height: h,
    },
    vw,
    vh
  )
}

function readStoredRect(): Rect | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Rect> | null
    if (!parsed) return null
    const left = Number(parsed.left)
    const top = Number(parsed.top)
    const width = Number(parsed.width)
    const height = Number(parsed.height)
    if (![left, top, width, height].every(Number.isFinite)) return null
    return { left, top, width, height }
  } catch {
    return null
  }
}

function writeStoredRect(r: Rect) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(r))
  } catch {}
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
  onConfirmCollectProfile,
  language = 'chinese',
  username = null,
  onFavorite,
  onUnfavorite,
  availableModels = [],
  modelSizeMap = {},
  selectedModel,
  onModelChange,
  onRefreshModels,
  modelsNotRunning = false
}) => {
  const [input, setInput] = useState('')
  const [askAiBubble, setAskAiBubble] = useState<{ text: string; top: number; left: number } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)
  const windowRef = useRef<HTMLDivElement>(null)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [modelDropdownMaxH, setModelDropdownMaxH] = useState<number>(240)
  const [rect, setRect] = useState<Rect>(() => {
    if (typeof window === 'undefined') return { left: 0, top: 0, width: 500, height: 600 }
    const stored = readStoredRect()
    return clampRect(stored ?? defaultRect(), window.innerWidth, window.innerHeight)
  })
  const [isMaximized, setIsMaximized] = useState(false)
  const dragMoveRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origLeft: number
    origTop: number
  } | null>(null)
  const dragResizeRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    orig: Rect
    handle:
      | 'n'
      | 's'
      | 'e'
      | 'w'
      | 'ne'
      | 'nw'
      | 'se'
      | 'sw'
    ratio: number
  } | null>(null)

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

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    const next = Math.max(40, el.scrollHeight)
    el.style.height = `${next}px`
  }, [input])

  useLayoutEffect(() => {
    if (!isOpen || typeof window === 'undefined') return
    setRect((r) => clampRect(r, window.innerWidth, window.innerHeight))
  }, [isOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => {
      setRect((r) => clampRect(r, window.innerWidth, window.innerHeight))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    return
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const vw = window.innerWidth
    const vh = window.innerHeight
    setIsMaximized(
      rect.left === 0 &&
        rect.top === 0 &&
        rect.width === vw &&
        rect.height === vh
    )
  }, [rect])

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

  useEffect(() => {
    if (!isOpen) return
    setShowJumpToLatest(false)
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      el.scrollTop = el.scrollHeight
    })
  }, [isOpen])

  const syncJumpToLatest = useCallback(() => {
    const el = scrollRef.current
    const end = messagesEndRef.current
    if (!el || !end) return
    const elRect = el.getBoundingClientRect()
    const endRect = end.getBoundingClientRect()
    const below = endRect.bottom - elRect.bottom
    setShowJumpToLatest(below > elRect.height / 2)
  }, [])

  const onMessagesScroll = useCallback(() => {
    requestAnimationFrame(syncJumpToLatest)
  }, [syncJumpToLatest])

  const jumpToLatest = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    requestAnimationFrame(syncJumpToLatest)
  }, [isOpen, messages, loading, syncJumpToLatest])

  const beginMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target?.closest('button,input,textarea,select,a,[role="button"]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragMoveRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
    }
  }, [rect.left, rect.top])

  const movePointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragMoveRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    setRect((r) => clampRect({ ...r, left: d.origLeft + dx, top: d.origTop + dy }, window.innerWidth, window.innerHeight))
  }, [])

  const endMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragMoveRef.current
    if (!d || e.pointerId !== d.pointerId) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    dragMoveRef.current = null
  }, [])

  const beginResize = useCallback((handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') => {
    return (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragResizeRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        orig: rect,
        handle,
        ratio: rect.width / Math.max(1, rect.height),
      }
    }
  }, [rect])

  const resizePointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragResizeRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const vw = window.innerWidth
    const vh = window.innerHeight
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY

    const apply = (next: Rect) => setRect(clampRect(next, vw, vh))

    const o = d.orig
    const isCorner = d.handle.length === 2
    if (!isCorner) {
      switch (d.handle) {
        case 'e': {
          apply({ ...o, width: o.width + dx })
          return
        }
        case 'w': {
          apply({ left: o.left + dx, top: o.top, width: o.width - dx, height: o.height })
          return
        }
        case 's': {
          apply({ ...o, height: o.height + dy })
          return
        }
        case 'n': {
          apply({ left: o.left, top: o.top + dy, width: o.width, height: o.height - dy })
          return
        }
      }
    }

    const ratio = d.ratio
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)
    const byWidth = absDx >= absDy * ratio

    let w = o.width
    let h = o.height

    if (byWidth) {
      w = o.width + (d.handle.includes('w') ? -dx : dx)
      h = w / Math.max(0.01, ratio)
    } else {
      h = o.height + (d.handle.includes('n') ? -dy : dy)
      w = h * ratio
    }

    let left = o.left
    let top = o.top
    if (d.handle.includes('w')) left = o.left + (o.width - w)
    if (d.handle.includes('n')) top = o.top + (o.height - h)

    apply({ left, top, width: w, height: h })
  }, [])

  const endResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragResizeRef.current
    if (!d || e.pointerId !== d.pointerId) return
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
    dragResizeRef.current = null
  }, [])

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

  const windowStyle = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    } as React.CSSProperties
  }, [rect.height, rect.left, rect.top, rect.width])

  const toggleMaximize = useCallback(() => {
    if (typeof window === 'undefined') return
    const vw = window.innerWidth
    const vh = window.innerHeight
    setRect((r) => {
      const alreadyMax =
        r.left === 0 && r.top === 0 && r.width === vw && r.height === vh
      if (alreadyMax) {
        const next = clampRect(defaultRect(), vw, vh)
        return next
      }
      const next = clampRect({ left: 0, top: 0, width: vw, height: vh }, vw, vh)
      return next
    })
  }, [])

  const handleClose = useCallback(() => {
    if (typeof window !== 'undefined') writeStoredRect(rect)
    onClose()
  }, [onClose, rect])

  const chooseModel = useCallback((m: string) => {
    onModelChange?.(m)
    setModelDropdownOpen(false)
  }, [onModelChange])

  const openModelDropdown = useCallback(() => {
    const footerEl = footerRef.current
    const winEl = windowRef.current
    if (footerEl && winEl) {
      const f = footerEl.getBoundingClientRect()
      const w = winEl.getBoundingClientRect()
      const availableAbove = Math.max(120, Math.floor(f.top - w.top - 12))
      setModelDropdownMaxH(Math.min(320, availableAbove))
    } else {
      setModelDropdownMaxH(240)
    }
    setModelDropdownOpen(true)
  }, [])

  useEffect(() => {
    if (!modelDropdownOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      if (t.closest('[data-model-dropdown-root]')) return
      setModelDropdownOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [modelDropdownOpen])

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
            className="fixed inset-0 z-[1000] bg-black/20"
            onClick={handleClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            className="fixed z-[1001] flex flex-col rounded-lg bg-surface shadow-modal"
            style={windowStyle}
            onClick={(e) => e.stopPropagation()}
            ref={windowRef}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.18 }}
          >
            <div
              className="flex items-center justify-between border-b border-border p-5"
              onPointerDown={beginMove}
              onPointerMove={movePointer}
              onPointerUp={endMove}
              onPointerCancel={endMove}
            >
              <h3 className="m-0 text-lg font-semibold text-text">
                {language === 'english' ? 'Open Source Contribution Assistant' : '开源贡献智能向导'}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleMaximize()
                  }}
                  className="inline-flex items-center justify-center px-2 text-text"
                  aria-label={
                    language === 'english'
                      ? (isMaximized ? 'Restore' : 'Maximize')
                      : (isMaximized ? '还原' : '最大化')
                  }
                >
                  {isMaximized ? <Copy size={18} /> : <Square size={18} />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleClose()
                  }}
                  className="inline-flex items-center justify-center px-2 text-text"
                  aria-label={language === 'english' ? 'Close' : '关闭'}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="relative flex-1 overflow-y-auto bg-background p-5"
              onScroll={onMessagesScroll}
            >
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
                          messageIndex={index}
                          message={{ ...msg, isSearching: false }}
                          language={language}
                          username={username}
                          onFavorite={onFavorite}
                          onUnfavorite={onUnfavorite}
                          onConfirmCollectProfile={onConfirmCollectProfile}
                        />
                      )}
                    </div>
                  )
                }
                return (
                  <ChatMessage
                    key={index}
                    messageIndex={index}
                    message={msg}
                    language={language}
                    username={username}
                    onFavorite={onFavorite}
                    onUnfavorite={onUnfavorite}
                    onConfirmCollectProfile={onConfirmCollectProfile}
                  />
                )
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

            <div ref={footerRef} className="relative border-t border-border bg-surface p-4">
              {showJumpToLatest && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    jumpToLatest()
                  }}
                  className="pointer-events-auto absolute right-4 top-0 inline-flex -translate-y-[calc(100%+8px)] items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text shadow-md transition hover:brightness-[0.98]"
                >
                  <ArrowDown size={16} />
                  {language === 'english' ? 'Latest' : '最新'}
                </button>
              )}
              <form onSubmit={handleSubmit} className="relative">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center justify-start gap-2" data-model-dropdown-root>
                    <div className="relative min-w-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          if (loading) return
                          if (modelDropdownOpen) setModelDropdownOpen(false)
                          else openModelDropdown()
                        }}
                        className="inline-flex w-fit max-w-[min(100%,32rem)] items-center justify-between gap-2 rounded-md border border-[var(--chat-input-border)] bg-primaryLight px-3 py-2 text-base text-text outline-none hover:brightness-[0.99] disabled:opacity-60"
                        aria-label={language === 'english' ? 'Select model' : '选择模型'}
                        disabled={loading}
                      >
                        <span className="min-w-0 flex-1 truncate text-left">
                          {(modelsNotRunning
                            ? '请启动ollama服务'
                            : availableModels.length === 0
                              ? (language === 'english' ? 'No models' : '暂无模型')
                              : (selectedModel || availableModels[0] || '')
                          )}
                        </span>
                        <span className="shrink-0 text-text/60">
                          <ChevronDown size={18} />
                        </span>
                      </button>

                      {modelDropdownOpen && (
                        <div
                          className="absolute left-0 bottom-[calc(100%+6px)] z-[1002] w-[min(100vw,32rem)] overflow-auto rounded-md border border-border bg-surface shadow-md"
                          style={{ maxHeight: `${Math.max(120, modelDropdownMaxH)}px` }}
                        >
                          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
                            <div className="text-sm font-medium text-text">
                              {language === 'english' ? 'Select model:' : '选择模型：'}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                onRefreshModels?.()
                              }}
                              className="inline-flex items-center justify-center rounded-md border border-border bg-surface px-2 py-1.5 text-text transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={loading}
                              aria-label={language === 'english' ? 'Refresh models' : '刷新模型列表'}
                            >
                              <RefreshCw size={16} />
                            </button>
                          </div>

                          {modelsNotRunning ? (
                            <div className="px-3 py-3 text-sm text-text/70">
                              请启动ollama服务并刷新列表
                            </div>
                          ) : (
                            availableModels.map((name) => {
                              const isSelected = (selectedModel || '').trim() === name
                              const size = (modelSizeMap[name] || '').trim()
                              return (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    chooseModel(name)
                                  }}
                                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-base transition hover:brightness-[0.98] ${
                                    isSelected ? 'bg-primaryLight' : 'bg-surface'
                                  }`}
                                >
                                  <span className="min-w-0 flex-1 truncate text-left text-text">
                                    {name}
                                  </span>
                                  <span className="w-[6.5rem] shrink-0 text-right text-text/70">
                                    {size}
                                  </span>
                                </button>
                              )
                            })
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="relative mb-3">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void handleSubmit(e as unknown as React.FormEvent)
                      }
                    }}
                    placeholder={language === 'english' ? 'Type a message...' : '输入消息...'}
                    disabled={loading}
                    className={`w-full rounded-md border bg-[var(--chat-input-bg)] px-3 py-2 pr-11 text-base text-[var(--chat-input-text)] outline-none ${
                      loading
                        ? 'border-[var(--chat-input-border-active)] animate-pulse'
                        : 'border-[var(--chat-input-border)]'
                    }`}
                    rows={1}
                    style={{ resize: 'none', overflow: 'hidden' }}
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

            <div
              className="absolute left-0 top-0 h-full z-[2]"
              style={{ width: EDGE_HANDLE, cursor: 'ew-resize', pointerEvents: 'auto' }}
              onPointerDown={beginResize('w')}
              onPointerMove={resizePointer}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />
            <div
              className="absolute top-0 h-full z-[1]"
              style={{ right: -EDGE_HANDLE, width: EDGE_HANDLE, cursor: 'ew-resize', pointerEvents: 'auto' }}
              onPointerDown={beginResize('e')}
              onPointerMove={resizePointer}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />
            <div
              className="absolute left-0 top-0 w-full z-[2]"
              style={{ height: EDGE_HANDLE, cursor: 'ns-resize', pointerEvents: 'auto' }}
              onPointerDown={beginResize('n')}
              onPointerMove={resizePointer}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />
            <div
              className="absolute bottom-0 left-0 w-full z-[2]"
              style={{ height: EDGE_HANDLE, cursor: 'ns-resize', pointerEvents: 'auto' }}
              onPointerDown={beginResize('s')}
              onPointerMove={resizePointer}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />

            <div
              className="absolute left-0 top-0 z-[3]"
              style={{ width: CORNER_HANDLE, height: CORNER_HANDLE, cursor: 'nwse-resize', pointerEvents: 'auto' }}
              onPointerDown={beginResize('nw')}
              onPointerMove={resizePointer}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />
            <div
              className="absolute right-0 top-0 z-[3]"
              style={{ width: CORNER_HANDLE, height: CORNER_HANDLE, cursor: 'nesw-resize', pointerEvents: 'auto' }}
              onPointerDown={beginResize('ne')}
              onPointerMove={resizePointer}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />
            <div
              className="absolute left-0 bottom-0 z-[3]"
              style={{ width: CORNER_HANDLE, height: CORNER_HANDLE, cursor: 'nesw-resize', pointerEvents: 'auto' }}
              onPointerDown={beginResize('sw')}
              onPointerMove={resizePointer}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />
            <div
              className="absolute right-0 bottom-0 z-[3]"
              style={{ width: CORNER_HANDLE, height: CORNER_HANDLE, cursor: 'nwse-resize', pointerEvents: 'auto' }}
              onPointerDown={beginResize('se')}
              onPointerMove={resizePointer}
              onPointerUp={endResize}
              onPointerCancel={endResize}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default AIChatWindow
