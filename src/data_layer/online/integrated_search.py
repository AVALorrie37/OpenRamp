"""
Integrated Search Module

Combines GitHub API and OpenDigger API to find repositories that have both
valid GitHub metadata and OpenDigger metrics.

Features:
- Multi-round combined search based on user profile
- Match scoring and ranking using MatchScorer
- Cache-based user profile loading
"""

import sys
import os
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from itertools import combinations
import logging

# Setup paths for imports
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
data_layer_dir = os.path.dirname(parent_dir)

sys.path.insert(0, os.path.join(data_layer_dir, 'config'))
sys.path.insert(0, os.path.join(data_layer_dir, 'utils'))

try:
    from .GithubAPI.client import GitHubClient
    from .GithubAPI.schemas import SearchResult, RepoMetadata
    from .OpenDiggerAPI.client import OpenDiggerClient
    from ..offline.loader import OfflineRepoLoader
finally:
    # Clean up temporary paths
    paths_to_remove = [
        os.path.join(data_layer_dir, 'config'),
        os.path.join(data_layer_dir, 'utils')
    ]
    for path in paths_to_remove:
        if path in sys.path:
            sys.path.remove(path)

# Import match scorer
try:
    from ...core.match import MatchScorer, UserProfile, RepoData
except ImportError:
    # Fallback import
    sys.path.insert(0, os.path.join(os.path.dirname(data_layer_dir), 'core', 'match'))
    from scorer import MatchScorer
    from schemas import UserProfile, RepoData

logger = logging.getLogger(__name__)


@dataclass
class IntegratedRepoResult:
    """
    Combined result containing both GitHub metadata and OpenDigger metrics.
    """
    repo_id: str                          # "owner/repo" format
    github_keywords: List[str]            # GitHub topics/keywords used in search
    description: str                      # Repository description from GitHub
    metadata: RepoMetadata                # GitHub metadata (stars, last_updated)
    opendigger_metrics: Dict[str, Any]    # OpenDigger activity data
    match_score: Optional[float] = None   # Match score (if profile provided)
    match_breakdown: Optional[Dict[str, float]] = None  # Score breakdown
    active_score: float = 0.0             # Same semantics as offline loader
    influence_score: float = 0.0
    demand_score: float = 0.0
    composite_score: float = 0.0          # 0.5*active + 0.3*influence + 0.2*demand
    languages: List[str] = field(default_factory=list)  # From github_keywords or []


@dataclass
class IntegratedSearchResult:
    """
    Final result of the integrated search operation.
    """
    search_keywords: List[str]            # Original search keywords used
    repositories: List[IntegratedRepoResult] = field(default_factory=list)
    target_count: int = 0                 # Requested target count
    is_sufficient: bool = False           # Whether target was met
    message: str = ""                     # Status message for the user
    
    # Statistics
    github_repos_checked: int = 0         # Total repos checked from GitHub
    opendigger_valid_count: int = 0       # Repos with valid OpenDigger data
    opendigger_skipped_count: int = 0     # Repos without OpenDigger data


class IntegratedRepoSearch:
    """
    Integrates GitHub API and OpenDigger API to find repositories with both
    valid GitHub metadata and OpenDigger metrics.
    
    The module works iteratively:
    1. Search GitHub for repositories matching keywords
    2. For each repository, query OpenDigger for metrics
    3. Skip repositories without OpenDigger data
    4. Continue until target count is reached or GitHub results exhausted
    """
    
    def __init__(
        self,
        github_client: GitHubClient = None,
        opendigger_client: OpenDiggerClient = None,
        use_cache: bool = True,
        profile_cache_dir: Optional[str] = None
    ):
        """
        Initialize the integrated search.
        
        Args:
            github_client: Optional pre-configured GitHubClient instance
            opendigger_client: Optional pre-configured OpenDiggerClient instance
            use_cache: Whether to use local cache for OpenDigger data (default: True)
            profile_cache_dir: Directory for user profile cache (default: data_layer/data/profile_cache)
        """
        self._github = github_client or GitHubClient()
        self._opendigger = opendigger_client or OpenDiggerClient(use_cache=use_cache)
        self._scorer = MatchScorer()

        # Online-learning stats for GitHub-only activity normalization (A_raw -> [0,1])
        self._activity_a_raw_samples: List[float] = []
        self._activity_p1: float = 1
        self._activity_p99: float = 3000.0
        
        # Setup profile cache directory
        if profile_cache_dir:
            self._profile_cache_dir = Path(profile_cache_dir)
        else:
            # Default: data_layer/data/profile_cache
            current_file = Path(__file__)
            data_layer_dir = current_file.parent.parent
            self._profile_cache_dir = data_layer_dir / "data" / "profile_cache"
    
    def load_latest_user_profile(self, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Load the latest user profile from cache.
        
        Args:
            user_id: Optional user ID to load specific profile.
                     If None, loads the most recently modified user profile.
        
        Returns:
            User profile dictionary, or None if not found
        """
        if not self._profile_cache_dir.exists():
            logger.warning(f"Profile cache directory does not exist: {self._profile_cache_dir}")
            return None
        
        try:
            # Find all user profile files (user_*.json)
            user_files = list(self._profile_cache_dir.glob("user_*.json"))
            
            if not user_files:
                logger.info("No user profiles found in cache")
                return None
            
            if user_id:
                # Load specific user profile
                import hashlib
                safe_id = hashlib.md5(user_id.encode('utf-8')).hexdigest()
                target_file = self._profile_cache_dir / f"user_{safe_id}.json"
                if not target_file.exists():
                    logger.warning(f"User profile not found for user_id: {user_id}")
                    return None
                profile_file = target_file
            else:
                # Load the most recent profile
                profile_file = max(user_files, key=lambda f: f.stat().st_mtime)
            
            with open(profile_file, 'r', encoding='utf-8') as f:
                profile = json.load(f)
            
            logger.info(f"✅ Loaded user profile: {profile_file.name}")
            logger.info(f"   Skills: {profile.get('skills', [])}")
            return profile
            
        except Exception as e:
            logger.error(f"Failed to load user profile: {e}")
            return None
    
    def _fetch_opendigger_metrics(self, repo_id: str) -> Optional[Dict[str, Any]]:
        """
        Attempt to fetch OpenDigger metrics for a repository.
        
        Args:
            repo_id: Repository ID in "owner/repo" format
            
        Returns:
            Dictionary of metrics if available, None if not found or error
        """
        try:
            metrics = self._opendigger.get_activity_data(repo_id)
            return metrics
        except RuntimeError as e:
            # OpenDigger API returned non-200 (likely 404 - no data for this repo)
            print(f"Info: OpenDigger has no data for {repo_id}: {e}")
            return None
        except Exception as e:
            # Network errors or other issues
            print(f"Warning: Failed to fetch OpenDigger data for {repo_id}: {e}")
            return None
    
    def _compute_unified_scores(
        self,
        opendigger_metrics: Dict[str, Any],
        github_keywords: List[str]
    ) -> Dict[str, Any]:
        active_data = opendigger_metrics.get("active_dates_and_times") or {}
        openrank_data = opendigger_metrics.get("openrank") or {}
        issues_data = opendigger_metrics.get("issues_new") or {}
        loader = OfflineRepoLoader()
        active_score = loader._calculate_active_score(active_data if isinstance(active_data, dict) else {})
        influence_score = loader._calculate_influence_score(openrank_data if isinstance(openrank_data, dict) else {})
        demand_score = loader._calculate_demand_score(issues_data if isinstance(issues_data, dict) else {})
        composite_score = 0.5 * active_score + 0.3 * influence_score + 0.2 * demand_score
        return {
            "active_score": round(active_score, 4),
            "influence_score": round(influence_score, 4),
            "demand_score": round(demand_score, 4),
            "composite_score": round(composite_score, 4),
            "languages": list(github_keywords) if github_keywords else [],
        }

    @staticmethod
    def _robust_min_max(value: float, v_min: float, v_max: float) -> float:
        if value <= v_min:
            return 0.0
        if value >= v_max:
            return 1.0
        return (value - v_min) / (v_max - v_min)

    def _update_activity_quantiles(self, a_raw: float) -> None:
        """
        Update running estimates of p1/p99 for activity A_raw using a sliding window.
        """
        self._activity_a_raw_samples.append(a_raw)
        # Keep a sliding window to bound memory and adapt to new data
        max_window = 1000
        if len(self._activity_a_raw_samples) > max_window:
            self._activity_a_raw_samples = self._activity_a_raw_samples[-max_window:]

        # Need enough samples for stable quantiles
        if len(self._activity_a_raw_samples) < 50:
            return

        sorted_vals = sorted(self._activity_a_raw_samples)
        n = len(sorted_vals)
        idx1 = max(0, int(0.01 * n) - 1)
        idx99 = min(n - 1, int(0.99 * n) - 1)
        p1 = sorted_vals[idx1]
        p99 = sorted_vals[idx99]

        # Guard against degenerate ranges
        if p99 <= p1:
            return

        self._activity_p1 = p1
        self._activity_p99 = p99

    def _normalize_activity_a_raw(self, a_raw: float) -> float:
        """
        Normalize A_raw to [0,1] using robust Min-Max with online-learned p1/p99.
        """
        # Update quantile estimates before using them
        self._update_activity_quantiles(a_raw)
        v_min = self._activity_p1
        v_max = self._activity_p99

        # Fallback if estimates are still default or too close
        if v_max <= v_min + 1e-6:
            v_min, v_max = 0.5, 500.0

        return self._robust_min_max(a_raw, v_min=v_min, v_max=v_max)

    def _compute_github_only_scores(self, metadata: RepoMetadata, github_keywords: List[str]) -> Dict[str, Any]:
        """
        当没有 OpenDigger 数据时，仅基于 GitHub 原生指标估算各子分。
        参考 design_text/match_algorithm.md 中的 GitHub 校准公式。
        """
        stars = max(0, int(getattr(metadata, "stars", 0)))
        forks = max(0, int(getattr(metadata, "forks", 0)))
        open_issues = max(0, int(getattr(metadata, "open_issues", 0)))

        # 估算近30天提交活跃度：根据最近更新时间粗略映射
        recent_commits_30d = 0
        try:
            if metadata.last_updated:
                dt = datetime.fromisoformat(metadata.last_updated.replace("Z", "+00:00"))
                days = max(0, (datetime.now(timezone.utc) - dt).days)
                if days <= 30:
                    recent_commits_30d = 30 - days
        except Exception:
            recent_commits_30d = 0

        # 活跃度原始指标 A_raw
        a_raw = (
            math.log2(1.0 + stars)
            + 2.0 * math.log2(1.0 + recent_commits_30d)
            + 0.5 * math.log2(1.0 + forks)
        )
        # 使用分位数在线学习得到的 p1/p99 做鲁棒 Min-Max 归一化
        s_activity = self._normalize_activity_a_raw(a_raw)

        # 需求分：open_issues 和 open_issues / recent_commits_30d
        issues_norm = self._robust_min_max(
            math.log2(1.0 + open_issues), v_min=0.0, v_max=8.0
        )
        ratio = open_issues / max(1.0, float(recent_commits_30d)) if open_issues > 0 else 0.0
        ratio_norm = self._robust_min_max(
            math.log2(1.0 + ratio), v_min=0.0, v_max=4.0
        )
        s_demand = 0.6 * issues_norm + 0.4 * ratio_norm

        active_score = round(s_activity, 4)
        demand_score = round(s_demand, 4)
        influence_score = 0.0
        composite_score = 0.5 * active_score + 0.3 * influence_score + 0.2 * demand_score

        return {
            "active_score": round(active_score, 4),
            "influence_score": round(influence_score, 4),
            "demand_score": round(demand_score, 4),
            "composite_score": round(composite_score, 4),
            "languages": list(github_keywords) if github_keywords else [],
        }
    
    def _calculate_match_score(
        self,
        user_profile: Dict[str, Any],
        repo_result: IntegratedRepoResult
    ) -> Tuple[float, Dict[str, float]]:
        """
        Calculate match score between user profile and repository.
        
        Args:
            user_profile: User profile dictionary
            repo_result: Repository result with OpenDigger metrics
        
        Returns:
            Tuple of (match_score, breakdown_dict)
        """
        try:
            # Convert user profile to UserProfile schema
            user_prof = UserProfile.from_dict(user_profile)
            
            metrics = repo_result.opendigger_metrics or {}
            has_opendigger = bool(metrics)
            
            # Build RepoData
            repo_data = RepoData(
                keywords=repo_result.github_keywords,
                active_days_last_30=metrics.get('active_days_last_30', 0),
                issues_new_last_30=metrics.get('issues_new_last_30', 0),
                openrank=metrics.get('openrank', 0.0),
                name=repo_result.repo_id.split('/')[-1],
                full_name=repo_result.repo_id,
                precomputed_activity_score=repo_result.active_score,
                precomputed_demand_score=repo_result.demand_score,
                data_source="opendigger+github" if has_opendigger else "github_only",
            )
            
            # Calculate match
            match_result = self._scorer.calculate(user_prof, repo_data)
            
            return match_result.match_score, match_result.breakdown.to_dict()
            
        except Exception as e:
            logger.warning(f"Failed to calculate match score for {repo_result.repo_id}: {e}")
            return 0.0, {"skill": 0.0, "activity": 0.0, "demand": 0.0}
    
    def search_with_metrics(
        self,
        keywords: List[str],
        target_count: int = 5,
        max_iterations: int = 10,
        github_batch_size: int = 15,
        on_progress=None,
    ) -> IntegratedSearchResult:
        """
        Search for repositories with both GitHub metadata and OpenDigger metrics.
        
        This method iterates through GitHub search results, checking each
        repository for OpenDigger metrics, until the target count is reached
        or all available repositories have been checked.
        
        Args:
            keywords: List of search keywords for GitHub
            target_count: Desired number of repositories with valid metrics
            max_iterations: Maximum number of GitHub search iterations
            github_batch_size: Number of repos to request per GitHub batch
            
        Returns:
            IntegratedSearchResult containing qualified repositories and status
        """
        if not keywords:
            return IntegratedSearchResult(
                search_keywords=[],
                target_count=target_count,
                is_sufficient=False,
                message="Error: No search keywords provided."
            )
        
        print(f"\n{'='*60}")
        print(f"Integrated Search: Finding {target_count} repos with OpenDigger metrics")
        print(f"Search keywords: {keywords}")
        print(f"{'='*60}\n")
        
        qualified_repos: List[IntegratedRepoResult] = []
        checked_repo_ids: set = set()  # Track checked repos to avoid duplicates
        total_github_checked = 0
        skipped_count = 0
        iteration = 0
        
        # Iterative search: keep requesting more GitHub repos until target is met
        while len(qualified_repos) < target_count and iteration < max_iterations:
            iteration += 1
            
            # Calculate how many more repos we need from GitHub
            # Request more than needed since many won't have OpenDigger data
            repos_needed = target_count - len(qualified_repos)
            # Request 3x what we need to account for OpenDigger misses
            request_count = max(repos_needed * 3, github_batch_size)
            
            print(f"\n--- Iteration {iteration}/{max_iterations} ---")
            print(f"Currently have {len(qualified_repos)}/{target_count} qualified repos")
            print(f"Requesting {request_count} repos from GitHub...")
            if on_progress:
                on_progress("checking_repos", {
                    "checked": total_github_checked,
                    "found": len(qualified_repos),
                    "target": target_count,
                })
            
            # Search GitHub for repositories
            try:
                github_results = self._github.search_repos(
                    keywords=keywords,
                    target_count=total_github_checked + request_count
                )
            except Exception as e:
                print(f"Error: GitHub search failed: {e}")
                break
            
            if not github_results:
                print("Info: No more results from GitHub search")
                break
            
            # Filter to only new repos we haven't checked yet
            new_results = [
                r for r in github_results 
                if r.repo_id not in checked_repo_ids
            ]
            
            if not new_results:
                print("Info: No new repositories to check")
                break
            
            print(f"Found {len(new_results)} new repos to check for OpenDigger data")
            
            # Check each new repository for OpenDigger metrics
            for result in new_results:
                if len(qualified_repos) >= target_count:
                    break
                
                checked_repo_ids.add(result.repo_id)
                total_github_checked += 1
                if on_progress and total_github_checked % 5 == 0:
                    on_progress("checking_repos", {
                        "checked": total_github_checked,
                        "found": len(qualified_repos),
                        "target": target_count,
                    })
                
                print(f"  Checking [{total_github_checked}]: {result.repo_id}...", end=" ")
                
                # Try to get OpenDigger metrics
                metrics = self._fetch_opendigger_metrics(result.repo_id)
                
                if metrics is not None:
                    # 有 OpenDigger 数据：使用 OpenDigger + GitHub 统一指标
                    unified = self._compute_unified_scores(metrics, result.keywords)
                    integrated_result = IntegratedRepoResult(
                        repo_id=result.repo_id,
                        github_keywords=result.keywords,
                        description=result.description,
                        metadata=result.metadata,
                        opendigger_metrics=metrics,
                        active_score=unified["active_score"],
                        influence_score=unified["influence_score"],
                        demand_score=unified["demand_score"],
                        composite_score=unified["composite_score"],
                        languages=unified["languages"],
                    )
                    qualified_repos.append(integrated_result)
                    print(f"✓ Valid with OpenDigger ({len(qualified_repos)}/{target_count})")
                else:
                    # 无 OpenDigger 数据：退化为基于 GitHub 指标的估算，但仍参与后续匹配计算
                    unified = self._compute_github_only_scores(result.metadata, result.keywords)
                    integrated_result = IntegratedRepoResult(
                        repo_id=result.repo_id,
                        github_keywords=result.keywords,
                        description=result.description,
                        metadata=result.metadata,
                        opendigger_metrics={},
                        active_score=unified["active_score"],
                        influence_score=unified["influence_score"],
                        demand_score=unified["demand_score"],
                        composite_score=unified["composite_score"],
                        languages=unified["languages"],
                    )
                    qualified_repos.append(integrated_result)
                    skipped_count += 1
                    print(f"✓ No OpenDigger data, used GitHub-only metrics ({len(qualified_repos)}/{target_count})")
        
        # Determine if search was sufficient
        is_sufficient = len(qualified_repos) >= target_count
        
        # Generate status message
        if is_sufficient:
            message = (
                f"Success: Found {len(qualified_repos)} repositories with both "
                f"GitHub metadata and OpenDigger metrics."
            )
        else:
            message = (
                f"Insufficient Results: Only found {len(qualified_repos)} of "
                f"{target_count} requested repositories with OpenDigger metrics. "
                f"Checked {total_github_checked} GitHub repos, but {skipped_count} "
                f"did not have OpenDigger data. Consider broadening your search "
                f"keywords or reducing the target count."
            )
        
        print(f"\n{'='*60}")
        print(f"Search Complete: {message}")
        print(f"{'='*60}\n")
        
        return IntegratedSearchResult(
            search_keywords=keywords,
            repositories=qualified_repos,
            target_count=target_count,
            is_sufficient=is_sufficient,
            message=message,
            github_repos_checked=total_github_checked,
            opendigger_valid_count=len(qualified_repos),
            opendigger_skipped_count=skipped_count
        )
    
    def get_repo_with_metrics(self, repo_id: str) -> Optional[IntegratedRepoResult]:
        """
        Get integrated data for a single repository.
        
        This is a utility method for fetching combined GitHub and OpenDigger
        data for a specific repository.
        
        Args:
            repo_id: Repository ID in "owner/repo" format
            
        Returns:
            IntegratedRepoResult if both GitHub and OpenDigger data exist,
            None otherwise
        """
        # Fetch OpenDigger metrics first (more likely to fail)
        metrics = self._fetch_opendigger_metrics(repo_id)
        if metrics is None:
            print(f"Info: Repository {repo_id} does not have OpenDigger metrics")
            return None
        
        unified = self._compute_unified_scores(metrics, [])
        return IntegratedRepoResult(
            repo_id=repo_id,
            github_keywords=[],
            description="",
            metadata=RepoMetadata(stars=0, last_updated=""),
            opendigger_metrics=metrics,
            active_score=unified["active_score"],
            influence_score=unified["influence_score"],
            demand_score=unified["demand_score"],
            composite_score=unified["composite_score"],
            languages=unified["languages"],
        )
    
    def clear_opendigger_cache(self, repo_id: Optional[str] = None) -> int:
        """
        清空 OpenDigger 缓存。
        
        Args:
            repo_id: 指定仓库 ID 时只清空该仓库的缓存，
                     为 None 时清空所有缓存
                     
        Returns:
            删除的缓存文件数量
        """
        return self._opendigger.clear_cache(repo_id)
    
    def get_opendigger_cache_info(self) -> Dict[str, Any]:
        """
        获取 OpenDigger 缓存信息。
        
        Returns:
            包含缓存统计信息的字典
        """
        return self._opendigger.get_cache_info()
    
    def is_repo_cached(self, repo_id: str) -> bool:
        """
        检查仓库的 OpenDigger 数据是否已缓存。
        
        Args:
            repo_id: 仓库 ID
            
        Returns:
            如果所有指标都已缓存则返回 True
        """
        return self._opendigger.is_cached(repo_id)
    
    def search_with_profile_matching(
        self,
        user_profile: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
        target_count: int = 10,
        max_rounds: int = 5,
        min_skill_combination: int = 2,
        max_skill_combination: int = 3,
        on_progress=None,
    ) -> IntegratedSearchResult:
        """
        使用用户画像进行多轮组合搜索并按匹配度排序。
        
        实现策略：
        1. 加载用户画像（从缓存或传入参数）
        2. 基于用户技能生成关键词组合
        3. 多轮搜索：使用不同的技能组合作为关键词
        4. 对所有结果计算匹配度评分
        5. 按评分排序并返回 top-N 结果
        
        Args:
            user_profile: 用户画像字典（可选，如果不提供则从缓存加载）
            user_id: 用户 ID（用于加载特定缓存，可选）
            target_count: 目标返回数量（默认 10）
            max_rounds: 最大搜索轮次（默认 5）
            min_skill_combination: 最小技能组合数（默认 2）
            max_skill_combination: 最大技能组合数（默认 3）
        
        Returns:
            IntegratedSearchResult 包含按匹配度排序的仓库列表
        """
        print(f"\n{'='*70}")
        print(f" Multi-Round Profile-Based Search with Match Scoring")
        print(f"{'='*70}\n")
        
        # Step 1: Load user profile
        if user_profile is None:
            user_profile = self.load_latest_user_profile(user_id)
            if user_profile is None:
                return IntegratedSearchResult(
                    search_keywords=[],
                    target_count=target_count,
                    is_sufficient=False,
                    message="Error: No user profile found. Please create a profile first."
                )
        
        skills = user_profile.get('skills', [])
        if not skills:
            return IntegratedSearchResult(
                search_keywords=[],
                target_count=target_count,
                is_sufficient=False,
                message="Error: User profile has no skills defined."
            )
        
        # Normalize skills to lowercase
        skills = [s.lower().strip() for s in skills]
        if on_progress:
            on_progress("loading_profile", {"skills": skills})
        
        print(f" User Skills: {skills}")
        print(f" Target: {target_count} repositories with match scores\n")
        
        # Step 2: Generate keyword combinations
        keyword_combinations = self._generate_keyword_combinations(
            skills, min_skill_combination, max_skill_combination
        )
        
        print(f" Generated {len(keyword_combinations)} keyword combinations")
        for i, combo in enumerate(keyword_combinations[:5], 1):
            print(f"   {i}. {combo}")
        if len(keyword_combinations) > 5:
            print(f"   ... and {len(keyword_combinations) - 5} more")
        print()
        if on_progress:
            on_progress("generating_keywords", {"combinations": len(keyword_combinations)})
        
        # Step 3: Multi-round search
        all_repos: Dict[str, IntegratedRepoResult] = {}  # Use dict to avoid duplicates
        total_github_checked = 0
        skipped_count = 0
        
        for round_num, keywords in enumerate(keyword_combinations[:max_rounds], 1):
            print(f"\n--- Round {round_num}/{min(max_rounds, len(keyword_combinations))} ---")
            print(f" Keywords: {keywords}")
            print(f" Currently have {len(all_repos)} unique repositories")
            if on_progress:
                on_progress("search_round", {
                    "round": round_num,
                    "total_rounds": min(max_rounds, len(keyword_combinations)),
                    "keywords": keywords,
                    "found": len(all_repos),
                    "target": target_count,
                })
            
            # Calculate how many more repos we want to collect
            repos_needed = max(target_count * 2 - len(all_repos), 5)
            
            # Search with current keyword combination
            try:
                result = self.search_with_metrics(
                    keywords=keywords,
                    target_count=repos_needed,
                    max_iterations=3,
                    github_batch_size=10,
                    on_progress=on_progress,
                )
                
                # Add to collection (avoid duplicates)
                for repo in result.repositories:
                    if repo.repo_id not in all_repos:
                        all_repos[repo.repo_id] = repo
                
                total_github_checked += result.github_repos_checked
                skipped_count += result.opendigger_skipped_count
                
                print(f"✅ Round {round_num} added {len(result.repositories)} new repos")
                
            except Exception as e:
                logger.error(f"Round {round_num} failed: {e}")
                continue
            
            # Check if we have enough repos to proceed
            if len(all_repos) >= target_count * 2:
                print(f"\n✅ Collected enough repositories ({len(all_repos)}), proceeding to scoring...")
                break
        
        # Step 4: Calculate match scores for all repos
        print(f"\n{'='*70}")
        print(f"📊 Calculating Match Scores for {len(all_repos)} repositories...")
        print(f"{'='*70}\n")
        if on_progress:
            on_progress("scoring", {"total": len(all_repos)})
        
        scored_repos: List[IntegratedRepoResult] = []
        
        for i, repo in enumerate(all_repos.values(), 1):
            score, breakdown = self._calculate_match_score(user_profile, repo)
            repo.match_score = score
            repo.match_breakdown = breakdown
            scored_repos.append(repo)
            
            if i <= 5 or i % 10 == 0:
                print(f"  [{i}/{len(all_repos)}] {repo.repo_id}: score={score:.4f}")
        
        # Step 5: Sort by match score (descending)
        scored_repos.sort(key=lambda r: r.match_score or 0.0, reverse=True)
        
        # Take top N
        final_repos = scored_repos[:target_count]
        
        # Generate summary
        is_sufficient = len(final_repos) >= target_count
        
        if is_sufficient:
            message = (
                f"✅ Success: Found {len(final_repos)} repositories ranked by match score. "
                f"Searched {len(keyword_combinations[:max_rounds])} keyword combinations, "
                f"checked {total_github_checked} GitHub repos."
            )
        else:
            message = (
                f"⚠️  Partial Results: Found {len(final_repos)} of {target_count} requested repositories. "
                f"Searched {len(keyword_combinations[:max_rounds])} combinations across {max_rounds} rounds. "
                f"Consider broadening your skills or reducing target count."
            )
        
        print(f"\n{'='*70}")
        print("📈 Top Matches:")
        for i, repo in enumerate(final_repos[:5], 1):
            print(f"  {i}. {repo.repo_id}")
            print(f"     Score: {repo.match_score:.4f} | Skill: {repo.match_breakdown['skill']:.2f} | "
                  f"Activity: {repo.match_breakdown['activity']:.2f} | Demand: {repo.match_breakdown['demand']:.2f}")
        if len(final_repos) > 5:
            print(f"  ... and {len(final_repos) - 5} more")
        print(f"\n{message}")
        print(f"{'='*70}\n")
        
        return IntegratedSearchResult(
            search_keywords=skills,
            repositories=final_repos,
            target_count=target_count,
            is_sufficient=is_sufficient,
            message=message,
            github_repos_checked=total_github_checked,
            opendigger_valid_count=len(all_repos),
            opendigger_skipped_count=skipped_count
        )
    
    def _generate_keyword_combinations(
        self,
        skills: List[str],
        min_size: int = 2,
        max_size: int = 3
    ) -> List[List[str]]:
        """
        生成技能关键词组合。
        
        策略：
        1. 单个技能（全部）
        2. 技能对（2个组合）
        3. 技能三元组（3个组合）
        
        Args:
            skills: 用户技能列表
            min_size: 最小组合大小
            max_size: 最大组合大小
        
        Returns:
            关键词组合列表
        """
        all_combinations = []
        
        # Add full skill set first
        if len(skills) >= min_size:
            all_combinations.append(skills[:max_size])
        
        # Generate combinations of different sizes
        for size in range(min(min_size, len(skills)), min(max_size, len(skills)) + 1):
            for combo in combinations(skills, size):
                all_combinations.append(list(combo))
        
        # Add individual skills if min_size is 1
        if min_size == 1:
            for skill in skills:
                all_combinations.append([skill])
        
        return all_combinations


def build_unified_from_github_metadata(
    repo_id: str,
    description: str,
    topics: List[str],
    stars: int,
    forks: int,
    open_issues: int,
    pushed_at: str,
) -> Dict[str, Any]:
    """
    OpenDigger 无数据时，用 GitHub REST 元数据构建与离线/在线统一结构对齐的字典。
    活跃度/需求子分使用 IntegratedRepoSearch._compute_github_only_scores（与设计文档 GitHub 校准一致）。
    """
    from .GithubAPI.schemas import RepoMetadata

    metadata = RepoMetadata(
        stars=max(0, int(stars or 0)),
        last_updated=(pushed_at or "").strip(),
        forks=max(0, int(forks or 0)),
        open_issues=max(0, int(open_issues or 0)),
    )
    kws = [str(t).strip().lower() for t in (topics or []) if str(t).strip()]
    searcher = IntegratedRepoSearch()
    scores = searcher._compute_github_only_scores(metadata, kws)
    parts = repo_id.split("/")
    repo_name = parts[1] if len(parts) == 2 else repo_id
    langs = scores.get("languages") or kws or ["unknown"]
    return {
        "repo_id": repo_id,
        "name": repo_name,
        "description": (description or "").strip(),
        "languages": langs if isinstance(langs, list) else [langs],
        "active_score": scores["active_score"],
        "influence_score": scores["influence_score"],
        "demand_score": scores["demand_score"],
        "composite_score": scores["composite_score"],
        "raw_metrics": None,
        "keywords": kws,
        "source": "github_only",
    }


# Convenience functions for quick searches
def search_repos_with_opendigger(
    keywords: List[str],
    target_count: int = 5
) -> IntegratedSearchResult:
    """
    Convenience function to search for repositories with OpenDigger metrics.
    
    Args:
        keywords: List of search keywords
        target_count: Number of repositories to find
        
    Returns:
        IntegratedSearchResult with qualified repositories
    """
    searcher = IntegratedRepoSearch()
    return searcher.search_with_metrics(keywords, target_count)


def search_repos_with_profile_matching(
    user_profile: Optional[Dict[str, Any]] = None,
    user_id: Optional[str] = None,
    target_count: int = 10
) -> IntegratedSearchResult:
    """
    Convenience function to search repositories using user profile and match scoring.
    
    自动从缓存加载最新用户画像，执行多轮组合搜索，并按匹配度排序。
    
    Args:
        user_profile: 用户画像字典（可选，如不提供则自动从缓存加载）
        user_id: 用户 ID（可选，用于加载特定用户画像）
        target_count: 目标返回数量（默认 10）
    
    Returns:
        IntegratedSearchResult 包含按匹配度排序的仓库列表
        
    Example:
        >>> # 自动加载最新缓存的用户画像
        >>> result = search_repos_with_profile_matching(target_count=10)
        >>> for repo in result.repositories[:5]:
        ...     print(f"{repo.repo_id}: score={repo.match_score:.4f}")
    """
    searcher = IntegratedRepoSearch()
    return searcher.search_with_profile_matching(
        user_profile=user_profile,
        user_id=user_id,
        target_count=target_count
    )
