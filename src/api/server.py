"""
FastAPI 服务器，提供统一的仓库数据接口。
"""

import logging
from typing import List, Optional

try:
    from fastapi import FastAPI, HTTPException, Query
    from pydantic import BaseModel
except ImportError:
    raise ImportError(
        "需要安装 fastapi 和 uvicorn: pip install fastapi uvicorn"
    )

from src.online.OpenDiggerAPI.client import OpenDiggerClient
from src.offline.loader import OfflineRepoLoader

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="OpenDigger API Server", version="1.0.0")

# 全局缓存
_offline_cache: Optional[List[dict]] = None
_offline_loader: Optional[OfflineRepoLoader] = None
_online_client: Optional[OpenDiggerClient] = None


class RepoResponse(BaseModel):
    """仓库响应模型"""
    repo_id: str
    name: str
    description: str
    languages: List[str]
    active_score: float
    influence_score: float
    demand_score: float
    composite_score: float
    raw_metrics: Optional[dict] = None


class ReposResponse(BaseModel):
    """仓库列表响应模型"""
    mode: str
    repos: List[RepoResponse]


def get_offline_loader() -> OfflineRepoLoader:
    """获取离线加载器实例"""
    global _offline_loader
    if _offline_loader is None:
        _offline_loader = OfflineRepoLoader()
    return _offline_loader


def get_online_client() -> OpenDiggerClient:
    """获取在线客户端实例"""
    global _online_client
    if _online_client is None:
        _online_client = OpenDiggerClient(timeout=10.0)
    return _online_client


def load_offline_repos() -> List[dict]:
    """预加载所有离线仓库数据"""
    global _offline_cache
    if _offline_cache is not None:
        return _offline_cache

    logger.info("开始预加载离线仓库数据...")
    loader = get_offline_loader()
    base_path = loader.base_path

    if not base_path.exists():
        logger.warning(f"离线数据目录不存在: {base_path}")
        _offline_cache = []
        return _offline_cache

    repos = []
    for owner_dir in base_path.iterdir():
        if not owner_dir.is_dir():
            continue
        owner = owner_dir.name
        for repo_dir in owner_dir.iterdir():
            if not repo_dir.is_dir():
                continue
            repo = repo_dir.name
            repo_id = f"{owner}/{repo}"
            repo_data = loader.load(repo_id)
            if repo_data:
                repos.append(repo_data)

    logger.info(f"预加载完成，共 {len(repos)} 个仓库")
    _offline_cache = repos
    return repos


def convert_online_to_unified(online_data: dict, repo_id: str) -> dict:
    """
    将在线数据转换为统一格式。
    注意：在线模式不返回 raw_metrics。
    """
    # 计算指标（使用与离线模式相同的逻辑）
    active_data = online_data.get("active_dates_and_times", {})
    openrank_data = online_data.get("openrank", {})
    issues_data = online_data.get("issues_new", {})

    # 使用离线加载器的计算方法（临时创建实例）
    loader = OfflineRepoLoader()
    active_score = loader._calculate_active_score(
        active_data if isinstance(active_data, dict) else {}
    )
    influence_score = loader._calculate_influence_score(
        openrank_data if isinstance(openrank_data, dict) else {}
    )
    demand_score = loader._calculate_demand_score(
        issues_data if isinstance(issues_data, dict) else {}
    )
    composite_score = 0.5 * active_score + 0.3 * influence_score + 0.2 * demand_score

    parts = repo_id.split("/")
    repo_name = parts[1] if len(parts) == 2 else repo_id

    return {
        "repo_id": repo_id,
        "name": repo_name,
        "description": "No description (online mode)",
        "languages": ["unknown"],
        "active_score": round(active_score, 4),
        "influence_score": round(influence_score, 4),
        "demand_score": round(demand_score, 4),
        "composite_score": round(composite_score, 4),
        "raw_metrics": None,  # 在线模式不返回 raw_metrics
    }


@app.on_event("startup")
async def startup_event():
    """启动时预加载离线数据"""
    try:
        load_offline_repos()
    except Exception as e:
        logger.error(f"预加载离线数据失败: {e}")


@app.get("/api/repos", response_model=ReposResponse)
async def get_repos(
    mode: str = Query("offline", description="数据源模式: online 或 offline"),
    repo_ids: Optional[List[str]] = Query(None, description="仓库ID列表"),
    limit: int = Query(20, description="返回数量上限", ge=1, le=1000),
):
    """
    获取仓库数据列表。

    - **mode**: 数据源模式，`offline`（默认）或 `online`
    - **repo_ids**: 可选的仓库ID列表，如果提供则只返回这些仓库
    - **limit**: 返回数量上限（默认20，最大1000）
    """
    try:
        if mode == "online":
            # 在线模式
            if not repo_ids:
                raise HTTPException(
                    status_code=400,
                    detail="在线模式必须提供 repo_ids 参数",
                )

            client = get_online_client()
            repos = []
            for repo_id in repo_ids:
                try:
                    online_data = client.get_activity_data(repo_id)
                    unified_data = convert_online_to_unified(online_data, repo_id)
                    repos.append(unified_data)
                except Exception as e:
                    logger.warning(f"获取仓库 {repo_id} 在线数据失败: {e}")
                    # 尝试使用离线缓存作为降级
                    offline_repos = load_offline_repos()
                    for offline_repo in offline_repos:
                        if offline_repo["repo_id"] == repo_id:
                            repos.append(offline_repo)
                            break
                    else:
                        logger.error(f"仓库 {repo_id} 在线和离线数据都不可用")

        else:
            # 离线模式
            all_repos = load_offline_repos()

            if not all_repos:
                raise HTTPException(
                    status_code=503,
                    detail="离线数据未挂载，请检查 top_300_metrics 目录",
                )

            if repo_ids:
                # 过滤指定的仓库
                repo_id_set = set(repo_ids)
                repos = [r for r in all_repos if r["repo_id"] in repo_id_set]
                # 检查是否有无效的 repo_id
                found_ids = {r["repo_id"] for r in repos}
                missing_ids = repo_id_set - found_ids
                if missing_ids:
                    raise HTTPException(
                        status_code=404,
                        detail=f"以下仓库ID未找到: {list(missing_ids)}",
                    )
            else:
                repos = all_repos

        # 按综合分数排序
        repos.sort(key=lambda x: x["composite_score"], reverse=True)

        # 限制数量
        repos = repos[:limit]

        return {
            "mode": mode,
            "repos": repos,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"处理请求失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


@app.get("/health")
async def health_check():
    """健康检查端点"""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

