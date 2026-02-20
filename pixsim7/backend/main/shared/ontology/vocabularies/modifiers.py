"""Modifier classes for vocabulary resolution.

A Modifier knows how to resolve a placeholder given an RNG and optional
intensity value (1-10).  Subclasses cover the common data shapes:

  FixedValue   — single string, always returns the same thing
  GradedList   — ordered list; intensity selects position, None = random
  PronounSet   — dict of pronoun forms with sub-key access
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from random import Random
from typing import Dict, List, Optional


class Modifier(ABC):
    """Base class for all vocabulary modifiers."""

    @abstractmethod
    def resolve(self, rng: Random, intensity: Optional[int] = None) -> str:
        """Return the resolved string value.

        Args:
            rng: Seeded random instance for deterministic picks.
            intensity: Optional 1-10 value.  None means "pick randomly".
        """
        ...


class FixedValue(Modifier):
    """Returns a constant string regardless of intensity."""

    __slots__ = ("value",)

    def __init__(self, value: str):
        self.value = value

    def resolve(self, rng: Random, intensity: Optional[int] = None) -> str:
        return self.value

    def __repr__(self) -> str:
        return f"FixedValue({self.value!r})"


class GradedList(Modifier):
    """Ordered list of values — intensity selects position, None = random.

    Values should be authored from low intensity to high intensity:
        ["barely brushes", "lightly touches", "presses", "grips firmly"]

    With intensity=None (random), behaves identically to a flat random pick.
    With intensity=1-10, maps linearly into the list.
    """

    __slots__ = ("values",)

    def __init__(self, values: List[str]):
        self.values = values

    def resolve(self, rng: Random, intensity: Optional[int] = None) -> str:
        if not self.values:
            return ""
        if intensity is None:
            return rng.choice(self.values)
        # Map 1-10 into list indices (clamp to valid range)
        idx = max(0, min(
            (intensity - 1) * len(self.values) // 10,
            len(self.values) - 1,
        ))
        return self.values[idx]

    def __repr__(self) -> str:
        return f"GradedList({self.values!r})"


class PronounSet(Modifier):
    """Dict of pronoun forms (subject/object/possessive).

    resolve() returns the subject form by default.
    Use resolve_form("object") for specific forms.
    """

    __slots__ = ("forms",)

    _DEFAULTS = {"subject": "they", "object": "them", "possessive": "their"}

    def __init__(self, forms: Dict[str, str]):
        self.forms = forms

    def resolve(self, rng: Random, intensity: Optional[int] = None) -> str:
        return self.forms.get("subject", "they")

    def resolve_form(self, form: str) -> str:
        return self.forms.get(form, self._DEFAULTS.get(form, "they"))

    def __repr__(self) -> str:
        return f"PronounSet({self.forms!r})"


def hydrate_modifier(value) -> Modifier:
    """Convert a raw YAML value into the appropriate Modifier subclass."""
    if isinstance(value, str):
        return FixedValue(value)
    if isinstance(value, list):
        return GradedList(value)
    if isinstance(value, dict):
        return PronounSet(value)
    return FixedValue(str(value))
