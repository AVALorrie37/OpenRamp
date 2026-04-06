import React, { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'

export interface ProfileSkillsEditorProps {
  skills: string[]
  onChange: (skills: string[]) => void
  language: 'chinese' | 'english'
  compact?: boolean
  disabled?: boolean
}

const ProfileSkillsEditor: React.FC<ProfileSkillsEditorProps> = ({
  skills,
  onChange,
  language,
  compact = false,
  disabled = false
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newTag, setNewTag] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)
  const addTagInputRef = useRef<HTMLInputElement>(null)
  const addTagContainerRef = useRef<HTMLDivElement>(null)

  const cleanTag = (tag: string): string =>
    tag.replace(/^\[+/, '').replace(/\]+$/, '').trim()

  const validateTag = (tag: string, excludeIndex?: number): { isValid: boolean; error: string | null } => {
    const cleanTagVal = tag.replace(/^\[+|\]+$/g, '').trim()
    if (!cleanTagVal) {
      return { isValid: false, error: language === 'english' ? 'Tag cannot be empty' : '标签不能为空' }
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanTagVal)) {
      return {
        isValid: false,
        error: language === 'english' ? 'Only letters, numbers and underscores are allowed' : '仅允许字母、数字和下划线'
      }
    }
    if (cleanTagVal.length > 20) {
      return {
        isValid: false,
        error: language === 'english' ? 'Tag length cannot exceed 20 characters' : '标签长度不能超过20个字符'
      }
    }
    const others = skills.filter((_, i) => i !== excludeIndex)
    if (others.includes(cleanTagVal)) {
      return { isValid: false, error: language === 'english' ? 'Tag already exists' : '该标签已存在' }
    }
    return { isValid: true, error: null }
  }

  const handleSave = (index: number) => {
    const cleanedValue = cleanTag(editValue)
    const validation = validateTag(cleanedValue, index)
    if (!validation.isValid) {
      setTagError(validation.error)
      return
    }
    const next = [...skills]
    next[index] = cleanedValue
    onChange(next)
    setEditingIndex(null)
    setEditValue('')
    setTagError(null)
  }

  const handleDelete = (index: number) => {
    const next = [...skills]
    next.splice(index, 1)
    onChange(next)
  }

  const handleAdd = () => {
    const cleanedTag = cleanTag(newTag)
    const validation = validateTag(cleanedTag)
    if (validation.isValid) {
      onChange([...skills, cleanedTag])
      setNewTag('')
      setIsAdding(false)
      setTagError(null)
    } else {
      setTagError(validation.error)
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isAdding && addTagContainerRef.current && !addTagContainerRef.current.contains(event.target as Node)) {
        setIsAdding(false)
        setNewTag('')
        setTagError(null)
      }
    }
    if (isAdding) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isAdding])

  const btnClass = compact
    ? 'rounded-md border border-border bg-background px-2 py-1 text-[11px] text-text hover:border-primary'
    : 'rounded-full border border-border bg-background px-3 py-1.5 text-xs text-text hover:border-primary hover:bg-primaryLight/40'

  return (
    <div className={compact ? 'mt-2' : 'mb-5'}>
      <div className={`mb-2 ${compact ? 'text-xs' : 'text-base'} font-medium text-text`}>
        {language === 'english' ? 'Skill tags' : '技能标签'}
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {skills.map((skill, index) => (
          <div
            key={`${skill}-${index}`}
            className="flex items-center gap-1 rounded-full bg-[var(--emphasis-fill-bg)] px-2 py-1 text-xs font-medium text-[var(--emphasis-fill-text)]"
          >
            {editingIndex === index ? (
              <>
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => {
                    setEditValue(e.target.value)
                    const v = cleanTag(e.target.value)
                    setTagError(v ? validateTag(v, index).error : null)
                  }}
                  onBlur={() => handleSave(index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave(index)
                    else if (e.key === 'Escape') {
                      setEditingIndex(null)
                      setEditValue('')
                      setTagError(null)
                    }
                  }}
                  className={`w-20 rounded border bg-surface px-1 py-0.5 text-xs text-text outline-none ${tagError ? 'border-error' : 'border-primary'}`}
                  autoFocus
                />
                {tagError && <span className="text-[10px] text-error">{tagError}</span>}
              </>
            ) : (
              <>
                <span
                  onDoubleClick={
                    disabled
                      ? undefined
                      : () => {
                          setEditingIndex(index)
                          setEditValue(cleanTag(skill))
                        }
                  }
                  className={disabled ? '' : 'cursor-pointer'}
                >
                  {cleanTag(skill)}
                </span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleDelete(index)}
                    className="bg-transparent px-0.5 text-[var(--emphasis-fill-text)]/90 hover:text-[var(--emphasis-fill-text)]"
                    aria-label="Remove"
                  >
                    <X size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <div ref={addTagContainerRef}>
        {disabled ? null : isAdding ? (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={addTagInputRef}
                type="text"
                value={newTag}
                onChange={(e) => {
                  setNewTag(e.target.value)
                  const v = cleanTag(e.target.value)
                  setTagError(v ? validateTag(v).error : null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd()
                  else if (e.key === 'Escape') {
                    setIsAdding(false)
                    setNewTag('')
                    setTagError(null)
                  }
                }}
                placeholder={language === 'english' ? 'Enter tag' : '输入标签'}
                className={`min-w-[120px] rounded border bg-surface px-2 py-1 text-xs outline-none ${tagError ? 'border-error' : 'border-primary'}`}
                autoFocus
              />
              <button
                type="button"
                onClick={handleAdd}
                className="rounded bg-primary px-2 py-1 text-xs text-white hover:bg-primaryDark"
              >
                {language === 'english' ? 'Add' : '添加'}
              </button>
            </div>
            {tagError && <span className="text-xs text-error">{tagError}</span>}
          </div>
        ) : (
          <button type="button" onClick={() => setIsAdding(true)} className={btnClass}>
            {language === 'english' ? '+ Add tag' : '+ 新增标签'}
          </button>
        )}
      </div>
    </div>
  )
}

export default ProfileSkillsEditor
