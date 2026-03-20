"""Agent1 主控制器 - 交互协调员"""
import re
import json
import hashlib
import logging
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, Callable
from .provider import OllamaProvider
from .prompts import PromptManager
from .utils import validate_and_parse, extract_json_from_response

logger = logging.getLogger(__name__)

class ConversationHandler:
    """Agent1：交互协调员"""
    
    def __init__(self, user_id: str = None, user_language: str = 'chinese'):
        self.provider = OllamaProvider()
        self.prompt_manager = PromptManager()
        self.profile_parser = ProfileParser()
        self.user_id = user_id
        self.user_language = user_language  # 用户设置的语言偏好，默认中文
        
        self.conversation_history = []
        self.historical_summary = ''
        self.query_summary_memory = ''
        self.current_profile = {
            'skills': [],
            'contribution_styles': []
        }
        self.previous_profile = {
            'skills': [],
            'contribution_styles': []
        }
        self.conversation_stage = 'greeting'
        
        # 设置缓存目录
        current_file = Path(__file__)
        core_dir = current_file.parent.parent
        data_layer_dir = core_dir.parent / "data_layer"
        self._cache_dir = data_layer_dir / "data" / "profile_cache"
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        
        # 如果有user_id，尝试加载缓存的画像
        if self.user_id:
            cached = self._load_profile_from_cache()
            if cached:
                self.current_profile = {
                    'skills': cached.get('skills', []),
                    'contribution_styles': cached.get('contribution_styles', [])
                }
                self.previous_profile = {
                    'skills': cached.get('previous_skills', []),
                    'contribution_styles': cached.get('previous_contribution_styles', [])
                }
                self.conversation_history = cached.get('conversation_history', [])
                self.historical_summary = cached.get('historical_summary', '')
                self.query_summary_memory = cached.get('query_summary_memory', '')
                # 如果缓存中有language设置，使用它（除非初始化时明确指定了）
                if cached.get('language') and user_language == 'chinese':
                    self.user_language = cached.get('language')
    
    def get_initial_greeting(self, language_hint: str = None) -> str:
        """获取初始问候语（可固定返回给前端）"""
        language = language_hint or self.user_language
        if language == 'chinese' or language == 'auto':
            return "👋 你好！我是开源社区助手，帮你找到最适合贡献的开源项目。先聊聊你的技术背景吧～"
        else:
            return "👋 Hi! I'm your open source assistant, helping you find suitable projects to contribute to. Let's talk about your technical background～"
    
    def _intent_keyword_fast_path(self, user_input: str) -> Optional[str]:
        """Keyword-based fast path for intent; returns intent or None if no match."""
        if not user_input or not user_input.strip():
            return 'irrelevant'
        t = user_input.strip()
        lower = t.lower()
        # query_status
        if any(k in t for k in ('我的技能', '我的信息', '当前画像', '现在的技能', '我的偏好')):
            return 'query_status'
        if any(k in lower for k in ('show my profile', 'my skills', 'current profile')):
            return 'query_status'
        # search_repo
        if any(k in t for k in ('搜索', '找项目', '推荐项目', '推荐一些')):
            return 'search_repo'
        if any(k in lower for k in ('search', 'find', 'recommend', 'repo', 'repository', 'projects')):
            return 'search_repo'
        # update_profile：技能/偏好类信息
        if any(k in t for k in ('我擅长', '技术栈', '简历', '经历', '经验', '做过', '喜欢贡献', '偏好')):
            return 'update_profile'
        # 中文：“我会/我可以”及副词变体（我还会、我也可以、我都会、我也可以）
        if re.search(r'我\S*(还|也|很|都)?\S*会', t) or re.search(r'我\S*(还|也|都)?\S*可以', t):
            return 'update_profile'
        # 中文：“喜欢”及副词/否定（我还喜欢、我不喜欢…）
        if re.search(r'我\S*(还|也|很|非常)?\S*喜欢', t) or re.search(r'我\S*不\S*喜欢', t):
            return 'update_profile'
        # 英文：I can / I will 及副词（I also can, I can also, I really will…）
        if any(re.search(p, lower) for p in (
            r'\bi\s+(also|really|still|quite)\s+can\b',
            r'\bi\s+can\s+also\b',
            r'\bi\s+(also|really|still)\s+will\b',
            r'\bi\s+(also|really|still|quite)\s+like\b',
            r'\bi\s+(also|really|still|quite)\s+enjoy\b',
            r"\bi\s+don't\s+like\b",
            r"\bi\s+do not\s+like\b",
            r'\bi\s+am\s+good\s+at\b',
        )):
            return 'update_profile'
        if any(k in lower for k in ('i can', 'i will', 'i know', 'my background', 'resume', 'experience')):
            return 'update_profile'
        # ask_content：问句类
        if any(k in t for k in ('怎么', '为什么', '如何', '什么', '哪个')):
            return 'ask_content'
        if any(k in lower for k in ('what is', 'how to', 'explain', 'help me understand', 'why ', 'which ')):
            return 'ask_content'
        return None

    def _recognize_intent(self, user_input: str) -> str:
        allowed = {'search_repo', 'update_profile', 'query_status', 'ask_content', 'irrelevant'}
        fast = self._intent_keyword_fast_path(user_input)
        if fast is not None:
            return fast
        try:
            system_prompt, _ = self.prompt_manager.get_agent_prompt('intent_recognizer', input_text=user_input)
            raw = self.provider.generate(
                prompt_template=user_input,
                variables={},
                system_prompt=system_prompt,
                temperature=0.0,
                max_tokens=32
            )
            json_str = extract_json_from_response(raw or '')
            if not json_str:
                return 'ask_content'
            data = json.loads(json_str)
            intent = (data.get('intent') or '').strip()
            return intent if intent in allowed else 'ask_content'
        except Exception:
            return 'ask_content'

    def _complete_ask_content_response(
        self,
        user_input: str,
        user_language: str,
        stage: Callable[[str, Optional[Dict[str, Any]]], None],
    ) -> Dict[str, Any]:
        profile_text = self._format_profile_for_agent1(self.current_profile, user_language)
        base_system_prompt, _ = self.prompt_manager.get_agent_prompt('conversation')
        system_prompt = self._inject_language_instruction(base_system_prompt, user_language)
        conversation_context = self._build_conversation_context()
        user_prompt = f"{conversation_context}\n\nCurrent Profile (from Agent2):\n{profile_text}\n\nUser: {user_input}"
        try:
            stage("generating_reply", {})
            ai_response = self.provider.generate(
                prompt_template=user_prompt,
                variables={},
                system_prompt=system_prompt,
                temperature=0.3
            )
        except Exception:
            cached = self._load_profile_from_cache()
            if cached:
                skills = cached.get('skills', [])
                styles = cached.get('contribution_styles', [])
                if user_language == 'chinese':
                    skills_txt = '、'.join(skills) if skills else '暂无'
                    styles_txt = '、'.join(styles) if styles else '暂无'
                    ai_response = f"根据你之前的画像信息（技能：{skills_txt}；贡献偏好：{styles_txt}），我暂时无法连接到 AI 服务，但仍然可以基于这些信息给你一些方向建议。"
                else:
                    skills_txt = ', '.join(skills) if skills else 'none'
                    styles_txt = ', '.join(styles) if styles else 'none'
                    ai_response = f"Based on your previous profile (skills: {skills_txt}; contribution preferences: {styles_txt}), I cannot reach the AI service right now but can still suggest directions using this information."
            else:
                ai_response = self._get_fallback_reply(user_input, user_language)

        reply, action, action_data = self._parse_conversation_response(ai_response, user_language)
        self.conversation_history.append({'role': 'assistant', 'content': reply})
        action_data.update({
            'skills': self.current_profile['skills'],
            'contribution_styles': self.current_profile['contribution_styles'],
            'profile_updated': False,
            'intent': 'ask_content'
        })
        if self.user_id:
            self._save_profile_to_cache()
        return {
            'reply': reply,
            'action': action,
            'data': action_data
        }

    def process_user_input(self, user_input: str, on_stage: Optional[Callable[[str, Dict[str, Any]], None]] = None, skip_intent: bool = False) -> Dict[str, Any]:
        def stage(name: str, data: Optional[Dict[str, Any]] = None):
            if on_stage:
                on_stage(name, data or {})

        user_language = self.user_language

        if skip_intent:
            self.conversation_history.append({'role': 'user', 'content': user_input})
            stage("intent_done", {"intent": "ask_content", "next": "generating_reply"})
            return self._complete_ask_content_response(user_input, user_language, stage)

        stage("intent_recognizing", {})
        intent = self._recognize_intent(user_input)
        user_action = self._detect_user_action(user_input)

        if intent == 'query_status' or self._is_query_intent(user_input, user_language):
            stage("intent_done", {"intent": intent, "next": "query_status"})
            result = self._handle_query_intent(user_language)
            result.setdefault('data', {}).update({'intent': 'query_status'})
            return result

        if intent == 'irrelevant':
            stage("intent_done", {"intent": intent, "next": "irrelevant"})
            reply = "我可能没太理解～如果你想找适合贡献的开源项目，可以告诉我你的技术栈和偏好。" if user_language == 'chinese' else "I might not have enough context—tell me your tech stack and preferences and I can recommend projects."
            return {
                'reply': reply,
                'action': 'REPLY',
                'data': {
                    'intent': 'irrelevant',
                    'skills': self.current_profile.get('skills', []),
                    'contribution_styles': self.current_profile.get('contribution_styles', []),
                    'profile_updated': False
                }
            }

        self.conversation_history.append({'role': 'user', 'content': user_input})

        if user_action == 'CONFIRM' and (self.current_profile.get('skills') or self.current_profile.get('contribution_styles')):
            stage("intent_done", {"intent": intent, "next": "confirm"})
            result = self._handle_confirm(user_language)
            result.setdefault('data', {}).update({'intent': intent})
            return result

        if intent == 'search_repo' or user_action == 'SEARCH':
            stage("intent_done", {"intent": intent, "next": "search_repo"})
            result = self._handle_search(user_language)
            self.conversation_history.append({'role': 'assistant', 'content': result['reply']})
            if self.user_id:
                self._save_profile_to_cache()
            result.setdefault('data', {}).update({'intent': 'search_repo'})
            return result

        stage("intent_done", {"intent": intent, "next": "generating_reply"})

        if intent == 'ask_content':
            return self._complete_ask_content_response(user_input, user_language, stage)

        if self._is_likely_question(user_input):
            profile_text = self._format_profile_for_agent1(self.current_profile, user_language)
            base_system_prompt, _ = self.prompt_manager.get_agent_prompt('conversation')
            system_prompt = self._inject_language_instruction(base_system_prompt, user_language)
            conversation_context = self._build_conversation_context()
            user_prompt = f"{conversation_context}\n\nCurrent Profile (from Agent2):\n{profile_text}\n\nUser: {user_input}"
            try:
                stage("generating_reply", {})
                ai_response = self.provider.generate(
                    prompt_template=user_prompt,
                    variables={},
                    system_prompt=system_prompt,
                    temperature=0.3
                )
            except Exception:
                cached = self._load_profile_from_cache()
                if cached:
                    skills = cached.get('skills', [])
                    styles = cached.get('contribution_styles', [])
                    if user_language == 'chinese':
                        skills_txt = '、'.join(skills) if skills else '暂无'
                        styles_txt = '、'.join(styles) if styles else '暂无'
                        ai_response = f"根据你之前的画像信息（技能：{skills_txt}；贡献偏好：{styles_txt}），我暂时无法连接到 AI 服务，但仍然可以基于这些信息回答你的问题。"
                    else:
                        skills_txt = ', '.join(skills) if skills else 'none'
                        styles_txt = ', '.join(styles) if styles else 'none'
                        ai_response = f"Based on your previous profile (skills: {skills_txt}; contribution preferences: {styles_txt}), I cannot reach the AI service right now but can still answer using this information."
                else:
                    ai_response = self._get_fallback_reply(user_input, user_language)
            reply, action, action_data = self._parse_conversation_response(ai_response, user_language)
            self.conversation_history.append({'role': 'assistant', 'content': reply})
            action_data.update({
                'skills': self.current_profile['skills'],
                'contribution_styles': self.current_profile['contribution_styles'],
                'profile_updated': False,
                'intent': intent
            })
            if self.user_id:
                self._save_profile_to_cache()
            return {
                'reply': reply,
                'action': action,
                'data': action_data
            }

        profile_changed = False
        if intent == 'update_profile':
            prev_profile = dict(self.current_profile)
            updated = self._update_profile_from_delta(user_input, user_language)
            profile_changed = updated and self._profile_changed(prev_profile, self.current_profile)
            self.previous_profile = dict(self.current_profile)

        stage("generating_reply", {})
        reply = self._format_rule_based_reply(user_language)
        action = 'REPLY'
        action_data = {}
        self.conversation_history.append({'role': 'assistant', 'content': reply})
        action_data.update({
            'skills': self.current_profile['skills'],
            'contribution_styles': self.current_profile['contribution_styles'],
            'profile_updated': profile_changed,
            'intent': intent if intent in ('update_profile', 'ask_content', 'search_repo') else 'update_profile'
        })
        if self.user_id:
            self._save_profile_to_cache()
        return {
            'reply': reply,
            'action': action,
            'data': action_data
        }
    
    def get_current_profile(self) -> Dict[str, Any]:
        """获取当前用户画像"""
        return self.current_profile
    
    def sync_profile_from_frontend(self, skills: list, preferences: list) -> None:
        self.current_profile = {
            'skills': skills,
            'contribution_styles': preferences
        }
        self.historical_summary = self._profile_to_synthetic_conversation(self.current_profile)
        profile_text = self._format_profile_for_agent1(self.current_profile, self.user_language)
        if self.user_language == 'chinese':
            sync_message = f"System: 用户已手动更新个人信息。{profile_text}"
        else:
            sync_message = f"System: User has manually updated profile. {profile_text}"
        found_system_message = False
        for i in range(len(self.conversation_history) - 1, -1, -1):
            if self.conversation_history[i].get('role') == 'system' or \
               (self.conversation_history[i].get('role') == 'assistant' and
                'System:' in self.conversation_history[i].get('content', '')):
                self.conversation_history[i] = {'role': 'system', 'content': sync_message}
                found_system_message = True
                break
        if not found_system_message:
            self.conversation_history.insert(0, {'role': 'system', 'content': sync_message})
        if self.user_id:
            self._save_profile_to_cache()

    def _profile_to_synthetic_conversation(self, profile: Dict) -> str:
        skills = profile.get('skills', [])
        styles = profile.get('contribution_styles', [])
        styles_map = {
            'bug_fix': '修复bug', 'feature': '开发新功能', 'docs': '编写文档',
            'community': '社区支持', 'review': '代码审查', 'test': '编写测试'
        }
        if self.user_language == 'chinese':
            skills_txt = '、'.join(skills) if skills else '暂无'
            styles_txt = '、'.join([styles_map.get(s, s) for s in styles]) if styles else '暂无'
            return f"User: 我的技能是{skills_txt}，贡献偏好是{styles_txt}。\nAssistant: 已记录。"
        else:
            skills_txt = ', '.join(skills) if skills else 'none'
            styles_map_en = {'bug_fix': 'bug fixes', 'feature': 'new features', 'docs': 'documentation',
                             'community': 'community support', 'review': 'code review', 'test': 'testing'}
            styles_txt = ', '.join([styles_map_en.get(s, s) for s in styles]) if styles else 'none'
            return f"User: My skills are {skills_txt}, contribution preferences are {styles_txt}.\nAssistant: Got it."
    
    def _build_conversation_summary(self) -> str:
        """构建对话总结（用于Agent2解析）"""
        if not self.conversation_history:
            return ""
        
        summary_lines = []
        for msg in self.conversation_history:
            role = "User" if msg['role'] == 'user' else "Assistant"
            summary_lines.append(f"{role}: {msg['content']}")
        
        return "\n".join(summary_lines)
    
    def _build_conversation_context(self) -> str:
        """构建对话历史上下文（用于Agent1）"""
        if not self.conversation_history:
            return ""
        
        context_lines = ["# Conversation History:"]
        for msg in self.conversation_history[-6:]:  # 只保留最近6条消息
            role = msg.get('role', 'user')
            if role == 'system':
                context_lines.append(f"System: {msg['content']}")
            elif role == 'user':
                context_lines.append(f"User: {msg['content']}")
            else:
                context_lines.append(f"Assistant: {msg['content']}")
        
        return "\n".join(context_lines) + "\n\nCurrent:"
    
    def _merge_profile_data(self, new_data: Dict, existing_data: Dict) -> Dict:
        """合并新的解析结果到现有数据（累积合并，去重）"""
        existing_skills = set(existing_data.get('skills', []))
        existing_styles = set(existing_data.get('contribution_styles', []))
        
        new_skills = set(new_data.get('skills', []))
        new_styles = set(new_data.get('contribution_styles', []))
        
        merged_skills = list(existing_skills | new_skills)
        merged_styles = list(existing_styles | new_styles)
        
        return {
            'skills': merged_skills,
            'contribution_styles': merged_styles
        }
    
    def _format_acknowledgment_reply(self, language: str) -> str:
        """根据当前画像生成确认式回复文案，保证与前端展示一致"""
        skills = self.current_profile.get('skills', [])
        styles = self.current_profile.get('contribution_styles', [])
        if language == 'chinese':
            skills_text = '、'.join(skills) if skills else '暂无'
            styles_map = {'bug_fix': '修复bug', 'feature': '开发新功能', 'docs': '编写文档',
                          'community': '社区支持', 'review': '代码审查', 'test': '编写测试'}
            styles_text = '、'.join([styles_map.get(s, s) for s in styles]) if styles else '暂无'
            return f"我了解到你的兴趣！你喜欢使用 {skills_text} 进行开发，你更喜欢 {styles_text}。确认无误吗？"
        else:
            skills_text = ', '.join(skills) if skills else 'none'
            styles_map = {'bug_fix': 'bug fixes', 'feature': 'new features', 'docs': 'documentation',
                          'community': 'community support', 'review': 'code review', 'test': 'testing'}
            styles_text = ', '.join([styles_map.get(s, s) for s in styles]) if styles else 'none'
            return f"I've noted your interests! You like using {skills_text} for development, and prefer {styles_text}. Does this look correct?"

    def _format_rule_based_reply(self, language: str) -> str:
        """规则回复：告知当前画像并给出建议"""
        skills = self.current_profile.get('skills', [])
        styles = self.current_profile.get('contribution_styles', [])
        styles_map = {'bug_fix': '修复bug', 'feature': '开发新功能', 'docs': '编写文档',
                      'community': '社区支持', 'review': '代码审查', 'test': '编写测试'}
        styles_map_en = {'bug_fix': 'bug fixes', 'feature': 'new features', 'docs': 'documentation',
                        'community': 'community support', 'review': 'code review', 'test': 'testing'}
        _, ask_type = self._should_ask_followup(self.current_profile)
        if language == 'chinese':
            skills_txt = '、'.join(skills) if skills else '暂无'
            styles_txt = '、'.join([styles_map.get(s, s) for s in styles]) if styles else '暂无'
            base = f"当前信息：技能{skills_txt}，贡献偏好{styles_txt}。"
            if ask_type == 'both_empty':
                return base + "建议补充技能和贡献偏好信息。"
            if ask_type == 'skills_empty':
                return base + "建议补充技能信息。"
            if ask_type == 'styles_empty':
                return base + "建议补充贡献偏好。"
            if ask_type == 'soft_ask':
                return base + "建议补充更多细节，或确认无误后开始搜索。"
            return base + "确认无误后可以开始搜索。"
        else:
            skills_txt = ', '.join(skills) if skills else 'none'
            styles_txt = ', '.join([styles_map_en.get(s, s) for s in styles]) if styles else 'none'
            base = f"Current info: skills {skills_txt}, contribution preferences {styles_txt}. "
            if ask_type == 'both_empty':
                return base + "Suggest adding skills and contribution preferences."
            if ask_type == 'skills_empty':
                return base + "Suggest adding skills."
            if ask_type == 'styles_empty':
                return base + "Suggest adding contribution preferences."
            if ask_type == 'soft_ask':
                return base + "Suggest adding more details, or start search when ready."
            return base + "Start search when confirmed."

    def _format_profile_for_agent1(self, profile: Dict, language: str) -> str:
        """将JSON结果转换为自然语言（用于Agent1理解）"""
        skills = profile.get('skills', [])
        styles = profile.get('contribution_styles', [])
        
        if language == 'chinese':
            skills_text = "、".join(skills) if skills else "暂无"
            styles_map = {
                'bug_fix': '修复bug',
                'feature': '开发新功能',
                'docs': '编写文档',
                'community': '社区支持',
                'review': '代码审查',
                'test': '编写测试'
            }
            styles_text = "、".join([styles_map.get(s, s) for s in styles]) if styles else "暂无"
            return f"技能：{skills_text}\n贡献偏好：{styles_text}"
        else:
            skills_text = ", ".join(skills) if skills else "none"
            styles_map = {
                'bug_fix': 'bug fixes',
                'feature': 'new features',
                'docs': 'documentation',
                'community': 'community support',
                'review': 'code review',
                'test': 'testing'
            }
            styles_text = ", ".join([styles_map.get(s, s) for s in styles]) if styles else "none"
            return f"Skills: {skills_text}\nContribution preferences: {styles_text}"
    
    def _should_ask_followup(self, profile: Dict) -> Tuple[bool, str]:
        """判断是否需要追问，返回(是否需要追问, 追问类型)"""
        skills = profile.get('skills', [])
        styles = profile.get('contribution_styles', [])
        
        if not skills and not styles:
            return True, 'both_empty'
        if not skills:
            return True, 'skills_empty'
        if not styles:
            return True, 'styles_empty'
        if len(skills) < 2:
            return True, 'soft_ask'  # 软询问只针对技能数量不足
        return False, 'ready_to_confirm'
    
    def set_user_language(self, language: str):
        """设置用户语言偏好"""
        if language in ['chinese', 'english']:
            self.user_language = language
    
    def _inject_language_instruction(self, system_prompt: str, language: str) -> str:
        """在系统提示词中注入语言指令"""
        language_map = {
            'chinese': '中文',
            'english': 'English'
        }
        lang_name = language_map.get(language, '中文')
        
        instruction = f"""## LANGUAGE PREFERENCE (CRITICAL - OVERRIDE ALL OTHER RULES)
- User's preferred language: {lang_name} ({language})
- You MUST ALWAYS respond in {lang_name} ONLY
- NEVER switch to English or any other language, even if Agent2 outputs English JSON
- Agent2's English JSON is standard format - convert it to {lang_name} when showing to user
- Maintain {lang_name} consistency throughout the entire conversation
- Ignore any English text from Agent2 - always present information in {lang_name} to the user

"""
        return instruction + system_prompt
    
    def _detect_language(self, text: str) -> str:
        """检测文本语言（保留用于兼容性，但不再在主要流程中使用）"""
        chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
        total_chars = len(text)
        
        if chinese_chars / max(total_chars, 1) > 0.3:
            return 'chinese'
        else:
            return 'english'
    
    def _detect_user_action(self, user_input: str) -> str:
        user_lower = user_input.lower()
        confirm_keywords = ["确认", "没问题", "对的", "正确", "ok", "yes", "确定", "好的", "可以", "confirm"]
        if any(kw in user_lower for kw in confirm_keywords):
            return 'CONFIRM'
        search_keywords = ["搜索", "找项目", "推荐", "search", "find", "recommend"]
        if any(kw in user_lower for kw in search_keywords):
            return 'SEARCH'
        return 'NONE'

    def _is_query_intent(self, user_input: str, language: str) -> bool:
        query_patterns = [
            r'我的技能|我的信息|显示.*技能|查看.*偏好|我有什么|告诉我|列出.*技能|列出.*偏好',
            r'技能.*什么|偏好.*什么|信息.*什么|现在的技能|当前的技能|我的偏好|我的贡献偏好',
            r'my skills|my profile|show me|what are my|tell me|list my',
            r'what.*skills|what.*preferences|what.*profile|current skills|my preferences|my contribution'
        ]
        lower_input = user_input.lower()
        return any(re.search(p, lower_input, re.I) or re.search(p, user_input) for p in query_patterns)

    def _is_likely_question(self, text: str) -> bool:
        """True if message looks like a question rather than profile info."""
        if not text or not text.strip():
            return False
        t = text.strip()
        lower = t.lower()
        if t.endswith('?') or t.endswith('？'):
            return True
        q_cn = ('怎么', '如何', '为什么', '什么', '哪个', '怎样', '能否', '会不会')
        q_en = ('what is', 'how to', 'why ', 'which ', 'explain', 'help me understand', 'can you', 'could you')
        if any(k in t for k in q_cn) or any(k in lower for k in q_en):
            return True
        return False

    def _handle_query_intent(self, language: str) -> Dict[str, Any]:
        profile_text = self._format_profile_for_agent1(self.current_profile, language)
        if language == 'chinese':
            reply = f"根据我们的对话，你目前的画像如下：\n{profile_text}"
        else:
            reply = f"Based on our conversation, your current profile:\n{profile_text}"
        if self.query_summary_memory.strip():
            self.query_summary_memory += "\n"
        self.query_summary_memory += f"User asked profile; Assistant showed current profile."
        if self.user_id:
            self._save_profile_to_cache()
        return {
            'reply': reply,
            'action': 'REPLY',
            'data': {
                'skills': self.current_profile['skills'],
                'contribution_styles': self.current_profile['contribution_styles'],
                'profile_updated': False
            }
        }

    def _get_recent_messages(self, n: int) -> list:
        return self.conversation_history[-n:] if self.conversation_history else []

    def _build_incremental_summary_input(self, recent_messages: list) -> str:
        lines = []
        if self.historical_summary.strip():
            lines.append(f"# Previous summary:\n{self.historical_summary}")
        if recent_messages:
            msg_lines = []
            for msg in recent_messages:
                if msg.get('role') == 'user':
                    msg_lines.append(f"User: {msg.get('content', '')}")
            if msg_lines:
                lines.append(f"\n# New messages (user only):\n" + "\n".join(msg_lines))
        return "\n".join(lines) if lines else ""

    def _summarize_conversation(self, combined_input: str) -> str:
        if not combined_input.strip():
            return ""
        # Only summarize when input is long enough; otherwise return as-is
        if len(combined_input) < 800:
            return combined_input
        try:
            system_prompt, _ = self.prompt_manager.get_agent_prompt('conversation_summarizer')
            result = self.provider.generate(
                prompt_template=combined_input,
                variables={},
                system_prompt=system_prompt,
                temperature=0.2,
                max_tokens=256
            )
            return result.strip() if result else combined_input
        except Exception as e:
            logger.warning(f"Summarizer failed: {e}, using raw input")
            return combined_input

    def _update_profile_from_delta(self, user_input: str, language: str) -> bool:
        """调用profile_delta Agent，根据本轮对话更新画像增量。"""
        try:
            profile_text = self._format_profile_for_agent1(self.current_profile, language)
            system_prompt, _ = self.prompt_manager.get_agent_prompt(
                'profile_delta',
                input_text=user_input
            )
            combined_input = (
                f"Current Profile:\n{profile_text}\n\n"
                f"User update:\n{user_input}"
            )
            raw = self.provider.generate(
                prompt_template=combined_input,
                variables={},
                system_prompt=system_prompt,
                temperature=0.0,
                max_tokens=256
            )
            json_str = extract_json_from_response(raw or '')
            if not json_str:
                logger.warning("[ProfileDelta] Empty or non-JSON response, skip update")
                return False
            try:
                delta = json.loads(json_str)
            except Exception as e:
                logger.warning(f"[ProfileDelta] JSON parse failed: {e}")
                return False
            return self._apply_profile_delta(delta)
        except Exception as e:
            logger.warning(f"[ProfileDelta] Failed to update profile from delta: {e}")
            return False

    def _apply_profile_delta(self, delta: Dict[str, Any]) -> bool:
        """根据diff结果增删技能与贡献偏好。"""
        if not isinstance(delta, dict):
            return False
        current_skills = list(self.current_profile.get('skills', []))
        current_styles = list(self.current_profile.get('contribution_styles', []))
        skills_set = {s for s in current_skills if isinstance(s, str) and s.strip()}
        styles_set = {s for s in current_styles if isinstance(s, str) and s.strip()}

        def _norm_skill(value: str) -> str:
            return value.strip().lower().replace(' ', '-') if isinstance(value, str) else ''

        def _norm_style(value: str) -> str:
            v = value.strip().lower() if isinstance(value, str) else ''
            return v

        allowed_styles = {"bug_fix", "feature", "docs", "community", "review", "test"}

        # additions
        for raw in delta.get('add_skills') or []:
            norm = _norm_skill(raw)
            if norm:
                skills_set.add(norm)
        for raw in delta.get('add_styles') or []:
            norm = _norm_style(raw)
            if norm in allowed_styles:
                styles_set.add(norm)

        # removals
        remove_skill_values = []
        for raw in delta.get('remove_skills') or []:
            norm = _norm_skill(raw)
            if norm:
                remove_skill_values.append(norm)
        if remove_skill_values:
            new_skills = set()
            for s in skills_set:
                if all(s.lower() != r for r in remove_skill_values):
                    new_skills.add(s)
            skills_set = new_skills

        remove_style_values = []
        for raw in delta.get('remove_styles') or []:
            norm = _norm_style(raw)
            if norm in allowed_styles:
                remove_style_values.append(norm)
        if remove_style_values:
            styles_set = {s for s in styles_set if s not in remove_style_values}

        new_profile = {
            'skills': sorted(skills_set),
            'contribution_styles': sorted(styles_set)
        }
        changed = self._profile_changed(self.current_profile, new_profile)
        if changed:
            self.current_profile = new_profile
        return changed

    def _profile_changed(self, prev: Dict, curr: Dict) -> bool:
        prev_skills = set(prev.get('skills', []))
        prev_styles = set(prev.get('contribution_styles', []))
        curr_skills = set(curr.get('skills', []))
        curr_styles = set(curr.get('contribution_styles', []))
        return prev_skills != curr_skills or prev_styles != curr_styles
    
    def _profile_unchanged(self, prev: Dict, curr: Dict) -> bool:
        prev_skills = set(prev.get('skills', []))
        prev_styles = set(prev.get('contribution_styles', []))
        curr_skills = set(curr.get('skills', []))
        curr_styles = set(curr.get('contribution_styles', []))
        return prev_skills == curr_skills and prev_styles == curr_styles and len(prev_skills) > 0
    
    def _is_profile_sufficient(self, profile: Dict) -> bool:
        skills = profile.get('skills', [])
        styles = profile.get('contribution_styles', [])
        return len(skills) > 0 and len(styles) > 0
    
    def _handle_confirm(self, language: str) -> Dict[str, Any]:
        """处理确认动作"""
        # 保存到文件缓存
        if self.user_id:
            self._save_profile_to_cache()
        
        if language == 'chinese':
            reply = f"✅ 已保存你的开发者画像！\n\n技能：{', '.join(self.current_profile['skills']) if self.current_profile['skills'] else '暂无'}\n贡献偏好：{', '.join(self.current_profile['contribution_styles']) if self.current_profile['contribution_styles'] else '暂无'}"
        else:
            reply = f"✅ Profile saved!\n\nSkills: {', '.join(self.current_profile['skills']) if self.current_profile['skills'] else 'none'}\nContribution preferences: {', '.join(self.current_profile['contribution_styles']) if self.current_profile['contribution_styles'] else 'none'}"
        
        return {
            'reply': reply,
            'action': 'CONFIRM_PROFILE',
            'data': {
                'skills': self.current_profile['skills'],
                'contribution_styles': self.current_profile['contribution_styles'],
                'confirmed': True,
                'profile_updated': True
            }
        }
    
    def _handle_search(self, language: str) -> Dict[str, Any]:
        """处理搜索动作（预留接口）"""
        if language == 'chinese':
            reply = "🔍 正在搜索匹配的开源项目..."
        else:
            reply = "🔍 Searching for matching open source projects..."
        
        return {
            'reply': reply,
            'action': 'SEARCH_PROJECTS',
            'data': {
                'skills': self.current_profile['skills'],
                'contribution_styles': self.current_profile['contribution_styles'],
                'profile_updated': False,
                'search_criteria': {
                    'skills': self.current_profile['skills'],
                    'preferences': self.current_profile['contribution_styles']
                }
            }
        }
    
    def _handle_auto_search(self, language: str) -> Dict[str, Any]:
        """处理自动搜索（当画像连续两次相同时）"""
        skills = self.current_profile['skills']
        styles = self.current_profile['contribution_styles']
        
        styles_map = {
            'bug_fix': '修复bug', 'feature': '开发新功能', 'docs': '编写文档',
            'community': '社区支持', 'review': '代码审查', 'test': '编写测试'
        }
        styles_map_en = {
            'bug_fix': 'bug fixes', 'feature': 'new features', 'docs': 'documentation',
            'community': 'community support', 'review': 'code review', 'test': 'testing'
        }
        
        if language == 'chinese':
            skills_text = '、'.join(skills) if skills else '暂无'
            styles_text = '、'.join([styles_map.get(s, s) for s in styles]) if styles else '暂无'
            reply = f"根据你的技能（{skills_text}）和贡献偏好（{styles_text}），我将开始搜索匹配的开源项目..."
        else:
            skills_text = ', '.join(skills) if skills else 'none'
            styles_text = ', '.join([styles_map_en.get(s, s) for s in styles]) if styles else 'none'
            reply = f"Based on your skills ({skills_text}) and contribution preferences ({styles_text}), I'll start searching for matching open source projects..."
        
        return {
            'reply': reply,
            'action': 'SEARCH_PROJECTS',
            'data': {
                'skills': skills,
                'contribution_styles': styles,
                'profile_updated': False,
                'auto_search': True,
                'search_criteria': {
                    'skills': skills,
                    'preferences': styles
                }
            }
        }
    
    def _save_profile_to_cache(self):
        """持久化用户画像到文件"""
        if not self.user_id:
            return
        
        safe_id = hashlib.md5(self.user_id.encode('utf-8')).hexdigest()
        cache_path = self._cache_dir / f"user_{safe_id}.json"
        
        profile_data = {
            'user_id': self.user_id,
            'skills': self.current_profile['skills'],
            'contribution_styles': self.current_profile['contribution_styles'],
            'previous_skills': self.previous_profile['skills'],
            'previous_contribution_styles': self.previous_profile['contribution_styles'],
            'conversation_history': self.conversation_history,
            'historical_summary': self.historical_summary,
            'query_summary_memory': self.query_summary_memory,
            'language': self.user_language
        }
        
        try:
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(profile_data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(f"Failed to save profile cache: {e}")
    
    def _load_profile_from_cache(self) -> Optional[Dict[str, Any]]:
        """从文件加载缓存的用户画像"""
        if not self.user_id:
            return None
        
        safe_id = hashlib.md5(self.user_id.encode('utf-8')).hexdigest()
        cache_path = self._cache_dir / f"user_{safe_id}.json"
        
        if cache_path.exists():
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.warning(f"Failed to load profile cache: {e}")
        
        return None
    
    def _get_fallback_reply(self, user_input: str, language: str) -> str:
        """备用回复（当AI调用失败时）"""
        if language == 'chinese':
            if any(keyword in user_input for keyword in ['Python', 'Django', 'Docker', 'K8s']):
                return "我了解了你的技术背景，需要更多信息来完善你的贡献偏好。"
            elif any(keyword in user_input for keyword in ['bug', '文档', '功能', '测试']):
                return "好的，我知道了你的贡献偏好。"
            else:
                return "好的，我收到了你的信息。请继续告诉我更多关于你的技术背景。"
        else:
            if any(keyword in user_input for keyword in ['Python', 'React', 'Docker', 'Kubernetes']):
                return "I understand your technical background, need more information about your contribution preferences."
            elif any(keyword in user_input for keyword in ['bug', 'docs', 'feature', 'test']):
                return "Got it, I know your contribution preferences."
            else:
                return "Okay, I received your information. Please continue to tell me more about your technical background."
    
    def _parse_conversation_response(self, ai_response: str, language: str) -> Tuple[str, str, Dict[str, Any]]:
        """
        解析Agent1的回复，提取动作指令
        """
        action_pattern = r'\[(\w+)\](.*)'
        match = re.search(action_pattern, ai_response)
        
        if match:
            action = match.group(1).upper()
            reply_content = match.group(2).strip()
        else:
            action = 'REPLY'
            reply_content = ai_response.strip()
        
        action_data = {}
        
        if action == 'CONFIRM_PROFILE':
            action_data.update({
                'skills': self.current_profile['skills'],
                'contribution_styles': self.current_profile['contribution_styles']
            })
            if not reply_content:
                skills_text = '、'.join(self.current_profile['skills']) if self.current_profile['skills'] else '暂无'
                styles_map = {
                    'bug_fix': '修复bug', 'feature': '开发新功能', 'docs': '编写文档',
                    'community': '社区支持', 'review': '代码审查', 'test': '编写测试'
                }
                styles_text = '、'.join([styles_map.get(s, s) for s in self.current_profile['contribution_styles']]) if self.current_profile['contribution_styles'] else '暂无'
                if language == 'chinese':
                    reply_content = f"我整理了你的信息：\n技能有：{skills_text}\n贡献偏好：{styles_text}\n确认无误吗？"
                else:
                    styles_map_en = {'bug_fix': 'bug fixes', 'feature': 'new features', 'docs': 'documentation',
                                     'community': 'community support', 'review': 'code review', 'test': 'testing'}
                    styles_text_en = ', '.join([styles_map_en.get(s, s) for s in self.current_profile['contribution_styles']]) if self.current_profile['contribution_styles'] else 'none'
                    skills_text_en = ', '.join(self.current_profile['skills']) if self.current_profile['skills'] else 'none'
                    reply_content = (
                        "Here's your profile:\n"
                        f"Skills: {skills_text_en}\n"
                        f"Contribution preferences: {styles_text_en}\n"
                        "Does this look correct?"
                    )
        
        elif action == 'SEARCH_PROJECTS':
            action_data['search_criteria'] = {
                'skills': self.current_profile['skills'],
                'preferences': self.current_profile['contribution_styles']
            }
            if not reply_content:
                if language == 'chinese':
                    reply_content = "🔍 正在搜索匹配的开源项目..."
                else:
                    reply_content = "🔍 Searching for matching open source projects..."
        
        if not reply_content:
            should_ask, ask_type = self._should_ask_followup(self.current_profile)
            if not should_ask and ask_type == 'ready_to_confirm':
                skills_text = '、'.join(self.current_profile['skills']) if self.current_profile['skills'] else '暂无'
                styles_map = {
                    'bug_fix': '修复bug', 'feature': '开发新功能', 'docs': '编写文档',
                    'community': '社区支持', 'review': '代码审查', 'test': '编写测试'
                }
                styles_text = '、'.join([styles_map.get(s, s) for s in self.current_profile['contribution_styles']]) if self.current_profile['contribution_styles'] else '暂无'
                if language == 'chinese':
                    reply_content = f"我整理了你的信息：\n技能有：{skills_text}\n贡献偏好：{styles_text}\n确认无误吗？"
                else:
                    styles_map_en = {'bug_fix': 'bug fixes', 'feature': 'new features', 'docs': 'documentation',
                                     'community': 'community support', 'review': 'code review', 'test': 'testing'}
                    styles_text_en = ', '.join([styles_map_en.get(s, s) for s in self.current_profile['contribution_styles']]) if self.current_profile['contribution_styles'] else 'none'
                    skills_text_en = ', '.join(self.current_profile['skills']) if self.current_profile['skills'] else 'none'
                    reply_content = (
                        "Here's your profile:\n"
                        f"Skills: {skills_text_en}\n"
                        f"Contribution preferences: {styles_text_en}\n"
                        "Does this look correct?"
                    )
        
        return reply_content, action, action_data

class ProfileParser:
    """Agent2调用器 - 解析用户画像"""
    
    def __init__(self):
        self.provider = OllamaProvider()
        self.prompt_manager = PromptManager()
    
    def parse_profile(self, conversation_summary: str) -> Dict[str, Any]:
        """
        调用Agent2解析用户画像
        
        Args:
            conversation_summary: 对话总结文本
        
        Returns:
            解析后的画像数据
        """
        if not conversation_summary.strip():
            logger.info("[Agent2] Empty conversation summary, returning empty profile")
            return {
                'skills': [],
                'contribution_styles': [],
                'raw_ai_response': '{}'
            }
        
        logger.info(f"[Agent2] Parsing profile from conversation summary (length: {len(conversation_summary)})")
        
        # 获取Agent2提示词
        system_prompt, _ = self.prompt_manager.get_agent_prompt(
            'profile_parser',
            input_text=conversation_summary
        )
        
        # 调用Agent2
        logger.info("[Agent2] Calling AI provider to parse profile")
        ai_response = self.provider.generate(
            prompt_template=conversation_summary,
            variables={},
            system_prompt=system_prompt,
            temperature=0.0
        )
        logger.info(f"[Agent2] AI response received (length: {len(ai_response)})")
        logger.debug(f"[Agent2] Raw AI response: {ai_response[:500]}")
        
        # 解析并过滤结果
        parsed_result = validate_and_parse(ai_response)
        
        logger.info(f"[Agent2] Parsed result - Skills: {parsed_result['skills']}, Contribution styles: {parsed_result['contribution_styles']}")
        
        return {
            'skills': parsed_result['skills'],
            'contribution_styles': parsed_result['contribution_styles'],
            'raw_ai_response': ai_response
        }
