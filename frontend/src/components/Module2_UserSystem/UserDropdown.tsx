import React, { useState, useRef, useEffect } from 'react'
import UserAvatar from './UserAvatar'
import ProfilePanel from './ProfilePanel'
import type { UserProfile } from '../../types'

interface UserDropdownProps {
  username: string | null
  profile: UserProfile | null
  onUpdate: (profile: Partial<UserProfile>) => void
  onLogout: () => void
  onLogin?: () => void
  uiLanguage: 'chinese' | 'english'
  setUiLanguage: (lang: 'chinese' | 'english') => void
}

const UserDropdown: React.FC<UserDropdownProps> = ({
  username,
  profile,
  onUpdate,
  onLogout,
  onLogin,
  uiLanguage,
  setUiLanguage
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  if (!username) {
    return (
      <div ref={dropdownRef} className="relative">
        <UserAvatar username={null} onClick={() => setIsOpen(!isOpen)} />
        {isOpen && (
          <div className="absolute right-0 top-[50px] z-[1000] min-w-[220px] rounded-md border border-border bg-surface p-4 shadow-panel">
            <div className="mb-3 text-sm font-medium text-text">
              {uiLanguage === 'english' ? 'Language' : '语言'}
            </div>
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setUiLanguage('chinese')}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  uiLanguage === 'chinese'
                    ? 'border-[var(--emphasis-fill-bg)] bg-[var(--emphasis-fill-bg)] text-[var(--emphasis-fill-text)]'
                    : 'border-border bg-background text-text'
                }`}
              >
                中文
              </button>
              <button
                type="button"
                onClick={() => setUiLanguage('english')}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  uiLanguage === 'english'
                    ? 'border-[var(--emphasis-fill-bg)] bg-[var(--emphasis-fill-bg)] text-[var(--emphasis-fill-text)]'
                    : 'border-border bg-background text-text'
                }`}
              >
                EN
              </button>
            </div>
            {onLogin && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false)
                  onLogin()
                }}
                className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-primaryDark"
              >
                {uiLanguage === 'english' ? 'Log in' : '登录'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={dropdownRef} className="relative">
      <UserAvatar username={username} onClick={() => setIsOpen(!isOpen)} />
      {isOpen && (
        <div className="absolute right-0 top-[50px] z-[1000] min-w-[320px] rounded-md bg-surface shadow-panel">
          <ProfilePanel
            profile={profile}
            uiLanguage={uiLanguage}
            onUpdate={onUpdate}
            onLogout={() => {
              onLogout()
              setIsOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}

export default UserDropdown
