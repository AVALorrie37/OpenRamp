"""匹配算法配置参数"""
from dataclasses import dataclass
from typing import Optional


@dataclass
class MatchWeights:
    """
    匹配评分权重配置
    
    总评分公式: MatchScore = w_skill * S_skill + w_activity * S_activity + w_demand * S_demand
    要求: w_skill + w_activity + w_demand = 1
    """
    w_skill: float = 0.5      # 技能匹配度权重
    w_activity: float = 0.3   # 活跃度匹配度权重
    w_demand: float = 0.2     # 社区需求匹配度权重
    
    def __post_init__(self):
        """验证权重和为1"""
        total = self.w_skill + self.w_activity + self.w_demand
        if abs(total - 1.0) > 0.001:
            raise ValueError(f"Weights must sum to 1.0, got {total}")


@dataclass
class ActivityWeights:
    """
    活跃度子分权重配置
    
    S_activity = α * s_active_days + β * s_issues_new + γ * s_openrank
    要求: α + β + γ = 1
    """
    alpha: float = 0.4    # 活跃天数权重
    beta: float = 0.35    # 新issue数权重
    gamma: float = 0.25   # OpenRank权重
    
    def __post_init__(self):
        """验证权重和为1"""
        total = self.alpha + self.beta + self.gamma
        if abs(total - 1.0) > 0.001:
            raise ValueError(f"Activity weights must sum to 1.0, got {total}")


@dataclass
class ActivityThresholds:
    """
    活跃度归一化阈值配置
    
    用于截断线性映射:
    - 低于 min 值归一化为 0
    - 高于 max 值归一化为 1
    - 中间值线性映射
    """
    # 活跃天数阈值 (最近30天)
    active_days_min: int = 3     # 低于此值认为不活跃
    active_days_max: int = 20    # 高于此值认为非常活跃
    
    # 新issue数阈值 (最近30天)
    issues_new_min: int = 1      # 低于此值认为需求低
    issues_new_max: int = 15     # 高于此值认为需求高
    
    # OpenRank阈值 (对数缩放后使用)
    openrank_min: float = 1.0    # 最低阈值
    openrank_max: float = 100.0  # 高影响力阈值


@dataclass
class DemandConfig:
    """
    社区需求匹配度配置
    
    S_demand = S_skill * sigmoid(issues_new - x0)
    """
    sigmoid_midpoint: float = 5.0   # sigmoid 函数中点 x0
    sigmoid_steepness: float = 0.5  # sigmoid 函数陡峭度（可选调参）


@dataclass
class MatchConfig:
    """
    匹配算法总配置
    
    集中管理所有配置参数，便于调试和不同用户类型的适配
    """
    weights: MatchWeights = None
    activity_weights: ActivityWeights = None
    activity_thresholds: ActivityThresholds = None
    demand_config: DemandConfig = None
    
    def __post_init__(self):
        """初始化默认配置"""
        if self.weights is None:
            self.weights = MatchWeights()
        if self.activity_weights is None:
            self.activity_weights = ActivityWeights()
        if self.activity_thresholds is None:
            self.activity_thresholds = ActivityThresholds()
        if self.demand_config is None:
            self.demand_config = DemandConfig()
    
    @classmethod
    def default(cls) -> "MatchConfig":
        """获取默认配置"""
        return cls()
    
    @classmethod
    def for_beginner(cls) -> "MatchConfig":
        """
        新手友好配置
        - 降低技能权重，更看重活跃度（活跃项目对新手更友好）
        - 降低需求权重（新手可能无法满足高需求）
        """
        return cls(
            weights=MatchWeights(w_skill=0.4, w_activity=0.4, w_demand=0.2),
            activity_weights=ActivityWeights(alpha=0.5, beta=0.3, gamma=0.2),
            activity_thresholds=ActivityThresholds(
                active_days_min=5,   # 新手需要更活跃的项目
                active_days_max=15,  # 但不能太拥挤
                issues_new_min=2,
                issues_new_max=10
            )
        )
    
    @classmethod
    def for_expert(cls) -> "MatchConfig":
        """
        专家配置
        - 提高技能匹配权重
        - 提高需求匹配权重（专家可以满足高需求）
        """
        return cls(
            weights=MatchWeights(w_skill=0.55, w_activity=0.2, w_demand=0.25),
            activity_weights=ActivityWeights(alpha=0.3, beta=0.4, gamma=0.3),
            activity_thresholds=ActivityThresholds(
                active_days_min=1,   # 专家不需要太活跃的项目
                active_days_max=25,
                openrank_min=5.0,    # 专家适合影响力更高的项目
                openrank_max=200.0
            )
        )
    
    @classmethod
    def for_issue_solver(cls) -> "MatchConfig":
        """
        Issue解决者配置
        - 提高需求匹配权重
        - 活跃度中更看重新issue数
        """
        return cls(
            weights=MatchWeights(w_skill=0.45, w_activity=0.25, w_demand=0.3),
            activity_weights=ActivityWeights(alpha=0.25, beta=0.5, gamma=0.25)
        )


# 默认配置实例
DEFAULT_CONFIG = MatchConfig.default()
