# OpenRamp

**English** · [简体中文](README.zh-CN.md)

Smooth your ramp to open source. OpenRamp combines **AI conversational profiling with multi-dimensional scoring** so you can find open-source projects that fit you better among a huge pool of repositories.

![](SnowShot_2026-04-06_en.png)
![](SnowShot_2026-04-06_chat_en.png)


## Why Try It?

- **🗣️ Conversational Profiling**: Describe your stack and experience in natural language to generate a match-ready developer profile.
- **🎯 Smarter Matching & Insights**: Multi-signal scoring with clear reasons, plus rich visualizations to help you decide faster.
- **🔒 100% Local & Free**: Run LLMs locally with **zero token costs** and **full privacy**. No API keys, no subscriptions.

## What you can do

- **Contributors / newcomers**: map your skills and interests, search for active projects that are easier to pick up, and use radar charts to see *why* something matches
- **Maintainers / platforms**: review activity and demand signals in bulk, and use scores to steer newcomers toward repos that suit them better

## Requirements

- **Local development:** Python 3.10+, Node.js 18+, and npm. For real AI (chat and profiling, not mock mode), run **[Ollama](https://ollama.com/)** and pull a model (e.g. `ollama pull gemma2:2b`).
- **Docker demo:** [Docker](https://docs.docker.com/get-docker/) with Compose — no host Python, Node, or Ollama needed for the containerized path (**Option D**).

## Environment variables

Nothing is required; defaults are fine. Optional overrides:

```bash
cp .env.example .env
```

Details: [.env.example](.env.example). **Root `.env`**: Ollama URL/timeouts, optional `OLLAMA_MODEL` (backend default when no `model` in the request; the web UI normally picks from the installed model list), `GITHUB_TOKEN`, `CORS_ORIGINS`. **`frontend/.env`**: `VITE_API_BASE`, `VITE_USE_MOCK`, optional `VITE_DEMO_SEED=true` (mock-only auto-login as `demo` for static demos).

**Docker:** Compose reads root `.env`. Backend reaches Ollama via **`OPENRAMP_DOCKER_OLLAMA_URL`** (default `http://ollama:11434`; use `http://host.docker.internal:11434` for host Ollama). No `VITE_API_BASE` in Docker (UI proxies `/api`).

## Quick start

**Docker (Option D)** is the shortest path to a full demo on your machine. **Option A** is the usual choice when you are developing with Python and Node installed.

**Option A: one command from the repo root (recommended for local dev)**

**Required**

1. Meet [Requirements](#requirements) for local dev.
2. From the repo root:

```bash
pip install -r requirements.txt
npm install
npm run dev
```

3. Open **http://localhost:5173** (frontend). API: **http://localhost:8000**.

**Optional**

- **`npm run dev-all`** — same stack plus **`ollama serve`** in the same terminal (Ollama must be installed and on your `PATH`).

**Troubleshooting**

- **Chat or profiling fails:** Ensure Ollama is running, run `ollama pull` for the model you want to use (default `gemma2:2b`; set `OLLAMA_MODEL` to override), and check `OLLAMA_URL` if Ollama is not on the default host/port.

**Option B: frontend only with mock API (no backend)**

**Required**

```bash
cd frontend && npm install && cd ..
npm run mock
```

No backend or Ollama — handy when you only need the UI against the mock API.

**Option C: backend and frontend in separate terminals**

**Required**

Terminal 1:

```bash
pip install -r requirements.txt
python -m src.api.server
```

Terminal 2:

```bash
cd frontend && npm install && npm run dev
```

**Optional**

- Run the backend with reload (use the same level as `LOG_LEVEL` in `.env`, lowercase): `uvicorn src.api.server:app --host 0.0.0.0 --port 8000 --reload --log-level info`
- Production-style frontend: `cd frontend && npm run build`, then `npm run preview`

**URLs:** backend **http://localhost:8000**, frontend **http://localhost:5173**.

**Troubleshooting** — same as Option A for AI features (Ollama + model).

**Option D: Docker Compose (one-click demo)**

**Required**

1. Docker with Compose (e.g. Docker Desktop).
2. From the repo root: `docker compose up --build`
3. Open **http://localhost:8080** (UI; `/api` is proxied to the backend).
4. After containers are up, pull the model once (default `gemma2:2b`; set `OLLAMA_MODEL` in root `.env` to override):

```bash
docker compose exec ollama ollama pull gemma2:2b
```

**Optional**

- Root `.env` for `GITHUB_TOKEN`, `OLLAMA_MODEL` (optional; default `gemma2:2b`), `CORS_ORIGINS`, etc.
- Ollama on the host instead of the `ollama` service: **`OPENRAMP_DOCKER_OLLAMA_URL`** ([Environment variables](#environment-variables)).
- Debugging: **http://localhost:8000/health**, Ollama on host port **11434**.

**Troubleshooting**

- **`docker compose up` fails binding 11434:** Another app (often the Ollama desktop client) is using the port — quit it or change the mapping in `docker-compose.yml`.
- **Chat / “cannot reach AI”:** Pull the model; confirm the model exists in `docker compose exec ollama ollama list` (default `gemma2:2b`; set `OLLAMA_MODEL` to override); check **`docker compose logs backend`**.
- **Stop:** `docker compose down`. **Remove volumes** (models + saved repo list): `docker compose down -v`.

## GitHub Pages (static mock demo)

Pushes to **`main`** that touch `frontend/**` run [`.github/workflows/deploy-github-pages.yml`](.github/workflows/deploy-github-pages.yml): the workflow sets **`VITE_USE_MOCK=true`**, **`VITE_DEMO_SEED=true`**, and **`VITE_PAGES_BASE=/<repository-name>/`** only for that build, so **local defaults are unchanged**. Enable **Settings → Pages → Build and deployment → Source: GitHub Actions** once. The site URL is `https://<user>.github.io/<repo>/`.

## Tech stack

- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, Axios, Chart.js / react-chartjs-2, Recharts, d3-cloud, Framer Motion, Lucide React
- **Backend**: FastAPI, Pydantic, httpx
- **AI**: Ollama integration (`OllamaProvider`), chat and multi-stage prompting
- **Data**: OpenDigger, GitHub metadata and caches

## Contributing

Thanks for helping make OpenRamp better—whether you fix a small bug, improve docs, or share an idea.

1. Fork the repo and create a branch: `git checkout -b feature/your-feature`
2. In your pull request, briefly note **what changed**, **why**, and **how you tested or verified it**

Questions first? Open an **Issue** or start a **Discussion**; we’re happy to align before you dive in.

**License:** [GPLv3](LICENSE)
