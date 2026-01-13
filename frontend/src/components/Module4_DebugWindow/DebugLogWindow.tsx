import React, { useRef, useEffect } from 'react'
import { theme } from '../../styles/theme'
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

  const getLogColor = (level: string) => {
    switch (level) {
      case 'ERROR':
        return theme.error
      case 'WARNING':
        return theme.warning
      default:
        return theme.text
    }
  }

  const handleDoubleClick = (log: LogEntry) => {
    navigator.clipboard.writeText(log.message)
  }

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '300px',
      backgroundColor: theme.white,
      borderTop: `2px solid ${theme.primary}`,
      zIndex: 999,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 -4px 12px rgba(0,0,0,0.1)'
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: theme.background
      }}>
        <h4 style={{
          margin: 0,
          fontSize: '14px',
          color: theme.text,
          fontWeight: 600
        }}>
          调试日志（实时）
        </h4>
        <button
          onClick={onClear}
          style={{
            padding: '6px 12px',
            backgroundColor: theme.background,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          清空
        </button>
      </div>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
        fontFamily: 'monospace',
        fontSize: '12px',
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4'
      }}>
        {logs.length === 0 ? (
          <div style={{ color: '#858585', textAlign: 'center', marginTop: '40px' }}>
            暂无日志
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              onDoubleClick={() => handleDoubleClick(log)}
              style={{
                padding: '4px 0',
                color: getLogColor(log.level),
                cursor: 'pointer',
                borderBottom: index < logs.length - 1 ? '1px solid #2d2d2d' : 'none'
              }}
            >
              <span style={{ color: '#858585', marginRight: '8px' }}>
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span style={{ color: getLogColor(log.level), marginRight: '8px' }}>
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
