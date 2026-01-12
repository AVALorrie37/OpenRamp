"""
测试githubAPI
Run with:
    python examples/test_github_api.py
"""

import os
import sys
from pathlib import Path

# 获取项目根目录
project_root = Path(__file__).parent.parent  # examples的父目录是项目根目录
src_path = project_root 

# 将src目录添加到Python路径的开头（推荐做法）
sys.path.insert(0, str(src_path))

# 现在可以导入src中的模块了，使用完整包路径
from src.data_layer.online.GithubAPI.client import GitHubClient

try:
    client = GitHubClient()
    print(f"Using {'authenticated' if client.token else 'unauthenticated'} mode")
    results = client.search_repos(["python", "machine learning"])

    print(f"Found {len(results)} repositories:")
    for i, repo in enumerate(results, 1):
        print(f"{i}. {repo.repo_id}")
        print(f"   Keywords: {repo.keywords}")
        print(f"   Stars: {repo.metadata.stars}")
        print(f"   Updated: {repo.metadata.last_updated}")
        print()
except ValueError as e:
    print(f"Error: {e}")
    print("Please set GITHUB_TOKEN environment variable or check rate limits")
except ImportError as e:
    print(f"Import error: {e}")
    print("Make sure src directory is in Python path")
    print(f"Current Python path: {sys.path}")
    # 尝试调试路径
    github_api_path = project_root / "src/data_layer/online/GithubAPI"
    print(f"Looking for GithubAPI at: {github_api_path}")
    print(f"GithubAPI dir exists: {github_api_path.exists()}")
    if github_api_path.exists():
        print(f"Contents of GithubAPI: {os.listdir(github_api_path)}")