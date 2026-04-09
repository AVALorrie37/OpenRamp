import React, { useState } from 'react'
import type { UserProfile } from '../../types'
import ProfileSkillsEditor from '../shared/profile/ProfileSkillsEditor'
import ProfilePreferencesEditor from '../shared/profile/ProfilePreferencesEditor'

interface ProfilePanelProps {
  profile: UserProfile | null
  uiLanguage: 'chinese' | 'english'
  onUpdate: (profile: Partial<UserProfile>) => void
  onLogout: () => void
  username: string
  onDeleteAccount?: () => void
}

const ProfilePanel: React.FC<ProfilePanelProps> = ({ profile, uiLanguage, onUpdate, onLogout, username, onDeleteAccount }) => {
  const lang: 'chinese' | 'english' = uiLanguage
  const [confirmDelete, setConfirmDelete] = useState(false)

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

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex-1 rounded-md border border-border bg-background px-3 py-2.5 text-base text-text hover:border-primary hover:bg-primaryLight/40"
        >
          {lang === 'english' ? 'Log out' : '退出登录'}
        </button>
        {onDeleteAccount && (
          <button
            type="button"
            onClick={() => setConfirmDelete((v) => !v)}
            className="w-[44px] rounded-md bg-[var(--color-error)] px-3 py-2.5 text-base font-semibold text-white hover:opacity-90"
            aria-label={lang === 'english' ? `Delete account ${username}` : `删除账号 ${username}`}
            title={lang === 'english' ? `Delete account ${username}` : `删除账号 ${username}`}
          >
            ×
          </button>
        )}
      </div>

      {onDeleteAccount && confirmDelete && (
        <div className="mt-2 rounded-md border border-border bg-background p-3">
          <div className="text-sm text-text">
            {lang === 'english' ? `Delete local data for ${username}?` : `确认删除账号 ${username} 的本地数据？`}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-text hover:border-primary"
            >
              {lang === 'english' ? 'Cancel' : '取消'}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(false)
                onDeleteAccount()
              }}
              className="rounded-md bg-[var(--color-error)] px-2.5 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              {lang === 'english' ? 'Confirm delete' : '确认删除'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProfilePanel
