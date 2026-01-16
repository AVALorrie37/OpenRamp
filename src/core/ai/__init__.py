"""AI模块入口，统一导出核心接口
# src/core/ai/__init__.py
"""
from .provider import BaseAIProvider, OllamaProvider
from .prompts import PromptManager
from .utils import validate_and_parse

__all__ = [
    "BaseAIProvider",
    "OllamaProvider", 
    "PromptManager",
    "validate_and_parse"
]