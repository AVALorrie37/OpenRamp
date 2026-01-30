"""
FastAPI 服务器，提供统一的仓库数据接口。
"""

import logging
import sys
import json
import asyncio
import time
from typing import List, Optional, Dict, Any, Tuple
from collections import deque
from datetime import datetime

try:
    from fastapi import FastAPI, HTTPException, Query, Body
    from fastapi.responses import StreamingResponse
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
except ImportError:
    raise ImportError(
        "需要安装 fastapi 和 uvicorn: pip install fastapi uvicorn"
    )

from src.data_layer.online.OpenDiggerAPI.client import OpenDiggerClient
from src.data_layer.offline.loader import OfflineRepoLoader
from src.core.ai.conversation_handler import ConversationHandler
from src.core.match import MatchScorer, UserProfile, RepoData
from src.data_layer.online.integrated_search import IntegratedRepoSearch
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="OpenDigger API Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_log_buffer = deque(maxlen=200)
_log_lock = asyncio.Lock()

class LogHandler(logging.Handler):
    def emit(self, record):
        log_entry = {
            "level": record.levelname,
            "message": self.format(record),
            "timestamp": datetime.now().isoformat()
        }
        _log_buffer.append(log_entry)

_log_handler = LogHandler()
_log_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(_log_handler)
logging.getLogger().addHandler(_log_handler)

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


class ChatRequest(BaseModel):
    user_id: str
    message: str
    session_id: Optional[str] = None
    language: Optional[str] = None
    agent_type: str = 'agent1'


class ProfileConfirmRequest(BaseModel):
    user_id: str


class SyncProfileRequest(BaseModel):
    user_id: str
    skills: List[str]
    preferences: List[str]
    language: Optional[str] = None


class MatchRequest(BaseModel):
    user_id: str
    repo_id: str


class SearchRequest(BaseModel):
    user_id: str
    limit: Optional[int] = 10


_conversation_handlers: Dict[str, ConversationHandler] = {}
_session_to_handler: Dict[str, str] = {}
_match_scorer: Optional[MatchScorer] = None
_integrated_search: Optional[IntegratedRepoSearch] = None


def get_conversation_handler(user_id: str, agent_type: str = 'agent1', user_language: str = None, session_id: Optional[str] = None) -> Tuple[ConversationHandler, str]:
    """获取或创建用户的对话处理器，返回(handler, session_id)"""
    global _conversation_handlers, _session_to_handler
    
    handler_key = f"{user_id}_{agent_type}"
    
    if session_id and session_id in _session_to_handler:
        handler_key = _session_to_handler[session_id]
        if handler_key in _conversation_handlers:
            handler = _conversation_handlers[handler_key]
            if user_language and user_language != handler.user_language:
                handler.set_user_language(user_language)
            return handler, session_id
    
    if handler_key not in _conversation_handlers:
        if user_language is None:
            user_language = _get_user_language_from_profile(user_id)
        _conversation_handlers[handler_key] = ConversationHandler(user_id=user_id, user_language=user_language or 'chinese')
    
    if not session_id:
        session_id = f"{user_id}_{agent_type}_{int(time.time() * 1000)}"
    
    _session_to_handler[session_id] = handler_key
    handler = _conversation_handlers[handler_key]
    
    if user_language and user_language != handler.user_language:
        handler.set_user_language(user_language)
    
    return handler, session_id

def _get_user_language_from_profile(user_id: str) -> Optional[str]:
    """从用户profile获取语言偏好"""
    try:
        handler = ConversationHandler(user_id=user_id)
        cached = handler._load_profile_from_cache()
        if cached and cached.get('language'):
            return cached.get('language')
    except:
        pass
    return None


def get_match_scorer() -> MatchScorer:
    global _match_scorer
    if _match_scorer is None:
        _match_scorer = MatchScorer()
    return _match_scorer


def get_integrated_search() -> IntegratedRepoSearch:
    global _integrated_search
    if _integrated_search is None:
        _integrated_search = IntegratedRepoSearch()
    return _integrated_search


@app.post("/api/chat")
async def chat(request: ChatRequest = Body(...)):
    try:
        handler, session_id = get_conversation_handler(
            request.user_id, 
            request.agent_type, 
            request.language, 
            request.session_id
        )
        result = handler.process_user_input(request.message)
        
        if request.agent_type != 'agent1':
            logger.info(f"[{request.agent_type}] User: {request.user_id}, Message: {request.message[:100]}")
            logger.info(f"[{request.agent_type}] Response: {result.get('reply', '')[:200]}")
            return {
                "reply": "",
                "status": "hidden",
                "skills": [],
                "preferences": [],
                "action": "REPLY",
                "confirmed": False,
                "session_id": session_id
            }
        
        action = result.get('action', 'REPLY')
        data = result.get('data', {})
        confirmed = data.get('confirmed', False) or action == 'CONFIRM_PROFILE'
        profile_updated = data.get('profile_updated', False)
        skills = data.get("skills", [])
        preferences = data.get("contribution_styles", [])
        return {
            "reply": result.get("reply", ""),
            "status": "collecting" if not confirmed else "confirmed",
            "skills": skills,
            "preferences": preferences,
            "action": action,
            "confirmed": confirmed,
            "profile_updated": profile_updated,
            "session_id": session_id,
            "profile": {
                "skills": skills,
                "contribution_types": preferences,
                "experience_level": "intermediate"
            } if (confirmed or profile_updated) else None
        }
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/profile/confirm")
async def confirm_profile(request: ProfileConfirmRequest = Body(...)):
    try:
        handler = get_conversation_handler(request.user_id)
        profile = handler.get_current_profile()
        
        if profile.get('skills') or profile.get('contribution_styles'):
            # 触发确认保存，使用handler的user_language
            result = handler._handle_confirm(handler.user_language)
            return {
                "profile": {
                    "skills": profile.get("skills", []),
                    "contribution_types": profile.get("contribution_styles", []),
                    "experience_level": "intermediate"
                },
                "skills": profile.get("skills", [])
            }
        raise HTTPException(status_code=404, detail="Profile not found. Please complete the conversation first.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Confirm profile error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/profile/sync")
async def sync_profile(request: SyncProfileRequest = Body(...)):
    try:
        handler, _ = get_conversation_handler(
            request.user_id,
            'agent1',
            request.language,
            None
        )
        handler.sync_profile_from_frontend(request.skills, request.preferences)
        return {
            "status": "success",
            "message": "Profile synced successfully"
        }
    except Exception as e:
        logger.error(f"Sync profile error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/profile/{user_id}")
async def get_profile(user_id: str):
    try:
        handler = get_conversation_handler(user_id)
        profile = handler.get_current_profile()
        
        # 尝试从缓存获取language
        cached = handler._load_profile_from_cache()
        user_language = cached.get('language') if cached else handler.user_language
        
        if profile.get('skills') or profile.get('contribution_styles'):
            return {
                "skills": profile.get("skills", []),
                "preferences": profile.get("contribution_styles", []),
                "experience": "intermediate",
                "language": user_language or 'chinese'
            }
        
        return {
            "skills": [],
            "preferences": [],
            "experience": "intermediate",
            "language": user_language or 'chinese'
        }
    except Exception as e:
        logger.error(f"Get profile error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/match")
async def calculate_match(request: MatchRequest = Body(...)):
    try:
        handler = get_conversation_handler(request.user_id)
        scorer = get_match_scorer()
        
        profile = handler.get_current_profile()
        if not profile.get('skills') and not profile.get('contribution_styles'):
            raise HTTPException(status_code=404, detail="User profile not found")
        
        user_profile_dict = {
            "skills": profile.get("skills", []),
            "contribution_style": profile.get("contribution_styles", [])[0] if profile.get("contribution_styles") else None,
            "experience_level": "intermediate"
        }
        user_profile = UserProfile.from_dict(user_profile_dict)
        
        all_repos = load_offline_repos()
        repo_data_dict = None
        for repo in all_repos:
            if repo["repo_id"] == request.repo_id:
                repo_data_dict = repo
                break
        
        if not repo_data_dict:
            raise HTTPException(status_code=404, detail="Repository not found")
        
        repo_data = RepoData(
            keywords=repo_data_dict.get("languages", []) + (repo_data_dict.get("description", "") or "").split(),
            active_days_last_30=30,
            issues_new_last_30=int(repo_data_dict.get("demand_score", 0) * 50),
            openrank=repo_data_dict.get("influence_score", 0) * 50,
            name=repo_data_dict.get("name"),
            full_name=repo_data_dict.get("repo_id")
        )
        
        match_result = scorer.calculate(user_profile, repo_data)
        return match_result.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Match calculation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search")
async def search_repos(request: SearchRequest = Body(...)):
    try:
        searcher = get_integrated_search()
        result = searcher.search_with_profile_matching(
            user_id=request.user_id,
            target_count=request.limit or 10
        )
        
        if not result.is_sufficient:
            return {
                "mode": "online",
                "repos": [],
                "message": result.message
            }
        
        repos = []
        for repo_result in result.repositories:
            repos.append({
                "repo_id": repo_result.repo_id,
                "name": repo_result.repo_id.split("/")[-1],
                "description": repo_result.description or "No description",
                "languages": repo_result.languages or [],
                "active_score": repo_result.active_score,
                "influence_score": repo_result.influence_score,
                "demand_score": repo_result.demand_score,
                "composite_score": repo_result.match_score,
                "raw_metrics": None
            })
        
        return {
            "mode": "online",
            "repos": repos
        }
    except Exception as e:
        logger.error(f"Search error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/logs/stream")
async def stream_logs():
    async def generate():
        last_index = len(_log_buffer)
        while True:
            await asyncio.sleep(0.5)
            current_logs = list(_log_buffer)
            if len(current_logs) > last_index:
                new_logs = current_logs[last_index:]
                for log_entry in new_logs:
                    yield f"data: {json.dumps(log_entry)}\n\n"
                last_index = len(current_logs)
    
    return StreamingResponse(generate(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

