"""测试对话式开发者画像构建功能"""
import sys
import os

# 确保能导入src
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.core import ConversationalProfileBuilder, TriggerAction


def test_conversation():
    """测试多轮对话功能"""
    builder = ConversationalProfileBuilder()
    user_id = "test_user_001"
    
    print("=" * 60)
    print("对话式开发者画像测试")
    print("=" * 60)
    
    # 开始会话
    greeting = builder.start_session(user_id)
    print(f"\n🤖 助手: {greeting}")
    
    # 模拟多轮对话
    test_inputs = [
        "我主要用Python和JavaScript，做过一些数据分析的项目",
        "对机器学习也有一些了解，用过PyTorch",
        "我比较喜欢修复bug和写文档，不太喜欢从头开发大功能",
    ]
    
    for user_input in test_inputs:
        print(f"\n👤 用户: {user_input}")
        result = builder.chat(user_id, user_input)
        print(f"\n🤖 助手: {result['reply']}")
        print(f"   [状态: {result['status']}, 动作: {result.get('action', 'NONE')}]")
        print(f"   [技能: {result['skills']}]")
        print(f"   [偏好: {result['preferences']}]")
        print(f"   [经验: {result.get('experience', 'N/A')}]")
        
        if result.get("confirmed"):
            print("\n✅ 画像已确认并保存!")
            print(f"最终画像: {result['profile']}")
            break
    
    # 如果还没确认，发送确认指令
    if not result.get("confirmed") and result["status"] == "pending":
        print(f"\n👤 用户: 确认")
        result = builder.chat(user_id, "确认")
        print(f"\n🤖 助手: {result['reply']}")
        if result.get("profile"):
            print(f"\n📋 最终画像（GitHub 搜索格式）:")
            profile = result['profile']
            print(f"   Skills: {profile.get('skills', [])}")
            print(f"   Contribution Types: {profile.get('contribution_types', [])}")
            print(f"   Topics: {profile.get('topics', [])}")
            print(f"   Experience: {profile.get('experience_level', 'N/A')}")


def test_keyword_triggers():
    """测试关键词触发功能"""
    builder = ConversationalProfileBuilder()
    user_id = "test_user_triggers"
    
    print("\n" + "=" * 60)
    print("关键词触发测试")
    print("=" * 60)
    
    # 开始会话
    builder.start_session(user_id)
    
    # 测试重置
    print("\n--- 测试重置触发 ---")
    result = builder.chat(user_id, "重新开始")
    print(f"动作: {result.get('action')}")
    print(f"回复: {result['reply'][:50]}...")
    
    # 测试搜索（没有画像时）
    print("\n--- 测试搜索触发（无画像）---")
    builder.start_session(user_id)
    result = builder.chat(user_id, "帮我找项目")
    print(f"动作: {result.get('action')}")
    print(f"回复: {result['reply'][:50]}...")


def test_search_with_profile():
    """测试有画像时的搜索功能"""
    builder = ConversationalProfileBuilder()
    user_id = "test_user_search"
    
    print("\n" + "=" * 60)
    print("搜索功能测试（预留接口）")
    print("=" * 60)
    
    # 先创建一个已确认的画像
    builder.start_session(user_id)
    builder.chat(user_id, "我是 Python 后端开发，熟悉 Django 和 FastAPI")
    builder.chat(user_id, "喜欢修 bug 和写文档")
    
    # 手动触发确认（假设状态已经是 pending）
    result = builder.chat(user_id, "确认")
    
    if result.get("confirmed"):
        print(f"\n画像已保存: {result['profile']}")
        
        # 测试搜索
        print("\n--- 测试搜索触发（有画像）---")
        builder.start_session(user_id)  # 新会话
        result = builder.chat(user_id, "搜索项目")
        print(f"动作: {result.get('action')}")
        print(f"搜索就绪: {result.get('search_ready', False)}")
        print(f"回复: {result['reply']}")


def test_cached_profile():
    """测试已缓存画像获取"""
    builder = ConversationalProfileBuilder()
    user_id = "test_user_001"  # 使用之前测试的用户
    
    print("\n" + "=" * 60)
    print("缓存画像获取测试")
    print("=" * 60)
    
    profile = builder.get_cached_profile(user_id)
    if profile:
        print(f"\n✅ 找到缓存的画像:")
        print(f"   Skills: {profile.get('skills', [])}")
        print(f"   Contribution Types: {profile.get('contribution_types', [])}")
        print(f"   Topics: {profile.get('topics', [])}")
        print(f"   Experience: {profile.get('experience_level', 'N/A')}")
    else:
        print("\n❌ 没有找到缓存的画像")


if __name__ == "__main__":
    print("选择测试:")
    print("1. 多轮对话测试")
    print("2. 关键词触发测试")
    print("3. 搜索功能测试")
    print("4. 缓存获取测试")
    print("5. 运行所有测试")
    
    choice = input("\n请输入选项 (默认5): ").strip() or "5"
    
    if choice == "1":
        test_conversation()
    elif choice == "2":
        test_keyword_triggers()
    elif choice == "3":
        test_search_with_profile()
    elif choice == "4":
        test_cached_profile()
    else:
        test_conversation()
        test_keyword_triggers()
        test_search_with_profile()
        test_cached_profile()
