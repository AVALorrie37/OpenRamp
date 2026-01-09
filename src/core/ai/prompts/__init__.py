"""提示词管理器"""
import os
from typing import Tuple, Dict, Any
import yaml

class PromptManager:
    """管理所有提示词模板"""
    
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
        """加载基础配置"""
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

    def get(self, prompt_key: str, **kwargs) -> Tuple[str, str]:
        """
        获取系统提示词和用户提示词（支持模板变量替换）
        """
        try:
            # --- 步骤1: 加载或从缓存获取配置 ---
            if prompt_key not in self._cache:
                config_path = os.path.join(self.prompts_dir, f"{prompt_key}.yaml")
                
                if not os.path.exists(config_path):
                    raise FileNotFoundError(f"提示词配置文件不存在: {config_path}")
                
                try:
                    with open(config_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        if not content.strip():
                            raise ValueError(f"提示词配置文件为空: {config_path}")
                        config_data = yaml.safe_load(content)
                except yaml.YAMLError as e:
                    raise RuntimeError(f"YAML解析失败 ({config_path}): {str(e)}")
                except UnicodeDecodeError as e:
                    raise RuntimeError(f"文件编码错误 ({config_path}): {str(e)}")
                except Exception as e:
                    raise RuntimeError(f"读取配置文件失败 ({config_path}): {str(e)}")
                
                if config_data is None:
                    raise ValueError(f"提示词配置文件解析结果为空 (None): {config_path}")
                if not isinstance(config_data, dict):
                    raise TypeError(f"提示词配置文件内容不是字典格式: {type(config_data)} (file: {config_path})")
                
                self._cache[prompt_key] = config_data
            else:
                config_data = self._cache[prompt_key]

            # --- 步骤2: 构建系统提示词 ---
            base_system = self._base_config.get('default_system', '')
            template_system = config_data.get('system', '')
            
            if not isinstance(template_system, str):
                raise TypeError(f"'system' 字段不是字符串类型: {type(template_system)} (config: {prompt_key})")
            
            # 替换模板中的 {default_system} 变量
            try:
                final_system = template_system.format(default_system=base_system)
            except KeyError as e:
                raise KeyError(f"系统提示词模板中包含未知变量: {str(e)} (template: {template_system[:100]}..., config: {prompt_key})")
            except Exception as e:
                raise RuntimeError(f"系统提示词模板格式化失败: {str(e)} (template: {template_system[:100]}..., config: {prompt_key})")

            # --- 步骤3: 构建用户提示词 ---
            if 'user_template' not in config_data:
                raise KeyError(f"配置中缺少 'user_template' 键 (config: {prompt_key})")
            
            user_template = config_data['user_template']
            if not isinstance(user_template, str):
                raise TypeError(f"'user_template' 字段不是字符串类型: {type(user_template)} (config: {prompt_key})")

            # 格式化用户提示词
            try:
                final_user = user_template.format(**kwargs)
            except KeyError as e:
                raise KeyError(f"用户提示词模板中包含未知变量: {str(e)} (template: {user_template[:100]}..., config: {prompt_key}, provided_keys: {list(kwargs.keys())})")
            except Exception as e:
                raise RuntimeError(f"用户提示词模板格式化失败: {str(e)} (template: {user_template[:100]}..., config: {prompt_key})")

            return final_system, final_user

        except Exception as e:
            # 顶层捕获，确保异常信息清晰
            raise RuntimeError(f"[PromptManager.get] 构建提示词失败 (key: {prompt_key}): {str(e)}")