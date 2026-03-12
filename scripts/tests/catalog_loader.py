from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CATALOG_JSON_PATH = ROOT / "scripts" / "tests" / "test-registry.json"


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


def _coerce_str(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value
    return None


def _coerce_int(value: Any) -> int | None:
    if isinstance(value, int):
        return value
    return None


def _coerce_str_tuple(value: Any) -> tuple[str, ...]:
    if not isinstance(value, list):
        return tuple()
    return tuple(item for item in value if isinstance(item, str) and item.strip())


def _coerce_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def load_catalog(
    catalog_path: Path = DEFAULT_CATALOG_JSON_PATH,
    *,
    require: bool = True,
) -> tuple[tuple[CatalogProfile, ...], tuple[CatalogSuite, ...]]:
    if not catalog_path.exists():
        if require:
            raise FileNotFoundError(
                f"Missing generated catalog: {catalog_path}. "
                "Run `pnpm test:registry:gen`."
            )
        return tuple(), tuple()

    raw = json.loads(catalog_path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"Invalid catalog JSON shape in {catalog_path}: expected object.")

    raw_profiles = raw.get("profiles")
    raw_suites = raw.get("suites")
    if not isinstance(raw_profiles, list) or not isinstance(raw_suites, list):
        raise ValueError(
            f"Invalid catalog JSON shape in {catalog_path}: expected 'profiles' and 'suites' arrays."
        )

    profiles: list[CatalogProfile] = []
    suites: list[CatalogSuite] = []

    for entry in raw_profiles:
        if not isinstance(entry, dict):
            continue
        profiles.append(
            CatalogProfile(
                id=_coerce_str(entry.get("id")),
                label=_coerce_str(entry.get("label")),
                command=_coerce_str(entry.get("command")),
                description=_coerce_str(entry.get("description")),
                targets=_coerce_str_tuple(entry.get("targets")),
                tags=_coerce_str_tuple(entry.get("tags")),
                order=_coerce_int(entry.get("order")),
                run_request=_coerce_dict(entry.get("run_request")),
            )
        )

    for entry in raw_suites:
        if not isinstance(entry, dict):
            continue
        suites.append(
            CatalogSuite(
                id=_coerce_str(entry.get("id")),
                label=_coerce_str(entry.get("label")),
                path=_coerce_str(entry.get("path")),
                layer=_coerce_str(entry.get("layer")),
                kind=_coerce_str(entry.get("kind")),
                category=_coerce_str(entry.get("category")),
                subcategory=_coerce_str(entry.get("subcategory")),
                covers=_coerce_str_tuple(entry.get("covers")),
                order=_coerce_int(entry.get("order")),
            )
        )

    return tuple(profiles), tuple(suites)
