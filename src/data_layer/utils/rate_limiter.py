import sys
import os
import time
import requests
from functools import wraps

# 获取当前文件的目录并添加到Python路径
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
config_dir = os.path.join(parent_dir, 'config')

# 临时添加到路径
sys.path.insert(0, config_dir)

try:
    from settings import UNAUTHENTICATED_LIMITS
finally:
    # 移除临时添加的路径
    if config_dir in sys.path:
        sys.path.remove(config_dir)

def github_rate_limiter(max_retry=2):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            retry_count = 0
            while retry_count <= max_retry:
                try:
                    return func(*args, **kwargs)
                except requests.exceptions.HTTPError as e:
                    if e.response.status_code == 403:  # 包含429
                        # 检查是否有token，决定等待时间
                        if hasattr(args[0], 'token') and args[0].token:
                            reset_time = int(e.response.headers.get("X-RateLimit-Reset", 0))
                            wait_seconds = max(reset_time - time.time(), 1)
                        else:
                            wait_seconds = UNAUTHENTICATED_LIMITS["retry_delay"]
                        
                        print(f"Rate limit hit, waiting {wait_seconds}s...")
                        time.sleep(wait_seconds)
                        retry_count += 1
                    elif e.response.status_code == 401:
                        raise e
                    else:
                        raise
            raise Exception("GitHub API rate limit exceeded after retries")
        return wrapper
    return decorator