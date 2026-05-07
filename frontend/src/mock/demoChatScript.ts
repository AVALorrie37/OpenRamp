import type { ChatResponse } from '../types'

export type ScriptStage = {
  delayMs: number
  stage: string
  data?: Record<string, unknown>
}

export type DemoScriptTurn = {
  /** User message must equal this (trim) to advance the scripted demo */
  expectedUserText: string
  stages: ScriptStage[]
  response: Omit<ChatResponse, 'session_id'> & { session_id?: string }
}

function sessionKey(userId: string) {
  return `openramp.mock_chat_step:${userId}`
}

export function getMockChatStep(userId: string): number {
  if (!userId) return 0
  try {
    const v = sessionStorage.getItem(sessionKey(userId))
    const n = parseInt(v || '0', 10)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

export function setMockChatStep(userId: string, step: number) {
  if (!userId) return
  try {
    sessionStorage.setItem(sessionKey(userId), String(step))
  } catch {}
}

export function resetMockChatStep(userId: string | null) {
  if (!userId) return
  try {
    sessionStorage.removeItem(sessionKey(userId))
  } catch {}
}

export function getScriptTurns(lang: 'chinese' | 'english'): DemoScriptTurn[] {
  if (lang === 'english') {
    return [
      {
        expectedUserText:
          "I'm comfortable with Python and React and I'd like to contribute through documentation and bug fixes.",
        stages: [
          { delayMs: 260, stage: 'intent_recognizing' },
          { delayMs: 300, stage: 'search_intent_mining' },
          { delayMs: 260, stage: 'intent_done', data: { next: 'generating_reply' } },
          { delayMs: 380, stage: 'generating_reply' }
        ],
        response: {
          reply:
            'Thanks — I have your stack and interests. I recorded skills as Python and React, with preferences for documentation and bug fixes.',
          status: 'collecting',
          skills: ['Python', 'React'],
          preferences: ['docs', 'bug_fix'],
          action: 'NONE',
          confirmed: false,
          profile_updated: true
        }
      },
      {
        expectedUserText: 'Search matching projects',
        stages: [
          { delayMs: 240, stage: 'intent_recognizing' },
          { delayMs: 280, stage: 'intent_done', data: { next: 'generating_reply' } },
          { delayMs: 360, stage: 'generating_reply' }
        ],
        response: {
          reply: 'Starting a project search based on your profile.',
          status: 'collecting',
          skills: ['Python', 'React'],
          preferences: ['docs', 'bug_fix'],
          action: 'SEARCH_PROJECTS',
          confirmed: false,
          profile_updated: false
        }
      }
    ]
  }
  return [
    {
      expectedUserText: '我熟悉 Python 和 React，希望参与文档与 bug 修复类的贡献。',
      stages: [
        { delayMs: 280, stage: 'intent_recognizing' },
        { delayMs: 320, stage: 'search_intent_mining' },
        { delayMs: 280, stage: 'intent_done', data: { next: 'generating_reply' } },
        { delayMs: 400, stage: 'generating_reply' }
      ],
      response: {
        reply:
          '很好，已了解你的技术栈与兴趣方向。我已将你的技能记为 Python、React，贡献偏好为文档与 Bug 修复。',
        status: 'collecting',
        skills: ['Python', 'React'],
        preferences: ['docs', 'bug_fix'],
        action: 'NONE',
        confirmed: false,
        profile_updated: true
      }
    },
    {
      expectedUserText: '搜索匹配项目',
      stages: [
        { delayMs: 260, stage: 'intent_recognizing' },
        { delayMs: 300, stage: 'intent_done', data: { next: 'generating_reply' } },
        { delayMs: 380, stage: 'generating_reply' }
      ],
      response: {
        reply: '好的，我将根据你的画像发起项目搜索。',
        status: 'collecting',
        skills: ['Python', 'React'],
        preferences: ['docs', 'bug_fix'],
        action: 'SEARCH_PROJECTS',
        confirmed: false,
        profile_updated: false
      }
    }
  ]
}

export function peekNextMockComposePrefill(userId: string, lang: 'chinese' | 'english'): string | null {
  if (!userId) return null
  const turns = getScriptTurns(lang)
  const step = getMockChatStep(userId)
  if (step >= turns.length) return null
  return turns[step].expectedUserText
}
