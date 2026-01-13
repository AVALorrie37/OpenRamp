# OpenRamp — 开源贡献智能匹配系统｜Built via DataEase plugin extension with OpenDigger data
Team: FortunaAtoms
Competition: OpenSODA 2025

Smooth your OpenRamp to contribution. Smart project matching for open source newcomers.

智能开源项目推荐系统，通过AI对话收集开发者画像，基于多维度匹配算法推荐合适的开源贡献机会。

## 项目目标

OpenRamp旨在帮助开发者快速找到与其技能、兴趣和经验水平匹配的开源项目，降低参与开源社区的门槛。系统通过以下方式实现：

- **对话式画像构建**：使用AI助手通过自然语言对话收集开发者的技能、贡献偏好和经验等级
- **智能项目匹配**：基于技能匹配度、项目活跃度和社区需求的三维评分算法
- **多数据源整合**：结合GitHub API和OpenDigger API获取项目元数据和活跃度指标
- **可视化展示**：提供雷达图、词云、OpenRank趋势等可视化组件

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     前端层 (Electron + React)                │
├─────────────────────────────────────────────────────────────┤
│  Module1: 主界面  │  Module2: 用户系统  │  Module3: AI助手  │
│  - 仓库列表       │  - 登录/画像管理     │  - 对话窗口       │
│  - 技术栈词云     │  - 用户资料面板      │  - 建议按钮       │
│  - OpenRank图表   │                     │                   │
│  Module4: 调试窗口 │  Module5: 雷达可视化 │                  │
│  - 日志流         │  - 匹配度雷达图      │                  │
└─────────────────────────────────────────────────────────────┘
                            ↕ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────┐
│                   API层 (FastAPI Server)                    │
├─────────────────────────────────────────────────────────────┤
│  /api/repos      │  /api/chat         │  /api/match        │
│  /api/search     │  /api/profile/*    │  /api/logs/stream  │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    核心业务层 (Core)                         │
├─────────────────────────────────────────────────────────────┤
│  profile.py: 对话式画像构建                                  │
│    └─ ConversationalProfileBuilder                          │
│  match/scorer.py: 匹配评分算法                               │
│    └─ MatchScorer (技能/活跃度/需求三维评分)                │
│  ai/: AI提供者与提示词管理                                   │
│    └─ OllamaProvider, PromptManager                         │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                   数据层 (Data Layer)                        │
├─────────────────────────────────────────────────────────────┤
│  online/: 在线数据源                                         │
│    ├─ GithubAPI: GitHub仓库搜索与元数据                      │
│    ├─ OpenDiggerAPI: 项目活跃度指标                         │
│    └─ integrated_search.py: 多轮搜索与匹配                   │
│  offline/: 离线数据加载                                      │
│    └─ loader.py: 本地缓存数据加载                            │
│  utils/: 工具模块                                            │
│    ├─ nlp.py: 自然语言处理                                   │
│    └─ rate_limiter.py: API限流                              │
└─────────────────────────────────────────────────────────────┘
```

## 快速启动指南

### 环境要求

- Python 3.8+
- Node.js 18+
- Ollama (用于AI对话，支持其他LLM)

### 后端启动

1. **安装依赖**
```bash
pip install -r requirements.txt
```

2. **配置环境变量**（可选）
创建 `.env` 文件：
```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2
GITHUB_TOKEN=your_github_token  # 可选，用于提高API限流
```

3. **启动API服务器**
```bash
cd src/api
python server.py
# 或使用 uvicorn
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

服务器将在 `http://localhost:8000` 启动。

### 前端启动

1. **安装依赖**
```bash
cd frontend
npm install
```

2. **开发模式**
```bash
npm run dev
```

3. **Electron桌面应用**
```bash
npm run electron:dev
```

4. **构建生产版本**
```bash
npm run build
```

### Docker启动（可选）

```bash
docker-compose up -d
```

## 模块接口说明

### 后端API接口

#### 1. 仓库数据接口

**GET `/api/repos`**
- 描述：获取仓库数据列表
- 参数：
  - `mode`: `offline` | `online` (默认: `offline`)
  - `repo_ids`: 仓库ID列表（可选）
  - `limit`: 返回数量上限（默认: 20, 最大: 1000）
- 响应：
```json
{
  "mode": "offline",
  "repos": [
    {
      "repo_id": "owner/repo",
      "name": "repo",
      "description": "...",
      "languages": ["python", "javascript"],
      "active_score": 0.85,
      "influence_score": 0.72,
      "demand_score": 0.68,
      "composite_score": 0.78,
      "raw_metrics": {...}
    }
  ]
}
```

#### 2. AI对话接口

**POST `/api/chat`**
- 描述：处理用户对话，构建开发者画像
- 请求体：
```json
{
  "user_id": "user123",
  "message": "我擅长Python和Django开发",
  "session_id": "optional_session_id"
}
```
- 响应：
```json
{
  "reply": "AI回复内容",
  "status": "collecting" | "pending" | "confirmed",
  "skills": ["python", "django"],
  "preferences": ["feature", "bug_fix"],
  "action": "NONE" | "CONFIRM" | "SEARCH",
  "confirmed": false,
  "profile": null
}
```

#### 3. 画像确认接口

**POST `/api/profile/confirm`**
- 描述：确认并保存用户画像
- 请求体：
```json
{
  "user_id": "user123"
}
```

**GET `/api/profile/{user_id}`**
- 描述：获取用户画像
- 响应：
```json
{
  "skills": ["python", "django"],
  "preferences": ["feature"],
  "experience": "intermediate"
}
```

#### 4. 匹配评分接口

**POST `/api/match`**
- 描述：计算用户与项目的匹配分数
- 请求体：
```json
{
  "user_id": "user123",
  "repo_id": "owner/repo"
}
```
- 响应：
```json
{
  "match_score": 0.85,
  "breakdown": {
    "skill": 0.90,
    "activity": 0.75,
    "demand": 0.80
  },
  "repo_name": "repo",
  "repo_full_name": "owner/repo"
}
```

#### 5. 智能搜索接口

**POST `/api/search`**
- 描述：基于用户画像搜索匹配项目
- 请求体：
```json
{
  "user_id": "user123",
  "limit": 10
}
```
- 响应：
```json
{
  "mode": "online",
  "repos": [...]
}
```

#### 6. 日志流接口

**GET `/api/logs/stream`**
- 描述：SSE流式日志输出
- 响应：Server-Sent Events格式

### 核心模块接口

#### `ConversationalProfileBuilder`

```python
from src.core.profile import ConversationalProfileBuilder

builder = ConversationalProfileBuilder()

# 开始对话
greeting = builder.start_session("user123")

# 处理用户输入
result = builder.chat("user123", "我擅长Python开发")

# 获取缓存的画像
profile = builder.get_cached_profile("user123")
```

#### `MatchScorer`

```python
from src.core.match import MatchScorer, UserProfile, RepoData

scorer = MatchScorer()

user_profile = UserProfile(
    skills=["python", "django"],
    contribution_types=["feature"],
    experience_level="intermediate"
)

repo_data = RepoData(
    keywords=["python", "fastapi"],
    active_days_last_30=15,
    issues_new_last_30=10,
    openrank=50.0,
    name="repo",
    full_name="owner/repo"
)

result = scorer.calculate(user_profile, repo_data)
print(f"匹配分数: {result.match_score}")
print(f"技能匹配: {result.breakdown.skill}")
```

#### `IntegratedRepoSearch`

```python
from src.data_layer.online.integrated_search import IntegratedRepoSearch

searcher = IntegratedRepoSearch()

result = searcher.search_with_profile_matching(
    user_id="user123",
    target_count=10
)

for repo in result.repositories:
    print(f"{repo.repo_id}: {repo.match_score}")
```

## 测试样例与运行方式

### 1. 对话式画像构建测试

```bash
cd examples
python test_conversational_profile.py
```

测试流程：
- 启动对话会话
- 模拟多轮对话收集技能和偏好
- 确认并保存画像

### 2. 匹配评分测试

```bash
python test_match_scorer.py
```

测试内容：
- 技能匹配度计算
- 活跃度评分
- 需求匹配度计算
- 综合评分验证

### 3. 集成搜索测试

```bash
python test_integrated_search.py
```

测试内容：
- GitHub API搜索
- OpenDigger数据获取
- 匹配评分与排序

### 4. 完整流程演示

```bash
python demo_profile_matching.py
```

演示：
- 使用自定义画像搜索项目
- 显示匹配结果和评分细节
- 支持使用缓存画像

### 5. 前端功能测试

启动前端开发服务器后，访问 `http://localhost:5173`：

- **用户系统**：点击右上角登录，输入用户ID
- **AI对话**：点击AI按钮，开始对话构建画像
- **项目搜索**：画像确认后自动搜索匹配项目
- **匹配可视化**：点击项目查看雷达图匹配详情

### 6. API测试

使用 `curl` 或 Postman 测试API：

```bash
# 健康检查
curl http://localhost:8000/health

# 获取仓库列表
curl "http://localhost:8000/api/repos?mode=offline&limit=10"

# AI对话
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test_user", "message": "我擅长Python"}'
```

## 贡献指引

### 开发环境设置

1. **Fork项目并克隆**
```bash
git clone https://github.com/AVALorrie37/OpenRamp.git
cd OpenRamp
```

2. **创建开发分支**
```bash
git checkout -b feature/your-feature-name
```

3. **安装开发依赖**
```bash
pip install -r requirements.txt
cd frontend && npm install
```

### 代码规范

- **Python**: 遵循PEP 8，使用类型注解
- **TypeScript**: 使用ESLint配置，遵循React最佳实践
- **提交信息**: 使用清晰的提交信息，格式：`type: description`

### 贡献流程

1. **问题报告**
   - 在GitHub Issues中创建问题报告
   - 提供复现步骤和环境信息

2. **功能开发**
   - 从`main`分支创建功能分支
   - 编写测试用例
   - 确保所有测试通过
   - 更新相关文档

3. **提交Pull Request**
   - 描述变更内容
   - 关联相关Issue
   - 等待代码审查

### 测试要求

- 新功能必须包含测试用例
- 确保现有测试通过：`pytest`（如配置）
- 前端组件测试：使用React Testing Library

### 文档更新

- 更新README.md（如需要）
- 添加代码注释和文档字符串
- 更新API文档（如修改接口）

### 联系方式

- Issues: [GitHub Issues](https://github.com/AVALorrie37/OpenRamp/issues)
- Discussions: [GitHub Discussions](https://github.com/AVALorrie37/OpenRamp/discussions)

---

**License**: GPLV3.0
