export interface RepoResponse {
  repo_id: string
  name: string
  description: string
  languages: string[]
  active_score: number
  influence_score: number
  demand_score: number
  composite_score: number
  raw_metrics?: {
    active_dates?: string
    openrank?: string
    issues_new?: string
  }
}

export interface ReposResponse {
  mode: string
  repos: RepoResponse[]
}

export interface UserProfile {
  skills: string[]
  preferences: string[]
  experience?: string
  searchHistory?: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface ChatResponse {
  reply: string
  status: string
  skills: string[]
  preferences: string[]
  action: string
  confirmed: boolean
  error?: string
}

export interface MatchResult {
  match_score: number
  breakdown: {
    skill: number
    activity: number
    demand: number
  }
  repo_name: string
  repo_full_name: string
}

export interface LogEntry {
  level: 'INFO' | 'WARNING' | 'ERROR'
  message: string
  timestamp: number
}
