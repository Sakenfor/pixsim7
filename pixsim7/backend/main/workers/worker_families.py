"""Single source of truth for the ARQ worker families.

The four families (main / retry / simulation / automation) were each declared
independently across:
  - arq_worker.py    — the WorkerSettings classes (queue, max_jobs, timeout, ...)
  - health.py        — role constants + the WORKER_ROLES tuple
  - queue_names.py   — the per-family queue strings

This module enumerates them ONCE. The role list, queue mapping and per-worker
concurrency/timeout/retry config all derive from :data:`WORKER_FAMILIES`, so
adding a fifth worker is one edit here instead of several scattered ones.

NOTE: the launcher keeps its OWN worker key/selector list
(``launcher/core/worker_detection.py``) because it runs as a separate process
and cannot import backend internals. The two registries are intentionally
distinct; this one is the backend-side source of truth.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from pixsim7.backend.main.infrastructure.queue import (
    AUTOMATION_QUEUE_NAME,
    GENERATION_FRESH_QUEUE_NAME,
    GENERATION_RETRY_QUEUE_NAME,
    MEDIA_ARCHIVE_QUEUE_NAME,
    SIMULATION_SCHEDULER_QUEUE_NAME,
)

WORKER_ROLE_MAIN = "main"
WORKER_ROLE_RETRY = "retry"
WORKER_ROLE_SIMULATION = "simulation"
WORKER_ROLE_AUTOMATION = "automation"
WORKER_ROLE_MEDIA_ARCHIVE = "media_archive"


@dataclass(frozen=True)
class WorkerFamily:
    """Static description of one ARQ worker family.

    The ``resolve_*`` helpers reproduce exactly how the WorkerSettings classes
    computed these values inline, so behaviour is unchanged — they are just read
    from one place now.
    """

    role: str
    queue_name: str
    settings_class: str  # for traceability / docs

    # Concurrency. When ``max_jobs_default`` is None the value comes from the
    # DB-persisted ``settings.arq_max_jobs`` (main/retry); otherwise it is read
    # from ``max_jobs_env`` with ``max_jobs_default`` (simulation/automation).
    max_jobs_env: Optional[str]
    max_jobs_default: Optional[int]

    job_timeout_env: str
    job_timeout_default: int

    # Retries. When ``max_tries_env`` is None the value is fixed at
    # ``max_tries_default`` (simulation/automation don't honour an env var).
    max_tries_env: Optional[str]
    max_tries_default: int
    retry_jobs: bool

    def resolve_max_jobs(self) -> int:
        if self.max_jobs_default is None:
            # DB-persisted global setting (itself env-backed via ARQ_MAX_JOBS).
            from pixsim7.backend.main.shared.config import settings
            return settings.arq_max_jobs
        return int(os.getenv(self.max_jobs_env, str(self.max_jobs_default))) \
            if self.max_jobs_env else self.max_jobs_default

    def resolve_job_timeout(self) -> int:
        return int(os.getenv(self.job_timeout_env, str(self.job_timeout_default)))

    def resolve_max_tries(self) -> int:
        if self.max_tries_env:
            return int(os.getenv(self.max_tries_env, str(self.max_tries_default)))
        return self.max_tries_default


WORKER_FAMILIES: Tuple[WorkerFamily, ...] = (
    WorkerFamily(
        role=WORKER_ROLE_MAIN,
        queue_name=GENERATION_FRESH_QUEUE_NAME,
        settings_class="WorkerSettings",
        max_jobs_env=None, max_jobs_default=None,  # settings.arq_max_jobs
        job_timeout_env="ARQ_JOB_TIMEOUT", job_timeout_default=3600,
        max_tries_env="ARQ_MAX_TRIES", max_tries_default=3,
        retry_jobs=True,
    ),
    WorkerFamily(
        role=WORKER_ROLE_RETRY,
        queue_name=GENERATION_RETRY_QUEUE_NAME,
        settings_class="GenerationRetryWorkerSettings",
        max_jobs_env=None, max_jobs_default=None,  # settings.arq_max_jobs
        job_timeout_env="ARQ_JOB_TIMEOUT", job_timeout_default=3600,
        max_tries_env="ARQ_MAX_TRIES", max_tries_default=3,
        retry_jobs=True,
    ),
    WorkerFamily(
        role=WORKER_ROLE_SIMULATION,
        queue_name=SIMULATION_SCHEDULER_QUEUE_NAME,
        settings_class="SimulationWorkerSettings",
        max_jobs_env="ARQ_SIMULATION_MAX_JOBS", max_jobs_default=2,
        job_timeout_env="ARQ_SIMULATION_JOB_TIMEOUT", job_timeout_default=120,
        max_tries_env=None, max_tries_default=1,
        retry_jobs=False,
    ),
    WorkerFamily(
        role=WORKER_ROLE_AUTOMATION,
        queue_name=AUTOMATION_QUEUE_NAME,
        settings_class="AutomationWorkerSettings",
        max_jobs_env="ARQ_AUTOMATION_MAX_JOBS", max_jobs_default=5,
        job_timeout_env="ARQ_AUTOMATION_JOB_TIMEOUT", job_timeout_default=1800,
        max_tries_env=None, max_tries_default=1,
        retry_jobs=False,
    ),
    WorkerFamily(
        role=WORKER_ROLE_MEDIA_ARCHIVE,
        queue_name=MEDIA_ARCHIVE_QUEUE_NAME,
        settings_class="MediaArchiveWorkerSettings",
        # Single slot: relocation self-paginates and we don't want parallel
        # uploads saturating the ZeroTier/MinIO link.
        max_jobs_env="ARQ_MEDIA_ARCHIVE_MAX_JOBS", max_jobs_default=1,
        # 1 h ceiling; the job self-re-enqueues well before this (~40 min budget).
        job_timeout_env="ARQ_MEDIA_ARCHIVE_JOB_TIMEOUT", job_timeout_default=3600,
        # Don't auto-retry a half-done batch — it's cursor-resumable; re-kick by hand.
        max_tries_env=None, max_tries_default=1,
        retry_jobs=False,
    ),
)

BY_ROLE: Dict[str, WorkerFamily] = {f.role: f for f in WORKER_FAMILIES}
WORKER_ROLES: Tuple[str, ...] = tuple(f.role for f in WORKER_FAMILIES)
