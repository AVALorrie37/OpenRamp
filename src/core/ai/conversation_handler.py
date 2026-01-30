"""Agent1 主控制器 - 交互协调员"""
import re
import json
import hashlib
import logging
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
from .provider import OllamaProvider
from .prompts import PromptManager
from .utils import validate_and_parse

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
        self.current_profile = {
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
                self.conversation_history = cached.get('conversation_history', [])
                self.historical_summary = cached.get('historical_summary', '')
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
    
    def process_user_input(self, user_input: str) -> Dict[str, Any]:
        user_language = self.user_language
        user_action = self._detect_user_action(user_input)

        if self._is_query_intent(user_input, user_language):
            return self._handle_query_intent(user_language)

        self.conversation_history.append({'role': 'user', 'content': user_input})

        if user_action == 'CONFIRM' and (self.current_profile.get('skills') or self.current_profile.get('contribution_styles')):
            return self._handle_confirm(user_language)

        if user_action == 'SEARCH':
            return self._handle_search(user_language)

        recent_messages = self._get_recent_messages(4)
        combined_input = self._build_incremental_summary_input(recent_messages)
        if self.historical_summary.strip() and combined_input.strip():
            new_summary = self._summarize_conversation(combined_input)
            self.historical_summary = new_summary if new_summary else combined_input
        else:
            summary_lines = []
            for msg in recent_messages:
                role = "User" if msg['role'] == 'user' else "Assistant"
                summary_lines.append(f"{role}: {msg['content']}")
            self.historical_summary = "\n".join(summary_lines) if summary_lines else combined_input

        profile_result = self.profile_parser.parse_profile(self.historical_summary)
        prev_profile = dict(self.current_profile)
        self.current_profile = self._merge_profile_data(profile_result, self.current_profile)
        profile_changed = self._profile_changed(prev_profile, self.current_profile)
        
        # 将JSON结果转换为自然语言（用于Agent1理解）
        profile_text = self._format_profile_for_agent1(self.current_profile, user_language)
        
        # 获取Agent1系统提示词
        base_system_prompt, _ = self.prompt_manager.get_agent_prompt('conversation')
        
        # 注入用户语言偏好指令
        system_prompt = self._inject_language_instruction(base_system_prompt, user_language)
        
        # 构建完整的对话上下文（包含当前画像信息）
        conversation_context = self._build_conversation_context()
        user_prompt = f"{conversation_context}\n\nCurrent Profile (from Agent2):\n{profile_text}\n\nUser: {user_input}"
        
        try:
            # 调用Agent1获取回复
            ai_response = self.provider.generate(
                prompt_template=user_prompt,
                variables={},
                system_prompt=system_prompt,
                temperature=0.3
            )
        except Exception as e:
            fallback_reply = self._get_fallback_reply(user_input, user_language)
            ai_response = fallback_reply
        
        # 将AI回复添加到对话历史
        self.conversation_history.append({'role': 'assistant', 'content': ai_response})
        
        # 判断是否需要追问
        should_ask, ask_type = self._should_ask_followup(self.current_profile)
        
        # 根据判断结果调整回复
        if should_ask and ask_type == 'soft_ask':
            # 软询问：在回复后添加软询问
            if user_language == 'chinese':
                ai_response += "\n\n（如果还有其他技能或偏好，也可以告诉我哦～）"
            else:
                ai_response += "\n\n(Feel free to add more skills or preferences if you have any～)"
        
        reply, action, action_data = self._parse_conversation_response(ai_response, user_language)
        action_data.update({
            'skills': self.current_profile['skills'],
            'contribution_styles': self.current_profile['contribution_styles'],
            'profile_updated': profile_changed
        })
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
            role = "User" if msg['role'] == 'user' else "Assistant"
            context_lines.append(f"{role}: {msg['content']}")
        
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
        elif not skills:
            return True, 'skills_empty'
        elif not styles:
            return True, 'styles_empty'
        elif len(skills) < 2 or len(styles) < 2:
            return True, 'soft_ask'  # 软询问
        else:
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

    def _handle_query_intent(self, language: str) -> Dict[str, Any]:
        profile_text = self._format_profile_for_agent1(self.current_profile, language)
        if language == 'chinese':
            reply = f"根据我们的对话，你目前的画像如下：\n\n{profile_text}"
        else:
            reply = f"Based on our conversation, your current profile:\n\n{profile_text}"
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
                role = "User" if msg['role'] == 'user' else "Assistant"
                msg_lines.append(f"{role}: {msg['content']}")
            lines.append(f"\n# New messages:\n" + "\n".join(msg_lines))
        return "\n".join(lines) if lines else ""

    def _summarize_conversation(self, combined_input: str) -> str:
        if not combined_input.strip():
            return ""
        try:
            system_prompt, _ = self.prompt_manager.get_agent_prompt('conversation_summarizer')
            result = self.provider.generate(
                prompt_template=combined_input,
                variables={},
                system_prompt=system_prompt,
                temperature=0.2
            )
            return result.strip() if result else combined_input
        except Exception as e:
            logger.warning(f"Summarizer failed: {e}, using raw input")
            return combined_input

    def _profile_changed(self, prev: Dict, curr: Dict) -> bool:
        prev_skills = set(prev.get('skills', []))
        prev_styles = set(prev.get('contribution_styles', []))
        curr_skills = set(curr.get('skills', []))
        curr_styles = set(curr.get('contribution_styles', []))
        return prev_skills != curr_skills or prev_styles != curr_styles
    
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
            'conversation_history': self.conversation_history,
            'historical_summary': self.historical_summary,
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
        
        elif action == 'SEARCH_PROJECTS':
            action_data['search_criteria'] = {
                'skills': self.current_profile['skills'],
                'preferences': self.current_profile['contribution_styles']
            }
        
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
