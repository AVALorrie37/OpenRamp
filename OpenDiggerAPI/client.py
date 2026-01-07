from typing import Any, Dict, List
import json
from urllib import request as urlrequest, error as urlerror

try:
    import requests  # type: ignore
except ImportError:  # pragma: no cover - fallback path for minimal envs
    requests = None


class OpenDiggerClient:
    """
    A minimal client for fetching metrics from the OpenDigger OSS endpoint.

    This client is intentionally standalone and only depends on the Python
    standard library and the `requests` package.
    """

    # Base endpoint for OpenDigger OSS data
    _BASE_URL: str = "https://oss.open-digger.cn/github"

    # Default metrics fetched by `get_activity_data`
    _DEFAULT_ACTIVITY_METRICS: List[str] = [
        "active_dates_and_times",
        "openrank",
        "issues_new",
    ]

    def __init__(self, timeout: float = 8.0) -> None:
        """
        :param timeout: HTTP request timeout in seconds (applied per request).
        """
        self._timeout = timeout

    def _validate_repo_id(self, repo_id: str) -> None:
        """
        Validate that repo_id is in the form 'owner/repo'.

        :raises ValueError: if the format is invalid.
        """
        if not isinstance(repo_id, str):
            raise ValueError("repo_id must be a string in the form 'owner/repo'")

        # Must contain exactly one slash and non-empty owner/repo parts
        parts = repo_id.split("/")
        if len(parts) != 2 or not parts[0] or not parts[1]:
            raise ValueError("repo_id must be in the form 'owner/repo'")

    def _build_metric_url(self, repo_id: str, metric: str) -> str:
        """
        Build the URL for a specific metric JSON file.
        """
        return f"{self._BASE_URL}/{repo_id}/{metric}.json"

    def _fetch_metric(self, url: str) -> Any:
        """
        Fetch a single metric from OpenDigger.

        :raises RuntimeError: for non-200 responses (including rate limit).
        :raises requests.exceptions.RequestException: for network errors.
        """
        # Prefer requests when available; fall back to urllib to avoid extra deps.
        if requests:
            try:
                response = requests.get(url, timeout=self._timeout)
            except requests.exceptions.RequestException:
                # Let the caller handle all network-related errors as specified
                raise

            status = response.status_code
            if status == 429:
                raise RuntimeError("OpenDigger API rate limit exceeded")
            if status != 200:
                raise RuntimeError(
                    f"OpenDigger API request failed with status code {status}"
                )
            return response.json()

        # urllib fallback
        try:
            with urlrequest.urlopen(url, timeout=self._timeout) as resp:
                status = resp.getcode()
                if status == 429:
                    raise RuntimeError("OpenDigger API rate limit exceeded")
                if status != 200:
                    raise RuntimeError(
                        f"OpenDigger API request failed with status code {status}"
                    )
                return json.loads(resp.read().decode("utf-8"))
        except urlerror.URLError as exc:
            # Mirror requests-style behavior of surfacing network issues
            raise RuntimeError(f"Network error while fetching {url}: {exc}") from exc

    def get_activity_data(self, repo_id: str) -> Dict[str, Any]:
        """
        通过OpenDigger API获取仓库活跃度数据
        :param repo_id: GitHub仓库ID（格式：owner/repo）
        :return: 活跃度原始数据（JSON结构，含指标`active_dates_and_times.json`、 `openrank.json`、`issues_new.json`，并且设计时考虑方便扩展其他未使用的指标）
        :raises:
           - ValueError: repo_id格式无效
           - requests.exceptions.RequestException: 网络请求失败
           - RuntimeError: API返回非200状态码
        """
        # 1. 校验 repo_id 格式
        self._validate_repo_id(repo_id)

        # 2. 为后续扩展保留统一的结构：以指标名为 key
        data: Dict[str, Any] = {}

        for metric in self._DEFAULT_ACTIVITY_METRICS:
            url = self._build_metric_url(repo_id, metric)
            # 逐个请求，任何一次失败都按要求抛异常
            metric_data = self._fetch_metric(url)
            data[metric] = metric_data

        return data


