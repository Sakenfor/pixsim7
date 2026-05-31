"""
Prompt embedding event handler.

Listens for prompt:version_created events and enqueues a vector-embedding job
for the new PromptVersion (plan: embedding-service-generalization, Phase C).

The actual work runs in the ARQ worker via ``process_prompt_embedding``.
Routing through ARQ (with a unique job_id keyed on ``version_id``) gives us
dedup of rapid re-saves plus retry/backoff on the provider call — the
embedding provider request is the failure-prone step and must stay out of the
API request loop.
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
    id="prompt_embedding",
    name="Prompt Embedder",
    version="1.0.0",
    description="Enqueues a vector-embedding job (ARQ) when a new prompt version is saved",
    author="PixSim Team",
    enabled=True,
    subscribe_to=PROMPT_VERSION_CREATED,
)


# ===== HANDLER =====

async def handle_event(event: Event) -> None:
    if event.event_type != PROMPT_VERSION_CREATED:
        return

    version_id = event.data.get("version_id")
    if not version_id:
        logger.warning("prompt_embedding_skipped_missing_version_id", event_data=event.data)
        return

    try:
        from pixsim7.backend.main.infrastructure.queue.tasks import queue_task

        await queue_task(
            "process_prompt_embedding",
            version_id,
            _job_id=f"prompt-embed:{version_id}",
        )
        logger.debug("prompt_embedding_queued", version_id=version_id)
    except Exception:
        logger.error(
            "prompt_embedding_enqueue_failed",
            version_id=version_id,
            exc_info=True,
        )


# ===== LIFECYCLE =====

def on_register():
    logger.info("prompt_embedding_handler_registered")


def on_unregister():
    logger.info("prompt_embedding_handler_unregistered")
