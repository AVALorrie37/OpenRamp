"""提示词管理器 - 多Agent架构"""
import os
from typing import Tuple, Dict, Any
import yaml

class PromptManager:
    """管理所有提示词模板 - 支持多Agent架构"""
    
    def __init__(self, prompts_dir: str = None):
        self.prompts_dir = prompts_dir or os.path.join(
            os.path.dirname(__file__), 
            '.'
        )
        self._cache: Dict[str, Any] = {}
        try:
            self._base_config = self._load_base_config()
        except Exception as e:
            raise RuntimeError(f"[PromptManager] 初始化失败: 无法加载基础配置 - {str(e)}")

    def _load_base_config(self) -> Dict[str, Any]:
        """加载基础安全配置"""
        base_path = os.path.join(self.prompts_dir, 'base.yaml')
        if not os.path.exists(base_path):
            print(f"[PromptManager] 警告: 基础配置文件不存在: {base_path}，将使用空配置。")
            return {}
        
        try:
            with open(base_path, 'r', encoding='utf-8') as f:
                content = f.read()
                if not content.strip():
                    print(f"[PromptManager] 警告: 基础配置文件为空: {base_path}，将使用空配置。")
                    return {}
                data = yaml.safe_load(content)
                if data is None:
                    print(f"[PromptManager] 警告: 基础配置文件解析为空 (None): {base_path}，将使用空配置。")
                    return {}
                if not isinstance(data, dict):
                    raise ValueError(f"基础配置文件内容不是字典格式: {type(data)}")
                return data
        except yaml.YAMLError as e:
            raise RuntimeError(f"[PromptManager] YAML解析失败 (base.yaml): {str(e)}")
        except UnicodeDecodeError as e:
            raise RuntimeError(f"[PromptManager] 文件编码错误 (base.yaml): {str(e)}")
        except Exception as e:
            raise RuntimeError(f"[PromptManager] 读取基础配置文件失败 (base.yaml): {str(e)}")

    def get_agent_prompt(self, agent_type: str, **kwargs) -> Tuple[str, str]:
        """
        获取指定Agent的系统提示词和用户提示词
        
        Args:
            agent_type: agent类型 ("profile_parser", "conversation", etc.)
            **kwargs: 模板变量
        
        Returns:
            (system_prompt, user_prompt)
        """
        try:
            # 构建Agent配置路径
            config_path = os.path.join(
                self.prompts_dir, 
                'agents', 
                agent_type, 
                'system_prompt.yaml'
            )
            
            if not os.path.exists(config_path):
                raise FileNotFoundError(f"Agent配置文件不存在: {config_path}")
            
            # 加载或从缓存获取配置
            cache_key = f"agent_{agent_type}"
            if cache_key not in self._cache:
                try:
                    with open(config_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        if not content.strip():
                            raise ValueError(f"Agent配置文件为空: {config_path}")
                        config_data = yaml.safe_load(content)
                except yaml.YAMLError as e:
                    raise RuntimeError(f"YAML解析失败 ({config_path}): {str(e)}")
                except UnicodeDecodeError as e:
                    raise RuntimeError(f"文件编码错误 ({config_path}): {str(e)}")
                except Exception as e:
                    raise RuntimeError(f"读取配置文件失败 ({config_path}): {str(e)}")
                
                if config_data is None:
                    raise ValueError(f"Agent配置文件解析结果为空 (None): {config_path}")
                if not isinstance(config_data, dict):
                    raise TypeError(f"Agent配置文件内容不是字典格式: {type(config_data)} (file: {config_path})")
                
                self._cache[cache_key] = config_data
            else:
                config_data = self._cache[cache_key]

            # 构建系统提示词
            system_prompt = config_data.get('system_prompt', '')
            if not isinstance(system_prompt, str):
                raise TypeError(f"'system_prompt' 字段不是字符串类型: {type(system_prompt)} (agent: {agent_type})")
            
            # 构建用户提示词（对于纯JSON解析Agent，通常不需要复杂的用户模板）
            user_prompt = kwargs.get('input_text', '')  # 直接使用输入文本
            
            return system_prompt, user_prompt

        except Exception as e:
            raise RuntimeError(f"[PromptManager.get_agent_prompt] 构建Agent提示词失败 (agent: {agent_type}): {str(e)}")

    def get_developer_profile_prompt(self, user_input: str) -> Tuple[str, str]:
        """
        【兼容旧接口】获取开发者画像转换提示词
        用于向后兼容，实际调用Agent2
        """
        return self.get_agent_prompt('profile_parser', input_text=user_input)

# 向后兼容
get_developer_profile_prompt = PromptManager().get_developer_profile_prompt