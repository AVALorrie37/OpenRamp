"""匹配模块数据模型定义"""
from dataclasses import dataclass, field
from typing import List, Dict, Optional
from enum import Enum


class ContributionStyle(Enum):
    """贡献风格类型"""
    ISSUE_SOLVER = "issue_solver"      # 喜欢解决 issue
    PR_CONTRIBUTOR = "pr_contributor"  # 喜欢提 PR
    DOCS_WRITER = "docs_writer"        # 喜欢写文档
    REVIEWER = "reviewer"              # 喜欢代码审查
    GENERAL = "general"                # 通用贡献者


@dataclass
class UserProfile:
    """
    用户画像数据结构
    
    Attributes:
        skills: 用户技能标签列表（英文，小写）
        contribution_style: 贡献风格（可选，用于调整权重）
        experience_level: 经验等级 (beginner/intermediate/advanced)
    """
    skills: List[str] = field(default_factory=list)
    contribution_style: Optional[ContributionStyle] = None
    experience_level: str = "intermediate"
    
    def __post_init__(self):
        """初始化后处理：标准化技能标签"""
        self.skills = [self._normalize_keyword(s) for s in self.skills]
    
    @staticmethod
    def _normalize_keyword(keyword: str) -> str:
        """标准化关键词：转小写，去除首尾空格"""
        return keyword.strip().lower()
    
    @classmethod
    def from_dict(cls, data: Dict) -> "UserProfile":
        """从字典创建 UserProfile"""
        style = data.get("contribution_style")
        if isinstance(style, str):
            try:
                style = ContributionStyle(style)
            except ValueError:
                style = ContributionStyle.GENERAL
        
        return cls(
            skills=data.get("skills", []),
            contribution_style=style,
            experience_level=data.get("experience_level", "intermediate")
        )


@dataclass
class RepoData:
    """
    仓库数据结构
    
    Attributes:
        keywords: 仓库关键词（来自描述、README、topics等）
        active_days_last_30: 最近30天活跃天数
        issues_new_last_30: 近30天新开 issue 数
        openrank: 项目影响力分数（OpenDigger 指标）
        name: 仓库名称（可选，用于结果展示）
        full_name: 仓库全名 owner/repo（可选）
    """
    keywords: List[str] = field(default_factory=list)
    active_days_last_30: int = 0
    issues_new_last_30: int = 0
    openrank: float = 0.0
    name: Optional[str] = None
    full_name: Optional[str] = None
    
    def __post_init__(self):
        """初始化后处理：标准化关键词"""
        self.keywords = [self._normalize_keyword(k) for k in self.keywords]
    
    @staticmethod
    def _normalize_keyword(keyword: str) -> str:
        """
        标准化关键词
        - 转小写
        - 去除首尾空格
        - 去除特殊符号（保留字母、数字、连字符）
        """
        import re
        keyword = keyword.strip().lower()
        # 保留字母、数字、连字符、下划线
        keyword = re.sub(r'[^a-z0-9\-_]', '', keyword)
        return keyword
    
    @classmethod
    def from_dict(cls, data: Dict) -> "RepoData":
        """从字典创建 RepoData"""
        return cls(
            keywords=data.get("keywords", []),
            active_days_last_30=data.get("active_days_last_30", 0),
            issues_new_last_30=data.get("issues_new_last_30", 0),
            openrank=data.get("openrank", 0.0),
            name=data.get("name"),
            full_name=data.get("full_name")
        )


@dataclass
class ScoreBreakdown:
    """
    评分细分结构
    
    Attributes:
        skill: 技能匹配度 [0, 1]
        activity: 活跃度匹配度 [0, 1]
        demand: 社区需求匹配度 [0, 1]
    """
    skill: float = 0.0
    activity: float = 0.0
    demand: float = 0.0
    
    def to_dict(self) -> Dict[str, float]:
        """转换为字典"""
        return {
            "skill": round(self.skill, 4),
            "activity": round(self.activity, 4),
            "demand": round(self.demand, 4)
        }


@dataclass
class MatchResult:
    """
    匹配结果数据结构
    
    Attributes:
        match_score: 总匹配分数 [0, 1]
        breakdown: 各子维度评分细分
        repo_name: 仓库名称（可选）
        repo_full_name: 仓库全名（可选）
    """
    match_score: float
    breakdown: ScoreBreakdown
    repo_name: Optional[str] = None
    repo_full_name: Optional[str] = None
    
    def to_dict(self) -> Dict:
        """转换为字典"""
        result = {
            "match_score": round(self.match_score, 4),
            "breakdown": self.breakdown.to_dict()
        }
        if self.repo_name:
            result["repo_name"] = self.repo_name
        if self.repo_full_name:
            result["repo_full_name"] = self.repo_full_name
        return result
