from pixsim7.backend.main.services.prompt.parser.llm_analyzer import (
    _derive_tags_from_candidates,
)


def test_llm_derived_tags_use_metadata_inference_for_canonical_ontology_ids():
    tags = set(
        _derive_tags_from_candidates(
            [
                {
                    "role": "camera",
                    "ontology_ids": ["mood:tender", "camera:angle_pov", "camera:framing_closeup"],
                }
            ]
        )
    )

    assert "has:camera" in tags
    assert "tone:soft" in tags
    assert "camera:pov" in tags
    assert "camera:closeup" in tags


def test_llm_derived_tags_do_not_fallback_for_legacy_ontology_ids():
    tags = set(
        _derive_tags_from_candidates(
            [
                {
                    "role": "action",
                    "ontology_ids": ["manner:gentle", "cam:closeup"],
                }
            ]
        )
    )

    assert "has:action" in tags
    assert "tone:soft" not in tags
    assert "camera:closeup" not in tags


def test_llm_derived_tags_skip_other_role_presence_tag():
    tags = set(
        _derive_tags_from_candidates(
            [
                {
                    "role": "other",
                    "ontology_ids": [],
                }
            ]
        )
    )
    assert "has:other" not in tags
