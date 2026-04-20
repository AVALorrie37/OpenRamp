import React from 'react'
import type { ChatMessage as ChatMessageType, RepoResponse } from '../../types'
import SearchResultCards from './SearchResultCards'
import InlineProfileCollectCard from './InlineProfileCollectCard'

interface ChatMessageProps {
  message: ChatMessageType
  messageIndex: number
  language?: 'chinese' | 'english'
  username?: string | null
  onFavorite?: (repo: RepoResponse) => void
  onUnfavorite?: (repoId: string) => void
  onConfirmCollectProfile?: (messageIndex: number, draft: { skills: string[]; preferences: string[] }) => void
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  messageIndex,
  language = 'chinese',
  username,
  onFavorite,
  onUnfavorite,
  onConfirmCollectProfile
}) => {
  const isUser = message.role === 'user'
  const hasResults = !isUser && message.searchResults && message.searchResults.length > 0
  const isNotice = !isUser && message.notice
  const showCollect =
    !isUser &&
    message.action === 'COLLECT_PROFILE_FOR_SEARCH' &&
    message.profileGap &&
    message.profileDraftBaseline &&
    onConfirmCollectProfile
  const modelLabel = (message.model || '').trim()

  return (
    <div className={`mb-3 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`relative w-full ${modelLabel ? 'pt-5' : ''}`}>
        {modelLabel && (
          <div
            className={`absolute top-0 text-xs text-text/60 ${isUser ? 'right-0 text-right' : 'left-0 text-left'}`}
          >
            {modelLabel}：
          </div>
        )}
        <div
          className={`w-fit rounded-lg px-4 py-3 leading-6 whitespace-pre-wrap ${
            isNotice ? 'text-xs text-text/70' : 'text-base'
          } ${
            hasResults || showCollect ? 'max-w-[min(92%,36rem)]' : 'max-w-[70%]'
          } ${
            isUser ? 'ml-auto' : ''
          } ${
            isUser
              ? 'bg-[var(--emphasis-fill-bg)] text-[var(--emphasis-fill-text)]'
              : 'bg-primaryLight text-text'
          }`}
        >
          <div data-chat-selectable>
            {message.content}
          </div>
          {showCollect && (
            <InlineProfileCollectCard
              profileGap={message.profileGap!}
              suggestedKeywords={message.suggestedKeywords || []}
              baseline={message.profileDraftBaseline!}
              language={language}
              disabled={!!message.collectResolved}
              onConfirm={(draft) => onConfirmCollectProfile!(messageIndex, draft)}
            />
          )}
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
    </div>
  )
}

export default ChatMessage
