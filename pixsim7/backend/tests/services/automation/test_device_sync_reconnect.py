"""DeviceSyncService.reconnect_known_devices() — substrate-keepalive cron tests.

Pins the contract for the cron that replaced the launcher's adb-keeper service:

- The source of truth for which TCP emulators to keep connected is
  ``AndroidDevice.instance_port`` (the same column ``scan_and_sync`` reads).
- Only ``connection_method=ADB`` rows with a non-null ``instance_port`` are
  targeted — remote-agent and serial-id devices are skipped.
- ``adb connect`` failures (emulator off, port blocked) count as failed
  attempts but do NOT abort the batch.
- Status fields are NOT mutated — that's ``scan_and_sync``'s job. This is a
  pure substrate-reconnect cycle.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from pixsim7.automation.domain import ConnectionMethod, DeviceStatus


pytestmark = pytest.mark.asyncio


def _device(
    *,
    name: str = "dev-1",
    instance_port: int | None = 5555,
    connection_method: ConnectionMethod = ConnectionMethod.ADB,
    status: DeviceStatus = DeviceStatus.ONLINE,
):
    """SimpleNamespace stand-in — reconnect_known_devices only reads attributes."""
    return SimpleNamespace(
        name=name,
        instance_port=instance_port,
        connection_method=connection_method,
        status=status,
    )


def _make_service(devices):
    from pixsim7.automation.services.device_sync_service import DeviceSyncService

    scalars = MagicMock()
    scalars.all.return_value = list(devices)
    result = MagicMock()
    result.scalars.return_value = scalars
    db = MagicMock()
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()

    adb = MagicMock()
    adb.connect = AsyncMock()

    service = DeviceSyncService(db=db, adb=adb)
    return service, db, adb


async def test_reconnects_each_known_port():
    devices = [
        _device(name="mumu-0", instance_port=16384),
        _device(name="mumu-1", instance_port=16416),
        _device(name="bluestacks", instance_port=5555),
    ]
    service, _db, adb = _make_service(devices)
    adb.connect.return_value = True

    stats = await service.reconnect_known_devices()

    assert stats == {"attempted": 3, "reconnected": 3, "failed": 0}
    # Verify each port was attempted at 127.0.0.1
    attempted = {call.args[0] for call in adb.connect.await_args_list}
    assert attempted == {"127.0.0.1:16384", "127.0.0.1:16416", "127.0.0.1:5555"}


async def test_failed_connect_counts_but_does_not_abort():
    """An emulator that's off (adb connect returns False) is counted as
    failed but the loop continues."""
    devices = [
        _device(name="on", instance_port=5555),
        _device(name="off", instance_port=5557),
        _device(name="on-too", instance_port=5559),
    ]
    service, _db, adb = _make_service(devices)

    async def fake_connect(host_port: str) -> bool:
        return host_port != "127.0.0.1:5557"  # 5557 is "off"

    adb.connect.side_effect = fake_connect

    stats = await service.reconnect_known_devices()

    assert stats == {"attempted": 3, "reconnected": 2, "failed": 1}


async def test_adb_exception_isolates_to_one_device():
    """An adb.connect that raises mid-batch must not poison the rest —
    counted as failed, logged, batch continues."""
    devices = [
        _device(name="ok", instance_port=5555),
        _device(name="boom", instance_port=5557),
        _device(name="also-ok", instance_port=5559),
    ]
    service, _db, adb = _make_service(devices)

    async def fake_connect(host_port: str) -> bool:
        if host_port == "127.0.0.1:5557":
            raise RuntimeError("adb broken pipe")
        return True

    adb.connect.side_effect = fake_connect

    stats = await service.reconnect_known_devices()

    assert stats == {"attempted": 3, "reconnected": 2, "failed": 1}


async def test_no_devices_returns_zeroes():
    service, _db, adb = _make_service([])

    stats = await service.reconnect_known_devices()

    assert stats == {"attempted": 0, "reconnected": 0, "failed": 0}
    adb.connect.assert_not_called()


async def test_does_not_mutate_device_status():
    """Substrate-keepalive must not touch status / online-offline state.
    That's scan_and_sync's job."""
    devices = [
        _device(name="busy", instance_port=5555, status=DeviceStatus.BUSY),
        _device(name="online", instance_port=5557, status=DeviceStatus.ONLINE),
    ]
    service, _db, adb = _make_service(devices)
    adb.connect.return_value = False  # nothing reconnects

    await service.reconnect_known_devices()

    # Status preserved despite "failed" connects.
    assert devices[0].status == DeviceStatus.BUSY
    assert devices[1].status == DeviceStatus.ONLINE
