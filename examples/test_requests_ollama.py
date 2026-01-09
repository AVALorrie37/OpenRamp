import requests
import json
import time

# 1. 测试列出模型
print("1. 测试列出模型...")
try:
    response = requests.get("http://localhost:11434/api/tags", timeout=30)
    response.raise_for_status()
    print(f"✅ 列出模型成功: {response.json()}")
except Exception as e:
    print(f"❌ 列出模型失败: {e}")
    exit(1)

# 2. 测试聊天 (修复流式响应)
print("\n2. 测试聊天...")
try:
    payload = {
        "model": "gemma2:2b",
        "messages": [
            {"role": "user", "content": "你好，世界！"}
        ],
        "options": {
            "temperature": 0.1,
            "num_predict": 50
        },
        "stream": False  # <--- 关键：禁用流式输出
    }
    
    start_time = time.time()
    response = requests.post(
        "http://localhost:11434/api/chat",
        json=payload,
        timeout=120
    )
    response.raise_for_status()
    end_time = time.time()
    
    result = response.json()
    print(f"✅ 聊天成功! 耗时: {end_time - start_time:.2f}s")
    print(f"🤖 响应: {result['message']['content'][:100]}...")
    
except requests.exceptions.HTTPError as e:
    print(f"❌ HTTP 错误: {e}")
    print(f"   响应内容: {response.text}")
except Exception as e:
    print(f"❌ 聊天失败: {e}")
    print(f"   错误类型: {type(e).__name__}")