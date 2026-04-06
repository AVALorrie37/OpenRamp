import React, { useEffect, useMemo, useRef, useState } from 'react'
import cloud from 'd3-cloud'
import { extractKeywords, KEYWORD_CLOUD_STOP_WORDS } from '../../utils/formatters'
import type { RepoResponse } from '../../types'

interface KeywordCloudProps {
  repos: RepoResponse[]
  selectedRepo: RepoResponse | null
  onKeywordClick: (keyword: string) => void
  activeKeywords: string[]
  skipDescriptionKeywordFallback?: boolean
  language?: 'chinese' | 'english'
}

type PlacedWord = {
  text: string
  value: number
  size: number
  x: number
  y: number
  rotate: number
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const hashStringToUint32 = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const mulberry32 = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a += 0x6D2B79F5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const fontSizeFromValue = (value: number, maxValue: number) => {
  const min = 12
  const max = 30
  const t = maxValue <= 0 ? 0 : Math.sqrt(clamp(value / maxValue, 0, 1))
  return min + t * (max - min)
}

const fillFromValue = (value: number, maxValue: number) => {
  const t = maxValue <= 0 ? 0 : clamp(value / maxValue, 0, 1)
  const accent = 18 + Math.round(t * 52)
  return `color-mix(in srgb, var(--color-text) ${100 - accent}%, var(--color-primaryDeep) ${accent}%)`
}

const useElementSize = () => {
  const ref = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const rect = el.getBoundingClientRect()
      setSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height))
      })
    }

    update()
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, ...size }
}

// frontend/src/components/Module1_MainCenter/KeywordCloud.tsx
const KeywordCloud: React.FC<KeywordCloudProps> = ({
  repos,
  selectedRepo,
  onKeywordClick,
  activeKeywords,
  skipDescriptionKeywordFallback = false,
  language = 'chinese'
}) => {
  const [viewMode, setViewMode] = useState<'all' | 'single'>(selectedRepo ? 'single' : 'all')

  useEffect(() => {
    setViewMode(selectedRepo ? 'single' : 'all')
  }, [selectedRepo?.repo_id])

  const globalKeywordCounts = useMemo(() => {
    const allKeywords: string[] = []
    repos.forEach(repo => {
      const fromBackend = repo.keywords && repo.keywords.length > 0 ? repo.keywords : []
      if (fromBackend.length > 0) {
        allKeywords.push(
          ...fromBackend.filter(k => !KEYWORD_CLOUD_STOP_WORDS.has(k.toLowerCase()))
        )
      } else if (repo.description && !skipDescriptionKeywordFallback) {
        allKeywords.push(...extractKeywords(repo.description))
      }
    })

    return allKeywords.reduce((acc, keyword) => {
      acc[keyword] = (acc[keyword] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }, [repos, skipDescriptionKeywordFallback])

  const keywordData = useMemo(() => {
    const localKeywords: string[] = []
    const sourceRepos = viewMode === 'single' && selectedRepo ? [selectedRepo] : repos
    sourceRepos.forEach(repo => {
      const fromBackend = repo.keywords && repo.keywords.length > 0 ? repo.keywords : []
      if (fromBackend.length > 0) {
        localKeywords.push(
          ...fromBackend.filter(k => !KEYWORD_CLOUD_STOP_WORDS.has(k.toLowerCase()))
        )
      } else if (repo.description && !skipDescriptionKeywordFallback) {
        localKeywords.push(...extractKeywords(repo.description))
      }
    })

    const localUnique = Array.from(new Set(localKeywords))
    const counts = viewMode === 'single' && selectedRepo
      ? Object.fromEntries(localUnique.map(w => [w, globalKeywordCounts[w] || 1]))
      : globalKeywordCounts

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([word, count]) => ({ word, count }))
  }, [repos, selectedRepo, skipDescriptionKeywordFallback, globalKeywordCounts, viewMode])

  const emptyHint =
    language === 'english'
      ? 'No keywords yet. Run a search to add more repositories.'
      : '当前没有关键词。请先搜索以添加更多仓库。'

  const maxCount = keywordData[0]?.count || 1
  const { ref: cloudRef, width: cloudWidth, height: cloudHeight } = useElementSize()
  const [placedWords, setPlacedWords] = useState<PlacedWord[]>([])
  const [hoveredWord, setHoveredWord] = useState<string | null>(null)

  useEffect(() => {
    if (!cloudWidth || !cloudHeight || keywordData.length === 0) {
      setPlacedWords([])
      return
    }

    const words = keywordData.map(({ word, count }) => ({
      text: word,
      value: count,
      size: fontSizeFromValue(count, maxCount)
    }))

    const seedBasis = viewMode === 'single' && selectedRepo
      ? `repo:${viewMode}:${selectedRepo.repo_id ?? selectedRepo.name ?? ''}`
      : `all:${keywordData.map(k => `${k.word}:${k.count}`).join('|')}`
    const rng = mulberry32(hashStringToUint32(seedBasis))

    const layout = cloud<typeof words[number]>()
      .size([cloudWidth, cloudHeight])
      .words(words)
      .padding(4)
      .rotate(() => 0)
      .font('system-ui')
      .fontSize(d => d.size)
      .spiral('archimedean')
      .random(() => rng())
      .on('end', (result: Array<typeof words[number] & { x: number; y: number; rotate: number }>) => {
        setPlacedWords(result as unknown as PlacedWord[])
      })

    layout.start()
    return () => {
      layout.stop()
    }
  }, [cloudWidth, cloudHeight, keywordData, maxCount, selectedRepo, viewMode])

  return (
    <div className="glass-content-shadow flex h-full flex-col px-3 pb-4 pt-2">
      <div className="mb-2 flex justify-end gap-2">
        {selectedRepo && (
          <button
            type="button"
            className={`rounded-t-md border border-[var(--tab-selected-border)] px-3 py-1.5 text-xs transition ${
              viewMode === 'single'
                ? 'bg-[var(--tab-selected-bg)] font-medium text-[var(--tab-selected-text)] hover:brightness-[0.99]'
                : 'bg-[var(--tab-unselected-bg)] font-medium text-[var(--tab-unselected-text)] hover:bg-[var(--tab-unselected-hover-bg)]'
            }`}
            onClick={(e) => {
              e.stopPropagation()
              setViewMode('single')
            }}
          >
            {selectedRepo.name || selectedRepo.repo_id}
          </button>
        )}
        <button
          type="button"
          className={`rounded-t-md border border-[var(--tab-selected-border)] px-3 py-1.5 text-xs transition ${
            viewMode === 'all'
              ? 'bg-[var(--tab-selected-bg)] font-medium text-[var(--tab-selected-text)] hover:brightness-[0.99]'
              : 'bg-[var(--tab-unselected-bg)] font-medium text-[var(--tab-unselected-text)] hover:bg-[var(--tab-unselected-hover-bg)]'
          }`}
          onClick={(e) => {
            e.stopPropagation()
            setViewMode('all')
          }}
        >
          {language === 'english' ? 'All Repos' : '所有仓库'}
        </button>
      </div>
      <div
        ref={cloudRef}
        className="min-h-0 flex-1 overflow-hidden"
      >
        {keywordData.length === 0 && (
          <div className="flex h-full items-center justify-center text-center text-base text-text/60">
            {emptyHint}
          </div>
        )}
        <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(1, cloudWidth)} ${Math.max(1, cloudHeight)}`}>
          <g transform={`translate(${cloudWidth / 2}, ${cloudHeight / 2})`}>
            {placedWords.map(w => {
              const isActive = activeKeywords.includes(w.text)
              const isHovered = hoveredWord === w.text
              const fill = fillFromValue(w.value, maxCount)
              const stroke = isActive
                ? 'var(--glass-frame-outer)'
                : 'color-mix(in srgb, var(--glass-frame-inner) 55%, transparent)'
              return (
                <text
                  key={w.text}
                  textAnchor="middle"
                  transform={`translate(${w.x}, ${w.y}) rotate(${w.rotate}) scale(${isHovered ? 1.06 : 1})`}
                  style={{
                    fontFamily: 'system-ui',
                    fontSize: w.size,
                    fontWeight: w.value >= maxCount * 0.5 ? 600 : 500,
                    cursor: 'pointer',
                    fill,
                    stroke,
                    strokeWidth: isActive ? 2 : 1,
                    strokeLinejoin: 'round',
                    paintOrder: 'stroke',
                    transition: 'transform 120ms ease-out',
                    filter: isActive
                      ? 'drop-shadow(0 0 0.5px rgba(146, 244, 251, 0.91)) drop-shadow(0 0 10px color-mix(in srgb, var(--glass-frame-inner) 36%, transparent)) drop-shadow(0 0 18px color-mix(in srgb, var(--glass-frame-inner) 36%, transparent))'
                      : undefined
                  }}
                  onMouseEnter={() => setHoveredWord(w.text)}
                  onMouseLeave={() => setHoveredWord(null)}
                  onClick={(e) => {
                    e.stopPropagation()
                    onKeywordClick(w.text)
                  }}
                >
                  {w.text}
                </text>
              )
            })}
          </g>
        </svg>
      </div>
    </div>
  )
}
export default KeywordCloud
