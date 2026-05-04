"""
Vocabulary candidate harvester (Phase 1).

Reads ``unresolved_keywords`` from parser candidate metadata and upserts
them into the ``vocabulary_candidate`` table with frequency counts and
sample contexts. No LLM calls, no review — just collection.

Designed to be called once per asset creation from a background task.
Failures are logged and swallowed so harvest never blocks the calling flow.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Iterable, Optional

from sqlalchemy import delete
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

# Quality-gate thresholds — drop terms that look like noise before they hit the table.
HARVEST_TERM_MAX_LEN = 40       # longer = prompt fragment, not vocab
HARVEST_TERM_MIN_LEN = 2        # very short tokens are usually parser slop
HARVEST_MAX_UNDERSCORES = 2     # >2 underscores = phrase fragment / proper noun
_TERM_HAS_ALPHA_RE = re.compile(r"[a-z]")

# Articles, prepositions, and quantifiers that signal a phrase fragment when
# they appear as the first underscored token (e.g. ``the_gorilla_watson``,
# ``at_the_edge``, ``every_element_contributes``).
_HARVEST_LEADING_STOPWORDS = frozenset({
    "the", "a", "an",
    "at", "of", "in", "on", "to", "by", "for", "from", "with", "into", "onto",
    "every", "each", "some", "any",
    "and", "or", "but",
    "is", "are", "was", "were",
})


def _is_harvestable_term(term: str) -> bool:
    """Coarse quality filter applied before a term enters the candidate table.

    Rejects:
      - too short / too long
      - phrase fragments with too many underscores (e.g. ``the_gorilla_watson_x``)
      - phrase fragments starting with an article/preposition (e.g. ``the_gorilla``)
      - tokens with no alphabetic characters (pure digits / punctuation)
    """
    if not term:
        return False
    if len(term) < HARVEST_TERM_MIN_LEN or len(term) > HARVEST_TERM_MAX_LEN:
        return False
    if term.count("_") > HARVEST_MAX_UNDERSCORES:
        return False
    if not _TERM_HAS_ALPHA_RE.search(term):
        return False
    # Leading stopword + underscore = phrase fragment, not vocabulary.
    head, _sep, _rest = term.partition("_")
    if _sep and head in _HARVEST_LEADING_STOPWORDS:
        return False
    return True


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
            if not _is_harvestable_term(term):
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


# ── Pruning ───────────────────────────────────────────────────────────────


# Default prune thresholds: a pending term seen fewer than 3 times AND not
# bumped in the last 30 days is almost certainly long-tail noise.
PRUNE_MAX_FREQUENCY_DEFAULT = 3
PRUNE_MIN_AGE_DAYS_DEFAULT = 30


async def prune_pending_candidates(
    db: AsyncSession,
    *,
    max_frequency: int = PRUNE_MAX_FREQUENCY_DEFAULT,
    min_age_days: int = PRUNE_MIN_AGE_DAYS_DEFAULT,
) -> int:
    """Delete low-signal pending candidates.

    Only ``pending`` rows are pruned — reviewer state on
    accepted / rejected / blocklisted rows is always preserved.

    A row is dropped iff:
        frequency < max_frequency  AND  last_seen older than min_age_days

    Returns the number of rows deleted.
    """
    cutoff = utcnow() - timedelta(days=max(0, min_age_days))
    stmt = (
        delete(VocabularyCandidate)
        .where(VocabularyCandidate.status == "pending")
        .where(VocabularyCandidate.frequency < max_frequency)
        .where(VocabularyCandidate.last_seen < cutoff)
    )
    result = await db.execute(stmt)
    await db.commit()
    deleted = int(result.rowcount or 0)
    logger.info(
        "vocabulary_prune_complete",
        deleted=deleted,
        max_frequency=max_frequency,
        min_age_days=min_age_days,
    )
    return deleted
