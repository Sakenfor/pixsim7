"""
Vocabulary candidate harvester (Phase 1).

Reads ``unresolved_keywords`` from parser candidate metadata and upserts
them into the ``vocabulary_candidate`` table with frequency counts and
sample contexts. No LLM calls, no review — just collection.

Designed to be called once per asset creation from a background task.
Failures are logged and swallowed so harvest never blocks the calling flow.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from pixsim7.backend.main.domain.prompt.vocabulary_candidate import VocabularyCandidate
from pixsim7.backend.main.infrastructure.database.session import get_async_session
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim_logging import get_logger

logger = get_logger()

# Per-term limits to prevent the table growing unbounded
SAMPLE_CONTEXT_LIMIT = 5
SAMPLE_CONTEXT_MAX_LEN = 240
TERM_MAX_LEN = 128


def _extract_unresolved(candidates: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Group unresolved keywords by term, capturing role + sample contexts.

    Returns mapping ``term -> {role, contexts}`` where ``contexts`` is a list
    of sample sentences truncated to a reasonable length.
    """
    out: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        metadata = candidate.get("metadata") or {}
        unresolved = metadata.get("unresolved_keywords") if isinstance(metadata, dict) else None
        if not isinstance(unresolved, list):
            continue
        text = candidate.get("text") or ""
        role = candidate.get("role")
        snippet = text.strip()[:SAMPLE_CONTEXT_MAX_LEN] if isinstance(text, str) else None
        for kw in unresolved:
            if not isinstance(kw, str):
                continue
            term = kw.strip().lower()[:TERM_MAX_LEN]
            if not term:
                continue
            entry = out.setdefault(term, {"role": role, "contexts": []})
            if snippet and len(entry["contexts"]) < SAMPLE_CONTEXT_LIMIT:
                if snippet not in entry["contexts"]:
                    entry["contexts"].append(snippet)
    return out


async def harvest_from_candidates(
    candidates: Iterable[dict[str, Any]],
) -> int:
    """Upsert vocabulary candidates from a parsed prompt's candidates list.

    Always opens its own session so a harvest failure can't poison the
    caller's transaction (asyncpg taints the session on any unhandled
    error, including missing tables; that previously aborted the
    surrounding asset-creation flow and dropped its ASSET_CREATED publish).

    Returns the number of unique unresolved terms processed (for telemetry).
    Errors are logged and swallowed.
    """
    grouped = _extract_unresolved(candidates)
    if not grouped:
        return 0

    try:
        async with get_async_session() as db:
            now = utcnow()
            for term, info in grouped.items():
                await _upsert_term(db, term, info["role"], info["contexts"], now)
            await db.commit()
        return len(grouped)
    except Exception as exc:
        logger.warning("vocabulary_harvest_failed", error=str(exc))
        return 0


async def _upsert_term(
    db: AsyncSession,
    term: str,
    inferred_role: Optional[str],
    new_contexts: list[str],
    now: datetime,
) -> None:
    """Upsert a single term — increment frequency, append sample contexts."""
    existing_stmt = select(VocabularyCandidate).where(VocabularyCandidate.term == term)
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()

    if existing is None:
        row = VocabularyCandidate(
            term=term,
            inferred_role=inferred_role,
            frequency=1,
            first_seen=now,
            last_seen=now,
            sample_contexts=list(new_contexts[:SAMPLE_CONTEXT_LIMIT]),
            status="pending",
        )
        db.add(row)
        return

    # Skip frequency bump for already-reviewed candidates so reviewer state
    # isn't accidentally overwritten by a later harvest pass.
    if existing.status in {"accepted", "rejected", "blocklisted"}:
        return

    existing.frequency = (existing.frequency or 0) + 1
    existing.last_seen = now
    if inferred_role and not existing.inferred_role:
        existing.inferred_role = inferred_role

    contexts = list(existing.sample_contexts or [])
    for ctx in new_contexts:
        if ctx not in contexts and len(contexts) < SAMPLE_CONTEXT_LIMIT:
            contexts.append(ctx)
    existing.sample_contexts = contexts
