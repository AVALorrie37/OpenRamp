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
      className="fixed z-[999] touch-none select-none flex cursor-grab active:cursor-grabbing items-center justify-center rounded-full bg-primary text-lg font-semibold text-white shadow-modal transition hover:scale-110 hover:bg-primaryDark"
    >
      {language === 'english' ? 'AI Assistant' : 'AI助手'}
    </button>
  )
}

export default AIButton
