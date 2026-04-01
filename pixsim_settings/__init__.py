"""Shared declarative settings package for PixSim7.

Importable by backend API, workers, launcher, and auxiliary services:
    from pixsim_settings import SettingsBase, UserSettingsBase

The in-memory store is populated by each consumer's own persistence layer
(DB appliers, JSON loader, etc). The package itself has zero database or
ORM dependencies — just Pydantic.
"""
from pixsim_settings.base import SettingsBase, UserSettingsBase
from pixsim_settings.store import apply_settings, get_settings_data

__all__ = [
    "SettingsBase",
    "UserSettingsBase",
    "apply_settings",
    "get_settings_data",
]
