import { useState, useCallback, useEffect } from 'react'
import { chatAPI } from '../services/api'
import { storage } from '../utils/storage'
import type { ChatMessage, ChatResponse, UserProfile } from '../types'

const queryPatterns = {
  chinese: [
    /我的技能|我的信息|显示.*技能|查看.*偏好|我有什么|告诉我|列出.*技能|列出.*偏好/,
    /技能.*什么|偏好.*什么|信息.*什么|现在的技能|当前的技能|我的偏好|我的贡献偏好/
  ],
  english: [
    /my skills|my profile|show me|what are my|tell me|list my/i,
    /what.*skills|what.*preferences|what.*profile|current skills|my preferences|my contribution/i
  ]
}

const preferenceMap: Record<string, { chinese: string; english: string }> = {
  bug_fix: { chinese: '修复bug', english: 'bug fixes' },
  feature: { chinese: '开发新功能', english: 'new features' },
  docs: { chinese: '编写文档', english: 'documentation' },
  community: { chinese: '社区支持', english: 'community support' },
  review: { chinese: '代码审查', english: 'code review' },
  test: { chinese: '编写测试', english: 'testing' }
}

function isQueryIntent(message: string, language: 'chinese' | 'english' = 'chinese'): boolean {
  const patterns = queryPatterns[language]
  const lowerMessage = message.toLowerCase()
  return patterns.some(pattern => pattern.test(lowerMessage) || pattern.test(message))
}

function generateQueryResponse(message: string, profile: UserProfile | null): string {
  if (!profile) {
    return '你还没有设置个人信息。请告诉我你的技能和偏好。'
  }

  const language = profile.language || 'chinese'
  const lowerMessage = message.toLowerCase()
  
  const isSkillQuery = /技能|skill/i.test(message)
  const isPreferenceQuery = /偏好|preference|contribution/i.test(message)
  const isFullQuery = !isSkillQuery && !isPreferenceQuery

  const skills = profile.skills || []
  const preferences = profile.preferences || []

  if (language === 'english') {
    if (isSkillQuery) {
      if (skills.length === 0) {
        return 'You haven\'t set any skills yet. Please tell me about your technical skills.'
      }
      return `Your skills are: ${skills.join(', ')}.`
    }
    
    if (isPreferenceQuery) {
      if (preferences.length === 0) {
        return 'You haven\'t set any contribution preferences yet. Please tell me what types of contributions you prefer.'
      }
      const prefText = preferences.map(p => preferenceMap[p]?.english || p).join(', ')
      return `Your contribution preferences are: ${prefText}.`
    }
    
    if (isFullQuery) {
      const skillText = skills.length > 0 ? `Skills: ${skills.join(', ')}` : 'No skills set yet'
      const prefText = preferences.length > 0 
        ? `Contribution preferences: ${preferences.map(p => preferenceMap[p]?.english || p).join(', ')}`
        : 'No contribution preferences set yet'
      return `${skillText}\n${prefText}`
    }
  } else {
    if (isSkillQuery) {
      if (skills.length === 0) {
        return '你还没有设置技能。请告诉我你的技术技能。'
      }
      return `你的技能是：${skills.join('、')}。`
    }
    
    if (isPreferenceQuery) {
      if (preferences.length === 0) {
        return '你还没有设置贡献偏好。请告诉我你更喜欢做什么类型的贡献。'
      }
      const prefText = preferences.map(p => preferenceMap[p]?.chinese || p).join('、')
      return `你的贡献偏好是：${prefText}。`
    }
    
    if (isFullQuery) {
      const skillText = skills.length > 0 ? `技能：${skills.join('、')}` : '暂无技能'
      const prefText = preferences.length > 0 
        ? `贡献偏好：${preferences.map(p => preferenceMap[p]?.chinese || p).join('、')}`
        : '暂无贡献偏好'
      return `${skillText}\n${prefText}`
    }
  }

  return language === 'english' 
    ? 'I couldn\'t understand your query. Please ask about your skills or preferences.'
    : '我没有理解你的查询。请询问你的技能或偏好。'
}

export const useAIChat = (user_id: string | null, profile: UserProfile | null = null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const agentType = 'agent1'

  useEffect(() => {
    if (user_id) {
      const savedMessages = storage.getChatMessages(user_id)
      setMessages(savedMessages)
      const savedSessionId = storage.getSessionId(user_id)
      if (savedSessionId) {
        setSessionId(savedSessionId)
      }
    } else {
      setMessages([])
      setSessionId(undefined)
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

    const userLanguage = profile?.language || 'chinese'
    
    if (isQueryIntent(content, userLanguage)) {
      const reply = generateQueryResponse(content, profile)
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: reply,
        timestamp: Date.now()
      }
      setMessages(prev => {
        const updatedMessages = [...prev, assistantMessage]
        storage.saveChatMessages(user_id, updatedMessages)
        return updatedMessages
      })

      return {
        reply,
        status: 'query',
        skills: profile?.skills || [],
        preferences: profile?.preferences || [],
        action: 'QUERY',
        confirmed: false
      }
    }

    setLoading(true)

    try {
      const response = await chatAPI.send(user_id, content, sessionId, agentType)
      
      if (response.session_id && response.session_id !== sessionId) {
        setSessionId(response.session_id)
        storage.saveSessionId(user_id, response.session_id)
      }
      
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
  }, [user_id, sessionId, agentType, profile])

  const clearMessages = useCallback(() => {
    setMessages([])
    setSessionId(undefined)
    if (user_id) {
      storage.clearChatMessages(user_id)
      storage.clearSessionId(user_id)
    }
  }, [user_id])

  return {
    messages,
    loading,
    sendMessage,
    clearMessages
  }
}
