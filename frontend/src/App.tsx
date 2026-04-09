import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useUser } from './hooks/useUser'
import { useUiLanguage } from './hooks/useUiLanguage'
import { useRepos } from './hooks/useRepos'
import { useAIChat } from './hooks/useAIChat'
import { searchAPI, manualSearchAPI, profileAPI, userReposAPI } from './services/api'
import { storage, DEFAULT_MATCH_WEIGHTS, clearAccountData } from './utils/storage'

import RepoList from './components/Module1_MainCenter/RepoList'
import RepoActivityTabs from './components/Module1_MainCenter/RepoActivityTabs'
import KeywordCloud from './components/Module1_MainCenter/KeywordCloud'
import RadarPlaceholder from './components/Module1_MainCenter/RadarPlaceholder'
import ManualSearchModal from './components/Module6_ManualSearch/ManualSearchModal'
import UserDropdown from './components/Module2_UserSystem/UserDropdown'
import LoginModal from './components/Module2_UserSystem/LoginModal'
import AIButton from './components/Module3_AIAssistant/AIButton'
import AIChatWindow from './components/Module3_AIAssistant/AIChatWindow'
import Toast from './components/shared/Toast'
import LoadingSpinner from './components/shared/LoadingSpinner'

import type { RepoResponse, MatchResult, UserProfile } from './types'

type HomeColSizes = { left: number; middle: number; right: number }
const HOME_COLS_STORAGE_KEY = 'openramp_home_cols_v1'
const THIRD_COL_MIN_HEIGHT_PX = 600
const THIRD_COL_MAX_HEIGHT_PX = 680
const THIRD_COL_IDEAL_VH = 70
const HOME_LEFT_MIN_WIDTH_PX = 340
const HOME_MIDDLE_MIN_WIDTH_PX = 360
const HOME_RIGHT_MIN_WIDTH_PX = 350

const App: React.FC = () => {
  const { username, sessionReady, profile, login, logout, updateProfile, isLoggedIn, isProfileModified, resetProfileModified } = useUser()
  const { repos, reposMeta, loading: reposLoading, fetchRepos, refreshRepos, addRepo, deleteRepo, toggleFavorite } = useRepos(username, sessionReady)
  const { uiLanguage, setUiLanguage } = useUiLanguage()
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showAIChat, setShowAIChat] = useState(false)
  const [showManualSearch, setShowManualSearch] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<RepoResponse | null>(null)
  const [matchData, setMatchData] = useState<MatchResult | null>(null)
  const [weights, setWeights] = useState(DEFAULT_MATCH_WEIGHTS)
  const [updatingRepoIds, setUpdatingRepoIds] = useState<string[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const prevIsLoggedInRef = useRef<boolean>(isLoggedIn)

  useEffect(() => {
    if (username) {
      const w = storage.getUserMatchWeights(username)
      setWeights(w ?? DEFAULT_MATCH_WEIGHTS)
    } else {
      setWeights(DEFAULT_MATCH_WEIGHTS)
    }
  }, [username])

  useEffect(() => {
    const prev = prevIsLoggedInRef.current
    if (prev && !isLoggedIn) {
      void refreshRepos()
    }
    prevIsLoggedInRef.current = isLoggedIn
  }, [isLoggedIn, refreshRepos])
  const [highlightedRepoIds, setHighlightedRepoIds] = useState<string[]>([])
  const [activeKeywords, setActiveKeywords] = useState<string[]>([])
  const colsContainerRef = useRef<HTMLDivElement | null>(null)
  const colDragRef = useRef<{
    dragging: boolean
    which: 'left' | 'right'
    startX: number
    start: HomeColSizes
    total: number
  } | null>(null)
  const [isXl, setIsXl] = useState(false)
  const [homeColSizes, setHomeColSizes] = useState<HomeColSizes | null>(() => {
    try {
      const raw = window.localStorage.getItem(HOME_COLS_STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<HomeColSizes> | null
      const l = typeof parsed?.left === 'number' ? parsed.left : NaN
      const m = typeof parsed?.middle === 'number' ? parsed.middle : NaN
      const r = typeof parsed?.right === 'number' ? parsed.right : NaN
      if (!Number.isFinite(l) || !Number.isFinite(m) || !Number.isFinite(r)) return null
      if (l <= 0 || m <= 0 || r <= 0) return null
      return { left: l, middle: m, right: r }
    } catch {
      return null
    }
  })
  const middleColumnRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{ dragging: boolean; startY: number; startTopHeight: number; total: number } | null>(null)
  const [middleTopHeight, setMiddleTopHeight] = useState<number | null>(null)
  const [middleSplitMode, setMiddleSplitMode] = useState<'auto' | 'manual'>('auto')
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
    const mql = window.matchMedia('(min-width: 640px)')
    const apply = () => setIsXl(!!mql.matches)
    apply()
    const onChange = () => apply()
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    }
    ;(mql as unknown as { addListener: (cb: () => void) => void }).addListener(onChange)
    return () => {
      ;(mql as unknown as { removeListener: (cb: () => void) => void }).removeListener(onChange)
    }
  }, [])

  const clampHomeCols = useCallback((sizes: HomeColSizes, available: number): HomeColSizes => {
    const minLeft = HOME_LEFT_MIN_WIDTH_PX
    const minMiddle = HOME_MIDDLE_MIN_WIDTH_PX
    const minRight = HOME_RIGHT_MIN_WIDTH_PX
    const minTotal = minLeft + minMiddle + minRight
    const a = Math.max(available, minTotal)

    let left = Math.max(minLeft, Math.round(sizes.left))
    let middle = Math.max(minMiddle, Math.round(sizes.middle))
    let right = Math.max(minRight, Math.round(sizes.right))

    let sum = left + middle + right
    if (!Number.isFinite(sum) || sum <= 0) {
      const dL = Math.round(a * 0.28)
      const dM = Math.round(a * 0.44)
      const dR = a - dL - dM
      return {
        left: Math.max(minLeft, dL),
        middle: Math.max(minMiddle, dM),
        right: Math.max(minRight, dR)
      }
    }

    if (sum !== a) {
      const scale = a / sum
      left = Math.max(minLeft, Math.round(left * scale))
      middle = Math.max(minMiddle, Math.round(middle * scale))
      right = Math.max(minRight, a - left - middle)
      sum = left + middle + right
      if (sum !== a) {
        middle = Math.max(minMiddle, middle + (a - sum))
      }
    }

    const finalSum = left + middle + right
    if (finalSum > a) {
      const extra = finalSum - a
      const shrinkRight = Math.min(extra, right - minRight)
      right -= shrinkRight
      const shrinkMiddle = Math.min(extra - shrinkRight, middle - minMiddle)
      middle -= shrinkMiddle
      const shrinkLeft = Math.min(extra - shrinkRight - shrinkMiddle, left - minLeft)
      left -= shrinkLeft
    } else if (finalSum < a) {
      middle += a - finalSum
    }

    return { left, middle, right }
  }, [])

  useEffect(() => {
    if (!isXl) return
    const el = colsContainerRef.current
    if (!el) return
    const handleW = 8
    const totalHandle = handleW * 2
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      const available = Math.max(0, Math.floor(rect.width - totalHandle))
      setHomeColSizes((prev) => {
        const base = prev ?? { left: available * 0.28, middle: available * 0.44, right: available * 0.28 }
        const next = clampHomeCols(base, available)
        try {
          window.localStorage.setItem(HOME_COLS_STORAGE_KEY, JSON.stringify(next))
        } catch {
        }
        return next
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [clampHomeCols, isXl])

  useEffect(() => {
    const el = middleColumnRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      const total = rect.height
      if (!Number.isFinite(total) || total <= 0) return
      setMiddleTopHeight((prev) => {
        const minTop = 200
        const minBottom = 200
        const maxTop = Math.max(minTop, total - minBottom)
        if (middleSplitMode === 'auto') {
          const desired = Math.round(total * 0.4)
          return Math.min(Math.max(desired, minTop), maxTop)
        }
        if (typeof prev !== 'number' || !Number.isFinite(prev)) {
          const desired = Math.round(total * 0.4)
          return Math.min(Math.max(desired, minTop), maxTop)
        }
        return Math.min(Math.max(prev, minTop), maxTop)
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [middleSplitMode])

  useLayoutEffect(() => {
    if (middleSplitMode !== 'auto') return
    if (typeof middleTopHeight === 'number' && Number.isFinite(middleTopHeight)) return
    const el = middleColumnRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const total = rect.height
    if (!Number.isFinite(total) || total <= 0) return
    const minTop = 200
    const minBottom = 200
    const maxTop = Math.max(minTop, total - minBottom)
    const desired = Math.round(total * 0.4)
    setMiddleTopHeight(Math.min(Math.max(desired, minTop), maxTop))
  }, [middleSplitMode, middleTopHeight])

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

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const ds = colDragRef.current
      if (!ds?.dragging) return
      const handleW = 8
      const available = Math.max(0, Math.floor(ds.total - handleW * 2))

      const minMiddle = HOME_MIDDLE_MIN_WIDTH_PX
      const minRight = HOME_RIGHT_MIN_WIDTH_PX
      const safeMinLeft = HOME_LEFT_MIN_WIDTH_PX

      const dx = e.clientX - ds.startX
      if (ds.which === 'left') {
        const minDelta = safeMinLeft - ds.start.left
        const maxDelta = ds.start.middle - minMiddle
        const delta = Math.min(Math.max(dx, minDelta), maxDelta)
        const next: HomeColSizes = {
          left: ds.start.left + delta,
          middle: ds.start.middle - delta,
          right: ds.start.right
        }
        const clamped = clampHomeCols(next, available)
        setHomeColSizes(clamped)
        try {
          window.localStorage.setItem(HOME_COLS_STORAGE_KEY, JSON.stringify(clamped))
        } catch {
        }
      } else {
        const minDelta = minMiddle - ds.start.middle
        const maxDelta = ds.start.right - minRight
        const delta = Math.min(Math.max(dx, minDelta), maxDelta)
        const next: HomeColSizes = {
          left: ds.start.left,
          middle: ds.start.middle + delta,
          right: ds.start.right - delta
        }
        const clamped = clampHomeCols(next, available)
        setHomeColSizes(clamped)
        try {
          window.localStorage.setItem(HOME_COLS_STORAGE_KEY, JSON.stringify(clamped))
        } catch {
        }
      }
    }
    const onUp = () => {
      const ds = colDragRef.current
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
  }, [clampHomeCols])

  const middleStyles = useMemo(() => {
    if (typeof middleTopHeight !== 'number') {
      return { top: undefined as unknown as React.CSSProperties, bottom: undefined as unknown as React.CSSProperties }
    }
    return {
      top: { height: `${Math.round(middleTopHeight)}px` } as React.CSSProperties,
      bottom: { height: `calc(100% - ${Math.round(middleTopHeight)}px - 10px)` } as React.CSSProperties
    }
  }, [middleTopHeight])

  const freezeRepoSnapshot = useCallback((repo: any) => {
    const now = Date.now()
    const w = weights
    return {
      ...repo,
      score_frozen: true,
      score_version: 'v1',
      scored_at: now,
      score_context: { weights: { w_skill: w.w_skill, w_activity: w.w_activity, w_demand: w.w_demand } }
    }
  }, [weights])

  const handleSearchComplete = useCallback((searchRepos: any[]) => {
    if (searchRepos && searchRepos.length > 0) {
      if (username) {
        void Promise.all(
          searchRepos.map(async (r: any) => {
            try {
              await userReposAPI.upsert(username, freezeRepoSnapshot(r))
            } catch {}
          })
        ).then(() => refreshRepos())
      } else {
        fetchRepos({ repo_ids: searchRepos.map((r: { repo_id: string }) => r.repo_id), limit: 10 })
      }
      if (username) {
        localStorage.setItem(`last_search_${username}`, Date.now().toString())
      }
      setToast(uiLanguage === 'english' ? 'Search completed, check the home page' : '搜索完成，请查看主页')
    }
  }, [username, fetchRepos, uiLanguage, refreshRepos, freezeRepoSnapshot])
  const {
    messages,
    loading: chatLoading,
    loadingStage,
    searchProgressSeconds,
    searchStage,
    sendMessage,
    triggerLocalQueryIntent,
    cancelSearch,
    confirmCollectProfileDraft
  } = useAIChat(username, profile, isProfileModified, resetProfileModified, handleSearchComplete, uiLanguage, updateProfile)

  const handleLogin = (user: string) => {
    setSelectedRepo(null)
    setMatchData(null)
    login(user)
    setShowLoginModal(false)
  }

  const handleLogout = () => {
    setSelectedRepo(null)
    setMatchData(null)
    setHighlightedRepoIds([])
    setActiveKeywords([])
    logout()
  }

  const handleDeleteAccount = () => {
    setSelectedRepo(null)
    setMatchData(null)
    setHighlightedRepoIds([])
    setActiveKeywords([])
    if (username) clearAccountData(username)
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
      setToast(uiLanguage === 'english' ? 'Search completed, check the home page' : '搜索完成，请查看主页')
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
    if (selectedRepo?.repo_id && selectedRepo.repo_id === repo.repo_id) {
      setSelectedRepo(null)
      setMatchData(null)
      setHighlightedRepoIds([])
      setActiveKeywords([])
      return
    }

    setSelectedRepo(repo)
    setHighlightedRepoIds([])
    setActiveKeywords([])

    if (isLoggedIn && username && profile?.skills && profile.skills.length > 0) {
      try {
        setUpdatingRepoIds((prev) => (prev.includes(repo.repo_id) ? prev : [...prev, repo.repo_id]))
        const res = await userReposAPI.applyWeights(username, weights, 1, 0, repo.repo_id)
        if (Array.isArray(res?.repos)) {
          void refreshRepos()
          const updated = (res.repos as any[]).find((r) => r.repo_id === repo.repo_id)
          if (updated?.breakdown && typeof updated.match_score === 'number') {
            addRepo(updated as any)
            setMatchData({
              match_score: updated.match_score,
              breakdown: updated.breakdown,
              repo_name: updated.name || repo.name,
              repo_full_name: updated.repo_id,
              dynamic_weights: updated.dynamic_weights
            })
            return
          }
        }
      } catch {
        // fall through
      } finally {
        setUpdatingRepoIds((prev) => prev.filter((id) => id !== repo.repo_id))
      }
    }

    const bd = (repo as any).breakdown
    if (
      typeof (repo as any).match_score === 'number' &&
      typeof bd?.skill === 'number' &&
      typeof bd?.activity === 'number' &&
      typeof bd?.demand === 'number'
    ) {
      setMatchData({
        match_score: (repo as any).match_score,
        breakdown: bd,
        repo_name: repo.name,
        repo_full_name: repo.repo_id,
        dynamic_weights: (repo as any).dynamic_weights
      })
    } else {
      setMatchData(null)
    }
  }

  const handleManualSearchClose = async (favorited: any[]) => {
    setShowManualSearch(false)
    if (!favorited || favorited.length === 0) {
      return
    }
    try {
      favorited.forEach((repo) => {
        const snap = freezeRepoSnapshot({
          repo_id: repo.repo_id,
          name: repo.full_name || repo.repo_id,
          description: repo.description || '',
          languages: repo.languages || [],
          active_score: repo.active_score || 0,
          influence_score: repo.influence_score || 0,
          demand_score: repo.demand_score || 0,
          composite_score: repo.composite_score || 0,
          match_score: repo.match_score,
          breakdown: repo.breakdown,
          dynamic_weights: repo.dynamic_weights,
          keywords: repo.keywords || [],
          is_favorited: true
        } as any)
        addRepo(snap as any)
        if (username) {
          void userReposAPI.upsert(username, snap).catch(() => {})
        }
      })
      const enriched = await manualSearchAPI.bulkEnrich(
        favorited.map((r) => ({
          repo_id: r.repo_id,
          full_name: r.full_name
        }))
      )
      if (enriched && enriched.repos && enriched.repos.length > 0) {
        enriched.repos.forEach((e: any) => {
          const local = favorited.find((f) => f.repo_id === e.repo_id)
          const snap = freezeRepoSnapshot({
            ...e,
            ...(local || {}),
            description: (local && local.description) || e.description,
            match_score: local?.match_score,
            breakdown: local?.breakdown,
            dynamic_weights: local?.dynamic_weights,
            is_favorited: true
          })
          addRepo(snap as any)
          if (username) {
            void userReposAPI.upsert(username, snap).catch(() => {})
          }
        })
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
    const snap0 = freezeRepoSnapshot({ ...repo, is_favorited: true })
    addRepo(snap0 as any)
    void userReposAPI.upsert(username, snap0).catch(() => {})
    try {
      const enriched = await manualSearchAPI.bulkEnrich([
        { repo_id: repo.repo_id, full_name: repo.name }
      ])
      if (enriched && enriched.repos && enriched.repos.length > 0) {
        const e = enriched.repos[0]
        const snap = freezeRepoSnapshot({
          ...e,
          ...repo,
          description: repo.description || e.description,
          match_score: repo.match_score,
          breakdown: repo.breakdown,
          dynamic_weights: repo.dynamic_weights,
          is_favorited: true
        })
        addRepo(snap as any)
        void userReposAPI.upsert(username, snap).catch(() => {})
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
    if (partial.language !== undefined) {
      setUiLanguage(partial.language)
    }
    updateProfile(partial)
    const merged = { ...profile, ...partial }
    const skills = merged.skills ?? profile.skills ?? []
    const prefs = merged.preferences ?? profile.preferences ?? []
    const langForSync = merged.language ?? uiLanguage
    const shouldSync =
      skills.length > 0 ||
      prefs.length > 0 ||
      (partial.language !== undefined && partial.language !== profile.language)
    if (shouldSync) {
      try {
        await profileAPI.sync(username, skills, prefs, langForSync)
        refreshRepos()
        resetProfileModified()
      } catch (e) {
        console.error('Profile sync failed:', e)
        setToast(uiLanguage === 'english' ? 'Profile sync failed, please retry' : '个人信息同步失败，请重试')
      }
    }
  }

  const handleSendMessage = async (message: string, opts?: { skipIntent?: boolean }) => {
    const response = await sendMessage(message, opts)
    if (response) {
      await handleAIChatResponse(response)
    }
    return response
  }

  const handleAskAIAboutSelection = (selected: string) => {
    const t = selected.trim()
    if (!t) return
    if (!isLoggedIn) {
      setShowLoginModal(true)
      return
    }
    setShowAIChat(true)
    const prompt =
      uiLanguage === 'english'
        ? `In open-source / technical context, explain this concept clearly: 「${t}」`
        : `请结合开源仓库/技术语境，解释以下概念：「${t}」`
    void handleSendMessage(prompt, { skipIntent: true })
  }

  const handleWeightsChange = async (next: { w_skill: number; w_activity: number; w_demand: number }) => {
    setWeights(next)
    if (username) {
      storage.saveUserMatchWeights(username, next)
    }
    if (!username || !isLoggedIn || !profile?.skills || profile.skills.length === 0) {
      return
    }
    try {
      const repoIdsAtStart = repos.map((r) => r.repo_id)
      setUpdatingRepoIds(repoIdsAtStart)
      const MAX_BUDGET = 50
      const maxIters = Math.max(1, Math.ceil(repoIdsAtStart.length / MAX_BUDGET) + 2)
      let lastRes: any = null
      for (let i = 0; i < maxIters; i += 1) {
        const res = await userReposAPI.applyWeights(
          username,
          next,
          MAX_BUDGET,
          0,
          selectedRepo?.repo_id ?? undefined
        )
        lastRes = res
        const refreshed = Array.isArray(res?.refreshed) ? (res.refreshed as string[]) : []
        if (Array.isArray(res?.repos)) {
          for (const r of res.repos as RepoResponse[]) {
            addRepo(r)
          }
        }
        if (refreshed.length === 0) break
        if (refreshed.length >= repoIdsAtStart.length) break
      }

      const updated = Array.isArray(lastRes?.repos) ? (lastRes.repos as RepoResponse[]) : await refreshRepos()
      // Ensure left list reflects server-side resort.
      void refreshRepos()
      const sel = selectedRepo
      if (updated && sel) {
        const r = updated.find((x) => x.repo_id === sel.repo_id)
        if (r && typeof r.match_score === 'number') {
          setMatchData({
            match_score: r.match_score,
            breakdown: r.breakdown ?? { skill: 0, activity: 0, demand: 0 },
            repo_name: r.name,
            repo_full_name: r.repo_id,
            dynamic_weights: r.dynamic_weights
          })
        }
      }
    } catch (error) {
      console.error('Match error:', error)
    } finally {
      setUpdatingRepoIds([])
    }
  }

  const handleKeywordClick = (keyword: string) => {
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
    setHighlightedRepoIds([])
    setActiveKeywords([])
  }

  const skipDescriptionKeywordFallback =
    typeof navigator !== 'undefined' &&
    navigator.onLine &&
    !!reposMeta.source &&
    String(reposMeta.source).startsWith('online')

  const alignToThirdColStyle = useMemo(() => {
    if (!isXl) return undefined
    return {
      height: '100%',
      minHeight: `clamp(${THIRD_COL_MIN_HEIGHT_PX}px, ${THIRD_COL_IDEAL_VH}vh, ${THIRD_COL_MAX_HEIGHT_PX}px)`
    } as React.CSSProperties
  }, [isXl])

  const handleRepoBackgroundClick = () => {
    setSelectedRepo(null)
    setHighlightedRepoIds([])
    setActiveKeywords([])
  }

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
        <h1 className="m-0 text-xl font-bold text-primary">
          OpenRamp
        </h1>
        <div className="flex items-center gap-4">
          <label className="flex cursor-pointer select-none items-center gap-2 rounded-full border border-border bg-surface2 px-4 py-1.5 text-base text-text shadow-[inset_0_2px_4px_rgba(0,0,0,0.12),inset_0_-1px_0_rgba(255,255,255,0.6)] transition-[transform,box-shadow,background-color] duration-150 ease-out hover:bg-surface2/80 active:translate-y-[1px] active:scale-[0.98] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.18),inset_0_-1px_0_rgba(255,255,255,0.55)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.45),0_1px_0_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.05)] dark:active:shadow-[0_1px_5px_rgba(0,0,0,0.55),0_1px_0_rgba(255,255,255,0.05),inset_0_2px_4px_rgba(0,0,0,0.28),inset_0_-1px_0_rgba(255,255,255,0.06)]">
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
              className="peer sr-only"
            />
            <span
              className="inline-flex h-5 w-5 items-center justify-center text-text transition-colors duration-200 ease-out peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50"
            >
              {colorMode === 'dark' ? (
                <svg className="h-5 w-5 translate-y-[2px]" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path
                    d="M21 13.2A8.2 8.2 0 0 1 10.8 3a7.2 7.2 0 1 0 10.2 10.2Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <circle
                    cx="12"
                    cy="12"
                    r="4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </span>
            {uiLanguage === 'english' ? (colorMode === 'dark' ? 'Dark mode' : 'Light mode') : (colorMode === 'dark' ? '深色模式' : '浅色模式')}
          </label>
          <UserDropdown
            username={username}
            profile={profile}
            onUpdate={handleProfileUpdateFromPanel}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
            onLogin={() => setShowLoginModal(true)}
            uiLanguage={uiLanguage}
            setUiLanguage={setUiLanguage}
          />
        </div>
      </header>

      <main className="flex flex-1 flex-col overflow-hidden">
        {(() => {
          const showResizable = isXl && !!homeColSizes

          const leftPanel = (
            <div className="glass-card glass-card--large glass-card--outer-depth flex h-full flex-col overflow-hidden">
              <RepoList
                repos={repos}
                onRepoClick={handleRepoClick}
                onToggleFavorite={(repo) => toggleFavorite(repo.repo_id)}
                onBackgroundClick={handleRepoBackgroundClick}
                highlightedRepoIds={highlightedRepoIds}
                selectedRepoId={selectedRepo?.repo_id ?? null}
                updatingRepoIds={updatingRepoIds}
                canUseMatchSort={isLoggedIn && !!profile?.skills && profile.skills.length > 0}
                openRepoHintTitle={
                  uiLanguage === 'english'
                    ? 'Ctrl+click to open this repository on GitHub'
                    : '按住 Ctrl 并点击，在浏览器中查看 GitHub 仓库'
                }
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
                onAskAIAboutText={handleAskAIAboutSelection}
                selectionAskLanguage={uiLanguage}
                language={uiLanguage}
              />
            </div>
          )

          const middlePanel = (
            <div ref={middleColumnRef} className="flex h-full flex-col">
              <div
                className="glass-card glass-card--large relative min-h-[200px] overflow-visible"
                style={middleStyles.top}
              >
                <RepoActivityTabs
                  repo={selectedRepo}
                  themeVersion={themeVersion}
                  language={uiLanguage}
                  onOpenRankRefresh={async (repoId) => {
                    try {
                      const enriched = await manualSearchAPI.bulkEnrich([
                        { repo_id: repoId, full_name: repoId }
                      ])
                      const updated = enriched?.repos?.[0] as any
                      if (updated && updated.repo_id) {
                        addRepo({ ...updated, is_favorited: (selectedRepo?.is_favorited ?? false) } as any)
                        if (selectedRepo?.repo_id === repoId) {
                          setSelectedRepo((prev) => (prev && prev.repo_id === repoId ? { ...prev, ...updated } : prev))
                        }
                      }
                    } catch (e) {
                      console.error('openrank refresh enrich failed:', e)
                    }

                    if (selectedRepo?.repo_id === repoId) {
                      setMatchData((md) => {
                        if (!md) return md
                        return { ...md }
                      })
                    }
                  }}
                />
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
                  setMiddleSplitMode('manual')
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
                className="glass-card glass-card--large relative min-h-[200px] overflow-visible"
                style={middleStyles.bottom}
                onClick={handleKeywordAreaClick}
              >
                <KeywordCloud
                  repos={repos}
                  selectedRepo={selectedRepo}
                  language={uiLanguage}
                  onKeywordClick={handleKeywordClick}
                  activeKeywords={activeKeywords}
                  skipDescriptionKeywordFallback={skipDescriptionKeywordFallback}
                />
              </div>
            </div>
          )

          const rightPanel = (
            <div className="glass-card glass-card--large glass-card--outer-depth relative flex h-full items-center justify-center">
              <RadarPlaceholder
                isActive={isLoggedIn && !!profile?.skills && profile.skills.length > 0}
                matchData={matchData}
                baseWeights={weights}
                onBaseWeightsChange={handleWeightsChange}
                themeVersion={themeVersion}
                language={uiLanguage}
              />
            </div>
          )

          if (!showResizable) {
            return (
              <div ref={colsContainerRef} className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 md:grid-cols-2 xl:grid-cols-3">
                <div style={alignToThirdColStyle} className="h-full overflow-hidden">
                  {leftPanel}
                </div>
                <div style={alignToThirdColStyle} className="h-full overflow-visible">
                  {middlePanel}
                </div>
                <div style={alignToThirdColStyle} className="h-full">
                  {rightPanel}
                </div>
              </div>
            )
          }

          return (
            <div
              ref={colsContainerRef}
              className="grid flex-1 items-stretch overflow-hidden p-4"
              style={{
                gridTemplateColumns: `${homeColSizes.left}px 8px ${homeColSizes.middle}px 8px ${homeColSizes.right}px`
              }}
            >
              <div className="pr-2.5" style={alignToThirdColStyle}>
                {leftPanel}
              </div>

              <div
                className="group relative w-[8px] cursor-col-resize select-none"
                onPointerDown={(e) => {
                  const el = colsContainerRef.current
                  if (!el || !homeColSizes) return
                  const rect = el.getBoundingClientRect()
                  colDragRef.current = {
                    dragging: true,
                    which: 'left',
                    startX: e.clientX,
                    start: homeColSizes,
                    total: rect.width
                  }
                  ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
                }}
                aria-label="Resize left and middle columns"
                role="separator"
                aria-orientation="vertical"
              >
                <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-border transition group-hover:bg-primary" />
                <div className="absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/70 transition group-hover:bg-primary/70" />
              </div>

              <div className="px-2.5" style={alignToThirdColStyle}>
                {middlePanel}
              </div>

              <div
                className="group relative w-[8px] cursor-col-resize select-none"
                onPointerDown={(e) => {
                  const el = colsContainerRef.current
                  if (!el || !homeColSizes) return
                  const rect = el.getBoundingClientRect()
                  colDragRef.current = {
                    dragging: true,
                    which: 'right',
                    startX: e.clientX,
                    start: homeColSizes,
                    total: rect.width
                  }
                  ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
                }}
                aria-label="Resize middle and right columns"
                role="separator"
                aria-orientation="vertical"
              >
                <div className="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-border transition group-hover:bg-primary" />
                <div className="absolute left-1/2 top-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border/70 transition group-hover:bg-primary/70" />
              </div>

              <div className="pl-2.5">
                <div style={alignToThirdColStyle} className="h-full">
                  {rightPanel}
                </div>
              </div>
            </div>
          )
        })()}
      </main>

      <div className="overflow-hidden whitespace-nowrap border-t border-border bg-primaryLight/25 px-5 py-2 text-center text-sm text-text">
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
        uiLanguage={uiLanguage}
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
        onQueryCurrentProfile={triggerLocalQueryIntent}
        onCancelSearch={cancelSearch}
        onAskAIAboutText={handleAskAIAboutSelection}
        onConfirmCollectProfile={(idx, draft) => {
          void confirmCollectProfileDraft(idx, draft)
        }}
        language={uiLanguage}
        username={username}
        onFavorite={handleChatFavorite}
        onUnfavorite={handleChatUnfavorite}
      />

      <ManualSearchModal
        isOpen={showManualSearch}
        username={username}
        skills={profile?.skills || []}
        onClose={handleManualSearchClose}
      />

      <AnimatePresence>
        {toast && (
          <Toast
            message={toast}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>

      {reposLoading && (
        <div className="fixed left-1/2 top-1/2 z-[10000] -translate-x-1/2 -translate-y-1/2">
          <LoadingSpinner />
        </div>
      )}
    </div>
  )
}

export default App
