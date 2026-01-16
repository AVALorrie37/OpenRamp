# utils/prompt_loader.py
import yaml

def load_agent_prompt(agent_name: str, user_input: str = None) -> str:
    """加载Agent提示词（自动处理动态注入）"""
    with open(f"prompts/agents/{agent_name}/system_prompt.yaml") as f:
        config = yaml.safe_load(f)
    
    prompt = config["system_prompt"]
    
    # 仅Agent1需要动态注入
    if agent_name == "conversation" and user_input:
        from agents.conversation.language_injection import get_language_instruction
        injection = get_language_instruction(user_input)
        prompt = prompt.replace("{LANGUAGE_INJECTION}", injection)
    
    return prompt

# 使用示例
user_msg = "帮我找活跃的Python新手项目"
agent1_prompt = load_agent_prompt("conversation", user_msg)