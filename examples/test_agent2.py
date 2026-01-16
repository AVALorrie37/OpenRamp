#!/usr/bin/env python3
"""
Agent2 单独测试脚本 - 清晰分工版本
"""
import sys
import os

# 获取项目根目录
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)  # 上一级目录 (OpenRamp/)
sys.path.insert(0, project_root)

# 现在可以正确导入了
try:
    from src.core.ai.provider import OllamaProvider
    from src.core.ai.prompts import PromptManager
    from src.core.ai.utils import validate_and_parse
except ImportError as e:
    print(f"❌ 导入失败: {e}")
    print(f"当前工作目录: {os.getcwd()}")
    print(f"Python路径: {sys.path}")
    sys.exit(1)

def test_agent2():
    """
    测试Agent2（画像解析器）功能 - 清晰分工版本
    """
    print("🧪 开始测试Agent2（画像解析器）...")
    print("🔍 注意：skills=技术栈（用于仓库匹配），styles=贡献偏好（用于推荐）")
    print("🔍 验证：skills不应包含贡献活动词汇（如debugging, fixing等）")
    
    # 初始化组件
    provider = OllamaProvider()
    prompt_manager = PromptManager()
    
    # 测试用例（重点关注分工）
    test_inputs = [
        "我擅长Redis缓存优化和K8s故障排查，喜欢修bug和写文档",  # skills: redis,k8s  styles: bug_fix,docs
        "我会用Docker部署服务，也修过Kubernetes的bug",  # skills: docker,k8s  styles: bug_fix
        "我喜欢写文档和帮助新人答疑",  # skills: []  styles: docs,community
        "主要做Python后端开发，熟悉Django框架，也会写测试",  # skills: python,django,test  styles: test
        "擅长SQL优化和数据库性能调优，经常做代码审查",  # skills: sql  styles: review
        "用React做前端开发，熟悉TypeScript，也维护项目的依赖更新",  # skills: react,typescript  styles: maintenance
        "参与开源项目，喜欢修bug、代码审查和答疑",  # skills: []  styles: bug_fix,review,community
        "做Java开发，主要开发新功能，偶尔写文档",  # skills: java  styles: feature,docs
        "熟悉Go语言，喜欢测试和代码审查",  # skills: go  styles: test,review
        "我只是个普通用户，没有特别的贡献偏好",  # skills: []  styles: []
        "我平时只写代码，不做其他事情"  # skills: []  styles: []
    ]
    
    for i, user_input in enumerate(test_inputs, 1):
        print(f"\n{'='*60}")
        print(f"测试 {i}: '{user_input}'")
        print(f"{'='*60}")
        
        try:
            # 获取Agent2提示词
            system_prompt, user_prompt = prompt_manager.get_agent_prompt(
                'profile_parser',
                input_text=user_input
            )
            
            print(f"📋 系统提示词长度: {len(system_prompt)} 字符")
            
            # 调用AI
            print("🚀 调用Ollama...")
            ai_response = provider.generate(
                prompt_template=user_input,  # Agent2直接使用输入文本
                variables={},
                system_prompt=system_prompt,
                temperature=0.1  # 降低随机性，提高一致性
            )
            
            print(f"🤖 AI响应:\n{ai_response}")
            
            # 解析结果
            parsed_result = validate_and_parse(ai_response)
            
            print(f"✅ 解析结果:")
            print(f"   技能 (用于仓库匹配): {parsed_result['skills']}")
            print(f"   贡献风格 (用于推荐): {parsed_result['contribution_styles']}")
            
            # 验证分工（skills不应包含贡献活动词汇）
            tech_keywords = set(['debugging', 'fixing', 'writing', 'reviewing', 'answering', 'maintaining'])
            skills_with_activities = [skill for skill in parsed_result['skills'] if any(k in skill for k in tech_keywords)]
            
            if skills_with_activities:
                print(f"   ⚠️  警告：skills中可能包含了活动词汇: {skills_with_activities}")
            else:
                print(f"   ✅ 分工清晰：skills仅包含技术栈")
            
            # 验证风格格式
            valid_styles = all(style in ['bug_fix', 'feature', 'docs', 'community', 'review', 'test'] 
                             for style in parsed_result['contribution_styles'])
            if valid_styles:
                print(f"   ✅ 风格格式正确")
            else:
                print(f"   ❌ 风格格式错误：包含无效值")
            
            if 'error' in parsed_result:
                print(f"❌ 解析错误: {parsed_result['error']}")
                
        except Exception as e:
            print(f"❌ 测试失败: {str(e)}")
            continue
    
    print(f"\n{'='*60}")
    print("✅ Agent2测试完成！")
    print("🔍 请检查：")
    print("- skills是否只包含技术栈（编程语言、工具、框架）")
    print("- styles是否只包含贡献偏好（bug_fix, feature, docs等）")
    print("- 是否避免了重复词汇（如skills中不应有'debugging'）")
    print("- 无匹配时是否返回空数组 []")
    print("="*60)

if __name__ == "__main__":
    test_agent2()