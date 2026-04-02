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
      className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[var(--color-primaryDeep)] text-lg font-semibold text-[#06222e] transition hover:brightness-95"
    >
      {initial}
    </button>
  )
}

export default UserAvatar
