"""
测试基于用户画像的多轮组合搜索与匹配度排序功能

功能测试：
1. 从缓存加载最新用户画像
2. 基于用户技能进行多轮组合搜索
3. 对搜索结果进行匹配度评分和排序
4. 展示 Top-N 匹配项目
"""

import sys
import os
import io

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Add project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
sys.path.insert(0, project_root)

from src.data_layer.online.integrated_search import (
    IntegratedRepoSearch,
    search_repos_with_profile_matching
)


def test_load_latest_profile():
    """测试加载最新用户画像"""
    print("\n" + "="*70)
    print("TEST 1: Load Latest User Profile from Cache")
    print("="*70 + "\n")
    
    searcher = IntegratedRepoSearch()
    profile = searcher.load_latest_user_profile()
    
    if profile:
        print("✅ Successfully loaded user profile:")
        print(f"   Skills: {profile.get('skills', [])}")
        print(f"   Contribution Types: {profile.get('contribution_types', [])}")
        print(f"   Experience: {profile.get('experience_level', 'N/A')}")
        if profile.get('summary'):
            print(f"   Summary: {profile.get('summary')}")
        return True
    else:
        print("❌ Failed to load user profile")
        return False


def test_profile_based_search():
    """测试基于用户画像的搜索与匹配"""
    print("\n" + "="*70)
    print("TEST 2: Profile-Based Multi-Round Search with Match Scoring")
    print("="*70 + "\n")
    
    # 使用便捷函数进行搜索
    result = search_repos_with_profile_matching(target_count=10)
    
    if not result.is_sufficient:
        print(f"\n⚠️  {result.message}\n")
    else:
        print(f"\n✅ {result.message}\n")
    
    # 显示统计信息
    print("\n" + "="*70)
    print("📊 Search Statistics:")
    print("="*70)
    print(f"  Keywords used: {result.search_keywords}")
    print(f"  GitHub repos checked: {result.github_repos_checked}")
    print(f"  Repos with OpenDigger data: {result.opendigger_valid_count}")
    print(f"  Repos skipped (no data): {result.opendigger_skipped_count}")
    print(f"  Final results: {len(result.repositories)}")
    
    # 显示 Top-10 结果
    if result.repositories:
        print("\n" + "="*70)
        print("🏆 Top 10 Matched Repositories:")
        print("="*70 + "\n")
        
        for i, repo in enumerate(result.repositories[:10], 1):
            print(f"{i:2d}. {repo.repo_id}")
            print(f"    📊 Match Score: {repo.match_score:.4f}")
            if repo.match_breakdown:
                print(f"    ├─ Skill:    {repo.match_breakdown['skill']:.4f}")
                print(f"    ├─ Activity: {repo.match_breakdown['activity']:.4f}")
                print(f"    └─ Demand:   {repo.match_breakdown['demand']:.4f}")
            print(f"    ⭐ Stars: {repo.metadata.stars}")
            print(f"    📝 Description: {repo.description[:80]}..." if len(repo.description) > 80 else f"    📝 Description: {repo.description}")
            print()


def test_custom_profile_search():
    """测试使用自定义用户画像进行搜索"""
    print("\n" + "="*70)
    print("TEST 3: Custom Profile Search")
    print("="*70 + "\n")
    
    # 创建自定义用户画像
    custom_profile = {
        "skills": ["python", "machine-learning", "pytorch"],
        "contribution_types": ["feature", "docs"],
        "experience_level": "intermediate"
    }
    
    print("📋 Using custom profile:")
    print(f"   Skills: {custom_profile['skills']}")
    print(f"   Contribution Types: {custom_profile['contribution_types']}")
    print(f"   Experience: {custom_profile['experience_level']}\n")
    
    # 执行搜索
    result = search_repos_with_profile_matching(
        user_profile=custom_profile,
        target_count=5
    )
    
    # 显示结果
    if result.repositories:
        print("\n🏆 Top 5 Results:")
        for i, repo in enumerate(result.repositories[:5], 1):
            print(f"\n{i}. {repo.repo_id} (⭐ {repo.metadata.stars})")
            print(f"   Score: {repo.match_score:.4f} | "
                  f"Skill: {repo.match_breakdown['skill']:.2f} | "
                  f"Activity: {repo.match_breakdown['activity']:.2f} | "
                  f"Demand: {repo.match_breakdown['demand']:.2f}")


def main():
    """运行所有测试"""
    print("\n" + "="*70)
    print("🧪 Profile-Based Search & Matching Test Suite")
    print("="*70)
    
    # Test 1: Load profile
    profile_loaded = test_load_latest_profile()
    
    if not profile_loaded:
        print("\n⚠️  No cached profile found. Skipping profile-based tests.")
        print("💡 Tip: Run test_conversational_profile.py to create a user profile first.")
        return
    
    # Test 2: Profile-based search with cached profile
    test_profile_based_search()
    
    # Test 3: Custom profile search
    test_custom_profile_search()
    
    print("\n" + "="*70)
    print("✅ All tests completed!")
    print("="*70 + "\n")


if __name__ == "__main__":
    main()
