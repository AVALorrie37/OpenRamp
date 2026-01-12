"""GithubAPI package.

This package provides a minimal, standalone Python client for fetching
metrics from the Github API.
"""

from .client import GitHubClient
from .schemas import SearchResult, RepoMetadata

__all__ = ['GitHubClient', 'SearchResult', 'RepoMetadata']