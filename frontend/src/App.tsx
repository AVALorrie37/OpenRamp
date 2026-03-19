import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useUser } from './hooks/useUser'
import { useRepos } from './hooks/useRepos'
import { useAIChat } from './hooks/useAIChat'
import { useDebugLogs } from './hooks/useDebugLogs'
import { searchAPI, matchAPI, manualSearchAPI, profileAPI } from './services/api'
import { storage } from './utils/storage'

import RepoList from './components/Module1_MainCenter/RepoList'
import RepoActivityTabs from './components/Module1_MainCenter/RepoActivityTabs'
import KeywordCloud from './components/Module1_MainCenter/KeywordCloud'
import RadarPlaceholder from './components/Module1_MainCenter/RadarPlaceholder'
import ManualSearchModal from './components/Module6_ManualSearch/ManualSearchModal'
import UserDropdown from './components/Module2_UserSystem/UserDropdown'
import LoginModal from './components/Module2_UserSystem/LoginModal'
import AIButton from './components/Module3_AIAssistant/AIButton'
import AIChatWindow from './components/Module3_AIAssistant/AIChatWindow'
import DebugLogWindow from './components/Module4_DebugWindow/DebugLogWindow'
import Toast from './components/shared/Toast'
import LoadingSpinner from './components/shared/LoadingSpinner'

import type { RepoResponse, MatchResult, UserProfile } from './types'

const App: React.FC = () => {
  const { username, profile, login, logout, updateProfile, isLoggedIn, isProfileModified, resetProfileModified } = useUser()
  const { repos, loading: reposLoading, fetchRepos, refreshRepos, addRepo, deleteRepo, updateRepoMatchScore } = useRepos(username)
  const uiLanguage: 'chinese' | 'english' = profile?.language || 'chinese'
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showAIChat, setShowAIChat] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [showManualSearch, setShowManualSearch] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<RepoResponse | null>(null)
  const [matchData, setMatchData] = useState<MatchResult | null>(null)
  const [weights, setWeights] = useState({ w_skill: 0.5, w_activity: 0.3, w_demand: 0.2 })
  const [toast, setToast] = useState<string | null>(null)
  const [highlightedRepoIds, setHighlightedRepoIds] = useState<string[]>([])
  const [activeKeywords, setActiveKeywords] = useState<string[]>([])
  const { logs, clearLogs } = useDebugLogs(showDebug)

  const middleColumnRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{ dragging: boolean; startY: number; startTopHeight: number; total: number } | null>(null)
  const [middleTopHeight, setMiddleTopHeight] = useState<number | null>(null)
  const [colorMode, setColorMode] = useState<'light' | 'dark'>(() => {
    try {
      const v = window.localStorage.getItem('openramp_color_mode')
      return v === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })
  const [themeVersion, setThemeVersion] = useState(0)

  useEffect(() => {
    const root = document.documentElement
    if (colorMode === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }, [])

  useEffect(() => {
    const el = middleColumnRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      const total = rect.height
      if (!Number.isFinite(total) || total <= 0) return
      setMiddleTopHeight((prev) => {
        if (typeof prev !== 'number' || !Number.isFinite(prev)) {
          return Math.max(200, Math.round(total * 0.4))
        }
        const minTop = 200
        const minBottom = 200
        const maxTop = Math.max(minTop, total - minBottom)
        return Math.min(Math.max(prev, minTop), maxTop)
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const ds = dragStateRef.current
      if (!ds?.dragging) return
      const next = ds.startTopHeight + (e.clientY - ds.startY)
      const minTop = 200
      const minBottom = 200
      const maxTop = Math.max(minTop, ds.total - minBottom)
      setMiddleTopHeight(Math.min(Math.max(next, minTop), maxTop))
    }
    const onUp = () => {
      const ds = dragStateRef.current
      if (ds) {
        ds.dragging = false
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  const middleStyles = useMemo(() => {
    if (typeof middleTopHeight !== 'number') {
      return { top: undefined as unknown as React.CSSProperties, bottom: undefined as unknown as React.CSSProperties }
    }
    return {
      top: { height: `${Math.round(middleTopHeight)}px` } as React.CSSProperties,
      bottom: { height: `calc(100% - ${Math.round(middleTopHeight)}px - 10px)` } as React.CSSProperties
    }
  }, [middleTopHeight])
  const handleSearchComplete = useCallback((searchRepos: any[]) => {
    if (searchRepos && searchRepos.length > 0) {
      fetchRepos({ repo_ids: searchRepos.map((r: { repo_id: string }) => r.repo_id), limit: 10 })
      if (username) {
        localStorage.setItem(`last_search_${username}`, Date.now().toString())
      }
      setToast(uiLanguage === 'english' ? 'Search completed, check the home page' : '搜索完成，请查看主页')
    }
  }, [username, fetchRepos, uiLanguage])
  const { messages, loading: chatLoading, loadingStage, searchProgressSeconds, searchStage, sendMessage, cancelSearch } = useAIChat(username, profile, isProfileModified, resetProfileModified, handleSearchComplete)

  const handleLogin = (user: string, language: 'chinese' | 'english') => {
    setSelectedRepo(null)
    setMatchData(null)
    login(user, language)
    setShowLoginModal(false)
  }

  const handleLogout = () => {
    setSelectedRepo(null)
    setMatchData(null)
    logout()
  }

  const handleAIChatResponse = async (response: any) => {
    if (response?.profile_updated && (response.skills !== undefined || response.preferences !== undefined)) {
      let formattedSkills = response.skills || [];
      if (Array.isArray(formattedSkills)) {
        formattedSkills = formattedSkills.map(skill => {
          if (typeof skill === 'string') {
            return skill.trim().replace(/^\[|\]$/g, '');
          }
          return skill;
        });
      } else if (typeof formattedSkills === 'string') {
        try {
          const parsed = JSON.parse(formattedSkills);
          formattedSkills = Array.isArray(parsed) ? parsed : [formattedSkills];
        } catch {
          formattedSkills = formattedSkills.split(/[,，\[\]]/)
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
        }
      }
      updateProfile({
        skills: formattedSkills,
        preferences: response.preferences || []
      });
      setToast(uiLanguage === 'english' ? 'Skills updated' : '技能标签已更新');
      resetProfileModified();
      if (username) {
        await refreshRepos();
      }
    }

    if (response?.action === 'SEARCH') {
      await handleSearch()
      setToast('搜索完成，请查看主页')
    }
  }

  const handleSearch = async () => {
    if (!isLoggedIn) {
      setToast(uiLanguage === 'english'
        ? 'Cannot auto-search: please log in first.'
        : '无法自动搜索：请先登录。')
      return
    }
    if (!username) {
      setToast(uiLanguage === 'english'
        ? 'Cannot auto-search: missing username.'
        : '无法自动搜索：缺少用户名。')
      return
    }
    if (!profile?.skills || profile.skills.length === 0) {
      setToast(uiLanguage === 'english'
        ? 'Cannot auto-search: please add at least one skill tag.'
        : '无法自动搜索：请先添加至少一个技能标签。')
      return
    }
    const lastSearch = localStorage.getItem(`last_search_${username}`)
    if (lastSearch) {
      setToast(uiLanguage === 'english'
        ? 'Cannot auto-search: search has already been run for this user.'
        : '无法自动搜索：该用户已执行过自动搜索。')
      return
    }
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
    setHighlightedRepoIds([])
    setActiveKeywords([])

    if (isLoggedIn && profile?.skills && profile.skills.length > 0) {
      try {
        if (isProfileModified && isProfileModified() && username && profile) {
          try {
            await profileAPI.sync(
              username,
              profile.skills || [],
              profile.preferences || [],
              profile.language
            )
            resetProfileModified()
            await refreshRepos()
          } catch (error) {
            console.error('Profile sync before match failed:', error)
          }
        }
        const match = await matchAPI.calculate(username!, repo.repo_id, weights)
        setMatchData({
          match_score: match.match_score,
          breakdown: match.breakdown,
          repo_name: repo.name,
          repo_full_name: repo.repo_id,
          dynamic_weights: match.dynamic_weights
        })
        if (typeof match.match_score === 'number') {
          updateRepoMatchScore(repo.repo_id, match.match_score)
        }
      } catch (error) {
        console.error('Match error:', error)
      }
    }
  }

  const handleManualSearchClose = async (favorited: { repo_id: string; full_name: string }[]) => {
    setShowManualSearch(false)
    if (!favorited || favorited.length === 0) {
      return
    }
    try {
      if (username) {
        const existingFavorites = storage.getUserFavorites(username) || []
        const existingIds = new Set(existingFavorites.map((r: any) => r.repo_id))
        const mergedFavorites = [
          ...existingFavorites,
          ...favorited.filter((r) => r.repo_id && !existingIds.has(r.repo_id))
        ]
        storage.saveUserFavorites(username, mergedFavorites)
      }
      const enriched = await manualSearchAPI.bulkEnrich(
        favorited.map((r) => ({
          repo_id: r.repo_id,
          full_name: r.full_name
        }))
      )
      if (enriched && enriched.repos && enriched.repos.length > 0) {
        fetchRepos({ repo_ids: enriched.repos.map(r => r.repo_id), limit: 20 })
        const hasZeroScores = enriched.repos.some((r: any) =>
          (r.active_score === 0 || r.active_score === 0.0) &&
          (r.influence_score === 0 || r.influence_score === 0.0) &&
          (r.demand_score === 0 || r.demand_score === 0.0)
        )
        if (hasZeroScores) {
          setToast(uiLanguage === 'english'
            ? 'Added favorites, some repos have no OpenDigger data (scores are 0).'
            : '已将收藏项目加入列表，其中部分仓库暂无 OpenDigger 数据（评分为 0）。'
          )
        } else {
          setToast(uiLanguage === 'english' ? 'Added favorites to list' : '已将收藏项目加入列表，信息补全中')
        }
      }
    } catch (error) {
      console.error('bulk_enrich error:', error)
    }
  }

  const handleChatFavorite = async (repo: any) => {
    if (!username) return
    addRepo(repo)
    try {
      const enriched = await manualSearchAPI.bulkEnrich([
        { repo_id: repo.repo_id, full_name: repo.name }
      ])
      if (enriched && enriched.repos && enriched.repos.length > 0) {
        const e = enriched.repos[0]
        addRepo({ ...repo, ...e, description: repo.description || e.description })
      }
    } catch (error) {
      console.error('chat favorite enrich error:', error)
    }
  }

  const handleChatUnfavorite = (repoId: string) => {
    if (!username) return
    deleteRepo(repoId)
  }

  const handleProfileUpdateFromPanel = async (partial: Partial<UserProfile>) => {
    if (!username || !profile) return
    updateProfile(partial)
    const merged = { ...profile, ...partial }
    const skills = merged.skills ?? profile.skills ?? []
    const prefs = merged.preferences ?? profile.preferences ?? []
    if (skills.length > 0 || prefs.length > 0) {
      try {
        await profileAPI.sync(username, skills, prefs, merged.language ?? profile.language)
        refreshRepos()
        resetProfileModified()
      } catch (e) {
        console.error('Profile sync failed:', e)
        setToast(uiLanguage === 'english' ? 'Profile sync failed, please retry' : '个人信息同步失败，请重试')
      }
    }
  }

  const handleSendMessage = async (message: string) => {
    const response = await sendMessage(message)
    if (response) {
      await handleAIChatResponse(response)
    }
    return response
  }


  const handleWeightsChange = async (next: { w_skill: number; w_activity: number; w_demand: number }) => {
    setWeights(next)
    if (username && selectedRepo && isLoggedIn && profile?.skills && profile.skills.length > 0) {
      try {
        const match = await matchAPI.calculate(username, selectedRepo.repo_id, next)
        setMatchData({
          match_score: match.match_score,
          breakdown: match.breakdown,
          repo_name: selectedRepo.name,
          repo_full_name: selectedRepo.repo_id,
          dynamic_weights: match.dynamic_weights
        })
        if (typeof match.match_score === 'number') {
          updateRepoMatchScore(selectedRepo.repo_id, match.match_score)
        }
      } catch (error) {
        console.error('Match error:', error)
      }
    }
  }

  const handleKeywordClick = (keyword: string) => {
    setSelectedRepo(null)
    setActiveKeywords(prev => {
      const exists = prev.includes(keyword)
      const next = exists ? prev.filter(k => k !== keyword) : [...prev, keyword]
      const lowered = new Set(next.map(k => k.toLowerCase()))
      const matchedIds = repos
        .filter(r => {
          const repoKeywords = (r.keywords && r.keywords.length > 0 ? r.keywords : [])
            .map(k => k.toLowerCase())
          if (repoKeywords.length > 0) {
            return repoKeywords.some(k => lowered.has(k))
          }
          const descWords = (r.description || '').toLowerCase().split(/\W+/)
          return descWords.some(w => lowered.has(w))
        })
        .map(r => r.repo_id)
      setHighlightedRepoIds(matchedIds)
      return next
    })
  }

  const handleKeywordAreaClick = () => {
    setSelectedRepo(null)
    setHighlightedRepoIds([])
    setActiveKeywords([])
  }

  const handleRepoBackgroundClick = () => {
    setSelectedRepo(null)
    setHighlightedRepoIds([])
    setActiveKeywords([])
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-4">
        <h1 className="m-0 text-xl font-bold text-primary">
          OpenRamp
        </h1>
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-base text-text">
            <input
              type="checkbox"
              checked={colorMode === 'dark'}
              onChange={(e) => {
                const next = e.target.checked ? 'dark' : 'light'
                const root = document.documentElement
                if (next === 'dark') {
                  root.classList.add('dark')
                } else {
                  root.classList.remove('dark')
                }
                try {
                  window.localStorage.setItem('openramp_color_mode', next)
                } catch {
                }
                setColorMode(next)
                setThemeVersion((v) => v + 1)
              }}
              className="cursor-pointer"
            />
            {uiLanguage === 'english' ? 'Dark mode' : '深色模式'}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-base text-text">
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
              className="cursor-pointer"
            />
            {uiLanguage === 'english' ? 'View terminal' : '查看终端'}
          </label>
          <UserDropdown
            username={username}
            profile={profile}
            onUpdate={handleProfileUpdateFromPanel}
            onLogout={handleLogout}
            onLogin={() => setShowLoginModal(true)}
          />
        </div>
      </header>

      <main className={`flex flex-1 flex-col overflow-hidden ${showDebug ? 'pb-[300px]' : ''}`}>
        <div className="grid flex-1 grid-cols-1 gap-5 overflow-hidden p-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col overflow-hidden rounded-md border border-border bg-surface">
            <RepoList
              repos={repos}
              onRepoClick={handleRepoClick}
              onBackgroundClick={handleRepoBackgroundClick}
              highlightedRepoIds={highlightedRepoIds}
              canUseMatchSort={isLoggedIn && !!profile?.skills && profile.skills.length > 0}
              onOpenManualSearch={() => setShowManualSearch(true)}
              onDeleteRepo={(repoId) => {
                deleteRepo(repoId)
                if (selectedRepo && selectedRepo.repo_id === repoId) {
                  setSelectedRepo(null)
                  setMatchData(null)
                }
                setHighlightedRepoIds((prev) => prev.filter((id) => id !== repoId))
              }}
              onDescriptionRefresh={async (repo) => {
                try {
                  const enriched = await manualSearchAPI.bulkEnrich([
                    { repo_id: repo.repo_id, full_name: repo.repo_id }
                  ])
                  if (enriched && enriched.repos && enriched.repos.length > 0) {
                    const updated = enriched.repos[0]
                    fetchRepos({ repo_ids: [updated.repo_id], limit: 1 })
                  }
                } catch (e) {
                  console.error('Description refresh failed:', e)
                }
              }}
            />
          </div>

          <div ref={middleColumnRef} className="flex h-full flex-col">
            <div
              className="relative min-h-[200px] overflow-hidden rounded-md border border-border bg-surface"
              style={middleStyles.top}
            >
              <RepoActivityTabs repo={selectedRepo || repos[0]} themeVersion={themeVersion} />
            </div>
            <div
              className="group relative h-[10px] cursor-row-resize select-none"
              onPointerDown={(e) => {
                const el = middleColumnRef.current
                if (!el) return
                const rect = el.getBoundingClientRect()
                const total = rect.height
                const currentTop = typeof middleTopHeight === 'number' ? middleTopHeight : Math.max(200, Math.round(total * 0.4))
                dragStateRef.current = { dragging: true, startY: e.clientY, startTopHeight: currentTop, total }
                ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
              }}
              aria-label="Resize middle panels"
              role="separator"
              aria-orientation="horizontal"
            >
              <div className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-border transition group-hover:bg-primary" />
              <div className="absolute left-1/2 top-1/2 h-1.5 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/70 transition group-hover:bg-primary/70" />
            </div>
            <div
              className="relative min-h-[200px] overflow-hidden rounded-md border border-border bg-surface"
              style={middleStyles.bottom}
              onClick={handleKeywordAreaClick}
            >
              <KeywordCloud
                repos={repos}
                selectedRepo={selectedRepo}
                onKeywordClick={handleKeywordClick}
                activeKeywords={activeKeywords}
              />
            </div>
          </div>

          <div className="relative flex items-center justify-center rounded-md border border-border bg-surface">
            <RadarPlaceholder
              isActive={isLoggedIn && !!profile?.skills && profile.skills.length > 0} 
              matchData={matchData}
              baseWeights={weights}
              onBaseWeightsChange={handleWeightsChange}
              themeVersion={themeVersion}
            />
          </div>
          </div>
      </main>

      <div className="overflow-hidden whitespace-nowrap border-t border-border bg-primaryLight/25 px-5 py-3 text-center text-sm text-text">
        <div className="inline-block animate-[scroll_20s_linear_infinite]">
          {uiLanguage === 'english'
            ? 'Tip: Log in to get personalized recommendations | Click a repo to view match details | Chat with the AI assistant to confirm your skills'
            : '提示：登录获取个性化推荐 | 点击仓库查看匹配详情 | 与AI助手对话确认技能'}
        </div>
        <style>{`
          @keyframes scroll {
            0% { transform: translateX(100%); }
            100% { transform: translateX(-100%); }
          }
        `}</style>
      </div>

      <AIButton language={uiLanguage} onClick={() => {
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
        loadingStage={loadingStage}
        searchProgressSeconds={searchProgressSeconds}
        searchStage={searchStage}
        onSendMessage={handleSendMessage}
        onCancelSearch={cancelSearch}
        language={profile?.language || 'chinese'}
        username={username}
        onFavorite={handleChatFavorite}
        onUnfavorite={handleChatUnfavorite}
      />

      <DebugLogWindow
        isOpen={showDebug}
        logs={logs}
        onClear={clearLogs}
      />

      <ManualSearchModal
        isOpen={showManualSearch}
        username={username}
        skills={profile?.skills || []}
        onClose={handleManualSearchClose}
      />

      {toast && (
        <Toast
          message={toast}
          onClose={() => setToast(null)}
        />
      )}

      {reposLoading && (
        <div className="fixed left-1/2 top-1/2 z-[10000] -translate-x-1/2 -translate-y-1/2">
          <LoadingSpinner />
        </div>
      )}
    </div>
  )
}

export default App
