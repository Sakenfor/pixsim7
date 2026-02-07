import asyncio


def test_prompt_role_registry_uses_vocab_role_keywords():
    from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry

    registry = PromptRoleRegistry.default()
    keywords = registry.get_role_keywords()

    assert "camera" in keywords
    assert "point of view" in keywords["camera"]
    assert "close up" in keywords["camera"]


def test_simple_parser_resolves_spatial_ids_from_normalized_keywords():
    from pixsim7.backend.main.services.prompt.parser.simple import SimplePromptParser

    parser = SimplePromptParser()
    result = asyncio.run(parser.parse("Point of view close up shot."))

    assert len(result.segments) == 1
    metadata = result.segments[0].metadata
    ontology_ids = set(metadata.get("ontology_ids") or [])
    assert "spatial:cam_pov" in ontology_ids
    assert "spatial:frame_closeup" in ontology_ids


def test_ontology_sync_uses_pose_detector_labels_for_action_keywords():
    from pixsim7.backend.main.services.prompt.parser.ontology import (
        reset_to_baseline,
        sync_from_vocabularies,
        ROLE_KEYWORDS,
    )

    reset_to_baseline()
    sync_from_vocabularies(force=True)

    action_keywords = set(ROLE_KEYWORDS.get("action", []))
    assert "side_by_side" in action_keywords
