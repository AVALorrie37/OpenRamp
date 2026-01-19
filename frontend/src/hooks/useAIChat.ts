import { useState, useCallback, useEffect } from 'react'
import { chatAPI } from '../services/api'
import { storage } from '../utils/storage'
import type { ChatMessage, ChatResponse } from '../types'

export const useAIChat = (user_id: string | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()

  useEffect(() => {
    if (user_id) {
      const savedMessages = storage.getChatMessages(user_id)
      setMessages(savedMessages)
    } else {
      setMessages([])
    }
  }, [user_id])

  const sendMessage = useCallback(async (content: string): Promise<ChatResponse | null> => {
    if (!user_id || !content.trim()) return null

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
      const response = await chatAPI.send(user_id, content, sessionId)
      
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.reply,
        timestamp: Date.now()
      }
      setMessages(prev => {
        const updatedMessages = [...prev, assistantMessage]
        storage.saveChatMessages(user_id, updatedMessages)
        return updatedMessages
      })

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
  }, [user_id, sessionId])

  const clearMessages = useCallback(() => {
    setMessages([])
    setSessionId(undefined)
    if (user_id) {
      storage.clearChatMessages(user_id)
    }
  }, [user_id])

  return {
    messages,
    loading,
    sendMessage,
    clearMessages
  }
}
