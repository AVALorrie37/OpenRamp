import React, {
  useState,
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useId,
  useCallback,
  type FC
} from 'react'
import {
  Radar,
  RadarChart,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Customized
} from 'recharts'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { cssVar } from '../../utils/cssVars'
import Modal from '../shared/Modal'

type Weights = { w_skill: number; w_activity: number; w_demand: number }
type WeightKey = keyof Weights

const defaultBase: Weights = {
  w_skill: 0.5,
  w_activity: 0.3,
  w_demand: 0.2
}

function normalizeWeights(w: Weights): Weights {
  const sum = w.w_skill + w.w_activity + w.w_demand
  if (sum <= 0) {
    return { w_skill: 1 / 3, w_activity: 1 / 3, w_demand: 1 / 3 }
  }
  return {
    w_skill: w.w_skill / sum,
    w_activity: w.w_activity / sum,
    w_demand: w.w_demand / sum
  }
}

function applyCDataToWeights(base: Weights, cData: number): Weights {
  const w = normalizeWeights(base)
  const c = Number.isFinite(cData) ? Math.max(0, cData) : 1
  const w2Prime = w.w_activity * c
  const remain = 1 - w2Prime
  const denom = w.w_skill + w.w_demand
  if (denom <= 0) {
    const u = remain / 2
    return normalizeWeights({
      w_skill: u,
      w_activity: w2Prime,
      w_demand: u
    })
  }
  return normalizeWeights({
    w_skill: remain * (w.w_skill / denom),
    w_activity: w2Prime,
    w_demand: remain * (w.w_demand / denom)
  })
}

function parseRadarGeom(p: Record<string, unknown>): { cx: number; cy: number; r: number } | null {
  const offset = p.offset as
    | { left: number; top: number; width: number; height: number }
    | undefined
  let cx = typeof p.cx === 'number' ? p.cx : NaN
  let cy = typeof p.cy === 'number' ? p.cy : NaN
  let r =
    typeof p.outerRadius === 'number' && Number.isFinite(p.outerRadius) ? p.outerRadius : NaN
  if (offset && offset.width > 0 && offset.height > 0) {
    if (!Number.isFinite(cx)) cx = offset.left + offset.width / 2
    if (!Number.isFinite(cy)) cy = offset.top + offset.height * 0.53
    if (!Number.isFinite(r) || r <= 0) {
      r = (Math.min(offset.width, offset.height) / 2) * 0.9
    }
  }
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || r <= 0) return null
  return { cx, cy, r }
}

function clampInt(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)))
}

const WEIGHT_KEYS: { key: WeightKey; label: string }[] = [
  { key: 'w_skill', label: 'w_skill' },
  { key: 'w_activity', label: 'w_activity' },
  { key: 'w_demand', label: 'w_demand' }
]

function roundThenNormalize(w: Weights): Weights {
  const rounded = {
    w_skill: Math.round(w.w_skill * 10) / 10,
    w_activity: Math.round(w.w_activity * 10) / 10,
    w_demand: Math.round(w.w_demand * 10) / 10
  }
  const sum = rounded.w_skill + rounded.w_activity + rounded.w_demand
  if (sum <= 0) return defaultBase
  return {
    w_skill: rounded.w_skill / sum,
    w_activity: rounded.w_activity / sum,
    w_demand: rounded.w_demand / sum
  }
}

interface MatchRadarChartProps {
  isOpen: boolean
  onClose: () => void
  matchData: {
    skill: number
    activity: number
    demand: number
    repoName: string
    matchScore: number
  } | null
  embedded?: boolean
  baseWeights?: Weights
  dynamicWeights?: {
    w_skill: number
    w_activity: number
    w_demand: number
    c_data: number
  }
  onBaseWeightsChange?: (next: Weights) => void
  repoId?: string
  themeVersion?: number
  language?: 'chinese' | 'english'
}

const MatchRadarChart: FC<MatchRadarChartProps> = ({
  isOpen,
  onClose,
  matchData,
  embedded = false,
  baseWeights,
  dynamicWeights,
  onBaseWeightsChange,
  repoId,
  themeVersion: _themeVersion = 0,
  language = 'chinese'
}) => {
  const [localWeights, setLocalWeights] = useState<Weights>(baseWeights || defaultBase)
  const [editingKey, setEditingKey] = useState<WeightKey | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const valueInputRef = useRef<HTMLInputElement>(null)
  const radarEnvelopeFillId = useId().replace(/:/g, '')
  const radarCenterGlowId = useId().replace(/:/g, '')
  const radarMatchFillId = useId().replace(/:/g, '')
  const radarMatchGlowFilterId = useId().replace(/:/g, '')

  const primary = cssVar('--color-primary') || '#829c83'
  const primaryDeep = cssVar('--color-primaryDeep') || '#3daecd'
  const radarRingColor = cssVar('--color-radarRing') || 'rgba(62, 140, 132, 0.72)'
  const radarGlowRadius = cssVar('--radar-glow-radius') || '36%'
  const radarGlowColor = cssVar('--color-radarGlow') || primary
  const radarGlowCenterOp = parseFloat(cssVar('--radar-glow-center-opacity') || '0.24')
  const radarGlowMidOp = parseFloat(cssVar('--radar-glow-mid-opacity') || '0.12')
  const radarGlowEdgeOp = parseFloat(cssVar('--radar-glow-edge-opacity') || '0')
  const radarGlowMidOffset = cssVar('--radar-glow-mid-offset') || '55%'
  const radarRingOpacity = parseFloat(cssVar('--radar-ring-opacity') || '0.36')
  const radarRingWidth = parseFloat(cssVar('--radar-ring-width') || '0.55')
  const radarRingCount = clampInt(
    parseInt(cssVar('--radar-ring-count') || '5', 10) || 5,
    3,
    8
  )
  const matchGlowBlur = parseFloat(cssVar('--radar-match-glow-blur') || '3')
  const matchGlowFloodOp = parseFloat(cssVar('--radar-match-glow-flood-opacity') || '0.45')
  const matchFillTopOp = parseFloat(cssVar('--radar-match-fill-top-opacity') || '0.55')
  const matchFillBottomOp = parseFloat(cssVar('--radar-match-fill-bottom-opacity') || '0.18')
  const envelopeStrokeOp = parseFloat(cssVar('--radar-envelope-stroke-opacity') || '0.45')
  const radarTickTextShadow =
    cssVar('--radar-tick-text-shadow') || '0 0 12px rgba(102,233,221,0.4)'
  const textMain = cssVar('--color-text') || '#dbe7ff'
  const textSubtle = `${textMain}99`
  const borderSoft = cssVar('--color-border') || 'rgba(120, 154, 197, 0.24)'
  const surface = cssVar('--color-surface') || '#0b1b36'

  useEffect(() => {
    setLocalWeights(baseWeights || defaultBase)
    setEditingKey(null)
  }, [baseWeights?.w_skill, baseWeights?.w_activity, baseWeights?.w_demand, repoId])

  useLayoutEffect(() => {
    if (editingKey) valueInputRef.current?.focus()
  }, [editingKey])

  const labels = useMemo(
    () =>
      language === 'english'
        ? {
            skillMatch: 'Skill',
            projectActivity: 'Activity',
            communityDemand: 'Demand',
            overallMatch: 'Overall Match',
            matchDegree: 'Match',
            weightAdjust: 'Weights',
            applyAll: 'Apply to All',
            tooltipRaw: 'Raw',
            tooltipWeight: 'w′'
          }
        : {
            skillMatch: '技能',
            projectActivity: '活跃',
            communityDemand: '需求',
            overallMatch: '匹配总分',
            matchDegree: '匹配度',
            weightAdjust: '权重',
            applyAll: '应用到所有仓库',
            tooltipRaw: '原始',
            tooltipWeight: '权重 w′'
          },
    [language]
  )

  const normalizedBase = useMemo(() => normalizeWeights(localWeights), [localWeights])

  const cData = dynamicWeights?.c_data

  const normalizedPreview = useMemo(() => {
    if (cData == null) return normalizedBase
    return applyCDataToWeights(normalizedBase, cData)
  }, [normalizedBase, cData])

  const previewMatchScore = useMemo(() => {
    if (!matchData) return 0
    return (
      normalizedPreview.w_skill * matchData.skill +
      normalizedPreview.w_activity * matchData.activity +
      normalizedPreview.w_demand * matchData.demand
    )
  }, [normalizedPreview, matchData])

  const axisWeightScale = useMemo(() => {
    const w = normalizedPreview
    const maxW = Math.max(w.w_skill, w.w_activity, w.w_demand, 1e-9)
    return {
      maxW,
      skill: w.w_skill / maxW,
      activity: w.w_activity / maxW,
      demand: w.w_demand / maxW
    }
  }, [normalizedPreview])

  const data = useMemo(() => {
    if (!matchData) return []
    const { skill: ks, activity: ka, demand: kd } = axisWeightScale
    return [
      {
        subject: labels.skillMatch,
        value: 100 * matchData.skill * ks,
        envelope: 100 * ks,
        rawPct: Math.round(matchData.skill * 100),
        wPrime: normalizedPreview.w_skill
      },
      {
        subject: labels.projectActivity,
        value: 100 * matchData.activity * ka,
        envelope: 100 * ka,
        rawPct: Math.round(matchData.activity * 100),
        wPrime: normalizedPreview.w_activity
      },
      {
        subject: labels.communityDemand,
        value: 100 * matchData.demand * kd,
        envelope: 100 * kd,
        rawPct: Math.round(matchData.demand * 100),
        wPrime: normalizedPreview.w_demand
      }
    ]
  }, [
    matchData,
    labels.skillMatch,
    labels.projectActivity,
    labels.communityDemand,
    axisWeightScale,
    normalizedPreview
  ])

  const weightKeyLabelHtml = useMemo(() => {
    const map: Record<WeightKey, string> = {
      w_skill: "w_{skill}",
      w_activity: "w_{activity}",
      w_demand: "w_{demand}"
    }
    return {
      w_skill: katex.renderToString(map.w_skill, { displayMode: false, throwOnError: false }),
      w_activity: katex.renderToString(map.w_activity, { displayMode: false, throwOnError: false }),
      w_demand: katex.renderToString(map.w_demand, { displayMode: false, throwOnError: false })
    } as Record<WeightKey, string>
  }, [])

  const envelopeName = useMemo(
    () => (language === 'english' ? 'Weight envelope (S=1)' : '权重外轮廓 (S=1)'),
    [language]
  )

  const renderPolarAngleTick = useCallback(
    (tp: Record<string, unknown>) => {
      const x = typeof tp.x === 'number' ? tp.x : 0
      const y = typeof tp.y === 'number' ? tp.y : 0
      const cx = typeof tp.cx === 'number' ? tp.cx : 0
      const cy = typeof tp.cy === 'number' ? tp.cy : 0
      const index = typeof tp.index === 'number' ? tp.index : 0
      const payload = tp.payload as { value?: string } | undefined
      const row = data.find((d) => d.subject === payload?.value) ?? data[index]
      if (!row) return <g />
      const title = language === 'english' ? row.subject.toUpperCase() : row.subject
      const dx = x - cx
      const dy = y - cy
      const len = Math.hypot(dx, dy) || 1
      const radialOffset = 16
      const globalLabelYShift = 10
      const sideLabelXSpread = 12
      const sideXShift = Math.abs(dx) > Math.abs(dy) * 0.8 ? Math.sign(dx) * sideLabelXSpread : 0
      const tx = x + (dx / len) * radialOffset + sideXShift
      const ty = y + (dy / len) * radialOffset + globalLabelYShift
      return (
        <g transform={`translate(${tx},${ty})`}>
          <text
            textAnchor="middle"
            dy={-2}
            fill={primary}
            style={{
              fontSize: 24,
              fontWeight: 700,
              textShadow: radarTickTextShadow
            }}
          >
            {row.rawPct}%
          </text>
          <text
            textAnchor="middle"
            dy={12}
            fill={textSubtle}
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textShadow: radarTickTextShadow
            }}
          >
            {title}
          </text>
        </g>
      )
    },
    [data, language, primary, textSubtle, radarTickTextShadow]
  )

  const tooltipFormatter = useCallback(
    (value: number, name: string, item: { payload?: { rawPct?: number; wPrime?: number } }) => {
      const pl = item?.payload
      if (name === labels.matchDegree && pl?.rawPct != null && pl?.wPrime != null) {
        return [
          `${labels.tooltipRaw} ${pl.rawPct}% · ${labels.tooltipWeight} ${(Math.round(pl.wPrime * 100) / 100).toFixed(2)}`,
          labels.matchDegree
        ]
      }
      if (name === envelopeName) {
        return [Math.round(value), name]
      }
      return [value, name]
    },
    [labels, envelopeName]
  )

  if (!matchData) return null

  const handleSliderChange = (key: WeightKey, raw: number) => {
    if (Number.isNaN(raw)) return
    const clamped = Math.min(1, Math.max(0, raw))
    setLocalWeights((prev) => ({ ...prev, [key]: clamped }))
  }

  const finishEdit = (key: WeightKey) => {
    const value = parseFloat(editDraft.replace(/,/g, '.'))
    if (!Number.isNaN(value)) {
      handleSliderChange(key, value)
    }
    setEditingKey(null)
  }

  const startEdit = (key: WeightKey) => {
    setEditingKey(key)
    setEditDraft(localWeights[key].toFixed(1))
  }

  const handleApplyToAll = () => {
    if (!onBaseWeightsChange) return
    onBaseWeightsChange(roundThenNormalize(localWeights))
  }

  const chartContent = (
    <div className={`flex h-full flex-col items-center ${embedded ? 'p-5' : 'p-10'}`}>
      <h2 className="mb-3 mt-0 text-xl font-semibold tracking-tight text-text/90">
        {matchData.repoName}
      </h2>
      <div className="mb-4 flex items-baseline gap-2 text-4xl font-bold leading-none">
        <span className="text-text/90">{labels.overallMatch}:</span>
        <span className="text-primary">{Math.round(previewMatchScore * 100)}%</span>
      </div>
      <div
        className={`w-full overflow-hidden rounded-2xl p-1 ${
          embedded ? 'h-[280px]' : 'h-[400px]'
        }`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart
            data={data}
            cx="50%"
            cy="53%"
            outerRadius="90%"
            innerRadius={0}
            margin={{ top: 22, right: 4, bottom: 14, left: 4 }}
          >
            <Customized
              component={(p: Record<string, unknown>) => {
                const g = parseRadarGeom(p)
                if (!g) return null
                const { cx, cy, r } = g
                const rr = Math.max(0, r - 0.5)
                const ringRadii = Array.from({ length: radarRingCount }, (_, i) => {
                  const t = (i + 1) / radarRingCount
                  return rr * t
                })
                return (
                  <g>
                    <defs>
                      <linearGradient id={radarEnvelopeFillId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={primaryDeep} stopOpacity={0.24} />
                        <stop offset="65%" stopColor={primaryDeep} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={primaryDeep} stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id={radarMatchFillId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={primary} stopOpacity={matchFillTopOp} />
                        <stop offset="100%" stopColor={primaryDeep} stopOpacity={matchFillBottomOp} />
                      </linearGradient>
                      <filter
                        id={radarMatchGlowFilterId}
                        x="-45%"
                        y="-45%"
                        width="190%"
                        height="190%"
                      >
                        <feGaussianBlur
                          in="SourceAlpha"
                          stdDeviation={matchGlowBlur}
                          result="blur"
                        />
                        <feFlood
                          floodColor={primary}
                          floodOpacity={Number.isFinite(matchGlowFloodOp) ? matchGlowFloodOp : 0.45}
                          result="glowColor"
                        />
                        <feComposite in="glowColor" in2="blur" operator="in" result="softGlow" />
                        <feMerge>
                          <feMergeNode in="softGlow" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                      <radialGradient
                        id={radarCenterGlowId}
                        cx="50%"
                        cy="53%"
                        r={radarGlowRadius}
                      >
                        <stop offset="0%" stopColor={radarGlowColor} stopOpacity={radarGlowCenterOp} />
                        <stop
                          offset={radarGlowMidOffset}
                          stopColor={radarGlowColor}
                          stopOpacity={radarGlowMidOp}
                        />
                        <stop offset="100%" stopColor={radarGlowColor} stopOpacity={radarGlowEdgeOp} />
                      </radialGradient>
                    </defs>
                    <circle cx={cx} cy={cy} r={rr} fill={`url(#${radarCenterGlowId})`} />
                    {ringRadii.map((rk) => (
                      <circle
                        key={rk}
                        cx={cx}
                        cy={cy}
                        r={rk}
                        fill="none"
                        stroke={radarRingColor}
                        strokeOpacity={radarRingOpacity}
                        strokeWidth={radarRingWidth}
                      />
                    ))}
                  </g>
                )
              }}
            />
            <PolarAngleAxis
              dataKey="subject"
              tickLine={false}
              axisLine={false}
              tick={renderPolarAngleTick}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: `1px solid ${borderSoft}`,
                background: surface,
                fontSize: 12,
                color: textMain
              }}
              formatter={tooltipFormatter}
            />
            <Radar
              name={envelopeName}
              dataKey="envelope"
              stroke={primaryDeep}
              strokeOpacity={envelopeStrokeOp}
              fill={`url(#${radarEnvelopeFillId})`}
              fillOpacity={1}
              strokeWidth={2.35}
              dot={false}
              isAnimationActive={false}
            />
            <Radar
              name={labels.matchDegree}
              dataKey="value"
              stroke={primary}
              strokeWidth={2.5}
              fill={`url(#${radarMatchFillId})`}
              fillOpacity={1}
              filter={`url(#${radarMatchGlowFilterId})`}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 w-full flex flex-col gap-3 text-xs text-text/90">
        {onBaseWeightsChange && (
          <div className="mt-3 flex w-full justify-center px-1">
            <div className="glass-card flex w-full max-w-[360px] flex-col gap-3 rounded-[10px] p-4">
              <div className="text-sm font-semibold tracking-wide text-text/85">{labels.weightAdjust}</div>
              <div className="flex flex-col gap-4">
                {WEIGHT_KEYS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span
                      className="w-[4.5rem] shrink-0 font-mono text-[13px] text-text/85"
                      dangerouslySetInnerHTML={{ __html: weightKeyLabelHtml[key] }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={localWeights[key]}
                      onChange={(e) => handleSliderChange(key, parseFloat(e.target.value))}
                      className="weight-slider min-w-0 flex-1"
                      style={
                        {
                          ['--weight-slider-pct' as string]: `${localWeights[key] * 100}%`,
                          accentColor: primaryDeep
                        } as React.CSSProperties
                      }
                      aria-label={label}
                    />
                    {editingKey === key ? (
                      <input
                        ref={valueInputRef}
                        type="text"
                        inputMode="decimal"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onBlur={() => finishEdit(key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            finishEdit(key)
                          } else if (e.key === 'Escape') {
                            e.preventDefault()
                            setEditingKey(null)
                          }
                        }}
                        className="w-14 shrink-0 rounded border border-primary bg-surface px-1 py-0.5 text-right text-xs tabular-nums text-text"
                      />
                    ) : (
                      <button
                        type="button"
                        onDoubleClick={() => startEdit(key)}
                        className="w-14 shrink-0 cursor-text select-none rounded border border-transparent px-1 py-0.5 text-right text-xs tabular-nums text-text hover:bg-surface2"
                        title={language === 'english' ? 'Double-click to edit' : '双击编辑'}
                      >
                        {localWeights[key].toFixed(1)}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleApplyToAll}
                className="mt-1 w-full rounded-xl py-2.5 text-base font-medium text-[#06222e] transition hover:brightness-95"
                style={{ backgroundColor: primaryDeep }}
              >
                {labels.applyAll}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (embedded) {
    return chartContent
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="h-[80vh] w-[80vw]">
      {chartContent}
    </Modal>
  )
}

export default MatchRadarChart
