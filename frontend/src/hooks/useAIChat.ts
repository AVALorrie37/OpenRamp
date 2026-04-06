import { useState, useCallback, useEffect, useRef } from 'react'
import { chatAPI, profileAPI, searchAPI } from '../services/api'
import { storage } from '../utils/storage'
import type { ChatMessage, ChatResponse, UserProfile, ProfileGapKind } from '../types'

function parseProfileGap(g: unknown): ProfileGapKind | undefined {
  if (g === 'skills' || g === 'contribution_styles' || g === 'both') return g
  return undefined
}

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

type UiLang = 'chinese' | 'english'

function staticGreetingFallback(lang: UiLang): string {
  return lang === 'english'
    ? 'Welcome to the open source contribution assistant! To help match suitable projects, please briefly introduce your tech stack, experience level, and open source interests.'
    : '欢迎使用开源贡献智能向导！为便于为你匹配合适的项目，请先简单介绍一下你的技术栈、经验水平和感兴趣的开源方向。'
}

function isPureWelcomeThread(messages: ChatMessage[]): boolean {
  return (
    messages.length === 1 &&
    messages[0].role === 'assistant' &&
    !messages[0].action &&
    !messages[0].isSearching
  )
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

export const useAIChat = (
  user_id: string | null,
  profile: UserProfile | null = null,
  isProfileModified?: () => boolean,
  resetProfileModified?: () => void,
  onSearchComplete?: (repos: any[]) => void,
  uiLanguage: UiLang = 'english',
  updateProfile?: (partial: Partial<UserProfile>) => void
) => {
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
  const greetingCacheRef = useRef<Partial<Record<UiLang, string>>>({})
  const greetingInFlightRef = useRef<Partial<Record<UiLang, Promise<string>>>>({})
  const agentType = 'agent1'

  const resolveGreetingText = useCallback(
    async (userId: string, lang: UiLang): Promise<string> => {
      const cached = greetingCacheRef.current[lang]
      if (cached !== undefined) return cached
      const inflight = greetingInFlightRef.current[lang]
      if (inflight) return inflight

      const p = (async () => {
        try {
          const sid = storage.getSessionId(userId)
          const res = await (chatAPI as any).greeting(userId, lang, sid, agentType)
          if (res.session_id) {
            storage.saveSessionId(userId, res.session_id)
            setSessionId(res.session_id)
          }
          const text = res.greeting as string
          greetingCacheRef.current[lang] = text
          return text
        } catch {
          const fb = staticGreetingFallback(lang)
          greetingCacheRef.current[lang] = fb
          return fb
        } finally {
          delete greetingInFlightRef.current[lang]
        }
      })()
      greetingInFlightRef.current[lang] = p
      return p
    },
    []
  )

  useEffect(() => {
    if (!user_id) {
      setMessages([])
      setSessionId(undefined)
      greetingCacheRef.current = {}
      greetingInFlightRef.current = {}
      return
    }

    const savedMessages = storage.getChatMessages(user_id)
    const savedSessionId = storage.getSessionId(user_id)
    const hasUser = savedMessages.some((m) => m.role === 'user')

    if (hasUser || (savedMessages.length > 0 && !isPureWelcomeThread(savedMessages))) {
      setMessages(savedMessages)
      if (savedSessionId) setSessionId(savedSessionId)
      return
    }

    let cancelled = false
    ;(async () => {
      const content = await resolveGreetingText(user_id, uiLanguage)
      if (cancelled) return
      const latest = storage.getChatMessages(user_id)
      if (latest.some((m) => m.role === 'user') || (latest.length > 0 && !isPureWelcomeThread(latest))) {
        return
      }
      const welcomeMessage: ChatMessage = {
        role: 'assistant',
        content,
        timestamp: Date.now()
      }
      const next = [welcomeMessage]
      setMessages(next)
      storage.saveChatMessages(user_id, next)
    })()

    return () => {
      cancelled = true
    }
  }, [user_id, uiLanguage, resolveGreetingText])

  const handleAutoSearch = useCallback(async (user_id: string) => {
    if (profile?.skills && profile.skills.length > 0) {
      try {
        await profileAPI.sync(user_id, profile.skills, profile.preferences || [], uiLanguage)
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

    const lang = uiLanguage
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
  }, [onSearchComplete, profile, uiLanguage])

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
          uiLanguage
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
      const response = await chatAPI.send(
        user_id,
        content,
        sessionId,
        agentType,
        uiLanguage,
        (stage, data) => {
          if (stage === 'intent_recognizing') setLoadingStage('intent_recognizing')
          else if (stage === 'search_intent_mining') setLoadingStage('search_intent_mining')
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
      if (response.action === 'COLLECT_PROFILE_FOR_SEARCH') {
        const gap = parseProfileGap(response.profile_gap)
        if (gap) {
          assistantMessage.profileGap = gap
          assistantMessage.suggestedKeywords = Array.isArray(response.suggested_keywords)
            ? response.suggested_keywords.map((k) => String(k))
            : []
          assistantMessage.profileDraftBaseline = {
            skills: [...(response.skills || [])],
            preferences: [...(response.preferences || [])]
          }
        }
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
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: uiLanguage === 'english' ? 'Sorry, something went wrong. Please try again later.' : '抱歉，发生了错误。请稍后再试。',
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
  }, [user_id, sessionId, agentType, profile, isProfileModified, resetProfileModified, handleAutoSearch, uiLanguage])

  const confirmCollectProfileDraft = useCallback(
    async (messageIndex: number, draft: { skills: string[]; preferences: string[] }) => {
      if (!user_id) return
      try {
        await profileAPI.sync(user_id, draft.skills, draft.preferences, uiLanguage)
        updateProfile?.({ skills: draft.skills, preferences: draft.preferences })
        resetProfileModified?.()
        setMessages((prev) => {
          const next = prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  collectResolved: true,
                  profileDraftBaseline: { skills: [...draft.skills], preferences: [...draft.preferences] }
                }
              : m
          )
          storage.saveChatMessages(user_id, next)
          return next
        })
        const sufficient = draft.skills.length > 0 && draft.preferences.length > 0
        if (sufficient) {
          await handleAutoSearch(user_id)
        } else {
          const insufficientMsg: ChatMessage = {
            role: 'assistant',
            content:
              uiLanguage === 'english'
                ? 'Your profile has been saved, but there is not enough information to search yet. Please add skills and contribution preferences, or keep chatting with the assistant.'
                : '已保存你的修改，但信息仍不足，暂时无法搜索。请继续补充技能与贡献方式，或与 AI 聊聊完善画像。',
            timestamp: Date.now()
          }
          setMessages((prev) => {
            const next = [...prev, insufficientMsg]
            storage.saveChatMessages(user_id, next)
            return next
          })
        }
      } catch (error) {
        console.error('confirmCollectProfileDraft failed:', error)
      }
    },
    [user_id, uiLanguage, updateProfile, resetProfileModified, handleAutoSearch]
  )

  const triggerLocalQueryIntent = useCallback(() => {
    if (!user_id) return

    const language = uiLanguage
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
  }, [user_id, uiLanguage, profile])

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
    confirmCollectProfileDraft
  }
}
