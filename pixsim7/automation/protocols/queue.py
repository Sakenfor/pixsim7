from __future__ import annotations

from typing import Protocol


class JobQueue(Protocol):
    """Submit automation executions to a background worker.

    Today backed by ARQ (queue_task("process_automation", ..., queue_name=
    AUTOMATION_QUEUE_NAME)). Method is intentionally narrow — callers pass
    only the execution_id; the backend adapter knows the task name and queue.
    """

    async def enqueue_automation(self, execution_id: int) -> str:
        """Enqueue a process_automation job for this execution.

        Returns the task id assigned by the backend.
        """
        ...
