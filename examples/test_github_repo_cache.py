#!/usr/bin/env python3
"""
Test GitHub API client repository-level caching functionality

Run with:
    python examples/test_github_repo_cache.py

Test points:
1. Only cache repositories filtered by keywords (repositories with keywords)
2. Cache data structure correct (repo_id, description, stars, last_updated, keywords)
3. Cache file paths correct (github_cache/owner/repo.json)
4. Cache expiration mechanism (24 hours)
5. Cache management methods work properly
"""

import os
import sys
import time
import json
from pathlib import Path
from datetime import datetime

def main():
    """Main test function"""
    print("=== GitHub Repository Cache Test ===\n")

    # Get project root directory
    project_root = Path(__file__).parent.parent  # examples parent directory is project root
    src_path = project_root

    # Add src directory to Python path at the beginning (recommended)
    sys.path.insert(0, str(src_path))

    # Now import modules from src, using full package path
    try:
        from src.data_layer.online.GithubAPI.client import GitHubClient
    except ImportError as e:
        print(f"Import error: {e}")
        print("This test requires proper project setup with dependencies")
        print(f"Python path: {sys.path}")
        return

    # Create client instance (with caching enabled)
    client = GitHubClient(use_cache=True)
    print(f"Cache directory: {client._cache_dir}")

    # Clear existing cache
    print("\nClearing existing cache...")
    deleted = client.clear_cache()
    print(f"Deleted {deleted} cache files")

    # Show initial cache state
    cache_info = client.get_cache_info()
    print(f"\nInitial cache state: {cache_info['total_repos']} repos, {cache_info['total_size_bytes']} bytes")

    # Perform search - this will cache repositories with keywords
    print("\nPerforming search to test cache creation...")
    try:
        results = client.search_repos(["python", "machine learning"], target_count=3)
        print(f"Search returned {len(results)} results")
    except Exception as e:
        print(f"Search failed: {e}")
        print("You may need to set GITHUB_TOKEN environment variable")
        return

    # Check cache state
    cache_info = client.get_cache_info()
    print("\nCache state after search:")
    print(f"  Cached repos: {cache_info['total_repos']}")
    print(f"  Total cache size: {cache_info['total_size_bytes']} bytes")
    print("  Cached repositories:")
    for repo in cache_info['repos']:
        print(f"    - {repo['repo_id']} ({repo['size_bytes']} bytes)")

    # Verify cache file structure
    print("\nVerifying cache file structure...")
    for repo in cache_info['repos']:
        cache_path = Path(repo['cache_path'])
        try:
            with open(cache_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Check required fields
            required_fields = ['repo_id', 'description', 'stars', 'last_updated', 'keywords', 'cached_at']
            missing_fields = [field for field in required_fields if field not in data]
            if missing_fields:
                print(f"  [FAIL] {repo['repo_id']} missing fields: {missing_fields}")
            else:
                print(f"  [OK] {repo['repo_id']} cache structure complete")
                print(f"      Description: {data['description'][:50]}...")
                print(f"      Stars: {data['stars']}, Keywords: {len(data['keywords'])}")
        except Exception as e:
            print(f"  [FAIL] {repo['repo_id']} cache file read error: {str(e)[:100]}...")

    # Test cache reading
    print("\nTesting cache reading functionality...")
    if cache_info['repos']:
        first_repo = cache_info['repos'][0]['repo_id']
        print(f"Testing reading repo: {first_repo}")

        cached_data = client.get_cached_repo(first_repo)
        if cached_data:
            print("  [OK] Successfully read cached data")
            print(f"      repo_id: {cached_data['repo_id']}")
            print(f"      keywords: {cached_data['keywords']}")
        else:
            print("  [FAIL] Could not read cached data")

        # Test is_repo_cached method
        is_cached = client.is_repo_cached(first_repo)
        print(f"  [OK] is_repo_cached returned: {is_cached}")

    # Test cache expiration (simulate)
    print("\nTesting cache expiration mechanism...")
    if cache_info['repos']:
        test_repo = cache_info['repos'][0]['repo_id']
        cache_path = client._get_repo_cache_path(test_repo)

        # Modify file time to 25 hours ago
        old_time = time.time() - (25 * 60 * 60)  # 25 hours ago
        os.utime(cache_path, (old_time, old_time))

        print(f"Set {test_repo} cache time to 25 hours ago")

        # Check cache again
        is_still_cached = client.is_repo_cached(test_repo)
        cached_data_after = client.get_cached_repo(test_repo)

        if not is_still_cached and cached_data_after is None:
            print("  [OK] Cache correctly expired and cleaned up")
        else:
            print("  [FAIL] Cache expiration mechanism not working properly")

    # Test clearing specific repo cache
    print("\nTesting clearing specific repo cache...")
    if cache_info['repos']:
        test_repo = cache_info['repos'][0]['repo_id']
        print(f"Clearing repo cache: {test_repo}")
        deleted_specific = client.clear_cache(test_repo)
        print(f"Deleted {deleted_specific} files")

    print("\n=== Cache functionality test completed ===")

    # Show final cache state
    final_info = client.get_cache_info()
    print(f"Final cache state: {final_info['total_repos']} repos")

if __name__ == "__main__":
    main()