"""
简单测试：验证用户画像加载和关键词组合生成功能
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

from src.data_layer.online.integrated_search import IntegratedRepoSearch


def test_load_profile():
    """Test 1: Load latest user profile from cache"""
    print("\n" + "="*70)
    print("TEST 1: Load Latest User Profile from Cache")
    print("="*70 + "\n")
    
    searcher = IntegratedRepoSearch()
    profile = searcher.load_latest_user_profile()
    
    if profile:
        print("[OK] Successfully loaded user profile:")
        print(f"  Skills: {profile.get('skills', [])}")
        print(f"  Contribution Types: {profile.get('contribution_types', [])}")
        print(f"  Experience: {profile.get('experience_level', 'N/A')}")
        return profile
    else:
        print("[WARN] No user profile found in cache")
        return None


def test_keyword_combinations():
    """Test 2: Generate keyword combinations"""
    print("\n" + "="*70)
    print("TEST 2: Generate Keyword Combinations")
    print("="*70 + "\n")
    
    searcher = IntegratedRepoSearch()
    
    # Test with sample skills
    skills = ["python", "django", "rest-api", "docker"]
    print(f"Input skills: {skills}\n")
    
    # Generate combinations
    combos = searcher._generate_keyword_combinations(skills, min_size=2, max_size=3)
    
    print(f"[OK] Generated {len(combos)} keyword combinations:")
    for i, combo in enumerate(combos[:10], 1):
        print(f"  {i}. {combo}")
    if len(combos) > 10:
        print(f"  ... and {len(combos) - 10} more")
    
    return combos


def test_match_score_calculation():
    """Test 3: Test match score calculation (mock data)"""
    print("\n" + "="*70)
    print("TEST 3: Match Score Calculation (Mock Data)")
    print("="*70 + "\n")
    
    searcher = IntegratedRepoSearch()
    
    # Create mock profile
    mock_profile = {
        "skills": ["python", "django", "rest-api"],
        "contribution_types": ["feature", "bug_fix"],
        "experience_level": "intermediate"
    }
    
    # Create mock repo result
    from src.data_layer.online.integrated_search import IntegratedRepoResult
    from src.data_layer.online.GithubAPI.schemas import RepoMetadata
    
    mock_repo = IntegratedRepoResult(
        repo_id="test/django-rest-framework",
        github_keywords=["python", "django", "rest", "api"],
        description="Web APIs for Django",
        metadata=RepoMetadata(stars=25000, last_updated="2024-01-01"),
        opendigger_metrics={
            "active_days_last_30": 25,
            "issues_new_last_30": 50,
            "openrank": 150.0
        }
    )
    
    # Calculate match score
    try:
        score, breakdown = searcher._calculate_match_score(mock_profile, mock_repo)
        
        print("[OK] Match score calculation successful:")
        print(f"  Repository: {mock_repo.repo_id}")
        print(f"  Overall Score: {score:.4f}")
        print(f"  Breakdown:")
        print(f"    - Skill Match:    {breakdown['skill']:.4f}")
        print(f"    - Activity Score: {breakdown['activity']:.4f}")
        print(f"    - Demand Score:   {breakdown['demand']:.4f}")
        return True
    except Exception as e:
        print(f"[ERROR] Match score calculation failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all tests"""
    print("\n" + "="*70)
    print("Profile Loading & Matching Test Suite")
    print("="*70)
    
    # Test 1
    profile = test_load_profile()
    
    # Test 2
    combos = test_keyword_combinations()
    
    # Test 3
    match_ok = test_match_score_calculation()
    
    print("\n" + "="*70)
    print("Test Summary:")
    print("="*70)
    print(f"  Profile Loading: {'OK' if profile else 'SKIP'}")
    print(f"  Keyword Combinations: {'OK' if combos else 'FAIL'}")
    print(f"  Match Score Calculation: {'OK' if match_ok else 'FAIL'}")
    print("="*70 + "\n")


if __name__ == "__main__":
    main()
