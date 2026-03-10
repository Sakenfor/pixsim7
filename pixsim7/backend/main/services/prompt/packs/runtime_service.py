"""Runtime catalog and activation service for user-authored prompt packs."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from uuid import UUID, uuid4

import yaml
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain import (
    PromptPackDraft,
    PromptPackPublication,
    PromptPackVersion,
    User,
)
from pixsim7.backend.main.domain.blocks import BlockPrimitive
from pixsim7.backend.main.infrastructure.database.session import get_async_blocks_session
from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
    _compile_schema_blocks,
    _project_block_to_primitive,
)
from pixsim7.backend.main.shared.datetime_utils import utcnow

_PREFERENCES_ROOT_KEY = "prompt_packs"
_PREFERENCES_ACTIVE_VERSION_IDS_KEY = "active_version_ids"


@dataclass(frozen=True)
class PromptPackActivationResult:
    """Activation/deactivation result payload."""

    version_id: UUID
    draft_id: UUID
    source_pack: str
    active_version_ids: List[str]
    blocks_created: int = 0
    blocks_updated: int = 0
    blocks_pruned: int = 0


class PromptPackRuntimeError(Exception):
    """Service-level runtime/catalog error."""

    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class PromptPackRuntimeService:
    """Catalog listing + activation lifecycle for user prompt pack versions."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_catalog(
        self,
        *,
        user_id: int,
        scope: str = "self",
    ) -> List[Dict[str, Any]]:
        normalized_scope = str(scope or "self").strip().lower() or "self"
        if normalized_scope not in {"self", "shared", "system", "all"}:
            raise PromptPackRuntimeError(
                "Unsupported catalog scope. Allowed: self, shared, system, all",
                status_code=422,
            )

        active_version_ids = set(await self.get_active_version_ids(user_id=user_id))
        rows: List[Dict[str, Any]] = []

        if normalized_scope in {"self", "all"}:
            rows.extend(
                await self._list_self_catalog_rows(
                    user_id=user_id,
                    active_version_ids=active_version_ids,
                )
            )

        if normalized_scope in {"shared", "all"}:
            rows.extend(
                await self._list_shared_catalog_rows(
                    user_id=user_id,
                    active_version_ids=active_version_ids,
                    include_owned=(normalized_scope == "shared"),
                )
            )

        if normalized_scope in {"system", "all"}:
            rows.extend(await self._list_system_catalog_rows())

        rows.sort(
            key=lambda row: (
                str(row.get("catalog_source") or ""),
                str(row.get("source_pack") or ""),
                str(row.get("namespace") or ""),
                -int(row.get("version") or 0),
            )
        )
        return rows

    async def activate_version(
        self,
        *,
        user_id: int,
        version_id: UUID,
    ) -> PromptPackActivationResult:
        version, draft = await self._get_owned_version(version_id=version_id, user_id=user_id)
        source_pack = self._resolve_source_pack(version=version, draft=draft)
        materialize_stats = await self._materialize_version(
            user_id=user_id,
            draft=draft,
            version=version,
            source_pack=source_pack,
        )

        user = await self._get_user(user_id=user_id)
        active_version_ids = _read_active_version_ids(user.preferences)
        same_draft_version_ids = await self._list_draft_version_ids(draft_id=draft.id)
        next_active = [
            value
            for value in active_version_ids
            if value not in same_draft_version_ids
        ]
        target_id = str(version.id)
        if target_id not in next_active:
            next_active.append(target_id)
        _write_active_version_ids(user=user, active_version_ids=next_active)
        await self.session.flush()

        return PromptPackActivationResult(
            version_id=version.id,
            draft_id=draft.id,
            source_pack=source_pack,
            active_version_ids=next_active,
            blocks_created=materialize_stats["created"],
            blocks_updated=materialize_stats["updated"],
            blocks_pruned=materialize_stats["pruned"],
        )

    async def deactivate_version(
        self,
        *,
        user_id: int,
        version_id: UUID,
    ) -> PromptPackActivationResult:
        version, draft = await self._get_owned_version(version_id=version_id, user_id=user_id)
        source_pack = self._resolve_source_pack(version=version, draft=draft)
        user = await self._get_user(user_id=user_id)

        current = _read_active_version_ids(user.preferences)
        target = str(version.id)
        next_active = [value for value in current if value != target]
        _write_active_version_ids(user=user, active_version_ids=next_active)
        await self.session.flush()

        return PromptPackActivationResult(
            version_id=version.id,
            draft_id=draft.id,
            source_pack=source_pack,
            active_version_ids=next_active,
        )

    async def get_active_version_ids(self, *, user_id: int) -> List[str]:
        user = await self._get_user(user_id=user_id)
        return _read_active_version_ids(user.preferences)

    async def resolve_active_source_packs(self, *, user_id: int) -> List[str]:
        active_version_ids = await self.get_active_version_ids(user_id=user_id)
        if not active_version_ids:
            return []

        parsed_ids: List[UUID] = []
        for raw in active_version_ids:
            try:
                parsed_ids.append(UUID(str(raw)))
            except (TypeError, ValueError):
                continue
        if not parsed_ids:
            return []

        stmt = (
            select(PromptPackVersion, PromptPackDraft)
            .join(PromptPackDraft, PromptPackVersion.draft_id == PromptPackDraft.id)
            .where(PromptPackDraft.owner_user_id == user_id)
            .where(PromptPackVersion.id.in_(parsed_ids))
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        source_packs: List[str] = []
        seen: set[str] = set()
        for version, draft in rows:
            source_pack = self._resolve_source_pack(version=version, draft=draft)
            if source_pack in seen:
                continue
            seen.add(source_pack)
            source_packs.append(source_pack)

        source_packs.sort()
        return source_packs

    async def _list_self_catalog_rows(
        self,
        *,
        user_id: int,
        active_version_ids: set[str],
    ) -> List[Dict[str, Any]]:
        stmt = (
            select(PromptPackVersion, PromptPackDraft)
            .join(PromptPackDraft, PromptPackVersion.draft_id == PromptPackDraft.id)
            .where(PromptPackDraft.owner_user_id == user_id)
            .order_by(PromptPackVersion.created_at.desc())
        )
        result = await self.session.execute(stmt)
        rows = result.all()
        version_ids = [version.id for version, _draft in rows]
        publications = await self._list_publications_by_version_ids(version_ids=version_ids)

        catalog: List[Dict[str, Any]] = []
        for version, draft in rows:
            source_pack = self._resolve_source_pack(version=version, draft=draft)
            blocks_json = (
                version.compiled_blocks_json
                if isinstance(getattr(version, "compiled_blocks_json", None), list)
                else []
            )
            publication = publications.get(str(version.id))
            catalog.append(
                {
                    "catalog_source": "self",
                    "source_pack": source_pack,
                    "version_id": version.id,
                    "draft_id": draft.id,
                    "namespace": draft.namespace,
                    "pack_slug": draft.pack_slug,
                    "version": version.version,
                    "checksum": version.checksum,
                    "status": draft.status,
                    "review_status": (
                        str(getattr(publication, "review_status"))
                        if publication is not None
                        else "draft"
                    ),
                    "publication_visibility": (
                        str(getattr(publication, "visibility"))
                        if publication is not None
                        else "private"
                    ),
                    "created_at": version.created_at,
                    "owner_user_id": draft.owner_user_id,
                    "is_active": str(version.id) in active_version_ids,
                    "block_count": len(blocks_json),
                }
            )
        return catalog

    async def _list_shared_catalog_rows(
        self,
        *,
        user_id: int,
        active_version_ids: set[str],
        include_owned: bool,
    ) -> List[Dict[str, Any]]:
        stmt = (
            select(PromptPackVersion, PromptPackDraft, PromptPackPublication)
            .join(PromptPackDraft, PromptPackVersion.draft_id == PromptPackDraft.id)
            .join(PromptPackPublication, PromptPackPublication.version_id == PromptPackVersion.id)
            .where(PromptPackPublication.visibility == "shared")
            .where(PromptPackPublication.review_status == "approved")
            .order_by(PromptPackVersion.created_at.desc())
        )
        if not include_owned:
            stmt = stmt.where(PromptPackDraft.owner_user_id != user_id)

        result = await self.session.execute(stmt)
        rows = result.all()

        catalog: List[Dict[str, Any]] = []
        for version, draft, publication in rows:
            source_pack = self._resolve_source_pack(version=version, draft=draft)
            blocks_json = (
                version.compiled_blocks_json
                if isinstance(getattr(version, "compiled_blocks_json", None), list)
                else []
            )
            catalog.append(
                {
                    "catalog_source": "shared",
                    "source_pack": source_pack,
                    "version_id": version.id,
                    "draft_id": draft.id,
                    "namespace": draft.namespace,
                    "pack_slug": draft.pack_slug,
                    "version": version.version,
                    "checksum": version.checksum,
                    "status": draft.status,
                    "review_status": str(publication.review_status),
                    "publication_visibility": str(publication.visibility),
                    "created_at": version.created_at,
                    "owner_user_id": draft.owner_user_id,
                    "is_active": (
                        draft.owner_user_id == user_id
                        and str(version.id) in active_version_ids
                    ),
                    "block_count": len(blocks_json),
                }
            )
        return catalog

    async def _list_system_catalog_rows(self) -> List[Dict[str, Any]]:
        source_pack = func.nullif(func.jsonb_extract_path_text(BlockPrimitive.tags, "source_pack"), "")
        async with get_async_blocks_session() as blocks_db:
            result = await blocks_db.execute(
                select(source_pack.label("source_pack"), func.count(BlockPrimitive.id).label("count"))
                .where(BlockPrimitive.is_public.is_(True))
                .where(source_pack.isnot(None))
                .group_by(source_pack)
                .order_by(source_pack)
            )
            return [
                {
                    "catalog_source": "system",
                    "source_pack": str(pack_name),
                    "version_id": None,
                    "draft_id": None,
                    "namespace": None,
                    "pack_slug": None,
                    "version": None,
                    "checksum": None,
                    "status": "system",
                    "review_status": None,
                    "publication_visibility": None,
                    "created_at": None,
                    "owner_user_id": None,
                    "is_active": False,
                    "block_count": int(count or 0),
                }
                for pack_name, count in result.all()
                if pack_name is not None
            ]

    async def _materialize_version(
        self,
        *,
        user_id: int,
        draft: PromptPackDraft,
        version: PromptPackVersion,
        source_pack: str,
    ) -> Dict[str, int]:
        now = utcnow()
        primitives = self._compile_version_blocks_to_primitives(
            user_id=user_id,
            draft=draft,
            version=version,
            source_pack=source_pack,
        )

        incoming_block_ids = [str(item["block_id"]) for item in primitives]
        if len(set(incoming_block_ids)) != len(incoming_block_ids):
            raise PromptPackRuntimeError(
                f"Prompt pack version {version.id} resolves to duplicate block IDs",
                status_code=422,
            )
        incoming_block_id_set = set(incoming_block_ids)
        stats = {"created": 0, "updated": 0, "pruned": 0}

        async with get_async_blocks_session() as blocks_db:
            existing_by_block_id: Dict[str, BlockPrimitive] = {}
            if incoming_block_ids:
                existing_result = await blocks_db.execute(
                    select(BlockPrimitive).where(BlockPrimitive.block_id.in_(incoming_block_ids))
                )
                existing_by_block_id = {
                    row.block_id: row
                    for row in existing_result.scalars().all()
                    if isinstance(getattr(row, "block_id", None), str)
                }

            for attrs in primitives:
                block_id = str(attrs["block_id"])
                existing = existing_by_block_id.get(block_id)
                if existing is not None:
                    if not _is_owned_private_pack_block(
                        block=existing,
                        owner_user_id=user_id,
                        source_pack=source_pack,
                    ):
                        raise PromptPackRuntimeError(
                            f"Cannot activate prompt pack: block_id '{block_id}' already exists and is not owned by this pack",
                            status_code=409,
                        )
                    existing.category = attrs["category"]
                    existing.text = attrs["text"]
                    existing.tags = attrs["tags"]
                    existing.capabilities = attrs["capabilities"]
                    existing.source = attrs["source"]
                    existing.is_public = attrs["is_public"]
                    existing.updated_at = now
                    blocks_db.add(existing)
                    stats["updated"] += 1
                    continue

                blocks_db.add(
                    BlockPrimitive(
                        id=uuid4(),
                        block_id=block_id,
                        category=attrs["category"],
                        text=attrs["text"],
                        tags=attrs["tags"],
                        capabilities=attrs["capabilities"],
                        source=attrs["source"],
                        is_public=attrs["is_public"],
                        created_at=now,
                        updated_at=now,
                    )
                )
                stats["created"] += 1

            stale_query = (
                select(BlockPrimitive)
                .where(BlockPrimitive.is_public.is_(False))
                .where(func.jsonb_extract_path_text(BlockPrimitive.tags, "owner_user_id") == str(user_id))
                .where(func.jsonb_extract_path_text(BlockPrimitive.tags, "source_pack") == source_pack)
            )
            stale_result = await blocks_db.execute(stale_query)
            stale_rows = [
                row
                for row in stale_result.scalars().all()
                if str(getattr(row, "block_id", "")) not in incoming_block_id_set
            ]
            for row in stale_rows:
                await blocks_db.delete(row)
                stats["pruned"] += 1

            await blocks_db.commit()

        return stats

    def _compile_version_blocks_to_primitives(
        self,
        *,
        user_id: int,
        draft: PromptPackDraft,
        version: PromptPackVersion,
        source_pack: str,
    ) -> List[Dict[str, Any]]:
        pack_payload = _parse_compiled_schema_yaml(version.compiled_schema_yaml)
        pack_defaults = dict(pack_payload.get("defaults") or {}) if isinstance(pack_payload.get("defaults"), dict) else {}
        pack_package_name = _normalize_optional_text(pack_payload.get("package_name"))
        raw_blocks = pack_payload.get("blocks")
        if not isinstance(raw_blocks, list):
            raw_blocks = version.compiled_blocks_json if isinstance(version.compiled_blocks_json, list) else []

        expanded_blocks: List[Dict[str, Any]] = []
        src = Path(f"prompt_pack_version:{version.id}")
        for raw_block in raw_blocks:
            if not isinstance(raw_block, dict):
                continue
            expanded_blocks.extend(
                self._expand_pack_block(
                    raw_block=raw_block,
                    pack_defaults=pack_defaults,
                    pack_package_name=pack_package_name,
                    src=src,
                )
            )

        primitives: List[Dict[str, Any]] = []
        for block in expanded_blocks:
            raw_block_id = _normalize_optional_text(block.get("block_id"))
            if not raw_block_id:
                raise PromptPackRuntimeError(
                    f"Prompt pack version {version.id} contains a block without block_id",
                    status_code=422,
                )

            materialized_block_id = _materialize_block_id(
                namespace=draft.namespace,
                pack_slug=draft.pack_slug,
                raw_block_id=raw_block_id,
            )
            projected_input = dict(block)
            projected_input["block_id"] = materialized_block_id
            projected_input["source"] = "user"
            projected_input["is_public"] = False
            if pack_package_name and not _normalize_optional_text(projected_input.get("package_name")):
                projected_input["package_name"] = pack_package_name

            primitive = _project_block_to_primitive(projected_input, plugin_name=source_pack)
            tags = primitive.get("tags")
            normalized_tags = dict(tags) if isinstance(tags, dict) else {}
            normalized_tags["owner_user_id"] = str(user_id)
            normalized_tags["prompt_pack_version_id"] = str(version.id)
            normalized_tags["prompt_pack_draft_id"] = str(draft.id)
            normalized_tags["prompt_pack_namespace"] = draft.namespace
            normalized_tags["prompt_pack_slug"] = draft.pack_slug
            normalized_tags["prompt_pack_block_id"] = raw_block_id
            normalized_tags["source_pack"] = source_pack
            primitive["tags"] = normalized_tags
            primitive["source"] = "user"
            primitive["is_public"] = False
            primitives.append(primitive)

        return primitives

    def _expand_pack_block(
        self,
        *,
        raw_block: Dict[str, Any],
        pack_defaults: Dict[str, Any],
        pack_package_name: Optional[str],
        src: Path,
    ) -> List[Dict[str, Any]]:
        if "block_schema" not in raw_block:
            normalized = {**pack_defaults, **raw_block}
            if pack_package_name and not _normalize_optional_text(normalized.get("package_name")):
                normalized["package_name"] = pack_package_name
            return [normalized]

        block_schema = raw_block.get("block_schema")
        if not isinstance(block_schema, dict):
            raise PromptPackRuntimeError("block_schema must be an object", status_code=422)

        raw_schema_defaults = raw_block.get("defaults")
        if raw_schema_defaults is None:
            schema_defaults: Dict[str, Any] = {}
        elif isinstance(raw_schema_defaults, dict):
            schema_defaults = dict(raw_schema_defaults)
        else:
            raise PromptPackRuntimeError("block defaults must be an object", status_code=422)

        entry_overrides = {
            key: value
            for key, value in raw_block.items()
            if key not in {"id", "group", "defaults", "block_schema"}
        }

        try:
            compiled = _compile_schema_blocks(block_schema=block_schema, src=src)
        except Exception as exc:
            raise PromptPackRuntimeError(
                f"block_schema compile failed: {exc}",
                status_code=422,
            )

        schema_id = _normalize_optional_text(raw_block.get("id"))
        schema_group = _normalize_optional_text(raw_block.get("group"))

        expanded: List[Dict[str, Any]] = []
        for compiled_block in compiled:
            normalized = {**pack_defaults, **schema_defaults, **entry_overrides, **compiled_block}
            if pack_package_name and not _normalize_optional_text(normalized.get("package_name")):
                normalized["package_name"] = pack_package_name

            if schema_id or schema_group:
                tags_value = normalized.get("tags")
                tags = dict(tags_value) if isinstance(tags_value, dict) else {}
                metadata_value = normalized.get("block_metadata")
                metadata = dict(metadata_value) if isinstance(metadata_value, dict) else {}
                if schema_id:
                    metadata.setdefault("schema_block_id", schema_id)
                if schema_group:
                    tags.setdefault("schema_group", schema_group)
                    metadata.setdefault("schema_group", schema_group)
                normalized["tags"] = tags
                normalized["block_metadata"] = metadata

            expanded.append(normalized)
        return expanded

    async def _get_user(self, *, user_id: int) -> User:
        user = await self.session.get(User, user_id)
        if user is None:
            raise PromptPackRuntimeError("User not found", status_code=404)
        return user

    async def _get_owned_version(
        self,
        *,
        version_id: UUID,
        user_id: int,
    ) -> tuple[PromptPackVersion, PromptPackDraft]:
        stmt = (
            select(PromptPackVersion, PromptPackDraft)
            .join(PromptPackDraft, PromptPackVersion.draft_id == PromptPackDraft.id)
            .where(PromptPackVersion.id == version_id)
        )
        result = await self.session.execute(stmt)
        row = result.first()
        if row is None:
            raise PromptPackRuntimeError("Version not found", status_code=404)

        version, draft = row
        if draft.owner_user_id != user_id:
            raise PromptPackRuntimeError("Not allowed to access this version", status_code=403)
        return version, draft

    async def _list_draft_version_ids(self, *, draft_id: UUID) -> set[str]:
        result = await self.session.execute(
            select(PromptPackVersion.id).where(PromptPackVersion.draft_id == draft_id)
        )
        return {str(value) for (value,) in result.all() if value is not None}

    async def _list_publications_by_version_ids(
        self,
        *,
        version_ids: list[UUID],
    ) -> Dict[str, PromptPackPublication]:
        if not version_ids:
            return {}
        stmt = select(PromptPackPublication).where(PromptPackPublication.version_id.in_(version_ids))
        result = await self.session.execute(stmt)
        rows = result.scalars().all()
        return {str(row.version_id): row for row in rows}

    def _resolve_source_pack(
        self,
        *,
        version: PromptPackVersion,
        draft: PromptPackDraft,
    ) -> str:
        payload = _parse_compiled_schema_yaml(version.compiled_schema_yaml)
        package_name = _normalize_optional_text(payload.get("package_name"))
        if package_name:
            return package_name
        if _normalize_optional_text(draft.pack_slug):
            return str(draft.pack_slug).strip()
        return f"{draft.namespace}.{draft.pack_slug}"


def _parse_compiled_schema_yaml(value: Any) -> Dict[str, Any]:
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = yaml.safe_load(value)
    except Exception:
        return {}
    return dict(parsed) if isinstance(parsed, dict) else {}


def _normalize_optional_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _materialize_block_id(*, namespace: str, pack_slug: str, raw_block_id: str) -> str:
    prefix = f"{namespace}.{pack_slug}".strip(".")
    normalized_raw = str(raw_block_id).strip()
    if normalized_raw.startswith(f"{prefix}."):
        return normalized_raw
    return f"{prefix}.{normalized_raw}"


def _is_owned_private_pack_block(
    *,
    block: BlockPrimitive,
    owner_user_id: int,
    source_pack: str,
) -> bool:
    if bool(getattr(block, "is_public", True)):
        return False
    tags = getattr(block, "tags", None)
    if not isinstance(tags, dict):
        return False
    owner_tag = _normalize_optional_text(tags.get("owner_user_id"))
    source_pack_tag = _normalize_optional_text(tags.get("source_pack"))
    return owner_tag == str(owner_user_id) and source_pack_tag == source_pack


def _read_active_version_ids(preferences: Any) -> List[str]:
    prefs = dict(preferences) if isinstance(preferences, dict) else {}
    root = prefs.get(_PREFERENCES_ROOT_KEY)
    if not isinstance(root, dict):
        return []
    raw_ids = root.get(_PREFERENCES_ACTIVE_VERSION_IDS_KEY)
    if not isinstance(raw_ids, list):
        return []

    normalized: List[str] = []
    seen: set[str] = set()
    for raw in raw_ids:
        try:
            token = str(UUID(str(raw)))
        except (TypeError, ValueError):
            continue
        if token in seen:
            continue
        seen.add(token)
        normalized.append(token)
    return normalized


def _write_active_version_ids(*, user: User, active_version_ids: Iterable[str]) -> None:
    prefs = dict(user.preferences) if isinstance(user.preferences, dict) else {}
    existing_root = prefs.get(_PREFERENCES_ROOT_KEY)
    root = dict(existing_root) if isinstance(existing_root, dict) else {}
    root[_PREFERENCES_ACTIVE_VERSION_IDS_KEY] = [str(value) for value in active_version_ids]
    prefs[_PREFERENCES_ROOT_KEY] = root
    user.preferences = prefs
    user.updated_at = utcnow()
