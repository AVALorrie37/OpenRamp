"""
在线数据源模块
包括 GitHub API 和 OpenDigger API 客户端，以及集成搜索模块
"""

from .GithubAPI.client import GitHubClient
from .GithubAPI.schemas import SearchResult, RepoMetadata
from .OpenDiggerAPI.client import OpenDiggerClient
from .integrated_search import (
    IntegratedRepoSearch,
    IntegratedRepoResult,
    IntegratedSearchResult,
    search_repos_with_opendigger,
)

__all__ = [
    # GitHub API
    "GitHubClient",
    "SearchResult",
    "RepoMetadata",
    # OpenDigger API
    "OpenDiggerClient",
    # Integrated Search
    "IntegratedRepoSearch",
    "IntegratedRepoResult",
    "IntegratedSearchResult",
    "search_repos_with_opendigger",
]
