"""
Minimal usage example for OpenDiggerAPI OpenDiggerClient.

Run with:
    python examples/test_opendigger_client.py
"""

from pprint import pprint
from pathlib import Path
import sys

# Allow running the example directly via `python examples/test_opendigger_client.py`
# by adding the repo root (project root) to import search path.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.data_layer.online.OpenDiggerAPI.client import OpenDiggerClient


def main() -> None:
    client = OpenDiggerClient(timeout=8.0)

    # Replace with the repo you want to test
    repo_id = "X-lab2017/open-digger"

    try:
        data = client.get_activity_data(repo_id)
    except Exception as exc:  # noqa: BLE001
        print(f"Request failed: {exc}")
        return

    print("Fetched metrics keys:", list(data.keys()))
    # Show a small sample of each metric to confirm structure
    for metric_name, metric_value in data.items():
        print(f"\n=== {metric_name} ===")
        if isinstance(metric_value, dict):
            # Print up to first 3 items for brevity
            first_items = list(metric_value.items())[:3]
            pprint(first_items)
        else:
            pprint(metric_value)


if __name__ == "__main__":
    main()


