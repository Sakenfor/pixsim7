"""Species vocabulary helpers."""

from __future__ import annotations

from typing import Optional


def normalize_species_id(species_id: Optional[str]) -> Optional[str]:
    """Normalize raw character species strings to vocabulary IDs."""
    if not isinstance(species_id, str):
        return None
    normalized = species_id.strip().lower()
    if not normalized:
        return None
    if not normalized.startswith("species:"):
        normalized = f"species:{normalized}"
    return normalized

