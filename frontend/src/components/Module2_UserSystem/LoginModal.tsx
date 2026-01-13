import React, { useState } from 'react'
import Modal from '../shared/Modal'
import { theme } from '../../styles/theme'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  onLogin: (username: string) => void
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLogin }) => {
  const [username, setUsername] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (username.trim()) {
      onLogin(username.trim())
      setUsername('')
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="登录" width="400px">
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            color: theme.text,
            fontSize: '14px',
            fontWeight: 500
          }}>
            用户名
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="输入用户名"
            style={{
              width: '100%',
              padding: '10px',
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              fontSize: '14px',
              outline: 'none'
            }}
            autoFocus
          />
        </div>
        <button
          type="submit"
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: theme.primary,
            color: theme.white,
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = theme.primaryDark
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = theme.primary
          }}
        >
          登录
        </button>
      </form>
    </Modal>
  )
}

export default LoginModal
