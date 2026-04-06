import React from 'react'
import type { UserProfile } from '../../types'
import ProfileSkillsEditor from '../shared/profile/ProfileSkillsEditor'
import ProfilePreferencesEditor from '../shared/profile/ProfilePreferencesEditor'

interface ProfilePanelProps {
  profile: UserProfile | null
  uiLanguage: 'chinese' | 'english'
  onUpdate: (profile: Partial<UserProfile>) => void
  onLogout: () => void
}

const ProfilePanel: React.FC<ProfilePanelProps> = ({ profile, uiLanguage, onUpdate, onLogout }) => {
  const lang: 'chinese' | 'english' = uiLanguage

  return (
    <div className="min-w-[300px] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="m-0 text-lg font-semibold text-text">{lang === 'english' ? 'Profile' : '个人信息'}</h3>
        <div>
          <button
            type="button"
            onClick={() => onUpdate({ language: 'chinese' as const })}
            className={`mr-2 rounded-full border px-2 py-1 text-xs font-medium ${
              uiLanguage === 'chinese'
                ? 'border-[var(--emphasis-fill-bg)] bg-[var(--emphasis-fill-bg)] text-[var(--emphasis-fill-text)]'
                : 'border-border bg-background text-text'
            }`}
          >
            中文
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ language: 'english' as const })}
            className={`rounded-full border px-2 py-1 text-xs font-medium ${
              uiLanguage === 'english'
                ? 'border-[var(--emphasis-fill-bg)] bg-[var(--emphasis-fill-bg)] text-[var(--emphasis-fill-text)]'
                : 'border-border bg-background text-text'
            }`}
          >
            EN
          </button>
        </div>
      </div>

      <ProfileSkillsEditor
        skills={profile?.skills || []}
        onChange={(skills) => onUpdate({ skills })}
        language={lang}
      />

      <ProfilePreferencesEditor
        preferences={profile?.preferences || []}
        onChange={(preferences) => onUpdate({ preferences })}
        language={lang}
      />

      <button
        type="button"
        onClick={onLogout}
        className="mt-5 w-full rounded-md border border-border bg-background px-3 py-2.5 text-base text-text hover:border-primary hover:bg-primaryLight/40"
      >
        {lang === 'english' ? 'Logout' : '注销'}
      </button>
    </div>
  )
}

export default ProfilePanel
