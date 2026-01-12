"""Core模块入口

支持延迟加载以允许独立使用各子模块
"""


def __getattr__(name):
    """延迟加载模块属性"""
    # Profile 模块相关
    profile_exports = {
        "ProfileBuilder", 
        "ConversationalProfileBuilder", 
        "ProfileSession", 
        "SessionStatus",
        "TriggerAction",
        "ProfileResult"
    }
    
    # Match 模块相关
    match_exports = {
        "MatchScorer",
        "calculate_match_score",
        "UserProfile",
        "RepoData",
        "MatchResult",
        "MatchConfig",
    }
    
    if name in profile_exports:
        from .profile import (
            ProfileBuilder, 
            ConversationalProfileBuilder, 
            ProfileSession, 
            SessionStatus,
            TriggerAction,
            ProfileResult
        )
        return locals()[name]
    
    if name in match_exports:
        from .match import (
            MatchScorer,
            calculate_match_score,
            UserProfile,
            RepoData,
            MatchResult,
            MatchConfig
        )
        return locals()[name]
    
    raise AttributeError(f"module 'src.core' has no attribute '{name}'")


__all__ = [
    # Profile 模块
    "ProfileBuilder", 
    "ConversationalProfileBuilder", 
    "ProfileSession", 
    "SessionStatus",
    "TriggerAction",
    "ProfileResult",
    
    # Match 模块
    "MatchScorer",
    "calculate_match_score",
    "UserProfile",
    "RepoData",
    "MatchResult",
    "MatchConfig",
]