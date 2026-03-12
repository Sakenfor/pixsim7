import pytest

from pixsim7.backend.main.domain.prompt import PromptBlock
from pixsim7.backend.main.services.prompt.block.fit_scoring import (
    compute_block_asset_fit,
    explain_fit_score,
    _compute_context_delta,
    _compute_sequence_delta,
    OP_MATCH_BONUS,
    SIGNATURE_FAMILY_BONUS,
    OP_FAMILY_MISMATCH_PENALTY,
    MODALITY_ALIGNMENT_BONUS,
    CONTINUATION_REF_MATCH_BONUS,
    CONTINUATION_REF_MISS_PENALTY,
    CONTINUATION_RELATION_MATCH_BONUS,
    CONTINUATION_RELATION_MISS_PENALTY,
)
from pixsim7.backend.main.services.prompt.block.tagging import extract_ontology_ids_from_tags


def _make_block(ontology_ids: list[str], op: dict | None = None) -> PromptBlock:
    tags: dict = {"ontology_ids": ontology_ids}
    if op is not None:
        tags["op"] = op
    return PromptBlock(
        block_id="test_block",
        text="test block",
        tags=tags,
    )


# ---- Base ontology scoring (no context) ----


def test_compute_block_asset_fit_requires_canonical_camera_ids():
    block = _make_block(["camera:angle_pov", "mood:tender"])

    score, details = compute_block_asset_fit(
        block=block,
        asset_tags={"ontology_ids": ["mood:tender"]},
    )

    assert score == pytest.approx(0.8)
    assert details["required_misses"] == ["camera:angle_pov"]
    assert details["context"]["context_provided"] is False


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


def test_backward_compatible_no_context():
    """Existing callers that omit parser_context still get a valid score."""
    block = _make_block(["camera:angle_pov", "mood:tender"])
    score, details = compute_block_asset_fit(
        block=block,
        asset_tags={"ontology_ids": ["camera:angle_pov", "mood:tender"]},
    )

    assert score == pytest.approx(1.0)
    assert details["context"]["context_provided"] is False
    assert details["sequence"]["context_provided"] is False
    assert details["base_score"] == pytest.approx(1.0)


# ---- Parser context scoring ----


class TestContextDeltaDirectOpMatch:
    def test_exact_op_match_bonus(self):
        block = _make_block(
            ["camera:angle_pov"],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        ctx = {"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"}
        delta, details = _compute_context_delta(block, ctx)

        assert delta == pytest.approx(OP_MATCH_BONUS)
        assert details["context_provided"] is True
        assert any(c["factor"] == "op_id_match" for c in details["contributions"])

    def test_same_family_different_variant(self):
        block = _make_block(
            ["camera:angle_pov"],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        ctx = {"op_id": "camera.motion.tilt", "signature_id": "camera.motion.v1"}
        delta, details = _compute_context_delta(block, ctx)

        assert delta == pytest.approx(SIGNATURE_FAMILY_BONUS)
        assert any(c["factor"] == "op_family_match" for c in details["contributions"])

    def test_different_family_penalty(self):
        block = _make_block(
            ["camera:angle_pov"],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        ctx = {"op_id": "scene.anchor.above", "signature_id": "scene.anchor.v1"}
        delta, details = _compute_context_delta(block, ctx)

        assert delta == pytest.approx(-OP_FAMILY_MISMATCH_PENALTY)
        assert any(c["factor"] == "op_family_mismatch" for c in details["contributions"])


class TestContextDeltaSignatureOnly:
    def test_signature_match_bonus(self):
        block = _make_block(
            [],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        ctx = {"signature_id": "camera.motion.v1"}
        delta, details = _compute_context_delta(block, ctx)

        assert delta == pytest.approx(SIGNATURE_FAMILY_BONUS)
        assert any(c["factor"] == "signature_match" for c in details["contributions"])

    def test_signature_not_applied_when_op_id_present(self):
        block = _make_block(
            [],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        ctx = {"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"}
        delta, details = _compute_context_delta(block, ctx)

        factors = [c["factor"] for c in details["contributions"]]
        assert "op_id_match" in factors
        assert "signature_match" not in factors


class TestContextDeltaModality:
    def test_modality_alignment_bonus(self):
        block = _make_block(
            [],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        ctx = {"signature_id": "camera.motion.v1", "modality": "video"}
        delta, details = _compute_context_delta(block, ctx)

        assert delta == pytest.approx(SIGNATURE_FAMILY_BONUS + MODALITY_ALIGNMENT_BONUS)
        factors = [c["factor"] for c in details["contributions"]]
        assert "modality_alignment" in factors

    def test_no_modality_bonus_without_signature(self):
        block = _make_block([], op={"op_id": "camera.motion.pan"})
        ctx = {"modality": "video"}
        delta, _details = _compute_context_delta(block, ctx)

        assert delta == pytest.approx(0.0)


class TestContextDeltaNoBlockOp:
    def test_no_block_op_no_delta(self):
        block = _make_block(["mood:tender"])
        ctx = {"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"}
        delta, details = _compute_context_delta(block, ctx)

        assert delta == pytest.approx(0.0)
        assert details["context_provided"] is True
        assert details["contributions"] == []


# ---- Sequence context scoring ----


class TestSequenceDelta:
    def test_continuation_ref_match_bonus(self):
        delta, details = _compute_sequence_delta(
            sequence_context={
                "requested_refs": ["medical_equipment"],
                "available_refs": ["medical_equipment", "chair"],
            },
            role_in_sequence="continuation",
        )

        assert delta == pytest.approx(CONTINUATION_REF_MATCH_BONUS)
        assert details["context_provided"] is True
        assert any(c["factor"] == "continuation_refs" for c in details["contributions"])

    def test_continuation_ref_miss_penalty(self):
        delta, details = _compute_sequence_delta(
            sequence_context={
                "requested_refs": ["medical_equipment"],
                "available_refs": ["chair"],
            },
            role_in_sequence="continuation",
        )

        assert delta == pytest.approx(-CONTINUATION_REF_MISS_PENALTY)
        contrib = next(c for c in details["contributions"] if c["factor"] == "continuation_refs")
        assert contrib["missing_refs"] == ["medical_equipment"]

    def test_continuation_relation_match_bonus(self):
        delta, details = _compute_sequence_delta(
            sequence_context={
                "requested_relations": [
                    {"subject": "banana", "predicate": "in_pocket_of", "object": "gorilla"}
                ],
                "available_relations": [
                    {"subject": "banana", "predicate": "in_pocket_of", "object": "gorilla"}
                ],
            },
            role_in_sequence="continuation",
        )

        assert delta == pytest.approx(CONTINUATION_RELATION_MATCH_BONUS)
        assert any(c["factor"] == "continuation_relations" for c in details["contributions"])

    def test_continuation_relation_miss_penalty(self):
        delta, details = _compute_sequence_delta(
            sequence_context={
                "requested_relations": [
                    {"subject": "banana", "predicate": "in_pocket_of", "object": "gorilla"}
                ],
                "available_relations": [
                    {"subject": "banana", "predicate": "on_table", "object": "room"}
                ],
            },
            role_in_sequence="continuation",
        )

        assert delta == pytest.approx(-CONTINUATION_RELATION_MISS_PENALTY)
        contrib = next(c for c in details["contributions"] if c["factor"] == "continuation_relations")
        assert "banana|in_pocket_of|gorilla" in contrib["missing_relations"]

    def test_initial_role_is_neutral_for_continuity(self):
        delta, details = _compute_sequence_delta(
            sequence_context={
                "requested_refs": ["medical_equipment"],
                "available_refs": [],
            },
            role_in_sequence="initial",
        )

        assert delta == pytest.approx(0.0)
        assert details["contributions"] == []


# ---- Integration: full scoring with contexts ----


class TestFullScoringWithContext:
    def test_context_recovers_from_penalty(self):
        block = _make_block(
            ["camera:angle_pov", "mood:tender"],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        asset_tags = {"ontology_ids": ["mood:tender"]}

        score_no_ctx, _ = compute_block_asset_fit(block, asset_tags)
        score_with_ctx, details = compute_block_asset_fit(
            block,
            asset_tags,
            parser_context={"op_id": "camera.motion.pan"},
        )

        assert score_no_ctx == pytest.approx(0.8)
        assert score_with_ctx == pytest.approx(0.8 + OP_MATCH_BONUS)
        assert details["base_score"] == pytest.approx(0.8)
        assert details["context"]["context_delta"] == pytest.approx(OP_MATCH_BONUS)

    def test_continuation_sequence_adjusts_score(self):
        block = _make_block(["camera:angle_pov"])
        asset_tags = {"ontology_ids": ["camera:angle_pov"]}

        score_base, _ = compute_block_asset_fit(block, asset_tags)
        score_continuation, details = compute_block_asset_fit(
            block,
            asset_tags,
            role_in_sequence="continuation",
            sequence_context={
                "requested_refs": ["medical_equipment"],
                "available_refs": ["medical_equipment"],
            },
        )

        assert score_base == pytest.approx(1.0)
        assert score_continuation == pytest.approx(1.0)  # clamped from bonus
        assert details["sequence"]["context_provided"] is True

    def test_initial_sequence_stays_base(self):
        block = _make_block(["camera:angle_pov"])
        asset_tags = {"ontology_ids": ["camera:angle_pov"]}

        score_base, _ = compute_block_asset_fit(block, asset_tags)
        score_initial, details = compute_block_asset_fit(
            block,
            asset_tags,
            role_in_sequence="initial",
            sequence_context={
                "requested_refs": ["medical_equipment"],
                "available_refs": [],
            },
        )

        assert score_base == pytest.approx(score_initial)
        assert details["sequence"]["role_in_sequence"] == "initial"

    def test_unspecified_role_with_requested_refs_infers_continuation(self):
        block = _make_block(["camera:angle_pov"])
        asset_tags = {"ontology_ids": ["camera:angle_pov"]}

        score, details = compute_block_asset_fit(
            block,
            asset_tags,
            sequence_context={
                "requested_refs": ["medical_equipment"],
                "available_refs": [],
            },
        )

        assert score == pytest.approx(1.0 - CONTINUATION_REF_MISS_PENALTY)
        assert details["sequence"]["role_in_sequence"] == "continuation"

    def test_deterministic_with_same_contexts(self):
        block = _make_block(
            ["camera:angle_pov"],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        asset_tags = {"ontology_ids": ["camera:angle_pov"]}

        ctx = {"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1", "modality": "video"}
        seq = {
            "requested_refs": ["medical_equipment"],
            "available_refs": ["medical_equipment"],
        }

        s1, d1 = compute_block_asset_fit(
            block,
            asset_tags,
            parser_context=ctx,
            sequence_context=seq,
            role_in_sequence="continuation",
        )
        s2, d2 = compute_block_asset_fit(
            block,
            asset_tags,
            parser_context=ctx,
            sequence_context=seq,
            role_in_sequence="continuation",
        )

        assert s1 == s2
        assert d1["context"]["context_delta"] == d2["context"]["context_delta"]
        assert d1["sequence"]["sequence_delta"] == d2["sequence"]["sequence_delta"]


# ---- Explanation output ----


class TestExplainFitScore:
    def test_explanation_includes_context_breakdown(self):
        block = _make_block(
            ["camera:angle_pov"],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        _, details = compute_block_asset_fit(
            block,
            {"ontology_ids": ["camera:angle_pov"]},
            parser_context={"op_id": "camera.motion.pan"},
            role_in_sequence="continuation",
            sequence_context={
                "requested_refs": ["medical_equipment"],
                "available_refs": ["medical_equipment"],
            },
        )

        explanation = explain_fit_score(details)
        assert "Context" in explanation
        assert "Sequence Contributions" in explanation

    def test_explanation_omits_context_sections_when_absent(self):
        block = _make_block(["mood:tender"])
        _, details = compute_block_asset_fit(
            block,
            {"ontology_ids": ["mood:tender"]},
        )

        explanation = explain_fit_score(details)
        assert "Context Contributions" not in explanation
        assert "Sequence Contributions" not in explanation
