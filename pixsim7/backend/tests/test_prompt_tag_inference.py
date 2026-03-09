import asyncio

from pixsim7.backend.main.services.prompt.tag_inference import (
    derive_sub_tags_from_ontology_ids,
)


def test_metadata_tag_inference_from_ontology_ids():
    tags = derive_sub_tags_from_ontology_ids(
        ["mood:tender", "camera:angle_pov", "camera:framing_closeup"]
    )
    assert "tone:soft" in tags
    assert "camera:pov" in tags
    assert "camera:closeup" in tags


def test_metadata_tag_inference_detects_intense_mood():
    tags = derive_sub_tags_from_ontology_ids(["mood:passionate"])
    assert "tone:intense" in tags


def test_analyze_prompt_derives_subtags_from_ontology_metadata():
    from pixsim7.backend.main.services.prompt.parser.dsl_adapter import analyze_prompt

    # Camera tags from a camera-centric prompt (no mood false-positives)
    result = asyncio.run(analyze_prompt("Point of view close up shot."))
    tags_flat = set(result.get("tags_flat") or [])

    assert "camera:pov" in tags_flat
    assert "camera:closeup" in tags_flat

    tags = {t.get("tag"): t for t in (result.get("tags") or [])}
    assert tags.get("camera:pov", {}).get("source") == "ontology"
    assert tags.get("camera:closeup", {}).get("source") == "ontology"
