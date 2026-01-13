import React from 'react'
import { theme } from '../../styles/theme'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: string
  height?: string
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, width = '600px', height = 'auto' }) => {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.overlay,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme.white,
          borderRadius: '12px',
          width,
          height,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div style={{
            padding: '20px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{ margin: 0, color: theme.text }}>{title}</h2>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: theme.text,
                padding: '0 8px'
              }}
            >
              ×
            </button>
          </div>
        )}
        <div style={{ padding: '20px', flex: 1, overflow: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default Modal
