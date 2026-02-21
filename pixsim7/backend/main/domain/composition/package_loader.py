"""
Composition package loader for data-driven role packages.

Loads YAML-defined packages and converts them into CompositionPackage objects.
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .package_registry import CompositionPackage, CompositionRoleDefinition, register_composition_package


_ACRONYM_WORDS = {
    "pov": "POV",
    "npc": "NPC",
}


def _format_role_label(role_id: str) -> str:
    words = role_id.replace("-", " ").replace("_", " ").split()
    return " ".join(_ACRONYM_WORDS.get(word, word.capitalize()) for word in words)


class CompositionRoleYaml(BaseModel):
    """Canonical role schema for composition-package YAML."""

    model_config = ConfigDict(extra="forbid")

    label: Optional[str] = None
    description: str
    color: str
    defaultLayer: int = 0
    tags: List[str] = Field(default_factory=list)
    parent: Optional[str] = None
    isGroup: bool = False
    slugMappings: List[str] = Field(default_factory=list)
    namespaceMappings: List[str] = Field(default_factory=list)
    aliases: List[str] = Field(default_factory=list)
    defaultInfluence: str = "content"


class CompositionPackageMetaYaml(BaseModel):
    """Canonical package metadata schema for composition-package YAML."""

    model_config = ConfigDict(extra="forbid")

    id: str
    label: Optional[str] = None
    description: str = ""
    version: str = "1.0.0"
    recommendedFor: List[str] = Field(default_factory=list)
    pluginId: Optional[str] = None


class CompositionPackageYaml(BaseModel):
    """Top-level canonical schema for composition-package YAML."""

    model_config = ConfigDict(extra="forbid")

    package: CompositionPackageMetaYaml
    roles: Dict[str, CompositionRoleYaml]


def load_composition_package_from_yaml(
    path: str | Path,
    *,
    plugin_id: Optional[str] = None,
) -> CompositionPackage:
    """
    Load a composition package from a YAML file.

    Args:
        path: Path to YAML file
        plugin_id: Optional plugin ID to attach (overrides YAML if provided)

    Returns:
        CompositionPackage with roles parsed from the file.
    """
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Composition package file not found: {file_path}")

    with open(file_path, encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}

    if not isinstance(data, dict):
        raise ValueError(f"Invalid composition package format: {file_path}")

    try:
        parsed = CompositionPackageYaml.model_validate(data)
    except ValidationError as exc:
        raise ValueError(
            f"Invalid composition package schema in {file_path}: {exc}"
        ) from exc

    package_meta = parsed.package
    package_id = package_meta.id
    label = package_meta.label or _format_role_label(str(package_id))
    resolved_plugin_id = plugin_id if plugin_id is not None else package_meta.pluginId

    roles: List[CompositionRoleDefinition] = []
    for role_id, role_data in parsed.roles.items():
        role_label = role_data.label or _format_role_label(str(role_id))
        role = CompositionRoleDefinition(
            id=str(role_id),
            label=role_label,
            description=str(role_data.description),
            color=str(role_data.color),
            default_layer=int(role_data.defaultLayer),
            tags=list(role_data.tags),
            parent=str(role_data.parent) if role_data.parent else None,
            is_group=bool(role_data.isGroup),
            slug_mappings=list(role_data.slugMappings),
            namespace_mappings=list(role_data.namespaceMappings),
            aliases=list(role_data.aliases),
            default_influence=str(role_data.defaultInfluence or "content"),
        )
        roles.append(role)

    return CompositionPackage(
        id=str(package_id),
        label=str(label),
        description=str(package_meta.description),
        plugin_id=resolved_plugin_id,
        roles=roles,
        recommended_for=list(package_meta.recommendedFor),
        version=str(package_meta.version),
    )


def register_composition_package_from_yaml(
    path: str | Path,
    *,
    plugin_id: Optional[str] = None,
) -> CompositionPackage:
    """Load a composition package from YAML and register it."""
    package = load_composition_package_from_yaml(path, plugin_id=plugin_id)
    register_composition_package(package)
    return package


def register_composition_packages_from_dir(
    directory: str | Path,
    *,
    plugin_id: Optional[str] = None,
) -> List[CompositionPackage]:
    """
    Load and register all YAML composition packages from a directory.

    Returns the list of registered packages.
    """
    dir_path = Path(directory)
    if not dir_path.exists():
        return []

    packages: List[CompositionPackage] = []
    for file_path in sorted(dir_path.glob("*.y*ml")):
        package = register_composition_package_from_yaml(file_path, plugin_id=plugin_id)
        packages.append(package)

    return packages
