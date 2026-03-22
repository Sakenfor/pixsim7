"""
Declarative settings base for system_config-backed and user-preference settings.

Two base classes for two storage scopes:

``SettingsBase`` — global settings (system_config table, singleton per namespace)::

    class MediaSettings(SettingsBase):
        _namespace = "media_settings"
        ingest_on_asset_add: bool = Field(True, description="Auto-ingest new assets")

    settings = MediaSettings.get()  # singleton

``UserSettingsBase`` — per-user settings (users.preferences JSON column)::

    class ContentPreferences(UserSettingsBase):
        _namespace = "content"
        max_content_rating: str = Field("sfw", description="Maximum content rating")

    prefs = ContentPreferences.for_user(user)  # from User object
    prefs = ContentPreferences.from_dict(user.preferences.get("content", {}))

Both share:
- Declarative Pydantic fields with defaults, descriptions, and validators
- Auto-generated UpdateModel (all fields Optional, validators preserved)
- ``to_dict()`` serialization
"""
from __future__ import annotations

import copy
from typing import Any, ClassVar, Dict, Optional, Type, TYPE_CHECKING

from pydantic import BaseModel

if TYPE_CHECKING:
    from pixsim7.backend.main.domain import User


# ── Shared metaclass ──────────────────────────────────────────────────────

class _SettingsMeta(type(BaseModel)):
    """Metaclass that auto-generates UpdateModel on class creation."""

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)

    def __init__(cls, name: str, bases: tuple, namespace: dict, **kwargs: Any) -> None:
        super().__init__(name, bases, namespace, **kwargs)

        # Skip for base classes themselves
        if name in ("SettingsBase", "UserSettingsBase"):
            return

        cls._build_update_model()


# ── Shared update-model generation ────────────────────────────────────────

class _UpdateModelMixin:
    """Shared logic for auto-generating UpdateModel from Pydantic fields."""

    _UpdateModel: ClassVar[Optional[Type[BaseModel]]] = None

    @classmethod
    def _build_update_model(cls) -> None:
        """Auto-generate an Update model where all fields are Optional.

        Preserves Field metadata (ge, le, description, etc.) from the
        source model so that validation constraints carry over to patches.
        """
        field_definitions: Dict[str, Any] = {}
        for name, field_info in cls.model_fields.items():
            new_field = copy.copy(field_info)
            new_field.default = None
            new_field.annotation = Optional[field_info.annotation]
            field_definitions[name] = (Optional[field_info.annotation], new_field)

        update_cls = type(
            f"{cls.__name__}Update",
            (BaseModel,),
            {"__annotations__": {n: t for n, (t, _) in field_definitions.items()},
             **{n: fi for n, (_, fi) in field_definitions.items()}},
        )
        cls._UpdateModel = update_cls

    @classmethod
    def get_update_model(cls) -> Type[BaseModel]:
        """The auto-generated Update model (all fields Optional)."""
        if cls._UpdateModel is None:
            cls._build_update_model()
        return cls._UpdateModel

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dict (for API responses and DB persistence)."""
        return self.model_dump()


# ═══════════════════════════════════════════════════════════════════════════
# SettingsBase — global settings (system_config table, singleton)
# ═══════════════════════════════════════════════════════════════════════════

class SettingsBase(_UpdateModelMixin, BaseModel, metaclass=_SettingsMeta):
    """
    Base class for global, system_config-backed settings.

    One singleton per namespace. Admin-controlled.
    """

    _namespace: ClassVar[str] = ""
    _instance: ClassVar[Optional["SettingsBase"]] = None

    model_config = {"extra": "ignore"}

    # ── Factory ───────────────────────────────────────────────────────────

    @classmethod
    def get(cls) -> "SettingsBase":
        """Get or create the singleton instance, loaded from cache."""
        if cls._instance is None:
            cls._instance = cls._from_cache()
        return cls._instance

    @classmethod
    def _from_cache(cls) -> "SettingsBase":
        """Create instance from the in-memory settings cache."""
        from pixsim7.backend.main.services.system_config.settings_store import (
            get_settings_data,
        )
        data = get_settings_data(cls._namespace)
        return cls(**data)

    def reload(self) -> None:
        """Reload from in-memory cache."""
        from pixsim7.backend.main.services.system_config.settings_store import (
            get_settings_data,
        )
        data = get_settings_data(self._namespace)
        for key, value in self.__class__(**data):
            object.__setattr__(self, key, value)

    # ── Mutation ──────────────────────────────────────────────────────────

    def update(self, updates: Dict[str, Any]) -> None:
        """Apply partial updates to in-memory state + cache."""
        from pixsim7.backend.main.services.system_config.settings_store import (
            apply_settings,
        )
        current = self.model_dump()
        merged = {**current, **updates}
        apply_settings(self._namespace, merged)
        for key, value in self.__class__(**merged):
            object.__setattr__(self, key, value)


# ═══════════════════════════════════════════════════════════════════════════
# UserSettingsBase — per-user settings (users.preferences JSON)
# ═══════════════════════════════════════════════════════════════════════════

class UserSettingsBase(_UpdateModelMixin, BaseModel, metaclass=_SettingsMeta):
    """
    Base class for per-user settings stored in users.preferences[namespace].

    Not a singleton — instantiate per request from the User object.

    Usage::

        prefs = ContentPreferences.for_user(user)
        prefs.max_content_rating  # typed, with default

        # Apply partial update and get merged dict for persistence
        merged = prefs.apply({"max_content_rating": "mature_implied"})
        await user_service.update_user(user.id, preferences={
            **user.preferences, prefs._namespace: merged
        })
    """

    _namespace: ClassVar[str] = ""

    model_config = {"extra": "ignore"}

    # ── Factory ───────────────────────────────────────────────────────────

    @classmethod
    def for_user(cls, user: "User") -> "UserSettingsBase":
        """Create from a User object's preferences."""
        prefs = (user.preferences or {}) if hasattr(user, "preferences") else {}
        section = prefs.get(cls._namespace, {})
        return cls(**(section if isinstance(section, dict) else {}))

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "UserSettingsBase":
        """Create from a raw dict (e.g. from API request or test)."""
        return cls(**(data if isinstance(data, dict) else {}))

    # ── Mutation ──────────────────────────────────────────────────────────

    def apply(self, updates: Dict[str, Any]) -> Dict[str, Any]:
        """
        Merge partial updates into current values and return the merged dict.

        Does NOT persist — caller is responsible for saving to User.preferences.
        Updates self in-place for immediate use within the request.
        """
        current = self.model_dump()
        merged = {**current, **updates}
        validated = self.__class__(**merged)
        for key, value in validated:
            object.__setattr__(self, key, value)
        return validated.model_dump()
