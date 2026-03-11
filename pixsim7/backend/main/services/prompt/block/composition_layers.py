"""Shared composition and layer-order helpers for prompt block assembly."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple

_SENTENCE_ENDINGS = frozenset(".!?")
_DEFAULT_LAYER_DEFS: Tuple[Dict[str, Any], ...] = (
    {
        "id": "L0",
        "priority": 0,
        "aliases": ["hard", "hard_constraints", "safety", "constraints", "policy"],
    },
    {
        "id": "L1",
        "priority": 10,
        "aliases": ["anchors", "anchor", "context", "context_anchors"],
    },
    {
        "id": "L2",
        "priority": 20,
        "aliases": ["core", "composition", "core_composition"],
    },
    {
        "id": "L3",
        "priority": 30,
        "aliases": ["state", "stateful", "stateful_modifiers", "modifiers"],
    },
    {
        "id": "L4",
        "priority": 40,
        "aliases": ["optional", "overlay", "overlays", "style", "prose"],
    },
)
_ROLE_ORDER = {
    "setting": 10,
    "character": 20,
    "action": 30,
    "camera": 40,
    "mood": 50,
    "other": 90,
}


def ensure_period(text: str) -> str:
    stripped = text.rstrip()
    if not stripped:
        return stripped
    if stripped[-1] not in _SENTENCE_ENDINGS:
        return stripped + "."
    return stripped


def join_blocks(parts: List[str]) -> str:
    cleaned = [ensure_period(p.strip()) for p in parts if p.strip()]
    return "\n".join(cleaned)


def block_text(block: Any) -> str:
    if isinstance(block, dict):
        return str(block.get("text") or "")
    return str(getattr(block, "text", "") or "")


def _block_role(block: Any) -> Optional[str]:
    if isinstance(block, dict):
        value = block.get("role")
    else:
        value = getattr(block, "role", None)
    if isinstance(value, str):
        value = value.strip()
    return value or None


def _block_category(block: Any) -> Optional[str]:
    if isinstance(block, dict):
        value = block.get("category")
    else:
        value = getattr(block, "category", None)
    if isinstance(value, str):
        value = value.strip()
    return value or None


def _block_id(block: Any) -> Optional[str]:
    value: Any = None
    if isinstance(block, dict):
        value = block.get("block_id") or block.get("id")
    else:
        value = getattr(block, "block_id", None) or getattr(block, "id", None)
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _block_metadata_value(block: Any, key: str) -> Optional[str]:
    metadata: Optional[Dict[str, Any]] = None
    if isinstance(block, dict):
        raw = block.get("block_metadata")
        if isinstance(raw, dict):
            metadata = raw
    else:
        raw = getattr(block, "block_metadata", None)
        if isinstance(raw, dict):
            metadata = raw
    if not metadata:
        return None
    value = metadata.get(key)
    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None
    return None


def _block_tag_value(block: Any, key: str) -> Optional[str]:
    tags: Optional[Dict[str, Any]] = None
    if isinstance(block, dict):
        raw = block.get("tags")
        if isinstance(raw, dict):
            tags = raw
    else:
        raw = getattr(block, "tags", None)
        if isinstance(raw, dict):
            tags = raw
    if not tags:
        return None
    value = tags.get(key)
    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None
    return None


def _normalize_layer(value: Optional[str], *, alias_map: Dict[str, str]) -> Optional[str]:
    if not isinstance(value, str):
        return None
    key = value.strip().lower()
    if not key:
        return None
    return alias_map.get(key)


def build_layer_registry(raw_config: Any) -> Tuple[Dict[str, int], Dict[str, str], List[str]]:
    warnings: List[str] = []
    layers: Dict[str, Dict[str, Any]] = {}

    for entry in _DEFAULT_LAYER_DEFS:
        layer_id = str(entry["id"])
        aliases = [str(alias).strip() for alias in (entry.get("aliases") or []) if str(alias).strip()]
        layers[layer_id] = {
            "id": layer_id,
            "priority": int(entry.get("priority", 0)),
            "aliases": aliases,
        }

    if raw_config is not None:
        if not isinstance(raw_config, list):
            warnings.append(
                "template_metadata.assembly_layers must be a list of {id, priority?, aliases?}; using defaults"
            )
        else:
            for idx, item in enumerate(raw_config):
                if not isinstance(item, dict):
                    warnings.append(
                        f"template_metadata.assembly_layers[{idx}] must be an object; entry ignored"
                    )
                    continue
                raw_layer_id = item.get("id")
                if not isinstance(raw_layer_id, str) or not raw_layer_id.strip():
                    warnings.append(
                        f"template_metadata.assembly_layers[{idx}].id must be a non-empty string; entry ignored"
                    )
                    continue

                layer_id = raw_layer_id.strip()
                existing = layers.get(layer_id)

                raw_priority = item.get("priority")
                if raw_priority is None:
                    priority = existing.get("priority") if existing else None
                elif isinstance(raw_priority, int):
                    priority = raw_priority
                else:
                    try:
                        priority = int(raw_priority)
                    except (TypeError, ValueError):
                        warnings.append(
                            f"template_metadata.assembly_layers[{idx}].priority must be numeric; using default"
                        )
                        priority = existing.get("priority") if existing else None
                if priority is None:
                    max_priority = max((int(v.get("priority", 0)) for v in layers.values()), default=0)
                    priority = max_priority + 10

                aliases: List[str] = []
                raw_aliases = item.get("aliases")
                if raw_aliases is None:
                    aliases = []
                elif isinstance(raw_aliases, list):
                    for alias in raw_aliases:
                        if isinstance(alias, str) and alias.strip():
                            aliases.append(alias.strip())
                        else:
                            warnings.append(
                                f"template_metadata.assembly_layers[{idx}].aliases contains non-string value; skipped"
                            )
                else:
                    warnings.append(
                        f"template_metadata.assembly_layers[{idx}].aliases must be a list of strings; ignored"
                    )

                if existing:
                    merged_aliases: List[str] = []
                    seen_aliases = set()
                    for alias in [*existing.get("aliases", []), *aliases]:
                        key = alias.lower()
                        if key in seen_aliases:
                            continue
                        seen_aliases.add(key)
                        merged_aliases.append(alias)
                    layers[layer_id] = {
                        "id": layer_id,
                        "priority": int(priority),
                        "aliases": merged_aliases,
                    }
                else:
                    layers[layer_id] = {
                        "id": layer_id,
                        "priority": int(priority),
                        "aliases": aliases,
                    }

    ordered_layers = sorted(
        layers.values(),
        key=lambda entry: (int(entry.get("priority", 0)), str(entry.get("id", "")).lower()),
    )
    layer_rank = {str(entry["id"]): idx for idx, entry in enumerate(ordered_layers)}

    alias_map: Dict[str, str] = {}
    for entry in ordered_layers:
        canonical = str(entry["id"])
        canonical_key = canonical.lower()
        if canonical_key not in alias_map:
            alias_map[canonical_key] = canonical
        for alias in entry.get("aliases", []):
            alias_key = str(alias).strip().lower()
            if not alias_key:
                continue
            existing = alias_map.get(alias_key)
            if existing and existing != canonical:
                warnings.append(
                    f"assembly layer alias '{alias}' collides between '{existing}' and '{canonical}'; keeping '{existing}'"
                )
                continue
            alias_map[alias_key] = canonical

    return layer_rank, alias_map, warnings


def _infer_layer_from_role_category(role: Optional[str], category: Optional[str]) -> str:
    role_key = (role or "").strip().lower()
    category_key = (category or "").strip().lower()

    if role_key in {"safety", "constraint", "constraints", "policy"}:
        return "L0"
    if role_key in {"setting", "character", "context"}:
        return "L1"
    if role_key in {"action", "camera"}:
        return "L2"
    if role_key in {"mood", "style", "emotion"}:
        return "L3"
    if role_key == "other":
        return "L4"

    if category_key in {"safety", "constraint", "policy"}:
        return "L0"
    if category_key in {"setting", "location", "context"}:
        return "L1"
    if category_key in {"camera", "shot", "angle", "focus", "light", "placement", "action"}:
        return "L2"
    if category_key in {"mood", "style", "tone", "emotion"}:
        return "L3"

    return "L4"


def block_layer(block: Any, *, alias_map: Dict[str, str]) -> str:
    explicit_layer = (
        _normalize_layer(_block_metadata_value(block, "assembly_layer"), alias_map=alias_map)
        or _normalize_layer(_block_metadata_value(block, "layer"), alias_map=alias_map)
        or _normalize_layer(_block_tag_value(block, "assembly_layer"), alias_map=alias_map)
        or _normalize_layer(_block_tag_value(block, "layer"), alias_map=alias_map)
    )
    if explicit_layer:
        return explicit_layer
    return _infer_layer_from_role_category(_block_role(block), _block_category(block))


def _role_order_key(block: Any) -> int:
    role = (_block_role(block) or "other").strip().lower()
    return _ROLE_ORDER.get(role, _ROLE_ORDER["other"])


def compose_sequential(blocks: List[Any]) -> str:
    if not blocks:
        return ""
    return join_blocks([block_text(block) for block in blocks if block_text(block)])


def order_layered_blocks(
    blocks: List[Any],
    *,
    layer_rank: Optional[Dict[str, int]] = None,
    layer_alias_map: Optional[Dict[str, str]] = None,
) -> List[Any]:
    indexed = list(enumerate(blocks))
    rank_map = layer_rank
    alias_map = layer_alias_map
    if rank_map is None or alias_map is None:
        default_rank, default_alias_map, _ = build_layer_registry(None)
        rank_map = default_rank
        alias_map = default_alias_map

    def _sort_key(item: tuple[int, Any]) -> tuple[int, int, int]:
        original_index, block = item
        layer = block_layer(block, alias_map=alias_map)
        return (
            rank_map.get(layer, len(rank_map)),
            _role_order_key(block),
            original_index,
        )

    return [block for _, block in sorted(indexed, key=_sort_key)]


def compose_layered(
    blocks: List[Any],
    *,
    layer_rank: Optional[Dict[str, int]] = None,
    layer_alias_map: Optional[Dict[str, str]] = None,
) -> str:
    return join_blocks(
        [
            block_text(block)
            for block in order_layered_blocks(
                blocks,
                layer_rank=layer_rank,
                layer_alias_map=layer_alias_map,
            )
            if block_text(block)
        ]
    )


def compose_merged(blocks: List[Any]) -> str:
    return compose_sequential(blocks)


def resolve_layer_budget_settings(
    raw_budget: Any,
    *,
    raw_max_chars: Any = None,
    layer_alias_map: Dict[str, str],
) -> Tuple[Optional[int], Set[str], List[str]]:
    warnings: List[str] = []

    if raw_budget is None and raw_max_chars is not None:
        raw_budget = {"max_chars": raw_max_chars}

    enabled = True
    max_chars_raw = None
    protected_layers_raw: Any = None

    if raw_budget is None:
        max_chars_raw = None
    elif isinstance(raw_budget, dict):
        if "enabled" in raw_budget:
            enabled = bool(raw_budget.get("enabled"))
        max_chars_raw = raw_budget.get("max_chars")
        if max_chars_raw is None:
            max_chars_raw = raw_budget.get("char_limit")
        protected_layers_raw = raw_budget.get("protected_layers")
    else:
        max_chars_raw = raw_budget

    default_protected: Set[str] = set()
    for label in ("L0", "L1"):
        canonical = layer_alias_map.get(label.lower())
        if canonical:
            default_protected.add(canonical)

    protected_layers: Set[str] = set(default_protected)
    if protected_layers_raw is not None:
        if not isinstance(protected_layers_raw, list):
            warnings.append("assembly_budget.protected_layers must be a list; using defaults")
        else:
            resolved: Set[str] = set()
            for idx, value in enumerate(protected_layers_raw):
                if not isinstance(value, str) or not value.strip():
                    warnings.append(
                        f"assembly_budget.protected_layers[{idx}] must be a non-empty string; entry ignored"
                    )
                    continue
                canonical = _normalize_layer(value, alias_map=layer_alias_map)
                if not canonical:
                    warnings.append(
                        f"assembly_budget.protected_layers[{idx}] unknown layer '{value}'; entry ignored"
                    )
                    continue
                resolved.add(canonical)
            if resolved:
                protected_layers = resolved

    if not enabled:
        return None, protected_layers, warnings

    if max_chars_raw is None:
        return None, protected_layers, warnings

    try:
        max_chars = int(max_chars_raw)
    except (TypeError, ValueError):
        warnings.append("assembly_budget.max_chars must be numeric; budget disabled")
        return None, protected_layers, warnings

    if max_chars <= 0:
        warnings.append("assembly_budget.max_chars must be > 0; budget disabled")
        return None, protected_layers, warnings

    return max_chars, protected_layers, warnings


def apply_layered_budget(
    *,
    ordered_blocks: List[Any],
    max_chars: Optional[int],
    layer_rank: Dict[str, int],
    layer_alias_map: Dict[str, str],
    protected_layers: Optional[Set[str]] = None,
) -> Tuple[List[Any], Dict[str, Any], List[str]]:
    warnings: List[str] = []
    protected = set(protected_layers or set())

    entries: List[Dict[str, Any]] = []
    for block in ordered_blocks:
        text = ensure_period(block_text(block).strip())
        if not text:
            continue
        entries.append(
            {
                "block": block,
                "block_id": _block_id(block),
                "layer": block_layer(block, alias_map=layer_alias_map),
                "text": text,
            }
        )

    def _total_chars(rows: List[Dict[str, Any]]) -> int:
        if not rows:
            return 0
        return sum(len(str(row["text"])) for row in rows) + max(0, len(rows) - 1)

    before_chars = _total_chars(entries)
    report: Dict[str, Any] = {
        "applied": bool(max_chars is not None),
        "max_chars": int(max_chars) if max_chars is not None else None,
        "before_chars": before_chars,
        "after_chars": before_chars,
        "status": "not_applied",
        "dropped_block_ids": [],
        "trimmed_block_ids": [],
        "kept_block_ids": [row["block_id"] for row in entries if row.get("block_id")],
        "protected_layers": sorted(protected),
    }

    if max_chars is None:
        report["status"] = "disabled"
        return [row["block"] for row in entries], report, warnings

    if before_chars <= max_chars:
        report["status"] = "fit"
        return [row["block"] for row in entries], report, warnings

    rank_to_layer = sorted(
        ((rank, layer) for layer, rank in layer_rank.items()),
        key=lambda item: item[0],
    )
    drop_layers = [layer for _, layer in reversed(rank_to_layer) if layer not in protected]

    dropped_ids: List[str] = []
    for layer_id in drop_layers:
        while _total_chars(entries) > max_chars:
            drop_idx = None
            for idx in range(len(entries) - 1, -1, -1):
                if entries[idx]["layer"] == layer_id:
                    drop_idx = idx
                    break
            if drop_idx is None:
                break
            entry = entries.pop(drop_idx)
            block_id = entry.get("block_id")
            if isinstance(block_id, str) and block_id:
                dropped_ids.append(block_id)

    trimmed_ids: List[str] = []

    def _trim_layer(layer_id: Optional[str]) -> None:
        if not layer_id or layer_id in protected:
            return
        while _total_chars(entries) > max_chars:
            trim_idx = None
            for idx in range(len(entries) - 1, -1, -1):
                if entries[idx]["layer"] == layer_id and len(entries[idx]["text"]) > 4:
                    trim_idx = idx
                    break
            if trim_idx is None:
                return
            total = _total_chars(entries)
            excess = total - max_chars
            current_text = str(entries[trim_idx]["text"])
            reducible = max(0, len(current_text) - 4)
            if reducible <= 0:
                return
            cut = min(excess, reducible)
            keep = len(current_text) - cut
            if keep <= 3:
                new_text = "..."
            else:
                new_text = current_text[: keep - 3].rstrip() + "..."
            entries[trim_idx]["text"] = new_text
            block_id = entries[trim_idx].get("block_id")
            if isinstance(block_id, str) and block_id and block_id not in trimmed_ids:
                trimmed_ids.append(block_id)

    _trim_layer(layer_alias_map.get("l3"))
    _trim_layer(layer_alias_map.get("l2"))

    after_chars = _total_chars(entries)
    report["after_chars"] = after_chars
    report["dropped_block_ids"] = dropped_ids
    report["trimmed_block_ids"] = trimmed_ids
    report["kept_block_ids"] = [row["block_id"] for row in entries if row.get("block_id")]

    if after_chars <= max_chars:
        report["status"] = "fit_after_budget"
    else:
        report["status"] = "over_budget_hard_layers"
        warnings.append(
            "Assembly budget still exceeded after drop/trim pass; protected layers likely exceed max_chars"
        )

    return [row["block"] for row in entries], report, warnings
