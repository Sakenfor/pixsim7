"""Tests for the shared analyzer observability hooks."""

import logging

import pytest

from pixsim7.backend.main.services.analysis.observability import (
    AnalyzerRunMetrics,
    analyzer_timer,
    log_analyzer_run,
)
from pixsim7.backend.main.services.analysis.result_envelope import AnalyzerProvenance


# ---------------------------------------------------------------------------
# log_analyzer_run
# ---------------------------------------------------------------------------


class TestLogAnalyzerRun:
    def test_success_logs_info(self, caplog):
        prov = AnalyzerProvenance(
            analyzer_id="prompt:simple",
            provider_id=None,
            model_id=None,
            duration_ms=15.0,
            fallback_used=False,
            fallback_depth=0,
        )

        with caplog.at_level(logging.INFO, logger="pixsim7.analyzers"):
            log_analyzer_run(prov, path="prompt", success=True, candidate_count=1)

        assert len(caplog.records) == 1
        assert "analyzer_run" in caplog.records[0].message
        assert "'path': 'prompt'" in caplog.records[0].message

    def test_failure_logs_warning(self, caplog):
        prov = AnalyzerProvenance(
            analyzer_id="unknown",
            error_category="auth",
            fallback_used=False,
            fallback_depth=0,
        )

        with caplog.at_level(logging.WARNING, logger="pixsim7.analyzers"):
            log_analyzer_run(prov, path="asset", success=False, candidate_count=2)

        assert len(caplog.records) == 1
        assert "analyzer_run_failed" in caplog.records[0].message

    def test_extra_fields_merged(self, caplog):
        prov = AnalyzerProvenance(analyzer_id="img:clip", fallback_used=False, fallback_depth=0)

        with caplog.at_level(logging.INFO, logger="pixsim7.analyzers"):
            log_analyzer_run(
                prov,
                path="asset",
                success=True,
                extra={"analysis_id": 42, "asset_id": 7},
            )

        assert "'analysis_id': 42" in caplog.records[0].message

    def test_empty_result_flag(self, caplog):
        prov = AnalyzerProvenance(analyzer_id="prompt:simple", fallback_used=False, fallback_depth=0)

        with caplog.at_level(logging.INFO, logger="pixsim7.analyzers"):
            log_analyzer_run(prov, path="prompt", success=True, empty_result=True)

        assert "'empty_result': True" in caplog.records[0].message


# ---------------------------------------------------------------------------
# analyzer_timer
# ---------------------------------------------------------------------------


class TestAnalyzerTimer:
    @pytest.mark.asyncio
    async def test_timer_measures_duration(self):
        async with analyzer_timer() as t:
            pass  # near-instant

        assert t.duration_ms is not None
        assert t.duration_ms >= 0

    @pytest.mark.asyncio
    async def test_timer_captures_nonzero_for_work(self):
        import asyncio

        async with analyzer_timer() as t:
            await asyncio.sleep(0.01)

        assert t.duration_ms is not None
        assert t.duration_ms >= 5  # at least ~10ms of sleep


# ---------------------------------------------------------------------------
# AnalyzerRunMetrics dataclass
# ---------------------------------------------------------------------------


class TestAnalyzerRunMetrics:
    def test_defaults(self):
        m = AnalyzerRunMetrics(path="prompt", analyzer_id="prompt:simple")

        assert m.success is False
        assert m.fallback_used is False
        assert m.duration_ms is None
        assert m.empty_result is False
