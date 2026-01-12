import os
from dotenv import load_dotenv
from pathlib import Path

# 获取项目根目录（settings.py 在 src/data_layer/config/ 下，向上3级到项目根）
current_file = Path(__file__)
project_root = current_file.parent.parent.parent.parent
env_path = project_root / ".env"

# 从项目根目录加载 .env 文件
load_dotenv(dotenv_path=env_path)

# GitHub API 配置 (首期最小化)
GITHUB_API = {
    "TOKEN": os.getenv("GITHUB_TOKEN", ""),  # 可选，为空时使用无认证模式
    "SEARCH_RESULTS_LIMIT": 100,  # 最大搜索上限（分批请求）
    "BATCH_SIZE": 15,            # 每批请求数量（节省API配额）
    "MAX_RETRY": 2,             # 首期限流重试2次
    "DEFAULT_QUERY_PARAMS": {
        "sort": "updated",
        "order": "desc",
        "per_page": 15
    }
}

# API基础配置
BASE_URL = "https://api.github.com"

# 无token模式下的限制
UNAUTHENTICATED_LIMITS = {
    "requests_per_hour": 10,    # 无token限制为10次/小时
    "max_results": 45,          # 无token时最大返回45条（3批次）
    "retry_delay": 60           # 限流时等待时间（秒）
}