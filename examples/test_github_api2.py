"""
测试githubAPI
Run with:
    python examples/test_github_api.py
"""
import os
from pathlib import Path

import requests
from dotenv import load_dotenv


def main():
    project_root = Path(__file__).resolve().parent.parent
    env_path = project_root / ".env"
    load_dotenv(dotenv_path=env_path)

    token = os.getenv("GITHUB_TOKEN")
    print("Has GITHUB_TOKEN:", bool(token))

    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"token {token}"

    repo_id = "AdguardTeam/AdguardFilters"
    url = f"https://api.github.com/repos/{repo_id}/stats/commit_activity"
    print("Request URL:", url)
    print("Request headers:", {k: (v[:8] + "..." if k == "Authorization" and v else v) for k, v in headers.items()})

    resp = requests.get(url, headers=headers, timeout=15)
    print("Status code:", resp.status_code)
    print("Response headers:", resp.headers)
    print("Body (first 500 chars):", resp.text[:500])


if __name__ == "__main__":
    main()