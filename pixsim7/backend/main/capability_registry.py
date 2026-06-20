"""
Capability binding registry — single source of truth for which sibling
packages get bound in which hosts.

Hosts (the running processes that need capabilities bound):
- fastapi          — main backend process / API request handlers
- main_worker      — primary arq worker (process_generation, process_analysis, ...)
- automation_worker — dedicated arq worker for automation
- retry_worker     — dedicated arq worker for generation retries

When adding a new sibling package next to pixsim7.automation / pixsim7.embedding:
  1. Add `bind_<name>_capabilities()` (and optional `shutdown_<name>_capabilities()`)
     in adapters/<name>.py.
  2. Add a CapabilityBinding entry to `all_bindings()` naming the hosts that need it.
  3. Done — host startup/shutdown calls `bind_for_host(...)` / `shutdown_for_host(...)`,
     no per-package wiring scattered through main.py / arq_worker.py.

The registry is intentionally tiny and explicit. No discovery, no convention
magic — adding a sibling means editing this file, which is the point.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Awaitable, Callable, Literal

logger = logging.getLogger(__name__)


Host = Literal["fastapi", "main_worker", "automation_worker", "retry_worker"]
HOSTS: frozenset[Host] = frozenset(
    {"fastapi", "main_worker", "automation_worker", "retry_worker"}
)


@dataclass(frozen=True, slots=True)
class CapabilityBinding:
    name: str
    binder: Callable[[], None]
    shutdown: Callable[[], Awaitable[None]] | None
    hosts: frozenset[Host]


def all_bindings() -> tuple[CapabilityBinding, ...]:
    """Authoritative list. Imports are lazy so each adapter only loads in
    hosts that need it (e.g., embedding pulls torch — don't import in fastapi).
    """
    from pixsim7.backend.main.adapters.automation import (
        bind_automation_capabilities,
    )
    from pixsim7.backend.main.adapters.embedding import (
        bind_embedding_capabilities,
        shutdown_embedding_capabilities,
    )

    return (
        CapabilityBinding(
            name="automation",
            binder=bind_automation_capabilities,
            shutdown=None,
            hosts=frozenset({"fastapi", "main_worker", "automation_worker"}),
        ),
        CapabilityBinding(
            name="embedding",
            binder=bind_embedding_capabilities,
            shutdown=shutdown_embedding_capabilities,
            # fastapi included so request-time text-embedding paths (e.g.
            # /prompts/search/similar?mode=vector, asset semantic search) can
            # reach the locator. Binding constructs the CompositeEmbeddingService
            # over an HttpEmbeddingService (image) + the host-side text-provider
            # registry (text). The image client is a plain HTTP client to the
            # embedding-daemon service — no torch import cost in any host.
            hosts=frozenset({"fastapi", "main_worker"}),
        ),
    )


def bind_for_host(host: Host) -> None:
    """Run all binders whose `hosts` includes the given host."""
    _validate_host(host)
    for binding in all_bindings():
        if host in binding.hosts:
            binding.binder()
            logger.info(
                "capability_bound capability=%s host=%s",
                binding.name,
                host,
            )


async def shutdown_for_host(host: Host) -> None:
    """Run all shutdowns whose `hosts` includes the given host. Errors logged,
    not raised — shutdown should always make progress."""
    _validate_host(host)
    for binding in all_bindings():
        if host in binding.hosts and binding.shutdown is not None:
            try:
                await binding.shutdown()
                logger.info(
                    "capability_shutdown capability=%s host=%s",
                    binding.name,
                    host,
                )
            except Exception as exc:  # noqa: BLE001 — keep shutdown moving
                logger.warning(
                    "capability_shutdown_error capability=%s host=%s error=%s",
                    binding.name,
                    host,
                    str(exc),
                )


def _validate_host(host: str) -> None:
    if host not in HOSTS:
        raise ValueError(
            f"unknown host {host!r}; expected one of {sorted(HOSTS)}"
        )
