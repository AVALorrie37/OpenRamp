import React from 'react'
import type { ChatMessage as ChatMessageType, RepoResponse } from '../../types'
import SearchResultCards from './SearchResultCards'

interface ChatMessageProps {
  message: ChatMessageType
  language?: 'chinese' | 'english'
  username?: string | null
  onFavorite?: (repo: RepoResponse) => void
  onUnfavorite?: (repoId: string) => void
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, language = 'chinese', username, onFavorite, onUnfavorite }) => {
  const isUser = message.role === 'user'
  const hasResults = !isUser && message.searchResults && message.searchResults.length > 0

  return (
    <div className={`mb-3 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`rounded-lg px-4 py-3 text-base leading-6 whitespace-pre-wrap ${
          hasResults ? 'max-w-[85%]' : 'max-w-[70%]'
        } ${isUser ? 'bg-primary text-white' : 'bg-primaryLight text-text'}`}
      >
        {message.content}
        {hasResults && (
          <SearchResultCards repos={message.searchResults!} language={language} username={username} onFavorite={onFavorite} onUnfavorite={onUnfavorite} />
        )}
      </div>
    </div>
  )
}

export default ChatMessage
