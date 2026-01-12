from typing import List
from dataclasses import dataclass

@dataclass
class RepoMetadata:
    """仓库元数据（精简版，首期仅保留必要字段）"""
    stars: int
    last_updated: str  # ISO8601格式

@dataclass
class SearchResult:
    """搜索结果标准结构"""
    repo_id: str  # "owner/repo" 格式
    keywords: List[str]  # 首期直接返回GitHub官方topics
    description: str
    metadata: RepoMetadata