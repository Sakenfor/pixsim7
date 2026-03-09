from pathlib import Path

import pytest
import yaml


PROMPT_ROLE_PACKS = [
    "prompt_roles_actions",
    "prompt_roles_camera",
    "prompt_roles_characters",
    "prompt_roles_moods",
    "prompt_roles_romance",
    "prompt_roles_settings",
]


def test_prompt_role_packs_have_manifest_and_single_owned_role():
    for pack_name in PROMPT_ROLE_PACKS:
        vocab_dir = Path("pixsim7/backend/main/plugins") / pack_name / "vocabularies"
        manifest_path = vocab_dir / "manifest.yaml"
        prompt_roles_path = vocab_dir / "prompt_roles.yaml"

        assert manifest_path.exists(), f"Missing manifest: {manifest_path}"
        assert prompt_roles_path.exists(), f"Missing prompt_roles: {prompt_roles_path}"

        manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
        pack_meta = manifest.get("pack", {})
        owns_roles = pack_meta.get("owns_roles", [])
        assert isinstance(owns_roles, list) and len(owns_roles) == 1

        prompt_roles_data = yaml.safe_load(prompt_roles_path.read_text(encoding="utf-8")) or {}
        roles = prompt_roles_data.get("roles", {})
        assert isinstance(roles, dict) and len(roles) == 1

        only_role = next(iter(roles.keys()))
        assert only_role == owns_roles[0]


def test_registry_rejects_duplicate_prompt_role_authority(tmp_path):
    from pixsim7.backend.main.shared.ontology.vocabularies.registry import VocabularyRegistry

    vocab_dir = tmp_path / "vocabs"
    vocab_dir.mkdir()

    # Minimal core vocab files
    (vocab_dir / "slots.yaml").write_text("slots: {}\n", encoding="utf-8")
    (vocab_dir / "prompt_roles.yaml").write_text("roles: {}\n", encoding="utf-8")
    (vocab_dir / "roles.yaml").write_text("roles: {}\n", encoding="utf-8")
    (vocab_dir / "poses.yaml").write_text("poses: {}\n", encoding="utf-8")
    (vocab_dir / "moods.yaml").write_text("moods: {}\n", encoding="utf-8")
    (vocab_dir / "ratings.yaml").write_text("ratings: {}\n", encoding="utf-8")
    (vocab_dir / "locations.yaml").write_text("locations: {}\n", encoding="utf-8")
    (vocab_dir / "anatomy.yaml").write_text("parts: {}\n", encoding="utf-8")
    (vocab_dir / "influence_regions.yaml").write_text("regions: {}\n", encoding="utf-8")
    (vocab_dir / "spatial.yaml").write_text("spatial: {}\n", encoding="utf-8")
    (vocab_dir / "progression.yaml").write_text("progression: {}\n", encoding="utf-8")

    plugins_dir = tmp_path / "plugins"
    plugins_dir.mkdir()

    for plugin_name in ("pack_a", "pack_b"):
        plugin_vocab = plugins_dir / plugin_name / "vocabularies"
        plugin_vocab.mkdir(parents=True)
        (plugin_vocab / "manifest.yaml").write_text(
            "pack:\n  id: test\n  owns_roles: [action]\n",
            encoding="utf-8",
        )
        (plugin_vocab / "prompt_roles.yaml").write_text(
            (
                "roles:\n"
                "  action:\n"
                "    label: Action\n"
                "    keywords: [swing]\n"
            ),
            encoding="utf-8",
        )

    registry = VocabularyRegistry(
        vocab_dir=vocab_dir,
        plugins_dir=plugins_dir,
        strict_mode=False,
    )

    with pytest.raises(ValueError, match="Duplicate prompt role authority"):
        registry.all_prompt_roles()
