import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useUser } from './hooks/useUser'
import { useRepos } from './hooks/useRepos'
import { useAIChat } from './hooks/useAIChat'
import { searchAPI, matchAPI, manualSearchAPI, profileAPI } from './services/api'
import { storage, DEFAULT_MATCH_WEIGHTS } from './utils/storage'

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

const keywordsFingerprint = (kws: string[] | undefined): string =>
  (kws ?? []).map((k) => k.toLowerCase()).sort().join('\u0001')

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
  const { repos, reposMeta, loading: reposLoading, fetchRepos, refreshRepos, addRepo, deleteRepo, updateRepoMatchData, toggleFavorite } = useRepos(username, sessionReady)
  const uiLanguage: 'chinese' | 'english' = profile?.language || 'chinese'
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showAIChat, setShowAIChat] = useState(false)
  const [showManualSearch, setShowManualSearch] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<RepoResponse | null>(null)
  const [matchData, setMatchData] = useState<MatchResult | null>(null)
  const [weights, setWeights] = useState(DEFAULT_MATCH_WEIGHTS)
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
  const handleSearchComplete = useCallback((searchRepos: any[]) => {
    if (searchRepos && searchRepos.length > 0) {
      fetchRepos({ repo_ids: searchRepos.map((r: { repo_id: string }) => r.repo_id), limit: 10 })
      if (username) {
        localStorage.setItem(`last_search_${username}`, Date.now().toString())
      }
      setToast(uiLanguage === 'english' ? 'Search completed, check the home page' : '搜索完成，请查看主页')
    }
  }, [username, fetchRepos, uiLanguage])
  const {
    messages,
    loading: chatLoading,
    loadingStage,
    searchProgressSeconds,
    searchStage,
    sendMessage,
    triggerLocalQueryIntent,
    cancelSearch
  } = useAIChat(username, profile, isProfileModified, resetProfileModified, handleSearchComplete)

  const handleLogin = (user: string, language: 'chinese' | 'english') => {
    setSelectedRepo(null)
    setMatchData(null)
    login(user, language)
    setShowLoginModal(false)
  }

  const handleLogout = () => {
    setSelectedRepo(null)
    setMatchData(null)
    setHighlightedRepoIds([])
    setActiveKeywords([])
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
          updateRepoMatchData(repo.repo_id, {
            match_score: match.match_score,
            breakdown: match.breakdown,
            dynamic_weights: match.dynamic_weights
          })
        }
      } catch (error) {
        console.error('Match error:', error)
      }
    }
  }

  const handleManualSearchClose = async (favorited: any[]) => {
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
      favorited.forEach((repo) => {
        addRepo({
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
          addRepo({
            ...e,
            ...(local || {}),
            description: (local && local.description) || e.description,
            match_score: local?.match_score,
            breakdown: local?.breakdown,
            dynamic_weights: local?.dynamic_weights,
            is_favorited: true
          })
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
    addRepo(repo)
    try {
      const enriched = await manualSearchAPI.bulkEnrich([
        { repo_id: repo.repo_id, full_name: repo.name }
      ])
      if (enriched && enriched.repos && enriched.repos.length > 0) {
        const e = enriched.repos[0]
        addRepo({
          ...e,
          ...repo,
          description: repo.description || e.description,
          match_score: repo.match_score,
          breakdown: repo.breakdown,
          dynamic_weights: repo.dynamic_weights
        })
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
      const updated = await refreshRepos()
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

  const handleKeywordCloudRepoLabelClick = async (repo: RepoResponse) => {
    const prevFp = keywordsFingerprint(repo.keywords)
    try {
      await manualSearchAPI.bulkEnrich([{ repo_id: repo.repo_id, full_name: repo.repo_id }])
      const merged = await fetchRepos({ repo_ids: [repo.repo_id], limit: 1 })
      const next = merged?.find((r) => r.repo_id === repo.repo_id)
      if (!next) return
      const nextFp = keywordsFingerprint(next.keywords)
      const kwsChanged = prevFp !== nextFp
      if (
        kwsChanged &&
        username &&
        isLoggedIn &&
        profile?.skills &&
        profile.skills.length > 0
      ) {
        try {
          const match = await matchAPI.calculate(username, repo.repo_id, weights)
          if (typeof match.match_score === 'number') {
            updateRepoMatchData(repo.repo_id, {
              match_score: match.match_score,
              breakdown: match.breakdown,
              dynamic_weights: match.dynamic_weights
            })
          }
          setSelectedRepo((sel) => {
            if (sel?.repo_id !== repo.repo_id) return sel
            return {
              ...next,
              match_score: match.match_score,
              breakdown: match.breakdown,
              dynamic_weights: match.dynamic_weights
            }
          })
          setMatchData((md) => {
            if (!md || md.repo_full_name !== repo.repo_id) return md
            return {
              match_score: match.match_score,
              breakdown: match.breakdown,
              repo_name: next.name,
              repo_full_name: repo.repo_id,
              dynamic_weights: match.dynamic_weights
            }
          })
        } catch (err) {
          console.error('Match recalc after keywords sync failed:', err)
          setSelectedRepo((sel) => (sel?.repo_id === repo.repo_id ? next : sel))
        }
      } else {
        setSelectedRepo((sel) => (sel?.repo_id === repo.repo_id ? next : sel))
      }
    } catch (e) {
      console.error('Repo topics sync failed:', e)
    }
  }

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
              className="peer sr-only"
            />
            <span
              className={`inline-flex h-4 w-4 items-center justify-center transition-colors duration-200 ease-out peer-focus-visible:ring-2 peer-focus-visible:ring-primary/50 ${
                colorMode === 'dark' ? 'text-primary' : 'text-primary'
              }`}
            >
              {colorMode === 'dark' ? (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    d="M2,2 L22,2 L22,22 L2,22 L2,2 Z M5,13 L10,17 L19,6"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 32 32"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    fill="currentColor"
                    d="M4,4h2v2H4V4z M8,6h4V4H8V6z M14,6h4V4h-4V6z M20,6h4V4h-4V6z M26,4v2h2V4H26z M8,28h4v-2H8V28z M14,28h4v-2h-4V28z M20,28h4v-2h-4V28z M26,12h2V8h-2V12z M26,18h2v-4h-2V18z M26,24h2v-4h-2V24z M26,28h2v-2h-2V28z M4,12h2V8H4V12z M4,18h2v-4H4V18z M4,24h2v-4H4V24z M4,28h2v-2H4V28z"
                  />
                </svg>
              )}
            </span>
            {uiLanguage === 'english' ? 'Dark mode' : '深色模式'}
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

      <main className="flex flex-1 flex-col overflow-hidden">
        {(() => {
          const showResizable = isXl && !!homeColSizes

          const leftPanel = (
            <div className="flex h-full flex-col overflow-hidden rounded-md border border-border bg-surface">
              <RepoList
                repos={repos}
                onRepoClick={handleRepoClick}
                onToggleFavorite={(repo) => toggleFavorite(repo.repo_id)}
                onBackgroundClick={handleRepoBackgroundClick}
                highlightedRepoIds={highlightedRepoIds}
                selectedRepoId={selectedRepo?.repo_id ?? null}
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
                className="relative min-h-[200px] overflow-hidden rounded-md border border-border bg-surface"
                style={middleStyles.top}
              >
                <RepoActivityTabs
                  repo={selectedRepo || repos[0]}
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

                    if (isLoggedIn && username && profile?.skills && profile.skills.length > 0) {
                      try {
                        const match = await matchAPI.calculate(username, repoId, weights)
                        updateRepoMatchData(repoId, {
                          match_score: match.match_score,
                          breakdown: match.breakdown,
                          dynamic_weights: match.dynamic_weights
                        })
                        if (selectedRepo?.repo_id === repoId) {
                          setMatchData((md) => {
                            if (!md) {
                              return {
                                match_score: match.match_score,
                                breakdown: match.breakdown,
                                repo_name: selectedRepo?.name || repoId.split('/')[1] || 'repo',
                                repo_full_name: repoId,
                                dynamic_weights: match.dynamic_weights
                              }
                            }
                            return { ...md, dynamic_weights: match.dynamic_weights }
                          })
                        }
                      } catch (e) {
                        console.error('openrank refresh match failed:', e)
                      }
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
                  language={uiLanguage}
                  onKeywordClick={handleKeywordClick}
                  activeKeywords={activeKeywords}
                  skipDescriptionKeywordFallback={skipDescriptionKeywordFallback}
                  onSingleRepoLabelClick={handleKeywordCloudRepoLabelClick}
                />
              </div>
            </div>
          )

          const rightPanel = (
            <div className="relative flex h-full items-center justify-center rounded-md border border-border bg-surface">
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
                <div style={alignToThirdColStyle} className="h-full overflow-hidden">
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
        language={profile?.language || 'chinese'}
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
