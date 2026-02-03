import { useState, useCallback, useEffect, useRef } from 'react'
import { chatAPI, profileAPI, searchAPI } from '../services/api'
import { storage } from '../utils/storage'
import type { ChatMessage, ChatResponse, UserProfile } from '../types'

const DEV_SEARCH_DURATION_SECONDS = 30

export const useAIChat = (user_id: string | null, profile: UserProfile | null = null, isProfileModified?: () => boolean, resetProfileModified?: () => void, onSearchComplete?: (repos: any[]) => void) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchProgressSeconds, setSearchProgressSeconds] = useState<number | null>(null)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const searchAbortControllerRef = useRef<AbortController | null>(null)
  const searchStartTimeRef = useRef<number>(0)
  const agentType = 'agent1'

  useEffect(() => {
    if (user_id) {
      const savedMessages = storage.getChatMessages(user_id)
      if (savedMessages.length === 0) {
        const welcomeMessage: ChatMessage = {
          role: 'assistant',
          content: '欢迎使用开源贡献智能向导！为便于为你匹配合适的项目，请先简单介绍一下你的技术栈、经验水平和感兴趣的开源方向。',
          timestamp: Date.now()
        }
        const messagesWithWelcome = [welcomeMessage]
        setMessages(messagesWithWelcome)
        storage.saveChatMessages(user_id, messagesWithWelcome)
      } else {
        setMessages(savedMessages)
      }
      const savedSessionId = storage.getSessionId(user_id)
      if (savedSessionId) {
        setSessionId(savedSessionId)
      }
    } else {
      setMessages([])
      setSessionId(undefined)
    }
  }, [user_id])

  const handleAutoSearch = useCallback(async (user_id: string) => {
    setIsSearching(true)
    setSearchProgressSeconds(null)
    const searchMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      action: 'SEARCH_PROJECTS',
      isSearching: true
    }
    setMessages(prev => {
      const updatedMessages = [...prev, searchMessage]
      storage.saveChatMessages(user_id, updatedMessages)
      return updatedMessages
    })

    const abortController = new AbortController()
    searchAbortControllerRef.current = abortController
    searchStartTimeRef.current = Date.now()

    const lang = profile?.language || 'chinese'
    const cancelMessage = (sec: number) => lang === 'chinese' ? `搜索已终止，已进行 ${sec} 秒` : `Search cancelled after ${sec} seconds`

    try {
      if (import.meta.env.DEV) {
        for (let s = 0; s < DEV_SEARCH_DURATION_SECONDS; s++) {
          if (abortController.signal.aborted) {
            const e = new Error('canceled') as Error & { name: string }
            e.name = 'CanceledError'
            throw e
          }
          setSearchProgressSeconds(s)
          await new Promise(r => setTimeout(r, 1000))
        }
        setSearchProgressSeconds(null)
      }
      const searchResult = await (import.meta.env.DEV ? searchAPI.search(user_id, 10) : searchAPI.search(user_id, 10, abortController.signal))
      setIsSearching(false)
      setSearchProgressSeconds(null)
      setMessages(prev => {
        const updated = prev.map((msg, idx) => 
          idx === prev.length - 1 && msg.isSearching 
            ? { ...msg, isSearching: false, content: searchResult.repos.length > 0 ? `找到 ${searchResult.repos.length} 个匹配的项目` : '未找到匹配的项目' }
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
        setMessages(prev => {
          const updated = prev.map((msg, idx) => 
            idx === prev.length - 1 && msg.isSearching 
              ? { ...msg, isSearching: false, content: '搜索失败，请稍后再试' }
              : msg
          )
          storage.saveChatMessages(user_id, updated)
          return updated
        })
      }
    } finally {
      searchAbortControllerRef.current = null
    }
  }, [onSearchComplete, profile?.language])

  const sendMessage = useCallback(async (content: string): Promise<ChatResponse | null> => {
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

    try {
      const response = await chatAPI.send(user_id, content, sessionId, agentType, profile?.language)
      
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
    }
  }, [user_id, sessionId, agentType, profile, isProfileModified, resetProfileModified, handleAutoSearch])

  const cancelSearch = useCallback(() => {
    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort()
      searchAbortControllerRef.current = null
    }
    setIsSearching(false)
    setSearchProgressSeconds(null)
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setSessionId(undefined)
    setIsSearching(false)
    setSearchProgressSeconds(null)
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
    isSearching,
    searchProgressSeconds,
    sendMessage,
    clearMessages,
    cancelSearch
  }
}
