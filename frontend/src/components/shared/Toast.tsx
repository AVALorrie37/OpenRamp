import React, { useEffect } from 'react'
import { motion } from 'framer-motion'

interface ToastProps {
  message: string
  duration?: number
  onClose: () => void
}

const Toast: React.FC<ToastProps> = ({ message, duration = 3000, onClose }) => {

  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  return (
    <motion.div
      className="fixed bottom-5 left-1/2 z-[10000] -translate-x-1/2 rounded-md bg-primary px-6 py-3 text-white shadow-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.18 }}
    >
      {message}
    </motion.div>
  )
}

export default Toast
