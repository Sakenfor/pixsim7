"""Prompt variable registry helpers.

Stores user-global prompt variables in ``users.preferences["prompt_variables"]``.
Variables are named operands in the prompt mini-language (peers to chain
operators). Each entry is an object ``{"name": ..., "description": ...}`` with a
strict uppercase name; ``description`` is an optional one-line reuse hint.

Storage tolerates legacy bare-string entries (``["ACTOR1", ...]``) on read and
canonicalizes them to objects, so older payloads keep working. A ``value``
binding for real substitution is intentionally deferred to phase 2.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable, List, Optional

PROMPT_VARIABLES_PREF_KEY = "prompt_variables"
_PROMPT_VAR_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*$")
_DESCRIPTION_MAX_LENGTH = 200


@dataclass(frozen=True)
class PromptVariable:
    """A saved prompt variable: a name plus an optional one-line description."""

    name: str
    description: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"name": self.name}
        if self.description:
            payload["description"] = self.description
        return payload


def normalize_prompt_variable_name(raw: Any) -> str:
    """Normalize and validate a single variable name."""
    if not isinstance(raw, str):
        raise ValueError("Variable name must be a string")
    name = raw.strip().upper()
    if not name:
        raise ValueError("Variable name is required")
    if not _PROMPT_VAR_PATTERN.fullmatch(name):
        raise ValueError("Variable name must match ^[A-Z][A-Z0-9_]*$")
    return name


def normalize_prompt_variable_description(raw: Any) -> Optional[str]:
    """Normalize an optional description to a trimmed, single-line string.

    Returns ``None`` for missing/empty values so empty descriptions are not
    persisted. Internal newlines/tabs collapse to spaces; result is capped at
    ``_DESCRIPTION_MAX_LENGTH``.
    """
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise ValueError("Variable description must be a string")
    collapsed = " ".join(raw.split())
    if not collapsed:
        return None
    return collapsed[:_DESCRIPTION_MAX_LENGTH]


def coerce_prompt_variable(entry: Any) -> PromptVariable:
    """Coerce an entry to a ``PromptVariable``.

    Accepts an already-built ``PromptVariable`` (re-validated, idempotent), a
    bare name string (legacy), or a ``{name, description}`` dict.
    """
    if isinstance(entry, PromptVariable):
        return PromptVariable(
            name=normalize_prompt_variable_name(entry.name),
            description=normalize_prompt_variable_description(entry.description),
        )
    if isinstance(entry, str):
        return PromptVariable(name=normalize_prompt_variable_name(entry))
    if isinstance(entry, dict):
        name = normalize_prompt_variable_name(entry.get("name"))
        description = normalize_prompt_variable_description(entry.get("description"))
        return PromptVariable(name=name, description=description)
    raise ValueError("Variable entry must be a string or object")


def canonicalize_prompt_variables(values: Iterable[Any]) -> List[PromptVariable]:
    """Validate, dedupe by name, and sort entries.

    On duplicate names the first occurrence wins, but a later occurrence's
    description fills in when the kept entry has none.
    """
    out: list[PromptVariable] = []
    index: dict[str, int] = {}
    for value in values:
        variable = coerce_prompt_variable(value)
        existing = index.get(variable.name)
        if existing is None:
            index[variable.name] = len(out)
            out.append(variable)
        elif out[existing].description is None and variable.description:
            out[existing] = PromptVariable(name=variable.name, description=variable.description)
    out.sort(key=lambda item: item.name)
    return out


def canonicalize_prompt_variable_names(values: Iterable[Any]) -> List[str]:
    """Validate, dedupe, and sort names (back-compat name-only accessor)."""
    return [variable.name for variable in canonicalize_prompt_variables(values)]


def read_prompt_variable_entries(preferences: Any) -> List[PromptVariable]:
    """Read canonical prompt variable entries from a preferences payload."""
    if not isinstance(preferences, dict):
        return []
    raw = preferences.get(PROMPT_VARIABLES_PREF_KEY)
    if not isinstance(raw, list):
        return []
    return canonicalize_prompt_variables(raw)


def read_prompt_variables(preferences: Any) -> List[str]:
    """Read canonical prompt variable names from a preferences payload.

    Name-only accessor kept for callers (e.g. analysis hint building) that only
    compare names.
    """
    return [variable.name for variable in read_prompt_variable_entries(preferences)]


def write_prompt_variables(preferences: Any, entries: Iterable[Any]) -> dict[str, Any]:
    """Write canonical prompt variable entries into a preferences payload."""
    current = dict(preferences) if isinstance(preferences, dict) else {}
    canonical = canonicalize_prompt_variables(entries)
    if canonical:
        current[PROMPT_VARIABLES_PREF_KEY] = [variable.to_dict() for variable in canonical]
    else:
        current.pop(PROMPT_VARIABLES_PREF_KEY, None)
    return current
