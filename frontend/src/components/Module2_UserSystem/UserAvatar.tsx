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
      className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-primary text-lg font-semibold text-white transition hover:scale-110 hover:bg-primaryDark"
    >
      {initial}
    </button>
  )
}

export default UserAvatar
