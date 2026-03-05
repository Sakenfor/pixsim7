"""Matrix value resolution, expected values, and drift report helpers."""
from collections import Counter
from typing import List, Optional, Dict, Any

from .helpers_roles import _infer_block_composition_role


def _resolve_block_matrix_value(
    block: Any,
    key: str,
    *,
    missing_label: str = "__missing__",
) -> str:
    """Resolve a matrix axis key from top-level block fields or tags.

    Rules:
    - `tag:<key>` explicitly targets tags
    - known top-level keys use block attrs (via getattr, safe for both models)
    - unknown keys fall back to tags[key]
    """
    key = (key or "").strip()
    if not key:
        return missing_label

    top_level_keys = {
        "composition_role", "category", "package_name", "kind",
        "default_intent", "complexity_level", "source",
    }
    tags = getattr(block, "tags", None)
    tags_dict: Dict[str, Any] = tags if isinstance(tags, dict) else {}

    if key.startswith("tag:"):
        tag_key = key[4:]
        value = tags_dict.get(tag_key)
    elif key == "composition_role":
        value = _infer_block_composition_role(block)
    elif key == "package_name":
        source_pack = tags_dict.get("source_pack")
        if isinstance(source_pack, str) and source_pack.strip():
            value = source_pack.strip()
        else:
            value = getattr(block, "package_name", None)
    elif key in top_level_keys:
        value = getattr(block, key, None)
        if key == "default_intent" and value is not None:
            value = getattr(value, "value", value)
    else:
        value = tags_dict.get(key)

    if value is None or value == "":
        return missing_label
    if isinstance(value, list):
        return "|".join(str(v) for v in value)
    if isinstance(value, dict):
        # Keep matrix cells readable; nested dicts are not ideal matrix axes.
        return "{...}"
    return str(value)


def _extend_axis_values_from_canonical_dictionary(
    axis_values: set[str],
    axis_key: str,
    *,
    include_empty: bool,
    expected_values_csv: Optional[str],
) -> None:
    """Augment observed axis values with canonical allowed values when requested.

    This makes matrix presets more future-proof:
    - If `include_empty=true` and the axis is a canonical tag key with allowed_values,
      we include those values even if no blocks exist yet.
    - Explicit `expected_*_values` always wins (we still include those as well).
    """
    if expected_values_csv:
        axis_values.update(v.strip() for v in expected_values_csv.split(",") if v.strip())
        return
    if not include_empty:
        return

    # Only apply to tag axes (explicit tag:<key>), or implicit tag axes that match canonical keys.
    from pixsim7.backend.main.services.prompt.block.tag_dictionary import get_canonical_block_tag_dictionary

    canonical = get_canonical_block_tag_dictionary()
    axis_key = (axis_key or "").strip()
    if not axis_key:
        return

    top_level_keys = {
        "composition_role",
        "category",
        "package_name",
        "kind",
        "default_intent",
        "complexity_level",
    }
    tag_key: Optional[str] = None
    if axis_key.startswith("tag:"):
        tag_key = axis_key[4:].strip()
    elif axis_key not in top_level_keys and axis_key in canonical:
        tag_key = axis_key

    if not tag_key:
        return

    meta = canonical.get(tag_key) or {}
    allowed = meta.get("allowed_values") or []
    if isinstance(allowed, list) and allowed:
        axis_values.update(str(v) for v in allowed if v is not None and str(v).strip())


def _parse_csv_values(csv: Optional[str]) -> List[str]:
    if not csv:
        return []
    return [v.strip() for v in csv.split(",") if v.strip()]


def _axis_key_to_tag_key(axis_key: str) -> Optional[str]:
    """Map a matrix axis key to the underlying tag key, if it targets tags."""
    axis_key = (axis_key or "").strip()
    if not axis_key:
        return None
    if axis_key.startswith("tag:"):
        return axis_key[4:].strip() or None
    top_level_keys = {
        "composition_role",
        "category",
        "package_name",
        "kind",
        "default_intent",
        "complexity_level",
    }
    return None if axis_key in top_level_keys else axis_key


def _canonical_allowed_values_for_tag_key(tag_key: str) -> List[str]:
    from pixsim7.backend.main.services.prompt.block.tag_dictionary import get_canonical_block_tag_dictionary

    canonical = get_canonical_block_tag_dictionary()
    meta = canonical.get(tag_key) or {}
    allowed = meta.get("allowed_values") or []
    if not isinstance(allowed, list):
        return []
    return [str(v).strip() for v in allowed if v is not None and str(v).strip()]


def _get_prompt_block_family_schema(sequence_family: Optional[str]) -> Optional[Dict[str, Any]]:
    sequence_family = (sequence_family or "").strip()
    if not sequence_family:
        return None
    try:
        from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

        item = get_registry().get_prompt_block_family(sequence_family)
    except Exception:
        return None
    if item is None:
        return None
    data = getattr(item, "data", None)
    return dict(data) if isinstance(data, dict) else None


def _family_selected_axis_from_tag_constraints(
    family_schema: Optional[Dict[str, Any]],
    tag_constraints: Optional[Dict[str, str]],
) -> Optional[str]:
    if not family_schema or not isinstance(tag_constraints, dict):
        return None
    axis_tag_key = str(family_schema.get("axis_tag_key") or "beat_axis")
    value = tag_constraints.get(axis_tag_key)
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()


def _family_expected_values_for_matrix_axis(
    family_schema: Optional[Dict[str, Any]],
    *,
    axis_key: str,
    tag_constraints: Optional[Dict[str, str]],
) -> List[str]:
    if not family_schema:
        return []
    axes = family_schema.get("axes") or {}
    if not isinstance(axes, dict) or not axes:
        return []

    tag_key = _axis_key_to_tag_key(axis_key)
    if not tag_key:
        return []

    family_axis_tag_key = str(family_schema.get("axis_tag_key") or "beat_axis")
    if tag_key == family_axis_tag_key:
        return sorted(str(k) for k in axes.keys() if str(k).strip())

    selected_axis = _family_selected_axis_from_tag_constraints(family_schema, tag_constraints)
    if selected_axis and selected_axis in axes:
        axis_meta = axes.get(selected_axis) or {}
        expected_values = axis_meta.get("expected_values") or {}
        values = expected_values.get(tag_key) if isinstance(expected_values, dict) else None
        if isinstance(values, list):
            return [str(v).strip() for v in values if v is not None and str(v).strip()]

    # No explicit beat_axis filter; union values across axes.
    union: set[str] = set()
    for axis_meta in axes.values():
        if not isinstance(axis_meta, dict):
            continue
        expected_values = axis_meta.get("expected_values") or {}
        if not isinstance(expected_values, dict):
            continue
        values = expected_values.get(tag_key)
        if isinstance(values, list):
            union.update(str(v).strip() for v in values if v is not None and str(v).strip())
    return sorted(union)


def _family_expected_and_required_tag_keys(
    family_schema: Optional[Dict[str, Any]],
    *,
    tag_constraints: Optional[Dict[str, str]],
) -> tuple[List[str], List[str]]:
    if not family_schema:
        return [], []
    axes = family_schema.get("axes") or {}
    if not isinstance(axes, dict):
        axes = {}

    expected: set[str] = set()
    required: set[str] = set()

    family_tag_key = str(family_schema.get("family_tag_key") or "sequence_family")
    axis_tag_key = str(family_schema.get("axis_tag_key") or "beat_axis")
    if family_tag_key:
        expected.add(family_tag_key)
    if axis_tag_key:
        expected.add(axis_tag_key)

    for key in family_schema.get("required_base_tags") or []:
        if isinstance(key, str) and key.strip():
            expected.add(key.strip())
            required.add(key.strip())
    for key in family_schema.get("recommended_base_tags") or []:
        if isinstance(key, str) and key.strip():
            expected.add(key.strip())

    selected_axis = _family_selected_axis_from_tag_constraints(family_schema, tag_constraints)
    axes_to_scan: List[Dict[str, Any]] = []
    if selected_axis and isinstance(axes.get(selected_axis), dict):
        axes_to_scan = [axes[selected_axis]]
    else:
        axes_to_scan = [axis_meta for axis_meta in axes.values() if isinstance(axis_meta, dict)]

    for axis_meta in axes_to_scan:
        for key in axis_meta.get("required_tags") or []:
            if isinstance(key, str) and key.strip():
                expected.add(key.strip())
                required.add(key.strip())
        for key in axis_meta.get("recommended_tags") or []:
            if isinstance(key, str) and key.strip():
                expected.add(key.strip())
        expected_values = axis_meta.get("expected_values") or {}
        if isinstance(expected_values, dict):
            for key in expected_values.keys():
                key_str = str(key).strip()
                if key_str:
                    expected.add(key_str)

    return sorted(expected), sorted(required)


def _build_block_matrix_drift_report(
    *,
    blocks: List[Any],
    row_key: str,
    col_key: str,
    missing_label: str,
    expected_row_values_csv: Optional[str],
    expected_col_values_csv: Optional[str],
    use_canonical_expected_values: bool,
    expected_tag_keys_csv: Optional[str],
    required_tag_keys_csv: Optional[str],
    max_entries: int,
    max_examples_per_entry: int,
    tag_constraints: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    observed_row_values: set[str] = set()
    observed_col_values: set[str] = set()
    row_missing = 0
    col_missing = 0
    dict_axis_values = {"row": 0, "col": 0}

    expected_row_values = _parse_csv_values(expected_row_values_csv)
    expected_col_values = _parse_csv_values(expected_col_values_csv)

    family_schema = _get_prompt_block_family_schema((tag_constraints or {}).get("sequence_family"))
    if not expected_row_values:
        expected_row_values = _family_expected_values_for_matrix_axis(
            family_schema,
            axis_key=row_key,
            tag_constraints=tag_constraints,
        )
    if not expected_col_values:
        expected_col_values = _family_expected_values_for_matrix_axis(
            family_schema,
            axis_key=col_key,
            tag_constraints=tag_constraints,
        )

    if use_canonical_expected_values and not expected_row_values:
        tag_key = _axis_key_to_tag_key(row_key)
        if tag_key:
            expected_row_values = _canonical_allowed_values_for_tag_key(tag_key)
    if use_canonical_expected_values and not expected_col_values:
        tag_key = _axis_key_to_tag_key(col_key)
        if tag_key:
            expected_col_values = _canonical_allowed_values_for_tag_key(tag_key)

    expected_row_set = set(expected_row_values) if expected_row_values else None
    expected_col_set = set(expected_col_values) if expected_col_values else None

    family_expected_tag_keys, family_required_tag_keys = _family_expected_and_required_tag_keys(
        family_schema,
        tag_constraints=tag_constraints,
    )
    expected_tag_keys = set(_parse_csv_values(expected_tag_keys_csv)) if expected_tag_keys_csv else (
        set(family_expected_tag_keys) if family_expected_tag_keys else None
    )
    required_tag_keys = _parse_csv_values(required_tag_keys_csv) or family_required_tag_keys

    unexpected_tag_key_counts: Counter[str] = Counter()
    unexpected_tag_key_examples: Dict[str, List[str]] = {}
    missing_required_counts: Counter[str] = Counter()
    missing_required_examples: Dict[str, List[str]] = {}
    observed_tag_key_counts: Counter[str] = Counter()

    for b in blocks:
        row_value = _resolve_block_matrix_value(b, row_key, missing_label=missing_label)
        col_value = _resolve_block_matrix_value(b, col_key, missing_label=missing_label)

        observed_row_values.add(row_value)
        observed_col_values.add(col_value)

        if row_value == missing_label:
            row_missing += 1
        if col_value == missing_label:
            col_missing += 1
        if row_value == "{...}":
            dict_axis_values["row"] += 1
        if col_value == "{...}":
            dict_axis_values["col"] += 1

        tags = b.tags if isinstance(getattr(b, "tags", None), dict) else {}
        block_id = getattr(b, "block_id", "") or ""

        for k in tags.keys():
            key = str(k)
            observed_tag_key_counts[key] += 1
            if expected_tag_keys is not None and key not in expected_tag_keys:
                unexpected_tag_key_counts[key] += 1
                bucket = unexpected_tag_key_examples.setdefault(key, [])
                if block_id and len(bucket) < max_examples_per_entry:
                    bucket.append(block_id)

        for req_key in required_tag_keys:
            value = tags.get(req_key)
            missing = value is None or value == "" or value == [] or value == {}
            if missing:
                missing_required_counts[req_key] += 1
                bucket = missing_required_examples.setdefault(req_key, [])
                if block_id and len(bucket) < max_examples_per_entry:
                    bucket.append(block_id)

    unexpected_row_values: List[str] = []
    unexpected_col_values: List[str] = []
    if expected_row_set is not None:
        unexpected_row_values = sorted(
            v for v in observed_row_values
            if v not in expected_row_set and v != missing_label
        )
    if expected_col_set is not None:
        unexpected_col_values = sorted(
            v for v in observed_col_values
            if v not in expected_col_set and v != missing_label
        )

    def _top(counter: Counter[str]) -> List[Dict[str, Any]]:
        items = [{"key": k, "count": v} for k, v in counter.most_common(max_entries)]
        return items

    def _top_with_examples(counter: Counter[str], examples: Dict[str, List[str]]) -> List[Dict[str, Any]]:
        items = []
        for k, v in counter.most_common(max_entries):
            items.append({"key": k, "count": v, "examples": examples.get(k, [])})
        return items

    drift: Dict[str, Any] = {
        "row": {
            "row_key": row_key,
            "missing_label": missing_label,
            "missing_count": row_missing,
            "dict_value_count": dict_axis_values["row"],
            "observed_values": sorted(observed_row_values),
            "expected_values": expected_row_values or None,
            "unexpected_values": unexpected_row_values,
        },
        "col": {
            "col_key": col_key,
            "missing_label": missing_label,
            "missing_count": col_missing,
            "dict_value_count": dict_axis_values["col"],
            "observed_values": sorted(observed_col_values),
            "expected_values": expected_col_values or None,
            "unexpected_values": unexpected_col_values,
        },
        "tags": {
            "expected_keys": sorted(expected_tag_keys) if expected_tag_keys is not None else None,
            "required_keys": required_tag_keys or None,
            "family_schema": (tag_constraints or {}).get("sequence_family") if family_schema else None,
            "observed_keys_top": _top(observed_tag_key_counts),
            "unexpected_keys_top": _top_with_examples(unexpected_tag_key_counts, unexpected_tag_key_examples) if expected_tag_keys is not None else [],
            "missing_required_top": _top_with_examples(missing_required_counts, missing_required_examples) if required_tag_keys else [],
        },
    }
    return drift
