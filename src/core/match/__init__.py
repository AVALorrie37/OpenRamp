"""
匹配评分模块

基于用户画像与仓库数据计算匹配评分，采用分层加权融合策略。

主要组件:
- MatchScorer: 匹配评分计算器
- calculate_match_score: 便捷计算函数
- UserProfile: 用户画像数据结构
- RepoData: 仓库数据结构
- MatchResult: 匹配结果数据结构
- MatchConfig: 配置管理

使用示例:
    >>> from src.core.match import calculate_match_score
    >>> 
    >>> result = calculate_match_score(
    ...     user_profile={
    ...         "skills": ["python", "docker", "rest-api"],
    ...         "contribution_style": "issue_solver"
    ...     },
    ...     repo_data={
    ...         "keywords": ["python", "fastapi", "ml"],
    ...         "active_days_last_30": 12,
    ...         "issues_new_last_30": 8,
    ...         "openrank": 72.5
    ...     }
    ... )
    >>> 
    >>> print(f"Match Score: {result.match_score:.2f}")
    >>> print(f"Breakdown: {result.breakdown.to_dict()}")
"""
from .schemas import (
    UserProfile,
    RepoData,
    MatchResult,
    ScoreBreakdown,
    ContributionStyle
)
from .config import (
    MatchConfig,
    MatchWeights,
    ActivityWeights,
    ActivityThresholds,
    DemandConfig,
    DEFAULT_CONFIG
)
from .scorer import (
    MatchScorer,
    calculate_match_score
)

__all__ = [
    # 核心类
    "MatchScorer",
    "calculate_match_score",
    
    # 数据模型
    "UserProfile",
    "RepoData",
    "MatchResult",
    "ScoreBreakdown",
    "ContributionStyle",
    
    # 配置
    "MatchConfig",
    "MatchWeights",
    "ActivityWeights",
    "ActivityThresholds",
    "DemandConfig",
    "DEFAULT_CONFIG",
]
