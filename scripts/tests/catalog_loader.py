from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG_PATH = (
    ROOT
    / "apps"
    / "main"
    / "src"
    / "features"
    / "devtools"
    / "services"
    / "testCatalogRegistry.ts"
)


@dataclass(frozen=True)
class CatalogProfile:
    id: str | None
    label: str | None
    command: str | None
    description: str | None
    targets: tuple[str, ...]
    tags: tuple[str, ...]
    order: int | None
    run_request: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "command": self.command,
            "description": self.description,
            "targets": list(self.targets),
            "tags": list(self.tags),
            "order": self.order,
            "run_request": self.run_request,
        }


@dataclass(frozen=True)
class CatalogSuite:
    id: str | None
    label: str | None
    path: str | None
    layer: str | None
    kind: str | None
    category: str | None
    subcategory: str | None
    covers: tuple[str, ...]
    order: int | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "path": self.path,
            "layer": self.layer,
            "kind": self.kind,
            "category": self.category,
            "subcategory": self.subcategory,
            "covers": list(self.covers),
            "order": self.order,
        }


def _extract_array_literal(source: str, marker: str) -> str | None:
    marker_index = source.find(marker)
    if marker_index < 0:
        return None

    equals_index = source.find("=", marker_index)
    if equals_index < 0:
        return None

    start = source.find("[", equals_index)
    if start < 0:
        return None

    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(source)):
        char = source[index]
        if in_string:
            if escaped:
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == "'":
                in_string = False
            continue

        if char == "'":
            in_string = True
            continue
        if char == "[":
            depth += 1
            continue
        if char == "]":
            depth -= 1
            if depth == 0:
                return source[start : index + 1]

    return None


def _extract_object_literals(array_literal: str) -> list[str]:
    objects: list[str] = []
    depth = 0
    in_string = False
    escaped = False
    object_start = -1

    for index, char in enumerate(array_literal):
        if in_string:
            if escaped:
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == "'":
                in_string = False
            continue

        if char == "'":
            in_string = True
            continue
        if char == "{":
            if depth == 0:
                object_start = index
            depth += 1
            continue
        if char == "}":
            depth -= 1
            if depth == 0 and object_start >= 0:
                objects.append(array_literal[object_start : index + 1])
                object_start = -1

    return objects


def _extract_string_field(obj_literal: str, field_name: str) -> str | None:
    match = re.search(rf"{re.escape(field_name)}:\s*'([^']+)'", obj_literal)
    if not match:
        return None
    return match.group(1)


def _extract_number_field(obj_literal: str, field_name: str) -> int | None:
    match = re.search(rf"{re.escape(field_name)}:\s*(-?\d+)", obj_literal)
    if not match:
        return None
    return int(match.group(1))


def _extract_string_list_field(obj_literal: str, field_name: str) -> tuple[str, ...]:
    match = re.search(rf"{re.escape(field_name)}:\s*\[(.*?)\]", obj_literal, flags=re.DOTALL)
    if not match:
        return tuple()
    values = tuple(item for item in re.findall(r"'([^']+)'", match.group(1)) if item.strip())
    return values


def _extract_object_body(obj_literal: str, field_name: str) -> str | None:
    match = re.search(rf"{re.escape(field_name)}:\s*\{{(.*?)\}}", obj_literal, flags=re.DOTALL)
    if not match:
        return None
    return match.group(1)


def _parse_run_request(obj_literal: str) -> dict[str, Any]:
    body = _extract_object_body(obj_literal, "runRequest")
    if not body:
        return {}

    values: dict[str, Any] = {}
    for key, raw_value in re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^,\n}]+)", body):
        value = raw_value.strip()
        if value.startswith("'") and value.endswith("'"):
            values[key] = value[1:-1]
            continue
        if value in {"true", "false"}:
            values[key] = value == "true"
            continue
        if re.fullmatch(r"-?\d+", value):
            values[key] = int(value)
            continue
        values[key] = value

    return values


def load_catalog(
    catalog_path: Path = DEFAULT_CATALOG_PATH,
) -> tuple[tuple[CatalogProfile, ...], tuple[CatalogSuite, ...]]:
    if not catalog_path.exists():
        return tuple(), tuple()

    source = catalog_path.read_text(encoding="utf-8")
    profiles_array = _extract_array_literal(source, "const BUILTIN_PROFILES")
    suites_array = _extract_array_literal(source, "const BUILTIN_SUITES")

    profiles: list[CatalogProfile] = []
    suites: list[CatalogSuite] = []

    for obj_literal in _extract_object_literals(profiles_array or ""):
        profiles.append(
            CatalogProfile(
                id=_extract_string_field(obj_literal, "id"),
                label=_extract_string_field(obj_literal, "label"),
                command=_extract_string_field(obj_literal, "command"),
                description=_extract_string_field(obj_literal, "description"),
                targets=_extract_string_list_field(obj_literal, "targets"),
                tags=_extract_string_list_field(obj_literal, "tags"),
                order=_extract_number_field(obj_literal, "order"),
                run_request=_parse_run_request(obj_literal),
            )
        )

    for obj_literal in _extract_object_literals(suites_array or ""):
        suites.append(
            CatalogSuite(
                id=_extract_string_field(obj_literal, "id"),
                label=_extract_string_field(obj_literal, "label"),
                path=_extract_string_field(obj_literal, "path"),
                layer=_extract_string_field(obj_literal, "layer"),
                kind=_extract_string_field(obj_literal, "kind"),
                category=_extract_string_field(obj_literal, "category"),
                subcategory=_extract_string_field(obj_literal, "subcategory"),
                covers=_extract_string_list_field(obj_literal, "covers"),
                order=_extract_number_field(obj_literal, "order"),
            )
        )

    return tuple(profiles), tuple(suites)
