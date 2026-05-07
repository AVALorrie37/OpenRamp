// Mock API services for VITE_USE_MOCK — scripted chat + in-memory user repos and virtual GitHub/activity data
import type { ReposResponse, ChatResponse, UserProfile, MatchResult, RepoResponse } from '../types'
import { runMockChatSend } from '../mock/mockChatMachine'

/** Preset list / offline dataset (left column initial load): repo1–repo5 only */
const MOCK_PRESET_REPOS: RepoResponse[] = [
  {
    repo_id: 'test/repo1',
    name: 'repo1',
    description: 'A test repository for Python and JavaScript development',
    languages: ['Python', 'JavaScript'],
    active_score: 0.85,
    influence_score: 0.23,
    demand_score: 0.75,
    composite_score: 0.55,
    match_score: 0.55,
    raw_metrics: {
      openrank: '2024-01-01:10,2024-01-02:15,2024-01-03:12,2024-01-04:18,2024-01-05:20',
      active_dates: '2024-01-01:23,2024-01-02:18',
      issues_new: '2024-01:12'
    },
    keywords: ['python', 'javascript', 'development']
  },
  {
    repo_id: 'test/repo2',
    name: 'repo2',
    description: 'Machine learning framework with TensorFlow and PyTorch support',
    languages: ['Python', 'TypeScript'],
    active_score: 0.78,
    influence_score: 0.88,
    demand_score: 0.82,
    composite_score: 0.81,
    match_score: 0.81,
    raw_metrics: {
      openrank: '2024-01-01:8,2024-01-02:12,2024-01-03:10,2024-01-04:14,2024-01-05:16',
      active_dates: '2024-01-01:20,2024-01-02:15',
      issues_new: '2024-01:15'
    },
    keywords: ['machine-learning', 'tensorflow', 'pytorch', 'framework']
  },
  {
    repo_id: 'test/repo3',
    name: 'repo3',
    description: 'Web application using React and Node.js for beginners',
    languages: ['JavaScript', 'TypeScript'],
    active_score: 0.72,
    influence_score: 0.45,
    demand_score: 0.88,
    composite_score: 0.77,
    match_score: 0.77,
    raw_metrics: {
      openrank: '2024-01-01:5,2024-01-02:7,2024-01-03:6,2024-01-04:8,2024-01-05:9',
      active_dates: '2024-01-01:15,2024-01-02:12',
      issues_new: '2024-01:20'
    },
    keywords: ['react', 'nodejs', 'web-app', 'beginners']
  },
  {
    repo_id: 'test/repo4',
    name: 'repo4',
    description: 'High-activity DevOps toolkit with strong demand but moderate influence',
    languages: ['Go', 'Python'],
    active_score: 0.92,
    influence_score: 0.4,
    demand_score: 0.9,
    composite_score: 0.78,
    match_score: 0.78,
    raw_metrics: {
      openrank: '2024-01-01:6,2024-01-02:9,2024-01-03:11,2024-01-04:13,2024-01-05:14',
      active_dates: '2024-01-01:25,2024-01-02:24',
      issues_new: '2024-01:25'
    },
    keywords: ['devops', 'toolkit', 'high-activity']
  },
  {
    repo_id: 'test/repo5',
    name: 'repo5',
    description: 'Well-known library with high influence but relatively lower recent activity and demand',
    languages: ['Rust'],
    active_score: 0.4,
    influence_score: 0.95,
    demand_score: 0.35,
    composite_score: 0.6,
    match_score: 0.6,
    raw_metrics: {
      openrank: '2024-01-01:20,2024-01-02:22,2024-01-03:25,2024-01-04:27,2024-01-05:30',
      active_dates: '2024-01-01:8,2024-01-02:6',
      issues_new: '2024-01:5'
    },
    keywords: ['rust', 'library', 'popular']
  }
]

/** Shown only after AI search / multi-round mock — not in initial preset */
const MOCK_SEARCH_EXTRA_REPOS: RepoResponse[] = [6, 7, 8, 9, 10].map((n) => {
  const base = 0.42 + (n % 4) * 0.11
  return {
    repo_id: `test/repo${n}`,
    name: `repo${n}`,
    description: `Mock discovery repo${n}: tooling and libraries surfaced by demo search (not in the initial offline list).`,
    languages: n % 2 === 0 ? ['Python', 'Go'] : ['TypeScript', 'Rust'],
    active_score: Math.min(0.95, 0.58 + (n % 5) * 0.07),
    influence_score: Math.min(0.92, base + 0.2),
    demand_score: Math.min(0.9, 0.62 + (n % 3) * 0.08),
    composite_score: 0.7,
    match_score: 0.7,
    raw_metrics: {
      openrank: '2024-02-01:10,2024-02-02:12,2024-02-03:11',
      active_dates: '2024-02-01:12,2024-02-02:10',
      issues_new: '2024-02:8'
    },
    keywords: ['mock-search', `repo${n}`, 'demo']
  } as RepoResponse
})

/** Manual GitHub search mock: names GitHub_repo1 … GitHub_repo8 */
const MOCK_GITHUB_NAMED_REPOS: RepoResponse[] = Array.from({ length: 8 }, (_, i) => {
  const n = i + 1
  const name = `GitHub_repo${n}`
  return {
    repo_id: `mock/${name}`,
    name,
    description: `Mock GitHub-style catalog ${name}: CLI utilities, SDK samples, and CI templates (${n % 2 ? 'TypeScript' : 'Python'}).`,
    languages: n % 2 === 0 ? ['TypeScript', 'JavaScript'] : ['Python', 'Go'],
    active_score: 0.55 + (n % 5) * 0.07,
    influence_score: 0.35 + (n % 6) * 0.09,
    demand_score: 0.5 + (n % 4) * 0.1,
    composite_score: 0.65,
    match_score: 0.65,
    raw_metrics: {
      openrank: `2024-03-${String(n).padStart(2, '0')}:8,2024-03-${String(n + 1).padStart(2, '0')}:11`,
      active_dates: '2024-03-01:9,2024-03-02:14',
      issues_new: '2024-03:6'
    },
    keywords: ['github-mock', name.toLowerCase(), 'catalog']
  } as RepoResponse
})

/** Preset + search-only extras (repo6–10); used by stream search & match */
export function getMockSearchCatalogRepos(): RepoResponse[] {
  return [...MOCK_PRESET_REPOS, ...MOCK_SEARCH_EXTRA_REPOS]
}

function findMockRepoById(repo_id: string): RepoResponse | undefined {
  return getMockSearchCatalogRepos().find((r) => r.repo_id === repo_id) ||
    MOCK_GITHUB_NAMED_REPOS.find((r) => r.repo_id === repo_id)
}

export const MOCK_REPOS: ReposResponse = {
  mode: 'offline',
  source: 'offline_dataset',
  repos: MOCK_PRESET_REPOS
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function scoreRepo(
  repo: RepoResponse,
  weights: { w_skill: number; w_activity: number; w_demand: number }
): RepoResponse {
  const sum = (weights.w_skill || 0) + (weights.w_activity || 0) + (weights.w_demand || 0) || 1
  const wSkill = weights.w_skill / sum
  const wActivity = weights.w_activity / sum
  const wDemand = weights.w_demand / sum
  const skill = repo.influence_score
  const activity = repo.active_score
  const demand = repo.demand_score
  const match_score = wSkill * skill + wActivity * activity + wDemand * demand
  return {
    ...repo,
    match_score,
    breakdown: { skill, activity, demand },
    dynamic_weights: {
      w_skill: wSkill,
      w_activity: wActivity,
      w_demand: wDemand,
      c_data: 1.0
    }
  }
}

/** Demo weights for mock search UIs (chat bubble + manual multi-round list) */
const MOCK_SEARCH_DEMO_WEIGHTS = { w_skill: 0.5, w_activity: 0.3, w_demand: 0.2 }

/** user_id -> repo_id -> snapshot */
const mockUserRepoBuckets = new Map<string, Map<string, RepoResponse>>()

function getUserBucket(user_id: string): Map<string, RepoResponse> {
  let b = mockUserRepoBuckets.get(user_id)
  if (!b) {
    b = new Map()
    MOCK_REPOS.repos.forEach((r) => b!.set(r.repo_id, { ...r }))
    mockUserRepoBuckets.set(user_id, b)
  }
  return b
}

export const mockUserReposAPI = {
  list: async (user_id: string): Promise<ReposResponse> => {
    await sleep(200)
    const b = getUserBucket(user_id)
    return {
      mode: 'user_online',
      source: 'user_repo_store',
      repos: Array.from(b.values())
    }
  },
  upsert: async (user_id: string, repo: RepoResponse): Promise<{ status: string; repo: RepoResponse }> => {
    await sleep(120)
    const b = getUserBucket(user_id)
    const id = repo.repo_id
    b.set(id, { ...repo })
    return { status: 'ok', repo: b.get(id)! }
  },
  delete: async (user_id: string, repo_id: string): Promise<{ status: string }> => {
    await sleep(100)
    getUserBucket(user_id).delete(repo_id)
    return { status: 'ok' }
  },
  applyWeights: async (
    user_id: string,
    weights: { w_skill: number; w_activity: number; w_demand: number },
    budget: number = 5,
    _ttl_hours: number = 24,
    force_repo_id?: string
  ): Promise<{ refreshed: string[]; repos: RepoResponse[] }> => {
    await sleep(180)
    const b = getUserBucket(user_id)
    let ids = Array.from(b.keys())
    if (force_repo_id && b.has(force_repo_id)) {
      ids = [force_repo_id, ...ids.filter((x) => x !== force_repo_id)]
    }
    const slice = ids.slice(0, Math.max(1, budget))
    const repos: RepoResponse[] = []
    for (const id of slice) {
      const raw = b.get(id)
      if (!raw) continue
      const scored = scoreRepo(raw, weights)
      b.set(id, scored)
      repos.push(scored)
    }
    return { refreshed: [], repos }
  }
}

function githubSearchItemFromRepo(r: RepoResponse) {
  const full = r.repo_id
  const [owner] = full.split('/')
  return {
    full_name: full,
    html_url: `https://github.com/${full}`,
    description: r.description || '',
    stargazers_count: 36 + (r.name?.length || 0) * 4,
    updated_at: new Date().toISOString(),
    owner: { login: owner || 'mock', avatar_url: `https://avatars.githubusercontent.com/${owner}` }
  }
}

export const mockManualSearchAPI = {
  searchGithub: async (query: string, per_page: number = 20, page: number = 1) => {
    await sleep(350)
    const q = (query || '').toLowerCase()
    const pool = MOCK_GITHUB_NAMED_REPOS.map(githubSearchItemFromRepo)
    const keywordsOnly = q
      .split(/\s+/)
      .filter((t) => t && !t.startsWith('archived:') && !t.startsWith('pushed:'))
      .join(' ')
      .trim()

    let filtered = pool
    if (keywordsOnly.length >= 1) {
      filtered = pool.filter((p) => {
        const hay = `${p.full_name} ${p.description}`.toLowerCase()
        return keywordsOnly.split(/\s+/).every((kw) => kw.length === 0 || hay.includes(kw.toLowerCase()))
      })
    }
    if (filtered.length === 0) filtered = pool

    const start = (page - 1) * per_page
    const items = filtered.slice(start, start + per_page)
    return { total_count: filtered.length, items }
  },
  bulkEnrich: async (repos: { repo_id: string; full_name: string }[]): Promise<ReposResponse> => {
    await sleep(400)
    const out: RepoResponse[] = repos.map((r, i) => {
      const base = findMockRepoById(r.repo_id)
      if (base) return { ...base, repo_id: r.repo_id }
      return {
        repo_id: r.repo_id,
        name: r.full_name.split('/')[1] || r.repo_id,
        description: 'Enriched mock repository',
        languages: ['TypeScript'],
        active_score: 0.7 + (i % 3) * 0.05,
        influence_score: 0.5,
        demand_score: 0.65,
        composite_score: 0.62,
        match_score: 0.62,
        keywords: ['mock']
      } as RepoResponse
    })
    return { mode: 'online', source: 'mock_enrich', repos: out }
  },
  autoMultiRoundSearch: async (_keywords: string[], limit: number = 20, _user_id?: string) => {
    await sleep(500)
    const slice = MOCK_SEARCH_EXTRA_REPOS.slice(0, Math.min(limit, MOCK_SEARCH_EXTRA_REPOS.length))
    return {
      repos: slice.map((r) => {
        const scored = scoreRepo(r, MOCK_SEARCH_DEMO_WEIGHTS)
        return {
          ...scored,
          full_name: r.repo_id,
          html_url: `https://github.com/${r.repo_id}`,
          stargazers_count: 28 + (r.name?.length || 0) * 2,
          owner: { login: r.repo_id.split('/')[0] || 'test' }
        }
      })
    }
  }
}

function trendPoints(seed: number, days: number) {
  const pts: { date: string; count: number }[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    const count = Math.max(0, Math.round(8 + 6 * Math.sin(seed + i * 0.4) + (i % 5)))
    pts.push({ date, count })
  }
  return pts
}

export const mockActivityAPI = {
  getCommitTrend: async (repo_id: string) => {
    await sleep(200)
    return { points: trendPoints(repo_id.length * 3, 21) }
  },
  getIssueTrend: async (repo_id: string) => {
    await sleep(200)
    return { points: trendPoints(repo_id.length * 5, 21) }
  },
  getCommitTrendCachedFallback: async (repo_id: string) => {
    await sleep(150)
    const points = trendPoints(repo_id.length * 2, 14)
    return { points, cache_date: new Date().toISOString().slice(0, 10) }
  },
  getIssueTrendCachedFallback: async (repo_id: string, days: number = 30) => {
    await sleep(150)
    const points = trendPoints(repo_id.length * 7, Math.min(days, 30))
    return { points, cache_date: new Date().toISOString().slice(0, 10) }
  }
}

export const mockReposAPI = {
  get: async (params?: { mode?: string; repo_ids?: string[]; limit?: number }): Promise<ReposResponse> => {
    await sleep(500)
    const catalog = getMockSearchCatalogRepos()
    let list = MOCK_PRESET_REPOS
    if (params?.repo_ids?.length) {
      const set = new Set(params.repo_ids)
      list = catalog.filter((r) => set.has(r.repo_id))
    }
    return {
      ...MOCK_REPOS,
      repos: list.slice(0, params?.limit || 10)
    }
  }
}

export const mockChatAPI = {
  send: async (
    user_id: string,
    message: string,
    session_id?: string,
    _agent_type: string = 'agent1',
    language?: string,
    _model?: string,
    onStage?: (stage: string, data: Record<string, unknown>) => void,
    skipIntent?: boolean
  ): Promise<ChatResponse> => {
    return runMockChatSend(user_id, message, language, session_id, onStage, skipIntent)
  },
  greeting: async (user_id: string, language?: string, session_id?: string, _agent_type: string = 'agent1') => {
    await sleep(300)
    const lang = language === 'english' ? 'english' : 'chinese'
    return {
      greeting:
        lang === 'english'
          ? 'Welcome to the open source contribution assistant! Use the text already in the input box (or type the suggested lines) to try the scripted demo step by step.'
          : '欢迎使用开源贡献智能向导！输入框会预填示范语句；直接发送未修改的文案即可按步骤体验演示。',
      session_id: session_id || `${user_id}_agent1_${Date.now()}`,
      language: language || 'chinese'
    }
  }
}

export const mockProfileAPI = {
  confirm: async (_user_id: string): Promise<{ profile: any; skills: string[] }> => {
    await sleep(300)
    return {
      profile: {
        skills: ['Python', 'React'],
        contribution_types: ['docs', 'bug_fix'],
        experience_level: 'intermediate'
      },
      skills: ['Python', 'React']
    }
  },
  get: async (_user_id: string): Promise<UserProfile> => {
    await sleep(300)
    return {
      skills: ['Python', 'React'],
      preferences: ['docs', 'bug_fix'],
      experience: 'intermediate'
    }
  },
  sync: async (_user_id: string, _skills: string[], _preferences: string[], _language?: string): Promise<{ status: string; message: string }> => {
    await sleep(100)
    return {
      status: 'success',
      message: 'Profile synced successfully'
    }
  }
}

export const mockMatchAPI = {
  calculate: async (_user_id: string, repo_id: string, weights?: { w_skill: number; w_activity: number; w_demand: number }): Promise<MatchResult> => {
    await sleep(500)

    const repo = findMockRepoById(repo_id)

    let wSkill = 0.5
    let wActivity = 0.3
    let wDemand = 0.2
    if (weights) {
      const sum = (weights.w_skill || 0) + (weights.w_activity || 0) + (weights.w_demand || 0)
      if (sum > 0) {
        wSkill = (weights.w_skill || 0) / sum
        wActivity = (weights.w_activity || 0) / sum
        wDemand = (weights.w_demand || 0) / sum
      }
    }

    if (repo) {
      const skill = repo.influence_score
      const activity = repo.active_score
      const demand = repo.demand_score
      const matchScore = wSkill * skill + wActivity * activity + wDemand * demand
      return {
        match_score: matchScore,
        breakdown: {
          skill,
          activity,
          demand
        },
        repo_name: repo.name,
        repo_full_name: repo.repo_id,
        dynamic_weights: {
          w_skill: wSkill,
          w_activity: wActivity,
          w_demand: wDemand,
          c_data: 1.0
        }
      }
    }

    return {
      match_score: 0.85,
      breakdown: {
        skill: 0.9,
        activity: 0.8,
        demand: 0.85
      },
      repo_name: repo_id.split('/')[1] || 'repo',
      repo_full_name: repo_id
    }
  }
}

export const mockSearchAPI = {
  search: async (
    _user_id: string,
    limit?: number,
    _search_id?: string,
    signal?: AbortSignal,
    onStage?: (stage: string, data: Record<string, unknown>) => void
  ): Promise<ReposResponse> => {
    const catalog = getMockSearchCatalogRepos().map((r) => scoreRepo(r, MOCK_SEARCH_DEMO_WEIGHTS))
    const cap = limit || 10
    const reposFull = catalog.slice(0, Math.min(cap, catalog.length))
    const presetIds = new Set(MOCK_PRESET_REPOS.map((p) => p.repo_id))
    const preset = reposFull.filter((r) => presetIds.has(r.repo_id))
    const extra = reposFull.filter((r) => !presetIds.has(r.repo_id))

    const canceled = () => {
      const e = new Error('canceled') as Error & { name: string }
      e.name = 'CanceledError'
      return e
    }

    await sleep(220)
    if (signal?.aborted) throw canceled()
    onStage?.('partial_repos', { repos: preset.length > 0 ? preset : reposFull.slice(0, Math.max(1, Math.ceil(reposFull.length / 2))) })

    await sleep(320)
    if (signal?.aborted) throw canceled()
    onStage?.('partial_repos', { repos: extra.length > 0 ? extra : reposFull.slice(Math.ceil(reposFull.length / 2)) })

    await sleep(200)
    if (signal?.aborted) throw canceled()
    onStage?.('search_complete_notice', {
      total_repos: reposFull.length,
      target_count: cap,
      rounds: 2
    })

    await sleep(120)
    return {
      mode: 'online',
      source: 'mock_search',
      repos: reposFull
    }
  },
  cancel: async (_search_id: string): Promise<{ status: string }> => {
    await sleep(80)
    return { status: 'ok' }
  }
}
