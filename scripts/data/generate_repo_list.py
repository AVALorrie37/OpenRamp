"""
生成全量仓库清单脚本。
"""

import json
import os
from pathlib import Path


def generate_repo_list(base_path: str = "./top_300_metrics", output_path: str = "./data/offline_repo_ids.json"):
    """
    扫描离线数据目录，生成所有仓库ID列表。

    :param base_path: 离线数据根目录
    :param output_path: 输出JSON文件路径
    """
    base = Path(base_path)
    if not base.exists():
        print(f"错误: 目录不存在 {base_path}")
        return

    repo_ids = []
    for owner_dir in sorted(base.iterdir()):
        if not owner_dir.is_dir():
            continue
        owner = owner_dir.name
        for repo_dir in sorted(owner_dir.iterdir()):
            if not repo_dir.is_dir():
                continue
            repo = repo_dir.name
            repo_id = f"{owner}/{repo}"
            repo_ids.append(repo_id)

    # 确保输出目录存在
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    # 保存JSON文件
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(repo_ids, f, indent=2, ensure_ascii=False)

    print(f"✅ 成功生成仓库清单: {output_path}")
    print(f"   共 {len(repo_ids)} 个仓库")


if __name__ == "__main__":
    generate_repo_list()

