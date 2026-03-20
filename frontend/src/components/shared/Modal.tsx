import React from 'react'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={`flex max-h-[90vh] flex-col overflow-auto rounded-lg bg-surface shadow-modal ${className || 'w-[600px]'}`}
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            {title && (
              <div className="flex items-center justify-between border-b border-border p-5">
                <h2 className="m-0 text-text">{title}</h2>
                <button
                  onClick={onClose}
                  className="inline-flex items-center justify-center px-2 text-text"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-auto p-5">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default Modal
