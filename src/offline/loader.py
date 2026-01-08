"""
离线数据加载器，从本地文件系统加载 OpenDigger 指标数据。
"""

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class OfflineRepoLoader:
    """
    从本地文件系统加载仓库指标数据并计算评分。
    """

    def __init__(self, base_path: str = "./top_300_metrics") -> None:
        """
        :param base_path: 离线数据根目录路径
        """
        self.base_path = Path(base_path)
        if not self.base_path.exists():
            logger.warning(f"离线数据目录不存在: {self.base_path}")

    def _load_json_file(self, file_path: Path) -> Optional[Any]:
        """加载 JSON 文件，失败时返回 None 并记录警告"""
        try:
            if not file_path.exists():
                logger.warning(f"文件不存在: {file_path}")
                return None
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            logger.error(f"无效的 JSON 文件 {file_path}: {e}")
            return None
        except Exception as e:
            logger.error(f"读取文件失败 {file_path}: {e}")
            return None

    def _calculate_active_score(self, active_data: Dict[str, List[int]]) -> float:
        """
        计算活跃度分数：近3个月活跃天数 × 每日活跃峰值 / 100 (max=1.0)
        """
        if not active_data:
            return 0.0

        # 获取最近3个月的数据（简化处理）
        now = datetime.now()
        three_months_ago = (now - timedelta(days=90)).replace(day=1)
        recent_data = []

        for month_key, daily_values in active_data.items():
            if not isinstance(daily_values, list):
                continue
            # 解析月份键（格式：YYYY-MM）
            try:
                month_date = datetime.strptime(month_key, "%Y-%m")
                if month_date >= three_months_ago:
                    # 数组中的每个值代表一天的活跃度，取前30个（假设是最近30天）
                    recent_data.extend(daily_values[:30])
            except ValueError:
                # 跳过无效的键（如 "2021-10-raw"）
                continue

        if not recent_data:
            return 0.0

        # 计算活跃天数（值 > 0 的天数）
        active_days = sum(1 for v in recent_data if v > 0)
        # 计算峰值
        peak = max(recent_data) if recent_data else 0

        score = (active_days * peak) / 100.0
        return min(score, 1.0)

    def _calculate_influence_score(self, openrank_data: Dict[str, float]) -> float:
        """
        计算影响力分数：取最新月份 OpenRank 值 / 50 (max=1.0)
        """
        if not openrank_data:
            return 0.0

        # 过滤掉无效键，获取有效的年月键
        valid_entries = []
        for key, value in openrank_data.items():
            try:
                datetime.strptime(key, "%Y-%m")
                valid_entries.append((key, value))
            except ValueError:
                continue

        if not valid_entries:
            return 0.0

        # 获取最新的值
        latest_value = max(valid_entries, key=lambda x: x[0])[1]
        score = latest_value / 50.0
        return min(score, 1.0)

    def _calculate_demand_score(self, issues_data: Dict[str, int]) -> float:
        """
        计算需求热度分数：近3个月新增 issue 总数 / 50 (max=1.0)
        """
        if not issues_data:
            return 0.0

        # 获取最近3个月的数据
        now = datetime.now()
        three_months_ago = (now - timedelta(days=90)).replace(day=1)
        total_issues = 0

        for month_key, count in issues_data.items():
            try:
                month_date = datetime.strptime(month_key, "%Y-%m")
                if month_date >= three_months_ago:
                    total_issues += count
            except ValueError:
                continue

        score = total_issues / 50.0
        return min(score, 1.0)

    def _format_raw_metrics(
        self,
        active_data: Optional[Dict[str, List[int]]],
        openrank_data: Optional[Dict[str, float]],
        issues_data: Optional[Dict[str, int]],
    ) -> Dict[str, str]:
        """格式化原始指标为字符串格式"""
        raw_metrics: Dict[str, str] = {}

        if active_data:
            # 格式化活跃度：日期:活跃度值
            active_strs = []
            for month_key, daily_values in active_data.items():
                if isinstance(daily_values, list):
                    # 简化：只取前几个示例
                    active_strs.append(f"{month_key}:{sum(daily_values)}")
            raw_metrics["active_dates"] = ",".join(active_strs[:10])  # 限制长度

        if openrank_data:
            # 格式化 OpenRank：年月:值
            openrank_strs = [
                f"{k}:{v}" for k, v in sorted(openrank_data.items())[-6:]
            ]
            raw_metrics["openrank"] = ",".join(openrank_strs)

        if issues_data:
            # 格式化 issues：年月:数量
            issues_strs = [
                f"{k}:{v}" for k, v in sorted(issues_data.items())[-6:]
            ]
            raw_metrics["issues_new"] = ",".join(issues_strs)

        return raw_metrics

    def load(self, repo_id: str) -> Optional[Dict[str, Any]]:
        """
        加载指定仓库的离线数据并计算指标。

        :param repo_id: 仓库ID（格式：owner/repo）
        :return: 仓库数据字典，如果加载失败返回 None
        """
        parts = repo_id.split("/")
        if len(parts) != 2:
            logger.error(f"无效的 repo_id 格式: {repo_id}")
            return None

        owner, repo = parts
        repo_dir = self.base_path / owner / repo

        if not repo_dir.exists():
            logger.warning(f"仓库目录不存在: {repo_dir}")
            return None

        # 加载指标文件
        active_file = repo_dir / "active_dates_and_times.json"
        openrank_file = repo_dir / "openrank.json"
        issues_file = repo_dir / "issues_new.json"
        meta_file = repo_dir / "meta.json"

        active_data = self._load_json_file(active_file)
        openrank_data = self._load_json_file(openrank_file)
        issues_data = self._load_json_file(issues_file)
        meta_data = self._load_json_file(meta_file)

        # 如果所有关键文件都不存在，返回 None
        if not any([active_data, openrank_data, issues_data]):
            logger.warning(f"仓库 {repo_id} 没有可用的指标数据")
            return None

        # 计算指标分数
        active_score = self._calculate_active_score(
            active_data if isinstance(active_data, dict) else {}
        )
        influence_score = self._calculate_influence_score(
            openrank_data if isinstance(openrank_data, dict) else {}
        )
        demand_score = self._calculate_demand_score(
            issues_data if isinstance(issues_data, dict) else {}
        )

        # 计算综合分数
        composite_score = 0.5 * active_score + 0.3 * influence_score + 0.2 * demand_score

        # 提取元数据
        name = repo
        description = "No description (offline mode)"
        languages: List[str] = ["unknown"]

        if meta_data and isinstance(meta_data, dict):
            name = meta_data.get("name", repo)
            description = meta_data.get("description", description)
            # 尝试从 meta.json 提取语言信息
            if "languages" in meta_data:
                languages = meta_data["languages"]
            elif "language" in meta_data:
                languages = [meta_data["language"]]

        # 构建返回数据
        result: Dict[str, Any] = {
            "repo_id": repo_id,
            "name": name,
            "description": description,
            "languages": languages if isinstance(languages, list) else ["unknown"],
            "active_score": round(active_score, 4),
            "influence_score": round(influence_score, 4),
            "demand_score": round(demand_score, 4),
            "composite_score": round(composite_score, 4),
            "raw_metrics": self._format_raw_metrics(
                active_data if isinstance(active_data, dict) else None,
                openrank_data if isinstance(openrank_data, dict) else None,
                issues_data if isinstance(issues_data, dict) else None,
            ),
        }

        return result

