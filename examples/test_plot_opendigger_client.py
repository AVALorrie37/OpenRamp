"""
Streamlit demo for visualizing OpenDigger metrics.

Run with:
    streamlit run examples/test_opendigger_client.py
"""

from pathlib import Path
import sys

import streamlit as st

# 允许直接通过 `streamlit run examples/test_opendigger_client.py` 运行，
# 把项目根目录加入到 sys.path 里，方便导入 online/offline 模块。
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.online.OpenDiggerAPI.client import OpenDiggerClient  # noqa: E402


def fetch_activity_data(repo_id: str, timeout: float = 8.0):
    client = OpenDiggerClient(timeout=timeout)
    return client.get_activity_data(repo_id)


def main() -> None:
    st.set_page_config(page_title="OpenDigger Metrics Demo", layout="wide")
    st.title("OpenDigger 仓库活跃度可视化")

    default_repo = "X-lab2017/open-digger"
    repo_id = st.text_input("GitHub 仓库（owner/repo）", value=default_repo)
    timeout = st.slider("请求超时时间（秒）", min_value=2, max_value=30, value=8)

    if st.button("获取数据"):
        if not repo_id.strip():
            st.error("仓库 ID 不能为空（格式：owner/repo）")
            return

        with st.spinner("正在从 OpenDigger 获取数据..."):
            try:
                data = fetch_activity_data(repo_id.strip(), float(timeout))
            except Exception as exc:  # noqa: BLE001
                st.error(f"请求失败：{exc}")
                return

        st.success("数据获取成功！")
        st.write("可用指标：", list(data.keys()))

        col1, col2 = st.columns(2)

        # ---- openrank ----
        openrank = data.get("openrank")
        if openrank:
            years = [item[0] for item in openrank]
            scores = [item[1] for item in openrank]
            with col1:
                st.subheader("OpenRank（按年）")
                chart_data = {"year": years, "openrank": scores}
                st.bar_chart(chart_data, x="year", y="openrank")

        # ---- issues_new ----
        issues_new = data.get("issues_new")
        if issues_new:
            years = [item[0] for item in issues_new]
            counts = [item[1] for item in issues_new]
            with col2:
                st.subheader("新 issue 数量（按年）")
                chart_data = {"year": years, "issues_new": counts}
                st.bar_chart(chart_data, x="year", y="issues_new")

        # ---- active_dates_and_times ----
        active = data.get("active_dates_and_times")
        if active:
            st.subheader("活跃度概览（按年聚合）")
            agg_years = [item[0] for item in active]
            # 每个年份数据是一个长度为 366 的列表（每天的活跃度），这里做简单求和
            totals = [sum(item[1]) if isinstance(item[1], list) else 0 for item in active]
            chart_data = {"year": agg_years, "activity_sum": totals}
            st.bar_chart(chart_data, x="year", y="activity_sum")

        with st.expander("查看原始数据"):
            st.json(data)


if __name__ == "__main__":
    main()