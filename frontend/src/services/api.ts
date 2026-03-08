
import axios from 'axios'
import type { ReposResponse, ChatResponse, UserProfile, MatchResult } from '../types'
import { 
  mockReposAPI, 
  mockChatAPI, 
  mockProfileAPI, 
  mockMatchAPI, 
  mockSearchAPI 
} from './mockApi'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const API_BASE = 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000
})

export const reposAPI = USE_MOCK ? mockReposAPI : {
  get: async (params?: { mode?: string; repo_ids?: string[]; limit?: number }): Promise<ReposResponse> => {
    const response = await api.get('/api/repos', { params })
    return response.data
  }
}

export const chatAPI = USE_MOCK ? mockChatAPI : {
  send: async (
    user_id: string,
    message: string,
    session_id?: string,
    agent_type: string = 'agent1',
    language?: string,
    onStage?: (stage: string, data: Record<string, unknown>) => void
  ): Promise<ChatResponse> => {
    const body = { user_id, message, session_id, agent_type, language }
    const res = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(res.statusText)
    const reader = res.body?.getReader()
    if (!reader) throw new Error('No body')
    const dec = new TextDecoder()
    let buf = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n\n')
      buf = lines.pop() ?? ''
      for (const chunk of lines) {
        const m = chunk.match(/^data:\s*(.+)$/m)
        if (!m) continue
        try {
          const payload = JSON.parse(m[1].trim()) as Record<string, unknown>
          const stage = payload.stage as string
          if (stage === 'reply') return payload as unknown as ChatResponse
          if (stage === 'error') throw new Error((payload.detail as string) || 'Unknown error')
          onStage?.(stage, payload)
        } catch (e) {
          if (e instanceof Error && e.message !== 'Unknown error') throw e
        }
      }
    }
    throw new Error('Stream ended without reply')
  }
}

export const profileAPI = USE_MOCK ? mockProfileAPI : {
  confirm: async (user_id: string): Promise<{ profile: any; skills: string[] }> => {
    const response = await api.post('/api/profile/confirm', { user_id })
    return response.data
  },
  get: async (user_id: string): Promise<UserProfile> => {
    const response = await api.get(`/api/profile/${user_id}`)
    return response.data
  },
  sync: async (user_id: string, skills: string[], preferences: string[], language?: string): Promise<{ status: string; message: string }> => {
    const response = await api.post('/api/profile/sync', { user_id, skills, preferences, language })
    return response.data
  }
}

export const matchAPI = USE_MOCK ? mockMatchAPI : {
  calculate: async (user_id: string, repo_id: string): Promise<MatchResult> => {
    const response = await api.post('/api/match', { user_id, repo_id })
    return response.data
  }
}

export const searchAPI = USE_MOCK ? mockSearchAPI : {
  search: async (user_id: string, limit?: number, signal?: AbortSignal): Promise<ReposResponse> => {
    const response = await api.post('/api/search', { user_id, limit }, { signal })
    return response.data
  },
  cancel: async (search_id: string): Promise<{ status: string }> => {
    const response = await api.post('/api/search/cancel', { search_id })
    return response.data
  }
}

export const intentAPI = {
  queryStatus: async (user_id: string) => {
    // TODO: 对接意图 query_status 的后端接口
    return chatAPI.send(user_id, 'show my profile')
  },
  submitProfileUpdate: async (user_id: string, message: string, session_id?: string, language?: string) => {
    // TODO: 对接意图 update_profile 的后端接口
    return chatAPI.send(user_id, message, session_id, 'agent1', language)
  }
}