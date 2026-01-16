#!/usr/bin/env python3
"""
Agent2 单独测试脚本 - 维护词汇映射版
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
    测试Agent2（画像解析器）功能 - 维护词汇映射版
    """
    print("🧪 开始测试Agent2（画像解析器）...")
    print("🔍 重点验证：维护词汇映射 + 活动词汇过滤")
    
    # 初始化组件
    provider = OllamaProvider()
    prompt_manager = PromptManager()
    
    # 测试用例（包含维护词汇）
    test_inputs = [
        "我擅长Redis缓存优化和K8s故障排查，喜欢修bug和写文档",
        "我会用Docker部署服务，也修过Kubernetes的bug",
        "我喜欢写文档和帮助新人答疑",  # help应该被过滤
        "主要做Python后端开发，熟悉Django框架，也会写测试",
        "擅长SQL优化和数据库性能调优，经常做代码审查",
        "用React做前端开发，熟悉TypeScript，也维护项目的依赖更新",  # maintain应该映射为bug_fix+feature
        "参与开源项目，喜欢修bug、代码审查和答疑",  # debugging, qa应该被过滤
        "做Java开发，主要开发新功能，偶尔写文档",
        "熟悉Go语言，喜欢测试和代码审查",
        "我只是个普通用户，没有特别的贡献偏好",  # 应该返回空数组，无额外文本
        "我平时只写代码，不做其他事情"  # coding应该被过滤
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
                prompt_template=user_input, 
                variables={},
                system_prompt=system_prompt,
                temperature=0.0
            )
            
            print(f"🤖 AI原始响应:\n{ai_response}")
            
            # 修复：```json ``` 是标准格式，不应该报警告
            clean_response = ai_response.strip()
            has_non_json_content = not (
                clean_response.startswith('{') and clean_response.endswith('}') and clean_response.count('{') == clean_response.count('}')
            ) and not ('```json' in clean_response or '```' in clean_response)
            
            if has_non_json_content:
                print(f"   ⚠️  检测到非JSON内容（AI可能输出了解释文本）")
            else:
                print(f"   ✅ JSON格式正确（包含标准代码块标记）")
            
            # 解析结果（活动词汇过滤 + 维护词汇映射）
            parsed_result = validate_and_parse(ai_response)
            
            print(f"\n✅ 最终结果 (已过滤 + 映射):")
            print(f"   技能 (技术栈): {parsed_result['skills']}")
            print(f"   贡献风格 (偏好): {parsed_result['contribution_styles']}")
            
            # 显示过滤详情
            if parsed_result.get('original_skills'):
                original_skills = parsed_result.get('original_skills', [])
                filtered_skills = set(original_skills) - set(parsed_result['skills'])
                if filtered_skills:
                    print(f"   🚫 过滤的技能: {list(filtered_skills)}")
            
            if parsed_result.get('original_styles'):
                original_styles = parsed_result.get('original_styles', [])
                filtered_styles = set(original_styles) - set(parsed_result['contribution_styles'])
                if filtered_styles:
                    print(f"   🚫 过滤的风格: {list(filtered_styles)}")
            
            # 验证结果
            print(f"\n🔍 结果验证:")
            
            # 1. 验证skills不包含活动词汇
            activity_words_in_skills = [s for s in parsed_result['skills'] if any(activity in s for activity in ['debug', 'test', 'write', 'review', 'fix', 'help', 'maintain', 'code', 'program', 'develop'])]
            if not activity_words_in_skills:
                print(f"   ✅ skills不含活动词汇")
            else:
                print(f"   ⚠️  skills可能包含活动词汇: {activity_words_in_skills}")
            
            # 2. 验证styles只在允许列表
            invalid_styles = [s for s in parsed_result['contribution_styles'] 
                            if s not in ['bug_fix', 'feature', 'docs', 'community', 'review', 'test']]
            if not invalid_styles:
                print(f"   ✅ styles格式正确")
            else:
                print(f"   ❌ styles包含无效值: {invalid_styles}")
            
            # 3. 验证维护词汇映射
            if "维护项目的依赖更新" in user_input or "维护项目" in user_input:
                if 'bug_fix' in parsed_result['contribution_styles'] and 'feature' in parsed_result['contribution_styles']:
                    print(f"   ✅ 维护词汇映射正确")
                else:
                    print(f"   ⚠️  维护词汇映射可能有问题")
            
            # 4. 验证空情况处理
            if "普通用户" in user_input or "只写代码" in user_input:
                if not parsed_result['skills'] and not parsed_result['contribution_styles']:
                    print(f"   ✅ 空输入处理正确")
                else:
                    print(f"   ⚠️  空输入处理可能有问题")
            
            if 'error' in parsed_result:
                print(f"   ⚠️  解析警告: {parsed_result['error']}")
                
        except Exception as e:
            print(f"❌ 测试失败: {str(e)}")
            continue
    
    print(f"\n{'='*60}")
    print("✅ Agent2测试完成！")
    print("🔍 请检查：")
    print("- 维护词汇是否正确映射为[bug_fix, feature]")
    print("- 活动词汇是否被正确过滤")
    print("- JSON代码块标记是否被正确识别")
    print("="*60)

if __name__ == "__main__":
    test_agent2()