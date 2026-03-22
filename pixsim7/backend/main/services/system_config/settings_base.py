"""
Declarative settings base for system_config-backed settings.

Subclass ``SettingsBase`` and declare fields as normal Pydantic fields.
The base class handles:
- Loading from the in-memory settings_store cache
- Singleton management via ``get()``
- ``to_dict()`` serialization
- ``update()`` with applier callback
- Auto-generation of a Pydantic ``UpdateModel`` (all fields Optional)
- Auto-generation of a Pydantic ``ResponseModel`` (same as the class itself)

Example::

    class MediaSettings(SettingsBase):
        class Config:
            namespace = "media_settings"

        ingest_on_asset_add: bool = Field(True, description="Auto-ingest new assets")
        storage_format: Optional[str] = Field(None, description="Convert images on download")

    # Singleton access
    settings = MediaSettings.get()

    # Auto-generated models for API endpoints
    MediaSettingsUpdate = MediaSettings.UpdateModel
    MediaSettingsResponse = MediaSettings  # it IS the response model
"""
from __future__ import annotations

from typing import Any, ClassVar, Dict, Optional, Type

from pydantic import BaseModel


class _SettingsMeta(type(BaseModel)):
    """Metaclass that auto-generates UpdateModel on class creation."""

    def __init_subclass__(cls, **kwargs: Any) -> None:
        super().__init_subclass__(**kwargs)

    def __init__(cls, name: str, bases: tuple, namespace: dict, **kwargs: Any) -> None:
        super().__init__(name, bases, namespace, **kwargs)

        # Skip for SettingsBase itself
        if name == "SettingsBase":
            return

        # Auto-generate UpdateModel (all fields Optional)
        cls._build_update_model()


class SettingsBase(BaseModel, metaclass=_SettingsMeta):
    """
    Base class for declarative, system_config-backed settings.

    Subclasses declare Pydantic fields with defaults and descriptions.
    The namespace for DB storage is set via ``model_config["namespace"]``
    or the ``_namespace`` class variable.
    """

    _namespace: ClassVar[str] = ""
    _instance: ClassVar[Optional["SettingsBase"]] = None
    _UpdateModel: ClassVar[Optional[Type[BaseModel]]] = None

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

    # ── Serialization ─────────────────────────────────────────────────────

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dict (for API responses and DB persistence)."""
        return self.model_dump()

    # ── Mutation ──────────────────────────────────────────────────────────

    def update(self, updates: Dict[str, Any]) -> None:
        """Apply partial updates to in-memory state + cache."""
        from pixsim7.backend.main.services.system_config.settings_store import (
            apply_settings,
        )
        # Merge with current values
        current = self.model_dump()
        merged = {**current, **updates}
        # Update cache
        apply_settings(self._namespace, merged)
        # Update self
        for key, value in self.__class__(**merged):
            object.__setattr__(self, key, value)

    # ── Update model generation ───────────────────────────────────────────

    @classmethod
    def _build_update_model(cls) -> None:
        """Auto-generate an Update model where all fields are Optional.

        Preserves Field metadata (ge, le, description, etc.) from the
        source model so that validation constraints carry over to patches.
        """
        from pydantic import Field as PydanticField
        from pydantic.fields import FieldInfo
        import copy

        field_definitions: Dict[str, Any] = {}
        for name, field_info in cls.model_fields.items():
            # Clone the FieldInfo and make it Optional with default None
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
