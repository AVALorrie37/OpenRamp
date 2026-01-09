"""Ollama抽象层，提供统一的AI调用接口"""

import os
import logging
import requests 
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dotenv import load_dotenv 

# 加载 .env 文件
load_dotenv() 

logger = logging.getLogger(__name__)

class BaseAIProvider(ABC):
    """AI提供者的抽象基类"""
    
    @abstractmethod
    def generate(
        self,
        prompt_template: str,
        variables: Dict[str, Any],
        system_prompt: Optional[str] = None,
        **kwargs
    ) -> str:
        """生成AI响应"""
        pass

class OllamaProvider(BaseAIProvider):
    """Ollama本地部署实现"""
    
    def __init__(self):
        self.model = os.getenv("OLLAMA_MODEL", "gemma2:2b")
        self.base_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
        self.timeout = int(os.getenv("AI_TIMEOUT", "120"))  # 增加默认超时
        
        logger.info(f"OllamaProvider initialized: model={self.model}, url={self.base_url}, timeout={self.timeout}")
    
    def generate(
        self,
        prompt_template: str,
        variables: Dict[str, Any],
        system_prompt: Optional[str] = None,
        **kwargs
    ) -> str:
        """
        调用Ollama生成响应
        
        Args:
            prompt_template: 用户提示词模板
            variables: 模板变量（如 {user_input: "我擅长Python"}）
            system_prompt: 系统提示词（角色定义）
            **kwargs: 额外参数（如temperature等）
        
        Returns:
            生成的文本内容
        """
        try:
            # 格式化提示词
            user_prompt = prompt_template.format(**variables)
            
            # 构建消息列表
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": user_prompt})
            
            # 构建请求载荷，关键：设置 stream=False
            payload = {
                "model": self.model,
                "messages": messages,
                "options": {
                    "temperature": kwargs.get("temperature", 0.1),
                    "num_predict": kwargs.get("max_tokens", 512)
                },
                "stream": False  # 关键：禁用流式输出
            }

            # 使用 requests 调用 Ollama API
            response = requests.post(
                f"{self.base_url}/api/chat",
                json=payload,
                timeout=self.timeout
            )
            response.raise_for_status()  # 检查 HTTP 状态码
            
            # 解析响应
            result = response.json()
            return result['message']['content'].strip()
            
        except requests.exceptions.HTTPError as e:
            logger.error(f"Ollama HTTP Error {response.status_code}: {response.text}")
            raise RuntimeError(f"AI generation failed: {e}")
        except requests.exceptions.Timeout as e:
            logger.error(f"Ollama request timeout after {self.timeout}s")
            raise RuntimeError(f"AI generation failed: Request timeout")
        except Exception as e:
            logger.error(f"Ollama API error: {str(e)}")
            raise RuntimeError(f"AI generation failed: {str(e)}")