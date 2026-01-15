import React, { useState } from 'react'
import { theme } from '../../styles/theme'
import type { UserProfile } from '../../types'

interface ProfilePanelProps {
  profile: UserProfile | null
  onUpdate: (profile: Partial<UserProfile>) => void
  onLogout: () => void
}

const ProfilePanel: React.FC<ProfilePanelProps> = ({ profile, onUpdate, onLogout }) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [newTag, setNewTag] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  
  // 贡献偏好相关状态
  const [selectedPreferences, setSelectedPreferences] = useState<string[]>(profile?.preferences || [])
  const [showPreferenceSelector, setShowPreferenceSelector] = useState(false)

  const validateTag = (tag: string): boolean => {
    const cleanTag = tag.replace(/^\[+|\]+$/g, '').trim()
    return /^[a-zA-Z0-9_]+$/.test(cleanTag) && cleanTag.length > 0
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
    if (validateTag(cleanedValue)) {
      const newSkills = [...(profile?.skills || [])]
      newSkills[index] = cleanedValue
      onUpdate({ skills: newSkills })
      setEditingIndex(null)
      setEditValue('')
    }
  }

  const handleDelete = (index: number) => {
    const newSkills = [...(profile?.skills || [])]
    newSkills.splice(index, 1)
    onUpdate({ skills: newSkills })
  }

  const handleAdd = () => {
    const cleanedTag = cleanTag(newTag)
    if (validateTag(cleanedTag)) {
      const newSkills = [...(profile?.skills || []), cleanedTag]
      onUpdate({ skills: newSkills })
      setNewTag('')
      setIsAdding(false)
    }
  }

  // 贡献偏好类型映射
  const preferenceTypes = {
    "bug_fix": { label: "Bug修复", description: "喜欢修复代码错误和缺陷" },
    "feature": { label: "功能开发", description: "喜欢开发新功能和特性" },
    "docs": { label: "文档编写", description: "喜欢完善项目文档和说明" },
    "community": { label: "社区建设", description: "喜欢回答问题和帮助他人" },
    "review": { label: "代码审查", description: "喜欢审查代码质量" },
    "test": { label: "测试编写", description: "喜欢编写测试用例" }
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

  return (
    <div style={{
      padding: '20px',
      minWidth: '300px'
    }}>
      <h3 style={{
        margin: '0 0 16px 0',
        fontSize: '16px',
        color: theme.text,
        fontWeight: 600
      }}>
        个人信息
      </h3>

      {/* 技能标签部分 */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          marginBottom: '12px',
          fontSize: '14px',
          color: theme.text,
          fontWeight: 500
        }}>
          技能标签
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '12px'
        }}>
          {(profile?.skills || []).map((skill, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                backgroundColor: theme.primaryLight,
                borderRadius: '16px',
                fontSize: '13px'
              }}
            >
              {editingIndex === index ? (
                <>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleSave(index)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSave(index)
                      } else if (e.key === 'Escape') {
                        setEditingIndex(null)
                      }
                    }}
                    style={{
                      width: '80px',
                      padding: '2px 6px',
                      border: `1px solid ${validateTag(editValue) ? theme.primary : theme.error}`,
                      borderRadius: '4px',
                      fontSize: '12px',
                      outline: 'none'
                    }}
                    autoFocus
                  />
                  {!validateTag(editValue) && (
                    <span style={{
                      fontSize: '10px',
                      color: theme.error
                    }}>
                      仅字母/数字/下划线
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span
                    onDoubleClick={() => handleEdit(index, skill)}
                    style={{
                      cursor: 'pointer',
                      color: theme.text
                    }}
                  >
                    {cleanTag(skill)}
                  </span>
                  <button
                    onClick={() => handleDelete(index)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: theme.text,
                      fontSize: '14px',
                      padding: '0 4px',
                      lineHeight: 1
                    }}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {isAdding ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAdd()
                } else if (e.key === 'Escape') {
                  setIsAdding(false)
                  setNewTag('')
                }
              }}
              placeholder="输入标签"
              style={{
                flex: 1,
                padding: '6px 12px',
                border: `1px solid ${validateTag(newTag) ? theme.primary : theme.error}`,
                borderRadius: '16px',
                fontSize: '13px',
                outline: 'none'
              }}
              autoFocus
            />
            <button
              onClick={handleAdd}
              style={{
                padding: '6px 12px',
                backgroundColor: theme.primary,
                color: theme.white,
                border: 'none',
                borderRadius: '16px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              确认
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            style={{
              padding: '6px 12px',
              backgroundColor: theme.background,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: '16px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            + 新增标签
          </button>
        )}
      </div>

      {/* 贡献偏好部分 */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          marginBottom: '12px',
          fontSize: '14px',
          color: theme.text,
          fontWeight: 500
        }}>
          贡献偏好
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '12px'
        }}>
          {selectedPreferences.map((preference, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                backgroundColor: theme.primary,
                color: theme.white,
                borderRadius: '16px',
                fontSize: '13px'
              }}
            >
              <span>{preferenceTypes[preference as keyof typeof preferenceTypes]?.label || preference}</span>
              <button
                onClick={() => handleDeletePreference(preference)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: theme.white,
                  fontSize: '14px',
                  padding: '0 4px',
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {showPreferenceSelector ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            marginBottom: '12px'
          }}>
            {Object.entries(preferenceTypes).map(([key, pref]) => (
              <div
                key={key}
                onClick={() => handleTogglePreference(key)}
                style={{
                  padding: '8px',
                  border: selectedPreferences.includes(key) 
                    ? `2px solid ${theme.primary}` 
                    : `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  backgroundColor: selectedPreferences.includes(key) 
                    ? `${theme.primary}20` 
                    : theme.white,
                  fontSize: '12px'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{pref.label}</div>
                <div style={{ fontSize: '11px', color: theme.textSecondary }}>{pref.description}</div>
              </div>
            ))}
          </div>
        ) : (
          <button
            onClick={() => setShowPreferenceSelector(true)}
            style={{
              padding: '6px 12px',
              backgroundColor: theme.background,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: '16px',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            + 选择偏好
          </button>
        )}

        {showPreferenceSelector && (
          <button
            onClick={() => setShowPreferenceSelector(false)}
            style={{
              padding: '6px 12px',
              backgroundColor: theme.background,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: '16px',
              cursor: 'pointer',
              fontSize: '12px',
              marginLeft: '8px'
            }}
          >
            完成选择
          </button>
        )}
      </div>

      <button
        onClick={onLogout}
        style={{
          width: '100%',
          padding: '10px',
          backgroundColor: theme.background,
          color: theme.text,
          border: `1px solid ${theme.border}`,
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          marginTop: '20px'
        }}
      >
        注销
      </button>
    </div>
  )
}

export default ProfilePanel