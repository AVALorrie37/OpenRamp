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
      influence_score: 0.92,
      demand_score: 0.75,
      composite_score: 0.84,
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
      influence_score: 0.75,
      demand_score: 0.88,
      composite_score: 0.77,
      raw_metrics: {
        openrank: '2024-01-01:5,2024-01-02:7,2024-01-03:6,2024-01-04:8,2024-01-05:9',
        active_dates: '2024-01-01:15,2024-01-02:12',
        issues_new: '2024-01:20'
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
  send: async (user_id: string, message: string, session_id?: string): Promise<ChatResponse> => {
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const lowerMessage = message.toLowerCase()
    
    if (lowerMessage.includes('确认') || lowerMessage.includes('确认技能')) {
      return {
        reply: '✅ 已确认！你的技能标签已保存。',
        status: 'confirmed',
        skills: ['python', 'javascript', 'react'],
        preferences: ['bug_fix', 'docs'],
        action: 'CONFIRM',
        confirmed: true
      }
    }
    
    if (lowerMessage.includes('搜索') || lowerMessage.includes('搜索匹配项目')) {
      return {
        reply: '🔍 正在为你搜索匹配的项目...',
        status: 'collecting',
        skills: ['python', 'javascript'],
        preferences: ['bug_fix'],
        action: 'SEARCH',
        confirmed: false
      }
    }
    
    return {
      reply: `我理解你说的是：${message}。请继续告诉我你的技能和偏好。`,
      status: 'collecting',
      skills: ['python'],
      preferences: [],
      action: 'NONE',
      confirmed: false
    }
  }
}

export const mockProfileAPI = {
  confirm: async (user_id: string): Promise<{ profile: any; skills: string[] }> => {
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
  get: async (user_id: string): Promise<UserProfile> => {
    await new Promise(resolve => setTimeout(resolve, 300))
    return {
      skills: ['python', 'javascript'],
      preferences: ['bug_fix', 'docs'],
      experience: 'intermediate'
    }
  }
}

export const mockMatchAPI = {
  calculate: async (user_id: string, repo_id: string): Promise<MatchResult> => {
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const repo = MOCK_REPOS.repos.find(r => r.repo_id === repo_id)
    
    if (repo) {
      return {
        match_score: repo.composite_score,
        breakdown: {
          skill: repo.influence_score,
          activity: repo.active_score,
          demand: repo.demand_score
        },
        repo_name: repo.name,
        repo_full_name: repo.repo_id
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
  search: async (user_id: string, limit?: number): Promise<ReposResponse> => {
    await new Promise(resolve => setTimeout(resolve, 1500))
    return {
      mode: 'online',
      repos: MOCK_REPOS.repos.slice(0, limit || 10)
    }
  }
}