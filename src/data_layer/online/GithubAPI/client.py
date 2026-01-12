import sys
import os
import requests
from datetime import datetime, timedelta

# 获取当前文件的目录并添加到Python路径
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
data_layer_dir = os.path.dirname(parent_dir)

# 添加必要的路径
sys.path.insert(0, os.path.join(data_layer_dir, 'config'))
sys.path.insert(0, os.path.join(data_layer_dir, 'utils'))

try:
    from settings import GITHUB_API, BASE_URL, UNAUTHENTICATED_LIMITS
    from rate_limiter import github_rate_limiter
    from .schemas import SearchResult, RepoMetadata
finally:
    # 清理临时添加的路径
    paths_to_remove = [
        os.path.join(data_layer_dir, 'config'),
        os.path.join(data_layer_dir, 'utils')
    ]
    for path in paths_to_remove:
        if path in sys.path:
            sys.path.remove(path)

class GitHubClient:
    def __init__(self):
        """从配置中心初始化"""
        self.token = GITHUB_API["TOKEN"]
        accept_header = "application/vnd.github.mercy-preview+json"  # 包含topics字段
        if self.token:
            self.headers = {
                "Authorization": f"token {self.token}",
                "Accept": accept_header
            }
        else:
            # 无token模式，使用基础请求头
            self.headers = {
                "Accept": accept_header
            }
        
        # 根据是否有token调整结果限制
        if self.token:
            self.results_limit = GITHUB_API["SEARCH_RESULTS_LIMIT"]
        else:
            self.results_limit = min(GITHUB_API["SEARCH_RESULTS_LIMIT"], UNAUTHENTICATED_LIMITS["max_results"])
    
    def _filter_by_keywords(self, results: list) -> list:
        """
        过滤仓库：只保留有官方keywords（topics）的高质量仓库
        """
        filtered = []
        for result in results:
            # 只保留有官方keywords的仓库
            if result.keywords:
                filtered.append(result)
        
        return filtered
    
    @github_rate_limiter(max_retry=GITHUB_API["MAX_RETRY"])
    def _fetch_page(self, query: str, page: int, per_page: int) -> list:
        """
        获取单页搜索结果
        
        按 updated 字段降序排序，以筛选出最活跃的仓库
        """
        response = requests.get(
            f"{BASE_URL}/search/repositories",
            headers=self.headers,
            params={
                "q": query,
                "sort": "updated",  # 按更新时间排序，筛选最活跃的仓库
                "order": "desc",    # 降序：最近更新的在前
                "per_page": per_page,
                "page": page
            }
        )
        
        if response.status_code == 401:
            raise ValueError("Invalid GitHub token provided" if self.token else "GitHub API requires authentication or is rate limited")
        
        response.raise_for_status()
        data = response.json()
        
        # 调试信息
        total_count = data.get("total_count", 0)
        if total_count == 0:
            print(f"Debug: API returned 0 total results for query: {query}")
        else:
            print(f"Success: API returned {total_count} total results, {len(data.get('items', []))} in this page")
        
        return data.get("items", [])
    
    def search_repos(self, keywords: list, target_count: int = 5) -> list:
        """
        智能分批搜索：只请求必要的数据，节省API配额
        
        策略：
        1. 每次请求一批（默认15个）
        2. 过滤后检查是否满足目标数量
        3. 不足则继续请求下一批
        4. 直到满足数量或达到上限
        
        Args:
            keywords: 搜索关键词列表
            target_count: 目标返回数量，默认5个
        """
        if not self.token:
            print("Warning: Running in unauthenticated mode, results may be limited")
        
        # 计算近1年的日期（365天前）- 用于过滤最近更新的仓库
        one_year_ago = (datetime.now() - timedelta(days=365)).strftime('%Y-%m-%d')
        # 计算2个月前的日期（60天前）- 用于排除最近新建的仓库
        one_month_ago = (datetime.now() - timedelta(days=60)).strftime('%Y-%m-%d')
        
        # 构建查询：使用OR逻辑，增加搜索结果数量
        # GitHub搜索语法：空格表示AND，OR需要显式使用
        # 如果关键词包含空格，用引号包裹
        formatted_keywords = []
        for kw in keywords:
            if ' ' in kw:
                formatted_keywords.append(f'"{kw}"')
            else:
                formatted_keywords.append(kw)
        
        # 使用OR连接多个关键词（GitHub搜索语法）
        # 添加两个过滤条件：
        # 1. pushed:>{one_year_ago} - 最近一年有更新
        # 2. created:<{one_month_ago} - 创建时间早于一个月前（排除最近一个月新建的）
        if len(keywords) > 1:
            query = f"{' OR '.join(formatted_keywords)} pushed:>{one_year_ago} created:<{one_month_ago}"
        else:
            query = f"{formatted_keywords[0]} pushed:>{one_year_ago} created:<{one_month_ago}"
        
        batch_size = GITHUB_API.get("BATCH_SIZE", 15)
        max_total = int(self.results_limit)
        
        filtered_results = []
        page = 1
        total_fetched = 0
        
        # 分批请求，直到满足数量或达到上限
        while len(filtered_results) < target_count and total_fetched < max_total:
            # 计算本批应该请求多少个
            remaining_quota = max_total - total_fetched
            current_batch_size = min(batch_size, remaining_quota)
            
            print(f"Success: Fetching page {page} ({current_batch_size} repos), query: {query[:80]}...")
            
            # 获取一页数据
            try:
                items = self._fetch_page(query, page, current_batch_size)
            except Exception as e:
                print(f"Error fetching page {page}: {e}")
                break
            
            if not items:
                # 没有更多结果了
                print(f"Warning: No more results from API (page {page})")
                break
            
            total_fetched += len(items)
            
            # 转换结果
            for item in items:
                repo_metadata = RepoMetadata(
                    stars=item.get("stargazers_count", 0),
                    last_updated=item.get("pushed_at", "")
                )
                search_result = SearchResult(
                    repo_id=f"{item['owner']['login']}/{item['name']}",
                    keywords=item.get("topics") or [],
                    description=item.get("description") or "",
                    metadata=repo_metadata
                )
                
                # 实时过滤：只保留有keywords的仓库
                if search_result.keywords:
                    filtered_results.append(search_result)
                    # 达到目标数量就停止
                    if len(filtered_results) >= target_count:
                        break
            
            print(f"Success: Fetched {total_fetched} total, {len(filtered_results)} with keywords (target: {target_count})")
            
            # 如果已经满足数量，提前结束
            if len(filtered_results) >= target_count:
                break
            
            page += 1
        
        # 返回目标数量的仓库
        return filtered_results[:target_count]