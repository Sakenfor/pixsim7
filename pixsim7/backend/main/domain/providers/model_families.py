"""
Global model family registry.

Maps provider-specific model IDs to canonical model families with display
metadata (label, 2-char badge, color) and tier ordering for upgrade paths.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ModelVariant:
    """A specific model within a family, with its tier and display overrides."""
    id: str           # provider model ID, e.g. "gemini-3.0"
    family: str       # family key, e.g. "gemini"
    tier: int         # rank within family (higher = better)
    color: str | None = None       # badge bg override (None → family default)
    text_color: str | None = None  # badge text override (None → white)
    short: str | None = None       # badge text override (None → family default)


@dataclass(frozen=True)
class ModelFamily:
    """A group of related models sharing branding."""
    id: str       # canonical key, e.g. "qwen"
    label: str    # human-readable, e.g. "Qwen"
    short: str    # 2-char badge text, e.g. "Qw"
    color: str    # default hex colour for badge background
    variants: tuple[ModelVariant, ...] = field(default_factory=tuple)

    def variant(self, model_id: str) -> ModelVariant | None:
        return next((v for v in self.variants if v.id == model_id), None)

    def upgrade_from(self, model_id: str) -> ModelVariant | None:
        """Return the next tier up from *model_id*, or None if already top."""
        current = self.variant(model_id)
        if current is None:
            return None
        candidates = sorted(
            (v for v in self.variants if v.tier > current.tier),
            key=lambda v: v.tier,
        )
        return candidates[0] if candidates else None

    def downgrade_from(self, model_id: str) -> ModelVariant | None:
        """Return the next tier down from *model_id*, or None if already bottom."""
        current = self.variant(model_id)
        if current is None:
            return None
        candidates = sorted(
            (v for v in self.variants if v.tier < current.tier),
            key=lambda v: v.tier,
            reverse=True,
        )
        return candidates[0] if candidates else None

    def top(self) -> ModelVariant | None:
        return max(self.variants, key=lambda v: v.tier) if self.variants else None

    def bottom(self) -> ModelVariant | None:
        return min(self.variants, key=lambda v: v.tier) if self.variants else None


# ---------------------------------------------------------------------------
# Pixverse family (auto-derived from pixverse-py SDK)
# ---------------------------------------------------------------------------

def _build_pixverse_family() -> ModelFamily:
    """Build the pixverse model family from the SDK's VideoModel registry."""
    try:
        from pixverse.models import VideoModel  # type: ignore
        variants = tuple(
            ModelVariant(
                id=str(spec),
                family="pixverse",
                tier=idx + 1,
                short=spec.badge or str(spec),
            )
            for idx, spec in enumerate(VideoModel.ALL)
        )
    except ImportError:
        # Fallback if pixverse-py not installed
        variants = (
            ModelVariant("v5",      "pixverse", tier=1, short="5"),
            ModelVariant("v5-fast", "pixverse", tier=2, short="5F"),
            ModelVariant("v5.5",    "pixverse", tier=3, short="5.5"),
            ModelVariant("v5.6",    "pixverse", tier=4, short="5.6"),
            ModelVariant("v6",      "pixverse", tier=5, short="6"),
        )
    return ModelFamily(
        id="pixverse", label="Pixverse", short="Px", color="#8b5cf6",
        variants=variants,
    )


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

MODEL_FAMILIES: dict[str, ModelFamily] = {
    "qwen": ModelFamily(
        id="qwen", label="Qwen", short="Qw", color="#6366f1",
        variants=(
            ModelVariant("qwen-image", "qwen", tier=1),
        ),
    ),
    "gemini": ModelFamily(
        id="gemini", label="Gemini", short="Gm", color="#1a73e8",
        variants=(
            ModelVariant("gemini-2.5-flash", "gemini", tier=1, color="#6b7280"),
            ModelVariant("gemini-3.1-flash", "gemini", tier=2),
            ModelVariant("gemini-3.0",       "gemini", tier=3, color="#7c3aed"),
        ),
    ),
    "seedream": ModelFamily(
        id="seedream", label="Seedream", short="Sd", color="#e85d04",
        variants=(
            ModelVariant("seedream-4.0",      "seedream", tier=1, color="#d4d4d8", text_color="#374151"),
            ModelVariant("seedream-4.5",      "seedream", tier=2),
            ModelVariant("seedream-5.0-lite", "seedream", tier=3, color="#dc2626"),
        ),
    ),
    "pixverse": _build_pixverse_family(),
}

# Flat lookup: model ID → family key (built from variants)
MODEL_ID_TO_FAMILY: dict[str, str] = {
    v.id: fam.id
    for fam in MODEL_FAMILIES.values()
    for v in fam.variants
}


def get_family(model_id: str) -> ModelFamily | None:
    """Look up the family for a model ID."""
    fam_key = MODEL_ID_TO_FAMILY.get(model_id)
    return MODEL_FAMILIES.get(fam_key) if fam_key else None


def get_upgrade(model_id: str) -> str | None:
    """Return the model ID one tier up, or None if already top / unknown."""
    fam = get_family(model_id)
    if fam is None:
        return None
    up = fam.upgrade_from(model_id)
    return up.id if up else None


def get_downgrade(model_id: str) -> str | None:
    """Return the model ID one tier down, or None if already bottom / unknown."""
    fam = get_family(model_id)
    if fam is None:
        return None
    down = fam.downgrade_from(model_id)
    return down.id if down else None


# ---------------------------------------------------------------------------
# Frontend metadata builder
# ---------------------------------------------------------------------------

def build_model_families_metadata(
    model_ids: list[str],
) -> dict[str, dict[str, Any]]:
    """Return ``{ model_id: { family, label, short, color, tier, ... } }``
    for every *model_id* that has a known family mapping.

    Unknown IDs are silently skipped so new SDK models degrade gracefully.
    """
    result: dict[str, dict[str, Any]] = {}
    for mid in model_ids:
        fam = get_family(mid)
        if fam is None:
            continue
        variant = fam.variant(mid)
        entry: dict[str, Any] = {
            "family": fam.id,
            "label": fam.label,
            "short": (variant.short if variant and variant.short else fam.short),
            "color": variant.color if variant and variant.color else fam.color,
            "tier": variant.tier if variant else 0,
        }
        if variant and variant.text_color:
            entry["textColor"] = variant.text_color
        # Include upgrade/downgrade hints so the frontend doesn't need the full graph
        up = fam.upgrade_from(mid)
        if up and up.id in model_ids:
            entry["upgrade"] = up.id
        down = fam.downgrade_from(mid)
        if down and down.id in model_ids:
            entry["downgrade"] = down.id
        result[mid] = entry
    return result
