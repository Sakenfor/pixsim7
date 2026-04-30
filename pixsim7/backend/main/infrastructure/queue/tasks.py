"""
Queueing utilities for ARQ
"""
from typing import Any
import logging
from arq.jobs import Job
from pixsim7.backend.main.infrastructure.redis import get_arq_pool

logger = logging.getLogger(__name__)


async def queue_task(function_name: str, *args: Any, queue_name: str | None = None, **kwargs: Any) -> str:
    """
    Enqueue a task by function name using ARQ.

    Args:
        function_name: Name of the ARQ function registered in the worker
        *args, **kwargs: Arguments to pass to the function
        queue_name: Optional ARQ queue name override (e.g. AUTOMATION_QUEUE_NAME).
                    Defaults to the pool's configured queue (GENERATION_FRESH_QUEUE_NAME).

    Returns:
        task_id string (ARQ job ID)
    """
    pool = await get_arq_pool()
    if queue_name:
        job = await pool.enqueue_job(function_name, *args, _queue_name=queue_name, **kwargs)
    else:
        job = await pool.enqueue_job(function_name, *args, **kwargs)
    logger.info(f"Queued task {function_name} -> job_id={job.job_id}")
    return str(job.job_id)


async def queue_and_wait(
    function_name: str,
    *args: Any,
    job_id: str,
    timeout: float = 120.0,
    queue_name: str | None = None,
    **kwargs: Any,
) -> Any:
    """
    Enqueue a deduplicated job and wait for its result.

    If a job with ``job_id`` is already queued or in progress, attaches to
    that job's result instead of starting a new one — the caller transparently
    receives the in-flight job's outcome.  This is the pattern API endpoints
    use to coordinate with background workers without re-running work or
    racing on shared state.

    Args:
        function_name: Name of the ARQ function registered in the worker
        *args, **kwargs: Arguments forwarded to the function (only used on
            first enqueue; if a job with this id already exists, ``kwargs``
            are ignored — the existing job's params are honored).
        job_id: Deterministic job id used for ARQ's dedup (e.g.
            ``f"ingest:{asset_id}"``).
        timeout: Seconds to wait for the result before raising
            ``asyncio.TimeoutError``.
        queue_name: Optional ARQ queue override.

    Returns:
        The job's return value.

    Raises:
        asyncio.TimeoutError: if the result is not available within ``timeout``.
        Exception: re-raises whatever the job raised.
    """
    pool = await get_arq_pool()
    if queue_name:
        job = await pool.enqueue_job(
            function_name, *args, _job_id=job_id, _queue_name=queue_name, **kwargs,
        )
    else:
        job = await pool.enqueue_job(
            function_name, *args, _job_id=job_id, **kwargs,
        )

    if job is None:
        # Dedup hit — a job with this id is already queued/running.
        # Attach to it and wait for the same result.
        job = Job(job_id, pool)
        logger.info(f"Attached to in-flight task {function_name} job_id={job_id}")
    else:
        logger.info(f"Queued task {function_name} -> job_id={job.job_id} (waiting for result)")

    return await job.result(timeout=timeout)
