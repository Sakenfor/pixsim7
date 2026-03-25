"""
GenerationStepExecutor - Submit a generation and await its completion.

Reusable atom for sequential execution patterns. This is the missing primitive
that bridges fire-and-forget generation submission with synchronous "wait for
result" semantics needed by:

- Sequential "Each" mode (run inputs one-by-one, pipe results)
- GenerationChain executor (multi-step template chains)
- gen_step node handler (graph/narrative executor)
- NarrativeRuntimeEngine (mid-story generation)

Uses the in-process EventBus (job:completed / job:failed) for fast notification,
with a polling fallback via GenerationQueryService for resilience.

Design note: This service does NOT know about chains, templates, graphs, or
combination strategies. It only does: submit one generation → wait → return result.
Callers own the orchestration logic above it.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import (
    Generation,
    GenerationStatus,
    OperationType,
    User,
)
from pixsim7.backend.main.infrastructure.events.bus import Event, EventBus, event_bus
from pixsim7.backend.main.services.generation.events import (
    JOB_COMPLETED,
    JOB_FAILED,
    JOB_CANCELLED,
)
from pixsim7.backend.main.services.generation.creation import GenerationCreationService
from pixsim7.backend.main.services.generation.query import GenerationQueryService

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class StepResult:
    """Outcome of a single generation step."""

    generation_id: int
    status: GenerationStatus
    asset_id: Optional[int] = None
    error_message: Optional[str] = None
    error_code: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None


class StepTimeoutError(Exception):
    """Raised when a step exceeds the configured timeout."""

    def __init__(self, generation_id: int, timeout: float):
        self.generation_id = generation_id
        self.timeout = timeout
        super().__init__(
            f"Generation {generation_id} did not complete within {timeout}s"
        )


class StepFailedError(Exception):
    """Raised when a step terminates with a non-recoverable failure."""

    def __init__(self, result: StepResult):
        self.result = result
        super().__init__(
            f"Generation {result.generation_id} failed: {result.error_message}"
        )


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class GenerationStepExecutor:
    """
    Submit a generation and await its completion.

    Subscribes to EventBus ``job:completed`` / ``job:failed`` for fast
    notification. Falls back to polling ``GenerationQueryService`` every
    ``poll_interval`` seconds as a safety net (events are in-memory and
    could be missed if the generation completes in a different worker
    process).

    Usage::

        executor = GenerationStepExecutor(db, creation_service, query_service)
        result = await executor.execute_step(
            user=user,
            operation_type=OperationType.TXT2IMG,
            provider_id="pixverse",
            params={...},
        )
        print(result.asset_id)  # result from completed generation
    """

    def __init__(
        self,
        db: AsyncSession,
        creation_service: GenerationCreationService,
        query_service: GenerationQueryService,
        *,
        bus: EventBus | None = None,
    ):
        self.db = db
        self._creation = creation_service
        self._query = query_service
        self._bus = bus or event_bus

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def execute_step(
        self,
        user: User,
        operation_type: OperationType,
        provider_id: str,
        params: Dict[str, Any],
        *,
        workspace_id: Optional[int] = None,
        parent_generation_id: Optional[int] = None,
        preferred_account_id: Optional[int] = None,
        force_new: bool = False,
        poll_interval: float = 3.0,
        timeout: float = 600.0,
        creation_kwargs: Optional[Dict[str, Any]] = None,
    ) -> StepResult:
        """
        Submit a generation request and block until it reaches a terminal
        status (COMPLETED, FAILED, or CANCELLED).

        Args:
            user: Authenticated user.
            operation_type: e.g. OperationType.TXT2IMG.
            provider_id: Provider identifier string.
            params: Generation parameters dict.
            workspace_id: Optional workspace scope.
            parent_generation_id: Link to parent generation (for chains).
            preferred_account_id: Preferred provider account.
            force_new: Skip dedup cache.
            poll_interval: Seconds between fallback polls. Default 3s.
            timeout: Max seconds to wait. Default 600s (10 min).
            creation_kwargs: Extra kwargs forwarded to create_generation.

        Returns:
            StepResult with terminal status, asset_id (if completed), and
            error details (if failed).

        Raises:
            StepTimeoutError: If timeout is exceeded.
        """
        # 1. Submit generation
        extra = creation_kwargs or {}
        generation = await self._creation.create_generation(
            user=user,
            operation_type=operation_type,
            provider_id=provider_id,
            params=params,
            workspace_id=workspace_id,
            parent_generation_id=parent_generation_id,
            preferred_account_id=preferred_account_id,
            force_new=force_new,
            **extra,
        )

        generation_id = generation.id
        logger.info(
            "step_executor.submitted",
            extra={"generation_id": generation_id, "operation": operation_type.value},
        )

        # 2. If already terminal (e.g. cache hit returned completed gen), return immediately
        if generation.status in _TERMINAL_STATUSES:
            return self._to_result(generation)

        # 3. Await completion via event + polling
        return await self._await_completion(
            generation_id=generation_id,
            poll_interval=poll_interval,
            timeout=timeout,
        )

    # ------------------------------------------------------------------
    # Completion awaiter
    # ------------------------------------------------------------------

    async def _await_completion(
        self,
        generation_id: int,
        poll_interval: float,
        timeout: float,
    ) -> StepResult:
        """
        Wait for a generation to reach a terminal status.

        Strategy: register an EventBus listener for fast notification AND
        run a slow polling loop as a fallback. Whichever fires first wins.
        """
        completion_event: asyncio.Event = asyncio.Event()
        captured_event_data: Dict[str, Any] = {}

        # --- Event listener -------------------------------------------

        async def _on_terminal(event: Event) -> None:
            if event.data.get("generation_id") == generation_id:
                captured_event_data.update(event.data)
                completion_event.set()

        self._bus.subscribe(JOB_COMPLETED, _on_terminal)
        self._bus.subscribe(JOB_FAILED, _on_terminal)
        self._bus.subscribe(JOB_CANCELLED, _on_terminal)

        try:
            result = await asyncio.wait_for(
                self._race_event_and_poll(
                    generation_id, completion_event, poll_interval
                ),
                timeout=timeout,
            )
            return result

        except asyncio.TimeoutError:
            raise StepTimeoutError(generation_id, timeout)

        finally:
            # Always clean up listeners
            self._bus.unsubscribe(JOB_COMPLETED, _on_terminal)
            self._bus.unsubscribe(JOB_FAILED, _on_terminal)
            self._bus.unsubscribe(JOB_CANCELLED, _on_terminal)

    async def _race_event_and_poll(
        self,
        generation_id: int,
        completion_event: asyncio.Event,
        poll_interval: float,
    ) -> StepResult:
        """
        Race two strategies: EventBus notification (fast) and DB polling
        (resilient). Return as soon as either detects a terminal status.
        """
        while True:
            # Wait for either the event or the next poll tick
            try:
                await asyncio.wait_for(
                    completion_event.wait(), timeout=poll_interval
                )
            except asyncio.TimeoutError:
                pass  # poll tick — fall through to DB check

            # Check DB for terminal status (covers both event-triggered
            # and poll-triggered wakeups)
            generation = await self._query.get_generation(generation_id)

            if generation.status in _TERMINAL_STATUSES:
                logger.info(
                    "step_executor.completed",
                    extra={
                        "generation_id": generation_id,
                        "status": generation.status.value,
                        "asset_id": generation.asset_id,
                    },
                )
                return self._to_result(generation)

            # Event fired but status not yet terminal (race with DB commit) —
            # clear and loop again
            if completion_event.is_set():
                completion_event.clear()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _to_result(generation: Generation) -> StepResult:
        duration = None
        if generation.started_at and generation.completed_at:
            duration = (generation.completed_at - generation.started_at).total_seconds()

        return StepResult(
            generation_id=generation.id,
            status=generation.status,
            asset_id=generation.asset_id,
            error_message=generation.error_message,
            error_code=getattr(generation, "error_code", None),
            started_at=generation.started_at,
            completed_at=generation.completed_at,
            duration_seconds=duration,
        )


_TERMINAL_STATUSES = frozenset({
    GenerationStatus.COMPLETED,
    GenerationStatus.FAILED,
    GenerationStatus.CANCELLED,
})
