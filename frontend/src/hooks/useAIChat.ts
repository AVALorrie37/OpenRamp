import { useState, useCallback, useEffect, useRef } from 'react'
import { chatAPI, profileAPI, searchAPI } from '../services/api'
import { storage } from '../utils/storage'
import type { ChatMessage, ChatResponse, UserProfile } from '../types'

function searchStageToText(stage: string, data: Record<string, unknown>, lang: string): string {
  const kw = (data.keywords as string[])?.join(', ') ?? ''
  if (lang === 'chinese') {
    switch (stage) {
      case 'loading_profile': return '加载用户画像...'
      case 'generating_keywords': return `生成搜索关键词 (${data.combinations ?? ''}个组合)...`
      case 'search_round': return `第${data.round ?? ''}/${data.total_rounds ?? ''}轮搜索: ${kw}...`
      case 'checking_repos': return `检查仓库数据 (已找到${data.found ?? 0}/${data.target ?? ''}个)...`
      case 'scoring': return `计算匹配度评分 (${data.total ?? ''}个仓库)...`
      case 'fallback_scoring': return '使用离线数据评分中...'
      default: return '搜索中...'
    }
  }
  switch (stage) {
    case 'loading_profile': return 'Loading profile...'
    case 'generating_keywords': return `Generating keywords (${data.combinations ?? ''} combinations)...`
    case 'search_round': return `Round ${data.round ?? ''}/${data.total_rounds ?? ''}: ${kw}...`
    case 'checking_repos': return `Checking repos (found ${data.found ?? 0}/${data.target ?? ''})...`
    case 'scoring': return `Scoring ${data.total ?? ''} repositories...`
    case 'fallback_scoring': return 'Scoring offline data...'
    default: return 'Searching...'
  }
}

function humanizePreference(preference: string, language: 'chinese' | 'english'): string {
  const map = language === 'english'
    ? {
      bug_fix: 'Fixing code errors and defects',
      feature: 'Developing new features',
      docs: 'Improving project docs',
      community: 'Answering questions and helping others',
      review: 'Reviewing code quality',
      test: 'Writing test cases'
    }
    : {
      bug_fix: '修复代码错误和缺陷',
      feature: '开发新功能和特性',
      docs: '完善项目文档和说明',
      community: '回答问题和帮助他人',
      review: '审查代码质量',
      test: '编写测试用例'
    }
  const key = String(preference || '').trim() as keyof typeof map
  return map[key] || preference
}

export const useAIChat = (user_id: string | null, profile: UserProfile | null = null, isProfileModified?: () => boolean, resetProfileModified?: () => void, onSearchComplete?: (repos: any[]) => void) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingStage, setLoadingStage] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const [searchProgressSeconds, setSearchProgressSeconds] = useState<number | null>(null)
  const [searchStage, setSearchStage] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const searchAbortControllerRef = useRef<AbortController | null>(null)
  const searchStartTimeRef = useRef<number>(0)
  const searchIdRef = useRef<string | null>(null)
  const searchCompleteMetaRef = useRef<{ totalRepos: number; targetCount: number; rounds: number } | null>(null)
  const aiHealthCacheRef = useRef<{ ts: number; ok: boolean; code?: string } | null>(null)
  const [aiIssue, setAiIssue] = useState<{ code: string; message: string } | null>(null)
  const agentType = 'agent1'

  const getAiUnavailableText = useCallback((code: string) => {
    const lang = profile?.language || 'chinese'
    if (lang === 'english') {
      if (code === 'OLLAMA_NOT_RUNNING') return 'I cannot connect to Ollama yet. Please start Ollama, then click retry.'
      if (code === 'OLLAMA_MODEL_MISSING') return 'Ollama is running but the configured model is missing. Please pull the model, then retry.'
      if (code === 'OLLAMA_UNREACHABLE') return 'Ollama is temporarily unreachable. Please check local service status and retry.'
      return 'AI service is temporarily unavailable. Please retry later.'
    }
    if (code === 'OLLAMA_NOT_RUNNING') return '暂时连不上 Ollama。请先启动 Ollama，然后点击重试。'
    if (code === 'OLLAMA_MODEL_MISSING') return 'Ollama 已启动，但缺少配置模型。请先拉取模型后重试。'
    if (code === 'OLLAMA_UNREACHABLE') return 'Ollama 当前不可达。请检查本地服务状态后重试。'
    return 'AI 服务暂时不可用，请稍后重试。'
  }, [profile?.language])

  const checkAIHealth = useCallback(async (force = false) => {
    const now = Date.now()
    if (!force && aiHealthCacheRef.current && now - aiHealthCacheRef.current.ts < 60000) {
      return aiHealthCacheRef.current.ok
    }
    try {
      const health = await (chatAPI as any).health()
      const ok = !!health?.ollama_available
      aiHealthCacheRef.current = { ts: now, ok, code: health?.code }
      if (!ok) {
        const code = health?.code || 'AI_SERVICE_ERROR'
        setAiIssue({ code, message: getAiUnavailableText(code) })
      } else {
        setAiIssue(null)
      }
      return ok
    } catch (e: any) {
      const code = e?.code || 'AI_SERVICE_ERROR'
      aiHealthCacheRef.current = { ts: now, ok: false, code }
      setAiIssue({ code, message: getAiUnavailableText(code) })
      return false
    }
  }, [getAiUnavailableText])

  useEffect(() => {
    const initChat = async () => {
      if (!user_id) {
        setMessages([])
        setSessionId(undefined)
        return
      }

      const savedMessages = storage.getChatMessages(user_id)
      const savedSessionId = storage.getSessionId(user_id)

      if (savedMessages.length > 0) {
        setMessages(savedMessages)
        if (savedSessionId) {
          setSessionId(savedSessionId)
        }
        return
      }

      try {
        const lang = profile?.language || 'chinese'
        const canUseAI = await checkAIHealth()
        if (!canUseAI) {
          const text = aiIssue?.message || getAiUnavailableText(aiHealthCacheRef.current?.code || 'AI_SERVICE_ERROR')
          const warmupMessage: ChatMessage = {
            role: 'assistant',
            content: text,
            timestamp: Date.now()
          }
          const messagesWithWarmup = [warmupMessage]
          setMessages(messagesWithWarmup)
          storage.saveChatMessages(user_id, messagesWithWarmup)
          return
        }
        const res = await (chatAPI as any).greeting(user_id, lang, savedSessionId, agentType)
        const welcomeMessage: ChatMessage = {
          role: 'assistant',
          content: res.greeting,
          timestamp: Date.now()
        }
        const messagesWithWelcome = [welcomeMessage]
        setMessages(messagesWithWelcome)
        storage.saveChatMessages(user_id, messagesWithWelcome)
        if (res.session_id) {
          setSessionId(res.session_id)
          storage.saveSessionId(user_id, res.session_id)
        }
      } catch (e: any) {
        const code = e?.code || 'AI_SERVICE_ERROR'
        const friendly = getAiUnavailableText(code)
        setAiIssue({ code, message: friendly })
        const fallbackMessage: ChatMessage = {
          role: 'assistant',
          content: friendly,
          timestamp: Date.now()
        }
        const messagesWithWelcome = [fallbackMessage]
        setMessages(messagesWithWelcome)
        storage.saveChatMessages(user_id, messagesWithWelcome)
      }
    }

    initChat()
  }, [user_id, profile?.language, checkAIHealth, aiIssue?.message, getAiUnavailableText])

  const handleAutoSearch = useCallback(async (user_id: string) => {
    if (profile?.skills && profile.skills.length > 0) {
      try {
        await profileAPI.sync(user_id, profile.skills, profile.preferences || [], profile.language)
      } catch {}
    }
    const searchId = `${user_id}-${Date.now()}`
    searchIdRef.current = searchId
    setIsSearching(true)
    setSearchProgressSeconds(null)
    setSearchStage(null)
    const searchMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      action: 'SEARCH_PROJECTS',
      isSearching: true,
      searchId
    }
    setMessages(prev => {
      const updatedMessages = [...prev, searchMessage]
      storage.saveChatMessages(user_id, updatedMessages)
      return updatedMessages
    })

    const abortController = new AbortController()
    searchAbortControllerRef.current = abortController
    searchStartTimeRef.current = Date.now()
    searchCompleteMetaRef.current = null

    const lang = profile?.language || 'chinese'
    const cancelMessage = (sec: number) => lang === 'chinese' ? `搜索已终止，已进行 ${sec} 秒` : `Search cancelled after ${sec} seconds`

    try {
      const searchResult = await searchAPI.search(user_id, 10, searchId, abortController.signal, (stage, data) => {
        if (stage === 'partial_repos') {
          const incoming = (data.repos as any[]) || []
          if (incoming.length > 0) {
            setMessages(prev => {
              const updated = prev.map((msg, idx) => {
                if (!(idx === prev.length - 1 && msg.isSearching)) return msg
                const existing = msg.searchResults || []
                const seen = new Set(existing.map(r => r.repo_id))
                const appended = incoming.filter(r => !seen.has(r.repo_id))
                const merged = [...existing, ...appended]
                return {
                  ...msg,
                  content: lang === 'chinese' ? `已找到 ${merged.length} 个候选项目` : `Found ${merged.length} candidate projects`,
                  searchResults: merged
                }
              })
              storage.saveChatMessages(user_id, updated)
              return updated
            })
          }
          return
        }
        if (stage === 'search_complete_notice') {
          searchCompleteMetaRef.current = {
            totalRepos: Number(data.total_repos ?? 0),
            targetCount: Number(data.target_count ?? 0),
            rounds: Number(data.rounds ?? 0)
          }
          return
        }
        setSearchStage(searchStageToText(stage, data, lang))
      })
      setIsSearching(false)
      setSearchProgressSeconds(null)
      setSearchStage(null)
      setMessages(prev => {
        const updatedBase = prev.map((msg, idx) => 
          idx === prev.length - 1 && msg.isSearching 
            ? {
                ...msg,
                isSearching: false,
                content: searchResult.repos.length > 0
                  ? (lang === 'chinese' ? `找到 ${searchResult.repos.length} 个匹配的项目：` : `Found ${searchResult.repos.length} matching projects:`)
                  : (lang === 'chinese' ? '未找到匹配的项目' : 'No matching projects found'),
                searchResults: searchResult.repos.length > 0 ? searchResult.repos : undefined,
                searchCompleted: true,
                searchCompleteMeta: searchCompleteMetaRef.current || undefined
              }
            : msg
        )
        const meta = searchCompleteMetaRef.current
        const noticeText = meta
          ? (
            lang === 'chinese'
              ? `搜索完成：共 ${meta.totalRepos} 个仓库，目标 ${meta.targetCount}，轮次 ${meta.rounds}。`
              : `Search complete: ${meta.totalRepos} repos, target ${meta.targetCount}, rounds ${meta.rounds}.`
          )
          : (lang === 'chinese' ? '搜索完成。' : 'Search complete.')
        const noticeMessage: ChatMessage = {
          role: 'assistant',
          content: noticeText,
          notice: true,
          timestamp: Date.now()
        }
        const updated = [...updatedBase, noticeMessage]
        storage.saveChatMessages(user_id, updated)
        return updated
      })
      if (onSearchComplete) {
        onSearchComplete(searchResult.repos)
      }
    } catch (error: any) {
      if (error.name === 'CanceledError' || error.message?.includes('canceled')) {
        const elapsed = Math.round((Date.now() - searchStartTimeRef.current) / 1000)
        const text = cancelMessage(elapsed)
        setIsSearching(false)
        setSearchProgressSeconds(null)
        setSearchStage(null)
        setMessages(prev => {
          const updated = prev.map((msg, idx) => 
            idx === prev.length - 1 && msg.isSearching 
              ? { ...msg, isSearching: false, content: text }
              : msg
          )
          storage.saveChatMessages(user_id, updated)
          return updated
        })
      } else {
        setIsSearching(false)
        setSearchProgressSeconds(null)
        setSearchStage(null)
        setMessages(prev => {
          const updated = prev.map((msg, idx) => 
            idx === prev.length - 1 && msg.isSearching 
              ? { ...msg, isSearching: false, content: lang === 'chinese' ? '搜索失败，请稍后再试' : 'Search failed, please try again later' }
              : msg
          )
          storage.saveChatMessages(user_id, updated)
          return updated
        })
      }
    } finally {
      searchAbortControllerRef.current = null
      searchIdRef.current = null
    }
  }, [onSearchComplete, profile])

  const sendMessage = useCallback(async (
    content: string,
    opts?: { skipIntent?: boolean }
  ): Promise<ChatResponse | null> => {
    if (!user_id || !content.trim()) return null

    if (isProfileModified && resetProfileModified && profile && isProfileModified()) {
      try {
        await profileAPI.sync(
          user_id,
          profile.skills || [],
          profile.preferences || [],
          profile.language
        )
        resetProfileModified()
      } catch (error) {
        console.error('Failed to sync profile:', error)
      }
    }

    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: Date.now()
    }
    setMessages(prev => {
      const newMessages = [...prev, userMessage]
      storage.saveChatMessages(user_id, newMessages)
      return newMessages
    })

    setLoading(true)
    setLoadingStage(opts?.skipIntent ? 'concept_explaining' : 'intent_recognizing')

    try {
      const canUseAI = await checkAIHealth()
      if (!canUseAI) {
        const code = aiHealthCacheRef.current?.code || 'AI_SERVICE_ERROR'
        const friendly: ChatMessage = {
          role: 'assistant',
          content: getAiUnavailableText(code),
          timestamp: Date.now()
        }
        setMessages(prev => {
          const updated = [...prev, friendly]
          storage.saveChatMessages(user_id, updated)
          return updated
        })
        return null
      }
      const response = await chatAPI.send(
        user_id,
        content,
        sessionId,
        agentType,
        profile?.language,
        (stage, data) => {
          if (stage === 'intent_recognizing') setLoadingStage('intent_recognizing')
          else if (stage === 'intent_done') {
            const next = (data.next as string) || 'generating_reply'
            setLoadingStage(next === 'generating_reply' && opts?.skipIntent ? 'concept_explaining' : next)
          } else if (stage === 'generating_reply') {
            setLoadingStage(opts?.skipIntent ? 'concept_explaining' : 'generating_reply')
          }
        },
        opts?.skipIntent
      )
      
      if (response.session_id && response.session_id !== sessionId) {
        setSessionId(response.session_id)
        storage.saveSessionId(user_id, response.session_id)
      }
      
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.reply,
        timestamp: Date.now(),
        action: response.action
      }
      setMessages(prev => {
        const updatedMessages = [...prev, assistantMessage]
        storage.saveChatMessages(user_id, updatedMessages)
        return updatedMessages
      })

      if (response.action === 'SEARCH_PROJECTS') {
        handleAutoSearch(user_id)
      }

      return response
    } catch (error: any) {
      console.error('Chat error:', error)
      const code = error?.code || 'AI_SERVICE_ERROR'
      setAiIssue({ code, message: getAiUnavailableText(code) })
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: getAiUnavailableText(code),
        timestamp: Date.now()
      }
      setMessages(prev => {
        const errorMessages = [...prev, errorMessage]
        storage.saveChatMessages(user_id, errorMessages)
        return errorMessages
      })
      return null
    } finally {
      setLoading(false)
      setLoadingStage(null)
    }
  }, [user_id, sessionId, agentType, profile, isProfileModified, resetProfileModified, handleAutoSearch, checkAIHealth, getAiUnavailableText])

  const triggerLocalQueryIntent = useCallback(() => {
    if (!user_id) return

    const language = profile?.language || 'chinese'
    const mockUserInput = language === 'english'
      ? 'What are my current skills and preferences?'
      : '我当前的技能和偏好是什么？'

    const skills = profile?.skills || []
    const preferences = profile?.preferences || []
    const emptySkills = language === 'english' ? 'Not provided yet' : '暂未填写'
    const emptyPreferences = language === 'english' ? 'Not provided yet' : '暂未填写'
    const skillsText = skills.length > 0 ? skills.join(language === 'english' ? ', ' : '、') : emptySkills
    const preferencesText = preferences.length > 0
      ? preferences.map((p) => humanizePreference(p, language)).join(language === 'english' ? '; ' : '；')
      : emptyPreferences

    const assistantReply = language === 'english'
      ? `Based on our conversation, your current profile:\nSkills: ${skillsText}\nContribution preferences: ${preferencesText}`
      : `根据我们的对话，你目前的画像如下：\n技能：${skillsText}\n贡献偏好：${preferencesText}`

    const now = Date.now()
    const userMessage: ChatMessage = { role: 'user', content: mockUserInput, timestamp: now }
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: assistantReply,
      timestamp: now + 1,
      action: 'REPLY'
    }
    setMessages(prev => {
      const updated = [...prev, userMessage, assistantMessage]
      storage.saveChatMessages(user_id, updated)
      return updated
    })
  }, [user_id, profile])

  const cancelSearch = useCallback(() => {
    const currentSearchId = searchIdRef.current
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort()
      searchAbortControllerRef.current = null
    }
    setIsSearching(false)
    setSearchProgressSeconds(null)
    if (currentSearchId) {
      ;(searchAPI as any).cancel(currentSearchId).catch(() => {})
    }
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setSessionId(undefined)
    setIsSearching(false)
    setSearchProgressSeconds(null)
    setSearchStage(null)
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort()
      searchAbortControllerRef.current = null
    }
    if (user_id) {
      storage.clearChatMessages(user_id)
      storage.clearSessionId(user_id)
    }
  }, [user_id])

  return {
    messages,
    loading,
    loadingStage,
    isSearching,
    searchProgressSeconds,
    searchStage,
    sendMessage,
    triggerLocalQueryIntent,
    clearMessages,
    cancelSearch,
    aiIssue,
    checkAIHealth
  }
}
