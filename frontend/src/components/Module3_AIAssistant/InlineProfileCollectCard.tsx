import React, { useState, useEffect, useCallback } from 'react'
import type { ProfileGapKind } from '../../types'
import ProfileSkillsEditor from '../shared/profile/ProfileSkillsEditor'
import ProfilePreferencesEditor from '../shared/profile/ProfilePreferencesEditor'

export interface InlineProfileCollectCardProps {
  profileGap: ProfileGapKind
  suggestedKeywords: string[]
  baseline: { skills: string[]; preferences: string[] }
  language: 'chinese' | 'english'
  disabled: boolean
  onConfirm: (draft: { skills: string[]; preferences: string[] }) => void
}

const InlineProfileCollectCard: React.FC<InlineProfileCollectCardProps> = ({
  profileGap,
  suggestedKeywords,
  baseline,
  language,
  disabled,
  onConfirm
}) => {
  const [draftSkills, setDraftSkills] = useState<string[]>(() => [...baseline.skills])
  const [draftPrefs, setDraftPrefs] = useState<string[]>(() => [...baseline.preferences])

  useEffect(() => {
    setDraftSkills([...baseline.skills])
    setDraftPrefs([...baseline.preferences])
  }, [baseline.skills, baseline.preferences])

  const discard = useCallback(() => {
    setDraftSkills([...baseline.skills])
    setDraftPrefs([...baseline.preferences])
  }, [baseline.skills, baseline.preferences])

  const addKeyword = (kw: string) => {
    const k = kw.trim().toLowerCase().replace(/\s+/g, '_')
    if (!k || !/^[a-zA-Z0-9_]+$/.test(k) || draftSkills.includes(k)) return
    if (k.length > 20) return
    setDraftSkills((s) => [...s, k])
  }

  const showSkills = disabled ? true : profileGap === 'skills' || profileGap === 'both'
  const showPrefs = disabled ? true : profileGap === 'contribution_styles' || profileGap === 'both'

  return (
    <div className="mt-3">
      <div className={`rounded-md border border-border bg-surface/70 p-3 ${disabled ? 'opacity-90' : ''}`}>
        <div className="mb-2 text-xs text-text/70">
          {language === 'english' ? 'Profile for search' : '搜索所需信息'}
        </div>
        {!disabled && suggestedKeywords.length > 0 && showSkills && (
          <div className="mb-2">
          <div className="mb-1 text-xs text-text/70">{language === 'english' ? 'Suggested keywords' : '推荐关键词'}</div>
          <div className="flex flex-wrap gap-1">
            {suggestedKeywords.map((kw) => (
              <button
                key={kw}
                type="button"
                onClick={() => addKeyword(kw)}
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-text hover:border-primary"
              >
                + {kw}
              </button>
            ))}
          </div>
          </div>
        )}
        {showSkills && (
          <ProfileSkillsEditor
            skills={draftSkills}
            onChange={setDraftSkills}
            language={language}
            compact
            disabled={disabled}
          />
        )}
        {showPrefs && (
          <ProfilePreferencesEditor
            preferences={draftPrefs}
            onChange={setDraftPrefs}
            language={language}
            compact
            disabled={disabled}
          />
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onConfirm({ skills: draftSkills, preferences: draftPrefs })}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              disabled ? 'cursor-not-allowed border border-border bg-background text-text/60' : 'bg-primary text-white hover:bg-primaryDark'
            }`}
          >
            {disabled ? (language === 'english' ? 'Submitted' : '已提交') : (language === 'english' ? 'Confirm changes' : '确认修改')}
          </button>
          {!disabled && (
            <button
              type="button"
              onClick={discard}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-text hover:bg-primaryLight/30"
            >
              {language === 'english' ? 'Discard changes' : '放弃修改'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default InlineProfileCollectCard
