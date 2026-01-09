"""AI模块工具函数"""
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# 定义允许的贡献风格
ALLOWED_STYLES = {
    'bug_fixer', 'feature_builder', 'docs_writer', 
    'community_helper', 'unknown'
}

def validate_and_parse(response: str) -> Dict[str, Any]:
    """
    安全校验并解析AI响应
    
    Args:
        response: AI原始响应字符串
    
    Returns:
        解析后的字典，包含skills和contribution_style
    """
    try:
        # 尝试提取JSON块（防止单行解释文字干扰）
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
        
        # 校验字段类型
        skills = data.get('skills', [])
        if not isinstance(skills, list):
            skills = []
        skills = [str(skill).lower() for skill in skills if isinstance(skill, str)]
        
        style = data.get('contribution_style', 'unknown')
        if style not in ALLOWED_STYLES:
            style = 'unknown'
        
        return {
            "skills": skills,
            "contribution_style": style,
            "raw_response": response
        }
        
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        logger.warning(f"AI response validation failed: {str(e)}, response='{response}'")
        return {
            "skills": [],
            "contribution_style": "unknown",
            "raw_response": response,
            "error": str(e)
        }