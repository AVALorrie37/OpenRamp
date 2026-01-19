#!/usr/bin/env python3
"""
Agent1 单独测试脚本 - 固定语言偏好版
"""
import sys
import os

# 获取项目根目录
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)  # 上一级目录 (OpenRamp/)
sys.path.insert(0, project_root)

# 现在可以正确导入了
try:
    from src.core.ai.conversation_handler import ConversationHandler
except ImportError as e:
    print(f"❌ 导入失败: {e}")
    print(f"当前工作目录: {os.getcwd()}")
    print(f"Python路径: {sys.path}")
    sys.exit(1)

def test_agent1_fixed_language():
    """
    测试Agent1（交互协调员）功能 - 固定语言偏好版
    """
    print("🧪 开始测试Agent1（交互协调员）...")
    print("🔍 重点验证：固定语言偏好 + 多轮对话记忆 + Agent2总结功能")
    
    # 初始化组件
    handler = ConversationHandler()
    
    # 设置用户语言偏好（模拟登录时的选择）
    handler.set_user_language('chinese')  # 固定为中文
    
    # 测试初始问候语
    print(f"\n🎯 初始问候语:")
    greeting_zh = handler.get_initial_greeting('chinese')
    greeting_en = handler.get_initial_greeting('english')
    print(f"   中文: {greeting_zh}")
    print(f"   英文: {greeting_en}")
    
    # 测试多轮对话（全部使用中文，验证语言一致性）
    test_inputs = [
        "我擅长Python和Django开发",  # 中文技能描述 - 应该提取python, django
        "我也熟悉Docker和Kubernetes",  # 中文技能补充 - 应该添加docker, kubernetes
        "我喜欢修bug和写文档",  # 中文偏好描述 - 应该添加bug_fix, docs
        "确认我的信息",  # 中文确认 - 应该触发Agent2总结
        "搜索项目",  # 中文搜索 - 应该使用完整画像
    ]
    
    accumulated_skills = set()
    accumulated_styles = set()
    
    for i, user_input in enumerate(test_inputs, 1):
        print(f"\n{'='*60}")
        print(f"测试 {i}: '{user_input}'")
        print(f"{'='*60}")
        
        try:
            # 处理用户输入
            result = handler.process_user_input(user_input)
            
            print(f"🤖 回复: {result['reply']}")
            print(f">Action: {result['action']}")
            
            if result['data']:
                print(f"   数据: {result['data']}")
                
                # 累积技能和风格
                if 'skills' in result['data']:
                    accumulated_skills.update(result['data']['skills'])
                if 'contribution_styles' in result['data']:
                    accumulated_styles.update(result['data']['contribution_styles'])
                
                # 打印当前累积的状态
                print(f"   累积技能: {list(accumulated_skills)}")
                print(f"   累积偏好: {list(accumulated_styles)}")
            
            # 验证语言一致性（由于设置了固定语言，应该始终是中文）
            if any(c in result['reply'] for c in '你好谢谢确认搜索项目'):  # 中文关键词
                print(f"   ✅ 语言一致性正常（始终中文）")
            else:
                print(f"   ⚠️  语言一致性可能有问题（应该始终中文）")
            
            # 验证Agent2协调
            if 'PARSE_PROFILE' in result['action'] or 'skills' in result.get('data', {}):
                print(f"   ✅ 与Agent2协调正常")
            
            # 验证多轮记忆
            if i >= 2:  # 从第二轮开始验证记忆
                if 'Docker' in user_input or 'Kubernetes' in user_input:
                    if any(skill in ['python', 'django'] for skill in accumulated_skills):
                        print(f"   ✅ 多轮记忆正常（保留了之前的技能）")
                    else:
                        print(f"   ⚠️  多轮记忆可能有问题（未保留之前的技能）")
            
        except Exception as e:
            print(f"❌ 测试失败: {str(e)}")
            continue
    
    # 最终验证：所有技能和偏好都应该被正确累积
    print(f"\n{'='*60}")
    print("📊 最终累积结果:")
    print(f"   技能: {sorted(list(accumulated_skills))}")
    print(f"   偏好: {sorted(list(accumulated_styles))}")
    
    # 验证关键技能是否都被提取
    expected_skills = {'python', 'django', 'docker', 'kubernetes'}
    expected_styles = {'bug_fix', 'docs'}
    
    missing_skills = expected_skills - accumulated_skills
    missing_styles = expected_styles - accumulated_styles
    
    if not missing_skills:
        print(f"   ✅ 所有技能都被正确提取")
    else:
        print(f"   ⚠️  缺少技能: {missing_skills}")
    
    if not missing_styles:
        print(f"   ✅ 所有偏好都被正确提取")
    else:
        print(f"   ⚠️  缺少偏好: {missing_styles}")
    
    print(f"\n{'='*60}")
    print("✅ Agent1测试完成！")
    print("🔍 请检查：")
    print("- 语言一致性是否正常（始终使用设置的语言）")
    print("- 多轮对话记忆是否正常")
    print("- Agent2总结功能是否正常")
    print("- 动作指令解析是否正确")
    print("- 技能和偏好是否正确累积")
    print("="*60)

def test_english_language():
    """测试英文语言偏好"""
    print("\n🧪 测试英文语言偏好...")
    
    handler = ConversationHandler()
    handler.set_user_language('english')  # 设置为英文
    
    # 测试英文对话
    inputs = [
        "I work with Python and Django",
        "I also know Docker and Kubernetes",
        "I prefer to fix bugs and write documentation"
    ]
    
    for inp in inputs:
        result = handler.process_user_input(inp)
        print(f"   输入: {inp}")
        print(f"   回复: {result['reply']}")
        
        # 验证英文回复
        if any(word in result['reply'].lower() for word in ['hello', 'work', 'know', 'prefer']):
            print(f"   ✅ 英文语言偏好正常")
        else:
            print(f"   ⚠️  英文语言偏好可能有问题")
    
    # 获取当前画像
    current_profile = handler.get_current_profile()
    print(f"   当前画像: {current_profile}")

def test_language_switching():
    """测试语言切换功能"""
    print("\n🧪 测试语言切换功能...")
    
    handler = ConversationHandler()
    
    # 先设置中文
    handler.set_user_language('chinese')
    result1 = handler.process_user_input("我擅长Python")
    print(f"   中文模式回复: {result1['reply']}")
    
    # 切换到英文
    handler.set_user_language('english')
    result2 = handler.process_user_input("I work with React")
    print(f"   英文模式回复: {result2['reply']}")
    
    # 验证语言切换
    if any(c in result1['reply'] for c in '你好') and any(word in result2['reply'].lower() for word in ['hello', 'work']):
        print(f"   ✅ 语言切换功能正常")
    else:
        print(f"   ⚠️  语言切换功能可能有问题")

if __name__ == "__main__":
    test_agent1_fixed_language()
    test_english_language()
    test_language_switching()