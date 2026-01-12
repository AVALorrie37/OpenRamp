"""匹配评分计算模块"""
import math
import logging
from typing import List, Optional, Union, Dict

from .schemas import UserProfile, RepoData, MatchResult, ScoreBreakdown
from .config import MatchConfig, DEFAULT_CONFIG

logger = logging.getLogger(__name__)


class MatchScorer:
    """
    匹配评分计算器
    
    基于用户画像和仓库数据计算匹配评分，采用分层加权融合策略，
    将匹配拆解为三个可解释、可调参的子维度：
    - S_skill: 技能匹配度
    - S_activity: 活跃度匹配度
    - S_demand: 社区需求匹配度
    
    总评分公式: MatchScore = w1 * S_skill + w2 * S_activity + w3 * S_demand
    """
    
    def __init__(self, config: Optional[MatchConfig] = None):
        """
        初始化匹配评分器
        
        Args:
            config: 匹配算法配置，默认使用 DEFAULT_CONFIG
        """
        self.config = config or DEFAULT_CONFIG
    
    def calculate(
        self,
        user_profile: Union[UserProfile, Dict],
        repo_data: Union[RepoData, Dict]
    ) -> MatchResult:
        """
        计算用户与项目的匹配分数
        
        Args:
            user_profile: 用户画像（UserProfile 或字典）
            repo_data: 仓库数据（RepoData 或字典）
            
        Returns:
            MatchResult: 包含总分和各子维度评分
        """
        # 转换输入为数据类
        if isinstance(user_profile, dict):
            user_profile = UserProfile.from_dict(user_profile)
        if isinstance(repo_data, dict):
            repo_data = RepoData.from_dict(repo_data)
        
        # 计算各子维度评分
        s_skill = self._calculate_skill_score(user_profile.skills, repo_data.keywords)
        s_activity = self._calculate_activity_score(repo_data)
        s_demand = self._calculate_demand_score(s_skill, repo_data.issues_new_last_30)
        
        # 获取权重
        weights = self.config.weights
        
        # 计算总分
        match_score = (
            weights.w_skill * s_skill +
            weights.w_activity * s_activity +
            weights.w_demand * s_demand
        )
        
        # 确保分数在 [0, 1] 范围内
        match_score = max(0.0, min(1.0, match_score))
        
        # 构建结果
        breakdown = ScoreBreakdown(
            skill=s_skill,
            activity=s_activity,
            demand=s_demand
        )
        
        result = MatchResult(
            match_score=match_score,
            breakdown=breakdown,
            repo_name=repo_data.name,
            repo_full_name=repo_data.full_name
        )
        
        logger.debug(
            f"Match calculated: score={match_score:.4f}, "
            f"skill={s_skill:.4f}, activity={s_activity:.4f}, demand={s_demand:.4f}"
        )
        
        return result
    
    def _calculate_skill_score(
        self,
        user_skills: List[str],
        repo_keywords: List[str]
    ) -> float:
        """
        计算技能匹配度 S_skill
        
        使用 Jaccard 相似度变体:
        S_skill = |U ∩ R| / max(|U|, |R|)
        
        Args:
            user_skills: 用户技能标签集
            repo_keywords: 仓库关键词集
            
        Returns:
            技能匹配分数 [0, 1]
        """
        if not user_skills or not repo_keywords:
            return 0.0
        
        # 转换为集合
        user_set = set(user_skills)
        repo_set = set(repo_keywords)
        
        # 计算交集
        intersection = user_set & repo_set
        
        # Jaccard 变体：使用最大值作为分母
        max_size = max(len(user_set), len(repo_set))
        
        if max_size == 0:
            return 0.0
        
        score = len(intersection) / max_size
        
        logger.debug(
            f"Skill score: intersection={intersection}, "
            f"user={len(user_set)}, repo={len(repo_set)}, score={score:.4f}"
        )
        
        return score
    
    def _calculate_activity_score(self, repo_data: RepoData) -> float:
        """
        计算活跃度匹配度 S_activity
        
        综合考虑三个指标:
        S_activity = α * s_active_days + β * s_issues_new + γ * s_openrank
        
        Args:
            repo_data: 仓库数据
            
        Returns:
            活跃度匹配分数 [0, 1]
        """
        thresholds = self.config.activity_thresholds
        weights = self.config.activity_weights
        
        # 计算各子分（使用截断线性映射）
        s_active_days = self._truncated_linear_map(
            value=repo_data.active_days_last_30,
            v_min=thresholds.active_days_min,
            v_max=thresholds.active_days_max
        )
        
        s_issues_new = self._truncated_linear_map(
            value=repo_data.issues_new_last_30,
            v_min=thresholds.issues_new_min,
            v_max=thresholds.issues_new_max
        )
        
        # OpenRank 使用对数缩放后映射
        openrank_log = math.log1p(repo_data.openrank)  # log(1 + x)
        openrank_min_log = math.log1p(thresholds.openrank_min)
        openrank_max_log = math.log1p(thresholds.openrank_max)
        
        s_openrank = self._truncated_linear_map(
            value=openrank_log,
            v_min=openrank_min_log,
            v_max=openrank_max_log
        )
        
        # 加权求和
        score = (
            weights.alpha * s_active_days +
            weights.beta * s_issues_new +
            weights.gamma * s_openrank
        )
        
        logger.debug(
            f"Activity score: active_days={s_active_days:.4f}, "
            f"issues_new={s_issues_new:.4f}, openrank={s_openrank:.4f}, "
            f"total={score:.4f}"
        )
        
        return score
    
    def _calculate_demand_score(
        self,
        skill_score: float,
        issues_new: int
    ) -> float:
        """
        计算社区需求匹配度 S_demand
        
        简化公式: S_demand = S_skill * sigmoid(issues_new - x0)
        
        Args:
            skill_score: 已计算的技能匹配分数
            issues_new: 近30天新开 issue 数
            
        Returns:
            社区需求匹配分数 [0, 1]
        """
        demand_config = self.config.demand_config
        
        # 计算 sigmoid
        x = issues_new - demand_config.sigmoid_midpoint
        sigmoid_value = self._sigmoid(x, steepness=demand_config.sigmoid_steepness)
        
        # S_demand = S_skill * sigmoid(issues_new - x0)
        score = skill_score * sigmoid_value
        
        logger.debug(
            f"Demand score: skill={skill_score:.4f}, "
            f"issues_new={issues_new}, sigmoid={sigmoid_value:.4f}, "
            f"total={score:.4f}"
        )
        
        return score
    
    @staticmethod
    def _truncated_linear_map(value: float, v_min: float, v_max: float) -> float:
        """
        截断线性映射
        
        将值从 [v_min, v_max] 映射到 [0, 1]，
        低于 v_min 映射为 0，高于 v_max 映射为 1
        
        Args:
            value: 输入值
            v_min: 最小阈值
            v_max: 最大阈值
            
        Returns:
            归一化后的值 [0, 1]
        """
        if value <= v_min:
            return 0.0
        if value >= v_max:
            return 1.0
        
        return (value - v_min) / (v_max - v_min)
    
    @staticmethod
    def _sigmoid(x: float, steepness: float = 1.0) -> float:
        """
        Sigmoid 函数
        
        σ(x) = 1 / (1 + e^(-steepness * x))
        
        Args:
            x: 输入值
            steepness: 陡峭度（越大曲线越陡）
            
        Returns:
            Sigmoid 值 [0, 1]
        """
        try:
            return 1.0 / (1.0 + math.exp(-steepness * x))
        except OverflowError:
            # 处理极端值
            return 0.0 if x < 0 else 1.0
    
    def calculate_batch(
        self,
        user_profile: Union[UserProfile, Dict],
        repo_list: List[Union[RepoData, Dict]]
    ) -> List[MatchResult]:
        """
        批量计算用户与多个项目的匹配分数
        
        Args:
            user_profile: 用户画像
            repo_list: 仓库数据列表
            
        Returns:
            匹配结果列表（按分数降序排列）
        """
        # 转换用户画像
        if isinstance(user_profile, dict):
            user_profile = UserProfile.from_dict(user_profile)
        
        results = []
        for repo in repo_list:
            try:
                result = self.calculate(user_profile, repo)
                results.append(result)
            except Exception as e:
                logger.warning(f"Failed to calculate match for repo: {e}")
                continue
        
        # 按分数降序排列
        results.sort(key=lambda r: r.match_score, reverse=True)
        
        return results


def calculate_match_score(
    user_profile: Union[UserProfile, Dict],
    repo_data: Union[RepoData, Dict],
    config: Optional[MatchConfig] = None
) -> MatchResult:
    """
    便捷函数：计算用户与项目的匹配分数
    
    Args:
        user_profile: 用户画像
        repo_data: 仓库数据
        config: 匹配算法配置（可选）
        
    Returns:
        MatchResult: 匹配结果
        
    Example:
        >>> result = calculate_match_score(
        ...     user_profile={"skills": ["python", "docker", "rest-api"]},
        ...     repo_data={
        ...         "keywords": ["python", "fastapi", "ml"],
        ...         "active_days_last_30": 12,
        ...         "issues_new_last_30": 8,
        ...         "openrank": 72.5
        ...     }
        ... )
        >>> print(result.match_score)  # 0.78
        >>> print(result.breakdown.to_dict())
    """
    scorer = MatchScorer(config)
    return scorer.calculate(user_profile, repo_data)
