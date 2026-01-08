"""
简单的 API 测试脚本。
测试离线数据与在线数据能否正常获取
--------------------------------
使用方法
1.安装依赖：
   pip install -r requirements.txt
2.启动 API 服务器：
   python -m src.api.server
3.启动 Streamlit 前端（新终端）：
   streamlit run examples/streamlit_dashboard.py
4.测试 API：
    python examples/test_2_data_mode.py
"""

import requests
import json

API_BASE = "http://localhost:8000"


def test_offline_mode():
    """测试离线模式"""
    print("测试离线模式...")
    response = requests.get(f"{API_BASE}/api/repos", params={"mode": "offline", "limit": 5})
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"模式: {data['mode']}")
        print(f"仓库数量: {len(data['repos'])}")
        if data['repos']:
            print(f"第一个仓库: {data['repos'][0]['repo_id']}")
            print(f"综合分: {data['repos'][0]['composite_score']}")
    else:
        print(f"错误: {response.text}")


def test_online_mode():
    """测试在线模式"""
    print("\n测试在线模式...")
    response = requests.get(
        f"{API_BASE}/api/repos",
        params={
            "mode": "online",
            "repo_ids": ["X-lab2017/open-digger"],
        }
    )
    print(f"状态码: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"模式: {data['mode']}")
        print(f"仓库数量: {len(data['repos'])}")
        if data['repos']:
            repo = data['repos'][0]
            print(f"仓库: {repo['repo_id']}")
            print(f"综合分: {repo['composite_score']}")
    else:
        print(f"错误: {response.text}")


if __name__ == "__main__":
    try:
        test_offline_mode()
        test_online_mode()
    except requests.exceptions.ConnectionError:
        print("❌ 无法连接到API服务器，请先启动: python api_server.py")
    except Exception as e:
        print(f"❌ 测试失败: {e}")

