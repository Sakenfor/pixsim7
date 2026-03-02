"""
Global model family registry.

Maps provider-specific model IDs to canonical model families with display
metadata (label, 2-char badge, color).  Consumed by the frontend to render
consistent branding badges on model selector buttons.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelFamily:
    id: str       # canonical key, e.g. "qwen"
    label: str    # human-readable, e.g. "Qwen"
    short: str    # 2-char badge text, e.g. "Qw"
    color: str    # hex colour for badge background


MODEL_FAMILIES: dict[str, ModelFamily] = {
    "qwen": ModelFamily(id="qwen", label="Qwen", short="Qw", color="#6366f1"),
    "gemini": ModelFamily(id="gemini", label="Gemini", short="Gm", color="#1a73e8"),
    "seedream": ModelFamily(id="seedream", label="Seedream", short="Sd", color="#e85d04"),
    "pixverse": ModelFamily(id="pixverse", label="Pixverse", short="Px", color="#8b5cf6"),
}

# Provider model ID → family key
MODEL_ID_TO_FAMILY: dict[str, str] = {
    # Qwen
    "qwen-image": "qwen",
    # Gemini
    "gemini-3.0": "gemini",
    "gemini-2.5-flash": "gemini",
    "gemini-3.1-flash": "gemini",
    # Seedream
    "seedream-4.0": "seedream",
    "seedream-4.5": "seedream",
    "seedream-5.0-lite": "seedream",
    # Pixverse native
    "v5": "pixverse",
    "v5-fast": "pixverse",
    "v5.5": "pixverse",
    "v5.6": "pixverse",
}

# Per-model colour overrides (takes precedence over family default).
# Lets models within the same family have distinct badge colours.
# Per-model colour overrides (takes precedence over family default).
# Lets models within the same family have distinct badge colours.
MODEL_COLOR_OVERRIDES: dict[str, str] = {
    # Gemini tiers
    "gemini-3.0": "#7c3aed",       # purple — premium
    # gemini-3.1-flash keeps family default (#1a73e8 blue)
    "gemini-2.5-flash": "#6b7280",  # grey  — older flash
    # Seedream tiers
    "seedream-5.0-lite": "#dc2626",  # red    — newest
    # seedream-4.5 keeps family default (#e85d04 orange)
    "seedream-4.0": "#d4d4d8",       # light grey — base
}

# Per-model text colour overrides (default is white).
MODEL_TEXT_COLOR_OVERRIDES: dict[str, str] = {
    "seedream-4.0": "#374151",  # dark grey text on light bg
}


def build_model_families_metadata(
    model_ids: list[str],
) -> dict[str, dict[str, str]]:
    """Return a ``{ model_id: { family, label, short, color } }`` dict
    for every *model_id* that has a known family mapping.

    Unknown IDs are silently skipped so new SDK models degrade gracefully.
    """
    result: dict[str, dict[str, str]] = {}
    for mid in model_ids:
        family_key = MODEL_ID_TO_FAMILY.get(mid)
        if family_key is None:
            continue
        fam = MODEL_FAMILIES.get(family_key)
        if fam is None:
            continue
        entry: dict[str, str] = {
            "family": fam.id,
            "label": fam.label,
            "short": fam.short,
            "color": MODEL_COLOR_OVERRIDES.get(mid, fam.color),
        }
        text_color = MODEL_TEXT_COLOR_OVERRIDES.get(mid)
        if text_color:
            entry["textColor"] = text_color
        result[mid] = entry
    return result
