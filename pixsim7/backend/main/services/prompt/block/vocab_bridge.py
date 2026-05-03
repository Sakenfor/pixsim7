"""Auto-bridge primitive concepts into the vocabulary registry.

Eliminates double-authoring: when a primitive YAML declares
`block_id: color.amber, tags: {hue: amber}`, the bridge implicitly
registers a `color:amber` entry in the `primitive_concepts` vocab type
with keywords drawn from the tag values + block_id tail. The
auto-deriver then picks up `color:amber` via `match_keywords()` for
any primitive (or future asset prompt) whose text says "amber".

WHY EXIST:
    Pre-bridge, primitive packs in categories without a vocabulary file
    (color, light, aesthetic_preset, rendering_technique, form_language,
    environment, ...) had ~10–40% ontology_id coverage because nothing
    in the keyword index pointed to them. Adding parallel vocab YAMLs
    would double the authoring surface; this bridge derives them
    instead.

EXCLUDED CATEGORIES:
    Primitives in categories that already have hand-authored
    rich-metadata vocabs (`mood`, `pose`, `character_pose`) are skipped.
    Those vocabs carry tension_range / slot routing / detector_labels
    and must stay hand-authored.

KEYWORD SOURCES (no free-text mining — would create cross-category
bleed):
    1. Optional explicit `keywords:` on the primitive (author opt-in).
    2. String-typed tag VALUES (e.g. `{hue: amber}` → "amber").
    3. block_id tail (e.g. `color.amber` → "amber").
    Underscores are split on (`golden_hour` → "golden hour"); each split
    keyword is added in addition to the original.

ID SHAPE:
    `{category}:{block_id_tail}` — e.g. `color:amber`, `light:golden_hour`.
    Same `namespace:value` shape as hand-authored ontology IDs so the
    auto-deriver's contract doesn't change.

COLLISION:
    Hand-authored vocab items take precedence (registered earlier on
    the `core` layer; bridge runs on a later runtime layer with
    `allow_overwrite=False`). If a hand entry already owns
    `color:amber`, the bridge's implicit one is dropped.

Wired into `VocabularyRegistry._ensure_loaded()` at boot, after core +
plugin vocabs load. Kept idempotent so test fixtures + dev hot-reload
behave.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

import yaml

from pixsim7.backend.main.services.prompt.block.coverage import (
    PRIMITIVES_ROOT as DEFAULT_PRIMITIVES_ROOT,
    _resolve_category,
)

logger = logging.getLogger(__name__)


BRIDGE_PACK_ID = "primitive_concepts_bridge"
BRIDGE_VOCAB_TYPE = "primitive_concepts"

# Categories whose vocabularies are hand-authored with rich metadata
# (tension_range, slot routing, detector_labels, etc.) — bridging would
# clobber author intent.
_EXCLUDED_CATEGORIES: Set[str] = {"mood", "pose", "character_pose"}

# Tag keys whose values are NOT meaningful concept words. These usually
# carry qualifiers ("warm", "cool"), numeric-ish strings, or admin/scope
# fields rather than distinct concepts — including them would create
# cross-category match bleed (every "warm" thing pulling in every other
# "warm" thing).
_TAG_KEY_DENY: Set[str] = {
    # qualifier-flavored: tag value describes magnitude/quality, not
    # a concept the primitive *is*.
    "warmth",
    "intensity",
    "saturation",
    "softness",
    "quality",
    "level",
    "tier",
    "weight",
    "priority",
    "mode",
    "kind",
    "scope",
    "color_temp_k",
    # admin / structural tags carried alongside concept tags.
    "source_pack",
    "legacy_category",
    "ontology_ids",
    "ontology_ids_exclude",
    "composition_role",
    "version",
    "category",
}

# Generic qualifier values that should never become keywords on their
# own — they'd cause primitives to bleed into each other's IDs whenever
# the auto-deriver runs.
_VALUE_STOPLIST: Set[str] = {
    "global",
    "local",
    "neutral",
    "low",
    "high",
    "medium",
    "mixed",
    "warm",
    "cool",
    "soft",
    "hard",
    "vivid",
    "muted",
    "subtle",
    "default",
    "auto",
    "any",
    "none",
    "tbd",
    "unknown",
    "unspecified",
}

_MIN_KEYWORD_LEN = 3


def _iter_raw_primitive_blocks(
    primitives_root: Path,
) -> Iterable[Tuple[str, Dict[str, Any]]]:
    """Yield (pack_name, raw_block_dict) by reading YAML directly.

    Distinct from `coverage._iter_primitives` because that walker calls
    `_parse_blocks_from_yaml`, which calls `populate_block_ontology_ids`,
    which calls `get_registry()` — re-entering `_ensure_loaded()` and
    causing infinite recursion when the bridge runs at registry init.
    Reading raw YAML keeps the bridge self-contained.
    """
    for pack_dir in sorted(p for p in primitives_root.iterdir() if p.is_dir()):
        sources: List[Path] = []
        single = pack_dir / "blocks.yaml"
        if single.exists():
            sources.append(single)
        blocks_dir = pack_dir / "blocks"
        if blocks_dir.is_dir():
            for ext in ("*.yaml", "*.yml"):
                sources.extend(sorted(blocks_dir.glob(ext)))

        for source_path in sources:
            try:
                with open(source_path, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
            except Exception as exc:  # noqa: BLE001 — bridge is best-effort
                logger.warning(
                    "vocab_bridge: failed to read %s: %s",
                    source_path,
                    exc,
                )
                continue
            blocks = data.get("blocks") if isinstance(data, dict) else None
            if not isinstance(blocks, list):
                continue
            for block in blocks:
                if isinstance(block, dict):
                    yield (pack_dir.name, block)


def _block_id_tail(block_id: str) -> str:
    if not block_id:
        return ""
    return block_id.rsplit(".", 1)[-1]


def _normalize_keyword(value: str) -> str:
    return value.strip().lower()


def _expand_keyword(value: str) -> List[str]:
    """`golden_hour` → ["golden_hour", "golden hour", "golden", "hour"].

    Underscores get split into both joined-with-space and individual
    tokens so a primitive's text can match either authoring style.
    Tokens shorter than _MIN_KEYWORD_LEN are dropped, as are pure
    numeric values and entries on the global value stoplist.
    """
    base = _normalize_keyword(value)
    if not base:
        return []
    # Drop pure numeric / decimal values.
    if base.replace(".", "", 1).replace("-", "", 1).isdigit():
        return []
    out: List[str] = []
    seen: Set[str] = set()

    def _add(candidate: str) -> None:
        normalized = candidate.strip().lower()
        if len(normalized) < _MIN_KEYWORD_LEN:
            return
        if normalized in _VALUE_STOPLIST:
            return
        if normalized in seen:
            return
        seen.add(normalized)
        out.append(normalized)

    _add(base)
    if "_" in base:
        _add(base.replace("_", " "))
        for token in base.split("_"):
            _add(token)
    return out


def _harvest_keywords(block: Dict[str, Any]) -> List[str]:
    """Collect keywords from a primitive's tag values + block_id tail.

    Order matters only for stability — duplicates are deduped.
    """
    keywords: List[str] = []
    seen: Set[str] = set()

    def _push(value: str) -> None:
        for expanded in _expand_keyword(value):
            if expanded in seen:
                continue
            seen.add(expanded)
            keywords.append(expanded)

    # 1. Explicit author override at the primitive level (top-level
    #    `keywords:` field on the block dict).
    explicit_top = block.get("keywords")
    if isinstance(explicit_top, list):
        for kw in explicit_top:
            if isinstance(kw, str):
                _push(kw)

    # 2. Optional author override inside tags as well (legacy convenience).
    raw_tags = block.get("tags") or {}
    if isinstance(raw_tags, dict):
        explicit_tag = raw_tags.get("keywords")
        if isinstance(explicit_tag, list):
            for kw in explicit_tag:
                if isinstance(kw, str):
                    _push(kw)

        # 3. Tag values (skip deny-listed qualifier keys).
        for key, value in raw_tags.items():
            if not isinstance(key, str) or key in _TAG_KEY_DENY or key == "keywords":
                continue
            if isinstance(value, str):
                _push(value)
            elif isinstance(value, list):
                for v in value:
                    if isinstance(v, str):
                        _push(v)

    # 4. block_id tail.
    tail = _block_id_tail(str(block.get("block_id") or ""))
    if tail:
        _push(tail)

    return keywords


def _category_for_bridge(block: Dict[str, Any]) -> Optional[str]:
    """Return the primitive's category if the bridge should handle it."""
    category = _resolve_category(block)
    if not category or category == "<no_category>":
        return None
    if category in _EXCLUDED_CATEGORIES:
        return None
    return category


def build_implicit_vocab_pack(
    *,
    primitives_root: Optional[Path] = None,
) -> Dict[str, Any]:
    """Walk primitives on disk and return a vocab pack data dict.

    Shape matches `VocabularyRegistry.register_pack()` expectations:
        {"primitive_concepts": {"<id>": {label, keywords, data...}}}

    Returns an empty dict if `primitives_root` is missing.
    """
    root = primitives_root or DEFAULT_PRIMITIVES_ROOT
    if not root.exists():
        return {}

    items: Dict[str, Dict[str, Any]] = {}

    for pack_name, block in _iter_raw_primitive_blocks(root):
        category = _category_for_bridge(block)
        if not category:
            continue

        block_id = str(block.get("block_id") or "").strip()
        tail = _block_id_tail(block_id)
        if not tail:
            continue

        keywords = _harvest_keywords(block)
        if not keywords:
            continue

        item_id = f"{category}:{tail}"
        if item_id in items:
            # Merge keywords across primitives that share the same
            # category:tail (rare but possible across packs). First
            # primitive's label wins; keywords are unioned.
            existing = items[item_id]
            seen = set(existing["keywords"])
            for kw in keywords:
                if kw not in seen:
                    seen.add(kw)
                    existing["keywords"].append(kw)
            continue

        label = block_id or item_id
        items[item_id] = {
            "label": label,
            "keywords": keywords,
            # Carried into GenericVocabDef.data — the inspector can later
            # query who-bridged-what without parsing IDs.
            "primitive_block_id": block_id,
            "primitive_pack": pack_name,
            "primitive_category": category,
        }

    if not items:
        return {}
    return {BRIDGE_VOCAB_TYPE: items}


def bridge_primitive_concepts_into(
    registry: Any,
    *,
    primitives_root: Optional[Path] = None,
) -> int:
    """Register the implicit pack into a `VocabularyRegistry`.

    Returns the number of items registered. Idempotent: if the pack is
    already present (e.g. a previous boot or a test fixture), it is
    unregistered first so item counts and keywords stay accurate.
    """
    pack = build_implicit_vocab_pack(primitives_root=primitives_root)
    if not pack:
        return 0

    # Idempotency.
    try:
        registry.unregister_pack(BRIDGE_PACK_ID)
    except Exception:  # noqa: BLE001 — best-effort cleanup
        pass

    info = registry.register_pack(
        BRIDGE_PACK_ID,
        pack,
        layer=f"runtime:{BRIDGE_PACK_ID}",
        label="Auto-bridged primitive concepts",
        plugin_id="vocab_bridge",
        allow_overwrite=False,
    )
    count = info.concepts_added.get(BRIDGE_VOCAB_TYPE, 0)
    logger.info(
        "vocab_bridge: registered %d implicit %s entries",
        count,
        BRIDGE_VOCAB_TYPE,
    )
    return count


__all__ = [
    "BRIDGE_PACK_ID",
    "BRIDGE_VOCAB_TYPE",
    "build_implicit_vocab_pack",
    "bridge_primitive_concepts_into",
]
