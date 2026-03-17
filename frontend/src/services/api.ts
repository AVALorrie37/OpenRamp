
import axios, { AxiosError } from 'axios'
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

const isNetworkError = (error: unknown): error is AxiosError => {
  return axios.isAxiosError(error) && (!!error.code || error.message === 'Network Error')
}

const unwrap = async <T>(promise: Promise<{ data: T }>): Promise<T> => {
  try {
    const response = await promise
    return response.data
  } catch (err) {
    if (isNetworkError(err) || (axios.isAxiosError(err) && !err.response)) {
      const e = new Error('NETWORK_UNAVAILABLE')
      ;(e as any).code = 'NETWORK_UNAVAILABLE'
      throw e
    }
    if (axios.isAxiosError(err) && err.response) {
      const e = new Error((err.response.data as any)?.detail || err.message)
      ;(e as any).status = err.response.status
      throw e
    }
    throw err
  }
}

export const reposAPI = USE_MOCK
  ? mockReposAPI
  : {
      get: async (params?: { mode?: string; repo_ids?: string[]; limit?: number }): Promise<ReposResponse> => {
        return unwrap(api.get('/api/repos', { params }))
      }
    }

export const manualSearchAPI = {
  searchGithub: async (query: string, per_page: number = 20, page: number = 1) => {
    return unwrap(
      api.get('/api/github/search_repos', {
        params: { q: query, per_page, page }
      })
    )
  },
  bulkEnrich: async (repos: { repo_id: string; full_name: string }[]) => {
    return unwrap(api.post<ReposResponse>('/api/repos/bulk_enrich', { repos }))
  }
}

export const activityAPI = {
  getCommitTrend: async (repo_id: string): Promise<{ points: { date: string; count: number }[] }> => {
    return unwrap(api.get('/api/github/commit_trend', { params: { repo_id } }))
  },
  getIssueTrend: async (repo_id: string): Promise<{ points: { date: string; count: number }[] }> => {
    return unwrap(api.get('/api/github/issue_trend', { params: { repo_id } }))
  }
}

type ChatGreetingResponse = { greeting: string; session_id: string; language: string }

export const chatAPI: typeof mockChatAPI | {
  send: (
    user_id: string,
    message: string,
    session_id?: string,
    agent_type?: string,
    language?: string,
    onStage?: (stage: string, data: Record<string, unknown>) => void
  ) => Promise<ChatResponse>
  greeting: (
    user_id: string,
    language?: string,
    session_id?: string,
    agent_type?: string
  ) => Promise<ChatGreetingResponse>
} = USE_MOCK ? mockChatAPI : {
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
  },
  greeting: async (
    user_id: string,
    language?: string,
    session_id?: string,
    agent_type: string = 'agent1'
  ): Promise<ChatGreetingResponse> => {
    const response = await api.post('/api/chat/greeting', {
      user_id,
      language,
      session_id,
      agent_type
    })
    return response.data
  }
}

export const profileAPI = USE_MOCK ? mockProfileAPI : {
  confirm: async (user_id: string): Promise<{ profile: any; skills: string[] }> => {
    return unwrap(api.post('/api/profile/confirm', { user_id }))
  },
  get: async (user_id: string): Promise<UserProfile> => {
    return unwrap(api.get(`/api/profile/${user_id}`))
  },
  sync: async (user_id: string, skills: string[], preferences: string[], language?: string): Promise<{ status: string; message: string }> => {
    return unwrap(api.post('/api/profile/sync', { user_id, skills, preferences, language }))
  }
}

export const matchAPI = USE_MOCK ? mockMatchAPI : {
  calculate: async (user_id: string, repo_id: string, weights?: { w_skill: number; w_activity: number; w_demand: number }): Promise<MatchResult> => {
    return unwrap(api.post('/api/match', { user_id, repo_id, weights }))
  }
}

type SearchAPIType = {
  search: (user_id: string, limit?: number, search_id?: string, signal?: AbortSignal) => Promise<ReposResponse>
  cancel: (search_id: string) => Promise<{ status: string }>
}

export const searchAPI: SearchAPIType = USE_MOCK
  ? (mockSearchAPI as SearchAPIType)
  : {
      search: async (user_id: string, limit?: number, search_id?: string, signal?: AbortSignal): Promise<ReposResponse> => {
        return unwrap(api.post('/api/search', { user_id, limit, search_id }, { signal }))
      },
      cancel: async (search_id: string): Promise<{ status: string }> => {
        return unwrap(api.post('/api/search/cancel', { search_id }))
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