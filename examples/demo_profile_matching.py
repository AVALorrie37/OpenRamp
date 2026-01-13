"""
简单演示：基于用户画像的智能项目推荐

这个脚本展示了如何：
1. 使用自定义用户画像
2. 执行智能搜索
3. 查看匹配结果和评分细节
"""

import sys
import os
import io

# Fix Windows console encoding
# if sys.platform == 'win32':
#     sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
#     sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Add project root to path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
sys.path.insert(0, project_root)

from src.data_layer.online.integrated_search import search_repos_with_profile_matching


def demo_with_custom_profile():
    """演示：使用自定义用户画像搜索匹配项目"""
    
    print("\n" + "="*70)
    print(" 智能项目推荐演示 - 基于用户画像的多轮搜索与匹配度排序")
    print("="*70 + "\n")
    
    # 定义用户画像
    user_profile = {
        "skills": ["python", "django", "rest-api"],
        "contribution_types": ["feature", "bug_fix"],
        "experience_level": "intermediate"
    }
    
    print("用户画像:")
    print(f"  技能: {', '.join(user_profile['skills'])}")
    print(f"  贡献类型: {', '.join(user_profile['contribution_types'])}")
    print(f"  经验等级: {user_profile['experience_level']}")
    print()
    
    # 执行搜索（这里设置较小的目标数以加快演示）
    print("正在搜索匹配的开源项目...")
    print("(使用多个关键词组合进行搜索...)\n")
    
    try:
        result = search_repos_with_profile_matching(
            user_profile=user_profile,
            target_count=5  # 只返回 Top 5 以加快演示
        )
        
        # 显示搜索统计
        print("\n" + "="*70)
        print("搜索统计:")
        print("="*70)
        print(f"  关键词组合: {result.search_keywords}")
        print(f"  检查的 GitHub 仓库: {result.github_repos_checked}")
        print(f"  有 OpenDigger 数据的仓库: {result.opendigger_valid_count}")
        print(f"  跳过的仓库: {result.opendigger_skipped_count}")
        print(f"  最终返回: {len(result.repositories)} 个项目")
        
        # 显示匹配结果
        if result.repositories:
            print("\n" + "="*70)
            print("Top 匹配项目:")
            print("="*70 + "\n")
            
            for i, repo in enumerate(result.repositories, 1):
                print(f"{i}. {repo.repo_id}")
                print(f"   ----------------------------------------")
                print(f"   Stars: {repo.metadata.stars}")
                print(f"   总匹配度: {repo.match_score:.4f}")
                print(f"   评分细分:")
                print(f"     - 技能匹配:   {repo.match_breakdown['skill']:.4f} (用户技能与项目的相关度)")
                print(f"     - 活跃度:     {repo.match_breakdown['activity']:.4f} (项目的活跃程度)")
                print(f"     - 需求匹配:   {repo.match_breakdown['demand']:.4f} (社区需求与技能匹配)")
                print(f"   描述: {repo.description[:80]}{'...' if len(repo.description) > 80 else ''}")
                print()
        else:
            print("\n未找到匹配的项目。请尝试:")
            print("  1. 扩展技能列表")
            print("  2. 调整搜索参数")
            print("  3. 使用更通用的关键词")
        
        print("="*70)
        print(result.message)
        print("="*70 + "\n")
        
    except Exception as e:
        print(f"\n[错误] 搜索失败: {e}")
        import traceback
        traceback.print_exc()


def demo_with_cached_profile():
    """演示：使用缓存的用户画像搜索"""
    
    print("\n" + "="*70)
    print(" 使用缓存画像搜索演示")
    print("="*70 + "\n")
    
    print("正在加载缓存的用户画像...")
    
    try:
        # 自动加载最新画像
        result = search_repos_with_profile_matching(target_count=5)
        
        if result.repositories:
            print(f"\n成功找到 {len(result.repositories)} 个匹配项目!")
            print("\nTop 3:")
            for i, repo in enumerate(result.repositories[:3], 1):
                print(f"  {i}. {repo.repo_id} (匹配度: {repo.match_score:.4f})")
        else:
            print("\n未找到匹配项目。")
            
    except Exception as e:
        print(f"加载失败: {e}")
        print("提示: 请先运行 test_conversational_profile.py 创建用户画像")


if __name__ == "__main__":
    # 演示 1: 使用自定义画像（推荐）
    demo_with_custom_profile()
    
    # 演示 2: 使用缓存画像（可选）
    # 取消下面的注释来测试缓存画像加载
    # demo_with_cached_profile()
