"""
ResourceGrantService — reusable CRUD over the generic ResourceGrant primitive.

Resource-agnostic: callers pass a ``resource_type`` and a scope dict. Adapters
(e.g. the provider-slots methods on ``AccountService``) build the scope and own
any resource-specific validation; this service just persists, upserts, lists,
and revokes grants. Bridge / review sharing can reuse it verbatim.
"""
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.grants import ResourceGrant, compute_scope_key
from pixsim7.backend.main.shared.datetime_utils import utcnow
from pixsim7.backend.main.shared.errors import ResourceNotFoundError


def _not_expired_clause():
    """SQL: grant has no expiry, or it's still in the future."""
    return or_(
        ResourceGrant.expires_at.is_(None),
        ResourceGrant.expires_at > func.now(),
    )


class ResourceGrantService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_or_update(
        self,
        *,
        owner_user_id: int,
        recipient_user_id: int,
        resource_type: str,
        scope: dict[str, Any],
        cap: Optional[int] = None,
        note: Optional[str] = None,
        expires_at: Optional[datetime] = None,
    ) -> ResourceGrant:
        """Upsert a grant keyed on (owner, recipient, resource_type, scope).

        Re-granting an identical scope (even if previously revoked/expired)
        reactivates and updates the existing row rather than duplicating.
        """
        if recipient_user_id == owner_user_id:
            raise ValueError("Cannot grant to yourself")

        scope = {k: v for k, v in (scope or {}).items() if v is not None}
        scope_key = compute_scope_key(resource_type, scope)

        existing = await self.db.execute(
            select(ResourceGrant).where(
                ResourceGrant.owner_user_id == owner_user_id,
                ResourceGrant.recipient_user_id == recipient_user_id,
                ResourceGrant.resource_type == resource_type,
                ResourceGrant.scope_key == scope_key,
            )
        )
        grant = existing.scalar_one_or_none()
        if grant is None:
            grant = ResourceGrant(
                owner_user_id=owner_user_id,
                recipient_user_id=recipient_user_id,
                resource_type=resource_type,
                scope=scope,
                scope_key=scope_key,
                cap=cap,
                note=note,
                expires_at=expires_at,
            )
            self.db.add(grant)
        else:
            grant.cap = cap
            grant.note = note
            grant.expires_at = expires_at
            grant.revoked_at = None
            grant.updated_at = utcnow()

        await self.db.flush()
        await self.db.refresh(grant)
        return grant

    async def list_issued(
        self, owner_user_id: int, resource_type: Optional[str] = None
    ) -> list[ResourceGrant]:
        """Active grants this owner has created."""
        stmt = select(ResourceGrant).where(
            ResourceGrant.owner_user_id == owner_user_id,
            ResourceGrant.revoked_at.is_(None),
            _not_expired_clause(),
        )
        if resource_type is not None:
            stmt = stmt.where(ResourceGrant.resource_type == resource_type)
        stmt = stmt.order_by(ResourceGrant.created_at.desc())
        return list((await self.db.execute(stmt)).scalars().all())

    async def list_received(
        self, recipient_user_id: int, resource_type: Optional[str] = None
    ) -> list[ResourceGrant]:
        """Active grants shared with this recipient."""
        stmt = select(ResourceGrant).where(
            ResourceGrant.recipient_user_id == recipient_user_id,
            ResourceGrant.revoked_at.is_(None),
            _not_expired_clause(),
        )
        if resource_type is not None:
            stmt = stmt.where(ResourceGrant.resource_type == resource_type)
        stmt = stmt.order_by(ResourceGrant.created_at.desc())
        return list((await self.db.execute(stmt)).scalars().all())

    async def get(self, grant_id: int) -> Optional[ResourceGrant]:
        return await self.db.get(ResourceGrant, grant_id)

    async def revoke(self, grant_id: int, owner_user_id: int) -> ResourceGrant:
        """Soft-revoke. Only the granting owner may revoke."""
        grant = await self.db.get(ResourceGrant, grant_id)
        if not grant or grant.revoked_at is not None:
            raise ResourceNotFoundError("ResourceGrant", grant_id)
        if grant.owner_user_id != owner_user_id:
            raise ValueError("Not your grant")
        grant.revoked_at = utcnow()
        grant.updated_at = grant.revoked_at
        await self.db.flush()
        await self.db.refresh(grant)
        return grant
