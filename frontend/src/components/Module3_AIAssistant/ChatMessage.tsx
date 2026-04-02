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
  const isNotice = !isUser && message.notice

  return (
    <div className={`mb-3 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`rounded-lg px-4 py-3 leading-6 whitespace-pre-wrap ${
          isNotice ? 'text-xs text-text/70' : 'text-base'
        } ${
          hasResults ? 'max-w-[85%]' : 'max-w-[70%]'
        } ${
          isUser
            ? 'bg-[var(--emphasis-fill-bg)] text-[var(--emphasis-fill-text)]'
            : 'bg-primaryLight text-text'
        }`}
      >
        <div data-chat-selectable>
          {message.content}
        </div>
        {hasResults && (
          <SearchResultCards
            repos={message.searchResults!}
            language={language}
            username={username}
            onFavorite={onFavorite}
            onUnfavorite={onUnfavorite}
            searchCompleted={message.searchCompleted}
          />
        )}
      </div>
    </div>
  )
}

export default ChatMessage
