"""
FastAPI 服务器，提供统一的仓库数据接口。
"""

import logging
import sys
import json
import os
import asyncio
import time
import queue
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv

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
from src.data_layer.online.GithubAPI.client import GitHubClient
from src.data_layer.offline.loader import OfflineRepoLoader
from src.core.ai.conversation_handler import ConversationHandler
from src.core.match import MatchScorer, UserProfile, RepoData
from src.core.match.config import MatchConfig, MatchWeights, DEFAULT_CONFIG
from src.data_layer.online.integrated_search import IntegratedRepoSearch, build_unified_from_github_metadata
from src.data_layer.online.score_calibration_store import (
    CHANNEL_OPENDIGGER_ACTIVITY,
    CHANNEL_OPENDIGGER_DEMAND,
    get_calibration_store,
)
import re
import httpx

_REPO_ID_RE = re.compile(r'^[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+$')
_USER_ID_RE = re.compile(r'^[A-Za-z0-9_.\-@]{1,128}$')


def _validate_repo_id(repo_id: str) -> str:
    if not _REPO_ID_RE.match(repo_id):
        raise HTTPException(status_code=400, detail="Invalid repo_id format, expected 'owner/repo'")
    return repo_id


def _validate_user_id(user_id: str) -> str:
    if not _USER_ID_RE.match(user_id):
        raise HTTPException(status_code=400, detail="Invalid user_id format")
    return user_id


current_file = Path(__file__)
project_root = current_file.parent.parent.parent
env_path = project_root / ".env"
load_dotenv(dotenv_path=env_path)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="OpenDigger API Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    keywords: Optional[List[str]] = None


class ReposResponse(BaseModel):
    """仓库列表响应模型"""
    mode: str
    repos: List[RepoResponse]
    source: Optional[str] = None


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
        _online_client = OpenDiggerClient()
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

    if repos:
        try:
            client = GitHubClient(use_cache=True)
            for r in repos:
                if r.get("keywords"):
                    continue
                repo_id = r.get("repo_id")
                if not repo_id:
                    continue
                cached = client.get_cached_repo(repo_id)
                if cached:
                    kws = cached.get("keywords") or []
                    if kws:
                        r["keywords"] = kws
        except Exception:
            logger.warning("Failed to enrich offline repos with GitHub keywords", exc_info=True)
    logger.info(f"预加载完成，共 {len(repos)} 个仓库")
    _offline_cache = repos
    return repos


def convert_online_to_unified(online_data: dict, repo_id: str) -> dict:
    """
    将在线数据转换为统一格式。
    注意：在线模式不返回 raw_metrics。activity/demand 子分使用持久化分位校准（不写入样本池）。
    """
    active_data = online_data.get("active_dates_and_times", {})
    openrank_data = online_data.get("openrank", {})
    issues_data = online_data.get("issues_new", {})

    loader = OfflineRepoLoader()
    ad = active_data if isinstance(active_data, dict) else {}
    od = issues_data if isinstance(issues_data, dict) else {}
    orank = openrank_data if isinstance(openrank_data, dict) else {}
    ar = loader.compute_opendigger_active_raw(ad)
    dr = loader.compute_opendigger_demand_raw(od)
    store = get_calibration_store()
    active_score = round(store.normalize_single(CHANNEL_OPENDIGGER_ACTIVITY, ar), 4)
    demand_score = round(store.normalize_single(CHANNEL_OPENDIGGER_DEMAND, dr), 4)
    influence_score = loader._calculate_influence_score(orank)
    composite_score = 0.5 * active_score + 0.3 * influence_score + 0.2 * demand_score

    parts = repo_id.split("/")
    repo_name = parts[1] if len(parts) == 2 else repo_id

    openrank_str = ""
    if isinstance(openrank_data, dict) and openrank_data:
        sorted_entries = sorted(openrank_data.items())[-30:]
        openrank_str = ",".join(f"{k}:{v}" for k, v in sorted_entries)

    ad30 = int(online_data.get("active_days_last_30") or 0)
    iss30 = int(online_data.get("issues_new_last_30") or 0)

    base = {
        "repo_id": repo_id,
        "name": repo_name,
        "description": "",
        "languages": ["unknown"],
        "active_score": round(active_score, 4),
        "influence_score": round(influence_score, 4),
        "demand_score": round(demand_score, 4),
        "composite_score": round(composite_score, 4),
        "raw_metrics": {"openrank": openrank_str} if openrank_str else None,
        "keywords": [],
        "source": "opendigger_online",
        "active_days_last_30": ad30,
        "issues_new_last_30": iss30,
    }

    try:
        gh_client = GitHubClient(use_cache=True)
        cached = gh_client.get_cached_repo(repo_id)
        if cached:
            cached_desc = (cached.get("description") or "").strip()
            if cached_desc:
                base["description"] = cached_desc
            cached_kws = cached.get("keywords") or cached.get("topics") or []
            if cached_kws:
                base["keywords"] = cached_kws
    except Exception:
        logger.debug(f"Failed to get cached repo info for {repo_id}", exc_info=True)

    return base


def fetch_github_repo_for_match(repo_id: str) -> Optional[Dict[str, Any]]:
    """同步拉取 GitHub 仓库元数据，供 OpenDigger 缺失时的匹配兜底。"""
    try:
        headers = {"Accept": "application/vnd.github+json"}
        token = os.getenv("GITHUB_TOKEN")
        if token:
            headers["Authorization"] = f"token {token}"
        with httpx.Client(timeout=20.0) as client:
            r = client.get(f"https://api.github.com/repos/{repo_id}", headers=headers)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()
    except Exception as e:
        logger.warning("GITHUB_REPO_FETCH_FAILED: %s — %s", repo_id, e)
        return None


def apply_github_topics_if_missing(unified: Dict[str, Any], repo_id: str) -> None:
    """在线场景下优先用 GitHub 官方 topics 填充 keywords，避免仅用描述分词。"""
    if unified.get("keywords"):
        return
    gh_json = fetch_github_repo_for_match(repo_id)
    if not gh_json:
        return
    topics = gh_json.get("topics") or []
    if topics:
        unified["keywords"] = topics
    if not (unified.get("description") or "").strip():
        desc = (gh_json.get("description") or "").strip()
        if desc:
            unified["description"] = desc
    try:
        gh_client = GitHubClient(use_cache=True)
        kws = list(unified.get("keywords") or topics or [])
        payload = {
            "description": ((gh_json.get("description") or "").strip() or unified.get("description", "")),
            "keywords": kws,
            "topics": kws,
        }
        gh_client._write_repo_to_cache(repo_id, payload)
    except Exception:
        logger.debug("Failed to write GitHub cache for %s", repo_id, exc_info=True)


async def convert_online_to_unified_async(online_data: dict, repo_id: str) -> dict:
    base = convert_online_to_unified(online_data, repo_id)
    if base.get("description"):
        return base
    try:
        client = get_http_client()
        headers = {"Accept": "application/vnd.github+json"}
        token = os.getenv("GITHUB_TOKEN")
        if token:
            headers["Authorization"] = f"token {token}"
        gh_resp = await client.get(f"https://api.github.com/repos/{repo_id}", headers=headers)
        gh_resp.raise_for_status()
        gh_data = gh_resp.json()
        gh_desc = (gh_data.get("description") or "").strip()
        if gh_desc:
            base["description"] = gh_desc
        gh_topics = gh_data.get("topics") or []
        if gh_topics:
            base["keywords"] = gh_topics
    except Exception:
        logger.debug(f"Async GitHub fetch failed for {repo_id}", exc_info=True)
    return base


@app.on_event("startup")
async def startup_event():
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, load_offline_repos)
        asyncio.create_task(_pending_enrich_worker())
    except Exception as e:
        logger.error(f"预加载离线数据失败: {e}")


async def _pending_enrich_worker(interval_seconds: int = 3600):
    global _offline_cache
    while True:
        try:
            await asyncio.sleep(interval_seconds)
            if not _offline_cache:
                continue
            offline = _offline_cache
            offline_map = {r.get("repo_id"): r for r in offline if r.get("repo_id")}
            pending_ids = [rid for rid, r in offline_map.items() if r.get("status") == "pending"]
            if not pending_ids:
                continue
            client = get_online_client()
            gh_client = GitHubClient(use_cache=True)
            for rid in pending_ids:
                try:
                    online_data = client.get_activity_data(rid)
                    unified_data = convert_online_to_unified(online_data, rid)
                    try:
                        cached = gh_client.get_cached_repo(rid)
                        if cached and not unified_data.get("keywords"):
                            kws = cached.get("keywords") or []
                            if kws:
                                unified_data["keywords"] = kws
                    except Exception:
                        logger.debug(f"Failed to get cached keywords for {rid}", exc_info=True)
                    repo_dict = offline_map.get(rid)
                    if repo_dict:
                        repo_dict.update(unified_data)
                        repo_dict.pop("status", None)
                except Exception as e:
                    logger.warning(f"定时补全仓库 {rid} 失败: {e}")
                    continue
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"pending 仓库定时补全任务出错: {e}", exc_info=True)


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
                        detail="REPOS_ONLINE_MISSING_IDS_OR_OFFLINE_DATA: 在线模式必须提供 repo_ids 参数，且当前无离线数据可用",
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
                        # 尝试使用 GitHub 缓存补全关键词
                        try:
                            gh_client = GitHubClient(use_cache=True)
                            cached = gh_client.get_cached_repo(repo_id)
                            if cached and not unified_data.get("keywords"):
                                kws = cached.get("keywords") or []
                                if kws:
                                    unified_data["keywords"] = kws
                        except Exception:
                            pass
                        if not unified_data.get("keywords"):
                            loop = asyncio.get_event_loop()
                            await loop.run_in_executor(
                                None,
                                apply_github_topics_if_missing,
                                unified_data,
                                repo_id,
                            )
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
                    detail="REPOS_OFFLINE_DATA_NOT_MOUNTED: 离线数据未挂载，请检查 top_300_metrics 目录",
                )
            if repo_ids:
                repo_id_set = set(repo_ids)
                repos = [r for r in all_repos if r["repo_id"] in repo_id_set]
                found_ids = {r["repo_id"] for r in repos}
                missing_ids = repo_id_set - found_ids
                if missing_ids:
                    raise HTTPException(
                        status_code=404,
                        detail=f"REPOS_OFFLINE_REPO_NOT_FOUND: 以下仓库ID未找到: {list(missing_ids)}",
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
        logger.error(f"REPOS_UNEXPECTED_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"REPOS_INTERNAL_ERROR: 服务器内部错误: {str(e)}")


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
        logger.error(f"CHAT_GREETING_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"CHAT_GREETING_ERROR: {str(e)}")


class ChatRequest(BaseModel):
    user_id: str
    message: str
    session_id: Optional[str] = None
    language: Optional[str] = None
    agent_type: str = 'agent1'
    skip_intent: bool = False


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
    weights: Optional[Dict[str, float]] = None


class SearchRequest(BaseModel):
    user_id: str
    limit: Optional[int] = 10
    search_id: Optional[str] = None


class KeywordSearchRequest(BaseModel):
    keywords: List[str]
    limit: Optional[int] = 10
    user_id: Optional[str] = None


class SearchCancelRequest(BaseModel):
    search_id: str


_conversation_handlers: Dict[str, ConversationHandler] = {}
_session_to_handler: Dict[str, str] = {}
_match_scorer: Optional[MatchScorer] = None
_integrated_search: Optional[IntegratedRepoSearch] = None
_http_client: Optional[httpx.AsyncClient] = None
_github_activity_cache: Dict[str, Dict[str, Any]] = {}
_running_searches: Dict[str, asyncio.Event] = {}
_github_activity_cache_file = (
    project_root / "src" / "data_layer" / "data" / "runtime_cache" / "github_activity_cache.json"
)


def _load_github_activity_cache_from_disk() -> Dict[str, Dict[str, Any]]:
    p = _github_activity_cache_file
    if not p.exists():
        return {}
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {}
        cleaned: Dict[str, Dict[str, Any]] = {}
        for k, v in data.items():
            if isinstance(k, str) and isinstance(v, dict):
                cleaned[k] = v
        return cleaned
    except Exception:
        logger.warning("Failed to load github activity cache from disk", exc_info=True)
        return {}


def _persist_github_activity_cache_to_disk() -> None:
    p = _github_activity_cache_file
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(_github_activity_cache, f, ensure_ascii=False)
        tmp.replace(p)
    except Exception:
        logger.warning("Failed to persist github activity cache to disk", exc_info=True)


def _prune_two_days_old_activity_cache(
    kind: str,
    repo_id: str,
    today_key: str,
    days: Optional[int] = None,
) -> None:
    try:
        today_dt = datetime.strptime(today_key, "%Y-%m-%d")
    except ValueError:
        return
    target_date = (today_dt - timedelta(days=2)).strftime("%Y-%m-%d")
    if kind == "issue":
        if days is None:
            return
        stale_key = _github_activity_cache_key(kind, repo_id, f"{target_date}:{days}")
    else:
        stale_key = _github_activity_cache_key(kind, repo_id, target_date)
    if stale_key in _github_activity_cache:
        _github_activity_cache.pop(stale_key, None)


_github_activity_cache = _load_github_activity_cache_from_disk()


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
    try:
        handler = ConversationHandler(user_id=user_id)
        cached = handler._load_profile_from_cache()
        if cached and cached.get('language'):
            return cached.get('language')
    except Exception:
        logger.debug(f"Failed to load language from profile for user {user_id}", exc_info=True)
    return None


def _get_experience_level(profile: dict) -> str:
    level = profile.get("experience_level") or profile.get("experience")
    if level in ("beginner", "intermediate", "advanced"):
        return level
    return "intermediate"


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


def _github_activity_cache_key(kind: str, repo_id: str, date_key: str) -> str:
    return f"{kind}:{repo_id}:{date_key}"


@app.post("/api/chat")
async def chat(request: ChatRequest = Body(...)):
    try:
        handler, session_id = get_conversation_handler(
            request.user_id, 
            request.agent_type, 
            request.language, 
            request.session_id
        )
        result = handler.process_user_input(request.message, skip_intent=request.skip_intent)
        
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
        profile_gap = data.get("profile_gap")
        suggested_keywords = data.get("suggested_keywords")
        out = {
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
                "experience_level": _get_experience_level(data)
            } if (confirmed or profile_updated) else None
        }
        if profile_gap is not None:
            out["profile_gap"] = profile_gap
        if suggested_keywords is not None:
            out["suggested_keywords"] = suggested_keywords
        return out
    except Exception as e:
        logger.error(f"CHAT_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"CHAT_ERROR: {str(e)}")


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
    profile_gap = data.get("profile_gap")
    suggested_keywords = data.get("suggested_keywords")
    out = {
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
            "experience_level": _get_experience_level(data)
        } if (confirmed or profile_updated) else None
    }
    if profile_gap is not None:
        out["profile_gap"] = profile_gap
    if suggested_keywords is not None:
        out["suggested_keywords"] = suggested_keywords
    return out


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
                    result = handler.process_user_input(
                        request.message, on_stage=on_stage, skip_intent=request.skip_intent
                    )
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
            result = handler._handle_confirm(handler.user_language)
            return {
                "profile": {
                    "skills": profile.get("skills", []),
                    "contribution_types": profile.get("contribution_styles", []),
                    "experience_level": _get_experience_level(profile)
                },
                "skills": profile.get("skills", [])
            }
        raise HTTPException(status_code=404, detail="Profile not found. Please complete the conversation first.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PROFILE_CONFIRM_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PROFILE_CONFIRM_ERROR: {str(e)}")


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
        logger.error(f"PROFILE_SYNC_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PROFILE_SYNC_ERROR: {str(e)}")


@app.get("/api/profile/{user_id}")
async def get_profile(user_id: str):
    _validate_user_id(user_id)
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
                "experience": _get_experience_level(profile),
                "language": user_language or 'chinese'
            }
        
        return {
            "skills": [],
            "preferences": [],
            "experience": _get_experience_level(profile),
            "language": user_language or 'chinese'
        }
    except Exception as e:
        logger.error(f"PROFILE_GET_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PROFILE_GET_ERROR: {str(e)}")


@app.post("/api/match")
async def calculate_match(request: MatchRequest = Body(...)):
    try:
        handler, _ = get_conversation_handler(request.user_id)
        base_config = DEFAULT_CONFIG
        if request.weights:
            w_skill = float(request.weights.get("w_skill", base_config.weights.w_skill))
            w_activity = float(request.weights.get("w_activity", base_config.weights.w_activity))
            w_demand = float(request.weights.get("w_demand", base_config.weights.w_demand))
            total = w_skill + w_activity + w_demand
            if total <= 0:
                w_skill, w_activity, w_demand = (
                    base_config.weights.w_skill,
                    base_config.weights.w_activity,
                    base_config.weights.w_demand,
                )
            else:
                w_skill = round(w_skill / total, 4)
                w_activity = round(w_activity / total, 4)
                w_demand = round(w_demand / total, 4)
            weights = MatchWeights(w_skill=w_skill, w_activity=w_activity, w_demand=w_demand)
            config = MatchConfig(
                weights=weights,
                activity_weights=base_config.activity_weights,
                activity_thresholds=base_config.activity_thresholds,
                demand_config=base_config.demand_config,
            )
            scorer = MatchScorer(config)
        else:
            scorer = get_match_scorer()
        
        profile = handler.get_current_profile()
        if not profile.get('skills') and not profile.get('contribution_styles'):
            raise HTTPException(status_code=404, detail="MATCH_USER_PROFILE_NOT_FOUND: User profile not found")
        
        user_profile_dict = {
            "skills": profile.get("skills", []),
            "contribution_style": profile.get("contribution_styles", [])[0] if profile.get("contribution_styles") else None,
            "experience_level": _get_experience_level(profile)
        }
        user_profile = UserProfile.from_dict(user_profile_dict)
        
        all_repos = load_offline_repos()
        repo_data_dict = None
        for repo in all_repos:
            if repo["repo_id"] == request.repo_id:
                repo_data_dict = repo
                break

        if not repo_data_dict:
            global _offline_cache
            try:
                client = get_online_client()
                online_data = client.get_activity_data(request.repo_id)
                unified = convert_online_to_unified(online_data, request.repo_id)
                try:
                    gh_client = GitHubClient(use_cache=True)
                    cached = gh_client.get_cached_repo(request.repo_id)
                    if cached and not unified.get("keywords"):
                        kws = cached.get("keywords") or []
                        if kws:
                            unified["keywords"] = kws
                except Exception:
                    pass
                if _offline_cache is None:
                    _offline_cache = []
                _offline_cache.append(unified)
                repo_data_dict = unified
            except Exception as e:
                logger.error(f"MATCH_REPOSITORY_ONLINE_FETCH_FAILED: {e}", exc_info=True)
                gh_json = fetch_github_repo_for_match(request.repo_id)
                if not gh_json:
                    raise HTTPException(status_code=404, detail="MATCH_REPOSITORY_NOT_FOUND: Repository not found")
                unified = build_unified_from_github_metadata(
                    request.repo_id,
                    gh_json.get("description") or "",
                    gh_json.get("topics") or [],
                    int(gh_json.get("stargazers_count") or 0),
                    int(gh_json.get("forks_count") or 0),
                    int(gh_json.get("open_issues_count") or 0),
                    gh_json.get("pushed_at") or "",
                )
                if _offline_cache is None:
                    _offline_cache = []
                _offline_cache.append(unified)
                repo_data_dict = unified
        
        if not repo_data_dict.get("keywords"):
            apply_github_topics_if_missing(repo_data_dict, request.repo_id)
        repo_keywords = repo_data_dict.get("keywords") or []
        if not repo_keywords:
            repo_keywords = repo_data_dict.get("languages", []) + (repo_data_dict.get("description", "") or "").split()
        src = repo_data_dict.get("source")
        if src == "opendigger_online":
            data_source = "opendigger+github"
        elif src == "github_only":
            data_source = "github_only"
        else:
            data_source = "metadata_only"

        repo_data = RepoData(
            keywords=repo_keywords,
            active_days_last_30=int(repo_data_dict.get("active_days_last_30") or 0),
            issues_new_last_30=int(repo_data_dict.get("issues_new_last_30") or 0),
            openrank=repo_data_dict.get("influence_score", 0) * 50,
            name=repo_data_dict.get("name"),
            full_name=repo_data_dict.get("repo_id"),
            precomputed_activity_score=repo_data_dict.get("active_score"),
            precomputed_demand_score=repo_data_dict.get("demand_score"),
            data_source=data_source,
        )
        
        match_result = scorer.calculate(user_profile, repo_data)
        return match_result.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"MATCH_CALCULATION_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"MATCH_CALCULATION_ERROR: {str(e)}")


@app.post("/api/search")
async def search_repos(request: SearchRequest = Body(...)):
    search_id = request.search_id or f"search_{request.user_id}_{int(time.time()*1000)}"
    cancel_event = asyncio.Event()
    _running_searches[search_id] = cancel_event

    async def event_stream():
        sync_q: queue.Queue = queue.Queue()

        def on_progress(stage: str, data: Dict[str, Any]):
            sync_q.put({"type": "stage", "stage": stage, "data": data})

        def run():
            try:
                if cancel_event.is_set():
                    sync_q.put({"type": "result", "data": {"mode": "cancelled", "repos": [], "message": "Search cancelled"}})
                    return
                handler, _ = get_conversation_handler(request.user_id)
                mem_profile = handler.get_current_profile()
                user_profile = {
                    'skills': mem_profile.get('skills', []),
                    'contribution_styles': mem_profile.get('contribution_styles', []),
                }
                searcher = get_integrated_search()
                result = searcher.search_with_profile_matching(
                    user_profile=user_profile if user_profile.get('skills') else None,
                    user_id=request.user_id,
                    target_count=request.limit or 10,
                    on_progress=on_progress,
                )
                mode = "online"
                fallback_used = False
                repos = []
                if not result.is_sufficient or not result.repositories:
                    offline_repos = load_offline_repos()
                    if offline_repos:
                        on_progress("fallback_scoring", {"total": len(offline_repos)})
                        handler, _ = get_conversation_handler(request.user_id)
                        profile = handler.get_current_profile()
                        scorer = get_match_scorer()
                        user_profile_obj = UserProfile.from_dict(
                            {
                                "skills": profile.get("skills", []),
                                "contribution_style": profile.get("contribution_styles", [None])[0],
                                "experience_level": _get_experience_level(profile),
                            }
                        )
                        scored = []
                        for r in offline_repos:
                            repo_keywords = r.get("keywords") or []
                            if not repo_keywords:
                                repo_keywords = r.get("languages", []) + (r.get("description") or "").split()
                            repo_data = RepoData(
                                keywords=repo_keywords,
                                active_days_last_30=int(r.get("active_days_last_30") or 0),
                                issues_new_last_30=int(r.get("issues_new_last_30") or 0),
                                openrank=r.get("influence_score", 0) * 50,
                                name=r.get("name"),
                                full_name=r.get("repo_id"),
                                precomputed_activity_score=r.get("active_score"),
                                precomputed_demand_score=r.get("demand_score"),
                                data_source="opendigger+github" if r.get("source") == "opendigger_online" else "metadata_only",
                            )
                            match = scorer.calculate(user_profile_obj, repo_data)
                            scored.append((r, match.match_score))
                        scored.sort(key=lambda x: x[1], reverse=True)
                        limit = request.limit or 10
                        for repo_dict, score in scored[:limit]:
                            repo_copy = dict(repo_dict)
                            repo_copy["source"] = "offline_dataset"
                            repo_keywords = repo_copy.get("keywords") or []
                            if not repo_keywords:
                                repo_keywords = repo_copy.get("languages", []) + (repo_copy.get("description") or "").split()
                            repo_data_for_breakdown = RepoData(
                                keywords=repo_keywords,
                                active_days_last_30=int(repo_copy.get("active_days_last_30") or 0),
                                issues_new_last_30=int(repo_copy.get("issues_new_last_30") or 0),
                                openrank=repo_copy.get("influence_score", 0) * 50,
                                name=repo_copy.get("name"),
                                full_name=repo_copy.get("repo_id"),
                                precomputed_activity_score=repo_copy.get("active_score"),
                                precomputed_demand_score=repo_copy.get("demand_score"),
                                data_source="opendigger+github" if repo_copy.get("source") == "opendigger_online" else "metadata_only",
                            )
                            match_with_breakdown = scorer.calculate(user_profile_obj, repo_data_for_breakdown)
                            breakdown = match_with_breakdown.breakdown.to_dict()
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
                                    "breakdown": breakdown,
                                    "source": repo_copy.get("source", "offline_dataset"),
                                    "keywords": repo_copy.get("keywords") or [],
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
                                "breakdown": repo_result.match_breakdown,
                                "source": "github_opendigger_online",
                                "keywords": repo_result.github_keywords,
                                "issues_new_last_30": repo_result.issues_new_last_30,
                                "active_days_last_30": repo_result.active_days_last_30,
                            }
                        )
                    message = result.message
                if cancel_event.is_set():
                    sync_q.put({"type": "result", "data": {"mode": "cancelled", "repos": [], "message": "Search cancelled"}})
                    return
                sync_q.put({"type": "result", "data": {
                    "mode": mode,
                    "source": "github_opendigger_online" if not fallback_used else "offline_dataset",
                    "fallback_used": fallback_used,
                    "message": message,
                    "repos": repos,
                }})
            except Exception as e:
                logger.error(f"SEARCH_ERROR: {e}", exc_info=True)
                sync_q.put({"type": "error", "detail": str(e)})

        try:
            loop = asyncio.get_event_loop()
            _stream_executor.submit(run)
            while True:
                try:
                    item = await asyncio.wait_for(
                        loop.run_in_executor(None, sync_q.get),
                        timeout=600.0
                    )
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'stage': 'error', 'detail': 'timeout'})}\n\n"
                    break
                if cancel_event.is_set() and item["type"] == "stage":
                    yield f"data: {json.dumps({'stage': 'cancelled'})}\n\n"
                    break
                if item["type"] == "stage":
                    yield f"data: {json.dumps({'stage': item['stage'], **item['data']})}\n\n"
                elif item["type"] == "result":
                    result_data = item["data"]
                    result_data["stage"] = "result"
                    yield f"data: {json.dumps(result_data)}\n\n"
                    break
                elif item["type"] == "error":
                    yield f"data: {json.dumps({'stage': 'error', 'detail': item.get('detail', 'unknown')})}\n\n"
                    break
        finally:
            _running_searches.pop(search_id, None)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )


@app.post("/api/search/keywords")
async def search_repos_by_keywords(request: KeywordSearchRequest = Body(...)):
    """
    使用关键词组合进行多轮在线搜索（不依赖用户画像）。
    """
    try:
        keywords = [k.strip() for k in (request.keywords or []) if k and k.strip()]
        if not keywords:
            raise HTTPException(status_code=400, detail="KEYWORD_SEARCH_NO_KEYWORDS: No valid keywords provided")
        searcher = get_integrated_search()
        result = searcher.search_with_metrics(
            keywords=keywords,
            target_count=request.limit or 10,
            max_iterations=10,
            github_batch_size=15,
        )
        scorer = None
        user_profile_obj = None
        if request.user_id:
            try:
                handler, _ = get_conversation_handler(request.user_id)
                profile = handler.get_current_profile()
                if profile.get("skills") or profile.get("contribution_styles"):
                    scorer = get_match_scorer()
                    user_profile_obj = UserProfile.from_dict(
                        {
                            "skills": profile.get("skills", []),
                            "contribution_style": profile.get("contribution_styles", [None])[0],
                            "experience_level": _get_experience_level(profile),
                        }
                    )
            except Exception:
                scorer = None
                user_profile_obj = None
        repos = []
        for r in result.repositories:
            parts = r.repo_id.split("/", 1)
            owner = parts[0] if len(parts) == 2 else ""
            name = parts[1] if len(parts) == 2 else r.repo_id
            html_url = f"https://github.com/{r.repo_id}"
            match_score = r.match_score
            breakdown = r.match_breakdown
            dynamic_weights = None
            if scorer is not None and user_profile_obj is not None:
                try:
                    repo_keywords = r.github_keywords or r.languages or []
                    if not repo_keywords:
                        repo_keywords = (r.description or "").split()
                    repo_data = RepoData(
                        keywords=repo_keywords,
                        active_days_last_30=int(r.active_days_last_30 or 0),
                        issues_new_last_30=int(r.issues_new_last_30 or 0),
                        openrank=(r.influence_score or 0.0) * 50,
                        name=name,
                        full_name=r.repo_id,
                        precomputed_activity_score=r.active_score,
                        precomputed_demand_score=r.demand_score,
                        data_source="opendigger+github" if r.opendigger_metrics else "github_only",
                    )
                    match_result = scorer.calculate(user_profile_obj, repo_data)
                    match_score = match_result.match_score
                    breakdown = match_result.breakdown.to_dict()
                    dynamic_weights = match_result.dynamic_weights.to_dict() if match_result.dynamic_weights else None
                except Exception:
                    pass
            repos.append({
                "repo_id": r.repo_id,
                "name": name,
                "full_name": r.repo_id,
                "description": r.description or "",
                "languages": r.languages or [],
                "active_score": r.active_score,
                "influence_score": r.influence_score,
                "demand_score": r.demand_score,
                "composite_score": r.composite_score,
                "match_score": match_score,
                "breakdown": breakdown,
                "dynamic_weights": dynamic_weights,
                "source": "online_keywords",
                "html_url": html_url,
                "stargazers_count": getattr(r.metadata, "stars", 0),
                "updated_at": getattr(r.metadata, "last_updated", None),
                "issues_new_last_30": r.issues_new_last_30,
                "active_days_last_30": r.active_days_last_30,
                "owner": {
                    "login": owner,
                },
            })
        return {
            "mode": "online_keywords",
            "fallback_used": False,
            "repos": repos,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"KEYWORD_SEARCH_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"KEYWORD_SEARCH_ERROR: {str(e)}")


@app.post("/api/search/cancel")
async def cancel_search(request: SearchCancelRequest = Body(...)):
    try:
        cancel_event = _running_searches.get(request.search_id)
        if cancel_event:
            cancel_event.set()
            logger.info(f"Search cancelled: search_id={request.search_id}")
        else:
            logger.info(f"No running search found for search_id={request.search_id}")
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"SEARCH_CANCEL_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"SEARCH_CANCEL_ERROR: {str(e)}")


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
        token = os.getenv("GITHUB_TOKEN")
        if token:
            headers["Authorization"] = f"token {token}"
        resp = await client.get("https://api.github.com/search/repositories", params=params, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        data["mode"] = "online"
        data["source"] = "github_online"
        return data
    except httpx.HTTPStatusError as e:
        logger.error(f"GITHUB_SEARCH_HTTP_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=e.response.status_code, detail="GITHUB_SEARCH_HTTP_ERROR: GitHub search failed")
    except httpx.HTTPError as e:
        logger.error(f"GITHUB_SEARCH_NETWORK_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail="GITHUB_SEARCH_NETWORK_ERROR: GitHub search unavailable")
    except Exception as e:
        logger.error(f"GITHUB_SEARCH_UNEXPECTED_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="GITHUB_SEARCH_UNEXPECTED_ERROR: Internal server error")


class TrendPoint(BaseModel):
    date: str
    count: int


class TrendResponse(BaseModel):
    repo_id: str
    points: List[TrendPoint]


class TrendCacheFallbackResponse(BaseModel):
    repo_id: str
    points: List[TrendPoint]
    cache_date: str


def _today_key() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def _find_latest_cached_trend_before_today(
    kind: str,
    repo_id: str,
    days: Optional[int] = None
) -> Optional[Tuple[str, Dict[str, Any]]]:
    today = _today_key()
    prefix = f"{kind}:{repo_id}:"
    latest_date = ""
    latest_payload: Optional[Dict[str, Any]] = None

    for cache_key, payload in _github_activity_cache.items():
        if not cache_key.startswith(prefix):
            continue
        rest = cache_key[len(prefix):]
        date_part = rest.split(":", 1)[0]
        if len(date_part) != 10:
            continue
        if date_part >= today:
            continue

        if kind == "issue":
            parts = rest.split(":", 1)
            if len(parts) != 2:
                continue
            try:
                key_days = int(parts[1])
            except ValueError:
                continue
            if days is not None and key_days != days:
                continue

        if date_part > latest_date:
            latest_date = date_part
            latest_payload = payload

    if not latest_payload or not latest_date:
        return None
    return latest_date, latest_payload


@app.get("/api/github/commit_trend", response_model=TrendResponse)
async def github_commit_trend(
    repo_id: str = Query(..., description="owner/repo")
):
    _validate_repo_id(repo_id)
    try:
        today_key = _today_key()
        cache_key = _github_activity_cache_key("commit", repo_id, today_key)
        cached = _github_activity_cache.get(cache_key)
        if cached:
            return cached

        client = get_http_client()
        headers = {"Accept": "application/vnd.github+json"}
        token = os.getenv("GITHUB_TOKEN")
        if token:
            headers["Authorization"] = f"token {token}"
        resp = await client.get(f"https://api.github.com/repos/{repo_id}/stats/commit_activity", headers=headers)
        resp.raise_for_status()
        weeks = resp.json() or []
        points: List[TrendPoint] = []
        for w in weeks[-12:]:
          week_ts = w.get("week")
          total = w.get("total", 0)
          if week_ts is None:
              continue
          date_str = datetime.fromtimestamp(week_ts).strftime("%Y-%m-%d")
          points.append(TrendPoint(date=date_str, count=int(total)))
        result = TrendResponse(repo_id=repo_id, points=points)
        _github_activity_cache[cache_key] = json.loads(result.model_dump_json())
        _prune_two_days_old_activity_cache("commit", repo_id, today_key)
        _persist_github_activity_cache_to_disk()
        return result
    except httpx.HTTPStatusError as e:
        logger.error(f"GITHUB_COMMIT_TREND_HTTP_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=e.response.status_code, detail="GITHUB_COMMIT_TREND_HTTP_ERROR: GitHub stats failed")
    except httpx.HTTPError as e:
        logger.error(f"GITHUB_COMMIT_TREND_NETWORK_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail="GITHUB_COMMIT_TREND_NETWORK_ERROR: GitHub stats unavailable")
    except Exception as e:
        logger.error(f"GITHUB_COMMIT_TREND_UNEXPECTED_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="GITHUB_COMMIT_TREND_UNEXPECTED_ERROR: Internal server error")


@app.get("/api/github/commit_trend/cached_fallback", response_model=TrendCacheFallbackResponse)
async def github_commit_trend_cached_fallback(
    repo_id: str = Query(..., description="owner/repo")
):
    _validate_repo_id(repo_id)
    found = _find_latest_cached_trend_before_today("commit", repo_id)
    if not found:
        raise HTTPException(status_code=404, detail="GITHUB_COMMIT_TREND_CACHED_FALLBACK_NOT_FOUND")
    cache_date, payload = found
    return TrendCacheFallbackResponse(
        repo_id=payload.get("repo_id", repo_id),
        points=payload.get("points", []),
        cache_date=cache_date,
    )


@app.get("/api/github/issue_trend", response_model=TrendResponse)
async def github_issue_trend(
    repo_id: str = Query(..., description="owner/repo"),
    days: int = Query(30, ge=1, le=90)
):
    _validate_repo_id(repo_id)
    try:
        today_key = _today_key()
        cache_key = _github_activity_cache_key("issue", repo_id, f"{today_key}:{days}")
        cached = _github_activity_cache.get(cache_key)
        if cached:
            return cached

        client = get_http_client()
        headers = {"Accept": "application/vnd.github+json"}
        token = os.getenv("GITHUB_TOKEN")
        if token:
            headers["Authorization"] = f"token {token}"
        since_dt = datetime.now(tz=None) - timedelta(days=days)
        since_str = since_dt.strftime("%Y-%m-%d")
        query = f"repo:{repo_id} type:issue created:>={since_str}"
        url = "https://api.github.com/search/issues"

        all_issues: List[Dict[str, Any]] = []
        page = 1
        while True:
            params = {"q": query, "sort": "created", "order": "asc", "per_page": 100, "page": page}
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            body = resp.json() or {}
            items = body.get("items") or []
            all_issues.extend(items)
            if len(items) < 100 or len(all_issues) >= body.get("total_count", 0):
                break
            page += 1
            if page > 10:
                break

        counter: Dict[str, int] = {}
        for issue in all_issues:
            if "pull_request" in issue:
                continue
            created_at = issue.get("created_at")
            if not created_at:
                continue
            try:
                dt = datetime.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ")
            except ValueError:
                continue
            if dt < since_dt:
                continue
            key = dt.strftime("%Y-%m-%d")
            counter[key] = counter.get(key, 0) + 1

        dates = [
            (since_dt + timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range(days)
        ]
        points = [TrendPoint(date=d, count=counter.get(d, 0)) for d in dates]
        result = TrendResponse(repo_id=repo_id, points=points)
        _github_activity_cache[cache_key] = json.loads(result.model_dump_json())
        _prune_two_days_old_activity_cache("issue", repo_id, today_key, days)
        _persist_github_activity_cache_to_disk()
        return result
    except httpx.HTTPStatusError as e:
        logger.error(f"GITHUB_ISSUE_TREND_HTTP_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=e.response.status_code, detail="GITHUB_ISSUE_TREND_HTTP_ERROR: GitHub issues failed")
    except httpx.HTTPError as e:
        logger.error(f"GITHUB_ISSUE_TREND_NETWORK_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail="GITHUB_ISSUE_TREND_NETWORK_ERROR: GitHub issues unavailable")
    except Exception as e:
        logger.error(f"GITHUB_ISSUE_TREND_UNEXPECTED_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="GITHUB_ISSUE_TREND_UNEXPECTED_ERROR: Internal server error")


@app.get("/api/github/issue_trend/cached_fallback", response_model=TrendCacheFallbackResponse)
async def github_issue_trend_cached_fallback(
    repo_id: str = Query(..., description="owner/repo"),
    days: int = Query(30, ge=1, le=90)
):
    _validate_repo_id(repo_id)
    found = _find_latest_cached_trend_before_today("issue", repo_id, days)
    if not found:
        raise HTTPException(status_code=404, detail="GITHUB_ISSUE_TREND_CACHED_FALLBACK_NOT_FOUND")
    cache_date, payload = found
    return TrendCacheFallbackResponse(
        repo_id=payload.get("repo_id", repo_id),
        points=payload.get("points", []),
        cache_date=cache_date,
    )


@app.post("/api/repos/bulk_enrich")
async def bulk_enrich_repos(request: BulkEnrichRequest = Body(...)):
    try:
        repo_ids = [r.get("repo_id") or r.get("full_name") for r in request.repos]
        repo_ids = [r for r in repo_ids if r]
        if not repo_ids:
            raise HTTPException(status_code=400, detail="BULK_ENRICH_NO_VALID_REPO_IDS: No valid repo ids")
        offline = load_offline_repos()
        enriched = []
        offline_map = {r["repo_id"]: r for r in offline}
        for rid in repo_ids:
            existing = offline_map.get(rid)
            if existing and existing.get("status") != "pending":
                enriched.append(existing)
                continue
            try:
                client = get_online_client()
                online_data = client.get_activity_data(rid)
                unified = convert_online_to_unified(online_data, rid)
                if not unified.get("keywords"):
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(
                        None,
                        apply_github_topics_if_missing,
                        unified,
                        rid,
                    )
                enriched.append(unified)
                if existing:
                    existing.update(unified)
                    existing.pop("status", None)
                else:
                    offline.append(unified)
                    offline_map[rid] = unified
            except Exception as e:
                # 区分 OpenDigger 永久无数据（404）与其它错误：
                # - 对于 404：直接视为终态，无需 pending，占位说明仅提示“暂无 OpenDigger 数据”
                # - 对于其它错误：保留 pending 状态，交由定时任务重试
                logger.warning(f"bulk_enrich failed for {rid}, marking as pending or no-opendigger: {e}")
                error_msg = str(e)
                parts = rid.split("/")
                repo_name = parts[1] if len(parts) == 2 else rid
                if "status code 404" in error_msg or "OpenDigger has no data" in error_msg:
                    # 终态：确认无 OpenDigger 数据，尽量补全 GitHub 描述和关键词
                    placeholder = {
                        "repo_id": rid,
                        "name": repo_name,
                        "description": "暂无 OpenDigger 数据（使用 GitHub 指标兜底）",
                        "languages": ["unknown"],
                        "active_score": 0.0,
                        "influence_score": 0.0,
                        "demand_score": 0.0,
                        "composite_score": 0.0,
                        "raw_metrics": {"note": "no OpenDigger data"},
                    }
                    try:
                        gh_client = GitHubClient(use_cache=True)
                        cached = gh_client.get_cached_repo(rid)
                        if cached:
                            cached_desc = (cached.get("description") or "").strip()
                            if cached_desc:
                                placeholder["description"] = cached_desc
                            cached_kws = cached.get("keywords") or cached.get("topics") or []
                            if cached_kws:
                                placeholder["keywords"] = cached_kws
                    except Exception:
                        pass
                    if not placeholder.get("keywords"):
                        loop = asyncio.get_event_loop()
                        await loop.run_in_executor(
                            None,
                            apply_github_topics_if_missing,
                            placeholder,
                            rid,
                        )
                    enriched.append(placeholder)
                    if existing:
                        existing.update(placeholder)
                        existing.pop("status", None)
                    else:
                        offline.append(placeholder)
                        offline_map[rid] = placeholder
                else:
                    # 非 404 错误：保留 pending 状态，等待定时任务重试
                    placeholder = {
                        "repo_id": rid,
                        "name": repo_name,
                        "description": "仓库信息补全中（等待 OpenDigger 和 GitHub 数据）",
                        "languages": ["unknown"],
                        "active_score": 0.0,
                        "influence_score": 0.0,
                        "demand_score": 0.0,
                        "composite_score": 0.0,
                        "raw_metrics": {"note": "pending"},
                        "status": "pending",
                    }
                    enriched.append(placeholder)
                    if not existing:
                        offline.append(placeholder)
                        offline_map[rid] = placeholder
        return {
            "mode": "mixed",
            "repos": enriched,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"BULK_ENRICH_UNEXPECTED_ERROR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="BULK_ENRICH_UNEXPECTED_ERROR: Internal server error")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

