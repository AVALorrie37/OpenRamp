import { useState, useEffect, useRef } from 'react'
import type { LogEntry } from '../types'

export const useDebugLogs = (enabled: boolean) => {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!enabled) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      return
    }

    const eventSource = new EventSource('http://localhost:8000/api/logs/stream')
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const logEntry = JSON.parse(event.data)
        setLogs(prev => {
          const newLogs = [...prev, logEntry]
          if (newLogs.length > 200) {
            return newLogs.slice(-200)
          }
          return newLogs
        })
      } catch (error) {
        console.error('Parse log error:', error)
      }
    }

    eventSource.onerror = (error) => {
      console.error('SSE error:', error)
    }

    return () => {
      eventSource.close()
    }
  }, [enabled])

  const clearLogs = () => {
    setLogs([])
  }

  return {
    logs,
    clearLogs
  }
}
