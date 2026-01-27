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

    # Advanced filters
    items = await service.list(advanced_filters={
        "created_at": {"gte": "2024-01-01"},
        "name": {"ilike": "%tower%"}
    })

    # With owner scoping
    service = TemplateCRUDService(db, spec, owner_id=user.id)
    items = await service.list()  # Auto-filtered by owner
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Generic, List, Optional, Tuple, TypeVar, Type, Union
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, func, and_, or_, desc, asc, not_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel

from .crud_registry import TemplateCRUDSpec, FilterOperator, NestedEntitySpec
from pixsim7.backend.main.services.ownership import OwnershipScope, apply_ownership_filter

T = TypeVar("T", bound=SQLModel)


class CRUDValidationError(Exception):
    """Raised when validation fails."""
    def __init__(self, message: str, field: Optional[str] = None):
        self.message = message
        self.field = field
        super().__init__(message)


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
        owner_id: Optional owner ID for scoped queries
        user: Optional user object for ownership policies
        world_id: Optional world ID for ownership policies
        session_id: Optional session ID for ownership policies
    """

    def __init__(
        self,
        db: AsyncSession,
        spec: TemplateCRUDSpec,
        owner_id: Optional[int] = None,
        user: Any = None,
        world_id: Optional[int] = None,
        session_id: Optional[int] = None,
    ):
        self.db = db
        self.spec = spec
        self.model: Type[T] = spec.model
        self.owner_id = owner_id
        self.user = user
        self.world_id = world_id
        self.session_id = session_id

    def _apply_owner_scope(self, query: Any) -> Any:
        """Apply owner scoping if configured."""
        if self.spec.scope_to_owner and self.spec.owner_field and self.owner_id:
            if hasattr(self.model, self.spec.owner_field):
                column = getattr(self.model, self.spec.owner_field)
                query = query.where(column == self.owner_id)
        if self.spec.ownership_policy:
            query = apply_ownership_filter(
                query,
                model=self.model,
                policy=self.spec.ownership_policy,
                user=self.user,
                owner_id=self.owner_id,
                world_id=self.world_id,
                session_id=self.session_id,
            )
        return query

    def _build_filter_condition(
        self,
        column: Any,
        operator: FilterOperator,
        value: Any,
    ) -> Any:
        """Build a SQLAlchemy condition for a filter operator."""
        if operator == FilterOperator.EQ:
            return column == value
        elif operator == FilterOperator.NE:
            return column != value
        elif operator == FilterOperator.GT:
            return column > value
        elif operator == FilterOperator.GTE:
            return column >= value
        elif operator == FilterOperator.LT:
            return column < value
        elif operator == FilterOperator.LTE:
            return column <= value
        elif operator == FilterOperator.IN:
            return column.in_(value if isinstance(value, list) else [value])
        elif operator == FilterOperator.NOT_IN:
            return not_(column.in_(value if isinstance(value, list) else [value]))
        elif operator == FilterOperator.LIKE:
            return column.like(value)
        elif operator == FilterOperator.ILIKE:
            return column.ilike(value)
        elif operator == FilterOperator.IS_NULL:
            return column.is_(None)
        elif operator == FilterOperator.NOT_NULL:
            return column.isnot(None)
        elif operator == FilterOperator.CONTAINS:
            # For JSONB contains
            return column.contains(value)
        else:
            return column == value

    def _apply_advanced_filters(
        self,
        query: Any,
        advanced_filters: Dict[str, Dict[str, Any]],
    ) -> Tuple[Any, List[Any]]:
        """
        Apply advanced filters with operators.

        Args:
            query: SQLAlchemy query
            advanced_filters: Dict of field -> {operator: value}
                e.g., {"created_at": {"gte": "2024-01-01"}, "name": {"ilike": "%test%"}}

        Returns:
            Tuple of (modified query, list of conditions)
        """
        conditions = []
        for field_name, ops in advanced_filters.items():
            if not hasattr(self.model, field_name):
                continue

            column = getattr(self.model, field_name)

            # Check if this field has advanced filter config
            filter_config = self.spec.get_filter_field(field_name)
            allowed_ops = (
                [op.value for op in filter_config.operators]
                if filter_config else [FilterOperator.EQ.value]
            )

            for op_str, value in ops.items():
                if op_str not in allowed_ops:
                    # Skip unsupported operators for this field
                    continue
                try:
                    operator = FilterOperator(op_str)
                    condition = self._build_filter_condition(column, operator, value)
                    conditions.append(condition)
                except ValueError:
                    # Unknown operator, skip
                    pass

        return query, conditions

    async def list(
        self,
        *,
        limit: Optional[int] = None,
        offset: int = 0,
        filters: Optional[Dict[str, Any]] = None,
        advanced_filters: Optional[Dict[str, Dict[str, Any]]] = None,
        order_by: Optional[str] = None,
        order_desc: Optional[bool] = None,
        search: Optional[str] = None,
        search_fields: Optional[List[str]] = None,
        parent_id: Optional[Any] = None,
        include_inactive: bool = False,
        transform: bool = True,
    ) -> Tuple[List[Any], int]:
        """
        List template entities with pagination and filtering.

        Args:
            limit: Max results (uses spec.default_limit if None)
            offset: Pagination offset
            filters: Simple field filters (e.g., {"is_active": True})
            advanced_filters: Advanced filters with operators
                e.g., {"created_at": {"gte": "2024-01-01"}}
            order_by: Field to order by (uses spec.list_order_by if None)
            order_desc: Descending order (uses spec.list_order_desc if None)
            search: Search term for text fields
            search_fields: Fields to search in (uses spec.search_fields if None)
            parent_id: Filter by parent (if parent_field is configured)
            include_inactive: If True, include is_active=False entities
            transform: If True, apply response transformation

        Returns:
            Tuple of (items, total_count)
        """
        # Apply defaults
        limit = min(limit or self.spec.default_limit, self.spec.max_limit)
        order_by = order_by or self.spec.list_order_by
        order_desc = order_desc if order_desc is not None else self.spec.list_order_desc
        search_fields = search_fields or self.spec.search_fields

        # Build base query
        query = select(self.model)
        count_query = select(func.count()).select_from(self.model)

        # Apply owner scoping
        query = self._apply_owner_scope(query)
        count_query = self._apply_owner_scope(count_query)

        # Apply parent filter
        if parent_id and self.spec.parent_field:
            if hasattr(self.model, self.spec.parent_field):
                column = getattr(self.model, self.spec.parent_field)
                query = query.where(column == parent_id)
                count_query = count_query.where(column == parent_id)

        # Apply simple filters
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

        # Apply advanced filters
        if advanced_filters:
            _, adv_conditions = self._apply_advanced_filters(query, advanced_filters)
            conditions.extend(adv_conditions)

        # Apply custom filter builder
        if self.spec.custom_filter_builder and filters:
            query = self.spec.custom_filter_builder(query, filters)
            count_query = self.spec.custom_filter_builder(count_query, filters)

        # Apply is_active filter (unless include_inactive is True)
        if not include_inactive and hasattr(self.model, "is_active"):
            # Don't add if already in filters
            if not filters or "is_active" not in filters:
                conditions.append(getattr(self.model, "is_active") == True)

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

        # Apply transformation
        if transform:
            items = await self._transform_list(items)

        return items, total

    async def _transform_list(self, items: List[T]) -> List[Any]:
        """Apply list item transformation."""
        if self.spec.transform_list_item:
            return [self.spec.transform_list_item(item) for item in items]
        elif self.spec.transform_response:
            return [self.spec.transform_response(item) for item in items]
        elif self.spec.async_transform_response:
            return [await self.spec.async_transform_response(self.db, item) for item in items]
        return items

    async def transform_response(self, entity: T) -> Any:
        """Apply response transformation to a single entity."""
        if self.spec.async_transform_response:
            return await self.spec.async_transform_response(self.db, entity)
        elif self.spec.transform_response:
            return self.spec.transform_response(entity)
        return entity

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
        query = self._apply_owner_scope(query)
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
        query = self._apply_owner_scope(query)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(
        self,
        data: Dict[str, Any],
        skip_validation: bool = False,
    ) -> T:
        """
        Create a new template entity.

        If spec.supports_upsert is True and unique_field exists in data,
        will update existing entity instead of creating.

        Args:
            data: Entity data
            skip_validation: If True, skip validation hooks

        Returns:
            The created/updated entity

        Raises:
            CRUDValidationError: If validation fails
        """
        # Run validation hook
        if not skip_validation and self.spec.validate_create:
            valid, error_msg = await self.spec.validate_create(data)
            if not valid:
                raise CRUDValidationError(error_msg or "Validation failed")

        # Check for upsert
        if self.spec.supports_upsert and self.spec.unique_field:
            unique_value = data.get(self.spec.unique_field)
            if unique_value:
                existing = await self.get_by_unique_field(unique_value)
                if existing:
                    return await self.update(
                        getattr(existing, self.spec.id_field),
                        data,
                        skip_validation=True,  # Already validated
                    )

        # Set owner if configured
        if self.spec.owner_field and self.owner_id and hasattr(self.model, self.spec.owner_field):
            data[self.spec.owner_field] = self.owner_id
        if self.spec.ownership_policy:
            if (
                self.spec.ownership_policy.scope == OwnershipScope.WORLD
                and self.spec.ownership_policy.world_field
                and self.world_id is not None
                and hasattr(self.model, self.spec.ownership_policy.world_field)
            ):
                data[self.spec.ownership_policy.world_field] = self.world_id
            if (
                self.spec.ownership_policy.scope == OwnershipScope.SESSION
                and self.spec.ownership_policy.session_field
                and self.session_id is not None
                and hasattr(self.model, self.spec.ownership_policy.session_field)
            ):
                data[self.spec.ownership_policy.session_field] = self.session_id

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

    async def update(
        self,
        entity_id: Any,
        data: Dict[str, Any],
        skip_validation: bool = False,
    ) -> Optional[T]:
        """
        Update an existing template entity.

        Args:
            entity_id: The entity ID
            data: Fields to update
            skip_validation: If True, skip validation hooks

        Returns:
            The updated entity or None if not found

        Raises:
            CRUDValidationError: If validation fails
        """
        entity = await self.get(entity_id)
        if not entity:
            return None

        # Check owner access
        if self.spec.scope_to_owner and self.spec.owner_field and self.owner_id:
            owner_value = getattr(entity, self.spec.owner_field, None)
            if owner_value != self.owner_id:
                return None  # Not authorized

        # Run validation hook
        if not skip_validation and self.spec.validate_update:
            valid, error_msg = await self.spec.validate_update(data)
            if not valid:
                raise CRUDValidationError(error_msg or "Validation failed")

        # Run before_update hook
        if self.spec.before_update:
            data = await self.spec.before_update(self.db, entity, data)

        # Update fields (excluding protected fields)
        protected_fields = {self.spec.id_field, self.spec.owner_field, "created_at"}
        if self.spec.ownership_policy:
            if self.spec.ownership_policy.owner_field:
                protected_fields.add(self.spec.ownership_policy.owner_field)
            if self.spec.ownership_policy.world_field:
                protected_fields.add(self.spec.ownership_policy.world_field)
            if self.spec.ownership_policy.session_field:
                protected_fields.add(self.spec.ownership_policy.session_field)
        for field_name, value in data.items():
            if hasattr(entity, field_name) and field_name not in protected_fields:
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
        query = self._apply_owner_scope(query)
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

        # Apply owner scoping
        query = self._apply_owner_scope(query)

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

    # =========================================================================
    # Hierarchy Methods
    # =========================================================================

    async def get_children(
        self,
        parent_id: Any,
        child_kind: Optional[str] = None,
    ) -> List[T]:
        """
        Get child entities of a parent.

        Requires parent_field to be configured.

        Args:
            parent_id: The parent entity ID
            child_kind: Optional filter for specific child kind

        Returns:
            List of child entities
        """
        if not self.spec.parent_field:
            return []

        items, _ = await self.list(parent_id=parent_id, include_inactive=True)
        return items

    async def get_parent(self, entity_id: Any) -> Optional[T]:
        """
        Get the parent entity of a given entity.

        Requires parent_field and parent_kind to be configured.

        Args:
            entity_id: The entity ID

        Returns:
            The parent entity or None
        """
        if not self.spec.parent_field or not self.spec.parent_kind:
            return None

        entity = await self.get(entity_id)
        if not entity:
            return None

        parent_id = getattr(entity, self.spec.parent_field, None)
        if not parent_id:
            return None

        # Get parent using parent kind's spec
        from .crud_registry import get_template_crud_registry
        registry = get_template_crud_registry()
        parent_spec = registry.get_or_none(self.spec.parent_kind)
        if not parent_spec:
            return None

        parent_service = TemplateCRUDService(
            self.db,
            parent_spec,
            owner_id=self.owner_id,
            user=self.user,
            world_id=self.world_id,
            session_id=self.session_id,
        )
        return await parent_service.get(parent_id)

    async def get_ancestors(self, entity_id: Any, max_depth: int = 10) -> List[T]:
        """
        Get all ancestors up the hierarchy.

        Args:
            entity_id: Starting entity ID
            max_depth: Maximum depth to traverse

        Returns:
            List of ancestors (nearest first)
        """
        ancestors = []
        current_id = entity_id
        depth = 0

        while current_id and depth < max_depth:
            entity = await self.get(current_id)
            if not entity:
                break

            parent_id = getattr(entity, self.spec.parent_field, None) if self.spec.parent_field else None
            if not parent_id:
                break

            parent = await self.get(parent_id)
            if parent:
                ancestors.append(parent)
                current_id = parent_id
            else:
                break

            depth += 1

        return ancestors

    # =========================================================================
    # Nested Entity Methods
    # =========================================================================

    def get_nested_service(
        self,
        nested_kind: str,
        parent_id: Any,
    ) -> Optional["NestedEntityService"]:
        """
        Get a service for managing nested entities under a parent.

        Args:
            nested_kind: Kind of nested entity
            parent_id: Parent entity ID

        Returns:
            NestedEntityService or None if not found
        """
        for nested_spec in self.spec.nested_entities:
            if nested_spec.kind == nested_kind:
                return NestedEntityService(
                    self.db,
                    nested_spec,
                    parent_id,
                    self.spec.id_parser(parent_id),
                    world_id=self.world_id,
                    session_id=self.session_id,
                )
        return None

    async def delete_with_nested(self, entity_id: Any, hard: bool = False) -> bool:
        """
        Delete entity and cascade delete nested entities if configured.

        Args:
            entity_id: The entity ID
            hard: If True, hard delete

        Returns:
            True if deleted
        """
        # Delete nested entities first if cascade is enabled
        for nested_spec in self.spec.nested_entities:
            if nested_spec.cascade_delete:
                nested_service = self.get_nested_service(nested_spec.kind, entity_id)
                if nested_service:
                    await nested_service.delete_all(hard=hard)

        # Delete the parent entity
        return await self.delete(entity_id, hard=hard)


class NestedEntityService(Generic[T]):
    """
    Service for managing nested entities under a parent.

    Provides CRUD operations scoped to a specific parent entity.
    """

    def __init__(
        self,
        db: AsyncSession,
        spec: NestedEntitySpec,
        parent_id: Any,
        parsed_parent_id: Any,
        world_id: Optional[int] = None,
        session_id: Optional[int] = None,
    ):
        self.db = db
        self.spec = spec
        self.model: Type[T] = spec.model
        self.parent_id = parent_id
        self.parsed_parent_id = parsed_parent_id
        self.world_id = world_id
        self.session_id = session_id

    async def list(self) -> List[T]:
        """List all nested entities under the parent."""
        parent_column = getattr(self.model, self.spec.parent_field)
        query = select(self.model).where(parent_column == self.parsed_parent_id)
        if self.world_id is not None and hasattr(self.model, "world_id"):
            query = query.where(getattr(self.model, "world_id") == self.world_id)
        if self.session_id is not None and hasattr(self.model, "session_id"):
            query = query.where(getattr(self.model, "session_id") == self.session_id)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get(self, entity_id: Any) -> Optional[T]:
        """Get a nested entity by ID."""
        parsed_id = self.spec.id_parser(entity_id)
        id_column = getattr(self.model, self.spec.id_field)
        parent_column = getattr(self.model, self.spec.parent_field)

        query = select(self.model).where(
            and_(
                id_column == parsed_id,
                parent_column == self.parsed_parent_id,
            )
        )
        if self.world_id is not None and hasattr(self.model, "world_id"):
            query = query.where(getattr(self.model, "world_id") == self.world_id)
        if self.session_id is not None and hasattr(self.model, "session_id"):
            query = query.where(getattr(self.model, "session_id") == self.session_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, data: Dict[str, Any]) -> T:
        """Create a nested entity."""
        data[self.spec.parent_field] = self.parsed_parent_id
        if self.world_id is not None and hasattr(self.model, "world_id"):
            data["world_id"] = self.world_id
        if self.session_id is not None and hasattr(self.model, "session_id"):
            data["session_id"] = self.session_id
        entity = self.model(**data)
        self.db.add(entity)
        await self.db.commit()
        await self.db.refresh(entity)
        return entity

    async def update(self, entity_id: Any, data: Dict[str, Any]) -> Optional[T]:
        """Update a nested entity."""
        entity = await self.get(entity_id)
        if not entity:
            return None

        protected_fields = {self.spec.id_field, self.spec.parent_field}
        if hasattr(self.model, "world_id"):
            protected_fields.add("world_id")
        if hasattr(self.model, "session_id"):
            protected_fields.add("session_id")
        for field_name, value in data.items():
            if hasattr(entity, field_name) and field_name not in protected_fields:
                setattr(entity, field_name, value)

        await self.db.commit()
        await self.db.refresh(entity)
        return entity

    async def delete(self, entity_id: Any) -> bool:
        """Delete a nested entity."""
        entity = await self.get(entity_id)
        if not entity:
            return False

        await self.db.delete(entity)
        await self.db.commit()
        return True

    async def delete_all(self, hard: bool = False) -> int:
        """Delete all nested entities under the parent."""
        items = await self.list()
        count = 0
        for item in items:
            entity_id = getattr(item, self.spec.id_field)
            if await self.delete(entity_id):
                count += 1
        return count

    async def replace_all(self, items: List[Dict[str, Any]]) -> List[T]:
        """Replace all nested entities with new ones."""
        await self.delete_all(hard=True)
        created = []
        for data in items:
            entity = await self.create(data)
            created.append(entity)
        return created
