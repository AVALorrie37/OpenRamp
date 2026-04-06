from __future__ import annotations

import json
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def default_user_repo_store_path() -> Path:
    return (
        Path(__file__).resolve().parent.parent
        / "data"
        / "runtime_cache"
        / "user_repos.json"
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class UserRepoStore:
    path: Path
    _lock: threading.Lock = threading.Lock()

    def __init__(self, path: Optional[Path] = None):
        self.path = Path(path) if path is not None else default_user_repo_store_path()
        self._lock = threading.Lock()

    def _load_unlocked(self) -> Dict[str, Any]:
        if not self.path.exists():
            return {"version": 1, "updated_at": _now_iso(), "users": {}}
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                return {"version": 1, "updated_at": _now_iso(), "users": {}}
            if not isinstance(data.get("users"), dict):
                data["users"] = {}
            return data
        except Exception:
            return {"version": 1, "updated_at": _now_iso(), "users": {}}

    def _save_unlocked(self, data: Dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        data["version"] = 1
        data["updated_at"] = _now_iso()
        tmp = self.path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        tmp.replace(self.path)

    def list_user_repos(self, user_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            data = self._load_unlocked()
            user = data["users"].get(user_id) or {}
            repos = user.get("repos") or {}
            if not isinstance(repos, dict):
                return []
            out = []
            for _, repo in repos.items():
                if isinstance(repo, dict) and repo.get("repo_id"):
                    out.append(repo)
            return out

    def upsert_user_repo(self, user_id: str, repo: Dict[str, Any]) -> Dict[str, Any]:
        repo_id = str(repo.get("repo_id") or "").strip()
        if not repo_id:
            raise ValueError("missing repo_id")
        with self._lock:
            data = self._load_unlocked()
            users = data["users"]
            user = users.get(user_id) or {}
            repos = user.get("repos") or {}
            if not isinstance(repos, dict):
                repos = {}
            existing = repos.get(repo_id)
            if isinstance(existing, dict):
                merged = {**existing, **repo}
            else:
                merged = dict(repo)
            repos[repo_id] = merged
            user["repos"] = repos
            users[user_id] = user
            data["users"] = users
            self._save_unlocked(data)
            return merged

    def delete_user_repo(self, user_id: str, repo_id: str) -> None:
        repo_id = str(repo_id or "").strip()
        if not repo_id:
            return
        with self._lock:
            data = self._load_unlocked()
            users = data["users"]
            user = users.get(user_id) or {}
            repos = user.get("repos") or {}
            if isinstance(repos, dict) and repo_id in repos:
                repos.pop(repo_id, None)
                user["repos"] = repos
                users[user_id] = user
                data["users"] = users
                self._save_unlocked(data)

