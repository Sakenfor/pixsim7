"""LLM-driven vocabulary candidate proposer (Phase 2).

Reads pending VocabularyCandidate rows harvested by `vocabulary_harvester`
and asks the LLM to propose a `namespace:value` ontology mapping for each.
Only suggests; humans accept/reject via the dev panel.

Workflow:
    1. fetch_pending_batch(db, limit, min_frequency) → rows that have been
       seen often enough to be worth proposing for.
    2. propose_for_batch(db, rows) → calls AiHubService once with all rows,
       parses the JSON response, writes proposed_tag back per row, marks
       status="proposed".

Failures (LLM unavailable, JSON malformed) are logged and the affected rows
stay at status="pending" so a later propose pass can retry.
"""
from __future__ import annotations

import json
import re
from datetime import datetime
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from pixsim7.backend.main.domain.prompt.vocabulary_candidate import VocabularyCandidate
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim_logging import get_logger

logger = get_logger()

# Namespaces the LLM is allowed to propose into. Match the prefixes the
# parser/auto-deriver actually consume — emitting a tag in some other
# namespace would never be picked up by match_keywords downstream.
SUGGESTED_NAMESPACES: List[str] = [
    "mood",
    "location",
    "camera",
    "pose",
    "color",
    "light",
    "aesthetic_preset",
    "rendering_technique",
    "form_language",
    "environment",
    "spatial",
    "wardrobe",
    "anatomy",
    "species",
    "rating",
    "motion",
    "continuity",
    "part",
]

_TAG_RE = re.compile(r"^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$")

DEFAULT_BATCH_LIMIT = 25
DEFAULT_MIN_FREQUENCY = 3


def _build_system_prompt() -> str:
    namespaces = "\n".join(f"  - {ns}" for ns in SUGGESTED_NAMESPACES)
    return (
        "You are mapping vocabulary candidates harvested from prompt parsing into "
        "structured ontology tags.\n\n"
        "For each input term you will receive:\n"
        "  - the term (a single keyword the parser saw frequently),\n"
        "  - the role it was matched under (when known), and\n"
        "  - up to a handful of sample sentences containing the term.\n\n"
        "Suggest ONE structured tag per term in the form `namespace:value`.\n\n"
        "Allowed namespaces:\n"
        f"{namespaces}\n\n"
        "Rules:\n"
        "  - Format: namespace:value, lowercase, hyphens or underscores within a segment.\n"
        "  - The value should be specific (e.g. `location:alley`, not `location:place`).\n"
        "  - If no namespace fits, return null for that term — do not invent namespaces.\n"
        "  - Return a JSON array of objects: "
        '[{"term": "...", "tag": "namespace:value" | null}, ...].\n'
        "  - Output the JSON array only, no surrounding prose."
    )


def _build_user_prompt(rows: List[VocabularyCandidate]) -> str:
    """Render the candidate batch as JSON the LLM can read deterministically."""
    payload = []
    for row in rows:
        payload.append(
            {
                "term": row.term,
                "role": row.inferred_role,
                "samples": list(row.sample_contexts or [])[:3],
            }
        )
    return "Candidates:\n" + json.dumps(payload, indent=2)


def _parse_response(text: str, terms: List[str]) -> dict[str, Optional[str]]:
    """Extract `{term: tag}` from the LLM JSON response.

    Validates each tag against the slug regex; ignores entries for terms
    that weren't in the requested batch (LLMs occasionally invent extras).
    Returns a dict mapping every requested term to its proposed tag, with
    `None` for terms the LLM declined or returned malformed entries for.
    """
    requested = set(terms)
    out: dict[str, Optional[str]] = {term: None for term in terms}

    match = re.search(r"\[.*\]", text, re.DOTALL)
    if not match:
        return out
    try:
        raw = json.loads(match.group())
    except json.JSONDecodeError:
        return out
    if not isinstance(raw, list):
        return out

    for entry in raw:
        if not isinstance(entry, dict):
            continue
        term = entry.get("term")
        tag = entry.get("tag")
        if not isinstance(term, str) or term not in requested:
            continue
        if tag is None:
            continue
        if not isinstance(tag, str):
            continue
        normalized = tag.strip().lower()
        if not _TAG_RE.match(normalized):
            continue
        ns = normalized.split(":", 1)[0]
        if ns not in SUGGESTED_NAMESPACES:
            # LLM ignored the allowlist — don't trust it.
            continue
        out[term] = normalized

    return out


async def fetch_pending_batch(
    db: AsyncSession,
    *,
    limit: int = DEFAULT_BATCH_LIMIT,
    min_frequency: int = DEFAULT_MIN_FREQUENCY,
) -> List[VocabularyCandidate]:
    """Pending candidates ordered by frequency (most-seen first)."""
    stmt = (
        select(VocabularyCandidate)
        .where(VocabularyCandidate.status == "pending")
        .where(VocabularyCandidate.frequency >= min_frequency)
        .order_by(VocabularyCandidate.frequency.desc(), VocabularyCandidate.last_seen.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def propose_for_batch(
    db: AsyncSession,
    rows: List[VocabularyCandidate],
    *,
    user_id: Optional[int] = None,
    provider_id: Optional[str] = None,
    model_id: Optional[str] = None,
) -> int:
    """Call the LLM, parse its proposals, write `proposed_tag` back per row.

    Returns the number of rows that received a non-null proposal. The DB
    transaction is committed before returning. Rows for which the LLM
    declined (or which fail validation) stay at status="pending" so the
    next propose pass can try again.
    """
    if not rows:
        return 0

    # Local import: AiHubService imports a lot of provider machinery that
    # we don't want pulled into the proposer's module-level graph.
    from pixsim7.backend.main.services.llm.ai_hub_service import AiHubService

    terms = [row.term for row in rows]
    proposed_count = 0

    try:
        ai_hub = AiHubService(db)
        resolved_provider_id, resolved_model_id = await ai_hub.resolve_provider_and_model(
            provider_id=provider_id,
            model_id=model_id,
        )

        full_prompt = _build_system_prompt() + "\n\n" + _build_user_prompt(rows)
        execution = await ai_hub.execute_prompt(
            provider_id=resolved_provider_id,
            model_id=resolved_model_id,
            prompt_before=full_prompt,
            context={"mode": "vocabulary_proposal", "batch_size": len(rows)},
            user_id=user_id,
        )
        response_text = execution.get("prompt_after") or ""
        proposals = _parse_response(response_text, terms)
    except Exception as exc:
        logger.warning("vocabulary_propose_failed", error=str(exc), batch_size=len(rows))
        return 0

    now: datetime = utcnow()
    for row in rows:
        tag = proposals.get(row.term)
        if not tag:
            continue
        row.proposed_tag = tag
        row.proposed_at = now
        row.status = "proposed"
        proposed_count += 1

    try:
        await db.commit()
    except Exception as exc:
        logger.warning("vocabulary_propose_commit_failed", error=str(exc))
        await db.rollback()
        return 0

    logger.info(
        "vocabulary_propose_complete",
        batch_size=len(rows),
        proposed=proposed_count,
    )
    return proposed_count
