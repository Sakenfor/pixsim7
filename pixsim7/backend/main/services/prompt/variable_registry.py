"""Prompt variable registry helpers.

Stores user-global prompt variables in ``users.preferences["prompt_variables"]``.
Variables are named operands in the prompt mini-language (peers to chain
operators). Each entry is an object ``{"name": ..., "description": ...}`` with a
strict uppercase name; ``description`` is an optional one-line reuse hint.

Storage tolerates legacy bare-string entries (``["ACTOR1", ...]``) on read and
canonicalizes them to objects, so older payloads keep working.

Phase 2 (substitution): an optional ``value`` carries the text a variable
resolves to. A variable with no ``value`` stays a literal symbol in the prompt;
one with a ``value`` expands to that text on the outbound (resolved) prompt.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable, List, Optional

from pixsim7.backend.main.services.prompt.variable_transforms import is_known_transform

PROMPT_VARIABLES_PREF_KEY = "prompt_variables"
_PROMPT_VAR_PATTERN = re.compile(r"^[A-Z][A-Z0-9_]*$")
_DESCRIPTION_MAX_LENGTH = 200
_VALUE_MAX_LENGTH = 2000
_TRANSFORM_MAX_LENGTH = 100


@dataclass(frozen=True)
class PromptVariable:
    """A saved prompt variable: a name, an optional one-line description, an
    optional ``value`` (the substitution text for phase-2 resolution), and an
    optional ``transform`` spec applied to that value on resolve."""

    name: str
    description: Optional[str] = None
    value: Optional[str] = None
    transform: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"name": self.name}
        if self.description:
            payload["description"] = self.description
        if self.value:
            payload["value"] = self.value
        if self.transform:
            payload["transform"] = self.transform
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


def normalize_prompt_variable_value(raw: Any) -> Optional[str]:
    """Normalize an optional substitution value.

    Unlike a description, the value preserves internal whitespace/newlines (it
    is prompt text). Outer whitespace is stripped, empty becomes ``None``, and
    the result is capped at ``_VALUE_MAX_LENGTH``.
    """
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise ValueError("Variable value must be a string")
    trimmed = raw.strip()
    if not trimmed:
        return None
    return trimmed[:_VALUE_MAX_LENGTH]


def normalize_prompt_variable_transform(raw: Any) -> Optional[str]:
    """Normalize and validate an optional transform spec (``id`` or ``id:arg``).

    Returns ``None`` for missing/empty values. The id is validated against the
    transform registry so typos fail at write time; the arg (after the first
    ``:``) is preserved verbatim apart from the overall length cap.
    """
    if raw is None:
        return None
    if not isinstance(raw, str):
        raise ValueError("Variable transform must be a string")
    trimmed = raw.strip()
    if not trimmed:
        return None
    capped = trimmed[:_TRANSFORM_MAX_LENGTH]
    if not is_known_transform(capped):
        raise ValueError(f"Unknown variable transform: {capped!r}")
    return capped


def coerce_prompt_variable(entry: Any) -> PromptVariable:
    """Coerce an entry to a ``PromptVariable``.

    Accepts an already-built ``PromptVariable`` (re-validated, idempotent), a
    bare name string (legacy), or a ``{name, description, value}`` dict.
    """
    if isinstance(entry, PromptVariable):
        return PromptVariable(
            name=normalize_prompt_variable_name(entry.name),
            description=normalize_prompt_variable_description(entry.description),
            value=normalize_prompt_variable_value(entry.value),
            transform=normalize_prompt_variable_transform(entry.transform),
        )
    if isinstance(entry, str):
        return PromptVariable(name=normalize_prompt_variable_name(entry))
    if isinstance(entry, dict):
        name = normalize_prompt_variable_name(entry.get("name"))
        description = normalize_prompt_variable_description(entry.get("description"))
        value = normalize_prompt_variable_value(entry.get("value"))
        transform = normalize_prompt_variable_transform(entry.get("transform"))
        return PromptVariable(name=name, description=description, value=value, transform=transform)
    raise ValueError("Variable entry must be a string or object")


def canonicalize_prompt_variables(values: Iterable[Any]) -> List[PromptVariable]:
    """Validate, dedupe by name, and sort entries.

    On duplicate names the first occurrence wins, but a later occurrence's
    description/value fills in when the kept entry has none.
    """
    out: list[PromptVariable] = []
    index: dict[str, int] = {}
    for value in values:
        variable = coerce_prompt_variable(value)
        existing = index.get(variable.name)
        if existing is None:
            index[variable.name] = len(out)
            out.append(variable)
            continue
        kept = out[existing]
        filled_description = kept.description or variable.description
        filled_value = kept.value or variable.value
        filled_transform = kept.transform or variable.transform
        if (
            filled_description != kept.description
            or filled_value != kept.value
            or filled_transform != kept.transform
        ):
            out[existing] = PromptVariable(
                name=kept.name,
                description=filled_description,
                value=filled_value,
                transform=filled_transform,
            )
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


def read_prompt_variable_values(preferences: Any) -> dict[str, str]:
    """Map of name -> value for entries that have a (non-empty) value.

    Feeds the substitution resolver; names without a value are omitted so they
    stay literal symbols.
    """
    return {
        variable.name: variable.value
        for variable in read_prompt_variable_entries(preferences)
        if variable.value
    }


def read_prompt_variable_transforms(preferences: Any) -> dict[str, str]:
    """Map of name -> transform spec for every entry that carries a transform.

    Feeds the resolver alongside ``read_prompt_variable_values``. A transform is
    applied to the variable's value when one is set, otherwise to its own name —
    so value-less transforms are included.
    """
    return {
        variable.name: variable.transform
        for variable in read_prompt_variable_entries(preferences)
        if variable.transform
    }


def write_prompt_variables(preferences: Any, entries: Iterable[Any]) -> dict[str, Any]:
    """Write canonical prompt variable entries into a preferences payload."""
    current = dict(preferences) if isinstance(preferences, dict) else {}
    canonical = canonicalize_prompt_variables(entries)
    if canonical:
        current[PROMPT_VARIABLES_PREF_KEY] = [variable.to_dict() for variable in canonical]
    else:
        current.pop(PROMPT_VARIABLES_PREF_KEY, None)
    return current
