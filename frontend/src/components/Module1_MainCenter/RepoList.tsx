import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { RepoResponse } from '../../types'
import { Search, Star } from 'lucide-react'

interface RepoListProps {
  repos: RepoResponse[]
  onRepoClick: (repo: RepoResponse) => void
  onToggleFavorite?: (repo: RepoResponse) => void
  onOpenManualSearch?: () => void
  highlightedRepoIds?: string[]
  onBackgroundClick?: () => void
  canUseMatchSort?: boolean
  onDeleteRepo?: (repoId: string) => void
  onDescriptionRefresh?: (repo: RepoResponse) => void
  openRepoHintTitle?: string
  onAskAIAboutText?: (text: string) => void
  selectionAskLanguage?: 'chinese' | 'english'
}

type SortType = 'match' | 'active' | 'friendly'

const REPO_ID_FOR_URL = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

const RepoList: React.FC<RepoListProps> = ({
  repos,
  onRepoClick,
  onToggleFavorite,
  onOpenManualSearch,
  highlightedRepoIds,
  onBackgroundClick,
  canUseMatchSort,
  onDeleteRepo,
  onDescriptionRefresh,
  openRepoHintTitle = '按住 Ctrl 并点击在浏览器中打开 GitHub 仓库页面',
  onAskAIAboutText,
  selectionAskLanguage = 'chinese'
}) => {
  const [sortType, setSortType] = useState<SortType>('match')
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [askAiBubble, setAskAiBubble] = useState<{ text: string; top: number; left: number } | null>(null)

  const syncSelectionBubble = useCallback(() => {
    if (!onAskAIAboutText) {
      setAskAiBubble(null)
      return
    }
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setAskAiBubble(null)
      return
    }
    const text = sel.toString().trim()
    if (text.length < 2) {
      setAskAiBubble(null)
      return
    }
    const range = sel.getRangeAt(0)
    const descRoot = (node: Node | null): Element | null => {
      const el =
        node?.nodeType === Node.TEXT_NODE ? (node as Text).parentElement : (node as Element | null)
      return el?.closest('[data-repo-description]') ?? null
    }
    const a = descRoot(sel.anchorNode)
    const f = descRoot(sel.focusNode)
    if (!a || a !== f || !a.contains(range.commonAncestorContainer)) {
      setAskAiBubble(null)
      return
    }
    const rect = range.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      setAskAiBubble(null)
      return
    }
    setAskAiBubble({ text, top: rect.top, left: rect.right })
  }, [onAskAIAboutText])

  useEffect(() => {
    if (!onAskAIAboutText) return
    let t: number
    const onSel = () => {
      window.clearTimeout(t)
      t = window.setTimeout(syncSelectionBubble, 20)
    }
    document.addEventListener('selectionchange', onSel)
    document.addEventListener('mouseup', onSel)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('selectionchange', onSel)
      document.removeEventListener('mouseup', onSel)
    }
  }, [onAskAIAboutText, syncSelectionBubble])

  useEffect(() => {
    if (!onAskAIAboutText) return
    const onScroll = () => setAskAiBubble(null)
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [onAskAIAboutText])

  const hasMatchScore = repos.some(r => typeof r.match_score === 'number')
  const canUseMatch = !!canUseMatchSort && hasMatchScore

  useEffect(() => {
    if (!canUseMatch && sortType === 'match') {
      setSortType('active')
    }
  }, [canUseMatch, sortType])

  const compareMatchThenActive = (a: RepoResponse, b: RepoResponse) => {
    const ma = typeof a.match_score === 'number' ? a.match_score : -1
    const mb = typeof b.match_score === 'number' ? b.match_score : -1
    if (mb !== ma) return mb - ma
    return b.active_score - a.active_score
  }

  const sortedRepos = [...repos].sort((a, b) => {
    if (sortType === 'match') {
      if (!canUseMatch) {
        return b.active_score - a.active_score
      }
      return compareMatchThenActive(a, b)
    } else if (sortType === 'active') {
      return b.active_score - a.active_score
    } else {
      if (!canUseMatch) {
        return b.active_score - a.active_score
      }
      return compareMatchThenActive(a, b)
    }
  })

  const askAiLabel = selectionAskLanguage === 'english' ? 'Ask AI?' : '问问AI？'

  return (
    <div className="flex h-full flex-col">
      {askAiBubble &&
        onAskAIAboutText &&
        createPortal(
          <button
            type="button"
            className="pointer-events-auto rounded-md border border-primary bg-surface px-2 py-1 text-xs font-medium text-primary shadow-md transition hover:bg-primary/10"
            style={{
              position: 'fixed',
              top: Math.max(8, askAiBubble.top - 30),
              left: askAiBubble.left + 4,
              zIndex: 999
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const t = askAiBubble.text
              setAskAiBubble(null)
              window.getSelection()?.removeAllRanges()
              onAskAIAboutText(t)
            }}
          >
            {askAiLabel}
          </button>,
          document.body
        )}
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="flex gap-2">
          {canUseMatch && (
            <button
              onClick={() => setSortType('match')}
              className={`rounded-md border border-primary px-3 py-1.5 text-xs transition ${
                sortType === 'match' ? 'bg-primary text-white' : 'bg-background text-text hover:bg-primary/10'
              }`}
            >
              匹配总分
            </button>
          )}
          <button
            onClick={() => setSortType('active')}
            className={`rounded-md border border-primary px-3 py-1.5 text-xs transition ${
              sortType === 'active' ? 'bg-primary text-white' : 'bg-background text-text hover:bg-primary/10'
            }`}
          >
            活跃度
          </button>
          <button
            onClick={() => setSortType('friendly')}
            className={`rounded-md border border-primary px-3 py-1.5 text-xs transition ${
              sortType === 'friendly' ? 'bg-primary text-white' : 'bg-background text-text hover:bg-primary/10'
            }`}
          >
            新手友好度
          </button>
        </div>
        {onOpenManualSearch && (
          <button
            onClick={onOpenManualSearch}
            className="ml-auto flex items-center gap-1 rounded-full border border-primary bg-surface px-2.5 py-1.5 text-xs text-primary transition hover:bg-primary/10"
            aria-label="Search"
          >
            <Search size={16} />
          </button>
        )}
      </div>
      <div
        className="flex-1 overflow-y-auto p-3 pb-8"
        onClick={onBackgroundClick}
      >
        {sortedRepos.map((repo: RepoResponse) => {
          const isHighlighted = highlightedRepoIds?.includes(repo.repo_id)
          return (
          <div
            key={repo.repo_id}
            onClickCapture={(e) => {
              if (deleteTargetId !== repo.repo_id || !onDeleteRepo) return
              const raw = e.target
              const el = raw instanceof Element ? raw : (raw as Node).parentElement
              if (el?.closest('[data-delete-confirm]')) return
              setDeleteTargetId(null)
            }}
            onClick={(e) => {
              e.stopPropagation()
              onRepoClick(repo)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setDeleteTargetId(repo.repo_id)
            }}
            className={`mb-3 cursor-pointer rounded-md border-2 bg-surface p-4 transition hover:border-primary hover:shadow-panel ${
              isHighlighted ? 'border-primary ring-2 ring-primaryLight/60' : 'border-border'
            }`}
          >
            <div className="mb-2 flex items-start justify-between">
              <h3 className="m-0 text-lg font-semibold text-text">
                <span
                  title={openRepoHintTitle}
                  role="link"
                  tabIndex={0}
                  className="cursor-pointer rounded-sm hover:underline focus:outline-none focus:ring-2 focus:ring-primary/50"
                  onClick={(e) => {
                    if (!e.ctrlKey) return
                    e.stopPropagation()
                    e.preventDefault()
                    const rid = repo.repo_id
                    if (rid && REPO_ID_FOR_URL.test(rid)) {
                      window.open(`https://github.com/${rid}`, '_blank', 'noopener,noreferrer')
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    if (!e.ctrlKey) return
                    e.stopPropagation()
                    e.preventDefault()
                    const rid = repo.repo_id
                    if (rid && REPO_ID_FOR_URL.test(rid)) {
                      window.open(`https://github.com/${rid}`, '_blank', 'noopener,noreferrer')
                    }
                  }}
                >
                  {repo.name}
                </span>
              </h3>
              <div className="flex gap-2">
                {canUseMatchSort && typeof repo.match_score === 'number' && (
                  <span className="rounded px-2 py-1 text-xs font-medium text-white bg-primary">
                    匹配{Math.round(repo.match_score * 100)}%
                  </span>
                )}
                <span className="rounded bg-primaryLight px-2 py-1 text-xs font-medium text-text">
                  活跃度{Math.round(repo.active_score * 100)}%
                </span>
                {canUseMatchSort && typeof repo.match_score === 'number' && repo.match_score > 0.7 && (
                  <span className="rounded bg-accent px-2 py-1 text-xs font-medium text-white">
                    新手友好
                  </span>
                )}
                {onToggleFavorite && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleFavorite(repo)
                    }}
                    className="inline-flex items-center justify-center rounded-full bg-transparent p-1 text-base text-border transition hover:text-accent"
                    aria-label={repo.is_favorited ? '取消收藏' : '收藏'}
                  >
                    <Star size={16} fill={repo.is_favorited ? 'currentColor' : 'none'} />
                  </button>
                )}
              </div>
            </div>
            <div className="relative mt-2 min-h-[2.75rem]">
              <p
                data-repo-description
                className={`text-sm leading-5 text-text/70 transition-[filter] duration-200 ${
                  deleteTargetId === repo.repo_id && onDeleteRepo ? 'blur-sm pointer-events-none select-none' : ''
                } ${
                  !repo.description ? 'cursor-pointer underline decoration-dotted' : ''
                }`}
                onClick={(e) => {
                  if (!repo.description && onDescriptionRefresh) {
                    e.stopPropagation()
                    onDescriptionRefresh(repo)
                  }
                }}
              >
                {repo.description && repo.description.includes('暂无 OpenDigger 数据（使用 GitHub 指标兜底）')
                  ? 'No description'
                  : (repo.description || 'No description')}
              </p>
              {deleteTargetId === repo.repo_id && onDeleteRepo && (
                <div
                  className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-md bg-black/20 px-3 py-2 text-xs text-text dark:bg-white/20"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteTargetId(null)
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setDeleteTargetId(null)
                  }}
                >
                  <button
                    type="button"
                    data-delete-confirm
                    className="inline-flex items-center justify-center rounded border border-error bg-error px-3 py-1.5 text-center text-xs leading-tight text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteRepo(repo.repo_id)
                      setDeleteTargetId(null)
                    }}
                  >
                    删除这个仓库？
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded border border-border bg-surface px-2 py-1.5 text-xs text-text"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTargetId(null)
                    }}
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          </div>
        )})}
      </div>
    </div>
  )
}

export default RepoList