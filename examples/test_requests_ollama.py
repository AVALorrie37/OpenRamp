'''
测试方法：
ollama serve
$env:PYTHONPATH = "$PWD"
python .\examples\test_requests_ollama.py
'''

import os
import time
import json
from typing import Dict, Any, List

from src.core.ai.conversation_handler import ConversationHandler, ProfileParser


def get_test_models() -> List[str]:
    env_models = os.getenv("OLLAMA_TEST_MODELS")
    if env_models:
        models = [m.strip() for m in env_models.split(",") if m.strip()]
        if models:
            return models
    default_model = os.getenv("OLLAMA_MODEL", "gemma2:2b")
    return [default_model]


def test_conversation_capabilities(handler: ConversationHandler, model: str) -> List[Dict[str, Any]]:
    cases = [
        ("update_profile", "我擅长 Python 和 Docker，喜欢修复 bug 和写测试。"),
        ("ask_content", "如果我想开始给开源项目做贡献，第一步应该怎么做？"),
        ("query_status", "告诉我现在我的技能画像。"),
        ("search_repo", "帮我推荐几个适合 Python 新手的开源项目。"),
        ("confirm", "好的，确认。"),
    ]
    results: List[Dict[str, Any]] = []
    for name, text in cases:
        start = time.time()
        out = handler.process_user_input(text)
        elapsed = time.time() - start
        results.append(
            {
                "type": "conversation",
                "step": name,
                "model": model,
                "elapsed_sec": elapsed,
                "reply": out.get("reply"),
                "action": out.get("action"),
                "data": out.get("data"),
            }
        )
        preview = (out.get("reply") or "").replace("\n", " ")[:120]
        print(
            f"✅ conversation step={name} model={model} "
            f"time={elapsed:.2f}s reply_preview={preview}..."
        )
    return results


def test_profile_parser(handler: ConversationHandler, model: str) -> Dict[str, Any]:
    parser = ProfileParser()
    summary = handler._build_conversation_summary()
    start = time.time()
    profile = parser.parse_profile(summary)
    elapsed = time.time() - start
    print(
        f"✅ profile_parser model={model} time={elapsed:.2f}s "
        f"skills={profile.get('skills')} styles={profile.get('contribution_styles')}"
    )
    return {
        "type": "profile_parser",
        "model": model,
        "elapsed_sec": elapsed,
        "profile": profile,
    }


def test_summarization(handler: ConversationHandler, model: str) -> Dict[str, Any]:
    recent = handler._get_recent_messages(10)
    combined = handler._build_incremental_summary_input(recent)
    start = time.time()
    summary = handler._summarize_conversation(combined)
    elapsed = time.time() - start
    preview = (summary or "").replace("\n", " ")[:160]
    print(
        f"✅ summarization model={model} time={elapsed:.2f}s "
        f"summary_preview={preview}..."
    )
    return {
        "type": "summarization",
        "model": model,
        "elapsed_sec": elapsed,
        "input_length": len(combined),
        "summary": summary,
    }


def main() -> None:
    models = get_test_models()
    results: List[Dict[str, Any]] = []

    print("将测试的模型:", ", ".join(models))

    for model in models:
        os.environ["OLLAMA_MODEL"] = model
        handler = ConversationHandler(user_id=f"test_{model}", user_language="chinese")

        conv_results = test_conversation_capabilities(handler, model)
        results.extend(conv_results)

        profile_result = test_profile_parser(handler, model)
        results.append(profile_result)

        summarization_result = test_summarization(handler, model)
        results.append(summarization_result)

    print("\n=== 详细结果(JSON) ===")
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()