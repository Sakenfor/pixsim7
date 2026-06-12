"""CI gate for vocabulary drift (plan blocks-vocab-roles-drift cp-d).

Imports the check functions from ``audit_vocab_drift`` and asserts there is no
*new* drift between op-packs, the registry, role mappings, and signatures.
Known/deferred drift (covered by the script's allowlists) is permitted; any new
drift fails the suite.

Suite metadata is provided by ``tests/blocks/conftest.py`` (TEST_SUITE).
"""

from __future__ import annotations

from pixsim7.backend.main.scripts.audit_vocab_drift import (
    PackVocab,
    check_deprecated_without_replacement,
    check_missing_signatures,
    check_orphaned_tags,
    check_unmapped_categories,
    check_unregistered_tags,
    check_unused_signatures,
    run_all_checks,
)


# ── The CI gate: real repo state must have zero failing drift ─────────────────


def test_no_unregistered_tags() -> None:
    result = check_unregistered_tags()
    assert result.failing == [], (
        f"Op-pack tag keys missing from the registry (and not exempt/known): "
        f"{result.failing}. Register them in prompt_block_tags or add to "
        f"KNOWN_UNREGISTERED if deliberately deferred."
    )


def test_no_unmapped_categories() -> None:
    result = check_unmapped_categories()
    assert result.failing == [], (
        f"Block categories without a category_mappings entry: {result.failing}. "
        f"Add a mapping in roles.yaml or to CATEGORY_OPT_OUTS."
    )


def test_no_unused_signatures() -> None:
    result = check_unused_signatures()
    assert result.failing == [], (
        f"Registered op signatures never referenced by any pack: {result.failing}. "
        f"Wire them up or add to KNOWN_UNUSED_SIGNATURES."
    )


def test_no_missing_signatures() -> None:
    result = check_missing_signatures()
    assert result.failing == [], (
        f"Packs reference signature ids absent from op_signature_registry.yaml: "
        f"{result.failing}."
    )


def test_no_deprecated_without_replacement() -> None:
    result = check_deprecated_without_replacement()
    assert result.failing == [], (
        f"Deprecated tag-dictionary entries with no replacement: {result.failing}. "
        f"Set a 'replacement' on each deprecated tag."
    )


def test_run_all_checks_has_no_failing_drift() -> None:
    results = run_all_checks()
    failing = {r.name: r.failing for r in results if r.failing}
    assert not failing, f"Vocabulary drift detected: {failing}"


def test_orphaned_tags_is_warn_only() -> None:
    # Warn-only check must never contribute failing drift.
    result = check_orphaned_tags()
    assert result.failing == []


# ── Negative sanity: a check actually trips on injected fake drift ────────────


def test_unmapped_categories_trips_on_injected_category() -> None:
    """An unknown category (not mapped, not opted-out) must fail the check.

    Uses injected in-memory fakes — no real files are mutated.
    """
    fake_vocab = PackVocab(categories={"definitely_not_a_real_category"})
    result = check_unmapped_categories(
        vocab=fake_vocab,
        mapped_categories={"camera", "scene"},
    )
    assert result.failing == ["definitely_not_a_real_category"]
    assert not result.ok


def test_missing_signatures_trips_on_injected_signature() -> None:
    """A pack-referenced signature absent from the registry must fail."""
    fake_vocab = PackVocab(signatures_used={"ghost.signature.v1"})
    result = check_missing_signatures(
        vocab=fake_vocab,
        registered_signatures={"camera.angle.v1"},
    )
    assert result.failing == ["ghost.signature.v1"]
    assert not result.ok


def test_unregistered_tags_trips_on_injected_tag() -> None:
    """A novel, non-exempt, non-allowlisted tag key must fail."""
    fake_vocab = PackVocab(tag_keys={"brand_new_unknown_tag"})
    result = check_unregistered_tags(
        vocab=fake_vocab,
        registry_keys={"tightness"},
    )
    assert result.failing == ["brand_new_unknown_tag"]
    assert not result.ok


def test_deprecated_without_replacement_trips_on_injected_entry() -> None:
    """A deprecated dictionary entry with no replacement must fail."""
    fake_dictionary = {
        "legacy_tag": {"status": "deprecated"},  # no replacement
        "active_tag": {"status": "active"},
    }
    result = check_deprecated_without_replacement(tag_dictionary=fake_dictionary)
    assert "legacy_tag" in result.failing
    assert "active_tag" not in result.failing
