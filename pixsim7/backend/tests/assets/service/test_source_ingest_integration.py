"""DB-backed integration test for S3 source-root ingest (plan s3-source-root-ingest, cp-f).

Exercises the real ingest_source_object path against Postgres (schema-per-test):
add_asset + content-blob dedup + attribution + archive placement, using local
filesystem backends to stand in for the 'source' and 'archive' roots (no live S3).
Skips if the test Postgres / pgvector is unavailable.
"""
from __future__ import annotations

from typing import AsyncIterator
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import event, select, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.assets.content import ContentBlob
from pixsim7.backend.main.domain.assets.models import Asset
from pixsim7.backend.main.domain.assets.versioning import AssetVersionFamily
from pixsim7.backend.main.domain.providers.models.account import ProviderAccount
from pixsim7.backend.main.domain.user import User
from pixsim7.backend.main.infrastructure.database.session import _strip_tz_from_params
from pixsim7.backend.main.services.asset.source_ingest import ingest_source_object
from pixsim7.backend.main.services.storage.storage_service import (
    LocalStorageService,
    TieredStorageService,
    set_storage_service,
)
from pixsim7.backend.main.services.storage.roots import LOCAL_ROOT_ID
from pixsim7.backend.main.shared.config import settings

TEST_SUITE = {
    "id": "source-ingest-integration",
    "label": "S3 Source-Root Ingest (integration)",
    "kind": "integration",
    "category": "backend",
    "subcategory": "assets",
    "covers": ["pixsim7/backend/main/services/asset/source_ingest.py"],
    "order": 27,
}


@pytest_asyncio.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    schema = f"test_source_ingest_{uuid4().hex}"
    engine = create_async_engine(settings.async_database_url, poolclass=NullPool)
    event.listen(engine.sync_engine, "before_cursor_execute", _strip_tz_from_params, retval=True)

    async with engine.connect() as conn:
        outer_tx = await conn.begin()
        try:
            try:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            except Exception as exc:
                pytest.skip(f"pgvector extension unavailable: {exc}")

            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            await conn.execute(text(f'SET search_path TO "{schema}", public'))
            await conn.run_sync(
                lambda sync_conn: SQLModel.metadata.create_all(
                    sync_conn,
                    tables=[
                        User.__table__,
                        ContentBlob.__table__,
                        ProviderAccount.__table__,
                        AssetVersionFamily.__table__,
                        Asset.__table__,
                    ],
                )
            )
            session = AsyncSession(
                bind=conn,
                expire_on_commit=False,
                join_transaction_mode="create_savepoint",
            )
            try:
                yield session
            finally:
                await session.close()
        finally:
            if outer_tx.is_active:
                await outer_tx.rollback()
    await engine.dispose()


@pytest.mark.asyncio
async def test_ingest_source_object_create_skip_dedup_and_etag_change(
    db_session: AsyncSession, monkeypatch, tmp_path
) -> None:
    # Derivatives are best-effort and hit arq/redis — stub to a no-op.
    async def _noop_queue(self, *a, **k):
        return None

    monkeypatch.setattr(
        "pixsim7.backend.main.services.asset.ingestion.AssetIngestionService.queue_ingestion",
        _noop_queue,
    )

    # local hot root + 'archive' (CAS target) + 'packs' (read-only source), all
    # local filesystem backends on temp dirs.
    packs = LocalStorageService(root_path=str(tmp_path / "packs"))
    tier = TieredStorageService({
        LOCAL_ROOT_ID: LocalStorageService(root_path=str(tmp_path / "local")),
        "archive": LocalStorageService(root_path=str(tmp_path / "archive")),
        "packs": packs,
    })
    set_storage_service(tier)
    try:
        user = User(email="src@example.com", username="src_user", password_hash="h")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)

        await packs.store("Susana/clip.mp4", b"video-bytes-1")

        common = dict(user_id=user.id, source_root_id="packs", prefix="Susana/")

        # 1. First ingest → created, on the archive root, with attribution.
        r1 = await ingest_source_object(db_session, object_key="Susana/clip.mp4", etag="E1", **common)
        assert r1["status"] == "created"
        asset = (
            await db_session.execute(select(Asset).where(Asset.id == r1["asset_id"]))
        ).scalar_one()
        assert asset.storage_root_id == "archive"
        assert asset.upload_method == "local"
        assert asset.upload_context["source_object_key"] == "Susana/clip.mp4"
        assert asset.upload_context["source_relative_path"] == "clip.mp4"
        # rel is flat after stripping the prefix → no subfolder (derivation itself
        # is covered by the unit test test_build_source_context).
        assert "source_subfolder" not in asset.upload_context
        assert asset.upload_context["source_etag"] == "E1"
        assert asset.sha256 and asset.stored_key and "/content/" in asset.stored_key
        # bytes actually landed on the archive backend
        assert await tier.exists(asset.stored_key, root_id="archive") is True

        # 2. Re-ingest same key+etag → incremental skip (same asset, no new row).
        r2 = await ingest_source_object(db_session, object_key="Susana/clip.mp4", etag="E1", **common)
        assert r2["status"] == "skipped"
        assert r2["asset_id"] == r1["asset_id"]

        # 3. Different key, identical bytes → content dedup to the same asset.
        await packs.store("Susana/copy.mp4", b"video-bytes-1")
        r3 = await ingest_source_object(db_session, object_key="Susana/copy.mp4", etag="E9", **common)
        assert r3["status"] == "deduped"
        assert r3["asset_id"] == r1["asset_id"]

        # 4. Same key, NEW bytes + new etag (replaced object) → new asset.
        await packs.store("Susana/clip.mp4", b"video-bytes-2")
        r4 = await ingest_source_object(db_session, object_key="Susana/clip.mp4", etag="E2", **common)
        assert r4["status"] == "created"
        assert r4["asset_id"] != r1["asset_id"]
    finally:
        set_storage_service(None)
