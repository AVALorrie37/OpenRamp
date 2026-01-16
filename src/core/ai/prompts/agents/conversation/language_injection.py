# 后端调用示例 (FastAPI)
from langdetect import detect

def get_language_instruction(user_input: str) -> str:
    """生成动态语言指令"""
    lang = "Chinese" if detect(user_input) == "zh" else "English"
    return f"""
    CRITICAL INSTRUCTION:
    - ALL RESPONSES MUST BE IN {lang}
    - TRANSLATE TECHNICAL TERMS NATURALLY (e.g., 'SQL' → 'SQL')
    - DO NOT USE ENGLISH FOR USER-FACING CONTENT
    """