import React from 'react'
import { User } from 'lucide-react'

interface UserAvatarProps {
  username: string | null
  onClick: () => void
}

const UserAvatar: React.FC<UserAvatarProps> = ({ username, onClick }) => {
  if (!username) {
    return (
      <button
        onClick={onClick}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-border text-xl text-text/60"
        aria-label="User"
      >
        <User size={20} />
      </button>
    )
  }

  const initial = username.charAt(0).toUpperCase()

  return (
    <button
      onClick={onClick}
      className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--tab-selected-border)] bg-[var(--tab-selected-bg)] text-lg font-medium text-[var(--tab-selected-text)] transition hover:brightness-[0.99]"
    >
      {initial}
    </button>
  )
}

export default UserAvatar
