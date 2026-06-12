"""Audit vocabulary drift across prompt op-packs, registry, and role mappings.

Read-only repo analysis (no DB, no network). Sweeps the op-pack ``schema.yaml``
files, the registry-backed prompt_block_tags vocabulary, the composition-role
``category_mappings``, and the op-signature registry, then reports drift between
the authored content and the canonical vocabulary.

Each check is an importable function returning a ``CheckResult`` so the CI test
(``tests/blocks/test_vocab_drift_sweep.py``) can assert on them individually.

Usage:
    python -m pixsim7.backend.main.scripts.audit_vocab_drift
    python pixsim7/backend/main/scripts/audit_vocab_drift.py

Exit code: 0 when there is no *failing* drift, 1 otherwise. Known/deferred
items (covered by the allowlists below) and orphaned-tag candidates are
reported but do not fail the sweep.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Set

import yaml

from pixsim7.backend.main.services.prompt.block.family_contract_validation import (
    load_prompt_block_tag_keys,
)
from pixsim7.backend.main.services.prompt.block.tag_dictionary import (
    get_canonical_block_tag_dictionary,
    is_exempt_tag_key,
)

# ── Repo paths ───────────────────────────────────────────────────────────────

# scripts/ -> main/
_MAIN_DIR = Path(__file__).resolve().parents[1]
CONTENT_PACKS_DIR = _MAIN_DIR / "content_packs"
PROMPT_PACKS_DIR = CONTENT_PACKS_DIR / "prompt"
ROLES_YAML = (
    _MAIN_DIR / "plugins" / "starter_pack" / "vocabularies" / "roles.yaml"
)
OP_SIGNATURE_REGISTRY_YAML = (
    _MAIN_DIR / "services" / "prompt" / "block" / "op_signature_registry.yaml"
)

# ── Allowlists (known / deferred drift — non-failing) ─────────────────────────

# Tag keys used by latin CUE packs that still await tag_registry entries.
# Reported as "known/deferred"; they do NOT fail the unregistered-tags check.
KNOWN_UNREGISTERED: frozenset[str] = frozenset({"breath_type", "domain"})

# Block categories deliberately left out of category_mappings (documented in
# roles.yaml). They carry no composition-role semantics.
CATEGORY_OPT_OUTS: frozenset[str] = frozenset({"latin_enhancer", "continuity"})

# Signature ids that exist in the registry but are not yet referenced by any
# pack. Known/deferred; non-failing.
KNOWN_UNUSED_SIGNATURES: frozenset[str] = frozenset({"scene.anchor.v1"})


# ── Data structures ──────────────────────────────────────────────────────────


@dataclass
class CheckResult:
    """Structured outcome of a single drift check.

    ``failing`` is the set of items that should fail the CI gate.
    ``known`` is the set of allowlisted / deferred items (reported, non-failing).
    ``warn`` is informational-only (never fails).
    """

    name: str
    failing: List[str] = field(default_factory=list)
    known: List[str] = field(default_factory=list)
    warn: List[str] = field(default_factory=list)
    note: str = ""

    @property
    def ok(self) -> bool:
        return not self.failing


@dataclass
class PackVocab:
    """Aggregated vocabulary harvested from the op-pack ``schema.yaml`` files."""

    tag_keys: Set[str] = field(default_factory=set)
    categories: Set[str] = field(default_factory=set)
    signatures_used: Set[str] = field(default_factory=set)


# ── Collectors ───────────────────────────────────────────────────────────────


def _load_yaml(path: Path) -> Any:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except FileNotFoundError:
        return {}


def _iter_op_pack_schemas(prompt_dir: Path = PROMPT_PACKS_DIR) -> Iterable[Path]:
    return sorted(prompt_dir.glob("*/schema.yaml"))


def collect_pack_vocab(prompt_dir: Path = PROMPT_PACKS_DIR) -> PackVocab:
    """Harvest tag keys, categories, and used signature ids from op packs.

    Tag keys are collected from every block-level ``tags:`` dict, every
    variant-level ``tags:`` dict, and every ``tag_key:`` string in
    ``op.params``.
    """
    vocab = PackVocab()
    for schema_path in _iter_op_pack_schemas(prompt_dir):
        data = _load_yaml(schema_path)
        if not isinstance(data, dict):
            continue
        for block in data.get("blocks") or []:
            if not isinstance(block, dict):
                continue
            block_schema = block.get("block_schema") or {}
            if not isinstance(block_schema, dict):
                continue

            category = block_schema.get("category")
            if isinstance(category, str) and category.strip():
                vocab.categories.add(category.strip())

            block_tags = block_schema.get("tags") or {}
            if isinstance(block_tags, dict):
                vocab.tag_keys.update(str(k) for k in block_tags.keys())

            op = block_schema.get("op") or {}
            if isinstance(op, dict):
                sig = op.get("signature_id")
                if isinstance(sig, str) and sig.strip():
                    vocab.signatures_used.add(sig.strip())
                for param in op.get("params") or []:
                    if isinstance(param, dict):
                        tag_key = param.get("tag_key")
                        if isinstance(tag_key, str) and tag_key.strip():
                            vocab.tag_keys.add(tag_key.strip())

            for variant in block_schema.get("variants") or []:
                if not isinstance(variant, dict):
                    continue
                variant_tags = variant.get("tags") or {}
                if isinstance(variant_tags, dict):
                    vocab.tag_keys.update(str(k) for k in variant_tags.keys())

    return vocab


def collect_category_mappings(roles_yaml: Path = ROLES_YAML) -> Set[str]:
    """Return the set of categories that have a ``category_mappings`` entry."""
    data = _load_yaml(roles_yaml)
    mappings = data.get("category_mappings") if isinstance(data, dict) else None
    if not isinstance(mappings, dict):
        return set()
    return {str(k) for k in mappings.keys()}


def collect_registered_signature_ids(
    registry_yaml: Path = OP_SIGNATURE_REGISTRY_YAML,
) -> Set[str]:
    """Return the set of signature ids declared in the op-signature registry."""
    data = _load_yaml(registry_yaml)
    sigs = data.get("signatures") if isinstance(data, dict) else None
    if not isinstance(sigs, list):
        return set()
    out: Set[str] = set()
    for entry in sigs:
        if isinstance(entry, dict):
            sig_id = entry.get("id")
            if isinstance(sig_id, str) and sig_id.strip():
                out.add(sig_id.strip())
    return out


def collect_content_pack_tag_usage(
    content_packs_dir: Path = CONTENT_PACKS_DIR,
) -> Set[str]:
    """Return all tag keys referenced under content_packs/ (op packs + primitives).

    Used by the (warn-only) orphaned-tags check. Scans every ``tags:`` mapping
    and ``tag_key:`` string in every YAML file under content_packs/.
    """
    used: Set[str] = set()
    for yaml_path in content_packs_dir.rglob("*.yaml"):
        data = _load_yaml(yaml_path)
        _harvest_tag_keys(data, used)
    return used


def _harvest_tag_keys(node: Any, out: Set[str]) -> None:
    """Recursively collect tag keys from any ``tags:`` dict or ``tag_key:`` string."""
    if isinstance(node, dict):
        tags = node.get("tags")
        if isinstance(tags, dict):
            for key, value in tags.items():
                key_str = str(key)
                # Skip the constraint envelope so we capture the real keys.
                if key_str in ("all", "any", "not") and isinstance(value, dict):
                    out.update(str(k) for k in value.keys())
                else:
                    out.add(key_str)
        tag_key = node.get("tag_key")
        if isinstance(tag_key, str) and tag_key.strip():
            out.add(tag_key.strip())
        for value in node.values():
            _harvest_tag_keys(value, out)
    elif isinstance(node, list):
        for item in node:
            _harvest_tag_keys(item, out)


# ── Checks ───────────────────────────────────────────────────────────────────


def check_unregistered_tags(
    vocab: PackVocab | None = None,
    registry_keys: Set[str] | None = None,
) -> CheckResult:
    """Op-pack tag keys not in the registry and not exempt.

    Keys in ``KNOWN_UNREGISTERED`` are reported as known/deferred (non-failing).
    """
    vocab = vocab if vocab is not None else collect_pack_vocab()
    registry_keys = (
        registry_keys if registry_keys is not None else set(load_prompt_block_tag_keys())
    )
    result = CheckResult(name="unregistered_tags")
    for key in sorted(vocab.tag_keys):
        if key in registry_keys or is_exempt_tag_key(key):
            continue
        if key in KNOWN_UNREGISTERED:
            result.known.append(key)
        else:
            result.failing.append(key)
    return result


def check_unmapped_categories(
    vocab: PackVocab | None = None,
    mapped_categories: Set[str] | None = None,
) -> CheckResult:
    """Block categories used by op packs with no ``category_mappings`` entry.

    Categories in ``CATEGORY_OPT_OUTS`` are deliberate opt-outs (non-failing).
    """
    vocab = vocab if vocab is not None else collect_pack_vocab()
    mapped_categories = (
        mapped_categories if mapped_categories is not None else collect_category_mappings()
    )
    result = CheckResult(name="unmapped_categories")
    for category in sorted(vocab.categories):
        if category in mapped_categories:
            continue
        if category in CATEGORY_OPT_OUTS:
            result.known.append(category)
        else:
            result.failing.append(category)
    return result


def check_unused_signatures(
    vocab: PackVocab | None = None,
    registered_signatures: Set[str] | None = None,
) -> CheckResult:
    """Registry signature ids never referenced by any pack.

    Ids in ``KNOWN_UNUSED_SIGNATURES`` are known/deferred (non-failing).
    """
    vocab = vocab if vocab is not None else collect_pack_vocab()
    registered_signatures = (
        registered_signatures
        if registered_signatures is not None
        else collect_registered_signature_ids()
    )
    result = CheckResult(name="unused_signatures")
    for sig_id in sorted(registered_signatures - vocab.signatures_used):
        if sig_id in KNOWN_UNUSED_SIGNATURES:
            result.known.append(sig_id)
        else:
            result.failing.append(sig_id)
    return result


def check_missing_signatures(
    vocab: PackVocab | None = None,
    registered_signatures: Set[str] | None = None,
) -> CheckResult:
    """``signature_id`` referenced by a pack but absent from the registry. Always fails."""
    vocab = vocab if vocab is not None else collect_pack_vocab()
    registered_signatures = (
        registered_signatures
        if registered_signatures is not None
        else collect_registered_signature_ids()
    )
    result = CheckResult(name="missing_signatures")
    for sig_id in sorted(vocab.signatures_used - registered_signatures):
        result.failing.append(sig_id)
    return result


def check_deprecated_without_replacement(
    tag_dictionary: Dict[str, Dict[str, Any]] | None = None,
) -> CheckResult:
    """Tag-dictionary entries marked ``status: deprecated`` with no replacement.

    Always fails. ``replacement`` is consulted from the dictionary entry; when
    the canonical dictionary helper omits it, it falls back to the registry.
    """
    tag_dictionary = (
        tag_dictionary
        if tag_dictionary is not None
        else get_canonical_block_tag_dictionary()
    )
    replacements = _registry_replacements()
    result = CheckResult(name="deprecated_without_replacement")
    for key in sorted(tag_dictionary.keys()):
        meta = tag_dictionary.get(key) or {}
        if str(meta.get("status") or "").strip().lower() != "deprecated":
            continue
        replacement = meta.get("replacement") or replacements.get(key)
        if not replacement:
            result.failing.append(key)
    return result


def check_orphaned_tags(
    registry_keys: Set[str] | None = None,
    used_tag_keys: Set[str] | None = None,
) -> CheckResult:
    """Registered, non-exempt tag keys not used anywhere under content_packs/.

    Warn-only: live DB/code consumers can't be checked here, so this only
    surfaces candidates and never fails.
    """
    registry_keys = (
        registry_keys if registry_keys is not None else set(load_prompt_block_tag_keys())
    )
    used_tag_keys = (
        used_tag_keys if used_tag_keys is not None else collect_content_pack_tag_usage()
    )
    result = CheckResult(
        name="orphaned_tags",
        note="warn-only; live DB/code consumers are not visible to this sweep",
    )
    for key in sorted(registry_keys):
        if is_exempt_tag_key(key):
            continue
        if key not in used_tag_keys:
            result.warn.append(key)
    return result


def _registry_replacements() -> Dict[str, str]:
    """Map of tag key -> replacement from the registry (best-effort, offline)."""
    try:
        from pixsim7.backend.main.shared.ontology.vocabularies import get_registry

        registry = get_registry(strict_mode=False)
        items = registry.all_prompt_block_tags()
    except Exception:
        return {}
    out: Dict[str, str] = {}
    for item in items:
        key = str(getattr(item, "id", "") or "").strip()
        data = getattr(item, "data", {}) or {}
        replacement = data.get("replacement") if isinstance(data, dict) else None
        if key and replacement:
            out[key] = str(replacement)
    return out


# ── Orchestration ────────────────────────────────────────────────────────────

# Failing checks gate CI; warn-only checks never gate.
_FAILING_CHECKS = (
    check_unregistered_tags,
    check_unmapped_categories,
    check_unused_signatures,
    check_missing_signatures,
    check_deprecated_without_replacement,
)
_WARN_CHECKS = (check_orphaned_tags,)


def run_all_checks() -> List[CheckResult]:
    """Run every check once, sharing collected inputs where possible."""
    vocab = collect_pack_vocab()
    registry_keys = set(load_prompt_block_tag_keys())
    mapped_categories = collect_category_mappings()
    registered_signatures = collect_registered_signature_ids()
    tag_dictionary = get_canonical_block_tag_dictionary()
    used_tag_keys = collect_content_pack_tag_usage()

    return [
        check_unregistered_tags(vocab, registry_keys),
        check_unmapped_categories(vocab, mapped_categories),
        check_unused_signatures(vocab, registered_signatures),
        check_missing_signatures(vocab, registered_signatures),
        check_deprecated_without_replacement(tag_dictionary),
        check_orphaned_tags(registry_keys, used_tag_keys),
    ]


# ── Reporting ────────────────────────────────────────────────────────────────


def _fmt_items(items: List[str]) -> str:
    return ", ".join(items) if items else "-"


def print_report(results: List[CheckResult]) -> bool:
    """Print an ASCII-only per-check report. Returns True when no failing drift."""
    print("=" * 70)
    print("  Vocabulary Drift Sweep")
    print("=" * 70)

    any_failing = False
    for result in results:
        is_warn = bool(result.warn) and not result.failing and not result.known
        if result.failing:
            status = "FAIL"
            any_failing = True
        elif is_warn:
            status = "WARN"
        else:
            status = "OK"

        print(f"\n  [{status}] {result.name}")
        if result.note:
            print(f"        note: {result.note}")
        if result.failing:
            print(
                f"        FAILING ({len(result.failing)}): "
                f"{_fmt_items(result.failing)}"
            )
        if result.known:
            print(
                f"        known/deferred ({len(result.known)}): "
                f"{_fmt_items(result.known)}"
            )
        if result.warn:
            print(
                f"        candidates ({len(result.warn)}): "
                f"{_fmt_items(result.warn)}"
            )

    print(f"\n{'-' * 70}")
    failing_total = sum(len(r.failing) for r in results)
    if any_failing:
        print(f"  RESULT: FAIL  ({failing_total} failing item(s))")
    else:
        print("  RESULT: OK  (no failing drift)")
    print(f"{'-' * 70}")
    return not any_failing


# ── CLI ──────────────────────────────────────────────────────────────────────


def main() -> int:
    args = sys.argv[1:]
    if args and args[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    results = run_all_checks()
    ok = print_report(results)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
