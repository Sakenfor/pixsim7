"""
Prompt Tagging Event Handler

Listens for prompt:version_created events and runs AI-assisted tag suggestion
for the parent PromptFamily.

Behaviour:
- Calls suggest_family_tags() with the new prompt text + family category
- Deletes existing AI-source tags for the family
- Inserts new AI tags, skipping any that are already manually tagged
  (manual tags are never overwritten by AI)
"""
import asyncio
from uuid import UUID

from pydantic import BaseModel

from pixsim7.backend.main.infrastructure.events.bus import Event
from pixsim7.backend.main.services.prompt.events import PROMPT_VERSION_CREATED
from pixsim_logging import get_logger

logger = get_logger()


# ===== MANIFEST =====

class EventHandlerManifest(BaseModel):
    id: str
    name: str
    version: str
    description: str
    author: str
    enabled: bool = True
    subscribe_to: str = "*"


manifest = EventHandlerManifest(
    id="prompt_tagging",
    name="Prompt AI Tagger",
    version="1.0.0",
    description="Auto-suggests library tags for a PromptFamily when a new version is saved",
    author="PixSim Team",
    enabled=True,
    subscribe_to=PROMPT_VERSION_CREATED,
)


# ===== HANDLER =====

async def handle_event(event: Event) -> None:
    if event.event_type != PROMPT_VERSION_CREATED:
        return

    family_id_str = event.data.get("family_id")
    prompt_text = event.data.get("prompt_text")
    category = event.data.get("category")

    if not family_id_str or not prompt_text:
        logger.warning("prompt_tagging_skipped_missing_data", event_data=event.data)
        return

    asyncio.create_task(
        _suggest_and_apply(
            family_id=UUID(family_id_str),
            prompt_text=prompt_text,
            category=category,
            ai_tags=event.data.get("ai_tags"),
        )
    )


async def _suggest_and_apply(
    family_id: UUID,
    prompt_text: str,
    category: str | None,
    ai_tags: list[str] | None = None,
) -> None:
    try:
        from pixsim7.backend.main.infrastructure.database.session import get_async_session
        from pixsim7.backend.main.services.prompt.tag_suggester import suggest_family_tags
        from pixsim7.backend.main.services.tag import TagRegistry
        from pixsim7.backend.main.domain.prompt.tag import PromptFamilyTag
        from sqlalchemy import delete, select

        async with get_async_session() as db:
            if ai_tags is not None:
                # Agent provided tags directly — skip LLM call
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
                return

            registry = TagRegistry(db)

            # Resolve/create tag records for each suggested slug
            tag_records = []
            for slug in suggested:
                tag = await registry.get_or_create_tag(slug)
                tag_records.append(tag)

            # Load existing manual tags so we don't overwrite them
            manual_result = await db.execute(
                select(PromptFamilyTag).where(
                    PromptFamilyTag.family_id == family_id,
                    PromptFamilyTag.source == "manual",
                )
            )
            manual_tag_ids = {row.tag_id for row in manual_result.scalars().all()}

            # Replace all existing AI tags
            await db.execute(
                delete(PromptFamilyTag).where(
                    PromptFamilyTag.family_id == family_id,
                    PromptFamilyTag.source == "ai",
                )
            )

            # Insert new AI tags (skip any already held as manual)
            for tag in tag_records:
                if tag.id in manual_tag_ids:
                    continue
                db.add(PromptFamilyTag(
                    family_id=family_id,
                    tag_id=tag.id,
                    source="ai",
                ))

            await db.commit()

            logger.info(
                "prompt_tagging_applied",
                family_id=str(family_id),
                tags=suggested,
                skipped_manual=len([t for t in tag_records if t.id in manual_tag_ids]),
            )

    except Exception:
        logger.error("prompt_tagging_failed", family_id=str(family_id), exc_info=True)


# ===== LIFECYCLE =====

def on_register():
    logger.info("prompt_tagging_handler_registered")


def on_unregister():
    logger.info("prompt_tagging_handler_unregistered")
