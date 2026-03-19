import React, { useState } from 'react'
import Modal from '../shared/Modal'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  onLogin: (username: string, language: 'chinese' | 'english') => void
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLogin }) => {
  const [username, setUsername] = useState('')
  const [language, setLanguage] = useState<'chinese' | 'english'>('chinese')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (username.trim()) {
      onLogin(username.trim(), language)
      setUsername('')
      onClose()
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={language === 'english' ? 'Login' : '登录'} className="w-[400px]">
      <form onSubmit={handleSubmit}>
        <div className="mb-5">
          <label className="mb-2 block text-base font-medium text-text">
            {language === 'english' ? 'Username' : '用户名'}
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={language === 'english' ? 'Enter username' : '输入用户名'}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base outline-none transition focus:border-primary"
            autoFocus
          />
        </div>
        <div className="mb-5">
          <label className="mb-2 block text-base font-medium text-text">
            语言 / Language
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as 'chinese' | 'english')}
            className="w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-2 text-base text-text outline-none transition focus:border-primary"
          >
            <option value="chinese">中文</option>
            <option value="english">English</option>
          </select>
        </div>
        <button
          type="submit"
          className="w-full rounded-md bg-primary px-3 py-3 text-base font-semibold text-white transition hover:bg-primaryDark"
        >
          {language === 'english' ? 'Login' : '登录'}
        </button>
      </form>
    </Modal>
  )
}

export default LoginModal
