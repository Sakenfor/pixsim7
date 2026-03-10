"""Prompt pack version snapshot service."""
from __future__ import annotations

import hashlib
import json
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.prompt import PromptPackDraft, PromptPackVersion
from pixsim7.backend.main.shared.datetime_utils import utcnow

from .compile_service import PromptPackCompileService


class PromptPackVersionError(Exception):
    """Service-level error for version creation/listing."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int = 400,
        diagnostics: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.diagnostics = diagnostics or []


class PromptPackVersionService:
    """Manage immutable version snapshots for prompt pack drafts."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        compile_service: Optional[PromptPackCompileService] = None,
    ) -> None:
        self.session = session
        self.compile_service = compile_service or PromptPackCompileService()

    async def create_version_from_draft(self, draft: PromptPackDraft) -> PromptPackVersion:
        if draft.last_compile_status != "compile_ok":
            raise PromptPackVersionError(
                "Draft must have a successful compile before creating a version",
                status_code=409,
            )

        compile_result = await self.compile_service.compile_source(
            cue_source=draft.cue_source,
            namespace=draft.namespace,
        )
        compiled_at = utcnow()

        draft.last_compile_status = compile_result.status
        draft.last_compile_errors = compile_result.diagnostics
        draft.last_compiled_at = compiled_at
        draft.status = compile_result.status
        draft.updated_at = compiled_at

        if not compile_result.ok:
            raise PromptPackVersionError(
                "Compile failed while creating version",
                status_code=422,
                diagnostics=compile_result.diagnostics,
            )

        if not compile_result.pack_yaml or not compile_result.manifest_yaml:
            raise PromptPackVersionError(
                "Compile completed without required artifacts",
                status_code=500,
            )

        next_version_number = await self._next_version_number(draft.id)
        blocks_json = compile_result.blocks_json or []
        checksum = _compute_snapshot_checksum(
            cue_source=draft.cue_source,
            compiled_schema_yaml=compile_result.pack_yaml,
            compiled_manifest_yaml=compile_result.manifest_yaml,
            compiled_blocks_json=blocks_json,
        )

        version = PromptPackVersion(
            draft_id=draft.id,
            version=next_version_number,
            cue_source=draft.cue_source,
            compiled_schema_yaml=compile_result.pack_yaml,
            compiled_manifest_yaml=compile_result.manifest_yaml,
            compiled_blocks_json=blocks_json,
            checksum=checksum,
            created_at=compiled_at,
        )
        self.session.add(version)
        await self.session.flush()
        return version

    async def list_versions(
        self,
        *,
        draft_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[PromptPackVersion]:
        stmt = (
            select(PromptPackVersion)
            .where(PromptPackVersion.draft_id == draft_id)
            .order_by(PromptPackVersion.version.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_version(self, version_id: UUID) -> Optional[PromptPackVersion]:
        return await self.session.get(PromptPackVersion, version_id)

    async def _next_version_number(self, draft_id: UUID) -> int:
        stmt = select(func.max(PromptPackVersion.version)).where(PromptPackVersion.draft_id == draft_id)
        result = await self.session.execute(stmt)
        max_version = result.scalar_one_or_none()
        return int(max_version or 0) + 1


def _compute_snapshot_checksum(
    *,
    cue_source: str,
    compiled_schema_yaml: str,
    compiled_manifest_yaml: str,
    compiled_blocks_json: list[dict[str, Any]],
) -> str:
    payload = {
        "cue_source": cue_source,
        "compiled_schema_yaml": compiled_schema_yaml,
        "compiled_manifest_yaml": compiled_manifest_yaml,
        "compiled_blocks_json": compiled_blocks_json,
    }
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

