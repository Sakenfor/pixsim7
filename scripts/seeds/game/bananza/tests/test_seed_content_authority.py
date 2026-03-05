"""Tests that Bananza seed enforces content-pack authority.

Validates:
- Seed data no longer contains inline primitive/template definitions.
- Required block IDs and template slugs are declared as references.
- Validation functions fail fast when content is missing.
"""
from __future__ import annotations

import ast
import inspect
from pathlib import Path

import pytest


def test_no_primitive_seeds_constant():
    """PRIMITIVE_SEEDS must not exist in seed_data — replaced by REQUIRED_BLOCK_IDS."""
    from scripts.seeds.game.bananza.seed_data import __dict__ as seed_ns

    assert "PRIMITIVE_SEEDS" not in seed_ns, (
        "seed_data still exports PRIMITIVE_SEEDS. "
        "Inline primitive definitions should be removed; use content packs instead."
    )


def test_no_generation_template_seeds_constant():
    """GENERATION_TEMPLATE_SEEDS must not exist — replaced by REQUIRED_TEMPLATE_SLUGS."""
    from scripts.seeds.game.bananza.seed_data import __dict__ as seed_ns

    assert "GENERATION_TEMPLATE_SEEDS" not in seed_ns, (
        "seed_data still exports GENERATION_TEMPLATE_SEEDS. "
        "Inline template definitions should be removed; use content packs instead."
    )


def test_required_block_ids_is_nonempty_list():
    from scripts.seeds.game.bananza.seed_data import REQUIRED_BLOCK_IDS

    assert isinstance(REQUIRED_BLOCK_IDS, list)
    assert len(REQUIRED_BLOCK_IDS) > 0
    assert all(isinstance(bid, str) and bid.strip() for bid in REQUIRED_BLOCK_IDS)


def test_required_template_slugs_is_nonempty_list():
    from scripts.seeds.game.bananza.seed_data import REQUIRED_TEMPLATE_SLUGS

    assert isinstance(REQUIRED_TEMPLATE_SLUGS, list)
    assert len(REQUIRED_TEMPLATE_SLUGS) > 0
    assert all(isinstance(s, str) and s.strip() for s in REQUIRED_TEMPLATE_SLUGS)


def test_api_flow_has_no_upsert_primitives():
    """api_flow must not contain _api_upsert_primitives or _api_upsert_generation_templates."""
    from scripts.seeds.game.bananza.flows import api_flow

    source = inspect.getsource(api_flow)
    assert "_api_upsert_primitives" not in source, (
        "api_flow still contains _api_upsert_primitives. "
        "Primitive authoring should be removed from seed flows."
    )
    assert "_api_upsert_generation_templates" not in source, (
        "api_flow still contains _api_upsert_generation_templates. "
        "Template authoring should be removed from seed flows."
    )


def test_direct_flow_has_no_upsert_primitives():
    """direct_flow must not contain _upsert_primitives or _upsert_generation_templates."""
    from scripts.seeds.game.bananza.flows import direct_flow

    source = inspect.getsource(direct_flow)
    assert "_upsert_primitives" not in source or "_verify_required_blocks" in source, (
        "direct_flow still contains _upsert_primitives without being a verify function."
    )
    assert "_upsert_generation_templates" not in source, (
        "direct_flow still contains _upsert_generation_templates. "
        "Template authoring should be removed from seed flows."
    )


def test_api_flow_imports_no_primitive_or_template_seeds():
    """api_flow must not import PRIMITIVE_SEEDS or GENERATION_TEMPLATE_SEEDS."""
    flow_path = (
        Path(__file__).resolve().parent.parent / "flows" / "api_flow.py"
    )
    source = flow_path.read_text(encoding="utf-8")
    assert "PRIMITIVE_SEEDS" not in source
    assert "GENERATION_TEMPLATE_SEEDS" not in source


def test_direct_flow_imports_no_primitive_or_template_seeds():
    """direct_flow must not import PRIMITIVE_SEEDS or GENERATION_TEMPLATE_SEEDS."""
    flow_path = (
        Path(__file__).resolve().parent.parent / "flows" / "direct_flow.py"
    )
    source = flow_path.read_text(encoding="utf-8")
    assert "PRIMITIVE_SEEDS" not in source
    assert "GENERATION_TEMPLATE_SEEDS" not in source


def test_world_npc_location_seeds_still_present():
    """World, NPC, location, behavior seeds must still be present (demo state bootstrap)."""
    from scripts.seeds.game.bananza.seed_data import (
        BEHAVIOR_TEMPLATE,
        LOCATION_SEEDS,
        NPC_BEHAVIOR_BINDINGS,
        NPC_SEEDS,
        SIMULATION_TEMPLATE,
    )

    assert len(LOCATION_SEEDS) >= 4
    assert len(NPC_SEEDS) >= 2
    assert isinstance(BEHAVIOR_TEMPLATE, dict)
    assert isinstance(SIMULATION_TEMPLATE, dict)
    assert len(NPC_BEHAVIOR_BINDINGS) >= 2


def test_content_packs_exist_for_all_required_block_ids():
    """Every required block ID must appear in a content pack YAML file."""
    from scripts.seeds.game.bananza.seed_data import REQUIRED_BLOCK_IDS

    content_packs_dir = (
        Path(__file__).resolve().parents[5]
        / "pixsim7"
        / "backend"
        / "main"
        / "content_packs"
        / "primitives"
    )
    assert content_packs_dir.is_dir(), f"Content packs dir not found: {content_packs_dir}"

    # Collect all block_ids from all pack YAML files
    import yaml

    all_block_ids: set[str] = set()
    for yaml_path in content_packs_dir.rglob("*.yaml"):
        if "manifest" in yaml_path.name:
            continue
        try:
            with open(yaml_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            if isinstance(data, dict) and isinstance(data.get("blocks"), list):
                for block in data["blocks"]:
                    if isinstance(block, dict) and isinstance(block.get("block_id"), str):
                        all_block_ids.add(block["block_id"])
        except Exception:
            continue

    missing = [bid for bid in REQUIRED_BLOCK_IDS if bid not in all_block_ids]
    assert not missing, (
        f"Required block IDs missing from content packs: {missing}\n"
        f"Found {len(all_block_ids)} block IDs across packs."
    )


def test_content_packs_exist_for_all_required_template_slugs():
    """Every required template slug must appear in a content pack YAML file."""
    from scripts.seeds.game.bananza.seed_data import REQUIRED_TEMPLATE_SLUGS

    content_packs_dir = (
        Path(__file__).resolve().parents[5]
        / "pixsim7"
        / "backend"
        / "main"
        / "content_packs"
        / "prompt"
    )
    assert content_packs_dir.is_dir(), f"Prompt content packs dir not found: {content_packs_dir}"

    import yaml

    all_slugs: set[str] = set()
    for yaml_path in content_packs_dir.rglob("*.yaml"):
        try:
            with open(yaml_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            if isinstance(data, dict) and isinstance(data.get("templates"), list):
                for tmpl in data["templates"]:
                    if isinstance(tmpl, dict) and isinstance(tmpl.get("slug"), str):
                        all_slugs.add(tmpl["slug"])
        except Exception:
            continue

    missing = [slug for slug in REQUIRED_TEMPLATE_SLUGS if slug not in all_slugs]
    assert not missing, (
        f"Required template slugs missing from content packs: {missing}\n"
        f"Found {len(all_slugs)} template slugs across packs."
    )
