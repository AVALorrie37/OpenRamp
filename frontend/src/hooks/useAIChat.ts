import { useState, useCallback } from 'react'
import { chatAPI } from '../services/api'
import type { ChatMessage, ChatResponse } from '../types'

export const useAIChat = (user_id: string | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()

  const sendMessage = useCallback(async (content: string): Promise<ChatResponse | null> => {
    if (!user_id || !content.trim()) return null

    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, userMessage])
    setLoading(true)

    try {
      const response = await chatAPI.send(user_id, content, sessionId)
      
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.reply,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, assistantMessage])

      return response
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: '抱歉，发生了错误。请稍后再试。',
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, errorMessage])
      return null
    } finally {
      setLoading(false)
    }
  }, [user_id, sessionId])

  const clearMessages = useCallback(() => {
    setMessages([])
    setSessionId(undefined)
  }, [])

  return {
    messages,
    loading,
    sendMessage,
    clearMessages
  }
}
