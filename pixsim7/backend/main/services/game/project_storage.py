from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game import GameProjectSnapshot, GameWorld
from pixsim7.backend.main.domain.game.schemas.project_bundle import (
    GameProjectBundle,
    ProjectOriginKind,
    ProjectProvenance,
)


class GameProjectStorageService:
    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _normalize_project_name(name: str) -> str:
        normalized_name = (name or "").strip()
        if not normalized_name:
            raise ValueError("project_name_required")
        return normalized_name

    @staticmethod
    def _normalize_origin_kind(kind: Optional[Any]) -> str:
        if isinstance(kind, ProjectOriginKind):
            return kind.value
        text = str(kind or "").strip().lower()
        if not text:
            return ProjectOriginKind.UNKNOWN.value
        try:
            return ProjectOriginKind(text).value
        except ValueError:
            return ProjectOriginKind.UNKNOWN.value

    @staticmethod
    def _normalize_origin_source_key(value: Optional[Any]) -> Optional[str]:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    @staticmethod
    def _normalize_origin_meta(value: Optional[Any]) -> Dict[str, Any]:
        if isinstance(value, dict):
            return dict(value)
        return {}

    def _apply_provenance(self, project: GameProjectSnapshot, provenance: ProjectProvenance) -> None:
        project.origin_kind = self._normalize_origin_kind(provenance.kind)
        project.origin_source_key = self._normalize_origin_source_key(provenance.source_key)
        project.origin_parent_project_id = provenance.parent_project_id
        project.origin_meta = self._normalize_origin_meta(provenance.meta)

    @staticmethod
    def _draft_provenance(draft_source_project_id: Optional[int]) -> ProjectProvenance:
        meta: Dict[str, Any] = {}
        if draft_source_project_id is not None:
            meta["draft_source_project_id"] = draft_source_project_id
        return ProjectProvenance(
            kind=ProjectOriginKind.DRAFT,
            parent_project_id=draft_source_project_id,
            meta=meta,
        )

    async def list_projects(
        self,
        *,
        owner_user_id: int,
        offset: int = 0,
        limit: int = 100,
        origin_kind: Optional[ProjectOriginKind] = None,
    ) -> List[GameProjectSnapshot]:
        limit = min(max(1, limit), 500)
        offset = max(0, offset)

        filters = [
            GameProjectSnapshot.owner_user_id == owner_user_id,
            GameProjectSnapshot.is_draft == False,  # noqa: E712
        ]
        if origin_kind is not None:
            filters.append(
                GameProjectSnapshot.origin_kind == self._normalize_origin_kind(origin_kind),
            )

        result = await self.db.execute(
            select(GameProjectSnapshot).where(*filters)
            .order_by(GameProjectSnapshot.updated_at.desc(), GameProjectSnapshot.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_project(
        self,
        *,
        owner_user_id: int,
        project_id: int,
        include_drafts: bool = False,
    ) -> Optional[GameProjectSnapshot]:
        filters = [
            GameProjectSnapshot.id == project_id,
            GameProjectSnapshot.owner_user_id == owner_user_id,
        ]
        if not include_drafts:
            filters.append(GameProjectSnapshot.is_draft == False)  # noqa: E712

        result = await self.db.execute(
            select(GameProjectSnapshot).where(*filters)
        )
        return result.scalar_one_or_none()

    async def save_project(
        self,
        *,
        owner_user_id: int,
        name: str,
        bundle: GameProjectBundle,
        source_world_id: Optional[int] = None,
        overwrite_project_id: Optional[int] = None,
        provenance: Optional[ProjectProvenance] = None,
    ) -> GameProjectSnapshot:
        normalized_name = self._normalize_project_name(name)

        if source_world_id is not None:
            world = await self.db.get(GameWorld, source_world_id)
            if not world or world.owner_user_id != owner_user_id:
                raise ValueError("world_not_found")

        project: Optional[GameProjectSnapshot] = None
        if overwrite_project_id is not None:
            project = await self.get_project(
                owner_user_id=owner_user_id,
                project_id=overwrite_project_id,
            )
            if not project:
                raise ValueError("project_not_found")

        is_new = project is None
        if not project:
            project = GameProjectSnapshot(owner_user_id=owner_user_id)

        project.name = normalized_name
        project.source_world_id = source_world_id
        project.schema_version = int(bundle.schema_version)
        project.bundle = bundle.model_dump(mode="json")
        if provenance is not None:
            self._apply_provenance(project, provenance)
        elif is_new:
            self._apply_provenance(
                project,
                ProjectProvenance(kind=ProjectOriginKind.USER),
            )

        self.db.add(project)
        await self.db.commit()
        await self.db.refresh(project)

        return project

    async def rename_project(
        self,
        *,
        owner_user_id: int,
        project_id: int,
        name: str,
    ) -> GameProjectSnapshot:
        normalized_name = self._normalize_project_name(name)
        project = await self.get_project(owner_user_id=owner_user_id, project_id=project_id)
        if not project:
            raise ValueError("project_not_found")

        project.name = normalized_name
        self.db.add(project)
        await self.db.commit()
        await self.db.refresh(project)

        return project

    async def delete_project(
        self,
        *,
        owner_user_id: int,
        project_id: int,
    ) -> bool:
        project = await self.get_project(owner_user_id=owner_user_id, project_id=project_id)
        if not project:
            return False

        await self.db.delete(project)
        await self.db.commit()
        return True

    async def duplicate_project(
        self,
        *,
        owner_user_id: int,
        project_id: int,
        name: str,
    ) -> GameProjectSnapshot:
        normalized_name = self._normalize_project_name(name)
        source_project = await self.get_project(owner_user_id=owner_user_id, project_id=project_id)
        if not source_project:
            raise ValueError("project_not_found")

        duplicated_project = GameProjectSnapshot(
            owner_user_id=owner_user_id,
            source_world_id=source_project.source_world_id,
            name=normalized_name,
            schema_version=source_project.schema_version,
            origin_kind=ProjectOriginKind.DUPLICATE.value,
            origin_source_key=source_project.origin_source_key,
            origin_parent_project_id=source_project.id,
            origin_meta={
                **self._normalize_origin_meta(source_project.origin_meta),
                **(
                    {"duplicated_from_project_id": source_project.id}
                    if source_project.id is not None
                    else {}
                ),
            },
            bundle=deepcopy(source_project.bundle or {}),
        )

        self.db.add(duplicated_project)
        await self.db.commit()
        await self.db.refresh(duplicated_project)

        return duplicated_project

    async def upsert_draft(
        self,
        *,
        owner_user_id: int,
        bundle: GameProjectBundle,
        source_world_id: Optional[int] = None,
        draft_source_project_id: Optional[int] = None,
    ) -> GameProjectSnapshot:
        bundle_json = bundle.model_dump(mode="json")
        schema_version = int(bundle.schema_version)

        existing = await self.get_latest_draft(
            owner_user_id=owner_user_id,
            draft_source_project_id=draft_source_project_id,
        )

        if existing:
            existing.bundle = bundle_json
            existing.schema_version = schema_version
            existing.source_world_id = source_world_id
            self._apply_provenance(existing, self._draft_provenance(draft_source_project_id))
            self.db.add(existing)
            await self.db.commit()
            await self.db.refresh(existing)
            return existing

        draft = GameProjectSnapshot(
            owner_user_id=owner_user_id,
            name="[draft]",
            source_world_id=source_world_id,
            schema_version=schema_version,
            bundle=bundle_json,
            is_draft=True,
            draft_source_project_id=draft_source_project_id,
        )
        self._apply_provenance(draft, self._draft_provenance(draft_source_project_id))
        self.db.add(draft)
        try:
            await self.db.commit()
            await self.db.refresh(draft)
            return draft
        except IntegrityError:
            # Another writer may have inserted the same unique draft scope in parallel.
            await self.db.rollback()

            existing = await self.get_latest_draft(
                owner_user_id=owner_user_id,
                draft_source_project_id=draft_source_project_id,
            )
            if not existing:
                raise

            existing.bundle = bundle_json
            existing.schema_version = schema_version
            existing.source_world_id = source_world_id
            self._apply_provenance(existing, self._draft_provenance(draft_source_project_id))
            self.db.add(existing)
            await self.db.commit()
            await self.db.refresh(existing)
            return existing

    async def get_latest_draft(
        self,
        *,
        owner_user_id: int,
        draft_source_project_id: Optional[int] = None,
    ) -> Optional[GameProjectSnapshot]:
        query = select(GameProjectSnapshot).where(
            GameProjectSnapshot.owner_user_id == owner_user_id,
            GameProjectSnapshot.is_draft == True,  # noqa: E712
        )

        if draft_source_project_id is not None:
            query = query.where(
                GameProjectSnapshot.draft_source_project_id == draft_source_project_id,
            )
        else:
            query = query.where(
                GameProjectSnapshot.draft_source_project_id.is_(None),
            )

        query = query.order_by(GameProjectSnapshot.updated_at.desc()).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def delete_draft(
        self,
        *,
        owner_user_id: int,
        draft_source_project_id: Optional[int] = None,
    ) -> bool:
        draft = await self.get_latest_draft(
            owner_user_id=owner_user_id,
            draft_source_project_id=draft_source_project_id,
        )
        if not draft:
            return False

        await self.db.delete(draft)
        await self.db.commit()
        return True

