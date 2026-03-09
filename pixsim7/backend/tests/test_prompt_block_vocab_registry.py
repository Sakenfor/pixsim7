from pixsim7.backend.main.shared.ontology.vocabularies.registry import VocabularyRegistry


def test_registry_loads_prompt_block_tag_and_family_vocab_types() -> None:
    registry = VocabularyRegistry(strict_mode=False)

    tag = registry.get_prompt_block_tag("sequence_family")
    assert tag is not None
    assert "public_social_idle" in (tag.data.get("allowed_values") or [])

    family = registry.get_prompt_block_family("public_social_idle")
    assert family is not None
    axes = family.data.get("axes") or {}
    assert "environment" in axes
    assert "activity" in axes

    all_tags = registry.all_prompt_block_tags()
    all_families = registry.all_prompt_block_families()
    assert any(item.id == "theme_family" for item in all_tags)
    assert any(item.id == "ten_seconds_forward" for item in all_families)
    assert any(item.id == "walk_turn_head_progression" for item in all_families)

    beat_axis = registry.get_prompt_block_tag("beat_axis")
    assert beat_axis is not None
    assert "head_turn" in (beat_axis.data.get("allowed_values") or [])

    silhouette = registry.get_prompt_block_tag("silhouette")
    assert silhouette is not None
    assert silhouette.data.get("status") == "deprecated"

    tattoo_policy = registry.get_prompt_block_tag("tattoo_policy")
    assert tattoo_policy is not None
    assert "tattoo_anchor" in (tattoo_policy.data.get("aliases") or [])
