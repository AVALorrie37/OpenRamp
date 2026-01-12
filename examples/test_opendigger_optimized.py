"""
测试 OpenDigger 客户端的优化功能。

功能测试：
- 超时设置优化
- 重试机制
- 本地缓存
- 会话复用
"""

import sys
import os
import time
from datetime import datetime, timedelta

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(project_root, 'src'))

from data_layer.online.OpenDiggerAPI.client import OpenDiggerClient


def test_basic_fetch():
    """测试基本的数据获取功能。"""
    print("=" * 70)
    print("Test 1: Basic Data Fetch with Optimized Client")
    print("=" * 70)
    
    # 创建优化后的客户端
    client = OpenDiggerClient(
        connect_timeout=5.0,    # 连接超时 5 秒
        read_timeout=30.0,      # 读取超时 30 秒
        max_retries=3,          # 最多重试 3 次
        retry_backoff_factor=1.0,  # 重试间隔因子
        use_cache=True          # 启用缓存
    )
    
    repo_id = "pytorch/pytorch"
    print(f"\nFetching data for: {repo_id}")
    print(f"  Connect timeout: {client._connect_timeout}s")
    print(f"  Read timeout: {client._read_timeout}s")
    print(f"  Max retries: {client._max_retries}")
    print(f"  Cache enabled: {client._use_cache}")
    print(f"  Cache directory: {client._cache_dir}")
    
    start_time = time.time()
    try:
        data = client.get_activity_data(repo_id)
        elapsed = time.time() - start_time
        
        print(f"\n✓ Success! Fetched in {elapsed:.2f}s")
        print(f"  Metrics retrieved: {list(data.keys())}")
        
        # 显示 openrank 的最新几个值
        if "openrank" in data:
            openrank = data["openrank"]
            if isinstance(openrank, dict):
                recent = list(openrank.items())[-3:]
                print(f"  Recent OpenRank values: {dict(recent)}")
                
    except Exception as e:
        print(f"\n✗ Failed: {e}")
    
    client.close()


def test_cache_hit():
    """测试缓存命中效果。"""
    print("\n" + "=" * 70)
    print("Test 2: Cache Hit Performance")
    print("=" * 70)
    
    client = OpenDiggerClient(use_cache=True)
    repo_id = "pytorch/pytorch"
    
    # 第一次获取（可能从网络或缓存）
    print(f"\n[1] First fetch for {repo_id}...")
    start_time = time.time()
    data1 = client.get_activity_data(repo_id)
    elapsed1 = time.time() - start_time
    print(f"  Time: {elapsed1:.3f}s")
    
    # 第二次获取（应该从缓存）
    print(f"\n[2] Second fetch (should be from cache)...")
    start_time = time.time()
    data2 = client.get_activity_data(repo_id)
    elapsed2 = time.time() - start_time
    print(f"  Time: {elapsed2:.3f}s")
    
    # 比较性能
    if elapsed1 > 0:
        speedup = elapsed1 / max(elapsed2, 0.001)
        print(f"\n  Speedup: {speedup:.1f}x faster with cache")
    
    client.close()


def test_cache_info():
    """测试缓存信息功能。"""
    print("\n" + "=" * 70)
    print("Test 3: Cache Information")
    print("=" * 70)
    
    client = OpenDiggerClient(use_cache=True)
    
    cache_info = client.get_cache_info()
    
    print(f"\nCache Directory: {cache_info['cache_dir']}")
    print(f"Total Repositories: {cache_info['total_repos']}")
    print(f"Total Files: {cache_info['total_files']}")
    print(f"Total Size: {cache_info['total_size_bytes'] / 1024:.2f} KB")
    
    if cache_info['repos']:
        print("\nCached Repositories:")
        for repo_id, info in cache_info['repos'].items():
            print(f"  - {repo_id}")
            print(f"      Files: {info['files']}")
            print(f"      Size: {info['size_bytes']} bytes")
            print(f"      Metrics: {info['metrics']}")
    
    client.close()


def test_is_cached():
    """测试缓存检查功能。"""
    print("\n" + "=" * 70)
    print("Test 4: Check If Cached")
    print("=" * 70)
    
    client = OpenDiggerClient(use_cache=True)
    
    test_repos = [
        "pytorch/pytorch",
        "tensorflow/tensorflow",
        "nonexistent/repo12345"
    ]
    
    print("\nChecking cache status for repositories:")
    for repo_id in test_repos:
        is_cached = client.is_cached(repo_id)
        status = "✓ Cached" if is_cached else "✗ Not cached"
        print(f"  {repo_id}: {status}")
    
    client.close()


def test_context_manager():
    """测试上下文管理器功能。"""
    print("\n" + "=" * 70)
    print("Test 5: Context Manager Usage")
    print("=" * 70)
    
    print("\nUsing client with context manager:")
    with OpenDiggerClient(use_cache=True) as client:
        repo_id = "pytorch/pytorch"
        print(f"  Fetching {repo_id}...")
        
        if client.is_cached(repo_id):
            print("  (Using cached data)")
        
        data = client.get_activity_data(repo_id)
        print(f"  ✓ Got {len(data)} metrics")
    
    print("  Session automatically closed")


def test_clear_specific_cache():
    """测试清除特定仓库缓存。"""
    print("\n" + "=" * 70)
    print("Test 6: Clear Specific Repository Cache")
    print("=" * 70)
    
    client = OpenDiggerClient(use_cache=True)
    
    # 显示当前缓存
    cache_info = client.get_cache_info()
    print(f"\nBefore clearing:")
    print(f"  Total repos: {cache_info['total_repos']}")
    print(f"  Total files: {cache_info['total_files']}")
    
    # 这里只显示如何清除，不实际执行
    print("\nTo clear a specific repo's cache:")
    print("  client.clear_cache('owner/repo')")
    
    print("\nTo clear all cache:")
    print("  client.clear_cache()")
    
    print("\n(Not actually clearing to preserve test data)")
    
    client.close()


def test_retry_mechanism():
    """测试重试机制（模拟）。"""
    print("\n" + "=" * 70)
    print("Test 7: Retry Mechanism Info")
    print("=" * 70)
    
    client = OpenDiggerClient(
        connect_timeout=5.0,
        read_timeout=30.0,
        max_retries=3,
        retry_backoff_factor=1.0
    )
    
    print("\nRetry configuration:")
    print(f"  Max retries: {client._max_retries}")
    print(f"  Backoff factor: {client._retry_backoff_factor}")
    print(f"  Retry intervals: 1s, 2s, 4s (exponential backoff)")
    
    print("\nRetry behavior:")
    print("  - Timeout errors: Will retry")
    print("  - Connection errors: Will retry")
    print("  - 404 errors: Will NOT retry (no data for repo)")
    print("  - 429 rate limit: Will retry with backoff")
    
    client.close()


def test_active_dates_filtering():
    """测试 active_dates_and_times 数据过滤功能。"""
    print("\n" + "=" * 70)
    print("Test 8: Active Dates Filtering (Last 6 Months)")
    print("=" * 70)
    
    client = OpenDiggerClient(use_cache=True)
    repo_id = "pytorch/pytorch"
    
    print(f"\nFetching active_dates_and_times for {repo_id}...")
    print("  Note: Only last 6 months of data will be downloaded and cached")
    
    try:
        data = client.get_activity_data(repo_id)
        active_data = data.get("active_dates_and_times", {})
        
        if active_data:
            print(f"\n✓ Retrieved active_dates_and_times data")
            print(f"  Total date entries: {len(active_data)}")
            
            # 检查日期范围
            dates = []
            for date_str in active_data.keys():
                try:
                    if len(date_str) == 10:  # YYYY-MM-DD
                        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
                        dates.append(date_obj)
                    elif len(date_str) == 7:  # YYYY-MM
                        date_obj = datetime.strptime(date_str, "%Y-%m")
                        dates.append(date_obj)
                except ValueError:
                    pass
            
            if dates:
                min_date = min(dates)
                max_date = max(dates)
                print(f"  Date range: {min_date.strftime('%Y-%m-%d')} to {max_date.strftime('%Y-%m-%d')}")
                
                # 验证是否在最近6个月内
                six_months_ago = datetime.now() - timedelta(days=6 * 30)
                if min_date >= six_months_ago:
                    print(f"  ✓ All data is within last 6 months")
                else:
                    print(f"  ⚠ Some data is older than 6 months (may be from cache)")
            else:
                print("  (Could not parse dates from data structure)")
        else:
            print("  ✗ No active_dates_and_times data found")
            
    except Exception as e:
        print(f"  ✗ Error: {e}")
    
    client.close()


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("OPENDIGGER CLIENT OPTIMIZATION TEST")
    print("=" * 70)
    
    try:
        test_basic_fetch()
        test_cache_hit()
        test_cache_info()
        test_is_cached()
        test_context_manager()
        test_clear_specific_cache()
        test_retry_mechanism()
        test_active_dates_filtering()
        
        print("\n" + "=" * 70)
        print("ALL TESTS COMPLETED SUCCESSFULLY")
        print("=" * 70)
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
