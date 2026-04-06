"""
Persistent score calibration: empirical rank in pooled samples (online search only).

Channels are updated only from IntegratedRepoSearch flows that call commit_session.
"""

from __future__ import annotations

import bisect
import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

CHANNEL_GITHUB_ACTIVITY = "github_activity_a_raw"
CHANNEL_GITHUB_DEMAND = "github_demand_d_raw"
CHANNEL_OPENDIGGER_ACTIVITY = "opendigger_activity_raw"
CHANNEL_OPENDIGGER_DEMAND = "opendigger_demand_raw"

ALL_CHANNELS = (
    CHANNEL_GITHUB_ACTIVITY,
    CHANNEL_GITHUB_DEMAND,
    CHANNEL_OPENDIGGER_ACTIVITY,
    CHANNEL_OPENDIGGER_DEMAND,
)

_DEFAULT_MAX_SAMPLES = 2500


def default_calibration_path() -> Path:
    return (
        Path(__file__).resolve().parent.parent / "data" / "runtime_cache" / "score_calibration.json"
    )


def _rank_score_sorted(value: float, sorted_pool: List[float]) -> float:
    n = len(sorted_pool)
    if n == 0:
        return 0.0
    lo = bisect.bisect_left(sorted_pool, value)
    hi = bisect.bisect_right(sorted_pool, value)
    mid_rank = lo + 0.5 * (hi - lo)
    return (mid_rank + 0.5) / (n + 1)


class ScoreCalibrationStore:
    def __init__(self, file_path: Optional[Path] = None, max_samples: int = _DEFAULT_MAX_SAMPLES):
        self._path = Path(file_path) if file_path is not None else default_calibration_path()
        self._max_samples = max_samples
        self._channels: Dict[str, List[float]] = {c: [] for c in ALL_CHANNELS}
        self._lock = threading.Lock()
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            with open(self._path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if not isinstance(data, dict):
                return
            ch = data.get("channels")
            if not isinstance(ch, dict):
                return
            for name in ALL_CHANNELS:
                raw = ch.get(name)
                if isinstance(raw, list):
                    vals = [float(x) for x in raw if isinstance(x, (int, float))]
                    self._channels[name] = vals[-self._max_samples :]
        except Exception:
            logger.warning("Failed to load score calibration store", exc_info=True)

    def _save_unlocked(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": 1,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "channels": {k: list(self._channels[k]) for k in ALL_CHANNELS},
        }
        tmp = self._path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        tmp.replace(self._path)

    def normalize_batch(self, channel: str, session_values: List[float]) -> List[float]:
        if channel not in ALL_CHANNELS:
            raise ValueError(f"unknown channel: {channel}")
        if not session_values:
            return []
        with self._lock:
            persisted = list(self._channels[channel])
        combined = persisted + list(session_values)
        sorted_c = sorted(combined)
        out: List[float] = []
        for v in session_values:
            if v <= 0.0:
                out.append(0.0)
            else:
                out.append(_rank_score_sorted(v, sorted_c))
        return out

    def normalize_single(self, channel: str, value: float) -> float:
        if channel not in ALL_CHANNELS:
            raise ValueError(f"unknown channel: {channel}")
        if value <= 0.0:
            return 0.0
        with self._lock:
            persisted = list(self._channels[channel])
        combined = persisted + [value]
        sorted_c = sorted(combined)
        return _rank_score_sorted(value, sorted_c)

    def commit_session(self, channel_values: Dict[str, List[float]]) -> None:
        """Append samples from one online search and persist (ring buffer per channel)."""
        with self._lock:
            for ch, vals in channel_values.items():
                if ch not in ALL_CHANNELS or not vals:
                    continue
                self._channels[ch].extend(float(v) for v in vals)
                if len(self._channels[ch]) > self._max_samples:
                    self._channels[ch] = self._channels[ch][-self._max_samples :]
            try:
                self._save_unlocked()
            except Exception:
                logger.warning("Failed to persist score calibration store", exc_info=True)


_global_store: Optional[ScoreCalibrationStore] = None
_global_lock = threading.Lock()


def get_calibration_store(
    file_path: Optional[Path] = None,
    max_samples: int = _DEFAULT_MAX_SAMPLES,
) -> ScoreCalibrationStore:
    global _global_store
    with _global_lock:
        if _global_store is None:
            _global_store = ScoreCalibrationStore(file_path=file_path, max_samples=max_samples)
        return _global_store


def reset_calibration_store_for_tests() -> None:
    global _global_store
    with _global_lock:
        _global_store = None
