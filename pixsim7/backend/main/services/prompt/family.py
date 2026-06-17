"""
Prompt Family and Version Service

Core CRUD operations for prompt families and versions.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID
from datetime import datetime
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from pixsim7.backend.main.domain.prompt import (
    PromptFamily,
    PromptVersion,
)
from pixsim7.backend.main.domain.generation.models import Generation
from pixsim7.backend.main.domain.prompt.tag import PromptFamilyTag
from pixsim7.backend.main.services.tag import TagAssignment, TagRegistry
from pixsim7.backend.main.infrastructure.events.bus import event_bus
from .events import PROMPT_VERSION_CREATED
from .tag_deriver import derive_structural_tags
from .utils.diff import generate_inline_diff


def _slugify(text: str) -> str:
    """Simple slugify implementation"""
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text.strip('-')


class PromptFamilyService:
    """Service for managing prompt families and versions"""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ===== Prompt Family Management =====

    async def create_family(
        self,
        title: str,
        prompt_type: str,
        slug: Optional[str] = None,
        description: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        **kwargs
    ) -> PromptFamily:
        """Create a new prompt family

        Args:
            title: Human-readable title
            prompt_type: 'visual', 'narrative', or 'hybrid'
            slug: URL-safe identifier (auto-generated from title if not provided)
            description: Detailed description
            category: Category like 'romance', 'action', etc.
            tags: List of tags
            **kwargs: Additional fields (game_world_id, npc_id, etc.)

        Returns:
            Created PromptFamily
        """
        if not slug:
            slug = _slugify(title)

        family = PromptFamily(
            slug=slug,
            title=title,
            description=description,
            prompt_type=prompt_type,
            category=category,
            **kwargs
        )

        self.db.add(family)
        await self.db.commit()
        await self.db.refresh(family)

        if tags:
            await TagAssignment(self.db, PromptFamilyTag, "family_id").assign(
                family.id, tags, auto_create=True
            )

        await self._apply_derived_tags(family)

        return family

    async def get_family(self, family_id: UUID) -> Optional[PromptFamily]:
        """Get family by ID"""
        result = await self.db.execute(
            select(PromptFamily).where(PromptFamily.id == family_id)
        )
        return result.scalar_one_or_none()

    async def update_family(
        self,
        family_id: UUID,
        **fields: Any,
    ) -> Optional[PromptFamily]:
        """Update mutable fields on a prompt family.

        Accepts any combination of: title, description, category, tags, is_active.
        Returns updated family or None if not found.
        """
        family = await self.get_family(family_id)
        if not family:
            return None

        model_fields = {
            "title", "description", "category", "authoring_mode_id",
            "primary_character_id", "is_active",
        }
        new_tags = fields.pop("tags", None)
        structural_changed = False
        for key, value in fields.items():
            if key in model_fields and value is not None:
                setattr(family, key, value)
                if key in {"authoring_mode_id", "primary_character_id", "category"}:
                    structural_changed = True

        self.db.add(family)
        await self.db.commit()
        await self.db.refresh(family)

        if new_tags is not None:
            await TagAssignment(self.db, PromptFamilyTag, "family_id").replace(
                family.id, new_tags, auto_create=True
            )

        if structural_changed:
            await self._apply_derived_tags(family)

        return family

    async def _apply_derived_tags(self, family: PromptFamily) -> None:
        """Derive tags from structured authoring context and apply as source='derived'.

        Replaces any existing derived tags; never touches manual or ai tags.
        Silently no-ops on any failure.
        """
        try:
            from sqlalchemy import delete, select as sa_select

            derived_slugs = await derive_structural_tags(
                authoring_mode_id=family.authoring_mode_id,
                prompt_type=family.prompt_type,
                category=family.category,
                primary_character_id=family.primary_character_id,
                npc_id=family.npc_id,
                db=self.db,
            )
            if not derived_slugs:
                return

            registry = TagRegistry(self.db)

            # Load existing manual + ai tag_ids so we never overwrite them
            existing = await self.db.execute(
                sa_select(PromptFamilyTag).where(
                    PromptFamilyTag.family_id == family.id,
                    PromptFamilyTag.source != "derived",
                )
            )
            protected_tag_ids = {row.tag_id for row in existing.scalars().all()}

            # Replace existing derived tags
            await self.db.execute(
                delete(PromptFamilyTag).where(
                    PromptFamilyTag.family_id == family.id,
                    PromptFamilyTag.source == "derived",
                )
            )

            for slug in derived_slugs:
                tag = await registry.get_or_create_tag(slug)
                if tag.id not in protected_tag_ids:
                    self.db.add(PromptFamilyTag(
                        family_id=family.id,
                        tag_id=tag.id,
                        source="derived",
                    ))

            await self.db.commit()
        except Exception:
            import logging
            logging.getLogger(__name__).warning(
                "derived_tag_application_failed", exc_info=True
            )

    async def get_family_by_slug(self, slug: str) -> Optional[PromptFamily]:
        """Get family by slug"""
        result = await self.db.execute(
            select(PromptFamily).where(PromptFamily.slug == slug)
        )
        return result.scalar_one_or_none()

    async def list_families(
        self,
        prompt_type: Optional[str] = None,
        category: Optional[str] = None,
        is_active: bool = True,
        limit: int = 100,
        offset: int = 0
    ) -> List[PromptFamily]:
        """List prompt families with optional filtering"""
        query = select(PromptFamily)

        if prompt_type:
            query = query.where(PromptFamily.prompt_type == prompt_type)
        if category:
            query = query.where(PromptFamily.category == category)
        if is_active is not None:
            query = query.where(PromptFamily.is_active == is_active)

        query = query.order_by(PromptFamily.created_at.desc())
        query = query.limit(limit).offset(offset)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ===== Prompt Version Management =====

    async def create_version(
        self,
        family_id: UUID,
        prompt_text: str,
        commit_message: Optional[str] = None,
        author: Optional[str] = None,
        parent_version_id: Optional[UUID] = None,
        variables: Optional[Dict[str, Any]] = None,
        commit: bool = True,
        **kwargs
    ) -> PromptVersion:
        """Create a new prompt version

        Args:
            family_id: Parent family
            prompt_text: The actual prompt text
            commit_message: Description of changes
            author: Who created this version
            parent_version_id: Optional parent for branching
            variables: Template variables
            **kwargs: Additional fields (provider_hints, tags, etc.)

        Returns:
            Created PromptVersion
        """
        # Use shared versioning write primitives to avoid drift with
        # other versioned entities (assets/characters).
        from pixsim7.backend.main.services.prompt.git.versioning_adapter import (
            PromptVersioningService,
        )

        versioning = PromptVersioningService(self.db)

        parent_version = None
        if parent_version_id:
            parent_version = await versioning.get_entity(parent_version_id)
            if not parent_version:
                raise ValueError(f"Parent version {parent_version_id} not found")
            if parent_version.family_id != family_id:
                raise ValueError(
                    f"Parent version {parent_version_id} does not belong to family {family_id}"
                )

        # Auto-generate diff from parent if parent_version_id is provided
        diff_from_parent = None
        if parent_version is not None:
            diff_from_parent = generate_inline_diff(parent_version.prompt_text, prompt_text)

        # Keep provider_hints metadata-only.
        provider_hints = dict(kwargs.pop("provider_hints", {}) or {})
        provider_hints.pop("prompt_analysis", None)

        # Extract ai_tags before **kwargs reaches PromptVersion (not a model field)
        ai_tags: Optional[List[str]] = kwargs.pop("ai_tags", None)

        version = PromptVersion(
            prompt_text=prompt_text,
            prompt_hash=kwargs.pop("prompt_hash", None) or PromptVersion.compute_hash(prompt_text),
            author=author,
            variables=variables or {},
            provider_hints=provider_hints,
            diff_from_parent=diff_from_parent,
            **kwargs
        )

        self.db.add(version)
        await versioning.assign_version_metadata(
            new_version=version,
            family_id=family_id,
            commit_message=commit_message,
            parent_version=parent_version,
        )
        if commit:
            await self.db.commit()
        else:
            await self.db.flush()
        await self.db.refresh(version)

        if commit:
            family = await self.get_family(family_id)
            payload: dict = {
                "family_id": str(family_id),
                "version_id": str(version.id),
                "prompt_text": prompt_text,
                "authoring_mode_id": family.authoring_mode_id if family else None,
                "category": family.category if family else None,
            }
            if ai_tags is not None:
                payload["ai_tags"] = ai_tags
            await event_bus.publish(PROMPT_VERSION_CREATED, payload)

        return version

    async def adopt_prompt_into_family(
        self,
        family_id: UUID,
        *,
        prompt_text: str,
        commit_message: Optional[str] = None,
        author: Optional[str] = None,
        tags: Optional[List[str]] = None,
        provider_hints: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Promote a prompt into a family, *adopting* an existing one-off version
        (and its linked generations/assets) when the text matches — instead of
        creating an empty duplicate.

        QuickGen records a one-off ``PromptVersion`` (``family_id IS NULL``) per
        generation and links its assets there. The old "promote from history"
        path created a fresh, asset-less duplicate; this adopts the real one so
        the promoted version actually carries its generations.

        Resolution by normalized ``prompt_hash``:
          1. a version with this text is already in the family -> return it
             (idempotent; ``adopted=created=False``).
          2. an existing one-off version -> move it into the family. adopted=True.
          3. otherwise -> create a fresh version. created=True.

        Returns ``{"version", "adopted", "created"}``.
        """
        from pixsim7.backend.main.services.prompt.git.versioning_adapter import (
            PromptVersioningService,
        )

        family = await self.get_family(family_id)
        if family is None:
            raise LookupError(f"Prompt family {family_id} not found")

        prompt_hash = PromptVersion.compute_hash(prompt_text)

        existing = (
            await self.db.execute(
                select(PromptVersion).where(
                    PromptVersion.family_id == family_id,
                    PromptVersion.prompt_hash == prompt_hash,
                )
            )
        ).scalar_one_or_none()
        if existing is not None:
            return {"version": existing, "adopted": False, "created": False}

        oneoff = (
            await self.db.execute(
                select(PromptVersion)
                .where(
                    PromptVersion.family_id.is_(None),
                    PromptVersion.prompt_hash == prompt_hash,
                )
                .order_by(PromptVersion.created_at)
                .limit(1)
            )
        ).scalar_one_or_none()

        if oneoff is not None:
            next_number = await PromptVersioningService(self.db).get_next_version_number(
                family_id, lock=True
            )
            oneoff.family_id = family_id
            oneoff.version_number = next_number
            oneoff.parent_version_id = None
            oneoff.diff_from_parent = None
            if commit_message:
                oneoff.commit_message = commit_message
            if tags:
                oneoff.tags = list(dict.fromkeys([*(oneoff.tags or []), *tags]))
            if provider_hints:
                merged = dict(oneoff.provider_hints or {})
                merged.update(provider_hints)
                merged.pop("prompt_analysis", None)
                oneoff.provider_hints = merged
            if author and not oneoff.author:
                oneoff.author = author
            await self.db.commit()
            await self.db.refresh(oneoff)
            return {"version": oneoff, "adopted": True, "created": False}

        version = await self.create_version(
            family_id=family_id,
            prompt_text=prompt_text,
            commit_message=commit_message,
            author=author,
            tags=tags or [],
            provider_hints=provider_hints or {},
        )
        return {"version": version, "adopted": False, "created": True}

    async def move_version_to_family(
        self,
        version_id: UUID,
        *,
        target_family_id: Optional[UUID] = None,
        title: Optional[str] = None,
        prompt_type: Optional[str] = None,
        category: Optional[str] = None,
        reparent_children: bool = True,
    ) -> Dict[str, Any]:
        """Move a single prompt version into another family, or extract it into
        a brand-new family.

        The escape hatch for pulling a promoted prompt out of a shared catch-all
        family (e.g. "QuickGen History") into a standalone family of its own.

        - ``target_family_id`` None  -> create a new family (``title`` required)
          and move the version into it.
        - ``target_family_id`` given -> move the version into that family.

        The moved version becomes a root (``parent_version_id=None``) in the
        target and is assigned the next sequential ``version_number`` there. Any
        children that referenced it as a parent are reparented to the moved
        version's former parent, so the source family's history stays connected
        and a parent link never crosses a family boundary.

        Raises:
            LookupError: version or target family not found.
            ValueError:  title missing for new-family extract, the version is
                already in the target family, or an identical prompt
                (prompt_hash) already lives in the target family.
        """
        from pixsim7.backend.main.services.prompt.git.versioning_adapter import (
            PromptVersioningService,
        )

        version = await self.get_version(version_id)
        if version is None:
            raise LookupError(f"Prompt version {version_id} not found")

        source_family_id = version.family_id

        created = False
        if target_family_id is None:
            if not title or not title.strip():
                raise ValueError("title is required when creating a new family")
            resolved_type = prompt_type
            if not resolved_type and source_family_id is not None:
                source_family = await self.get_family(source_family_id)
                resolved_type = source_family.prompt_type if source_family else None
            target_family = await self.create_family(
                title=title.strip(),
                prompt_type=resolved_type or "visual",
                category=category,
            )
            target_family_id = target_family.id
            created = True
        else:
            target_family = await self.get_family(target_family_id)
            if target_family is None:
                raise LookupError(f"Prompt family {target_family_id} not found")

        if source_family_id is not None and source_family_id == target_family_id:
            raise ValueError("Version already belongs to the target family")

        # Respect the (prompt_hash, family_id) uniqueness constraint.
        collision = (
            await self.db.execute(
                select(PromptVersion.id).where(
                    PromptVersion.family_id == target_family_id,
                    PromptVersion.prompt_hash == version.prompt_hash,
                )
            )
        ).first()
        if collision is not None:
            raise ValueError("An identical prompt already exists in the target family")

        former_parent_id = version.parent_version_id

        # Keep the source family's history connected: children that pointed at
        # the moved version are reparented to its former parent (never left
        # dangling across the family boundary). Recompute their cached diff.
        reparented = 0
        if reparent_children and source_family_id is not None:
            former_parent_text: Optional[str] = None
            if former_parent_id is not None:
                fp = await self.get_version(former_parent_id)
                former_parent_text = fp.prompt_text if fp else None
            children = (
                await self.db.execute(
                    select(PromptVersion).where(
                        PromptVersion.parent_version_id == version_id,
                        PromptVersion.family_id == source_family_id,
                    )
                )
            ).scalars().all()
            for child in children:
                child.parent_version_id = former_parent_id
                child.diff_from_parent = (
                    generate_inline_diff(former_parent_text or "", child.prompt_text)
                    if former_parent_id is not None
                    else None
                )
                reparented += 1

        # Re-home the version as a root in the target family.
        next_number = await PromptVersioningService(self.db).get_next_version_number(
            target_family_id, lock=True
        )
        version.family_id = target_family_id
        version.version_number = next_number
        version.parent_version_id = None
        version.diff_from_parent = None

        await self.db.commit()
        await self.db.refresh(version)

        return {
            "version": version,
            "family": target_family,
            "created_family": created,
            "source_family_id": str(source_family_id) if source_family_id else None,
            "reparented_children": reparented,
        }

    async def get_version(self, version_id: UUID) -> Optional[PromptVersion]:
        """Get version by ID"""
        result = await self.db.execute(
            select(PromptVersion).where(PromptVersion.id == version_id)
        )
        return result.scalar_one_or_none()

    async def get_latest_version(self, family_id: UUID) -> Optional[PromptVersion]:
        """Get the latest version for a family"""
        result = await self.db.execute(
            select(PromptVersion)
            .where(PromptVersion.family_id == family_id)
            .order_by(PromptVersion.version_number.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_versions(
        self,
        family_id: UUID,
        limit: int = 100,
        offset: int = 0
    ) -> List[PromptVersion]:
        """List all versions for a family (newest first)"""
        result = await self.db.execute(
            select(PromptVersion)
            .where(PromptVersion.family_id == family_id)
            .order_by(PromptVersion.version_number.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())
