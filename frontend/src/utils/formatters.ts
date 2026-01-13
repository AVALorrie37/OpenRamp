export const formatScore = (score: number): string => {
  return `${Math.round(score * 100)}%`
}

export const formatDate = (date: string): string => {
  return new Date(date).toLocaleDateString('zh-CN')
}

export const extractKeywords = (text: string): string[] => {
  const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can']
  const words = text.toLowerCase().match(/\b\w+\b/g) || []
  return words.filter(w => w.length > 3 && !commonWords.includes(w))
}
