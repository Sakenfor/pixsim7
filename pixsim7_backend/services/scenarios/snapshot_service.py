"""
Snapshot Service - Capture and restore world+session state
"""
from __future__ import annotations
from typing import Optional, List
import json
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7_backend.domain.game.models import GameWorld, GameWorldState, GameSession
from pixsim7_backend.domain.scenarios.models import WorldSnapshot, SessionSnapshot


class SnapshotService:
    """
    Service for capturing and restoring world+session snapshots.

    Snapshots can be:
    - Stored as JSON files for test scenarios
    - Kept in memory for ephemeral CI tests
    - Used to create reproducible test states
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def capture_world_snapshot(
        self,
        world_id: int,
        session_ids: Optional[List[int]] = None
    ) -> WorldSnapshot:
        """
        Capture a snapshot of a world and optionally specific sessions.

        Args:
            world_id: ID of the world to snapshot
            session_ids: Optional list of specific session IDs to include.
                        If None, all sessions linked to this world are captured.

        Returns:
            WorldSnapshot containing world state and session states

        Raises:
            ValueError: If world not found
        """
        # Fetch world
        world = await self.db.get(GameWorld, world_id)
        if not world:
            raise ValueError(f"World {world_id} not found")

        # Fetch world state
        world_state = await self.db.get(GameWorldState, world_id)
        world_time = world_state.world_time if world_state else 0.0

        # Fetch sessions
        if session_ids is not None:
            # Fetch specific sessions
            sessions = []
            for session_id in session_ids:
                session = await self.db.get(GameSession, session_id)
                if session and session.world_id == world_id:
                    sessions.append(session)
        else:
            # Fetch all sessions for this world
            result = await self.db.execute(
                select(GameSession).where(GameSession.world_id == world_id)
            )
            sessions = list(result.scalars().all())

        # Build session snapshots
        session_snapshots = [
            SessionSnapshot(
                session_id=session.id,
                flags=session.flags or {},
                relationships=session.relationships or {},
                world_time=session.world_time,
                version=session.version
            )
            for session in sessions
        ]

        # Build world snapshot
        snapshot = WorldSnapshot(
            world_id=world.id,
            world_meta=world.meta or {},
            world_time=world_time,
            sessions=session_snapshots
        )

        return snapshot

    async def restore_world_snapshot(
        self,
        snapshot: WorldSnapshot,
        *,
        restore_world_id: Optional[int] = None
    ) -> int:
        """
        Restore a world snapshot.

        WARNING: This is a dev-only / test operation. It will overwrite
        existing world and session state!

        Args:
            snapshot: WorldSnapshot to restore
            restore_world_id: Optional target world ID. If provided, restores
                            into existing world. If None, creates a new world.

        Returns:
            ID of the restored/created world

        Raises:
            ValueError: If restore_world_id provided but world not found
        """
        # Determine target world
        if restore_world_id is not None:
            # Restore into existing world
            world = await self.db.get(GameWorld, restore_world_id)
            if not world:
                raise ValueError(f"Target world {restore_world_id} not found")

            # Update world meta
            world.meta = snapshot.world_meta
            self.db.add(world)

            # Update or create world state
            world_state = await self.db.get(GameWorldState, restore_world_id)
            if world_state:
                world_state.world_time = snapshot.world_time
            else:
                world_state = GameWorldState(
                    world_id=restore_world_id,
                    world_time=snapshot.world_time
                )
            self.db.add(world_state)

            target_world_id = restore_world_id
        else:
            # Create new world
            # Note: We need a owner_user_id - for test scenarios we'll use -1
            # to indicate this is a test/snapshot world
            world = GameWorld(
                owner_user_id=-1,  # Special marker for test worlds
                name=f"Snapshot_{snapshot.world_id}",
                meta=snapshot.world_meta
            )
            self.db.add(world)
            await self.db.flush()  # Get the new world ID

            # Create world state
            world_state = GameWorldState(
                world_id=world.id,
                world_time=snapshot.world_time
            )
            self.db.add(world_state)

            target_world_id = world.id

        await self.db.commit()

        # Restore sessions
        # Note: Sessions reference scene_id and current_node_id which we don't
        # snapshot. For test scenarios, these would need to be set up separately
        # or the snapshot would need to include scene context.
        # For now, we only restore sessions if they already exist.
        for session_snapshot in snapshot.sessions:
            session = await self.db.get(GameSession, session_snapshot.session_id)
            if session:
                session.flags = session_snapshot.flags
                session.relationships = session_snapshot.relationships
                session.world_time = session_snapshot.world_time
                session.version = session_snapshot.version
                session.world_id = target_world_id
                self.db.add(session)

        await self.db.commit()

        return target_world_id

    async def save_snapshot_to_file(
        self,
        snapshot: WorldSnapshot,
        file_path: str | Path
    ) -> None:
        """
        Save a snapshot to a JSON file.

        Args:
            snapshot: WorldSnapshot to save
            file_path: Path to save the JSON file
        """
        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, 'w') as f:
            json.dump(snapshot.model_dump(), f, indent=2)

    @staticmethod
    def load_snapshot_from_file(file_path: str | Path) -> WorldSnapshot:
        """
        Load a snapshot from a JSON file.

        Args:
            file_path: Path to the JSON file

        Returns:
            Loaded WorldSnapshot
        """
        path = Path(file_path)
        with open(path, 'r') as f:
            data = json.load(f)

        return WorldSnapshot(**data)
