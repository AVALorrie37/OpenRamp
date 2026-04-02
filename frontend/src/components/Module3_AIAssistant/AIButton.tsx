import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

interface AIButtonProps {
  onClick: () => void
  language?: 'chinese' | 'english'
}

const BTN_SIZE = 90
const DRAG_THRESHOLD_SQ = 25

function clampPos(left: number, top: number) {
  const w = window.innerWidth
  const h = window.innerHeight
  return {
    left: Math.min(Math.max(0, left), Math.max(0, w - BTN_SIZE)),
    top: Math.min(Math.max(0, top), Math.max(0, h - BTN_SIZE)),
  }
}

function defaultPosition() {
  const w = window.innerWidth
  const h = window.innerHeight
  const marginRight = w >= 640 ? 30 : 16
  const marginBottom = 60
  return clampPos(w - BTN_SIZE - marginRight, h - BTN_SIZE - marginBottom)
}

const AIButton: React.FC<AIButtonProps> = ({ onClick, language = 'chinese' }) => {
  const [pos, setPos] = useState<{ left: number; top: number }>(() =>
    typeof window !== 'undefined' ? defaultPosition() : { left: 0, top: 0 }
  )
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    origLeft: number
    origTop: number
    moved: boolean
  } | null>(null)
  const suppressSyntheticClickRef = useRef(false)

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    setPos(defaultPosition())
  }, [])

  useEffect(() => {
    const onResize = () => {
      setPos((p) => clampPos(p.left, p.top))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: pos.left,
      origTop: pos.top,
      moved: false,
    }
  }, [pos.left, pos.top])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && dx * dx + dy * dy > DRAG_THRESHOLD_SQ) d.moved = true
    if (d.moved) setPos(clampPos(d.origLeft + dx, d.origTop + dy))
  }, [])

  const finishPointer = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current
      if (!d || e.pointerId !== d.pointerId) return
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      const shouldClick = !d.moved
      dragRef.current = null
      suppressSyntheticClickRef.current = true
      requestAnimationFrame(() => {
        suppressSyntheticClickRef.current = false
      })
      if (shouldClick) onClick()
    },
    [onClick]
  )

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressSyntheticClickRef.current) {
        e.preventDefault()
        return
      }
      onClick()
    },
    [onClick]
  )

  return (
    <button
      type="button"
      onClick={handleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      style={{ left: pos.left, top: pos.top, width: BTN_SIZE, height: BTN_SIZE }}
      className="group fixed z-[999] touch-none select-none flex cursor-grab active:cursor-grabbing items-center justify-center rounded-full bg-[conic-gradient(from_200deg_at_50%_50%,color-mix(in_srgb,var(--color-radarGlow)_70%,transparent),color-mix(in_srgb,var(--color-accent)_52%,transparent),color-mix(in_srgb,var(--color-primaryDeep)_45%,transparent),color-mix(in_srgb,var(--color-radarGlow)_38%,transparent),color-mix(in_srgb,var(--color-accent)_48%,transparent),color-mix(in_srgb,var(--color-radarGlow)_68%,transparent))] p-[3px] shadow-[0_0_14px_2px_color-mix(in_srgb,var(--color-radarGlow)_58%,transparent),0_0_32px_color-mix(in_srgb,var(--color-radarGlow)_35%,transparent),0_2px_5px_var(--shadow-modal),0_8px_26px_0_rgba(0,0,0,0.22),0_16px_44px_0_rgba(0,0,0,0.14),0_26px_52px_0_color-mix(in_srgb,var(--color-radarGlow)_26%,transparent),inset_0_1px_0_rgba(255,255,255,0.22),inset_0_0_18px_color-mix(in_srgb,var(--color-radarGlow)_18%,transparent)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:scale-[1.06] hover:bg-[conic-gradient(from_200deg_at_50%_50%,color-mix(in_srgb,var(--color-radarGlow)_82%,transparent),color-mix(in_srgb,var(--color-accent)_64%,transparent),color-mix(in_srgb,var(--color-primaryDeep)_56%,transparent),color-mix(in_srgb,var(--color-radarGlow)_50%,transparent),color-mix(in_srgb,var(--color-accent)_58%,transparent),color-mix(in_srgb,var(--color-radarGlow)_80%,transparent))] hover:shadow-[0_0_18px_3px_color-mix(in_srgb,var(--color-radarGlow)_72%,transparent),0_0_42px_color-mix(in_srgb,var(--color-radarGlow)_48%,transparent),0_3px_8px_var(--shadow-modal),0_10px_30px_0_rgba(0,0,0,0.26),0_18px_48px_0_rgba(0,0,0,0.16),0_32px_64px_0_color-mix(in_srgb,var(--color-radarGlow)_34%,transparent),inset_0_1px_0_rgba(255,255,255,0.32),inset_0_0_20px_color-mix(in_srgb,var(--color-radarGlow)_24%,transparent)]"
    >
      <span className="relative flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_42%_34%,color-mix(in_srgb,var(--color-primary)_88%,var(--color-specular-white)_14%),color-mix(in_srgb,var(--color-radarGlow)_42%,var(--color-primaryDeep))_46%,color-mix(in_srgb,var(--color-primaryDeep)_52%,color-mix(in_srgb,var(--color-radarGlow)_42%,transparent))_62%,color-mix(in_srgb,color-mix(in_srgb,var(--color-radarGlow)_40%,var(--color-primaryDeep))_58%,var(--color-primary)_42%)_71%,color-mix(in_srgb,var(--color-primaryDeep)_38%,var(--color-primary)_62%)_80%,color-mix(in_srgb,var(--color-primary)_46%,transparent)_86%,color-mix(in_srgb,var(--color-radarGlow)_34%,transparent)_91%,color-mix(in_srgb,var(--color-specular-white)_22%,transparent)_96%,color-mix(in_srgb,var(--color-specular-white)_8%,transparent)_100%)] px-1">
        <span
          className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(165deg,color-mix(in_srgb,var(--color-specular-white)_34%,transparent)_0%,color-mix(in_srgb,var(--color-primary)_22%,transparent)_55%,transparent_100%)] opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100"
          aria-hidden
        />
        <span className="relative z-[1] text-center text-lg font-semibold leading-tight text-[var(--emphasis-fill-text)] dark:text-text/90">
          {language === 'english' ? 'AI Assistant' : 'AI助手'}
        </span>
      </span>
    </button>
  )
}

export default AIButton
