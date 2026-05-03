"""Tests for `services.prompt.block.vocab_bridge`.

Uses a synthetic primitives root so behavior doesn't depend on real
content packs evolving. Runs against a fresh `VocabularyRegistry`
constructed with a tmp vocab dir so we can prove (a) what the bridge
emits and (b) that hand-authored vocabs still take precedence.
"""
from __future__ import annotations

import textwrap
from pathlib import Path

import pytest

from pixsim7.backend.main.services.prompt.block.vocab_bridge import (
    BRIDGE_PACK_ID,
    BRIDGE_VOCAB_TYPE,
    bridge_primitive_concepts_into,
    build_implicit_vocab_pack,
)
from pixsim7.backend.main.shared.ontology.vocabularies.registry import (
    VocabularyRegistry,
)


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(content), encoding="utf-8")


@pytest.fixture
def synthetic_primitives_root(tmp_path: Path) -> Path:
    root = tmp_path / "primitives"

    # Color primitives — bridge target.
    _write(
        root / "scene_foundation" / "blocks" / "color.yaml",
        """
        package_name: scene_foundation
        blocks:
          - block_id: color.amber
            category: color
            text: warm amber tones, golden palette
            tags: { hue: amber, warmth: warm }
          - block_id: color.tungsten
            category: color
            text: tungsten incandescent warmth
            tags: { hue: tungsten, warmth: very_warm, color_temp_k: "3200" }
        """,
    )

    # Aesthetic preset — multi-token block_id, exercises split logic.
    _write(
        root / "style_foundation" / "blocks" / "aesthetic.yaml",
        """
        package_name: style_foundation
        blocks:
          - block_id: style.aesthetic.gothic_noir
            category: aesthetic_preset
            text: gothic noir aesthetic
            tags: { mode: global }
        """,
    )

    # Mood primitive — should be SKIPPED (rich-metadata exclusion).
    _write(
        root / "mood_pack" / "blocks" / "mood.yaml",
        """
        package_name: mood_pack
        blocks:
          - block_id: mood.tender
            category: mood
            text: tender gentle softness
            tags: { intensity: low }
        """,
    )

    # Primitive with an explicit `keywords` author override.
    _write(
        root / "scene_foundation" / "blocks" / "light.yaml",
        """
        package_name: scene_foundation
        blocks:
          - block_id: light.studio_strobe
            category: light
            text: high-output studio flash
            tags: { hue: white }
            keywords:
              - strobe
              - flashbulb
        """,
    )

    return root


def _vocab_dir_minimal(tmp_path: Path) -> Path:
    """Minimal but valid vocab dir for an isolated VocabularyRegistry."""
    vocab_dir = tmp_path / "vocab"
    vocab_dir.mkdir(parents=True, exist_ok=True)
    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir(parents=True, exist_ok=True)
    return vocab_dir


# ── build_implicit_vocab_pack ──────────────────────────────────────────────


def test_bridge_pack_excludes_rich_metadata_categories(
    synthetic_primitives_root: Path,
) -> None:
    pack = build_implicit_vocab_pack(primitives_root=synthetic_primitives_root)
    items = pack.get(BRIDGE_VOCAB_TYPE, {})
    assert "color:amber" in items
    assert "color:tungsten" in items
    assert "aesthetic_preset:gothic_noir" in items
    # mood is on the deny list — must not be bridged.
    assert "mood:tender" not in items


def test_bridge_pack_keywords_drop_qualifier_tag_keys(
    synthetic_primitives_root: Path,
) -> None:
    """`warmth: warm` and `warmth: very_warm` must not contribute "warm"
    or "very_warm" as keywords (warmth is on _TAG_KEY_DENY)."""
    pack = build_implicit_vocab_pack(primitives_root=synthetic_primitives_root)
    items = pack[BRIDGE_VOCAB_TYPE]
    amber_kw = items["color:amber"]["keywords"]
    assert "amber" in amber_kw
    assert "warm" not in amber_kw
    tungsten_kw = items["color:tungsten"]["keywords"]
    assert "tungsten" in tungsten_kw
    # color_temp_k is on deny list AND value is numeric → both filters drop it.
    assert "3200" not in tungsten_kw
    assert all(not kw.replace(".", "").isdigit() for kw in tungsten_kw)


def test_bridge_pack_value_stoplist_drops_global(
    synthetic_primitives_root: Path,
) -> None:
    """`mode: global` value must not become a keyword."""
    pack = build_implicit_vocab_pack(primitives_root=synthetic_primitives_root)
    items = pack[BRIDGE_VOCAB_TYPE]
    kw = items["aesthetic_preset:gothic_noir"]["keywords"]
    assert "global" not in kw
    assert "gothic" in kw
    assert "noir" in kw


def test_bridge_pack_block_id_split(
    synthetic_primitives_root: Path,
) -> None:
    """`gothic_noir` should expand to ['gothic_noir', 'gothic noir', 'gothic', 'noir']."""
    pack = build_implicit_vocab_pack(primitives_root=synthetic_primitives_root)
    items = pack[BRIDGE_VOCAB_TYPE]
    kw = items["aesthetic_preset:gothic_noir"]["keywords"]
    for expected in ("gothic_noir", "gothic noir", "gothic", "noir"):
        assert expected in kw, f"expected {expected!r} in {kw!r}"


def test_bridge_pack_explicit_author_keywords(
    synthetic_primitives_root: Path,
) -> None:
    """An explicit top-level `keywords:` field on the primitive must contribute."""
    pack = build_implicit_vocab_pack(primitives_root=synthetic_primitives_root)
    items = pack[BRIDGE_VOCAB_TYPE]
    kw = items["light:studio_strobe"]["keywords"]
    assert "strobe" in kw
    assert "flashbulb" in kw


def test_bridge_pack_empty_for_missing_root(tmp_path: Path) -> None:
    pack = build_implicit_vocab_pack(primitives_root=tmp_path / "missing")
    assert pack == {}


# ── bridge_primitive_concepts_into ─────────────────────────────────────────


def test_bridge_registers_into_live_registry(
    synthetic_primitives_root: Path,
    tmp_path: Path,
) -> None:
    """Smoke test: bridging into a real registry exposes IDs via match_keywords()."""
    registry = VocabularyRegistry(
        vocab_dir=_vocab_dir_minimal(tmp_path),
        plugins_dir=tmp_path / "plugins",
        strict_mode=False,
    )
    registry._ensure_loaded()

    # Override the boot-time bridge with our synthetic-root-based pack.
    registry.unregister_pack(BRIDGE_PACK_ID)
    count = bridge_primitive_concepts_into(
        registry, primitives_root=synthetic_primitives_root
    )
    assert count >= 3  # color:amber, color:tungsten, aesthetic_preset:gothic_noir, light:studio_strobe

    matches = registry.match_keywords("amber tones in scene")
    assert "color:amber" in matches
    matches2 = registry.match_keywords("gothic noir feel")
    assert "aesthetic_preset:gothic_noir" in matches2


def test_bridge_is_idempotent(
    synthetic_primitives_root: Path,
    tmp_path: Path,
) -> None:
    """Re-running the bridge replaces the prior pack rather than duplicating."""
    registry = VocabularyRegistry(
        vocab_dir=_vocab_dir_minimal(tmp_path),
        plugins_dir=tmp_path / "plugins",
        strict_mode=False,
    )
    registry._ensure_loaded()
    registry.unregister_pack(BRIDGE_PACK_ID)

    first = bridge_primitive_concepts_into(
        registry, primitives_root=synthetic_primitives_root
    )
    second = bridge_primitive_concepts_into(
        registry, primitives_root=synthetic_primitives_root
    )
    assert first == second
    assert (
        len(registry.all_of(BRIDGE_VOCAB_TYPE)) == first
    ), "running twice should not double-count"
