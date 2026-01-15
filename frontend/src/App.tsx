import React, { useState, useEffect } from 'react'
import { useUser } from './hooks/useUser'
import { useRepos } from './hooks/useRepos'
import { useAIChat } from './hooks/useAIChat'
import { useDebugLogs } from './hooks/useDebugLogs'
import { searchAPI, matchAPI, profileAPI } from './services/api'
import { theme } from './styles/theme'

import TechStackCloud from './components/Module1_MainCenter/TechStackCloud'
import RepoList from './components/Module1_MainCenter/RepoList'
import OpenRankChart from './components/Module1_MainCenter/OpenRankChart'
import KeywordCloud from './components/Module1_MainCenter/KeywordCloud'
import RadarPlaceholder from './components/Module1_MainCenter/RadarPlaceholder'
import UserDropdown from './components/Module2_UserSystem/UserDropdown'
import LoginModal from './components/Module2_UserSystem/LoginModal'
import AIButton from './components/Module3_AIAssistant/AIButton'
import AIChatWindow from './components/Module3_AIAssistant/AIChatWindow'
import DebugLogWindow from './components/Module4_DebugWindow/DebugLogWindow'
import Toast from './components/shared/Toast'
import LoadingSpinner from './components/shared/LoadingSpinner'

import type { RepoResponse, MatchResult } from './types'

const App: React.FC = () => {
  const { username, profile, login, logout, updateProfile, isLoggedIn } = useUser()
  const { repos, loading: reposLoading, fetchRepos } = useRepos()
  const { messages, loading: chatLoading, sendMessage } = useAIChat(username)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showAIChat, setShowAIChat] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<RepoResponse | null>(null)
  const [matchData, setMatchData] = useState<MatchResult | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const { logs, clearLogs } = useDebugLogs(showDebug)

  useEffect(() => {
    if (isLoggedIn && profile?.skills && profile.skills.length > 0) {
      const lastSearch = localStorage.getItem(`last_search_${username}`)
      if (!lastSearch) {
        handleSearch()
      }
    }
  }, [isLoggedIn, profile])

  const handleLogin = (user: string) => {
    login(user)
    setShowLoginModal(false)
  }

  const handleAIChatResponse = async (response: any) => {
    if (response?.confirmed && response?.profile) {
      updateProfile({
        skills: response.skills || [],
        preferences: response.preferences || []
      })
      setToast('技能标签已更新')
    }

    if (response?.action === 'SEARCH') {
      await handleSearch()
      setToast('搜索完成，请查看主页')
    }
  }

  const handleSearch = async () => {
    if (!username) return
    try {
      const result = await searchAPI.search(username, 10)
      fetchRepos({ repo_ids: result.repos.map(r => r.repo_id), limit: 10 })
      localStorage.setItem(`last_search_${username}`, Date.now().toString())
    } catch (error) {
      console.error('Search error:', error)
    }
  }

  const handleRepoClick = async (repo: RepoResponse) => {
    setSelectedRepo(repo)
    if (isLoggedIn && profile?.skills && profile.skills.length > 0) {
      try {
        const match = await matchAPI.calculate(username!, repo.repo_id)
        setMatchData({
          match_score: match.match_score,
          breakdown: match.breakdown,
          repo_name: repo.name,
          repo_full_name: repo.repo_id
        })
      } catch (error) {
        console.error('Match error:', error)
      }
    }
  }

  const handleTagClick = (lang: string) => {
    fetchRepos({ limit: 10 })
  }

  const handleSendMessage = async (message: string) => {
    const response = await sendMessage(message)
    if (response) {
      await handleAIChatResponse(response)
    }
    return response
  }

  const allLanguages = repos.flatMap(r => r.languages || [])

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: theme.background
    }}>
      <header style={{
        padding: '16px 24px',
        backgroundColor: theme.white,
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '20px',
          color: theme.primary,
          fontWeight: 700
        }}>
          OpenRamp
        </h1>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            color: theme.text
          }}>
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            查看终端
          </label>
          <UserDropdown
            username={username}
            profile={profile}
            onUpdate={updateProfile}
            onLogout={logout}
            onLogin={() => setShowLoginModal(true)}  // 传递登录回调
          />
        </div>
      </header>

      <main style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        padding: showDebug ? '0 0 300px 0' : '0'
      }}>
        <div style={{
          padding: '20px',
          borderBottom: `1px solid ${theme.border}`
        }}>
          <TechStackCloud languages={allLanguages} onTagClick={handleTagClick} />
        </div>

        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '20px',
          padding: '20px',
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: theme.white,
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden'
          }}>
            <RepoList repos={repos} onRepoClick={handleRepoClick} />
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            height: '100%'
          }}>
            <div style={{
              backgroundColor: theme.white,
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              minHeight: '200px',
              flex:1,
              position: 'relative'
            }}>
              <OpenRankChart repo={selectedRepo || repos[0]} />
            </div>
            <div style={{
              backgroundColor: theme.white,
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              minHeight: '200px',
              flex:1,
              position: 'relative'
            }}>
              <KeywordCloud repos={repos} />
            </div>
          </div>

          <div style={{
            backgroundColor: theme.white,
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}>
            <RadarPlaceholder 
              isActive={isLoggedIn && !!profile?.skills && profile.skills.length > 0} 
              matchData={matchData}
            />
          </div>
        </div>

        <div style={{
          padding: '12px 20px',
          backgroundColor: theme.primaryLight + '40',
          borderTop: `1px solid ${theme.border}`,
          fontSize: '13px',
          color: theme.text,
          textAlign: 'center',
          overflow: 'hidden',
          whiteSpace: 'nowrap'
        }}>
          <div style={{
            display: 'inline-block',
            animation: 'scroll 20s linear infinite'
          }}>
            提示：登录获取个性化推荐 | 点击仓库查看匹配详情 | 与AI助手对话确认技能
          </div>
          <style>{`
            @keyframes scroll {
              0% { transform: translateX(100%); }
              100% { transform: translateX(-100%); }
            }
          `}</style>
        </div>
      </main>

      <AIButton onClick={() => {
        if (!isLoggedIn) {
          setShowLoginModal(true)
        } else {
          setShowAIChat(true)
        }
      }} />

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLogin}
      />

      <AIChatWindow
        isOpen={showAIChat}
        onClose={() => setShowAIChat(false)}
        messages={messages}
        loading={chatLoading}
        onSendMessage={handleSendMessage}
      />

      <DebugLogWindow
        isOpen={showDebug}
        logs={logs}
        onClear={clearLogs}
      />

      {toast && (
        <Toast
          message={toast}
          onClose={() => setToast(null)}
        />
      )}

      {reposLoading && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10000
        }}>
          <LoadingSpinner />
        </div>
      )}
    </div>
  )
}

export default App
