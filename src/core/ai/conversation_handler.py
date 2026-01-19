"""Agent1 主控制器 - 交互协调员"""
import re
import json
import hashlib
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
from .provider import OllamaProvider
from .prompts import PromptManager
from .utils import validate_and_parse

class ConversationHandler:
    """Agent1：交互协调员"""
    
    def __init__(self, user_id: str = None, user_language: str = 'chinese'):
        self.provider = OllamaProvider()
        self.prompt_manager = PromptManager()
        self.profile_parser = ProfileParser()
        self.user_id = user_id
        self.user_language = user_language  # 用户设置的语言偏好，默认中文
        
        # 会话状态
        self.conversation_history = []  # 存储对话历史
        self.current_profile = {
            'skills': [],
            'contribution_styles': []
        }
        self.conversation_stage = 'greeting'  # greeting, collecting, confirming, searching
        
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
        """
        处理用户输入，返回自然语言回复和动作指令
        
        Args:
            user_input: 用户输入文本
        
        Returns:
            {
                'reply': '自然语言回复',
                'action': 'action_type',
                'data': {...}  # 动作相关数据
            }
        """
        # 将用户输入添加到对话历史
        self.conversation_history.append({'role': 'user', 'content': user_input})
        
        # 使用用户设置的语言偏好，而不是自动检测
        user_language = self.user_language
        
        # 检测用户动作（确认、搜索等）
        user_action = self._detect_user_action(user_input)
        
        # 处理确认动作
        if user_action == 'CONFIRM' and self.current_profile.get('skills') or self.current_profile.get('contribution_styles'):
            return self._handle_confirm(user_language)
        
        # 处理搜索动作
        if user_action == 'SEARCH':
            return self._handle_search(user_language)
        
        # 构建对话总结（用于Agent2解析）
        conversation_summary = self._build_conversation_summary()
        
        # 每轮对话后自动调用Agent2解析
        profile_result = self.profile_parser.parse_profile(conversation_summary)
        
        # 合并新的解析结果到现有数据（累积合并）
        self.current_profile = self._merge_profile_data(profile_result, self.current_profile)
        
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
        
        # 解析AI回复，提取动作指令
        reply, action, action_data = self._parse_conversation_response(ai_response, user_language)
        
        # 更新动作数据
        action_data.update({
            'skills': self.current_profile['skills'],
            'contribution_styles': self.current_profile['contribution_styles']
        })
        
        return {
            'reply': reply,
            'action': action,
            'data': action_data
        }
    
    def get_current_profile(self) -> Dict[str, Any]:
        """获取当前用户画像"""
        return self.current_profile
    
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
        """检测用户输入中的动作"""
        user_lower = user_input.lower()
        
        confirm_keywords = ["确认", "没问题", "对的", "正确", "ok", "yes", "确定", "好的", "可以", "confirm"]
        if any(kw in user_lower for kw in confirm_keywords):
            return 'CONFIRM'
        
        search_keywords = ["搜索", "找项目", "推荐", "search", "find", "recommend"]
        if any(kw in user_lower for kw in search_keywords):
            return 'SEARCH'
        
        return 'NONE'
    
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
                'confirmed': True
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
            return {
                'skills': [],
                'contribution_styles': [],
                'raw_ai_response': '{}'
            }
        
        # 获取Agent2提示词
        system_prompt, _ = self.prompt_manager.get_agent_prompt(
            'profile_parser',
            input_text=conversation_summary
        )
        
        # 调用Agent2
        ai_response = self.provider.generate(
            prompt_template=conversation_summary,
            variables={},
            system_prompt=system_prompt,
            temperature=0.0
        )
        
        # 解析并过滤结果
        parsed_result = validate_and_parse(ai_response)
        
        return {
            'skills': parsed_result['skills'],
            'contribution_styles': parsed_result['contribution_styles'],
            'raw_ai_response': ai_response
        }
