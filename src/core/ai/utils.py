"""AI模块工具函数 - 匹配前端贡献风格映射"""
import json
import logging
import re
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# 定义允许的贡献风格（完全匹配前端映射）
ALLOWED_CONTRIBUTION_STYLES = {
    'bug_fix', 'feature', 'docs', 
    'community', 'review', 'test'
}

def extract_json_from_response(response: str) -> str:
    """
    从AI响应中提取JSON部分（防止单行解释文字干扰）
    """
    # 尝试匹配 ```json ``` 块
    json_match = re.search(r'```json\s*(.*?)\s*```', response, re.DOTALL)
    if json_match:
        return json_match.group(1).strip()
    
    # 尝试匹配 ``` ``` 块（假设内容是JSON）
    code_match = re.search(r'```\s*(.*?)\s*```', response, re.DOTALL)
    if code_match:
        potential_json = code_match.group(1).strip()
        try:
            # 验证是否为有效JSON
            json.loads(potential_json)
            return potential_json
        except:
            pass
    
    # 直接尝试解析整个响应
    return response.strip()

def validate_and_parse(response: str) -> Dict[str, Any]:
    """
    安全校验并解析AI响应（匹配前端映射）
    
    Args:
        response: AI原始响应字符串
    
    Returns:
        解析后的字典，包含skills和contribution_styles
    """
    try:
        # 提取JSON部分
        json_str = extract_json_from_response(response)
        
        # 解析JSON
        data = json.loads(json_str)
        
        # 校验并清理skills字段
        skills = data.get('skills', [])
        if not isinstance(skills, list):
            skills = []
        # 确保所有技能标签为小写英文字符串
        cleaned_skills = []
        for skill in skills:
            if isinstance(skill, str):
                # 转换为小写并移除非字母数字连字符字符
                clean_skill = re.sub(r'[^\w\-]', '', skill.lower())
                if clean_skill:  # 只保留非空标签
                    cleaned_skills.append(clean_skill)
        
        # 校验contribution_styles字段（支持多选，无匹配时返回空数组）
        styles = data.get('contribution_styles', [])
        if not isinstance(styles, list):
            styles = [styles] if isinstance(styles, str) else []
        
        # 清理并验证风格（只保留前端认可的风格）
        cleaned_styles = []
        for style in styles:
            if isinstance(style, str) and style in ALLOWED_CONTRIBUTION_STYLES:
                cleaned_styles.append(style)
        
        # 如果没有有效的风格，返回空数组（匹配前端设计）
        if not cleaned_styles:
            cleaned_styles = []
        
        return {
            "skills": cleaned_skills,
            "contribution_styles": cleaned_styles,  # 完全匹配前端字段名
            "raw_response": response,
            "parsed_json": data  # 保留原始解析结果用于调试
        }
        
    except json.JSONDecodeError as e:
        logger.warning(f"JSON解析失败: {str(e)}, response='{response[:200]}...'")
        return {
            "skills": [],
            "contribution_styles": [],  # 匹配前端设计
            "raw_response": response,
            "error": f"JSON解析错误: {str(e)}"
        }
    except Exception as e:
        logger.error(f"AI响应验证意外错误: {str(e)}, response='{response[:200]}...'")
        return {
            "skills": [],
            "contribution_styles": [],  # 匹配前端设计
            "raw_response": response,
            "error": f"验证错误: {str(e)}"
        }

def test_agent2_output():
    """
    Agent2输出测试函数
    """
    test_cases = [
        "我擅长Redis缓存优化和K8s故障排查，喜欢修bug和写文档",
        "我会用Docker部署服务，也修过Kubernetes的bug",
        "我喜欢写文档和帮助新人答疑",
        "主要做Python后端开发，熟悉Django框架，也会写测试",
        "擅长SQL优化和数据库性能调优，经常做代码审查",
        "用React做前端开发，熟悉TypeScript，也维护项目的依赖更新",
        "参与开源项目，喜欢修bug、代码审查和答疑",
        "做Java开发，主要开发新功能，偶尔写文档",
        "熟悉Go语言，喜欢测试和维护工作",
        "我只是个普通用户，没有特别的贡献偏好"  # 应该返回空数组
    ]
    
    print("🧪 开始测试Agent2输出...")
    for i, case in enumerate(test_cases, 1):
        print(f"\n--- 测试案例 {i}: '{case}' ---")
        # 这里应该是AI的真实输出，暂时模拟一下格式验证
        mock_response = f'{{"skills": ["mock"], "contribution_styles": ["unknown"]}}'
        result = validate_and_parse(mock_response)
        print(f"✅ 技能: {result['skills']}")
        print(f"✅ 贡献风格: {result['contribution_styles']}")
        if 'error' in result:
            print(f"❌ 错误: {result['error']}")

if __name__ == "__main__":
    test_agent2_output()