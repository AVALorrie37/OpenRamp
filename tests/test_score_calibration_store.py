"""Unit tests for ScoreCalibrationStore."""

import os
import tempfile
from pathlib import Path

import pytest

from src.data_layer.online.score_calibration_store import (
    ALL_CHANNELS,
    CHANNEL_GITHUB_ACTIVITY,
    ScoreCalibrationStore,
)


@pytest.fixture
def tmp_store_path():
    fd, path = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    try:
        os.unlink(path)
    except OSError:
        pass
    yield Path(path)
    p = Path(path)
    if p.exists():
        p.unlink()


def test_normalize_single_positive_strictly_less_than_one(tmp_store_path):
    s = ScoreCalibrationStore(file_path=tmp_store_path, max_samples=100)
    x = s.normalize_single(CHANNEL_GITHUB_ACTIVITY, 10.0)
    assert 0.0 < x < 1.0


def test_normalize_single_non_positive_is_zero(tmp_store_path):
    s = ScoreCalibrationStore(file_path=tmp_store_path)
    assert s.normalize_single(CHANNEL_GITHUB_ACTIVITY, 0.0) == 0.0
    assert s.normalize_single(CHANNEL_GITHUB_ACTIVITY, -1.0) == 0.0


def test_normalize_batch_order_and_commit_ring(tmp_store_path):
    s = ScoreCalibrationStore(file_path=tmp_store_path, max_samples=5)
    s.commit_session({CHANNEL_GITHUB_ACTIVITY: [1.0, 2.0, 3.0]})
    b = s.normalize_batch(CHANNEL_GITHUB_ACTIVITY, [2.0, 4.0])
    assert len(b) == 2
    assert b[0] < b[1]
    s.commit_session({CHANNEL_GITHUB_ACTIVITY: [4.0, 5.0]})
    s2 = ScoreCalibrationStore(file_path=tmp_store_path, max_samples=5)
    assert len(s2._channels[CHANNEL_GITHUB_ACTIVITY]) <= 5


def test_load_save_roundtrip(tmp_store_path):
    s = ScoreCalibrationStore(file_path=tmp_store_path)
    s.commit_session({CHANNEL_GITHUB_ACTIVITY: [7.0, 8.0]})
    s2 = ScoreCalibrationStore(file_path=tmp_store_path)
    assert 7.0 in s2._channels[CHANNEL_GITHUB_ACTIVITY]
    assert 8.0 in s2._channels[CHANNEL_GITHUB_ACTIVITY]


def test_all_channels_initialized(tmp_store_path):
    s = ScoreCalibrationStore(file_path=tmp_store_path)
    for ch in ALL_CHANNELS:
        assert s._channels[ch] == []
