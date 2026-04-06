import { useCallback, useState } from 'react'
import { readUiLanguageFromStorage, writeUiLanguageToStorage, type UiLanguage } from '../utils/storage'

export type { UiLanguage }

export function useUiLanguage() {
  const [uiLanguage, setUiLanguageState] = useState<UiLanguage>(() => readUiLanguageFromStorage())

  const setUiLanguage = useCallback((lang: UiLanguage) => {
    setUiLanguageState(lang)
    writeUiLanguageToStorage(lang)
  }, [])

  return { uiLanguage, setUiLanguage }
}
