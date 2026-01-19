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