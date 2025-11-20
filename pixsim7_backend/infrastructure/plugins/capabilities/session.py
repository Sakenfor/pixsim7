"""
Session Capability APIs

Provides read and write access to session state (flags, relationships).
"""

from typing import Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from ..permissions import PluginPermission, PermissionDeniedBehavior
from ..context_base import BaseCapabilityAPI


class SessionReadAPI(BaseCapabilityAPI):
    """
    Read-only access to session state.

    Required permission: session:read
    """

    def __init__(
        self,
        plugin_id: str,
        permissions: set[str],
        logger: structlog.BoundLogger,
        db: Optional[AsyncSession] = None,
    ):
        super().__init__(plugin_id, permissions, logger)
        self.db = db

    async def get_session(self, session_id: int) -> Optional[dict]:
        """
        Get session state by ID.

        Returns:
            Session data (id, world_id, flags, relationships) or None
        """
        if not self._check_permission(
            PluginPermission.SESSION_READ.value,
            "SessionReadAPI.get_session",
            PermissionDeniedBehavior.WARN,
        ):
            return None

        if not self.db:
            self.logger.error("SessionReadAPI requires database access")
            return None

        result = await self.db.execute(
            "SELECT id, world_id, flags, relationships FROM game_sessions WHERE id = :session_id",
            {"session_id": session_id}
        )
        row = result.fetchone()

        if not row:
            return None

        self.logger.debug(
            "get_session",
            plugin_id=self.plugin_id,
            session_id=session_id,
        )

        return {
            "id": row[0],
            "world_id": row[1],
            "flags": row[2] or {},
            "relationships": row[3] or {},
        }

    async def get_session_flag(self, session_id: int, flag_key: str) -> Optional[Any]:
        """
        Get a specific flag from session.flags.

        Args:
            session_id: Session ID
            flag_key: Dot-separated flag path (e.g., "stealth.pickpocket_attempts")

        Returns:
            Flag value or None if not found
        """
        session = await self.get_session(session_id)
        if not session:
            return None

        # Navigate nested keys
        value = session["flags"]
        for part in flag_key.split("."):
            if isinstance(value, dict):
                value = value.get(part)
            else:
                return None

        return value

    async def get_relationship(self, session_id: int, npc_key: str) -> Optional[dict]:
        """
        Get relationship state for an NPC.

        Args:
            session_id: Session ID
            npc_key: NPC key (e.g., "npc:123" or "role:friend")

        Returns:
            Relationship dict or None if not found
        """
        session = await self.get_session(session_id)
        if not session:
            return None

        return session["relationships"].get(npc_key)


class SessionMutationsAPI(BaseCapabilityAPI):
    """
    Write access to session state (flags, relationships).

    Required permission: session:write
    """

    def __init__(
        self,
        plugin_id: str,
        permissions: set[str],
        logger: structlog.BoundLogger,
        db: Optional[AsyncSession] = None,
    ):
        super().__init__(plugin_id, permissions, logger)
        self.db = db

    async def set_session_flag(
        self,
        session_id: int,
        flag_key: str,
        value: Any,
    ) -> bool:
        """
        Set a flag in session.flags.

        Args:
            session_id: Session ID
            flag_key: Flag key (will be namespaced under plugin ID)
            value: Flag value (must be JSON-serializable)

        Returns:
            True if successful, False otherwise
        """
        if not self._check_permission(
            PluginPermission.SESSION_WRITE.value,
            "SessionMutationsAPI.set_session_flag",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        if not self.db:
            self.logger.error("SessionMutationsAPI requires database access")
            return False

        from pixsim7_backend.domain.game.session import GameSession

        # Fetch session
        result = await self.db.execute(
            "SELECT id, flags FROM game_sessions WHERE id = :session_id",
            {"session_id": session_id}
        )
        row = result.fetchone()

        if not row:
            self.logger.warning(
                "Session not found",
                plugin_id=self.plugin_id,
                session_id=session_id,
            )
            return False

        session_id_db, flags = row
        flags = flags or {}

        # Namespace flag under plugin ID
        namespaced_key = f"plugin:{self.plugin_id}:{flag_key}"

        # Set flag
        flags[namespaced_key] = value

        # Update session
        await self.db.execute(
            "UPDATE game_sessions SET flags = :flags WHERE id = :session_id",
            {"flags": flags, "session_id": session_id}
        )
        await self.db.commit()

        self.logger.info(
            "set_session_flag",
            plugin_id=self.plugin_id,
            session_id=session_id,
            flag_key=namespaced_key,
        )

        return True

    async def update_relationship(
        self,
        session_id: int,
        npc_key: str,
        updates: dict,
    ) -> bool:
        """
        Update relationship state for an NPC.

        Args:
            session_id: Session ID
            npc_key: NPC key (e.g., "npc:123")
            updates: Partial relationship data to merge (affinity, trust, etc.)

        Returns:
            True if successful, False otherwise
        """
        if not self._check_permission(
            PluginPermission.SESSION_WRITE.value,
            "SessionMutationsAPI.update_relationship",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        if not self.db:
            return False

        # Fetch session
        result = await self.db.execute(
            "SELECT id, relationships FROM game_sessions WHERE id = :session_id",
            {"session_id": session_id}
        )
        row = result.fetchone()

        if not row:
            return False

        session_id_db, relationships = row
        relationships = relationships or {}

        # Get existing relationship or create new
        if npc_key not in relationships:
            relationships[npc_key] = {}

        # Merge updates
        relationships[npc_key].update(updates)

        # Track plugin provenance
        if "meta" not in relationships[npc_key]:
            relationships[npc_key]["meta"] = {}
        relationships[npc_key]["meta"]["last_modified_by"] = self.plugin_id

        # Update session
        await self.db.execute(
            "UPDATE game_sessions SET relationships = :relationships WHERE id = :session_id",
            {"relationships": relationships, "session_id": session_id}
        )
        await self.db.commit()

        self.logger.info(
            "update_relationship",
            plugin_id=self.plugin_id,
            session_id=session_id,
            npc_key=npc_key,
            updates=list(updates.keys()),
        )

        return True
