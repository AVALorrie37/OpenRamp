import React from 'react'
import { X } from 'lucide-react'
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className }) => {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[90vh] flex-col overflow-auto rounded-lg bg-surface shadow-modal ${className || 'w-[600px]'}`}
        onClick={(e) => e.stopPropagation()}
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
      </div>
    </div>
  )
}

export default Modal
