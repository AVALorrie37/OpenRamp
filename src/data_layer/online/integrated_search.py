"""
Integrated Search Module

Combines GitHub API and OpenDigger API to find repositories that have both
valid GitHub metadata and OpenDigger metrics.
"""

import sys
import os
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field

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
finally:
    # Clean up temporary paths
    paths_to_remove = [
        os.path.join(data_layer_dir, 'config'),
        os.path.join(data_layer_dir, 'utils')
    ]
    for path in paths_to_remove:
        if path in sys.path:
            sys.path.remove(path)


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
        use_cache: bool = True
    ):
        """
        Initialize the integrated search.
        
        Args:
            github_client: Optional pre-configured GitHubClient instance
            opendigger_client: Optional pre-configured OpenDiggerClient instance
            use_cache: Whether to use local cache for OpenDigger data (default: True)
        """
        self._github = github_client or GitHubClient()
        self._opendigger = opendigger_client or OpenDiggerClient(use_cache=use_cache)
    
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
    
    def search_with_metrics(
        self,
        keywords: List[str],
        target_count: int = 5,
        max_iterations: int = 10,
        github_batch_size: int = 15
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
                
                print(f"  Checking [{total_github_checked}]: {result.repo_id}...", end=" ")
                
                # Try to get OpenDigger metrics
                metrics = self._fetch_opendigger_metrics(result.repo_id)
                
                if metrics is not None:
                    # Success! Create integrated result
                    integrated_result = IntegratedRepoResult(
                        repo_id=result.repo_id,
                        github_keywords=result.keywords,
                        description=result.description,
                        metadata=result.metadata,
                        opendigger_metrics=metrics
                    )
                    qualified_repos.append(integrated_result)
                    print(f"✓ Valid ({len(qualified_repos)}/{target_count})")
                else:
                    skipped_count += 1
                    print("✗ No OpenDigger data")
        
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
        
        # For single repo lookup, we create minimal GitHub metadata
        # In a production system, you might want to fetch actual GitHub data
        return IntegratedRepoResult(
            repo_id=repo_id,
            github_keywords=[],  # Not available for single lookup
            description="",
            metadata=RepoMetadata(stars=0, last_updated=""),
            opendigger_metrics=metrics
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


# Convenience function for quick searches
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
