import React from 'react'
import { theme } from '../../styles/theme'
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
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '12px'
    }}>
      <div
        style={{
          maxWidth: hasResults ? '85%' : '70%',
          padding: '12px 16px',
          borderRadius: '12px',
          backgroundColor: isUser ? theme.primary : theme.primaryLight,
          color: isUser ? theme.white : theme.text,
          fontSize: '14px',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap'
        }}
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
