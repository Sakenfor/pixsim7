"""
Template CRUD Service - Generic service for template entity CRUD operations.

Provides a reusable service class that handles common CRUD operations
for any registered template type.

Usage:
    spec = get_template_crud_registry().get("locationTemplate")
    service = TemplateCRUDService(db, spec)

    # List with filters
    items = await service.list(limit=20, filters={"is_active": True})

    # Get by ID
    item = await service.get(uuid)

    # Create
    item = await service.create({"name": "Town Square", "location_id": "town-square"})

    # Update
    item = await service.update(uuid, {"name": "Updated Name"})

    # Delete (soft or hard based on spec)
    success = await service.delete(uuid)
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Generic, List, Optional, Tuple, TypeVar, Type
from uuid import UUID

from sqlalchemy import select, func, and_, or_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

from .crud_registry import TemplateCRUDSpec

T = TypeVar("T", bound=SQLModel)


class TemplateCRUDService(Generic[T]):
    """
    Generic CRUD service for template entities.

    Handles list, get, create, update, delete operations based on
    the TemplateCRUDSpec configuration.

    Type Parameters:
        T: The SQLModel type for the template entity

    Attributes:
        db: Async database session
        spec: CRUD specification for this template type
        model: The SQLModel class (shorthand for spec.model)
    """

    def __init__(self, db: AsyncSession, spec: TemplateCRUDSpec):
        self.db = db
        self.spec = spec
        self.model: Type[T] = spec.model

    async def list(
        self,
        *,
        limit: Optional[int] = None,
        offset: int = 0,
        filters: Optional[Dict[str, Any]] = None,
        order_by: Optional[str] = None,
        order_desc: Optional[bool] = None,
        search: Optional[str] = None,
        search_fields: Optional[List[str]] = None,
    ) -> Tuple[List[T], int]:
        """
        List template entities with pagination and filtering.

        Args:
            limit: Max results (uses spec.default_limit if None)
            offset: Pagination offset
            filters: Field filters (e.g., {"is_active": True})
            order_by: Field to order by (uses spec.list_order_by if None)
            order_desc: Descending order (uses spec.list_order_desc if None)
            search: Search term for text fields
            search_fields: Fields to search in (defaults to ["name"])

        Returns:
            Tuple of (items, total_count)
        """
        # Apply defaults
        limit = min(limit or self.spec.default_limit, self.spec.max_limit)
        order_by = order_by or self.spec.list_order_by
        order_desc = order_desc if order_desc is not None else self.spec.list_order_desc
        search_fields = search_fields or ["name"]

        # Build base query
        query = select(self.model)
        count_query = select(func.count()).select_from(self.model)

        # Apply filters
        conditions = []
        if filters:
            for field_name, value in filters.items():
                if field_name in self.spec.filterable_fields or field_name == "is_active":
                    if hasattr(self.model, field_name):
                        column = getattr(self.model, field_name)
                        if isinstance(value, list):
                            conditions.append(column.in_(value))
                        else:
                            conditions.append(column == value)

        # Apply search
        if search and search_fields:
            search_conditions = []
            for field_name in search_fields:
                if hasattr(self.model, field_name):
                    column = getattr(self.model, field_name)
                    search_conditions.append(column.ilike(f"%{search}%"))
            if search_conditions:
                conditions.append(or_(*search_conditions))

        if conditions:
            query = query.where(and_(*conditions))
            count_query = count_query.where(and_(*conditions))

        # Get total count
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Apply ordering
        if hasattr(self.model, order_by):
            order_column = getattr(self.model, order_by)
            query = query.order_by(desc(order_column) if order_desc else asc(order_column))

        # Apply pagination
        query = query.offset(offset).limit(limit)

        # Execute
        result = await self.db.execute(query)
        items = list(result.scalars().all())

        return items, total

    async def get(self, entity_id: Any) -> Optional[T]:
        """
        Get a single template entity by ID.

        Args:
            entity_id: The entity ID (will be parsed via spec.id_parser)

        Returns:
            The entity or None if not found
        """
        parsed_id = self.spec.id_parser(entity_id)
        id_column = getattr(self.model, self.spec.id_field)

        query = select(self.model).where(id_column == parsed_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_unique_field(self, value: Any) -> Optional[T]:
        """
        Get entity by unique field (e.g., location_id, item_id).

        Args:
            value: The unique field value

        Returns:
            The entity or None if not found
        """
        if not self.spec.unique_field:
            return None

        column = getattr(self.model, self.spec.unique_field)
        query = select(self.model).where(column == value)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, data: Dict[str, Any]) -> T:
        """
        Create a new template entity.

        If spec.supports_upsert is True and unique_field exists in data,
        will update existing entity instead of creating.

        Args:
            data: Entity data

        Returns:
            The created/updated entity
        """
        # Check for upsert
        if self.spec.supports_upsert and self.spec.unique_field:
            unique_value = data.get(self.spec.unique_field)
            if unique_value:
                existing = await self.get_by_unique_field(unique_value)
                if existing:
                    return await self.update(
                        getattr(existing, self.spec.id_field),
                        data
                    )

        # Run before_create hook
        if self.spec.before_create:
            data = await self.spec.before_create(self.db, data)

        # Create entity
        entity = self.model(**data)
        self.db.add(entity)
        await self.db.commit()
        await self.db.refresh(entity)

        # Run after_create hook
        if self.spec.after_create:
            await self.spec.after_create(self.db, entity)

        return entity

    async def update(self, entity_id: Any, data: Dict[str, Any]) -> Optional[T]:
        """
        Update an existing template entity.

        Args:
            entity_id: The entity ID
            data: Fields to update

        Returns:
            The updated entity or None if not found
        """
        entity = await self.get(entity_id)
        if not entity:
            return None

        # Run before_update hook
        if self.spec.before_update:
            data = await self.spec.before_update(self.db, entity, data)

        # Update fields
        for field_name, value in data.items():
            if hasattr(entity, field_name) and field_name != self.spec.id_field:
                setattr(entity, field_name, value)

        # Update timestamp if exists
        if hasattr(entity, "updated_at"):
            entity.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(entity)

        # Run after_update hook
        if self.spec.after_update:
            await self.spec.after_update(self.db, entity)

        return entity

    async def delete(self, entity_id: Any, hard: bool = False) -> bool:
        """
        Delete a template entity.

        Args:
            entity_id: The entity ID
            hard: If True, hard delete even if soft delete is supported

        Returns:
            True if deleted, False if not found
        """
        entity = await self.get(entity_id)
        if not entity:
            return False

        # Run before_delete hook
        if self.spec.before_delete:
            allow = await self.spec.before_delete(self.db, entity)
            if not allow:
                return False

        if self.spec.supports_soft_delete and not hard:
            # Soft delete
            if hasattr(entity, "is_active"):
                entity.is_active = False
                if hasattr(entity, "updated_at"):
                    entity.updated_at = datetime.utcnow()
                await self.db.commit()
        else:
            # Hard delete
            await self.db.delete(entity)
            await self.db.commit()

        # Run after_delete hook
        if self.spec.after_delete:
            await self.spec.after_delete(self.db, entity_id)

        return True

    async def bulk_create(self, items: List[Dict[str, Any]]) -> List[T]:
        """
        Create multiple entities in a single transaction.

        Args:
            items: List of entity data dicts

        Returns:
            List of created entities
        """
        created = []
        for data in items:
            entity = await self.create(data)
            created.append(entity)
        return created

    async def exists(self, entity_id: Any) -> bool:
        """Check if an entity exists by ID."""
        parsed_id = self.spec.id_parser(entity_id)
        id_column = getattr(self.model, self.spec.id_field)

        query = select(func.count()).select_from(self.model).where(id_column == parsed_id)
        result = await self.db.execute(query)
        count = result.scalar() or 0
        return count > 0

    async def count(self, filters: Optional[Dict[str, Any]] = None) -> int:
        """
        Count entities matching filters.

        Args:
            filters: Optional field filters

        Returns:
            Count of matching entities
        """
        query = select(func.count()).select_from(self.model)

        if filters:
            conditions = []
            for field_name, value in filters.items():
                if hasattr(self.model, field_name):
                    column = getattr(self.model, field_name)
                    conditions.append(column == value)
            if conditions:
                query = query.where(and_(*conditions))

        result = await self.db.execute(query)
        return result.scalar() or 0
