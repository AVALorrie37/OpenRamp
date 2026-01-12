"""
Test script for the Integrated Search module.

This example demonstrates how to use the IntegratedRepoSearch class
to find repositories that have both GitHub metadata and OpenDigger metrics.
"""

import sys
import os

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(project_root, 'src'))

from data_layer.online.integrated_search import (
    IntegratedRepoSearch,
    search_repos_with_opendigger,
)


def test_integrated_search():
    """Test the integrated search functionality."""
    
    print("=" * 70)
    print("Test 1: Basic Integrated Search")
    print("=" * 70)
    
    # Search for machine learning related repositories
    keywords = ["machine-learning", "pytorch"]
    target_count = 3
    
    # Using the convenience function
    result = search_repos_with_opendigger(keywords, target_count)
    
    # Display results
    print(f"\nSearch Keywords: {result.search_keywords}")
    print(f"Target Count: {result.target_count}")
    print(f"Is Sufficient: {result.is_sufficient}")
    print(f"Message: {result.message}")
    print(f"\nStatistics:")
    print(f"  - GitHub repos checked: {result.github_repos_checked}")
    print(f"  - OpenDigger valid: {result.opendigger_valid_count}")
    print(f"  - OpenDigger skipped: {result.opendigger_skipped_count}")
    
    print(f"\nQualified Repositories ({len(result.repositories)}):")
    print("-" * 70)
    
    for i, repo in enumerate(result.repositories, 1):
        print(f"\n{i}. {repo.repo_id}")
        print(f"   Description: {repo.description[:80]}..." if len(repo.description) > 80 else f"   Description: {repo.description}")
        print(f"   GitHub Keywords: {repo.github_keywords[:5]}...")  # Show first 5 keywords
        print(f"   Stars: {repo.metadata.stars}")
        print(f"   Last Updated: {repo.metadata.last_updated}")
        print(f"   OpenDigger Metrics Available:")
        for metric_name in repo.opendigger_metrics.keys():
            print(f"     - {metric_name}")
    
    return result


def test_single_repo_lookup():
    """Test fetching integrated data for a single known repository."""
    
    print("\n" + "=" * 70)
    print("Test 2: Single Repository Lookup")
    print("=" * 70)
    
    searcher = IntegratedRepoSearch()
    
    # Try a well-known repository that should have OpenDigger data
    repo_id = "pytorch/pytorch"
    print(f"\nLooking up: {repo_id}")
    
    result = searcher.get_repo_with_metrics(repo_id)
    
    if result:
        print(f"✓ Found OpenDigger data for {repo_id}")
        print(f"  Metrics available: {list(result.opendigger_metrics.keys())}")
        
        # Show a sample of the OpenRank metric if available
        if "openrank" in result.opendigger_metrics:
            openrank = result.opendigger_metrics["openrank"]
            if isinstance(openrank, dict):
                recent_entries = list(openrank.items())[-3:]
                print(f"  Recent OpenRank values: {dict(recent_entries)}")
    else:
        print(f"✗ No OpenDigger data found for {repo_id}")


def test_insufficient_results():
    """Test behavior when target cannot be met."""
    
    print("\n" + "=" * 70)
    print("Test 3: Handling Insufficient Results")
    print("=" * 70)
    
    # Search with very specific keywords that might not have many results
    keywords = ["very-obscure-keyword-12345"]
    target_count = 5
    
    result = search_repos_with_opendigger(keywords, target_count)
    
    print(f"\nSearch Keywords: {result.search_keywords}")
    print(f"Target Count: {result.target_count}")
    print(f"Is Sufficient: {result.is_sufficient}")
    print(f"Message: {result.message}")
    print(f"Found: {len(result.repositories)} repositories")


def test_with_custom_clients():
    """Test using pre-configured clients."""
    
    print("\n" + "=" * 70)
    print("Test 4: Using Custom Clients")
    print("=" * 70)
    
    from data_layer.online.GithubAPI.client import GitHubClient
    from data_layer.online.OpenDiggerAPI.client import OpenDiggerClient
    
    # Create clients with custom settings (optimized timeouts)
    github_client = GitHubClient()
    opendigger_client = OpenDiggerClient(
        connect_timeout=5.0,   # 连接超时 5 秒
        read_timeout=30.0,     # 读取超时 30 秒
        max_retries=3,         # 最多重试 3 次
        use_cache=True         # 启用缓存
    )
    
    # Create integrated search with custom clients
    searcher = IntegratedRepoSearch(
        github_client=github_client,
        opendigger_client=opendigger_client
    )
    
    # Perform search
    result = searcher.search_with_metrics(
        keywords=["python", "data-science"],
        target_count=2,
        max_iterations=5,
        github_batch_size=10
    )
    
    print(f"\nFound {len(result.repositories)} repositories with custom clients")
    print(f"Is Sufficient: {result.is_sufficient}")


def test_cache_functionality():
    """Test the OpenDigger cache functionality."""
    
    print("\n" + "=" * 70)
    print("Test 5: Cache Functionality")
    print("=" * 70)
    
    searcher = IntegratedRepoSearch(use_cache=True)
    
    # 1. 显示当前缓存信息
    print("\n[1] Current cache info:")
    cache_info = searcher.get_opendigger_cache_info()
    print(f"  Cache directory: {cache_info['cache_dir']}")
    print(f"  Total repos cached: {cache_info['total_repos']}")
    print(f"  Total files: {cache_info['total_files']}")
    print(f"  Total size: {cache_info['total_size_bytes'] / 1024:.2f} KB")
    
    if cache_info['repos']:
        print("\n  Cached repositories:")
        for repo_id, info in list(cache_info['repos'].items())[:5]:
            print(f"    - {repo_id}: {info['files']} files, {info['size_bytes']} bytes")
    
    # 2. 测试单个仓库的缓存状态
    test_repo = "pytorch/pytorch"
    print(f"\n[2] Checking if '{test_repo}' is cached...")
    is_cached = searcher.is_repo_cached(test_repo)
    print(f"  Is cached: {is_cached}")
    
    # 3. 获取数据（如果未缓存，会从网络获取并缓存）
    if not is_cached:
        print(f"\n[3] Fetching data for '{test_repo}' (will be cached)...")
        result = searcher.get_repo_with_metrics(test_repo)
        if result:
            print(f"  ✓ Data fetched and cached")
            print(f"  Metrics: {list(result.opendigger_metrics.keys())}")
    
    # 4. 再次检查缓存状态
    print(f"\n[4] Checking cache status again...")
    is_cached_now = searcher.is_repo_cached(test_repo)
    print(f"  Is cached: {is_cached_now}")
    
    # 5. 显示更新后的缓存信息
    print("\n[5] Updated cache info:")
    cache_info = searcher.get_opendigger_cache_info()
    print(f"  Total repos cached: {cache_info['total_repos']}")
    print(f"  Total files: {cache_info['total_files']}")
    print(f"  Total size: {cache_info['total_size_bytes'] / 1024:.2f} KB")


def test_clear_cache():
    """Test clearing the cache."""
    
    print("\n" + "=" * 70)
    print("Test 6: Clear Cache")
    print("=" * 70)
    
    searcher = IntegratedRepoSearch(use_cache=True)
    
    # 显示清空前的缓存信息
    cache_info = searcher.get_opendigger_cache_info()
    print(f"\nBefore clearing:")
    print(f"  Total repos cached: {cache_info['total_repos']}")
    print(f"  Total files: {cache_info['total_files']}")
    
    # 清空特定仓库的缓存（示例）
    # deleted = searcher.clear_opendigger_cache("pytorch/pytorch")
    # print(f"\nCleared {deleted} files for pytorch/pytorch")
    
    # 或者清空所有缓存（取消注释以执行）
    # deleted = searcher.clear_opendigger_cache()
    # print(f"\nCleared all cache: {deleted} files deleted")
    
    print("\n(Cache clearing is commented out to preserve data)")
    print("Uncomment the clear_opendigger_cache() calls to test clearing")


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("INTEGRATED SEARCH MODULE TEST")
    print("=" * 70)
    
    # Run tests
    try:
        test_integrated_search()
        test_single_repo_lookup()
        test_cache_functionality()
        # Uncomment below tests if you want to run them (they may take longer)
        # test_insufficient_results()
        # test_with_custom_clients()
        # test_clear_cache()
        
        print("\n" + "=" * 70)
        print("ALL TESTS COMPLETED")
        print("=" * 70)
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
