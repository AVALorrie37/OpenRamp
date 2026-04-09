import React, { useEffect, useState } from 'react'
import Modal from '../shared/Modal'
import { readRecentUsersFromCache } from '../../utils/storage'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  onLogin: (username: string) => void
  uiLanguage: 'chinese' | 'english'
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onLogin, uiLanguage }) => {
  const [username, setUsername] = useState('')
  const [recentUsers, setRecentUsers] = useState<string[]>([])

  useEffect(() => {
    if (!isOpen) return
    setRecentUsers(readRecentUsersFromCache())
  }, [isOpen])

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
          <div className="flex gap-2">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={uiLanguage === 'english' ? 'Enter username' : '输入用户名'}
              className="w-full flex-1 rounded-md border border-border bg-surface px-3 py-2 text-base outline-none transition focus:border-primary"
              autoFocus
            />
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) setUsername(e.target.value)
              }}
              className="w-[140px] rounded-md border border-border bg-surface px-2 py-2 text-base outline-none transition focus:border-primary"
              aria-label={uiLanguage === 'english' ? 'Recent accounts' : '最近账户'}
              disabled={recentUsers.length === 0}
            >
              <option value="">{uiLanguage === 'english' ? 'Recent' : '最近'}</option>
              {recentUsers.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
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
