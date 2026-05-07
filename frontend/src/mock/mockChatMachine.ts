import type { ChatResponse } from '../types'
import {
  getMockChatStep,
  getScriptTurns,
  setMockChatStep
} from './demoChatScript'

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function denyCustomChat(lang: 'chinese' | 'english'): ChatResponse {
  if (lang === 'english') {
    return {
      reply:
        'This static demo cannot run a real AI on custom messages. To chat freely with the assistant, run the project locally or deploy the full stack (see the repository README). You can still use the suggested text in the input box unchanged to walk through the scripted demo.',
      status: 'collecting',
      skills: [],
      preferences: [],
      action: 'NONE',
      confirmed: false,
      profile_updated: false
    }
  }
  return {
    reply:
      '当前为纯前端演示环境，无法对自定义内容调用真实 AI。若要自由对话，请在本地或服务器部署完整项目（见仓库 README）。你仍可直接发送输入框内未改动的示范文案，按步骤体验脚本演示。',
    status: 'collecting',
    skills: [],
    preferences: [],
    action: 'NONE',
    confirmed: false,
    profile_updated: false
  }
}

export async function runMockChatSend(
  user_id: string,
  content: string,
  language: string | undefined,
  session_id: string | undefined,
  onStage: ((stage: string, data: Record<string, unknown>) => void) | undefined,
  skipIntent: boolean | undefined
): Promise<ChatResponse> {
  const lang: 'chinese' | 'english' = language === 'english' ? 'english' : 'chinese'

  if (skipIntent) {
    const sid = session_id || `${user_id}_agent1_${Date.now()}`
    return { ...denyCustomChat(lang), session_id: sid }
  }

  const normalized = content.trim()
  const turns = getScriptTurns(lang)
  const step = getMockChatStep(user_id)
  const turn = turns[step]

  if (!turn || normalized !== turn.expectedUserText.trim()) {
    const sid = session_id || `${user_id}_agent1_${Date.now()}`
    return { ...denyCustomChat(lang), session_id: sid }
  }

  for (const s of turn.stages) {
    await delay(s.delayMs)
    onStage?.(s.stage, s.data ?? {})
  }

  const sid = session_id || `${user_id}_agent1_${Date.now()}`
  setMockChatStep(user_id, step + 1)
  return {
    ...turn.response,
    session_id: sid,
    skills: [...(turn.response.skills || [])],
    preferences: [...(turn.response.preferences || [])]
  }
}
