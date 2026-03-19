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
}

const UserDropdown: React.FC<UserDropdownProps> = ({ 
  username, 
  profile, 
  onUpdate, 
  onLogout, 
  onLogin 
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
    // 未登录状态下，点击头像触发登录回调
    return onLogin ? (
      <div onClick={onLogin} className="cursor-pointer">
        <UserAvatar username={null} onClick={() => {}} />
      </div>
    ) : (
      <UserAvatar username={null} onClick={() => setIsOpen(true)} />
    )
  }

  return (
    <div ref={dropdownRef} className="relative">
      <UserAvatar username={username} onClick={() => setIsOpen(!isOpen)} />
      {isOpen && (
        <div className="absolute right-0 top-[50px] z-[1000] min-w-[320px] rounded-md bg-surface shadow-panel">
          <ProfilePanel
            profile={profile}
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