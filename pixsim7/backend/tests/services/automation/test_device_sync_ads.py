"""DeviceSyncService.check_device_ads() — session state machine tests.

Pins the sliding-window contract introduced alongside `ad_last_seen_at`:

- The original implementation anchored the timeout against
  `ad_session_started_at` (set once, never refreshed). Long watching streaks
  were killed at the first inter-ad gap because session_age was huge.
- The fix anchors the timeout against `ad_last_seen_at`, which is updated on
  every poll where an ad is detected.
- Back-compat: rows that pre-date the column (ad_last_seen_at IS NULL,
  ad_session_started_at NOT NULL) fall through to the started_at anchor so
  they get the original (stricter) behaviour rather than infinite tolerance.

Also pins the structured-error logging contract: a single device raising
inside the inner loop must not abort the batch and must contribute to the
`errors` counter (the previous `except Exception: pass` swallowed everything).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from pixsim7.automation.domain import DeviceStatus


pytestmark = pytest.mark.asyncio


def _device(
    *,
    name: str = "dev-1",
    adb_id: str = "emulator-5554",
    status: DeviceStatus = DeviceStatus.ONLINE,
    is_watching_ad: bool = False,
    ad_session_started_at: datetime | None = None,
    ad_last_seen_at: datetime | None = None,
    assigned_account_id: int | None = None,
    current_activity: str | None = None,
):
    """Lightweight stand-in for an AndroidDevice ORM row.

    SimpleNamespace is enough because check_device_ads() only reads/writes
    attributes — it never calls ORM methods on the row.
    """
    return SimpleNamespace(
        name=name,
        adb_id=adb_id,
        status=status,
        is_watching_ad=is_watching_ad,
        ad_session_started_at=ad_session_started_at,
        ad_last_seen_at=ad_last_seen_at,
        assigned_account_id=assigned_account_id,
        current_activity=current_activity,
    )


def _make_service(devices):
    """Build a DeviceSyncService whose DB returns the provided device list."""
    from pixsim7.automation.services.device_sync_service import DeviceSyncService

    scalars = MagicMock()
    scalars.all.return_value = list(devices)
    result = MagicMock()
    result.scalars.return_value = scalars
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()

    adb = MagicMock()
    adb.is_ad_playing = AsyncMock()

    service = DeviceSyncService(db=db, adb=adb)
    return service, db, adb


async def test_first_detection_starts_session_and_marks_busy():
    device = _device()
    service, _db, adb = _make_service([device])
    adb.is_ad_playing.return_value = (True, "com.pixverseai.pixverse/com.google.android.gms.ads.AdActivity")

    stats = await service.check_device_ads()

    assert stats == {"checked": 1, "watching_ads": 1, "in_session": 0, "cleared": 0, "errors": 0}
    assert device.status == DeviceStatus.BUSY
    assert device.is_watching_ad is True
    assert device.ad_session_started_at is not None
    assert device.ad_last_seen_at is not None
    assert device.ad_last_seen_at == device.ad_session_started_at  # equal on first poll
    assert device.current_activity.endswith("AdActivity")


async def test_sustained_streak_refreshes_last_seen_but_keeps_started_at():
    """Repeated detections refresh ad_last_seen_at but leave ad_session_started_at
    fixed — that's the start anchor; ad_last_seen_at is the sliding window."""
    started = datetime.now(timezone.utc) - timedelta(minutes=4)
    seen = started + timedelta(seconds=5)
    device = _device(
        status=DeviceStatus.BUSY,
        is_watching_ad=True,
        ad_session_started_at=started,
        ad_last_seen_at=seen,
    )
    service, _db, adb = _make_service([device])
    adb.is_ad_playing.return_value = (True, "com.unity3d.services.ads.foo")

    stats = await service.check_device_ads()

    assert stats["watching_ads"] == 1
    assert stats["cleared"] == 0
    assert device.ad_session_started_at == started  # unchanged — it's the anchor
    assert device.ad_last_seen_at > seen  # refreshed to ~now
    assert device.status == DeviceStatus.BUSY


async def test_brief_gap_after_long_streak_keeps_session_alive():
    """Regression test for the sliding-window bug.

    Before the fix: session_age was computed against ad_session_started_at, so
    a 4-minute streak followed by ANY 'no-ad' poll instantly exceeded the 60s
    window and killed the session — even with last_seen 5 seconds ago.

    After the fix: anchor is ad_last_seen_at. Within 60s of last detection,
    the device must stay BUSY.
    """
    now = datetime.now(timezone.utc)
    started = now - timedelta(minutes=4)
    seen = now - timedelta(seconds=10)  # ad seen 10s ago — well within timeout
    device = _device(
        status=DeviceStatus.BUSY,
        is_watching_ad=True,
        ad_session_started_at=started,
        ad_last_seen_at=seen,
        assigned_account_id=42,
    )
    service, _db, adb = _make_service([device])
    adb.is_ad_playing.return_value = (False, "com.pixverseai.pixverse/.MainActivity")

    stats = await service.check_device_ads()

    assert stats == {"checked": 1, "watching_ads": 0, "in_session": 1, "cleared": 0, "errors": 0}
    assert device.status == DeviceStatus.BUSY  # still BUSY — session alive
    assert device.is_watching_ad is False  # not actively watching this poll
    assert device.ad_session_started_at == started  # not cleared
    assert device.ad_last_seen_at == seen  # not refreshed (no ad this poll)
    assert device.assigned_account_id == 42  # still assigned for credit refresh


async def test_gap_exceeding_timeout_ends_session_and_refreshes_credits():
    now = datetime.now(timezone.utc)
    started = now - timedelta(minutes=10)
    seen = now - timedelta(seconds=120)  # > AD_SESSION_TIMEOUT_SECONDS (60)
    device = _device(
        status=DeviceStatus.BUSY,
        is_watching_ad=False,
        ad_session_started_at=started,
        ad_last_seen_at=seen,
        assigned_account_id=42,
    )
    service, _db, adb = _make_service([device])
    adb.is_ad_playing.return_value = (False, None)

    refresh = AsyncMock()
    with patch.object(service, "_refresh_credits_after_ads", refresh):
        stats = await service.check_device_ads()

    assert stats["cleared"] == 1
    assert stats["in_session"] == 0
    assert device.status == DeviceStatus.ONLINE
    assert device.is_watching_ad is False
    assert device.ad_session_started_at is None
    assert device.ad_last_seen_at is None
    assert device.assigned_account_id is None
    refresh.assert_awaited_once_with(42, "dev-1")


async def test_legacy_row_without_last_seen_falls_back_to_started_at():
    """Back-compat: rows written before the migration have ad_last_seen_at=NULL.

    The fallback uses ad_session_started_at as the anchor, giving these rows
    the original (stricter) behaviour. They should expire as before.
    """
    now = datetime.now(timezone.utc)
    started = now - timedelta(seconds=120)  # > 60s, no last_seen → expire
    device = _device(
        status=DeviceStatus.BUSY,
        is_watching_ad=False,
        ad_session_started_at=started,
        ad_last_seen_at=None,
        assigned_account_id=42,
    )
    service, _db, adb = _make_service([device])
    adb.is_ad_playing.return_value = (False, None)

    refresh = AsyncMock()
    with patch.object(service, "_refresh_credits_after_ads", refresh):
        stats = await service.check_device_ads()

    assert stats["cleared"] == 1
    assert device.status == DeviceStatus.ONLINE
    refresh.assert_awaited_once()


async def test_legacy_row_within_window_via_started_at_fallback():
    """Mirror of the bug-regression case for legacy rows: started recently +
    no last_seen yet should still be considered in-session within 60s."""
    now = datetime.now(timezone.utc)
    started = now - timedelta(seconds=15)  # well within timeout
    device = _device(
        status=DeviceStatus.BUSY,
        is_watching_ad=False,
        ad_session_started_at=started,
        ad_last_seen_at=None,
    )
    service, _db, adb = _make_service([device])
    adb.is_ad_playing.return_value = (False, None)

    stats = await service.check_device_ads()

    assert stats["in_session"] == 1
    assert device.status == DeviceStatus.BUSY


async def test_no_ad_no_session_clears_stale_flags():
    device = _device(
        status=DeviceStatus.ONLINE,
        is_watching_ad=True,  # stale flag
        ad_session_started_at=None,
        ad_last_seen_at=None,
    )
    service, _db, adb = _make_service([device])
    adb.is_ad_playing.return_value = (False, "com.pixverseai.pixverse/.MainActivity")

    stats = await service.check_device_ads()

    assert stats["cleared"] == 1
    assert device.is_watching_ad is False


async def test_adb_failure_on_one_device_does_not_abort_batch():
    """One device's ADB call raises — the others must still be processed,
    and the failing device must contribute to the `errors` counter (the old
    `except Exception: pass` made these failures invisible)."""
    bad = _device(name="bad", adb_id="emulator-5554")
    good = _device(name="good", adb_id="emulator-5556")
    service, _db, adb = _make_service([bad, good])

    async def fake_is_ad_playing(adb_id: str):
        if adb_id == "emulator-5554":
            raise RuntimeError("adb broken pipe")
        return (True, "com.applovin.something")

    adb.is_ad_playing.side_effect = fake_is_ad_playing

    stats = await service.check_device_ads()

    assert stats["checked"] == 2
    assert stats["errors"] == 1
    assert stats["watching_ads"] == 1
    assert good.status == DeviceStatus.BUSY
    assert good.is_watching_ad is True
    # Bad device's mutable state should be untouched by the failed branch.
    assert bad.status == DeviceStatus.ONLINE
    assert bad.is_watching_ad is False


async def test_resumed_ad_after_brief_gap_refreshes_anchor():
    """Walks the realistic sequence: long streak → brief no-ad gap → ad
    detected again. The session must remain alive throughout, and the
    sliding-window anchor must be refreshed on the resume."""
    now = datetime.now(timezone.utc)
    started = now - timedelta(minutes=3)
    seen = now - timedelta(seconds=20)
    device = _device(
        status=DeviceStatus.BUSY,
        is_watching_ad=True,
        ad_session_started_at=started,
        ad_last_seen_at=seen,
    )
    service, _db, adb = _make_service([device])
    adb.is_ad_playing.return_value = (True, "com.google.android.gms.ads.AdActivity")

    stats = await service.check_device_ads()

    assert stats["watching_ads"] == 1
    assert device.status == DeviceStatus.BUSY
    assert device.ad_session_started_at == started  # unchanged
    assert device.ad_last_seen_at > seen  # refreshed
