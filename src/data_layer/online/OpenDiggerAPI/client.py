"""
OpenDigger API 客户端

优化功能：
- 超时设置优化：区分连接超时和读取超时
- 重试机制：指数退避重试，仅对超时和临时错误重试
- 本地缓存：缓存成功获取的数据，避免重复请求
- 会话复用：使用 requests.Session 复用连接
- 数据过滤：active_dates_and_times 自动过滤为最近6个月的数据
"""

from typing import Any, Dict, List, Optional, Tuple
import json
import os
import time
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from urllib import request as urlrequest, error as urlerror

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError:  # pragma: no cover - fallback path for minimal envs
    requests = None
    HTTPAdapter = None
    Retry = None


class OpenDiggerClient:
    """
    OpenDigger OSS 数据端点的客户端。
    
    特性：
    - 超时优化：连接超时 5s，读取超时 30s
    - 自动重试：超时和临时错误自动重试（最多3次，指数退避）
    - 本地缓存：缓存成功获取的数据，避免重复下载
    - 会话复用：复用 HTTP 连接提高性能
    - 数据过滤：active_dates_and_times 自动过滤为最近6个月的数据
      在下载时立即过滤，只保存和缓存最近6个月的数据，减少存储和传输
    """

    # Base endpoint for OpenDigger OSS data
    _BASE_URL: str = "https://oss.open-digger.cn/github"

    # Default metrics fetched by `get_activity_data`
    _DEFAULT_ACTIVITY_METRICS: List[str] = [
        "active_dates_and_times",
        "openrank",
        "issues_new",
    ]

    def __init__(
        self,
        connect_timeout: float = 5.0,
        read_timeout: float = 30.0,
        max_retries: int = 3,
        retry_backoff_factor: float = 1.0,
        use_cache: bool = True,
        cache_dir: Optional[str] = None,
    ) -> None:
        """
        初始化 OpenDigger 客户端。
        
        Args:
            connect_timeout: 连接超时时间（秒），默认 5 秒
            read_timeout: 读取超时时间（秒），默认 30 秒
            max_retries: 最大重试次数，默认 3 次
            retry_backoff_factor: 重试退避因子，默认 1.0（重试间隔：1s, 2s, 4s）
            use_cache: 是否使用本地缓存，默认开启
            cache_dir: 缓存目录，默认为 data_layer/data/opendigger_cache
        """
        self._connect_timeout = connect_timeout
        self._read_timeout = read_timeout
        self._timeout = (connect_timeout, read_timeout)  # requests 使用元组形式
        self._max_retries = max_retries
        self._retry_backoff_factor = retry_backoff_factor
        self._use_cache = use_cache
        
        # 设置缓存目录
        if cache_dir:
            self._cache_dir = Path(cache_dir)
        else:
            # 默认缓存目录：data_layer/data/opendigger_cache
            current_file = Path(__file__)
            data_layer_dir = current_file.parent.parent.parent  # OpenDiggerAPI -> online -> data_layer
            self._cache_dir = data_layer_dir / "data" / "opendigger_cache"
        
        # 确保缓存目录存在
        if self._use_cache:
            self._cache_dir.mkdir(parents=True, exist_ok=True)
        
        # 初始化会话（延迟创建）
        self._session: Optional[requests.Session] = None
    
    def _get_session(self) -> "requests.Session":
        """
        获取或创建 HTTP 会话（带重试策略）。
        
        Returns:
            配置好的 requests.Session 实例
        """
        if self._session is None and requests:
            self._session = requests.Session()
            
            # 配置重试策略
            if HTTPAdapter and Retry:
                retry_strategy = Retry(
                    total=self._max_retries,
                    backoff_factor=self._retry_backoff_factor,
                    status_forcelist=[429, 500, 502, 503, 504],
                    allowed_methods=["GET"],
                    raise_on_status=False,
                )
                adapter = HTTPAdapter(
                    max_retries=retry_strategy,
                    pool_connections=10,
                    pool_maxsize=10,
                )
                self._session.mount("http://", adapter)
                self._session.mount("https://", adapter)
        
        return self._session

    def _validate_repo_id(self, repo_id: str) -> None:
        """
        验证 repo_id 格式是否为 'owner/repo'。

        :raises ValueError: 格式无效时抛出
        """
        if not isinstance(repo_id, str):
            raise ValueError("repo_id must be a string in the form 'owner/repo'")

        parts = repo_id.split("/")
        if len(parts) != 2 or not parts[0] or not parts[1]:
            raise ValueError("repo_id must be in the form 'owner/repo'")

    def _build_metric_url(self, repo_id: str, metric: str) -> str:
        """
        构建指标 JSON 文件的 URL。
        """
        return f"{self._BASE_URL}/{repo_id}/{metric}.json"
    
    def _get_cache_path(self, repo_id: str, metric: str) -> Path:
        """
        获取缓存文件路径。
        
        Args:
            repo_id: 仓库 ID（owner/repo 格式）
            metric: 指标名称
            
        Returns:
            缓存文件的 Path 对象
        """
        # 使用 repo_id 的 hash 作为子目录，避免文件名包含特殊字符
        safe_repo_id = repo_id.replace("/", "_")
        return self._cache_dir / safe_repo_id / f"{metric}.json"
    
    def _read_from_cache(self, repo_id: str, metric: str) -> Optional[Any]:
        """
        从缓存读取数据。
        
        Args:
            repo_id: 仓库 ID
            metric: 指标名称
            
        Returns:
            缓存的数据，如果不存在则返回 None
            对于 active_dates_and_times，会自动过滤为最近6个月的数据
        """
        if not self._use_cache:
            return None
        
        cache_path = self._get_cache_path(repo_id, metric)
        if cache_path.exists():
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    # 对于 active_dates_and_times，确保只返回最近6个月的数据
                    # （即使缓存中有旧数据，也会被过滤）
                    if metric == "active_dates_and_times":
                        data = self._filter_active_dates_recent_months(data, months=6)
                    return data
            except (json.JSONDecodeError, IOError):
                # 缓存文件损坏，删除它
                cache_path.unlink(missing_ok=True)
        return None
    
    def _filter_active_dates_recent_months(self, data: Any, months: int = 6) -> Any:
        """
        过滤 active_dates_and_times 数据，只保留最近 N 个月的数据。
        
        Args:
            data: active_dates_and_times 的原始数据
            months: 保留最近几个月的数据，默认 6 个月
            
        Returns:
            过滤后的数据（只包含最近 N 个月）
        """
        if not isinstance(data, dict):
            # 如果不是字典格式，可能是列表或其他格式，直接返回
            return data
        
        # 计算6个月前的日期
        cutoff_date = datetime.now() - timedelta(days=months * 30)
        filtered_data = {}
        
        for date_str, value in data.items():
            try:
                # 尝试解析日期字符串（可能是 "YYYY-MM-DD" 或 "YYYY-MM" 格式）
                if len(date_str) == 10:  # "YYYY-MM-DD"
                    date_obj = datetime.strptime(date_str, "%Y-%m-%d")
                elif len(date_str) == 7:  # "YYYY-MM"
                    date_obj = datetime.strptime(date_str, "%Y-%m")
                else:
                    # 无法解析的格式，保留（可能是特殊键）
                    filtered_data[date_str] = value
                    continue
                
                # 只保留最近6个月的数据
                if date_obj >= cutoff_date:
                    filtered_data[date_str] = value
            except (ValueError, TypeError):
                # 无法解析的键，保留（可能是特殊键如 "2021-10-raw"）
                filtered_data[date_str] = value
        
        return filtered_data
    
    def _write_to_cache(self, repo_id: str, metric: str, data: Any) -> None:
        """
        将数据写入缓存。
        
        Args:
            repo_id: 仓库 ID
            metric: 指标名称
            data: 要缓存的数据
        """
        if not self._use_cache:
            return
        
        cache_path = self._get_cache_path(repo_id, metric)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except IOError as e:
            print(f"Warning: Failed to write cache for {repo_id}/{metric}: {e}")
    
    def _fetch_metric_with_retry(self, url: str, repo_id: str, metric: str) -> Any:
        """
        带重试机制获取单个指标数据。
        
        Args:
            url: 请求 URL
            repo_id: 仓库 ID（用于缓存）
            metric: 指标名称（用于缓存）
            
        Returns:
            指标数据
            
        Raises:
            RuntimeError: API 返回非 200 状态码
            requests.exceptions.RequestException: 网络请求失败
        """
        # 1. 先尝试从缓存读取
        cached_data = self._read_from_cache(repo_id, metric)
        if cached_data is not None:
            return cached_data
        
        # 2. 从网络获取（使用会话和重试机制）
        if requests:
            session = self._get_session()
            last_exception = None
            
            for attempt in range(self._max_retries + 1):
                try:
                    response = session.get(url, timeout=self._timeout)
                    status = response.status_code
                    
                    if status == 200:
                        data = response.json()
                        # 对于 active_dates_and_times，只保留最近6个月的数据
                        if metric == "active_dates_and_times":
                            data = self._filter_active_dates_recent_months(data, months=6)
                        # 成功后写入缓存（已过滤的数据）
                        self._write_to_cache(repo_id, metric, data)
                        return data
                    elif status == 404:
                        # 404 不重试，直接抛出
                        raise RuntimeError(
                            f"OpenDigger API request failed with status code {status}"
                        )
                    elif status == 429:
                        raise RuntimeError("OpenDigger API rate limit exceeded")
                    else:
                        raise RuntimeError(
                            f"OpenDigger API request failed with status code {status}"
                        )
                        
                except requests.exceptions.Timeout as e:
                    last_exception = e
                    if attempt < self._max_retries:
                        wait_time = self._retry_backoff_factor * (2 ** attempt)
                        print(f"Timeout fetching {url}, retrying in {wait_time}s... (attempt {attempt + 1}/{self._max_retries})")
                        time.sleep(wait_time)
                    continue
                except requests.exceptions.ConnectionError as e:
                    last_exception = e
                    if attempt < self._max_retries:
                        wait_time = self._retry_backoff_factor * (2 ** attempt)
                        print(f"Connection error fetching {url}, retrying in {wait_time}s... (attempt {attempt + 1}/{self._max_retries})")
                        time.sleep(wait_time)
                    continue
                except requests.exceptions.RequestException:
                    raise
            
            # 所有重试都失败
            if last_exception:
                raise last_exception
        
        # urllib fallback（无会话复用，但有重试）
        last_exception = None
        for attempt in range(self._max_retries + 1):
            try:
                with urlrequest.urlopen(url, timeout=self._read_timeout) as resp:
                    status = resp.getcode()
                    if status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        # 对于 active_dates_and_times，只保留最近6个月的数据
                        if metric == "active_dates_and_times":
                            data = self._filter_active_dates_recent_months(data, months=6)
                        # 成功后写入缓存（已过滤的数据）
                        self._write_to_cache(repo_id, metric, data)
                        return data
                    elif status == 429:
                        raise RuntimeError("OpenDigger API rate limit exceeded")
                    else:
                        raise RuntimeError(
                            f"OpenDigger API request failed with status code {status}"
                        )
            except urlerror.URLError as exc:
                last_exception = exc
                if attempt < self._max_retries:
                    wait_time = self._retry_backoff_factor * (2 ** attempt)
                    print(f"Network error fetching {url}, retrying in {wait_time}s... (attempt {attempt + 1}/{self._max_retries})")
                    time.sleep(wait_time)
                continue
        
        if last_exception:
            raise RuntimeError(f"Network error while fetching {url}: {last_exception}") from last_exception

    def get_activity_data(self, repo_id: str) -> Dict[str, Any]:
        """
        通过 OpenDigger API 获取仓库活跃度数据。
        
        Args:
            repo_id: GitHub 仓库 ID（格式：owner/repo）
            
        Returns:
            活跃度原始数据（JSON 结构），包含指标：
            - active_dates_and_times: 活跃时间分布
            - openrank: OpenRank 指数
            - issues_new: 新增 Issue 数
            
        Raises:
            ValueError: repo_id 格式无效
            requests.exceptions.RequestException: 网络请求失败
            RuntimeError: API 返回非 200 状态码
        """
        self._validate_repo_id(repo_id)

        data: Dict[str, Any] = {}

        for metric in self._DEFAULT_ACTIVITY_METRICS:
            url = self._build_metric_url(repo_id, metric)
            metric_data = self._fetch_metric_with_retry(url, repo_id, metric)
            data[metric] = metric_data

        return data
    
    def clear_cache(self, repo_id: Optional[str] = None) -> int:
        """
        清空缓存。
        
        Args:
            repo_id: 指定仓库 ID 时只清空该仓库的缓存，
                     为 None 时清空所有缓存
                     
        Returns:
            删除的缓存文件数量
        """
        if not self._cache_dir.exists():
            return 0
        
        deleted_count = 0
        
        if repo_id:
            # 清空指定仓库的缓存
            safe_repo_id = repo_id.replace("/", "_")
            repo_cache_dir = self._cache_dir / safe_repo_id
            if repo_cache_dir.exists():
                for cache_file in repo_cache_dir.glob("*.json"):
                    cache_file.unlink()
                    deleted_count += 1
                # 删除空目录
                if repo_cache_dir.exists() and not any(repo_cache_dir.iterdir()):
                    repo_cache_dir.rmdir()
        else:
            # 清空所有缓存
            for repo_dir in self._cache_dir.iterdir():
                if repo_dir.is_dir():
                    for cache_file in repo_dir.glob("*.json"):
                        cache_file.unlink()
                        deleted_count += 1
                    # 删除空目录
                    if not any(repo_dir.iterdir()):
                        repo_dir.rmdir()
        
        return deleted_count
    
    def get_cache_info(self) -> Dict[str, Any]:
        """
        获取缓存信息。
        
        Returns:
            包含缓存统计信息的字典：
            - cache_dir: 缓存目录路径
            - total_repos: 缓存的仓库数量
            - total_files: 缓存文件总数
            - total_size_bytes: 缓存总大小（字节）
            - repos: 各仓库的缓存详情
        """
        info = {
            "cache_dir": str(self._cache_dir),
            "total_repos": 0,
            "total_files": 0,
            "total_size_bytes": 0,
            "repos": {},
        }
        
        if not self._cache_dir.exists():
            return info
        
        for repo_dir in self._cache_dir.iterdir():
            if repo_dir.is_dir():
                repo_id = repo_dir.name.replace("_", "/")
                files = list(repo_dir.glob("*.json"))
                size = sum(f.stat().st_size for f in files)
                
                info["repos"][repo_id] = {
                    "files": len(files),
                    "size_bytes": size,
                    "metrics": [f.stem for f in files],
                }
                info["total_repos"] += 1
                info["total_files"] += len(files)
                info["total_size_bytes"] += size
        
        return info
    
    def is_cached(self, repo_id: str) -> bool:
        """
        检查仓库数据是否已缓存。
        
        Args:
            repo_id: 仓库 ID
            
        Returns:
            如果所有默认指标都已缓存则返回 True
        """
        for metric in self._DEFAULT_ACTIVITY_METRICS:
            if self._read_from_cache(repo_id, metric) is None:
                return False
        return True
    
    def close(self) -> None:
        """
        关闭会话，释放资源。
        """
        if self._session:
            self._session.close()
            self._session = None
    
    def __enter__(self) -> "OpenDiggerClient":
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()
