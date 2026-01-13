import React from 'react'
import { theme } from '../../styles/theme'
import type { ChatMessage as ChatMessageType } from '../../types'

interface ChatMessageProps {
  message: ChatMessageType
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user'

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '12px'
    }}>
      <div style={{
        maxWidth: '70%',
        padding: '12px 16px',
        borderRadius: '12px',
        backgroundColor: isUser ? theme.primary : theme.primaryLight,
        color: isUser ? theme.white : theme.text,
        fontSize: '14px',
        lineHeight: '1.5'
      }}>
        {message.content}
      </div>
    </div>
  )
}

export default ChatMessage
