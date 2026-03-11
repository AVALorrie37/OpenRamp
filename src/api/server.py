"""
FastAPI 服务器，提供统一的仓库数据接口。
"""

import logging
import sys
import json
import asyncio
import time
import queue
from concurrent.futures import ThreadPoolExecutor
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
import httpx

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
    mode: str = Query("online", description="数据源模式: online 或 offline"),
    repo_ids: Optional[List[str]] = Query(None, description="仓库ID列表"),
    limit: int = Query(20, description="返回数量上限", ge=1, le=1000),
):
    """
    获取仓库数据列表。
    """
    source = "offline"
    try:
        if mode == "online":
            if not repo_ids:
                offline_repos = load_offline_repos()
                if not offline_repos:
                    raise HTTPException(
                        status_code=400,
                        detail="在线模式必须提供 repo_ids 参数，且当前无离线数据可用",
                    )
                repos = offline_repos
                source = "offline"
            else:
                client = get_online_client()
                repos = []
                offline_repos = load_offline_repos()
                offline_map = {r["repo_id"]: r for r in offline_repos}
                for repo_id in repo_ids:
                    used_offline = False
                    try:
                        online_data = client.get_activity_data(repo_id)
                        unified_data = convert_online_to_unified(online_data, repo_id)
                        unified_data["source"] = "opendigger_online"
                        repos.append(unified_data)
                    except Exception as e:
                        logger.warning(f"获取仓库 {repo_id} 在线数据失败: {e}")
                        offline_repo = offline_map.get(repo_id)
                        if offline_repo:
                            repo_copy = dict(offline_repo)
                            repo_copy["source"] = "offline_dataset"
                            repos.append(repo_copy)
                            used_offline = True
                        else:
                            logger.error(f"仓库 {repo_id} 在线和离线数据都不可用")
                    if not used_offline:
                        source = "online"
                if any(r.get("source") == "offline_dataset" for r in repos):
                    mode = "online_with_offline_fallback"
        else:
            all_repos = load_offline_repos()
            if not all_repos:
                raise HTTPException(
                    status_code=503,
                    detail="离线数据未挂载，请检查 top_300_metrics 目录",
                )
            if repo_ids:
                repo_id_set = set(repo_ids)
                repos = [r for r in all_repos if r["repo_id"] in repo_id_set]
                found_ids = {r["repo_id"] for r in repos}
                missing_ids = repo_id_set - found_ids
                if missing_ids:
                    raise HTTPException(
                        status_code=404,
                        detail=f"以下仓库ID未找到: {list(missing_ids)}",
                    )
            else:
                repos = all_repos
            repos = [dict(r, source="offline_dataset") for r in repos]
            source = "offline_dataset"
        repos.sort(key=lambda x: x["composite_score"], reverse=True)
        repos = repos[:limit]
        return {
            "mode": mode,
            "source": source,
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


@app.post("/api/chat/greeting")
async def chat_greeting(request: 'GreetingRequest' = Body(...)):
    try:
        handler, session_id = get_conversation_handler(
            request.user_id,
            request.agent_type,
            request.language,
            request.session_id,
        )
        greeting = handler.get_initial_greeting(request.language)
        return {
            "greeting": greeting,
            "session_id": session_id,
            "language": handler.user_language,
            "mode": "online",
            "source": "ollama_online",
        }
    except Exception as e:
        logger.error(f"Greeting error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class ChatRequest(BaseModel):
    user_id: str
    message: str
    session_id: Optional[str] = None
    language: Optional[str] = None
    agent_type: str = 'agent1'


class GreetingRequest(BaseModel):
    user_id: str
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


class SearchCancelRequest(BaseModel):
    search_id: str


_conversation_handlers: Dict[str, ConversationHandler] = {}
_session_to_handler: Dict[str, str] = {}
_match_scorer: Optional[MatchScorer] = None
_integrated_search: Optional[IntegratedRepoSearch] = None
_http_client: Optional[httpx.AsyncClient] = None


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


def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=10.0)
    return _http_client


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
                "intent": "",
                "confirmed": False,
                "session_id": session_id
            }
        
        action = result.get('action', 'REPLY')
        data = result.get('data', {})
        confirmed = data.get('confirmed', False) or action == 'CONFIRM_PROFILE'
        profile_updated = data.get('profile_updated', False)
        skills = data.get("skills", [])
        preferences = data.get("contribution_styles", [])
        auto_search = data.get("auto_search", False)
        intent = data.get("intent", "")
        return {
            "reply": result.get("reply", ""),
            "status": "collecting" if not confirmed else "confirmed",
            "skills": skills,
            "preferences": preferences,
            "action": action,
            "intent": intent,
            "confirmed": confirmed,
            "profile_updated": profile_updated,
            "session_id": session_id,
            "mode": "online",
            "source": "ollama_online",
            "auto_search": auto_search,
            "profile": {
                "skills": skills,
                "contribution_types": preferences,
                "experience_level": "intermediate"
            } if (confirmed or profile_updated) else None
        }
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _chat_result_to_response(result: Dict[str, Any], session_id: str, agent_type: str) -> Dict[str, Any]:
    if agent_type != 'agent1':
        return {
            "reply": "", "status": "hidden", "skills": [], "preferences": [],
            "action": "REPLY", "intent": "", "confirmed": False, "session_id": session_id
        }
    action = result.get('action', 'REPLY')
    data = result.get('data', {})
    confirmed = data.get('confirmed', False) or action == 'CONFIRM_PROFILE'
    profile_updated = data.get('profile_updated', False)
    skills = data.get("skills", [])
    preferences = data.get("contribution_styles", [])
    auto_search = data.get("auto_search", False)
    intent = data.get("intent", "")
    return {
        "reply": result.get("reply", ""),
        "status": "collecting" if not confirmed else "confirmed",
        "skills": skills,
        "preferences": preferences,
        "action": action,
        "intent": intent,
        "confirmed": confirmed,
        "profile_updated": profile_updated,
        "session_id": session_id,
        "auto_search": auto_search,
        "profile": {
            "skills": skills,
            "contribution_types": preferences,
            "experience_level": "intermediate"
        } if (confirmed or profile_updated) else None
    }


_stream_executor = ThreadPoolExecutor(max_workers=4)


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest = Body(...)):
    async def event_stream():
        sync_q = queue.Queue()
        try:
            handler, session_id = get_conversation_handler(
                request.user_id,
                request.agent_type,
                request.language,
                request.session_id
            )

            def on_stage(name: str, data: Dict[str, Any]):
                sync_q.put({"type": "stage", "stage": name, "data": data})

            def run():
                try:
                    result = handler.process_user_input(request.message, on_stage=on_stage)
                    sync_q.put({"type": "result", "result": result, "session_id": session_id})
                except Exception as e:
                    sync_q.put({"type": "error", "detail": str(e)})

            loop = asyncio.get_event_loop()
            fut = _stream_executor.submit(run)
            while True:
                try:
                    item = await asyncio.wait_for(
                        loop.run_in_executor(None, sync_q.get),
                        timeout=300.0
                    )
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'stage': 'error', 'detail': 'timeout'})}\n\n"
                    break
                if item["type"] == "stage":
                    yield f"data: {json.dumps({'stage': item['stage'], **item['data']})}\n\n"
                elif item["type"] == "result":
                    result = item["result"]
                    session_id = item["session_id"]
                    if request.agent_type != 'agent1':
                        payload = _chat_result_to_response(result, session_id, request.agent_type)
                    else:
                        payload = _chat_result_to_response(result, session_id, 'agent1')
                    payload["stage"] = "reply"
                    yield f"data: {json.dumps(payload)}\n\n"
                    break
                else:
                    yield f"data: {json.dumps({'stage': 'error', 'detail': item.get('detail', 'unknown')})}\n\n"
                    break
        except Exception as e:
            logger.error(f"Chat stream error: {e}", exc_info=True)
            yield f"data: {json.dumps({'stage': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )


@app.post("/api/profile/confirm")
async def confirm_profile(request: ProfileConfirmRequest = Body(...)):
    try:
        handler, _ = get_conversation_handler(request.user_id)
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
        handler, _ = get_conversation_handler(user_id)
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
        handler, _ = get_conversation_handler(request.user_id)
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
        mode = "online"
        fallback_used = False
        repos = []
        if not result.is_sufficient or not result.repositories:
            offline_repos = load_offline_repos()
            if offline_repos:
                handler, _ = get_conversation_handler(request.user_id)
                profile = handler.get_current_profile()
                scorer = get_match_scorer()
                user_profile = UserProfile.from_dict(
                    {
                        "skills": profile.get("skills", []),
                        "contribution_style": profile.get("contribution_styles", [None])[0],
                        "experience_level": "intermediate",
                    }
                )
                scored = []
                for r in offline_repos:
                    repo_data = RepoData(
                        keywords=r.get("languages", []) + (r.get("description") or "").split(),
                        active_days_last_30=30,
                        issues_new_last_30=int(r.get("demand_score", 0) * 50),
                        openrank=r.get("influence_score", 0) * 50,
                        name=r.get("name"),
                        full_name=r.get("repo_id"),
                    )
                    match = scorer.calculate(user_profile, repo_data)
                    scored.append((r, match.match_score))
                scored.sort(key=lambda x: x[1], reverse=True)
                limit = request.limit or 10
                for repo_dict, score in scored[:limit]:
                    repo_copy = dict(repo_dict)
                    repo_copy["source"] = "offline_dataset"
                    repos.append(
                        {
                            "repo_id": repo_copy["repo_id"],
                            "name": repo_copy["name"],
                            "description": repo_copy.get("description") or "No description",
                            "languages": repo_copy.get("languages") or [],
                            "active_score": repo_copy.get("active_score", 0.0),
                            "influence_score": repo_copy.get("influence_score", 0.0),
                            "demand_score": repo_copy.get("demand_score", 0.0),
                            "composite_score": repo_copy.get("composite_score", 0.0),
                            "raw_metrics": None,
                            "match_score": score,
                            "source": repo_copy.get("source", "offline_dataset"),
                        }
                    )
                mode = "online_with_offline_fallback"
                fallback_used = True
                message = result.message or "Using offline dataset as fallback."
            else:
                message = result.message or "No offline dataset available."
        else:
            for repo_result in result.repositories:
                repos.append(
                    {
                        "repo_id": repo_result.repo_id,
                        "name": repo_result.repo_id.split("/")[-1],
                        "description": repo_result.description or "No description",
                        "languages": repo_result.languages,
                        "active_score": repo_result.active_score,
                        "influence_score": repo_result.influence_score,
                        "demand_score": repo_result.demand_score,
                        "composite_score": repo_result.composite_score,
                        "raw_metrics": None,
                        "match_score": repo_result.match_score,
                        "source": "github_opendigger_online",
                    }
                )
            message = result.message
        return {
            "mode": mode,
            "source": "github_opendigger_online" if not fallback_used else "offline_dataset",
            "fallback_used": fallback_used,
            "message": message,
            "repos": repos,
        }
    except Exception as e:
        logger.error(f"Search error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search/cancel")
async def cancel_search(request: SearchCancelRequest = Body(...)):
    try:
        logger.info(f"Received search cancel request for search_id={request.search_id}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Search cancel error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class GithubSearchRequest(BaseModel):
    query: str
    per_page: Optional[int] = 20
    page: Optional[int] = 1


class BulkEnrichRequest(BaseModel):
    repos: List[Dict[str, str]]


@app.get("/api/github/search_repos")
async def github_search_repos(
    q: str = Query(..., description="GitHub search query"),
    per_page: int = Query(20, ge=1, le=50),
    page: int = Query(1, ge=1, le=10),
):
    try:
        client = get_http_client()
        params = {"q": q, "per_page": per_page, "page": page}
        headers = {"Accept": "application/vnd.github+json"}
        resp = await client.get("https://api.github.com/search/repositories", params=params, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        data["mode"] = "online"
        data["source"] = "github_online"
        return data
    except httpx.HTTPStatusError as e:
        logger.error(f"GitHub search HTTP error: {e}", exc_info=True)
        raise HTTPException(status_code=e.response.status_code, detail="GitHub search failed")
    except httpx.HTTPError as e:
        logger.error(f"GitHub search network error: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail="GitHub search unavailable")
    except Exception as e:
        logger.error(f"GitHub search unexpected error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.post("/api/repos/bulk_enrich")
async def bulk_enrich_repos(request: BulkEnrichRequest = Body(...)):
    try:
        repo_ids = [r.get("repo_id") or r.get("full_name") for r in request.repos]
        repo_ids = [r for r in repo_ids if r]
        if not repo_ids:
            raise HTTPException(status_code=400, detail="No valid repo ids")
        offline = load_offline_repos()
        enriched = []
        offline_map = {r["repo_id"]: r for r in offline}
        for rid in repo_ids:
            if rid in offline_map:
                enriched.append(offline_map[rid])
                continue
            try:
                client = get_online_client()
                online_data = client.get_activity_data(rid)
                unified = convert_online_to_unified(online_data, rid)
                enriched.append(unified)
            except Exception as e:
                logger.warning(f"bulk_enrich failed for {rid}, using zero scores: {e}")
                parts = rid.split("/")
                repo_name = parts[1] if len(parts) == 2 else rid
                placeholder = {
                    "repo_id": rid,
                    "name": repo_name,
                    "description": "仓库信息补全中（暂无 OpenDigger 数据）",
                    "languages": ["unknown"],
                    "active_score": 0.0,
                    "influence_score": 0.0,
                    "demand_score": 0.0,
                    "composite_score": 0.0,
                    "raw_metrics": {"note": "no OpenDigger data"}
                }
                enriched.append(placeholder)
                if rid not in offline_map:
                    offline.append(placeholder)
                    offline_map[rid] = placeholder
        return {
            "mode": "mixed",
            "repos": enriched,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"bulk_enrich error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


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

