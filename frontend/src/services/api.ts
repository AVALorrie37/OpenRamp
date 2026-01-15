
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
  send: async (user_id: string, message: string, session_id?: string): Promise<ChatResponse> => {
    const response = await api.post('/api/chat', { user_id, message, session_id })
    return response.data
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
  }
}

export const matchAPI = USE_MOCK ? mockMatchAPI : {
  calculate: async (user_id: string, repo_id: string): Promise<MatchResult> => {
    const response = await api.post('/api/match', { user_id, repo_id })
    return response.data
  }
}

export const searchAPI = USE_MOCK ? mockSearchAPI : {
  search: async (user_id: string, limit?: number): Promise<ReposResponse> => {
    const response = await api.post('/api/search', { user_id, limit })
    return response.data
  }
}