"""
Composition package loader for data-driven role packages.

Loads YAML-defined packages and converts them into CompositionPackage objects.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from .package_registry import CompositionPackage, CompositionRoleDefinition, register_composition_package


_ACRONYM_WORDS = {
    "pov": "POV",
    "npc": "NPC",
}


def _format_role_label(role_id: str) -> str:
    words = role_id.replace("-", " ").replace("_", " ").split()
    return " ".join(_ACRONYM_WORDS.get(word, word.capitalize()) for word in words)


def _coerce_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    return [str(value)]


def _get_optional(mapping: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in mapping:
            return mapping[key]
    return default


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

    package_data = data.get("package")
    roles_data = data.get("roles")
    if not isinstance(package_data, dict) or not isinstance(roles_data, dict):
        raise ValueError(f"Composition package missing 'package' or 'roles': {file_path}")

    package_id = package_data.get("id")
    if not package_id:
        raise ValueError(f"Composition package missing id: {file_path}")

    label = package_data.get("label") or _format_role_label(str(package_id))
    package_description = package_data.get("description", "")
    version = package_data.get("version", "1.0.0")
    recommended_for = _coerce_list(
        _get_optional(package_data, "recommendedFor", "recommended_for", default=[])
    )
    resolved_plugin_id = plugin_id if plugin_id is not None else package_data.get("pluginId")

    roles: List[CompositionRoleDefinition] = []
    for role_id, role_data in roles_data.items():
        if not isinstance(role_data, dict):
            raise ValueError(f"Role '{role_id}' must be a mapping in {file_path}")

        role_description = role_data.get("description")
        role_color = role_data.get("color")
        if not role_description or not role_color:
            raise ValueError(f"Role '{role_id}' missing description/color in {file_path}")

        role_label = role_data.get("label") or _format_role_label(str(role_id))
        default_layer = _get_optional(role_data, "defaultLayer", "default_layer", default=0)
        if default_layer is None:
            default_layer = 0
        try:
            default_layer_value = int(default_layer)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"Role '{role_id}' defaultLayer must be an int in {file_path}"
            ) from exc

        role = CompositionRoleDefinition(
            id=str(role_id),
            label=role_label,
            description=str(role_description),
            color=str(role_color),
            default_layer=default_layer_value,
            tags=_coerce_list(role_data.get("tags")),
            slug_mappings=_coerce_list(_get_optional(role_data, "slugMappings", "slug_mappings", default=[])),
            namespace_mappings=_coerce_list(
                _get_optional(role_data, "namespaceMappings", "namespace_mappings", default=[])
            ),
        )
        roles.append(role)

    return CompositionPackage(
        id=str(package_id),
        label=str(label),
        description=str(package_description),
        plugin_id=resolved_plugin_id,
        roles=roles,
        recommended_for=recommended_for,
        version=str(version),
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
