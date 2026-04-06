export interface MatchResult {
  match_score: number
  breakdown: {
    skill: number
    activity: number
    demand: number
  }
  repo_name: string
  repo_full_name: string
  dynamic_weights?: {
    w_skill: number
    w_activity: number
    w_demand: number
    c_data: number
  }
}

export interface RepoResponse {
  repo_id: string
  name: string
  description: string
  languages: string[]
  active_score: number
  influence_score: number
  demand_score: number
  composite_score: number
  match_score?: number
  score_frozen?: boolean
  score_version?: string
  scored_at?: number
  score_context?: {
    weights: { w_skill: number; w_activity: number; w_demand: number }
    profile_fingerprint?: string
  }
  raw_metrics?: {
    active_dates?: string
    openrank?: string
    issues_new?: string
  }
  is_favorited?: boolean
  keywords?: string[]
  breakdown?: MatchResult['breakdown']
  dynamic_weights?: MatchResult['dynamic_weights']
}

export interface ReposResponse {
  mode: string
  repos: RepoResponse[]
  source?: string
}

export interface UserProfile {
  skills: string[]
  preferences: string[]
  experience?: string
  searchHistory?: string[]
  language?: 'chinese' | 'english'
}

export type ProfileGapKind = 'skills' | 'contribution_styles' | 'both'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  action?: string
  notice?: boolean
  isSearching?: boolean
  searchId?: string
  searchResults?: RepoResponse[]
  searchCompleted?: boolean
  searchCompleteMeta?: {
    totalRepos: number
    targetCount: number
    rounds: number
  }
  profileGap?: ProfileGapKind
  suggestedKeywords?: string[]
  profileDraftBaseline?: { skills: string[]; preferences: string[] }
  collectResolved?: boolean
}

export interface ChatResponse {
  reply: string
  status: string
  skills: string[]
  preferences: string[]
  action: string
  intent?: string
  confirmed: boolean
  profile_updated?: boolean
  session_id?: string
  error?: string
  auto_search?: boolean
  profile_gap?: ProfileGapKind
  suggested_keywords?: string[]
}
