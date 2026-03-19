import React from 'react'

const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex items-center justify-center p-5">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primaryLight border-t-primary" />
    </div>
  )
}

export default LoadingSpinner
