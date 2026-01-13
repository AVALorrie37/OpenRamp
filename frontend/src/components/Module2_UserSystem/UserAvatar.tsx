import React from 'react'
import { theme } from '../../styles/theme'

interface UserAvatarProps {
  username: string | null
  onClick: () => void
}

const UserAvatar: React.FC<UserAvatarProps> = ({ username, onClick }) => {
  if (!username) {
    return (
      <button
        onClick={onClick}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          backgroundColor: theme.border,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontSize: '20px',
          color: theme.text,
          opacity: 0.6
        }}
      >
        👤
      </button>
    )
  }

  const initial = username.charAt(0).toUpperCase()

  return (
    <button
      onClick={onClick}
      style={{
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        backgroundColor: theme.primary,
        color: theme.white,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        fontSize: '18px',
        fontWeight: 600,
        transition: 'all 0.2s'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = theme.primaryDark
        e.currentTarget.style.transform = 'scale(1.1)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = theme.primary
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {initial}
    </button>
  )
}

export default UserAvatar
