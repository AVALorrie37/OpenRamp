/// <reference types="vite/client" />

interface ServiceStatusPayload {
  status: 'backend_starting' | 'backend_up' | 'backend_error'
  error?: string | null
}

interface Window {
  electronAPI?: {
    platform: string
    getServiceStatus?: () => Promise<ServiceStatusPayload>
  }
}
