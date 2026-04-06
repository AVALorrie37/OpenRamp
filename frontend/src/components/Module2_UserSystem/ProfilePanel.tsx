import React, { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import type { UserProfile } from '../../types'

interface ProfilePanelProps {
  profile: UserProfile | null
  uiLanguage: 'chinese' | 'english'
  onUpdate: (profile: Partial<UserProfile>) => void
  onLogout: () => void
}

const ProfilePanel: React.FC<ProfilePanelProps> = ({ profile, uiLanguage, onUpdate, onLogout }) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newTag, setNewTag] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)
  const lang: 'chinese' | 'english' = uiLanguage
  
  // 贡献偏好相关状态
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>(profile?.preferences || [])
  const [showPreferenceSelector, setShowPreferenceSelector] = useState(false)

  // 引用添加标签的输入框和偏好选择器
  const addTagInputRef = useRef<HTMLInputElement>(null)
  const addTagContainerRef = useRef<HTMLDivElement>(null)
  const preferenceSelectorRef = useRef<HTMLDivElement>(null)

  // 验证标签格式
  const validateTag = (tag: string): { isValid: boolean; error: string | null } => {
    const cleanTag = tag.replace(/^\[+|\]+$/g, '').trim()
    
    if (!cleanTag) {
      return { isValid: false, error: lang === 'english' ? 'Tag cannot be empty' : '标签不能为空' }
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(cleanTag)) {
      return { isValid: false, error: lang === 'english' ? 'Only letters, numbers and underscores are allowed' : '仅允许字母、数字和下划线' }
    }
    
    if (cleanTag.length > 20) {
      return { isValid: false, error: lang === 'english' ? 'Tag length cannot exceed 20 characters' : '标签长度不能超过20个字符' }
    }
    
    if ((profile?.skills || []).includes(cleanTag)) {
      return { isValid: false, error: lang === 'english' ? 'Tag already exists' : '该标签已存在' }
    }
    
    return { isValid: true, error: null }
  }

  const cleanTag = (tag: string): string => {
    return tag.replace(/^\[+/, '')
              .replace(/\]+$/, '')
              .trim()
  }

  const handleEdit = (index: number, currentValue: string) => {
    setEditingIndex(index)
    setEditValue(cleanTag(currentValue))
  }

  const handleSave = (index: number) => {
    const cleanedValue = cleanTag(editValue)
    const validation = validateTag(cleanedValue)
    
    if (validation.isValid) {
      const newSkills = [...(profile?.skills || [])]
      newSkills[index] = cleanedValue
      onUpdate({ skills: newSkills })
      setEditingIndex(null)
      setEditValue('')
      setTagError(null)
    } else {
      setTagError(validation.error)
    }
  }

  const handleDelete = (index: number) => {
    const newSkills = [...(profile?.skills || [])]
    newSkills.splice(index, 1)
    onUpdate({ skills: newSkills })
  }

  const handleAdd = () => {
    const cleanedTag = cleanTag(newTag)
    const validation = validateTag(cleanedTag)
    
    if (validation.isValid) {
      const newSkills = [...(profile?.skills || []), cleanedTag]
      onUpdate({ skills: newSkills })
      setNewTag('')
      setIsAdding(false)
      setTagError(null)
    } else {
      setTagError(validation.error)
    }
  }

  // 点击外部关闭添加标签输入框
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isAdding && addTagContainerRef.current && !addTagContainerRef.current.contains(event.target as Node)) {
        setIsAdding(false)
        setNewTag('')
        setTagError(null)
      }
    }

    if (isAdding) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isAdding])

  // 点击外部关闭偏好选择器
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showPreferenceSelector && preferenceSelectorRef.current && !preferenceSelectorRef.current.contains(event.target as Node)) {
        setShowPreferenceSelector(false)
      }
    }

    if (showPreferenceSelector) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showPreferenceSelector])

  // 贡献偏好类型映射
  const preferenceTypes = lang === 'english'
    ? {
      bug_fix: { label: 'Bug fixes', description: 'Like fixing code errors and defects' },
      feature: { label: 'Feature development', description: 'Like developing new features' },
      docs: { label: 'Documentation', description: 'Like improving project docs' },
      community: { label: 'Community', description: 'Like answering questions and helping others' },
      review: { label: 'Code review', description: 'Like reviewing code quality' },
      test: { label: 'Testing', description: 'Like writing test cases' }
    }
    : {
      bug_fix: { label: 'Bug修复', description: '喜欢修复代码错误和缺陷' },
      feature: { label: '功能开发', description: '喜欢开发新功能和特性' },
      docs: { label: '文档编写', description: '喜欢完善项目文档和说明' },
      community: { label: '社区建设', description: '喜欢回答问题和帮助他人' },
      review: { label: '代码审查', description: '喜欢审查代码质量' },
      test: { label: '测试编写', description: '喜欢编写测试用例' }
    }

  const handleTogglePreference = (preference: string) => {
    const newPreferences = selectedPreferences.includes(preference)
      ? selectedPreferences.filter(p => p !== preference)
      : [...selectedPreferences, preference]
    
    setSelectedPreferences(newPreferences)
    onUpdate({ preferences: newPreferences })
  }

  const handleDeletePreference = (preference: string) => {
    const newPreferences = selectedPreferences.filter(p => p !== preference)
    setSelectedPreferences(newPreferences)
    onUpdate({ preferences: newPreferences })
  }

  // 编辑标签时的错误处理
  const handleEditInputChange = (value: string) => {
    setEditValue(value)
    // 实时验证编辑输入
    const cleanedValue = cleanTag(value)
    if (cleanedValue) {
      const validation = validateTag(cleanedValue)
      setTagError(validation.error)
    } else {
      setTagError(null)
    }
  }

  // 添加标签时的错误处理
  const handleAddInputChange = (value: string) => {
    setNewTag(value)
    // 实时验证添加输入
    const cleanedValue = cleanTag(value)
    if (cleanedValue) {
      const validation = validateTag(cleanedValue)
      setTagError(validation.error)
    } else {
      setTagError(null)
    }
  }

  return (
    <div className="min-w-[300px] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="m-0 text-lg font-semibold text-text">
          {lang === 'english' ? 'Profile' : '个人信息'}
        </h3>
        <div>
          <button
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

      {/* 技能标签部分 */}
      <div className="mb-5">
        <div className="mb-3 text-base font-medium text-text">
          {lang === 'english' ? 'Skill tags' : '技能标签'}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {(profile?.skills || []).map((skill, index) => (
            <div
              key={index}
              className="flex items-center gap-1 rounded-full bg-[var(--emphasis-fill-bg)] px-3 py-1.5 text-sm font-medium text-[var(--emphasis-fill-text)]"
            >
              {editingIndex === index ? (
                <>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => handleEditInputChange(e.target.value)}
                    onBlur={() => handleSave(index)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSave(index)
                      } else if (e.key === 'Escape') {
                        setEditingIndex(null)
                        setEditValue('')
                        setTagError(null)
                      }
                    }}
                    className={`w-20 rounded border bg-surface px-2 py-0.5 text-xs text-text outline-none ${tagError ? 'border-error' : 'border-primary'}`}
                    autoFocus
                  />
                  {tagError && (
                    <span className="text-[10px] text-error">
                      {tagError}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span
                    onDoubleClick={() => handleEdit(index, skill)}
                    className="cursor-pointer text-[var(--emphasis-fill-text)]"
                  >
                    {cleanTag(skill)}
                  </span>
                  <button
                    onClick={() => handleDelete(index)}
                    className="bg-transparent px-1 text-base leading-none text-[var(--emphasis-fill-text)]/90 hover:text-[var(--emphasis-fill-text)]"
                    aria-label="Remove"
                  >
                    <X size={16} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div ref={addTagContainerRef}>
          {isAdding ? (
            <div className="flex flex-col items-start gap-1">
              <div className="flex items-center gap-2">
                <input
                  ref={addTagInputRef}
                  type="text"
                  value={newTag}
                  onChange={(e) => handleAddInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAdd()
                    } else if (e.key === 'Escape') {
                      setIsAdding(false)
                      setNewTag('')
                      setTagError(null)
                    }
                  }}
                  placeholder={lang === 'english' ? 'Enter tag' : '输入标签'}
                  className={`flex-1 rounded-full border bg-surface px-3 py-1.5 text-sm outline-none ${tagError ? 'border-error' : 'border-primary'}`}
                  autoFocus
                />
                <button
                  onClick={handleAdd}
                  className="rounded-full bg-primary px-3 py-1.5 text-xs text-white hover:bg-primaryDark"
                >
                  {lang === 'english' ? 'Confirm' : '确认'}
                </button>
              </div>
              {tagError && (
                <span className="ml-1 text-xs text-error">
                  {tagError}
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-text hover:border-primary hover:bg-primaryLight/40"
            >
              {lang === 'english' ? '+ Add tag' : '+ 新增标签'}
            </button>
          )}
        </div>
      </div>

      {/* 贡献偏好部分 */}
      <div className="mb-5">
        <div className="mb-3 text-base font-medium text-text">
          {lang === 'english' ? 'Contribution preferences' : '贡献偏好'}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {selectedPreferences.map((preference, index) => (
            <div
              key={index}
              className="flex items-center gap-1 rounded-full bg-[var(--emphasis-fill-bg)] px-3 py-1.5 text-sm font-medium text-[var(--emphasis-fill-text)]"
            >
              <span>{preferenceTypes[preference as keyof typeof preferenceTypes]?.label || preference}</span>
              <button
                onClick={() => handleDeletePreference(preference)}
                className="bg-transparent px-1 text-base leading-none text-[var(--emphasis-fill-text)]/90 hover:text-[var(--emphasis-fill-text)]"
                aria-label="Remove"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>

        <div ref={preferenceSelectorRef}>
          {showPreferenceSelector ? (
            <div className="mb-3 grid grid-cols-2 gap-2">
              {Object.entries(preferenceTypes).map(([key, pref]) => (
                <div
                  key={key}
                  onClick={() => handleTogglePreference(key)}
                  className={`cursor-pointer rounded-md bg-surface p-2 text-xs ${
                    selectedPreferences.includes(key) ? 'border-2 border-primary bg-primary/10' : 'border border-border'
                  }`}
                >
                  <div className="mb-1 font-bold text-[var(--emphasis-fill-bg)]">{pref.label}</div>
                  <div className="text-xs text-text/70">{pref.description}</div>
                </div>
              ))}
            </div>
          ) : (
            <button
              onClick={() => setShowPreferenceSelector(true)}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-text hover:border-primary hover:bg-primaryLight/40"
            >
              {lang === 'english' ? '+ Choose preferences' : '+ 选择偏好'}
            </button>
          )}

          {showPreferenceSelector && (
            <button
              onClick={() => setShowPreferenceSelector(false)}
              className="ml-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-text hover:border-primary hover:bg-primaryLight/40"
            >
              {lang === 'english' ? 'Done' : '完成选择'}
            </button>
          )}
        </div>
      </div>

      <button
        onClick={onLogout}
        className="mt-5 w-full rounded-md border border-border bg-background px-3 py-2.5 text-base text-text hover:border-primary hover:bg-primaryLight/40"
      >
        {lang === 'english' ? 'Logout' : '注销'}
      </button>
    </div>
  )
}

export default ProfilePanel