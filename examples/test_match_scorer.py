"""匹配评分模块测试示例"""
import sys
import io
from pathlib import Path

# 设置标准输出为 UTF-8 编码（解决 Windows GBK 编码问题）
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# 添加项目根目录到 Python 路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# 从 match 模块导入（使用延迟加载，不会触发 profile 模块的依赖）
from src.core.match import (
    calculate_match_score,
    MatchScorer,
    UserProfile,
    RepoData,
    MatchConfig
)


def test_basic_match():
    """基础匹配测试（使用设计文档中的示例）"""
    print("=" * 60)
    print("Test 1: Basic Match (Design Document Example)")
    print("=" * 60)
    
    # 设计文档中的示例数据
    user_profile = {
        "skills": ["python", "docker", "rest-api"],
        "contribution_style": "issue_solver"
    }
    
    repo_data = {
        "keywords": ["python", "fastapi", "ml"],
        "active_days_last_30": 12,
        "issues_new_last_30": 8,
        "openrank": 72.5,
        "name": "example-repo",
        "full_name": "owner/example-repo"
    }
    
    result = calculate_match_score(user_profile, repo_data)
    
    print(f"\nUser Skills: {user_profile['skills']}")
    print(f"Repo Keywords: {repo_data['keywords']}")
    print(f"Active Days: {repo_data['active_days_last_30']}")
    print(f"New Issues: {repo_data['issues_new_last_30']}")
    print(f"OpenRank: {repo_data['openrank']}")
    
    print(f"\n[Result]")
    print(f"  Total Score: {result.match_score:.4f}")
    print(f"  Skill Score: {result.breakdown.skill:.4f}")
    print(f"  Activity Score: {result.breakdown.activity:.4f}")
    print(f"  Demand Score: {result.breakdown.demand:.4f}")
    print(f"\nResult Dict: {result.to_dict()}")


def test_high_skill_match():
    """高技能匹配测试"""
    print("\n" + "=" * 60)
    print("Test 2: High Skill Match")
    print("=" * 60)
    
    user = UserProfile(skills=["python", "fastapi", "docker", "kubernetes"])
    repo = RepoData(
        keywords=["python", "fastapi", "docker", "api"],
        active_days_last_30=15,
        issues_new_last_30=10,
        openrank=50.0
    )
    
    scorer = MatchScorer()
    result = scorer.calculate(user, repo)
    
    print(f"\nUser Skills: {user.skills}")
    print(f"Repo Keywords: {repo.keywords}")
    print(f"\n[Result]")
    print(f"  Total Score: {result.match_score:.4f}")
    print(f"  Skill Score: {result.breakdown.skill:.4f} (expected: high)")


def test_low_activity_project():
    """低活跃度项目测试"""
    print("\n" + "=" * 60)
    print("Test 3: Low Activity Project")
    print("=" * 60)
    
    user = UserProfile(skills=["javascript", "react", "typescript"])
    repo = RepoData(
        keywords=["javascript", "react", "frontend"],
        active_days_last_30=1,  # 非常不活跃
        issues_new_last_30=0,
        openrank=5.0
    )
    
    result = calculate_match_score(user, repo)
    
    print(f"\nUser Skills: {user.skills}")
    print(f"Repo Keywords: {repo.keywords}")
    print(f"Active Days: {repo.active_days_last_30} (very low)")
    
    print(f"\n[Result]")
    print(f"  Total Score: {result.match_score:.4f}")
    print(f"  Activity Score: {result.breakdown.activity:.4f} (expected: low)")


def test_beginner_config():
    """新手配置测试"""
    print("\n" + "=" * 60)
    print("Test 4: Beginner-Friendly Config")
    print("=" * 60)
    
    user = UserProfile(
        skills=["python"],
        experience_level="beginner"
    )
    repo = RepoData(
        keywords=["python", "beginner-friendly", "tutorial"],
        active_days_last_30=10,
        issues_new_last_30=5,
        openrank=20.0
    )
    
    # 使用默认配置
    default_result = calculate_match_score(user, repo)
    
    # 使用新手配置
    beginner_config = MatchConfig.for_beginner()
    beginner_result = calculate_match_score(user, repo, config=beginner_config)
    
    print(f"\nUser Skills: {user.skills}")
    print(f"Experience Level: {user.experience_level}")
    
    print(f"\n[Default Config Result]")
    print(f"  Total Score: {default_result.match_score:.4f}")
    
    print(f"\n[Beginner Config Result]")
    print(f"  Total Score: {beginner_result.match_score:.4f}")
    print(f"  (Beginner config values activity more)")


def test_batch_matching():
    """批量匹配测试"""
    print("\n" + "=" * 60)
    print("Test 5: Batch Matching with Sorting")
    print("=" * 60)
    
    user = UserProfile(skills=["python", "machine-learning", "tensorflow"])
    
    repos = [
        RepoData(
            keywords=["python", "tensorflow", "deep-learning"],
            active_days_last_30=20,
            issues_new_last_30=15,
            openrank=100.0,
            name="ml-framework"
        ),
        RepoData(
            keywords=["python", "data-analysis"],
            active_days_last_30=5,
            issues_new_last_30=2,
            openrank=10.0,
            name="data-tool"
        ),
        RepoData(
            keywords=["javascript", "frontend"],
            active_days_last_30=25,
            issues_new_last_30=20,
            openrank=200.0,
            name="web-app"
        ),
    ]
    
    scorer = MatchScorer()
    results = scorer.calculate_batch(user, repos)
    
    print(f"\nUser Skills: {user.skills}")
    print(f"\n[Sorted Results]")
    for i, r in enumerate(results, 1):
        print(f"  {i}. {r.repo_name}: {r.match_score:.4f} "
              f"(skill={r.breakdown.skill:.2f}, activity={r.breakdown.activity:.2f})")


def test_no_skill_overlap():
    """无技能重叠测试"""
    print("\n" + "=" * 60)
    print("Test 6: No Skill Overlap")
    print("=" * 60)
    
    user = UserProfile(skills=["java", "spring", "mysql"])
    repo = RepoData(
        keywords=["python", "django", "postgresql"],
        active_days_last_30=15,
        issues_new_last_30=10,
        openrank=50.0
    )
    
    result = calculate_match_score(user, repo)
    
    print(f"\nUser Skills: {user.skills}")
    print(f"Repo Keywords: {repo.keywords}")
    print(f"\n[Result]")
    print(f"  Total Score: {result.match_score:.4f} (expected: low)")
    print(f"  Skill Score: {result.breakdown.skill:.4f} (expected: 0)")
    print(f"  Demand Score: {result.breakdown.demand:.4f} (depends on skill, also low)")


if __name__ == "__main__":
    test_basic_match()
    test_high_skill_match()
    test_low_activity_project()
    test_beginner_config()
    test_batch_matching()
    test_no_skill_overlap()
    
    print("\n" + "=" * 60)
    print("[OK] All tests completed!")
    print("=" * 60)
