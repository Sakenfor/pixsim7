import pytest

from pixsim7.backend.main.domain.prompt import PromptBlock
from pixsim7.backend.main.services.prompt.block.fit_scoring import compute_block_asset_fit
from pixsim7.backend.main.services.prompt.block.tagging import extract_ontology_ids_from_tags


def _make_block(ontology_ids: list[str]) -> PromptBlock:
    return PromptBlock(
        block_id="test_block",
        text="test block",
        tags={"ontology_ids": ontology_ids},
    )


def test_compute_block_asset_fit_requires_canonical_camera_ids():
    block = _make_block(["camera:angle_pov", "mood:tender"])

    score, details = compute_block_asset_fit(
        block=block,
        asset_tags={"ontology_ids": ["mood:tender"]},
    )

    assert score == pytest.approx(0.8)
    assert details["required_misses"] == ["camera:angle_pov"]


def test_compute_block_asset_fit_does_not_treat_legacy_cam_rel_as_required():
    block = _make_block(["cam:closeup", "rel:at_crotch", "mood:tender"])

    score, details = compute_block_asset_fit(
        block=block,
        asset_tags={"ontology_ids": ["cam:closeup", "rel:at_crotch", "mood:tender"]},
    )

    assert score == pytest.approx(1.0)
    assert details["required_matches"] == []
    assert set(details["soft_matches"]) == {"mood:tender"}


def test_extract_ontology_ids_from_tags_excludes_legacy_camera_relation_prefixes():
    ids = extract_ontology_ids_from_tags(
        {
            "camera": "cam:closeup",
            "position": "rel:at_crotch",
            "mood": "mood:tender",
            "angle": "camera:angle_pov",
        }
    )

    assert "cam:closeup" not in ids
    assert "rel:at_crotch" not in ids
    assert "mood:tender" in ids
    assert "camera:angle_pov" in ids
