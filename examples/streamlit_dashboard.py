"""
Streamlit 前端，展示 OpenDigger 仓库数据。
"""

from pathlib import Path
import sys

try:
    import streamlit as st
    import requests
except ImportError:
    st = None
    requests = None

# 允许直接运行，将项目根目录加入 sys.path，方便导入 src.*
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main():
    if st is None:
        print("错误: 需要安装 streamlit: pip install streamlit")
        return

    st.set_page_config(
        page_title="OpenDigger 仓库数据看板",
        page_icon="📊",
        layout="wide",
    )

    st.title("📊 OpenDigger 仓库数据看板")

    # API 服务器地址配置
    api_base_url = st.sidebar.text_input(
        "API 服务器地址",
        value="http://localhost:8000",
        help="FastAPI 服务器的地址",
    )

    # 模式选择
    data_source_mode = st.sidebar.selectbox(
        "数据源模式",
        options=["offline", "online"],
        index=0,
        help="offline: 使用本地离线数据（快速）\nonline: 使用在线API（实时）",
    )

    # 仓库ID输入（在线模式需要）
    repo_ids_input = None
    if data_source_mode == "online":
        repo_ids_input = st.sidebar.text_area(
            "仓库ID列表（每行一个，格式：owner/repo）",
            value="X-lab2017/open-digger\nalibaba/nacos",
            help="在线模式必须提供仓库ID",
        )

    # 数量限制
    limit = st.sidebar.slider("返回数量", min_value=1, max_value=100, value=20)

    # 刷新按钮
    if st.sidebar.button("🔄 刷新数据", type="primary"):
        st.rerun()

    # 构建请求参数
    params = {
        "mode": data_source_mode,
        "limit": limit,
    }

    if data_source_mode == "online" and repo_ids_input:
        repo_ids = [line.strip() for line in repo_ids_input.split("\n") if line.strip()]
        params["repo_ids"] = repo_ids

    # 获取数据
    try:
        if requests is None:
            st.error("需要安装 requests: pip install requests")
            return

        response = requests.get(f"{api_base_url}/api/repos", params=params, timeout=30)
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.ConnectionError:
        st.error(f"❌ 无法连接到API服务器: {api_base_url}\n\n请确保API服务器正在运行：\n```bash\npython api_server.py\n```")
        return
    except requests.exceptions.HTTPError as e:
        st.error(f"❌ API请求失败: {e}\n\n响应: {response.text if 'response' in locals() else 'N/A'}")
        return
    except Exception as e:
        st.error(f"❌ 获取数据失败: {e}")
        return

    mode = data.get("mode", "unknown")
    repos = data.get("repos", [])

    # 显示模式标识
    mode_badge = "🟢 离线模式" if mode == "offline" else "🔵 在线模式"
    st.info(f"{mode_badge} | 共 {len(repos)} 个仓库")

    if not repos:
        st.warning("没有找到仓库数据")
        return

    # 排序选项
    sort_by = st.selectbox(
        "排序方式",
        options=["composite_score", "active_score", "influence_score", "demand_score"],
        index=0,
    )
    repos_sorted = sorted(repos, key=lambda x: x.get(sort_by, 0), reverse=True)

    # 显示统计信息
    col1, col2, col3, col4 = st.columns(4)
    with col1:
        avg_composite = sum(r.get("composite_score", 0) for r in repos) / len(repos)
        st.metric("平均综合分", f"{avg_composite:.3f}")
    with col2:
        avg_active = sum(r.get("active_score", 0) for r in repos) / len(repos)
        st.metric("平均活跃度", f"{avg_active:.3f}")
    with col3:
        avg_influence = sum(r.get("influence_score", 0) for r in repos) / len(repos)
        st.metric("平均影响力", f"{avg_influence:.3f}")
    with col4:
        avg_demand = sum(r.get("demand_score", 0) for r in repos) / len(repos)
        st.metric("平均需求热度", f"{avg_demand:.3f}")

    # 数据表格
    st.subheader("📋 仓库列表")

    # 准备表格数据
    table_data = []
    for repo in repos_sorted:
        table_data.append({
            "仓库ID": repo["repo_id"],
            "名称": repo["name"],
            "综合分": f"{repo['composite_score']:.3f}",
            "活跃度": f"{repo['active_score']:.3f}",
            "影响力": f"{repo['influence_score']:.3f}",
            "需求热度": f"{repo['demand_score']:.3f}",
            "语言": ", ".join(repo.get("languages", [])[:3]),
        })

    st.dataframe(table_data, use_container_width=True)

    # 详细视图
    st.subheader("📊 详细视图")
    selected_repo_id = st.selectbox(
        "选择仓库查看详情",
        options=[r["repo_id"] for r in repos_sorted],
    )

    selected_repo = next((r for r in repos if r["repo_id"] == selected_repo_id), None)
    if selected_repo:
        col1, col2 = st.columns(2)

        with col1:
            st.write("**基本信息**")
            st.write(f"- 仓库ID: `{selected_repo['repo_id']}`")
            st.write(f"- 名称: {selected_repo['name']}")
            st.write(f"- 描述: {selected_repo.get('description', 'N/A')}")
            st.write(f"- 语言: {', '.join(selected_repo.get('languages', []))}")

        with col2:
            st.write("**评分指标**")
            st.progress(selected_repo["composite_score"], text=f"综合分: {selected_repo['composite_score']:.3f}")
            st.progress(selected_repo["active_score"], text=f"活跃度: {selected_repo['active_score']:.3f}")
            st.progress(selected_repo["influence_score"], text=f"影响力: {selected_repo['influence_score']:.3f}")
            st.progress(selected_repo["demand_score"], text=f"需求热度: {selected_repo['demand_score']:.3f}")

        # 原始指标（仅离线模式）
        if selected_repo.get("raw_metrics") and mode == "offline":
            with st.expander("📄 原始指标数据"):
                st.json(selected_repo["raw_metrics"])


if __name__ == "__main__":
    main()

