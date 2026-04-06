import React, { useState } from 'react'
import Modal from '../shared/Modal'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  onLogin: (username: string) => void
  uiLanguage: 'chinese' | 'english'
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLogin, uiLanguage }) => {
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
    <Modal isOpen={isOpen} onClose={onClose} title={uiLanguage === 'english' ? 'Login' : '登录'} className="w-[400px]">
      <form onSubmit={handleSubmit}>
        <div className="mb-5">
          <label className="mb-2 block text-base font-medium text-text">
            {uiLanguage === 'english' ? 'Username' : '用户名'}
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={uiLanguage === 'english' ? 'Enter username' : '输入用户名'}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base outline-none transition focus:border-primary"
            autoFocus
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-primary px-3 py-3 text-base font-semibold text-white transition hover:bg-primaryDark"
        >
          {uiLanguage === 'english' ? 'Login' : '登录'}
        </button>
      </form>
    </Modal>
  )
}

export default LoginModal
