"""开发者画像构建模块"""
import logging
from typing import TypedDict, List
from .ai import OllamaProvider, PromptManager, validate_and_parse

logger = logging.getLogger(__name__)

class SkillExtractionResult(TypedDict):
    skills: List[str]
    raw_response: str
    error: str

class ProfileBuilder:
    """开发者画像构建器"""
    
    def __init__(self, ai_provider=None):
        self.ai = ai_provider or OllamaProvider()
        self.prompt_manager = PromptManager()

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

    def build_from_text(self, user_input: str) -> SkillExtractionResult:
        """
        从文本构建开发者画像（分步异常隔离版）
        
        Args:
            user_input: 开发者自述文本
        
        Returns:
            包含skills的字典
        """
        try:
            # Step 1: Prompt retrieval
            system_prompt, user_prompt = self._get_prompt_template(user_input)

            # Step 2: AI inference
            raw_response = self._call_ai_model(system_prompt, user_prompt, user_input)

            # Step 3: Parsing & validation
            result = self._parse_and_validate(raw_response)

            # Success log
            logger.info(f"✅ Profile built: input='{user_input[:50]}...', skills={result['skills']}")

            return {
                "skills": result["skills"],
                "raw_response": raw_response,
                "error": ""
            }

        except Exception as outer_e:
            # All exceptions are already wrapped with context — just log & return
            error_msg = str(outer_e)
            logger.error(f"❌ Profile building failed: {error_msg}")
            return {
                "skills": [],
                "raw_response": "",
                "error": error_msg
            }