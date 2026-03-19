import React, { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  duration?: number
  onClose: () => void
}

const Toast: React.FC<ToastProps> = ({ message, duration = 3000, onClose }) => {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  if (!visible) return null

  return (
    <div className="fixed bottom-5 left-1/2 z-[10000] -translate-x-1/2 animate-[toastIn_300ms_ease-out] rounded-md bg-primary px-6 py-3 text-white shadow-panel">
      {message}
    </div>
  )
}

export default Toast
