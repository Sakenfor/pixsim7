"""DB service for user-authored prompt tool presets."""
from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.prompt import PromptToolPreset
from pixsim7.backend.main.shared.datetime_utils import utcnow

from .builtins import get_builtin_prompt_tool

_ALLOWED_CATEGORIES = {"rewrite", "compose", "edit", "extract", "analysis"}
_ALLOWED_REQUIRES = {"text", "composition_assets", "mask_asset", "regions"}


class PromptToolPresetError(Exception):
    """Error raised for prompt tool preset CRUD validation failures."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class PromptToolPresetService:
    """CRUD and resolution queries for prompt tool presets."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_presets(
        self,
        *,
        owner_user_id: Optional[int],
        is_public: Optional[bool],
        include_public_for_owner: bool,
        limit: int,
        offset: int,
    ) -> list[PromptToolPreset]:
        stmt = select(PromptToolPreset)

        if owner_user_id is not None and include_public_for_owner:
            stmt = stmt.where(
                or_(
                    PromptToolPreset.owner_user_id == owner_user_id,
                    PromptToolPreset.is_public.is_(True),
                )
            )
        elif owner_user_id is not None:
            stmt = stmt.where(PromptToolPreset.owner_user_id == owner_user_id)

        if is_public is not None:
            stmt = stmt.where(PromptToolPreset.is_public.is_(is_public))

        stmt = stmt.order_by(PromptToolPreset.updated_at.desc()).limit(limit).offset(offset)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_preset(self, entry_id: UUID) -> Optional[PromptToolPreset]:
        return await self.session.get(PromptToolPreset, entry_id)

    async def get_owner_preset(
        self,
        *,
        owner_user_id: int,
        preset_id: str,
    ) -> Optional[PromptToolPreset]:
        stmt = select(PromptToolPreset).where(
            PromptToolPreset.owner_user_id == owner_user_id,
            PromptToolPreset.preset_id == preset_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def resolve_executable_preset(
        self,
        *,
        preset_id: str,
        current_user_id: Optional[int],
    ) -> Optional[PromptToolPreset]:
        normalized_id = self._normalize_preset_id(preset_id)
        if current_user_id is not None:
            owned = await self.get_owner_preset(
                owner_user_id=current_user_id,
                preset_id=normalized_id,
            )
            if owned is not None:
                return owned

        shared_stmt = select(PromptToolPreset).where(
            PromptToolPreset.preset_id == normalized_id,
            PromptToolPreset.is_public.is_(True),
        ).order_by(PromptToolPreset.updated_at.desc())
        shared_result = await self.session.execute(shared_stmt)
        return shared_result.scalar_one_or_none()

    async def create_preset(
        self,
        *,
        owner_user_id: int,
        preset_id: str,
        label: str,
        description: Optional[str],
        category: str,
        enabled: bool,
        requires: list[str],
        defaults: dict[str, Any],
        owner_payload: Optional[dict[str, Any]] = None,
        is_public: bool = False,
        actor_is_admin: bool = False,
    ) -> PromptToolPreset:
        normalized_id = self._normalize_preset_id(preset_id)
        self._assert_not_builtin(normalized_id)
        normalized_label = self._normalize_label(label)
        normalized_category = self._normalize_category(category)
        normalized_requires = self._normalize_requires(requires)
        normalized_defaults = self._normalize_defaults(defaults)
        normalized_payload = self._normalize_owner_payload(owner_payload)

        if is_public and not actor_is_admin:
            raise PromptToolPresetError(
                "Only admins can create public/shared presets",
                status_code=403,
            )

        existing = await self.get_owner_preset(
            owner_user_id=owner_user_id,
            preset_id=normalized_id,
        )
        if existing is not None:
            raise PromptToolPresetError(
                f"Preset '{normalized_id}' already exists",
                status_code=409,
            )

        now = utcnow()
        row = PromptToolPreset(
            owner_user_id=owner_user_id,
            preset_id=normalized_id,
            label=normalized_label,
            description=(description or "").strip(),
            category=normalized_category,
            enabled=bool(enabled),
            is_public=bool(is_public),
            requires=normalized_requires,
            defaults=normalized_defaults,
            owner_payload=normalized_payload,
            created_at=now,
            updated_at=now,
        )
        self.session.add(row)
        await self.session.flush()
        return row

    async def update_preset(
        self,
        *,
        entry_id: UUID,
        preset_id: Optional[str] = None,
        label: Optional[str] = None,
        description: Optional[str] = None,
        category: Optional[str] = None,
        enabled: Optional[bool] = None,
        requires: Optional[list[str]] = None,
        defaults: Optional[dict[str, Any]] = None,
        owner_payload: Optional[dict[str, Any]] = None,
        is_public: Optional[bool] = None,
        actor_is_admin: bool = False,
    ) -> Optional[PromptToolPreset]:
        row = await self.get_preset(entry_id)
        if row is None:
            return None

        if preset_id is not None:
            normalized_id = self._normalize_preset_id(preset_id)
            self._assert_not_builtin(normalized_id)
            if normalized_id != row.preset_id:
                existing = await self.get_owner_preset(
                    owner_user_id=row.owner_user_id,
                    preset_id=normalized_id,
                )
                if existing is not None and existing.id != row.id:
                    raise PromptToolPresetError(
                        f"Preset '{normalized_id}' already exists",
                        status_code=409,
                    )
                row.preset_id = normalized_id

        if label is not None:
            row.label = self._normalize_label(label)
        if description is not None:
            row.description = description.strip()
        if category is not None:
            row.category = self._normalize_category(category)
        if enabled is not None:
            row.enabled = bool(enabled)
        if requires is not None:
            row.requires = self._normalize_requires(requires)
        if defaults is not None:
            row.defaults = self._normalize_defaults(defaults)
        if owner_payload is not None:
            row.owner_payload = self._normalize_owner_payload(owner_payload)
        if is_public is not None:
            if is_public and not actor_is_admin:
                raise PromptToolPresetError(
                    "Only admins can publish shared presets",
                    status_code=403,
                )
            row.is_public = bool(is_public)

        row.updated_at = utcnow()
        await self.session.flush()
        return row

    async def delete_preset(self, entry_id: UUID) -> bool:
        row = await self.get_preset(entry_id)
        if row is None:
            return False
        await self.session.delete(row)
        await self.session.flush()
        return True

    @staticmethod
    def _normalize_label(label: str) -> str:
        text = (label or "").strip()
        if not text:
            raise PromptToolPresetError("Label is required")
        if len(text) > 120:
            raise PromptToolPresetError("Label exceeds max length (120)")
        return text

    @staticmethod
    def _normalize_preset_id(preset_id: str) -> str:
        text = (preset_id or "").strip()
        if not text:
            raise PromptToolPresetError("preset_id is required")
        if len(text) > 120:
            raise PromptToolPresetError("preset_id exceeds max length (120)")
        return text

    @staticmethod
    def _normalize_category(category: str) -> str:
        text = (category or "").strip().lower()
        if text not in _ALLOWED_CATEGORIES:
            raise PromptToolPresetError(
                f"Unsupported category '{category}'",
                status_code=400,
            )
        return text

    @staticmethod
    def _normalize_requires(requires: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for raw in requires or []:
            if not isinstance(raw, str):
                continue
            value = raw.strip()
            if not value:
                continue
            if value not in _ALLOWED_REQUIRES:
                raise PromptToolPresetError(
                    f"Unsupported requires entry '{value}'",
                    status_code=400,
                )
            if value in seen:
                continue
            seen.add(value)
            normalized.append(value)
        return normalized

    @staticmethod
    def _normalize_defaults(defaults: dict[str, Any]) -> dict[str, Any]:
        if defaults is None:
            return {}
        if not isinstance(defaults, dict):
            raise PromptToolPresetError("defaults must be an object")
        return dict(defaults)

    @staticmethod
    def _normalize_owner_payload(payload: Optional[dict[str, Any]]) -> dict[str, Any]:
        if payload is None:
            return {}
        if not isinstance(payload, dict):
            raise PromptToolPresetError("owner_payload must be an object")
        return dict(payload)

    @staticmethod
    def _assert_not_builtin(preset_id: str) -> None:
        if get_builtin_prompt_tool(preset_id) is not None:
            raise PromptToolPresetError(
                f"preset_id '{preset_id}' is reserved by a builtin preset",
                status_code=409,
            )
