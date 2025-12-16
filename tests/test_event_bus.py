import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pixsim7.backend.main.infrastructure.events.bus import EventBus


@pytest.mark.asyncio
async def test_event_bus_distributed_publish_can_be_suppressed():
    bus = EventBus()
    distributed_calls = []

    async def fake_distributed(event):
        distributed_calls.append(event.event_type)

    bus.set_distributed_publisher(fake_distributed)

    received = asyncio.Event()

    async def handler(event):
        received.set()

    bus.subscribe("unit:test", handler)

    await bus.publish("unit:test", {"ok": True}, propagate=False)
    await asyncio.wait_for(received.wait(), timeout=1)
    assert distributed_calls == []

    bus.clear()
