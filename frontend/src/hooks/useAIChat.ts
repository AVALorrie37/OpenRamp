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
  const agentType = 'agent1'

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
      } catch {
        const fallbackMessage: ChatMessage = {
          role: 'assistant',
          content: profile?.language === 'english'
            ? 'Welcome to the open source contribution assistant! To help match suitable projects, please briefly introduce your tech stack, experience level, and open source interests.'
            : '欢迎使用开源贡献智能向导！为便于为你匹配合适的项目，请先简单介绍一下你的技术栈、经验水平和感兴趣的开源方向。',
          timestamp: Date.now()
        }
        const messagesWithWelcome = [fallbackMessage]
        setMessages(messagesWithWelcome)
        storage.saveChatMessages(user_id, messagesWithWelcome)
      }
    }

    initChat()
  }, [user_id, profile?.language])

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
        const updated = prev.map((msg, idx) => 
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
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: '抱歉，发生了错误。请稍后再试。',
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
  }, [user_id, sessionId, agentType, profile, isProfileModified, resetProfileModified, handleAutoSearch])

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
    clearMessages,
    cancelSearch
  }
}
