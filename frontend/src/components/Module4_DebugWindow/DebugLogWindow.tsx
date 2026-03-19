import React, { useRef, useEffect } from 'react'
import type { LogEntry } from '../../types'

interface DebugLogWindowProps {
  isOpen: boolean
  logs: LogEntry[]
  onClear: () => void
}

const DebugLogWindow: React.FC<DebugLogWindowProps> = ({ isOpen, logs, onClear }) => {
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, isOpen])

  const getLogClass = (level: string) => {
    switch (level) {
      case 'ERROR':
        return 'text-error'
      case 'WARNING':
        return 'text-warning'
      default:
        return 'text-[#d4d4d4]'
    }
  }

  const handleDoubleClick = (log: LogEntry) => {
    navigator.clipboard.writeText(log.message)
  }

  if (!isOpen) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[999] flex h-[300px] flex-col border-t-2 border-primary bg-surface shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-between border-b border-border bg-background px-4 py-3">
        <h4 className="m-0 text-base font-semibold text-text">
          调试日志（实时）
        </h4>
        <button
          onClick={onClear}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs text-text"
        >
          清空
        </button>
      </div>
      <div className="flex-1 overflow-y-auto bg-[#1e1e1e] p-3 font-mono text-xs text-[#d4d4d4]">
        {logs.length === 0 ? (
          <div className="mt-10 text-center text-[#858585]">
            暂无日志
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              onDoubleClick={() => handleDoubleClick(log)}
              className={`cursor-pointer py-1 ${getLogClass(log.level)} ${index < logs.length - 1 ? 'border-b border-[#2d2d2d]' : ''}`}
            >
              <span className="mr-2 text-[#858585]">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className={`mr-2 ${getLogClass(log.level)}`}>
                [{log.level}]
              </span>
              {log.message}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  )
}

export default DebugLogWindow
