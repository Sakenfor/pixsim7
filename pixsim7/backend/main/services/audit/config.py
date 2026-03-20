"""Audit configuration for CRUD systems.

Attach an AuditConfig to a CRUD spec to auto-emit entity_audit entries
on create, update, and delete operations.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AuditConfig:
    """Opt-in audit configuration for CRUD specs."""

    domain: str  # e.g. "game", "registry", "prompt"
    entity_type: str  # e.g. "scene", "npc", "authoring_mode"
    label_field: str = "name"  # field to snapshot as entity_label
    enabled: bool = True
