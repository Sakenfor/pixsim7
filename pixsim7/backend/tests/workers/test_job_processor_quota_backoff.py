from __future__ import annotations

from types import SimpleNamespace

from pixsim7.backend.main.workers import job_processor


def _generation(attempt_id: int | None) -> SimpleNamespace:
    return SimpleNamespace(attempt_id=attempt_id)


def test_quota_rotation_defer_omitted_before_threshold(monkeypatch) -> None:
    values = {
        "quota_rotation_defer_after_attempts": 8,
        "quota_rotation_defer_step_attempts": 4,
        "quota_rotation_base_defer_seconds": 3,
        "quota_rotation_max_defer_seconds": 30,
    }

    def _fake_settings_int(name: str, default: int, minimum: int | None = None) -> int:
        value = int(values.get(name, default))
        if minimum is not None:
            value = max(minimum, value)
        return value

    monkeypatch.setattr(job_processor, "_settings_int", _fake_settings_int)

    assert job_processor._quota_rotation_requeue_defer_seconds(_generation(0)) is None
    assert job_processor._quota_rotation_requeue_defer_seconds(_generation(7)) is None


def test_quota_rotation_defer_scales_by_attempt_steps(monkeypatch) -> None:
    values = {
        "quota_rotation_defer_after_attempts": 8,
        "quota_rotation_defer_step_attempts": 4,
        "quota_rotation_base_defer_seconds": 3,
        "quota_rotation_max_defer_seconds": 30,
    }

    def _fake_settings_int(name: str, default: int, minimum: int | None = None) -> int:
        value = int(values.get(name, default))
        if minimum is not None:
            value = max(minimum, value)
        return value

    monkeypatch.setattr(job_processor, "_settings_int", _fake_settings_int)

    assert job_processor._quota_rotation_requeue_defer_seconds(_generation(8)) == 3
    assert job_processor._quota_rotation_requeue_defer_seconds(_generation(11)) == 3
    assert job_processor._quota_rotation_requeue_defer_seconds(_generation(12)) == 6
    assert job_processor._quota_rotation_requeue_defer_seconds(_generation(16)) == 9


def test_quota_rotation_defer_caps_at_max(monkeypatch) -> None:
    values = {
        "quota_rotation_defer_after_attempts": 5,
        "quota_rotation_defer_step_attempts": 2,
        "quota_rotation_base_defer_seconds": 4,
        "quota_rotation_max_defer_seconds": 12,
    }

    def _fake_settings_int(name: str, default: int, minimum: int | None = None) -> int:
        value = int(values.get(name, default))
        if minimum is not None:
            value = max(minimum, value)
        return value

    monkeypatch.setattr(job_processor, "_settings_int", _fake_settings_int)

    assert job_processor._quota_rotation_requeue_defer_seconds(_generation(5)) == 4
    assert job_processor._quota_rotation_requeue_defer_seconds(_generation(7)) == 8
    assert job_processor._quota_rotation_requeue_defer_seconds(_generation(9)) == 12
    assert job_processor._quota_rotation_requeue_defer_seconds(_generation(99)) == 12
