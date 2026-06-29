import time

from fastapi import FastAPI
from fastapi.testclient import TestClient

from launcher.api.dependencies import get_event_bus
from launcher.api.routes import events as events_route
from launcher.core.event_bus import EventBus


def test_websocket_disconnect_unsubscribes_from_event_bus():
    bus = EventBus()
    app = FastAPI()
    app.dependency_overrides[get_event_bus] = lambda: bus
    app.include_router(events_route.router)

    events_route._active_connections.clear()

    with TestClient(app) as client:
        assert client.get("/events/stats").json()["subscriber_count"] == 0

        with client.websocket_connect("/events/ws"):
            stats = client.get("/events/stats").json()
            assert stats["subscriber_count"] == 1
            assert stats["active_websocket_connections"] == 1

        for _ in range(20):
            stats = client.get("/events/stats").json()
            if stats["subscriber_count"] == 0 and stats["active_websocket_connections"] == 0:
                break
            time.sleep(0.05)

        assert stats["subscriber_count"] == 0
        assert stats["active_websocket_connections"] == 0

    events_route._active_connections.clear()
