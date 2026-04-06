import React, { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { getPreferenceTypes } from './preferenceTypes'

export interface ProfilePreferencesEditorProps {
  preferences: string[]
  onChange: (preferences: string[]) => void
  language: 'chinese' | 'english'
  compact?: boolean
  disabled?: boolean
}

const ProfilePreferencesEditor: React.FC<ProfilePreferencesEditorProps> = ({
  preferences,
  onChange,
  language,
  compact = false,
  disabled = false
}) => {
  const [showSelector, setShowSelector] = useState(false)
  const preferenceSelectorRef = useRef<HTMLDivElement>(null)
  const preferenceTypes = getPreferenceTypes(language)

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (showSelector && preferenceSelectorRef.current && !preferenceSelectorRef.current.contains(event.target as Node)) {
        setShowSelector(false)
      }
    }
    if (showSelector) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showSelector])

  const toggle = (key: string) => {
    if (disabled) return
    onChange(preferences.includes(key) ? preferences.filter((p) => p !== key) : [...preferences, key])
  }

  const remove = (key: string) => {
    if (disabled) return
    onChange(preferences.filter((p) => p !== key))
  }

  const btnClass = compact
    ? 'rounded-md border border-border bg-background px-2 py-1 text-[11px] text-text hover:border-primary'
    : 'rounded-full border border-border bg-background px-3 py-1.5 text-xs text-text hover:border-primary hover:bg-primaryLight/40'

  return (
    <div className={compact ? 'mt-2' : 'mb-5'}>
      <div className={`mb-2 ${compact ? 'text-xs' : 'text-base'} font-medium text-text`}>
        {language === 'english' ? 'Contribution preferences' : '贡献偏好'}
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {preferences.map((preference) => (
          <div
            key={preference}
            className="flex items-center gap-1 rounded-full bg-[var(--emphasis-fill-bg)] px-2 py-1 text-xs font-medium text-[var(--emphasis-fill-text)]"
          >
            <span>{preferenceTypes[preference as keyof typeof preferenceTypes]?.label || preference}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(preference)}
                className="bg-transparent px-0.5 text-[var(--emphasis-fill-text)]/90 hover:text-[var(--emphasis-fill-text)]"
                aria-label="Remove"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div ref={preferenceSelectorRef}>
        {disabled ? null : showSelector ? (
          <>
            <div className={`mb-2 grid ${compact ? 'grid-cols-1 gap-1.5' : 'grid-cols-2 gap-2'}`}>
              {Object.entries(preferenceTypes).map(([key, pref]) => (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggle(key)
                    }
                  }}
                  className={`cursor-pointer rounded-md bg-surface p-2 text-xs ${
                    preferences.includes(key) ? 'border-2 border-primary bg-primary/10' : 'border border-border'
                  }`}
                >
                  <div className="mb-0.5 font-bold text-[var(--emphasis-fill-bg)]">{pref.label}</div>
                  <div className="text-[11px] text-text/70">{pref.description}</div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setShowSelector(false)} className={`${btnClass} ml-1`}>
              {language === 'english' ? 'Done' : '完成选择'}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setShowSelector(true)} className={btnClass}>
            {language === 'english' ? '+ Choose preferences' : '+ 选择偏好'}
          </button>
        )}
      </div>
    </div>
  )
}

export default ProfilePreferencesEditor
