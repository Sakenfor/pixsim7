"""
Prompt Tagging Event Handler

Listens for prompt:version_created events and enqueues an AI-assisted
tag-suggestion job for the parent PromptFamily.

The actual work runs in the ARQ worker via ``process_prompt_tagging``.
Routing through ARQ (with a unique job_id keyed on ``family_id``) gives us
deduplication: rapid successive ``prompt:version_created`` events for the
same family collapse to a single in-flight job.  Retry/backoff comes from
the worker's ``max_tries`` + ``retry_jobs`` settings — important because the
LLM call inside ``suggest_family_tags`` is the most failure-prone step.
"""
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
    version="1.1.0",
    description="Enqueues an AI tag-suggestion job (ARQ) when a new prompt version is saved",
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
    # authoring_mode_id is the canonical vocabulary key; fall back to category
    mode_id = event.data.get("authoring_mode_id") or event.data.get("category")

    if not family_id_str or not prompt_text:
        logger.warning("prompt_tagging_skipped_missing_data", event_data=event.data)
        return

    try:
        from pixsim7.backend.main.infrastructure.queue.tasks import queue_task

        await queue_task(
            "process_prompt_tagging",
            family_id_str,
            prompt_text,
            category=mode_id,
            ai_tags=event.data.get("ai_tags"),
            _job_id=f"prompt-tag:{family_id_str}",
        )
        logger.debug("prompt_tagging_queued", family_id=family_id_str)
    except Exception:
        logger.error(
            "prompt_tagging_enqueue_failed",
            family_id=family_id_str,
            exc_info=True,
        )


# ===== LIFECYCLE =====

def on_register():
    logger.info("prompt_tagging_handler_registered")


def on_unregister():
    logger.info("prompt_tagging_handler_unregistered")
