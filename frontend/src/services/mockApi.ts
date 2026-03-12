// 修改 API 服务以支持切换mock/后端数据
import type { ReposResponse, ChatResponse, UserProfile, MatchResult } from '../types'

const MOCK_REPOS: ReposResponse = {
  mode: 'offline',
  repos: [
    {
      repo_id: 'test/repo1',
      name: 'repo1',
      description: 'A test repository for Python and JavaScript development',
      languages: ['Python', 'JavaScript'],
      active_score: 0.85,
      influence_score: 0.23,
      demand_score: 0.75,
      composite_score: 0.55,
      raw_metrics: {
        openrank: '2024-01-01:10,2024-01-02:15,2024-01-03:12,2024-01-04:18,2024-01-05:20',
        active_dates: '2024-01-01:23,2024-01-02:18',
        issues_new: '2024-01:12'
      }
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
      raw_metrics: {
        openrank: '2024-01-01:8,2024-01-02:12,2024-01-03:10,2024-01-04:14,2024-01-05:16',
        active_dates: '2024-01-01:20,2024-01-02:15',
        issues_new: '2024-01:15'
      }
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
      raw_metrics: {
        openrank: '2024-01-01:5,2024-01-02:7,2024-01-03:6,2024-01-04:8,2024-01-05:9',
        active_dates: '2024-01-01:15,2024-01-02:12',
        issues_new: '2024-01:20'
      }
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
      raw_metrics: {
        openrank: '2024-01-01:6,2024-01-02:9,2024-01-03:11,2024-01-04:13,2024-01-05:14',
        active_dates: '2024-01-01:25,2024-01-02:24',
        issues_new: '2024-01:25'
      }
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
      raw_metrics: {
        openrank: '2024-01-01:20,2024-01-02:22,2024-01-03:25,2024-01-04:27,2024-01-05:30',
        active_dates: '2024-01-01:8,2024-01-02:6',
        issues_new: '2024-01:5'
      }
    }
  ]
}

export const mockReposAPI = {
  get: async (params?: { mode?: string; repo_ids?: string[]; limit?: number }): Promise<ReposResponse> => {
    await new Promise(resolve => setTimeout(resolve, 500))
    return {
      ...MOCK_REPOS,
      repos: MOCK_REPOS.repos.slice(0, params?.limit || 10)
    }
  }
}

export const mockChatAPI = {
  send: async (user_id: string, message: string, session_id?: string, _agent_type: string = 'agent1', _language?: string, _onStage?: (stage: string, data: Record<string, unknown>) => void): Promise<ChatResponse> => {
    await new Promise(resolve => setTimeout(resolve, 1000))
    const lowerMessage = message.toLowerCase()
    if (lowerMessage.includes('确认') || lowerMessage.includes('确认技能')) {
      return {
        reply: '✅ 已确认！你的技能标签已保存。',
        status: 'confirmed',
        skills: ['python', 'javascript', 'react'],
        preferences: ['bug_fix', 'docs'],
        action: 'CONFIRM',
        confirmed: true,
        profile_updated: true,
        session_id: session_id || `${user_id}_agent1_${Date.now()}`
      }
    }
    if (lowerMessage.includes('搜索') || lowerMessage.includes('搜索匹配项目')) {
      return {
        reply: '🔍 正在为你搜索匹配的项目...',
        status: 'collecting',
        skills: ['python', 'javascript'],
        preferences: ['bug_fix'],
        action: 'SEARCH',
        confirmed: false,
        profile_updated: false,
        session_id: session_id || `${user_id}_agent1_${Date.now()}`
      }
    }
    return {
      reply: `我理解你说的是：${message}。请继续告诉我你的技能和偏好。`,
      status: 'collecting',
      skills: ['python'],
      preferences: [],
      action: 'NONE',
      confirmed: false,
      profile_updated: true,
      session_id: session_id || `${user_id}_agent1_${Date.now()}`
    }
  },
  greeting: async (user_id: string, language?: string, session_id?: string, _agent_type: string = 'agent1'): Promise<{ greeting: string; session_id: string; language: string }> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    return {
      greeting: language === 'english'
        ? 'Welcome to the open source contribution assistant! Please briefly introduce your tech stack, experience level, and open source interests so I can match suitable projects for you.'
        : '欢迎使用开源贡献智能向导！为便于为你匹配合适的项目，请先简单介绍一下你的技术栈、经验水平和感兴趣的开源方向。',
      session_id: session_id || `${user_id}_agent1_${Date.now()}`,
      language: language || 'chinese'
    }
  }
}

export const mockProfileAPI = {
  confirm: async (_user_id: string): Promise<{ profile: any; skills: string[] }> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    return {
      profile: {
        skills: ['python', 'javascript'],
        contribution_types: ['bug_fix', 'docs'],
        experience_level: 'intermediate'
      },
      skills: ['python', 'javascript']
    }
  },
  get: async (_user_id: string): Promise<UserProfile> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    return {
      skills: ['python', 'javascript'],
      preferences: ['bug_fix', 'docs'],
      experience: 'intermediate'
    }
  },
  sync: async (_user_id: string, _skills: string[], _preferences: string[], _language?: string): Promise<{ status: string; message: string }> => {
    await new Promise(resolve => setTimeout(resolve, 100))
    return {
      status: 'success',
      message: 'Profile synced successfully'
    }
  }
}

export const mockMatchAPI = {
  calculate: async (_user_id: string, repo_id: string, weights?: { w_skill: number; w_activity: number; w_demand: number }): Promise<MatchResult> => {
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const repo = MOCK_REPOS.repos.find(r => r.repo_id === repo_id)
    
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
  search: async (_user_id: string, limit?: number, _search_id?: string, _signal?: AbortSignal): Promise<ReposResponse> => {
    await new Promise(resolve => setTimeout(resolve, 1500))
    return {
      mode: 'online',
      repos: MOCK_REPOS.repos.slice(0, limit || 10)
    }
  },
  cancel: async (_search_id: string): Promise<{ status: string }> => {
    await new Promise(resolve => setTimeout(resolve, 100))
    return { status: 'ok' }
  }
}