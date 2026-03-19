import React from 'react'

interface AIButtonProps {
  onClick: () => void
  language?: 'chinese' | 'english'
}

const AIButton: React.FC<AIButtonProps> = ({ onClick, language = 'chinese' }) => {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-[60px] right-4 z-[999] flex h-[90px] w-[90px] cursor-pointer items-center justify-center rounded-full bg-primary text-lg font-semibold text-white shadow-modal transition hover:scale-110 hover:bg-primaryDark sm:right-[30px]"
    >
      {language === 'english' ? 'AI Assistant' : 'AI助手'}
    </button>
  )
}

export default AIButton
