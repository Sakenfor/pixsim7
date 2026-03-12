import pytest

from pixsim7.backend.main.domain.prompt import PromptBlock
from pixsim7.backend.main.services.prompt.block.fit_scoring import (
    compute_block_asset_fit,
    explain_fit_score,
    _compute_context_delta,
    OP_MATCH_BONUS,
    SIGNATURE_FAMILY_BONUS,
    OP_FAMILY_MISMATCH_PENALTY,
    MODALITY_ALIGNMENT_BONUS,
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


# ──────────────────────────────────────────────
# Legacy tests (base ontology scoring, no context)
# ──────────────────────────────────────────────

def test_compute_block_asset_fit_requires_canonical_camera_ids():
    block = _make_block(["camera:angle_pov", "mood:tender"])

    score, details = compute_block_asset_fit(
        block=block,
        asset_tags={"ontology_ids": ["mood:tender"]},
    )

    assert score == pytest.approx(0.8)
    assert details["required_misses"] == ["camera:angle_pov"]
    # Context should not be provided
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
    # Perfect match: base 1.0 + soft bonus
    assert score == pytest.approx(1.0)
    assert details["context"]["context_provided"] is False
    assert details["base_score"] == pytest.approx(1.0)


# ──────────────────────────────────────────────
# Context-aware scoring: unit tests
# ──────────────────────────────────────────────

class TestContextDeltaDirectOpMatch:
    """When parser context op_id exactly matches block op_id."""

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
    """When only signature_id is provided (no op_id)."""

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
        """op_id scoring takes precedence; signature bonus is not double-applied."""
        block = _make_block(
            [],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        ctx = {"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"}
        delta, details = _compute_context_delta(block, ctx)

        # Should only get op_id_match, not signature_match
        factors = [c["factor"] for c in details["contributions"]]
        assert "op_id_match" in factors
        assert "signature_match" not in factors


class TestContextDeltaModality:
    """Modality alignment bonus."""

    def test_modality_alignment_bonus(self):
        block = _make_block(
            [],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        ctx = {"signature_id": "camera.motion.v1", "modality": "video"}
        delta, details = _compute_context_delta(block, ctx)

        # signature bonus + modality bonus
        assert delta == pytest.approx(SIGNATURE_FAMILY_BONUS + MODALITY_ALIGNMENT_BONUS)
        factors = [c["factor"] for c in details["contributions"]]
        assert "modality_alignment" in factors

    def test_no_modality_bonus_without_signature(self):
        """Modality bonus requires a valid signature to check against."""
        block = _make_block([], op={"op_id": "camera.motion.pan"})
        ctx = {"modality": "video"}
        delta, details = _compute_context_delta(block, ctx)

        assert delta == pytest.approx(0.0)


class TestContextDeltaNoBlockOp:
    """Block has no op metadata — context deltas should be zero."""

    def test_no_block_op_no_delta(self):
        block = _make_block(["mood:tender"])
        ctx = {"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"}
        delta, details = _compute_context_delta(block, ctx)

        assert delta == pytest.approx(0.0)
        assert details["context_provided"] is True
        assert details["contributions"] == []


# ──────────────────────────────────────────────
# Integration: full compute_block_asset_fit with context
# ──────────────────────────────────────────────

class TestFullScoringWithContext:
    """End-to-end scoring with parser_context parameter."""

    def test_context_boosts_base_score(self):
        block = _make_block(
            ["camera:angle_pov", "mood:tender"],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        # Base: perfect match (1.0)
        asset_tags = {"ontology_ids": ["camera:angle_pov", "mood:tender"]}

        score_no_ctx, _ = compute_block_asset_fit(block, asset_tags)
        score_with_ctx, details = compute_block_asset_fit(
            block, asset_tags,
            parser_context={"op_id": "camera.motion.pan"},
        )

        # Context should add OP_MATCH_BONUS but clamp to 1.0
        assert score_no_ctx == pytest.approx(1.0)
        assert score_with_ctx == pytest.approx(1.0)  # clamped
        assert details["context"]["context_provided"] is True

    def test_context_recovers_from_penalty(self):
        block = _make_block(
            ["camera:angle_pov", "mood:tender"],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        # Base: camera missing → 0.8
        asset_tags = {"ontology_ids": ["mood:tender"]}

        score_no_ctx, _ = compute_block_asset_fit(block, asset_tags)
        score_with_ctx, details = compute_block_asset_fit(
            block, asset_tags,
            parser_context={"op_id": "camera.motion.pan"},
        )

        assert score_no_ctx == pytest.approx(0.8)
        assert score_with_ctx == pytest.approx(0.8 + OP_MATCH_BONUS)
        assert details["base_score"] == pytest.approx(0.8)
        assert details["context"]["context_delta"] == pytest.approx(OP_MATCH_BONUS)

    def test_mismatch_penalty_reduces_score(self):
        block = _make_block(
            ["camera:angle_pov"],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        asset_tags = {"ontology_ids": ["camera:angle_pov"]}

        score_no_ctx, _ = compute_block_asset_fit(block, asset_tags)
        score_with_ctx, details = compute_block_asset_fit(
            block, asset_tags,
            parser_context={"op_id": "scene.anchor.above"},
        )

        assert score_no_ctx == pytest.approx(1.0)
        assert score_with_ctx == pytest.approx(1.0 - OP_FAMILY_MISMATCH_PENALTY)

    def test_deterministic_with_same_context(self):
        """Same inputs produce same output (determinism requirement)."""
        block = _make_block(
            ["camera:angle_pov"],
            op={"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1"},
        )
        asset_tags = {"ontology_ids": ["camera:angle_pov"]}
        ctx = {"op_id": "camera.motion.pan", "signature_id": "camera.motion.v1", "modality": "video"}

        s1, d1 = compute_block_asset_fit(block, asset_tags, parser_context=ctx)
        s2, d2 = compute_block_asset_fit(block, asset_tags, parser_context=ctx)

        assert s1 == s2
        assert d1["context"]["context_delta"] == d2["context"]["context_delta"]


# ──────────────────────────────────────────────
# Explanation output
# ──────────────────────────────────────────────

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
        )
        explanation = explain_fit_score(details)
        assert "Context" in explanation
        assert "op_id_match" in explanation

    def test_explanation_omits_context_when_absent(self):
        block = _make_block(["mood:tender"])
        _, details = compute_block_asset_fit(
            block,
            {"ontology_ids": ["mood:tender"]},
        )
        explanation = explain_fit_score(details)
        assert "Context Contributions" not in explanation
