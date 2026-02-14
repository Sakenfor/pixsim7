from __future__ import annotations

from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game import GameProjectSnapshot, GameWorld
from pixsim7.backend.main.domain.game.schemas.project_bundle import GameProjectBundle


class GameProjectStorageService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_projects(
        self,
        *,
        owner_user_id: int,
        offset: int = 0,
        limit: int = 100,
    ) -> List[GameProjectSnapshot]:
        limit = min(max(1, limit), 500)
        offset = max(0, offset)

        result = await self.db.execute(
            select(GameProjectSnapshot)
            .where(GameProjectSnapshot.owner_user_id == owner_user_id)
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
    ) -> Optional[GameProjectSnapshot]:
        result = await self.db.execute(
            select(GameProjectSnapshot).where(
                GameProjectSnapshot.id == project_id,
                GameProjectSnapshot.owner_user_id == owner_user_id,
            )
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
    ) -> GameProjectSnapshot:
        normalized_name = (name or "").strip()
        if not normalized_name:
            raise ValueError("project_name_required")

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

        if not project:
            project = GameProjectSnapshot(owner_user_id=owner_user_id)

        project.name = normalized_name
        project.source_world_id = source_world_id
        project.schema_version = int(bundle.schema_version)
        project.bundle = bundle.model_dump(mode="json")

        self.db.add(project)
        await self.db.commit()
        await self.db.refresh(project)

        return project
