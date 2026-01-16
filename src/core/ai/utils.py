"""AI模块工具函数 - 活动词汇过滤 + 维护词汇映射"""
import json
import logging
import re
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# 定义不允许的活动词汇（会被过滤掉）
FORBIDDEN_ACTIVITY_KEYWORDS = {
    'debugging', 'testing', 'writing', 'reviewing', 'fixing', 'answering', 
    'programming', 'development', 'coding', 'code', 'help', 
    'helping', 'qa', 'quality-assurance', 'documenting',
    'creating', 'building', 'designing', 'planning', 'managing', 'leading',
    'teaching', 'mentoring', 'supporting', 'assisting', 'improving',
    'optimizing', 'deploying', 'configuring', 'installing',
    'patching', 'troubleshooting', 'debug', 'fix', 'write',
    'create', 'build', 'develop', 'program', 'implement',
    'test', 'review', 'update', 'fixing-bugs', 'bug-fixing',
    'bug_fixing', 'documentation-writing', 'doc-writing', 'writing-docs',
    'community-support', 'answer-questions', 'help-others', 'assist-others'
}

# 维护相关的词汇映射（maintenance → bug_fix + feature）
MAINTENANCE_KEYWORDS = {
    'maintain', 'maintaining', 'maintenance', 'refactoring', 
    'dependency-update', 'dependency_updates', 'updates', 
    'upgrading', 'upgrade', 'dependency', 'deps'
}

# 定义允许的贡献风格（完全匹配前端映射）
ALLOWED_CONTRIBUTION_STYLES = {
    'bug_fix', 'feature', 'docs', 
    'community', 'review', 'test'
}

def extract_json_from_response(response: str) -> str:
    """
    从AI响应中提取JSON部分（修复版 - 正确处理```json标记）
    """
    # 尝试匹配 ```json ``` 块（标准格式）
    json_match = re.search(r'```json\s*(\{.*?\})\s*```', response, re.DOTALL)
    if json_match:
        return json_match.group(1).strip()
    
    # 尝试匹配 ``` ``` 块（通用格式）
    code_match = re.search(r'```\s*(\{.*?\})\s*```', response, re.DOTALL)
    if code_match:
        potential_json = code_match.group(1).strip()
        try:
            json.loads(potential_json)
            return potential_json
        except:
            pass
    
    # 尝试直接查找最外层的{}内容
    # 查找第一个 { 和最后一个 }
    first_brace = response.find('{')
    if first_brace != -1:
        brace_count = 0
        for i, char in enumerate(response[first_brace:], first_brace):
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    potential_json = response[first_brace:i+1]
                    try:
                        json.loads(potential_json)
                        return potential_json
                    except:
                        break
    
    # 最后尝试：如果响应本身就是JSON格式
    response_clean = response.strip()
    if response_clean.startswith('{') and response_clean.endswith('}'):
        try:
            json.loads(response_clean)
            return response_clean
        except:
            pass
    
    return ""

def validate_and_parse(response: str) -> Dict[str, Any]:
    """
    校验并解析AI响应（活动词汇过滤 + 维护词汇映射）
    
    Args:
        response: AI原始响应字符串
    
    Returns:
        解析后的字典，包含过滤后的skills和contribution_styles
    """
    try:
        # 提取JSON部分
        json_str = extract_json_from_response(response)
        
        if not json_str:
            logger.warning(f"No valid JSON found in response: {response[:200]}...")
            return {
                "skills": [],
                "contribution_styles": [],
                "raw_response": response,
                "error": "No valid JSON found in response"
            }
        
        # 解析JSON
        data = json.loads(json_str)
        
        # 提取并过滤skills字段（移除活动词汇）
        raw_skills = data.get('skills', [])
        if not isinstance(raw_skills, list):
            raw_skills = []
        
        # 过滤：移除包含活动词汇的技能
        filtered_skills = []
        for skill in raw_skills:
            if isinstance(skill, str):
                clean_skill = re.sub(r'[^\w\-]', '', skill.lower()).strip()
                # 检查是否包含活动词汇
                if clean_skill and clean_skill not in FORBIDDEN_ACTIVITY_KEYWORDS:
                    # 转换常见缩写
                    if clean_skill == 'k8s':
                        clean_skill = 'kubernetes'
                    elif clean_skill == 'c++' or clean_skill == 'cpp':
                        clean_skill = 'c-plus-plus'
                    
                    filtered_skills.append(clean_skill)
        
        # 提取并处理contribution_styles字段
        raw_styles = data.get('contribution_styles', [])
        if not isinstance(raw_styles, list):
            raw_styles = [raw_styles] if isinstance(raw_styles, str) else []
        
        # 处理维护相关词汇（映射为bug_fix + feature）
        processed_styles = []
        for style in raw_styles:
            if isinstance(style, str):
                clean_style = style.lower().strip()
                
                # 如果是维护相关词汇，映射为bug_fix + feature
                if clean_style in MAINTENANCE_KEYWORDS:
                    processed_styles.extend(['bug_fix', 'feature'])
                elif clean_style in ALLOWED_CONTRIBUTION_STYLES:
                    processed_styles.append(clean_style)
        
        # 过滤：只保留允许的贡献风格
        filtered_styles = []
        for style in processed_styles:
            if style in ALLOWED_CONTRIBUTION_STYLES:
                filtered_styles.append(style)
        
        # 去重（保持顺序）
        filtered_skills = list(dict.fromkeys(filtered_skills))
        filtered_styles = list(dict.fromkeys(filtered_styles))
        
        return {
            "skills": filtered_skills,
            "contribution_styles": filtered_styles,
            "raw_response": response,
            "parsed_json": data,
            "original_skills": raw_skills,  # 用于调试
            "original_styles": raw_styles   # 用于调试
        }
        
    except json.JSONDecodeError as e:
        logger.warning(f"JSON解析失败: {str(e)}, response='{response[:200]}...'")
        return {
            "skills": [],
            "contribution_styles": [],
            "raw_response": response,
            "error": f"JSON解析错误: {str(e)}"
        }
    except Exception as e:
        logger.error(f"AI响应验证意外错误: {str(e)}, response='{response[:200]}...'")
        return {
            "skills": [],
            "contribution_styles": [],
            "raw_response": response,
            "error": f"验证错误: {str(e)}"
        }

def test_maintenance_mapping():
    """
    测试维护词汇映射
    """
    test_case = {"skills": ["react", "typescript"], "contribution_styles": ["maintain"]}
    print("--- 测试维护词汇映射 ---")
    print(f"原始输入: {test_case}")
    
    # 模拟JSON字符串
    json_str = json.dumps(test_case)
    result = validate_and_parse(json_str)
    
    print(f"处理后: {result['skills']}, {result['contribution_styles']}")
    print(f"维护词汇'maintain' → {result['contribution_styles']}")

if __name__ == "__main__":
    test_maintenance_mapping()