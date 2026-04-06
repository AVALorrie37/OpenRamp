# OpenRamp

[English](README.md) · **简体中文**

Smooth your ramp to open source. OpenRamp 通过 **AI 对话画像 + 多维度数据评分**，帮你在海量仓库里找到更适合自己的开源项目。

![](SnowShot_2026-04-06_zh.png)
![](SnowShot_2026-04-06_chat_zh.png)

## 为什么值得一试？

- **🗣️ 对话式画像**：用自然语言描述技术栈与经历，自动生成可用于匹配的开发者画像
- **🎯 更快更准的匹配与洞察**：基于数据做智能匹配与可视化洞察，帮你迅速找到更合适的项目/方向
- **🔒 100% 本地 & 免费**：本地运行大模型，零 token 成本，隐私完全可控；无需 API Key、无需订阅

## 你可以做什么？

- **贡献者 / 新手**：梳理技能与兴趣，搜索更易上手的活跃项目，通过雷达图了解匹配原因
- **维护者 / 平台**：批量查看活跃度与需求信号，用分数引导新人流向更合适的仓库

## 环境要求

- Python 3.10+
- Node.js 18+、npm
- 本地 LLM（推荐 [Ollama](https://ollama.com/)，免费好用），用于对话与画像相关能力

## 环境变量

在项目根目录 `.env`（后端读取）；前端变量可放在 `frontend/.env`（Vite 读取）。

```env
# AI（Ollama）
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma2:2b
AI_TIMEOUT=120

# GitHub（可选，提高 API 限额）
GITHUB_TOKEN=your_github_token

# 后端 CORS（逗号分隔，默认 *）
CORS_ORIGINS=*

# 前端（可选）
VITE_API_BASE=http://localhost:8000
VITE_USE_MOCK=false
```

## 快速开始

**方式 A：根目录一键联调（推荐）**

```bash
pip install -r requirements.txt
npm install
npm run dev
```

同时启动后端与前端（需已配置 Python 依赖）。完整链路（含本地 `ollama serve`）可用：

```bash
npm run dev-all
```

**方式 B：仅前端 + Mock（不接后端）**

```bash
cd frontend && npm install && cd ..
npm run mock
```

**方式 C：手动分进程**

```bash
pip install -r requirements.txt
python -m src.api.server
# 或: uvicorn src.api.server:app --host 0.0.0.0 --port 8000 --reload
```

```bash
cd frontend && npm install && npm run dev
```

- 后端默认：`http://localhost:8000`
- 前端开发：`http://localhost:5173`
- 生产构建：`cd frontend && npm run build`，再用 `npm run preview` 预览

## 技术栈

- **前端**：React 18、Vite、TypeScript、Tailwind CSS、Axios、Chart.js / react-chartjs-2、Recharts、d3-cloud、Framer Motion、Lucide React
- **后端**：FastAPI、Pydantic、httpx
- **AI**：Ollama 封装（`OllamaProvider`）、对话与多阶段提示流程
- **数据**：OpenDigger、GitHub 元数据与缓存

## 参与贡献

感谢你愿意花时间让 OpenRamp 更好。无论是修一个小bug、补一段文档，还是提一个新想法，都非常欢迎。

1. Fork 本仓库后新建分支：`git checkout -b feature/your-feature`
2. 提交 Pull Request 时，简单写几句：**改了什么**、**为什么改**、**怎么自测或验证**即可

有问题想先聊聊？欢迎到本仓库的 **Issues** 或 **Discussions** 发帖，我们很乐意一起把想法说清楚再动手。

**许可证：** [GPLv3](LICENSE)
