"""
Prompt tagging processor worker — runs AI-assisted family-tag suggestion as
an ARQ job.

Replaces the in-process ``asyncio.create_task(_suggest_and_apply(...))``
fire-and-forget pattern that the ``prompt:version_created`` event handler
used to use.  Routing through ARQ (with a unique job_id keyed on
``family_id``) gives us:

- **Deduplication**: rapid successive ``prompt:version_created`` events for
  the same family collapse to a single in-flight job.
- **Retry/backoff** via the worker's ``max_tries`` + ``retry_jobs`` settings —
  important because the LLM call is the most failure-prone step.
- **Cross-process** ownership: tagging runs in the worker, never in the API
  request loop.
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.prompt.tag import PromptFamilyTag
from pixsim7.backend.main.services.prompt.tag_suggester import suggest_family_tags
from pixsim7.backend.main.services.tag import TagRegistry
from pixsim7.backend.main.workers.asset_job import run_keyed_job
from pixsim_logging import get_logger

logger = get_logger()


async def _suggest_and_apply(
    db: AsyncSession,
    family_id: UUID,
    prompt_text: str,
    category: Optional[str],
    ai_tags: Optional[list[str]],
) -> dict:
    """Resolve the AI tag list (LLM-suggested or agent-provided), then replace
    the family's existing AI-source tags with the new set.

    Manual and derived tags are protected — the AI tag set will not displace
    or duplicate them.

    Returns a small dict of fields to merge into the job's success payload.
    """
    if ai_tags is not None:
        suggested = ai_tags
        logger.info(
            "prompt_tagging_using_agent_tags",
            family_id=str(family_id),
            tag_count=len(suggested),
        )
    else:
        suggested = await suggest_family_tags(
            prompt_text=prompt_text,
            mode_id=category,
            db=db,
        )
    if not suggested:
        logger.info("prompt_tagging_no_suggestions", family_id=str(family_id))
        return {"applied_count": 0, "skipped_count": 0}

    registry = TagRegistry(db)

    # Resolve/create tag records for each suggested slug
    tag_records = []
    for slug in suggested:
        tag = await registry.get_or_create_tag(slug)
        tag_records.append(tag)

    # Load existing manual + derived tag_ids — neither is overwritten by ai
    protected_result = await db.execute(
        select(PromptFamilyTag).where(
            PromptFamilyTag.family_id == family_id,
            PromptFamilyTag.source.in_(["manual", "derived"]),
        )
    )
    protected_tag_ids = {row.tag_id for row in protected_result.scalars().all()}

    # Replace all existing AI tags
    await db.execute(
        delete(PromptFamilyTag).where(
            PromptFamilyTag.family_id == family_id,
            PromptFamilyTag.source == "ai",
        )
    )

    # Insert new AI tags (skip any already held as manual or derived)
    applied = 0
    skipped = 0
    for tag in tag_records:
        if tag.id in protected_tag_ids:
            skipped += 1
            continue
        db.add(PromptFamilyTag(
            family_id=family_id,
            tag_id=tag.id,
            source="ai",
        ))
        applied += 1

    await db.commit()

    logger.info(
        "prompt_tagging_applied",
        family_id=str(family_id),
        tags=suggested,
        applied_count=applied,
        skipped_protected=skipped,
    )
    return {"applied_count": applied, "skipped_count": skipped}


async def process_prompt_tagging(
    ctx: dict,
    family_id: str,
    prompt_text: str,
    *,
    category: Optional[str] = None,
    ai_tags: Optional[list[str]] = None,
) -> dict:
    """Run AI-tag suggestion + application for a single prompt family.

    ``family_id`` is passed as a string so it survives ARQ's serialization
    cleanly; we coerce back to UUID inside the operation.
    """
    family_uuid = UUID(family_id)
    return await run_keyed_job(
        "prompt-tagging",
        "family_id",
        str(family_uuid),
        operation=lambda db: _suggest_and_apply(
            db,
            family_id=family_uuid,
            prompt_text=prompt_text,
            category=category,
            ai_tags=ai_tags,
        ),
        extra_log_fields={
            "category": category,
            "ai_tags_provided": ai_tags is not None,
        },
    )
