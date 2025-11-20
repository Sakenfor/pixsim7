"""
Queueing utilities for ARQ
"""
from typing import Any
import logging
from pixsim7.backend.main.infrastructure.redis import get_arq_pool

logger = logging.getLogger(__name__)


async def queue_task(function_name: str, *args: Any, **kwargs: Any) -> str:
    """
    Enqueue a task by function name using ARQ.

    Args:
        function_name: Name of the ARQ function registered in the worker
        *args, **kwargs: Arguments to pass to the function

    Returns:
        task_id string (ARQ job ID)
    """
    pool = await get_arq_pool()
    job = await pool.enqueue_job(function_name, *args, **kwargs)
    logger.info(f"Queued task {function_name} -> job_id={job.job_id}")
    return str(job.job_id)
