import React, { useState, useRef, useEffect } from 'react'
import UserAvatar from './UserAvatar'
import ProfilePanel from './ProfilePanel'
import { theme } from '../../styles/theme'
import type { UserProfile } from '../../types'

interface UserDropdownProps {
  username: string | null
  profile: UserProfile | null
  onUpdate: (profile: Partial<UserProfile>) => void
  onLogout: () => void
}

const UserDropdown: React.FC<UserDropdownProps> = ({ username, profile, onUpdate, onLogout }) => {
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
    return <UserAvatar username={null} onClick={() => setIsOpen(true)} />
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <UserAvatar username={username} onClick={() => setIsOpen(!isOpen)} />
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '50px',
          right: 0,
          backgroundColor: theme.white,
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          minWidth: '320px'
        }}>
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
