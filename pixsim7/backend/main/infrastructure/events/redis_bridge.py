"""
Redis-backed event bus bridge

Allows the in-process EventBus to propagate events across multiple
processes (API + workers) using Redis pub/sub.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from typing import Optional

import redis.asyncio as redis

from pixsim7.backend.main.infrastructure.events.bus import Event, event_bus
from pixsim7.backend.main.infrastructure.redis import get_redis
from pixsim7.backend.main.shared.config import settings
from pixsim_logging import configure_logging

logger = configure_logging("event_bridge")


class RedisEventBridge:
    """
    Relays EventBus events over Redis pub/sub.

    - Local publish -> Redis channel
    - Remote message -> re-publish locally without re-propagating
    """

    CHANNEL = "pixsim7:events:v1"

    def __init__(self, role: str = "process"):
        self.role = role
        self._publisher = None
        self._subscriber: Optional[redis.Redis] = None
        self._listener_task: Optional[asyncio.Task] = None
        self._origin = f"{role}:{uuid.uuid4()}"
        self._stopping = asyncio.Event()

    async def start(self):
        if self._listener_task:
            return

        try:
            self._publisher = await get_redis()

            # Dedicated connection for pub/sub listening
            self._subscriber = await redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True,
            )
            self._pubsub = self._subscriber.pubsub()
            await self._pubsub.subscribe(self.CHANNEL)

            # Register publisher hook
            event_bus.set_distributed_publisher(self._publish_remote)

            self._listener_task = asyncio.create_task(self._listen_loop())
            logger.info(
                "[EventBridge] Redis bridge started",
                extra={"role": self.role, "channel": self.CHANNEL, "origin": self._origin}
            )
        except Exception as exc:
            logger.error("[EventBridge] Failed to start Redis bridge: %s", exc, exc_info=True)
            await self.stop()
            raise

    async def stop(self):
        self._stopping.set()
        event_bus.clear_distributed_publisher(self._publish_remote)

        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
            self._listener_task = None

        if getattr(self, "_pubsub", None):
            try:
                await self._pubsub.unsubscribe(self.CHANNEL)
                await self._pubsub.close()
            except Exception:
                pass
            self._pubsub = None

        if self._subscriber:
            try:
                await self._subscriber.close()
            except Exception:
                pass
            self._subscriber = None

        self._stopping.clear()
        logger.info("[EventBridge] Redis bridge stopped", role=self.role)

    async def _publish_remote(self, event: Event):
        if not self._publisher:
            return
        payload = {
            "event_type": event.event_type,
            "data": event.data,
            "timestamp": event.timestamp.isoformat(),
            "event_id": event.event_id,
            "origin": self._origin,
        }
        data_summary = _summarize_event_data(event.event_type, event.data)
        logger.info(
            "[EventBridge] Publishing event to Redis",
            extra={
                "role": self.role,
                "channel": self.CHANNEL,
                "event_type": event.event_type,
                "event_id": event.event_id,
                "event_data_summary": data_summary,
            },
        )
        await self._publisher.publish(self.CHANNEL, json.dumps(payload))

    async def _listen_loop(self):
        try:
            async for message in self._pubsub.listen():
                if self._stopping.is_set():
                    break
                if message["type"] != "message":
                    continue

                try:
                    data = json.loads(message["data"])
                except json.JSONDecodeError:
                    logger.warning("[EventBridge] Invalid message payload: %s", message["data"])
                    continue

                if data.get("origin") == self._origin:
                    continue

                try:
                    timestamp = datetime.fromisoformat(data["timestamp"]) if data.get("timestamp") else None
                except ValueError:
                    timestamp = None

                logger.info(
                    "[EventBridge] Received event from Redis",
                    extra={
                        "role": self.role,
                        "channel": self.CHANNEL,
                        "event_type": data.get("event_type"),
                        "event_id": data.get("event_id"),
                        "origin": data.get("origin"),
                        "event_data_summary": _summarize_event_data(
                            data.get("event_type") or "",
                            data.get("data") or {},
                        ),
                    },
                )
                await event_bus.publish(
                    data.get("event_type"),
                    data.get("data") or {},
                    wait=False,
                    strict=False,
                    event_id=data.get("event_id"),
                    timestamp=timestamp,
                    propagate=False,
                )
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            if not self._stopping.is_set():
                logger.error("[EventBridge] Listener error: %s", exc, exc_info=True)


_bridge: Optional[RedisEventBridge] = None


def _summarize_event_data(event_type: str, data: dict) -> dict:
    """
    Return a compact summary of event payloads for logging.

    Avoids dumping full payloads into logs while still surfacing
    key debugging fields.
    """
    if not isinstance(data, dict):
        return {}
    if event_type == "provider:failed":
        summary = {
            "job_id": data.get("job_id"),
            "submission_id": data.get("submission_id"),
            "error": str(data.get("error"))[:200] if data.get("error") else None,
        }
        if data.get("provider_id"):
            summary["provider_id"] = data.get("provider_id")
        if data.get("operation_type"):
            summary["operation_type"] = data.get("operation_type")
        if data.get("error_type"):
            summary["error_type"] = data.get("error_type")
        if data.get("execute_params_summary"):
            summary["execute_params_summary"] = data.get("execute_params_summary")
        if data.get("payload_summary"):
            summary["payload_summary"] = data.get("payload_summary")
        return summary
    if event_type == "job:failed":
        return {
            "job_id": data.get("job_id"),
            "generation_id": data.get("generation_id"),
            "error": str(data.get("error"))[:200] if data.get("error") else None,
        }
    return {}


async def start_event_bus_bridge(role: str = "process") -> RedisEventBridge | None:
    """
    Start Redis event bridge if not already running.
    """
    global _bridge
    if _bridge:
        return _bridge

    bridge = RedisEventBridge(role=role)
    await bridge.start()
    _bridge = bridge
    return bridge


async def stop_event_bus_bridge():
    """
    Stop Redis event bridge if running.
    """
    global _bridge
    if _bridge:
        await _bridge.stop()
        _bridge = None
