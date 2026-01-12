"""开发者画像构建模块"""
import logging
import json
import hashlib
import re
from pathlib import Path
from typing import TypedDict, List, Optional, Dict, Any
from dataclasses import dataclass, field
from enum import Enum
from .ai import OllamaProvider, PromptManager, validate_and_parse

logger = logging.getLogger(__name__)


class SessionStatus(Enum):
    """会话状态（与提示词中的状态对应）"""
    COLLECTING = "collecting"   # 信息收集中
    PENDING = "pending"         # 等待用户确认
    CONFIRMED = "confirmed"     # 用户已确认


class TriggerAction(Enum):
    """触发动作"""
    NONE = "NONE"           # 无动作
    CONFIRM = "CONFIRM"     # 确认画像
    SEARCH = "SEARCH"       # 搜索项目（预留）
    RESET = "RESET"         # 重置会话


class SkillExtractionResult(TypedDict):
    skills: List[str]
    raw_response: str
    error: str


class ProfileResult(TypedDict):
    """最终画像结果（GitHub 搜索友好格式）"""
    skills: List[str]              # 技能标签（英文，小写）
    contribution_types: List[str]  # 贡献类型
    topics: List[str]              # 领域主题
    experience_level: str          # 经验等级
    summary: str                   # 自然语言摘要
    error: str


@dataclass
class ProfileSession:
    """用户画像会话状态"""
    user_id: str
    messages: List[Dict[str, str]] = field(default_factory=list)
    current_skills: List[str] = field(default_factory=list)
    current_preferences: List[str] = field(default_factory=list)
    experience_level: str = "intermediate"
    status: SessionStatus = SessionStatus.COLLECTING
    summary: str = ""
    
    def add_user_message(self, content: str):
        """添加用户消息"""
        self.messages.append({"role": "user", "content": content})
    
    def add_assistant_message(self, content: str):
        """添加助手消息"""
        self.messages.append({"role": "assistant", "content": content})
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典（用于缓存）"""
        return {
            "user_id": self.user_id,
            "messages": self.messages,
            "current_skills": self.current_skills,
            "current_preferences": self.current_preferences,
            "experience_level": self.experience_level,
            "status": self.status.value,
            "summary": self.summary
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ProfileSession":
        """从字典恢复（用于缓存）"""
        session = cls(user_id=data["user_id"])
        session.messages = data.get("messages", [])
        session.current_skills = data.get("current_skills", [])
        session.current_preferences = data.get("current_preferences", [])
        session.experience_level = data.get("experience_level", "intermediate")
        session.summary = data.get("summary", "")
        status_value = data.get("status", "collecting")
        for s in SessionStatus:
            if s.value == status_value:
                session.status = s
                break
        return session

class ProfileBuilder:
    """开发者画像构建器"""
    
    def __init__(self, ai_provider=None, use_cache: bool = True, cache_dir: Optional[str] = None):
        """
        初始化 ProfileBuilder
        
        Args:
            ai_provider: AI提供者实例，默认为 OllamaProvider
            use_cache: 是否使用缓存，默认 True
            cache_dir: 缓存目录路径，默认为 data_layer/data/profile_cache
        """
        self.ai = ai_provider or OllamaProvider()
        self.prompt_manager = PromptManager()
        self._use_cache = use_cache
        
        # 设置缓存目录
        if cache_dir:
            self._cache_dir = Path(cache_dir)
        else:
            # 默认缓存目录：data_layer/data/profile_cache
            current_file = Path(__file__)
            core_dir = current_file.parent  # core
            data_layer_dir = core_dir.parent / "data_layer"  # 回到项目根，然后进入 data_layer
            self._cache_dir = data_layer_dir / "data" / "profile_cache"
        
        # 确保缓存目录存在
        if self._use_cache:
            self._cache_dir.mkdir(parents=True, exist_ok=True)

    def _get_prompt_template(self, user_input: str):
        """步骤1：获取提示词模板"""
        try:
            system_prompt, user_prompt = self.prompt_manager.get(
                "developer_profile",
                user_input=user_input
            )
            return system_prompt, user_prompt
        except Exception as e:
            raise RuntimeError(f"[Prompt Template] Failed to get prompt for 'developer_profile': {str(e)}")

    def _call_ai_model(self, system_prompt: str, user_prompt: str, user_input: str):
        """步骤2：调用AI模型生成响应"""
        try:
            raw_response = self.ai.generate(
                prompt_template=user_prompt,
                variables={"user_input": user_input},
                system_prompt=system_prompt
            )
            if not isinstance(raw_response, str):
                raise TypeError(f"AI returned non-string response: {type(raw_response)}")
            return raw_response
        except Exception as e:
            raise RuntimeError(f"[AI Call] Failed to generate response from AI: {str(e)}")

    def _parse_and_validate(self, raw_response: str):
        """步骤3：解析并校验AI输出"""
        try:
            result = validate_and_parse(raw_response)
            if not isinstance(result, dict):
                raise TypeError(f"validator returned non-dict: {type(result)}")
            if "skills" not in result:
                raise KeyError("Missing 'skills' key in parsed result")
            if not isinstance(result["skills"], list):
                raise TypeError(f"'skills' is not a list: {type(result['skills'])}")
            return result
        except Exception as e:
            raise RuntimeError(f"[Parsing] Failed to validate/parse raw response: {str(e)} | Raw: {raw_response[:200]}...")
    
    def _get_cache_key(self, user_input: str) -> str:
        """
        生成缓存键（基于 user_input 的 hash）
        
        Args:
            user_input: 用户输入文本
            
        Returns:
            缓存键（hash值）
        """
        return hashlib.md5(user_input.encode('utf-8')).hexdigest()
    
    def _get_cache_path(self, user_input: str) -> Path:
        """
        获取缓存文件路径
        
        Args:
            user_input: 用户输入文本
            
        Returns:
            缓存文件的 Path 对象
        """
        cache_key = self._get_cache_key(user_input)
        return self._cache_dir / f"{cache_key}.json"
    
    def _read_from_cache(self, user_input: str) -> Optional[SkillExtractionResult]:
        """
        从缓存读取数据
        
        Args:
            user_input: 用户输入文本
            
        Returns:
            缓存的数据，如果不存在则返回 None
        """
        if not self._use_cache:
            return None
        
        cache_path = self._get_cache_path(user_input)
        if cache_path.exists():
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    logger.info(f"✅ Cache hit for input: '{user_input[:50]}...'")
                    return data
            except (json.JSONDecodeError, IOError) as e:
                # 缓存文件损坏，删除它
                logger.warning(f"Cache file corrupted, removing: {cache_path}")
                cache_path.unlink(missing_ok=True)
        return None
    
    def _write_to_cache(self, user_input: str, result: SkillExtractionResult) -> None:
        """
        将数据写入缓存
        
        Args:
            user_input: 用户输入文本
            result: 要缓存的结果
        """
        if not self._use_cache:
            return
        
        cache_path = self._get_cache_path(user_input)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            logger.info(f"✅ Cached result for input: '{user_input[:50]}...'")
        except IOError as e:
            logger.warning(f"Failed to write cache for input '{user_input[:50]}...': {e}")

    def build_from_text(self, user_input: str) -> SkillExtractionResult:
        """
        从文本构建开发者画像（分步异常隔离版，支持缓存）
        
        Args:
            user_input: 开发者自述文本
        
        Returns:
            包含skills的字典
        """
        # 先检查缓存
        cached_result = self._read_from_cache(user_input)
        if cached_result is not None:
            return cached_result
        
        try:
            # Step 1: Prompt retrieval
            system_prompt, user_prompt = self._get_prompt_template(user_input)

            # Step 2: AI inference
            raw_response = self._call_ai_model(system_prompt, user_prompt, user_input)

            # Step 3: Parsing & validation
            result = self._parse_and_validate(raw_response)

            # 构建返回结果
            final_result = {
                "skills": result["skills"],
                "raw_response": raw_response,
                "error": ""
            }
            
            # 保存到缓存（只在成功时缓存）
            self._write_to_cache(user_input, final_result)

            # Success log
            logger.info(f"✅ Profile built: input='{user_input[:50]}...', skills={result['skills']}")

            return final_result

        except Exception as outer_e:
            # All exceptions are already wrapped with context — just log & return
            error_msg = str(outer_e)
            logger.error(f"❌ Profile building failed: {error_msg}")
            return {
                "skills": [],
                "raw_response": "",
                "error": error_msg
            }


class ConversationalProfileBuilder:
    """
    对话式开发者画像构建器
    
    支持多轮对话，逐步收集用户的技能和贡献偏好，
    在用户确认后才输出最终结果并缓存。
    """
    
    # 允许的贡献类型
    CONTRIBUTION_TYPES = {
        "bug_fix": "修复Bug",
        "feature": "开发新功能", 
        "docs": "编写文档",
        "community": "社区支持",
        "review": "代码审查",
        "test": "编写测试"
    }
    
    def __init__(self, ai_provider=None, cache_dir: Optional[str] = None):
        """
        初始化对话式画像构建器
        
        Args:
            ai_provider: AI提供者实例
            cache_dir: 缓存目录路径
        """
        self.ai = ai_provider or OllamaProvider()
        self.prompt_manager = PromptManager()
        self._sessions: Dict[str, ProfileSession] = {}
        
        # 设置缓存目录
        if cache_dir:
            self._cache_dir = Path(cache_dir)
        else:
            current_file = Path(__file__)
            core_dir = current_file.parent
            data_layer_dir = core_dir.parent / "data_layer"
            self._cache_dir = data_layer_dir / "data" / "profile_cache"
        
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        
        # 加载对话提示词
        self._load_prompts()
    
    def _load_prompts(self):
        """加载对话提示词配置"""
        try:
            import yaml
            prompts_dir = Path(__file__).parent / "ai" / "prompts"
            config_path = prompts_dir / "profile_conversation.yaml"
            
            if config_path.exists():
                with open(config_path, 'r', encoding='utf-8') as f:
                    self._prompts = yaml.safe_load(f)
            else:
                # 使用默认提示词
                self._prompts = self._get_default_prompts()
        except Exception as e:
            logger.warning(f"Failed to load prompts: {e}, using defaults")
            self._prompts = self._get_default_prompts()
    
    def _get_default_prompts(self) -> Dict[str, str]:
        """获取默认提示词"""
        return {
            "system": """你是一位友好的开源社区助手，帮助开发者描述技术背景和贡献偏好。
每次回复必须包含以下结构（用---分隔）：

[回复内容]
你对用户的自然语言回复

---SUMMARY---
技能：xxx, xxx
偏好：xxx
状态：收集中/待确认/已确认""",
            "greeting": "👋 你好！我是开源社区助手。可以聊聊你的技术背景吗？比如用什么编程语言，喜欢做什么类型的贡献？",
            "finalize_prompt": """请根据以下信息输出JSON：
技能：{skills}
偏好：{preferences}

格式：{{"skills": ["skill1"], "contribution_types": ["type1"]}}
contribution_types可选：bug_fix, feature, docs, community, review, test"""
        }
    
    def _get_cache_path(self, user_id: str) -> Path:
        """获取用户缓存文件路径"""
        safe_id = hashlib.md5(user_id.encode('utf-8')).hexdigest()
        return self._cache_dir / f"user_{safe_id}.json"
    
    def _get_session_cache_path(self, user_id: str) -> Path:
        """获取会话缓存文件路径"""
        safe_id = hashlib.md5(user_id.encode('utf-8')).hexdigest()
        return self._cache_dir / f"session_{safe_id}.json"
    
    def _load_session(self, user_id: str) -> Optional[ProfileSession]:
        """从缓存加载会话"""
        cache_path = self._get_session_cache_path(user_id)
        if cache_path.exists():
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    return ProfileSession.from_dict(data)
            except Exception as e:
                logger.warning(f"Failed to load session: {e}")
        return None
    
    def _save_session(self, session: ProfileSession):
        """保存会话到缓存"""
        cache_path = self._get_session_cache_path(session.user_id)
        try:
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(session.to_dict(), f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save session: {e}")
    
    def _save_final_profile(self, user_id: str, result: ProfileResult):
        """保存最终画像结果（覆盖已有缓存）"""
        cache_path = self._get_cache_path(user_id)
        try:
            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            logger.info(f"✅ Profile saved for user: {user_id}")
        except Exception as e:
            logger.warning(f"Failed to save profile: {e}")
    
    def _clear_session(self, user_id: str):
        """清除会话缓存"""
        cache_path = self._get_session_cache_path(user_id)
        if cache_path.exists():
            cache_path.unlink(missing_ok=True)
    
    def get_cached_profile(self, user_id: str) -> Optional[ProfileResult]:
        """获取已缓存的用户画像"""
        cache_path = self._get_cache_path(user_id)
        if cache_path.exists():
            try:
                with open(cache_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load cached profile: {e}")
        return None
    
    def _parse_ai_response(self, response: str) -> Dict[str, Any]:
        """
        解析AI响应，提取回复内容和摘要信息
        
        Returns:
            {
                "reply": 给用户的回复,
                "skills": 提取的技能列表,
                "preferences": 提取的偏好列表,
                "experience": 经验等级,
                "status": 状态,
                "trigger": 触发动作
            }
        """
        result = {
            "reply": response,
            "skills": [],
            "preferences": [],
            "experience": "intermediate",
            "status": SessionStatus.COLLECTING,
            "trigger": TriggerAction.NONE
        }
        
        # 尝试解析 ---SUMMARY--- 部分
        if "---SUMMARY---" in response:
            parts = response.split("---SUMMARY---")
            result["reply"] = parts[0].strip()
            
            if len(parts) > 1:
                summary_part = parts[1].strip()
                
                # 提取技能（支持中英文标签）
                skills_match = re.search(r'技能[：:]\s*(.+?)(?:\n|$)', summary_part)
                if skills_match:
                    skills_str = skills_match.group(1).strip()
                    if skills_str and skills_str.lower() not in ['无', '暂无', '-', '', 'none']:
                        result["skills"] = [s.strip().lower() for s in re.split(r'[,，、\s]+', skills_str) if s.strip()]
                
                # 提取偏好
                prefs_match = re.search(r'偏好[：:]\s*(.+?)(?:\n|$)', summary_part)
                if prefs_match:
                    prefs_str = prefs_match.group(1).strip()
                    if prefs_str and prefs_str.lower() not in ['无', '暂无', '-', '', 'none']:
                        result["preferences"] = [p.strip().lower() for p in re.split(r'[,，、\s]+', prefs_str) if p.strip()]
                
                # 提取经验等级
                exp_match = re.search(r'经验[：:]\s*(.+?)(?:\n|$)', summary_part)
                if exp_match:
                    exp_str = exp_match.group(1).strip().lower()
                    if exp_str in ['beginner', 'intermediate', 'advanced']:
                        result["experience"] = exp_str
                    elif '新手' in exp_str or 'beginner' in exp_str:
                        result["experience"] = "beginner"
                    elif '资深' in exp_str or 'advanced' in exp_str:
                        result["experience"] = "advanced"
                
                # 提取状态
                status_match = re.search(r'状态[：:]\s*(.+?)(?:\n|$)', summary_part)
                if status_match:
                    status_str = status_match.group(1).strip().lower()
                    for s in SessionStatus:
                        if s.value in status_str:
                            result["status"] = s
                            break
                
                # 提取触发动作
                trigger_match = re.search(r'触发[：:]\s*(.+?)(?:\n|$)', summary_part)
                if trigger_match:
                    trigger_str = trigger_match.group(1).strip().upper()
                    for t in TriggerAction:
                        if t.value in trigger_str:
                            result["trigger"] = t
                            break
        
        return result
    
    def _finalize_profile(self, session: ProfileSession) -> ProfileResult:
        """
        将会话转换为最终结构化画像
        使用 developer_profile.yaml 提示词生成 GitHub 搜索友好的格式
        """
        try:
            # 构建用户描述文本
            user_description = f"""
Skills: {', '.join(session.current_skills) if session.current_skills else 'not specified'}
Contribution preferences: {', '.join(session.current_preferences) if session.current_preferences else 'not specified'}
Experience level: {session.experience_level}
"""
            # 使用 developer_profile 提示词模板
            system_prompt, user_prompt = self.prompt_manager.get(
                "developer_profile",
                user_input=user_description
            )
            
            # 调用AI生成结构化输出
            response = self.ai.generate(
                prompt_template=user_prompt,
                variables={"user_input": user_description},
                system_prompt=system_prompt
            )
            
            # 解析JSON
            json_str = response.strip()
            if '```json' in json_str:
                start = json_str.find('```json') + 7
                end = json_str.find('```', start)
                json_str = json_str[start:end].strip()
            elif '```' in json_str:
                start = json_str.find('```') + 3
                end = json_str.find('```', start)
                json_str = json_str[start:end].strip()
            
            data = json.loads(json_str)
            
            return {
                "skills": data.get("skills", session.current_skills),
                "contribution_types": data.get("contribution_types", []),
                "topics": data.get("topics", []),
                "experience_level": data.get("experience_level", session.experience_level),
                "summary": session.summary,
                "error": ""
            }
            
        except Exception as e:
            logger.error(f"Failed to finalize profile: {e}")
            # 降级：直接使用会话中的数据
            return {
                "skills": session.current_skills,
                "contribution_types": self._map_preferences_to_types(session.current_preferences),
                "topics": [],
                "experience_level": session.experience_level,
                "summary": session.summary,
                "error": str(e)
            }
    
    def _map_preferences_to_types(self, preferences: List[str]) -> List[str]:
        """将自然语言偏好映射为标准类型"""
        type_keywords = {
            "bug_fix": ["bug", "修复", "fix", "调试", "debug"],
            "feature": ["功能", "feature", "新功能", "开发"],
            "docs": ["文档", "doc", "documentation", "readme"],
            "community": ["社区", "community", "答疑", "帮助"],
            "review": ["审查", "review", "code review"],
            "test": ["测试", "test", "单元测试"]
        }
        
        result = []
        for pref in preferences:
            pref_lower = pref.lower()
            for type_key, keywords in type_keywords.items():
                if any(kw in pref_lower for kw in keywords):
                    if type_key not in result:
                        result.append(type_key)
                    break
        
        return result if result else ["feature"]  # 默认类型
    
    def start_session(self, user_id: str) -> str:
        """
        开始新的对话会话
        
        Args:
            user_id: 用户唯一标识
            
        Returns:
            初始问候语
        """
        # 尝试恢复已有会话
        existing_session = self._load_session(user_id)
        if existing_session and existing_session.status != SessionStatus.CONFIRMED:
            self._sessions[user_id] = existing_session
            # 生成恢复对话的提示
            if existing_session.current_skills or existing_session.current_preferences:
                skills_str = ", ".join(existing_session.current_skills) if existing_session.current_skills else "暂无"
                prefs_str = ", ".join(existing_session.current_preferences) if existing_session.current_preferences else "暂无"
                return f"👋 欢迎回来！上次我们聊到：\n\n📋 技能：{skills_str}\n🎯 偏好：{prefs_str}\n\n继续聊聊？有什么需要补充的吗？"
        
        # 创建新会话
        session = ProfileSession(user_id=user_id)
        self._sessions[user_id] = session
        
        greeting = self._prompts.get("greeting", "👋 你好！可以聊聊你的技术背景吗？")
        return greeting
    
    def chat(self, user_id: str, user_input: str) -> Dict[str, Any]:
        """
        处理用户输入，返回AI响应
        
        Args:
            user_id: 用户唯一标识
            user_input: 用户输入内容
            
        Returns:
            {
                "reply": AI回复内容,
                "status": 当前状态,
                "skills": 当前识别的技能,
                "preferences": 当前识别的偏好,
                "experience": 经验等级,
                "confirmed": 是否已确认完成,
                "action": 触发的动作,
                "profile": 最终画像（仅在确认后返回）
            }
        """
        # 获取或创建会话
        if user_id not in self._sessions:
            self._sessions[user_id] = self._load_session(user_id) or ProfileSession(user_id=user_id)
        
        session = self._sessions[user_id]
        
        # 检测用户关键词触发
        user_lower = user_input.lower()
        detected_action = self._detect_user_action(user_lower)
        
        # 处理重置指令
        if detected_action == TriggerAction.RESET:
            self.reset_session(user_id)
            reset_msg = self._prompts.get("reset_message", "🔄 好的，我们重新开始吧！")
            return {
                "reply": reset_msg,
                "status": SessionStatus.COLLECTING.value,
                "skills": [],
                "preferences": [],
                "experience": "intermediate",
                "confirmed": False,
                "action": TriggerAction.RESET.value
            }
        
        # 处理确认指令（状态为 pending 时）
        if detected_action == TriggerAction.CONFIRM and session.status == SessionStatus.PENDING:
            return self._handle_confirm(user_id, session)
        
        # 处理搜索指令（需要已确认的画像）
        if detected_action == TriggerAction.SEARCH:
            return self._handle_search(user_id, session)
        
        # 添加用户消息
        session.add_user_message(user_input)
        
        # 构建系统提示词
        base_system = self._prompts.get("system", "")
        
        # 调用AI
        try:
            response = self.ai.chat(
                messages=session.messages,
                system_prompt=base_system,
                temperature=0.3
            )
        except Exception as e:
            logger.error(f"AI chat failed: {e}")
            return {
                "reply": "抱歉，我遇到了一些问题。请稍后再试~",
                "status": session.status.value,
                "skills": session.current_skills,
                "preferences": session.current_preferences,
                "experience": session.experience_level,
                "confirmed": False,
                "action": TriggerAction.NONE.value,
                "error": str(e)
            }
        
        # 解析AI响应
        parsed = self._parse_ai_response(response)
        
        # 更新会话状态
        session.add_assistant_message(parsed["reply"])
        if parsed["skills"]:
            session.current_skills = parsed["skills"]
        if parsed["preferences"]:
            session.current_preferences = parsed["preferences"]
        if parsed["experience"]:
            session.experience_level = parsed["experience"]
        session.status = parsed["status"]
        session.summary = f"Skills: {', '.join(session.current_skills)}; Preferences: {', '.join(session.current_preferences)}"
        
        # 保存会话
        self._save_session(session)
        
        # 处理AI返回的触发动作
        if parsed["trigger"] == TriggerAction.CONFIRM and session.status == SessionStatus.PENDING:
            # AI 判断可以确认，但还是让用户手动确认
            pass
        
        return {
            "reply": parsed["reply"],
            "status": session.status.value,
            "skills": session.current_skills,
            "preferences": session.current_preferences,
            "experience": session.experience_level,
            "confirmed": False,
            "action": parsed["trigger"].value
        }
    
    def _detect_user_action(self, user_input: str) -> TriggerAction:
        """检测用户输入中的关键词触发"""
        # 确认关键词
        confirm_keywords = ["确认", "没问题", "对的", "正确", "ok", "yes", "确定", "好的", "可以"]
        if any(kw in user_input for kw in confirm_keywords):
            return TriggerAction.CONFIRM
        
        # 搜索关键词
        search_keywords = ["搜索", "找项目", "推荐", "search", "find"]
        if any(kw in user_input for kw in search_keywords):
            return TriggerAction.SEARCH
        
        # 重置关键词
        reset_keywords = ["重来", "重新开始", "重置", "reset", "restart"]
        if any(kw in user_input for kw in reset_keywords):
            return TriggerAction.RESET
        
        return TriggerAction.NONE
    
    def _handle_confirm(self, user_id: str, session: ProfileSession) -> Dict[str, Any]:
        """处理确认动作"""
        session.status = SessionStatus.CONFIRMED
        profile = self._finalize_profile(session)
        
        # 保存最终画像并清除会话
        self._save_final_profile(user_id, profile)
        self._clear_session(user_id)
        
        if user_id in self._sessions:
            del self._sessions[user_id]
        
        confirm_msg = self._prompts.get("confirm_success", "✅ 已保存你的开发者画像！")
        
        return {
            "reply": confirm_msg,
            "status": SessionStatus.CONFIRMED.value,
            "skills": profile["skills"],
            "preferences": profile["contribution_types"],
            "experience": profile["experience_level"],
            "confirmed": True,
            "action": TriggerAction.CONFIRM.value,
            "profile": profile
        }
    
    def _handle_search(self, user_id: str, session: ProfileSession) -> Dict[str, Any]:
        """
        处理搜索动作（预留接口）
        
        TODO: 实现实际的搜索功能，对接 IntegratedRepoSearch
        """
        # 检查是否有已确认的画像
        cached_profile = self.get_cached_profile(user_id)
        
        if not cached_profile:
            # 没有画像，提示先完成画像收集
            if session.status == SessionStatus.PENDING:
                return {
                    "reply": "📋 请先确认你的画像信息，然后我再帮你搜索项目~",
                    "status": session.status.value,
                    "skills": session.current_skills,
                    "preferences": session.current_preferences,
                    "experience": session.experience_level,
                    "confirmed": False,
                    "action": TriggerAction.SEARCH.value
                }
            else:
                return {
                    "reply": "🤔 我还不太了解你的技术背景，先聊聊吧！",
                    "status": session.status.value,
                    "skills": session.current_skills,
                    "preferences": session.current_preferences,
                    "experience": session.experience_level,
                    "confirmed": False,
                    "action": TriggerAction.SEARCH.value
                }
        
        # 有画像，返回搜索触发信息（预留接口）
        search_msg = self._prompts.get("search_trigger", "🔍 正在搜索匹配的开源项目...")
        search_msg = search_msg.format(
            skills=", ".join(cached_profile.get("skills", [])),
            preferences=", ".join(cached_profile.get("contribution_types", []))
        )
        
        return {
            "reply": search_msg,
            "status": SessionStatus.CONFIRMED.value,
            "skills": cached_profile.get("skills", []),
            "preferences": cached_profile.get("contribution_types", []),
            "experience": cached_profile.get("experience_level", "intermediate"),
            "confirmed": True,
            "action": TriggerAction.SEARCH.value,
            "profile": cached_profile,
            "search_ready": True  # 标记：可以开始搜索
        }
    
    def reset_session(self, user_id: str):
        """重置用户会话"""
        if user_id in self._sessions:
            del self._sessions[user_id]
        self._clear_session(user_id)