# OpenDigger API 服务器使用指南

## 功能概述

本系统提供了统一的仓库数据接口，支持**离线模式**和**在线模式**两种数据源：

- **离线模式**：从本地 `top_300_metrics` 目录加载数据，快速响应
- **在线模式**：从 OpenDigger API 实时获取数据

## 安装依赖

```bash
pip install -r requirements.txt
```

## 启动 API 服务器

```bash
python -m src.api.server
```

服务器将在 `http://localhost:8000` 启动。

## API 接口

### GET /api/repos

获取仓库数据列表。

**请求参数：**

| 参数 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `mode` | string | 数据源模式：`offline` 或 `online` | `offline` |
| `repo_ids` | string[] | 仓库ID列表（格式：`owner/repo`），在线模式必填 | `null` |
| `limit` | int | 返回数量上限（1-1000） | `20` |

**响应格式：**

```json
{
  "mode": "offline",
  "repos": [
    {
      "repo_id": "alibaba/nacos",
      "name": "nacos",
      "description": "Dynamic service discovery...",
      "languages": ["Java", "Python"],
      "active_score": 0.85,
      "influence_score": 0.92,
      "demand_score": 0.75,
      "composite_score": 0.84,
      "raw_metrics": {
        "active_dates": "2024-01-01:23,2024-01-02:18...",
        "openrank": "2024-01:42.3",
        "issues_new": "2024-01:12"
      }
    }
  ]
}
```

**示例请求：**

```bash
# 离线模式，获取前20个仓库
curl "http://localhost:8000/api/repos?mode=offline&limit=20"

# 在线模式，获取指定仓库
curl "http://localhost:8000/api/repos?mode=online&repo_ids=X-lab2017/open-digger&repo_ids=alibaba/nacos"
```

## 指标计算说明

### active_score（活跃度）
- **计算方式**：近3个月活跃天数 × 每日活跃峰值 / 100
- **归一化**：max=1.0

### influence_score（影响力）
- **计算方式**：最新月份 OpenRank 值 / 50
- **归一化**：max=1.0

### demand_score（需求热度）
- **计算方式**：近3个月新增 issue 总数 / 50
- **归一化**：max=1.0

### composite_score（综合分）
- **计算方式**：`0.5 × active_score + 0.3 × influence_score + 0.2 × demand_score`

## 使用 Streamlit 前端

启动 Streamlit 前端界面：

```bash
streamlit run examples/streamlit_dashboard.py
```

前端将自动连接到 `http://localhost:8000` 的 API 服务器。

## 生成仓库清单

生成离线仓库ID列表（可选）：

```bash
python src/data_layer/generate_repo_list.py
```

这将生成 `data/offline_repo_ids.json` 文件。

## 错误处理

| 错误场景 | HTTP状态码 | 说明 |
|----------|-----------|------|
| 离线目录不存在 | 503 | 离线数据未挂载 |
| 无效 repo_id | 404 | 仓库ID未找到 |
| 在线API超时 | 降级到离线缓存 | 自动使用离线数据 |

## 注意事项

1. **离线模式**：需要确保 `./top_300_metrics` 目录存在且包含数据
2. **在线模式**：需要网络连接，且必须提供 `repo_ids` 参数
3. **性能**：离线模式在启动时会预加载所有数据到内存（约300个仓库）
4. **在线模式**：不返回 `raw_metrics` 字段

