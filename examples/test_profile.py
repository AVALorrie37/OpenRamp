"""验证ProfileBuilder功能的测试脚本"""
import sys
import os

# 确保能导入src
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from src.core import ProfileBuilder

def test_profile():
    """测试开发者画像构建"""
    builder = ProfileBuilder()
    
    test_cases = [
        "我擅长Python和SQL优化，经常修复数据库性能问题",
        "我喜欢写文档，也帮社区解答问题",
        "我主要做前端开发，熟悉React和Vue"
    ]
    
    for text in test_cases:
        print(f"\n输入: {text}")
        result = builder.build_from_text(text)
        print(f"输出: {result}")
        print("-" * 50)

if __name__ == "__main__":
    test_profile()