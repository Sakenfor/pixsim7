"""Tests for the Closed-Loop Primitive Evaluator."""

from __future__ import annotations

import math
from types import SimpleNamespace
from uuid import uuid4

import pytest

from pixsim7.backend.main.services.prompt.block.evaluator import (
    PrimitiveEvaluatorService,
    _wilson_lower_bound,
)


def test_wilson_lower_bound_zero_total():
    """Zero samples yields zero confidence."""
    assert _wilson_lower_bound(0, 0) == 0.0


def test_wilson_lower_bound_all_success():
    """All successes still yields < 1.0 confidence for small samples."""
    result = _wilson_lower_bound(5, 5)
    assert 0.0 < result < 1.0


def test_wilson_lower_bound_no_success():
    """Zero successes yields 0.0 confidence."""
    result = _wilson_lower_bound(0, 10)
    assert result == 0.0


def test_wilson_lower_bound_increases_with_samples():
    """Confidence increases as sample count grows (fixed rate)."""
    small = _wilson_lower_bound(5, 10)
    large = _wilson_lower_bound(50, 100)
    assert large > small


def test_wilson_lower_bound_half_rate():
    """50% success rate at various sample sizes."""
    result_10 = _wilson_lower_bound(5, 10)
    result_100 = _wilson_lower_bound(50, 100)
    result_1000 = _wilson_lower_bound(500, 1000)
    # All should be below 0.5 (lower bound of 50% rate)
    assert result_10 < 0.5
    assert result_100 < 0.5
    assert result_1000 < 0.5
    # But converging toward 0.5
    assert result_1000 > result_100 > result_10


def test_wilson_lower_bound_high_rate_small_sample():
    """High rate + small sample = modest confidence."""
    result = _wilson_lower_bound(9, 10)
    assert 0.5 < result < 1.0
