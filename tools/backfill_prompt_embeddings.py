#!/usr/bin/env python3
"""One-shot backfill: populate PromptVersion.embedding for existing rows.

New prompt versions get embedded asynchronously via the ``prompt:version_created``
event → ARQ ``process_prompt_embedding`` worker (plan
``embedding-service-generalization`` Phase C). This script handles rows that
predate that wiring.

Unlike a pure-SQL backfill this must call the embedding provider per row, so it
routes through ``PromptEmbeddingService.embed_versions_batch`` (keyset-paginated,
commits per batch). Binds the embedding capability locator the same way the
worker does.

Usage:
    python tools/backfill_prompt_embeddings.py                 # dry-run (default)
    python tools/backfill_prompt_embeddings.py --apply          # actually embed
    python tools/backfill_prompt_embeddings.py --apply --force   # re-embed all
    python tools/backfill_prompt_embeddings.py --apply --family-id <uuid>
    python tools/backfill_prompt_embeddings.py --apply --model-id openai:text-embedding-3-small

Requires DATABASE_URL (or PIXSIM_DATABASE_URL) in env or .env file, plus the
provider credentials the chosen embedding model needs.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from uuid import UUID

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.services.diagnostics.applied_ledger import record_backfill_applied


def _get_database_url() -> str:
    from pixsim7.backend.main.shared.config import settings

    return settings.async_database_url


async def backfill(
    apply: bool,
    *,
    force: bool,
    family_id: UUID | None,
    model_id: str | None,
    batch_size: int,
) -> None:
    from pixsim7.backend.main.domain.prompt import PromptVersion
    from pixsim7.backend.main.services.embedding.prompt_service import (
        PromptEmbeddingService,
    )

    url = _get_database_url()
    engine = create_async_engine(url, echo=False)
    # Match the app session: strip tzinfo from bound params so tz-aware cursor
    # values compare against TIMESTAMP WITHOUT TIME ZONE columns (keyset paging).
    event.listen(
        engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True
    )
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        count_stmt = select(func.count()).select_from(PromptVersion)
        if not force:
            count_stmt = count_stmt.where(PromptVersion.embedding.is_(None))
        if family_id is not None:
            count_stmt = count_stmt.where(PromptVersion.family_id == family_id)
        pending = (await session.execute(count_stmt)).scalar_one()

        scope = "all versions" if force else "versions missing an embedding"
        if family_id is not None:
            scope += f" in family {family_id}"
        print(f"Prompt versions to embed ({scope}): {pending}")

        if pending == 0:
            print("Nothing to do.")
            await engine.dispose()
            return

        if not apply:
            print("Dry run — pass --apply to embed.")
            await engine.dispose()
            return

        # Bootstrap the registries the composite resolves against — the live
        # app/worker does this at startup; a standalone script must do it too.
        # setup_ai_models() populates ai_model_registry (model→provider lookup);
        # register_providers_from_plugins() loads the provider plugins, including
        # openai_embedding, into embedding_registry.
        from pixsim7.backend.main.startup import setup_ai_models
        from pixsim7.backend.main.domain.providers.registry.provider_registry import (
            register_providers_from_plugins,
        )

        setup_ai_models()
        register_providers_from_plugins()

        # Bind the embedding capability locator (composite: text registry +
        # image daemon), exactly as the worker does at startup.
        from pixsim7.backend.main.adapters.embedding import (
            bind_embedding_capabilities,
            shutdown_embedding_capabilities,
        )

        bind_embedding_capabilities()
        try:
            service = PromptEmbeddingService(session, batch_size=batch_size)
            stats = await service.embed_versions_batch(
                model_id=model_id,
                force=force,
                family_id=family_id,
            )
            print(
                f"Embedded {stats['embedded_count']} / {stats['total']} "
                f"(skipped {stats['skipped_count']}) with model {stats['model_id']}."
            )
            await record_backfill_applied(
                __file__,
                rows_affected=stats["embedded_count"],
                notes=f"skipped={stats['skipped_count']} model={stats['model_id']}",
            )
        finally:
            await shutdown_embedding_capabilities()

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="Actually embed (default is dry-run)")
    parser.add_argument("--force", action="store_true", help="Re-embed rows that already have an embedding")
    parser.add_argument("--family-id", type=UUID, default=None, help="Only embed versions in this family")
    parser.add_argument("--model-id", type=str, default=None, help="Override embedding model id")
    parser.add_argument(
        "--batch-size", type=int, default=64,
        help="Rows per embed batch. Larger = fewer subprocess/model reloads for "
             "the cmd embedder (default 64).",
    )
    args = parser.parse_args()
    print(f"{'APPLYING' if args.apply else 'DRY RUN'}: backfill prompt_versions.embedding\n")
    asyncio.run(
        backfill(
            apply=args.apply,
            force=args.force,
            family_id=args.family_id,
            model_id=args.model_id,
            batch_size=args.batch_size,
        )
    )


if __name__ == "__main__":
    main()
