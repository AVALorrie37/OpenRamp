"""
Tests for unified score fields (active_score, influence_score, demand_score,
composite_score, languages) in IntegratedRepoResult and search API response.
"""

import os
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from src.data_layer.online.integrated_search import (
    IntegratedRepoSearch,
    IntegratedRepoResult,
    IntegratedSearchResult,
)
from src.data_layer.online.GithubAPI.schemas import RepoMetadata
from src.data_layer.online.score_calibration_store import ScoreCalibrationStore


def _isolated_searcher():
    fd, path = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    try:
        os.unlink(path)
    except OSError:
        pass
    p = Path(path)
    store = ScoreCalibrationStore(file_path=p)
    return IntegratedRepoSearch(calibration_store=store), p


def _cleanup_cal_path(p: Path) -> None:
    if p.exists():
        p.unlink()


def _make_opendigger_metrics(active_val=0.5, openrank_val=25.0, issues_val=25):
    now = datetime.now()
    m = (now - timedelta(days=60)).strftime("%Y-%m")
    return {
        "active_dates_and_times": {m: [10] * 20},
        "openrank": {m: openrank_val},
        "issues_new": {m: issues_val},
        "issues_new_last_30": issues_val,
        "active_days_last_30": 20,
    }


def test_build_scores_opendigger_empty_metrics():
    searcher, p = _isolated_searcher()
    try:
        out = searcher._build_scores_opendigger({}, ["python"])
        assert out["active_score"] == 0.0
        assert out["demand_score"] == 0.0
        assert out["influence_score"] == 0.0
        assert out["composite_score"] == 0.0
        assert out["languages"] == ["python"]
    finally:
        _cleanup_cal_path(p)


def test_build_scores_opendigger_with_data():
    searcher, p = _isolated_searcher()
    try:
        metrics = _make_opendigger_metrics(active_val=0.5, openrank_val=25.0, issues_val=25)
        out = searcher._build_scores_opendigger(metrics, ["python", "fastapi"])
        assert 0.0 <= out["active_score"] < 1.0
        assert 0.0 <= out["influence_score"] <= 1.0
        assert 0.0 <= out["demand_score"] < 1.0
        expected_composite = (
            0.5 * out["active_score"] + 0.3 * out["influence_score"] + 0.2 * out["demand_score"]
        )
        assert abs(out["composite_score"] - expected_composite) < 1e-5
        assert out["languages"] == ["python", "fastapi"]
    finally:
        _cleanup_cal_path(p)


def test_build_scores_opendigger_languages_empty():
    searcher, p = _isolated_searcher()
    try:
        metrics = _make_opendigger_metrics()
        out = searcher._build_scores_opendigger(metrics, [])
        assert out["languages"] == []
    finally:
        _cleanup_cal_path(p)


def test_integrated_repo_result_has_unified_fields():
    metrics = _make_opendigger_metrics()
    searcher, p = _isolated_searcher()
    try:
        unified = searcher._build_scores_opendigger(metrics, ["go"])
        repo = IntegratedRepoResult(
            repo_id="owner/repo",
            github_keywords=["go"],
            description="desc",
            metadata=RepoMetadata(stars=100, last_updated="2024-01-01"),
            opendigger_metrics=metrics,
            active_score=unified["active_score"],
            influence_score=unified["influence_score"],
            demand_score=unified["demand_score"],
            composite_score=unified["composite_score"],
            languages=unified["languages"],
            issues_new_last_30=unified["issues_new_last_30"],
            active_days_last_30=unified["active_days_last_30"],
            od_active_raw=unified["od_active_raw"],
            od_demand_raw=unified["od_demand_raw"],
        )
        assert hasattr(repo, "active_score")
        assert hasattr(repo, "influence_score")
        assert hasattr(repo, "demand_score")
        assert hasattr(repo, "composite_score")
        assert hasattr(repo, "languages")
        assert repo.composite_score == 0.5 * repo.active_score + 0.3 * repo.influence_score + 0.2 * repo.demand_score
        assert repo.languages == ["go"]
    finally:
        _cleanup_cal_path(p)


def test_search_api_repo_shape():
    metrics = _make_opendigger_metrics()
    searcher, p = _isolated_searcher()
    try:
        unified = searcher._build_scores_opendigger(metrics, ["rust"])
        repo = IntegratedRepoResult(
            repo_id="owner/repo",
            github_keywords=["rust"],
            description="desc",
            metadata=RepoMetadata(stars=50, last_updated=""),
            opendigger_metrics=metrics,
            active_score=unified["active_score"],
            influence_score=unified["influence_score"],
            demand_score=unified["demand_score"],
            composite_score=unified["composite_score"],
            languages=unified["languages"],
        )
        payload = {
            "repo_id": repo.repo_id,
            "name": repo.repo_id.split("/")[-1],
            "description": repo.description or "No description",
            "languages": repo.languages,
            "active_score": repo.active_score,
            "influence_score": repo.influence_score,
            "demand_score": repo.demand_score,
            "composite_score": repo.composite_score,
            "raw_metrics": None,
        }
        assert "languages" in payload and isinstance(payload["languages"], list)
        assert "active_score" in payload
        assert "influence_score" in payload
        assert "demand_score" in payload
        assert "composite_score" in payload
        assert abs(
            payload["composite_score"]
            - (
                0.5 * payload["active_score"]
                + 0.3 * payload["influence_score"]
                + 0.2 * payload["demand_score"]
            )
        ) < 1e-5
    finally:
        _cleanup_cal_path(p)


def test_search_api_response_with_mock_result():
    try:
        from fastapi.testclient import TestClient
        from src.api.server import app, get_integrated_search
        import src.api.server as srv
    except (ImportError, RuntimeError):
        return
    metrics = _make_opendigger_metrics()
    searcher, p = _isolated_searcher()
    original_get = get_integrated_search
    try:
        unified = searcher._build_scores_opendigger(metrics, ["python"])
        mock_repo = IntegratedRepoResult(
            repo_id="test/repo",
            github_keywords=["python"],
            description="Test",
            metadata=RepoMetadata(stars=10, last_updated=""),
            opendigger_metrics=metrics,
            active_score=unified["active_score"],
            influence_score=unified["influence_score"],
            demand_score=unified["demand_score"],
            composite_score=unified["composite_score"],
            languages=unified["languages"],
        )
        mock_result = IntegratedSearchResult(
            search_keywords=["python"],
            repositories=[mock_repo],
            target_count=1,
            is_sufficient=True,
            message="ok",
        )

        def mock_get():
            class Searcher:
                def search_with_profile_matching(self, user_id=None, target_count=10):
                    return mock_result

            return Searcher()

        srv.get_integrated_search = mock_get
        client = TestClient(app)
        resp = client.post("/api/search", json={"user_id": "test-user", "limit": 5})
        assert resp.status_code == 200
        data = resp.json()
        assert data["mode"] == "online"
        assert "repos" in data
        if data["repos"]:
            r = data["repos"][0]
            assert "active_score" in r
            assert "influence_score" in r
            assert "demand_score" in r
            assert "composite_score" in r
            assert "languages" in r
            assert isinstance(r["languages"], list)
    finally:
        srv.get_integrated_search = original_get
        _cleanup_cal_path(p)


if __name__ == "__main__":
    test_build_scores_opendigger_empty_metrics()
    test_build_scores_opendigger_with_data()
    test_build_scores_opendigger_languages_empty()
    test_integrated_repo_result_has_unified_fields()
    test_search_api_repo_shape()
    test_search_api_response_with_mock_result()
    print("All tests passed.")
