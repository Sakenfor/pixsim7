"""
Edge-case tests for primitive_projection shadow mode.

Covers:
- Role-only phrases ("camera shot")
- Generic scene prose (should not match)
- Multi-sentence prompts with mixed roles
- Single-word probes
- False-friend phrases (homonyms)
"""
import asyncio
import pytest

from pixsim7.backend.main.services.prompt.parser.primitive_projection import (
    enrich_candidates_with_primitive_projection,
    match_candidate_to_primitive,
    _extract_candidate_evidence,
    _score_entry,
    _tokenize,
)
from pixsim7.backend.main.services.prompt.parser.dsl_adapter import (
    parse_prompt_to_candidates,
)

TEST_SUITE = {
    "id": "prompt-primitive-projection-edge-cases",
    "label": "Primitive Projection Edge Cases",
    "kind": "integration",
    "category": "backend/prompt-analysis",
    "subcategory": "primitive-projection-edge-cases",
    "covers": [
        "pixsim7/backend/main/services/prompt/parser/primitive_projection.py",
        "pixsim7/backend/main/services/prompt/parser/dsl_adapter.py",
    ],
    "order": 28,
}


# ---------------------------------------------------------------------------
# Shared synthetic index for deterministic testing
# ---------------------------------------------------------------------------

def _synthetic_index():
    """Broader synthetic index covering multiple categories."""
    return (
        {
            "block_id": "core.camera.motion.dolly",
            "package_name": "core_camera",
            "role": "camera",
            "category": "camera",
            "tokens": frozenset({"dolly", "forward", "slow", "depth", "shift", "framing"}),
            "block_tokens": frozenset({"core", "camera", "motion", "dolly"}),
            "op_id": "camera.motion.dolly",
            "signature_id": "camera.motion.v1",
            "op_modalities": ("video",),
        },
        {
            "block_id": "core.camera.motion.zoom",
            "package_name": "core_camera",
            "role": "camera",
            "category": "camera",
            "tokens": frozenset({"zoom", "slow", "zoomed", "framing"}),
            "block_tokens": frozenset({"core", "camera", "motion", "zoom"}),
            "op_id": "camera.motion.zoom",
            "signature_id": "camera.motion.v1",
            "op_modalities": ("video", "image"),
        },
        {
            "block_id": "core.camera.motion.pan",
            "package_name": "core_camera",
            "role": "camera",
            "category": "camera",
            "tokens": frozenset({"pan", "lateral", "framing", "emphasis", "pans"}),
            "block_tokens": frozenset({"core", "camera", "motion", "pan"}),
            "op_id": "camera.motion.pan",
            "signature_id": "camera.motion.v1",
            "op_modalities": ("video",),
        },
        {
            "block_id": "core.camera.motion.orbit",
            "package_name": "core_camera",
            "role": "camera",
            "category": "camera",
            "tokens": frozenset({"orbit", "circular", "orbits", "composition"}),
            "block_tokens": frozenset({"core", "camera", "motion", "orbit"}),
            "op_id": "camera.motion.orbit",
            "signature_id": "camera.motion.v1",
            "op_modalities": ("video",),
        },
        {
            "block_id": "core.camera.motion.tilt",
            "package_name": "core_camera",
            "role": "camera",
            "category": "camera",
            "tokens": frozenset({"tilt", "vertical", "framing", "tilts"}),
            "block_tokens": frozenset({"core", "camera", "motion", "tilt"}),
            "op_id": "camera.motion.tilt",
            "signature_id": "camera.motion.v1",
            "op_modalities": ("video",),
        },
        {
            "block_id": "core.camera.motion.truck",
            "package_name": "core_camera",
            "role": "camera",
            "category": "camera",
            "tokens": frozenset({"truck", "lateral", "trucks", "depth", "framing"}),
            "block_tokens": frozenset({"core", "camera", "motion", "truck"}),
            "op_id": "camera.motion.truck",
            "signature_id": "camera.motion.v1",
            "op_modalities": ("video",),
        },
        {
            "block_id": "core.light.state.soft_warm",
            "package_name": "core_light",
            "role": None,
            "category": "light",
            "tokens": frozenset({"soft", "warm", "light", "medium", "low", "contrast"}),
            "block_tokens": frozenset({"core", "light", "state", "soft", "warm"}),
            "op_id": "light.state.set",
            "signature_id": None,
            "op_modalities": ("both",),
        },
        {
            "block_id": "core.light.state.hard_cool",
            "package_name": "core_light",
            "role": None,
            "category": "light",
            "tokens": frozenset({"hard", "cool", "light", "high", "contrast"}),
            "block_tokens": frozenset({"core", "light", "state", "hard", "cool"}),
            "op_id": "light.state.set",
            "signature_id": None,
            "op_modalities": ("both",),
        },
        {
            "block_id": "core.placement.anchor.left_of",
            "package_name": "core_placement",
            "role": None,
            "category": "location",
            "tokens": frozenset({"left", "placement", "relation", "medium", "distance"}),
            "block_tokens": frozenset({"core", "placement", "anchor", "left", "of"}),
            "op_id": "scene.anchor.place",
            "signature_id": None,
            "op_modalities": ("both",),
        },
        {
            "block_id": "core.subject.pose.standing_neutral",
            "package_name": "core_subject_pose",
            "role": None,
            "category": "character_pose",
            "tokens": frozenset({"standing", "neutral", "sides", "forward", "gaze", "pose"}),
            "block_tokens": frozenset({"core", "subject", "pose", "standing", "neutral"}),
            "op_id": "subject.pose.set",
            "signature_id": None,
            "op_modalities": ("both",),
        },
    )


# ---------------------------------------------------------------------------
# EDGE CASE 1: Role-only phrases (should NOT match)
# ---------------------------------------------------------------------------

class TestRoleOnlyPhrases:
    """Phrases that contain only role/category words and stop tokens."""

    def test_camera_shot_no_match(self):
        """'Camera shot' has both words in stop tokens â€” should not match."""
        candidate = {
            "text": "Camera shot.",
            "role": "camera",
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        assert match is None

    def test_camera_scene_no_match(self):
        candidate = {
            "text": "Camera scene.",
            "role": "camera",
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        assert match is None

    def test_camera_shot_keyword_only_no_match(self):
        candidate = {
            "text": "Camera shot.",
            "role": "camera",
            "matched_keywords": ["camera"],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        assert match is None

    def test_shot_alone_no_match(self):
        candidate = {
            "text": "Shot.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        assert match is None

    def test_scene_alone_no_match(self):
        candidate = {
            "text": "Scene.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        assert match is None

    def test_motion_alone_no_match(self):
        """'motion' is a low-signal token â€” single-token should not match."""
        candidate = {
            "text": "Motion.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        assert match is None

    def test_direction_alone_no_match(self):
        """'direction' is a low-signal token."""
        candidate = {
            "text": "Direction.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        assert match is None


# ---------------------------------------------------------------------------
# EDGE CASE 2: Generic scene prose (should NOT match)
# ---------------------------------------------------------------------------

class TestGenericSceneProse:
    """Pure scene descriptions with no primitive-relevant tokens."""

    def test_sunset_description_no_match(self):
        candidate = {
            "text": "A beautiful sunset paints the sky in orange and purple.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        assert match is None

    def test_rain_description_no_match(self):
        candidate = {
            "text": "Rain falls gently on the cobblestone street.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        assert match is None

    def test_character_interaction_no_match(self):
        candidate = {
            "text": "Two friends share a laugh over coffee at the corner cafe.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        assert match is None

    def test_bookstore_no_match(self):
        candidate = {
            "text": "The old bookstore smells of leather and vanilla.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        assert match is None

    def test_spaceship_no_match(self):
        candidate = {
            "text": "The spaceship drifts silently through the asteroid field.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        assert match is None


# ---------------------------------------------------------------------------
# EDGE CASE 3: Multi-sentence prompts with mixed roles
# ---------------------------------------------------------------------------

class TestMultiSentenceMixed:
    """When a candidate contains mixed-role content, projection should
    still pick the most relevant primitive or return None if ambiguous."""

    def test_camera_motion_with_character_action(self):
        """Dolly + character walking â€” should still match dolly."""
        candidate = {
            "text": "Slow dolly forward as the man walks through the market.",
            "role": "camera",
            "matched_keywords": ["dolly"],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        assert match is not None
        assert match["block_id"] == "core.camera.motion.dolly"

    def test_camera_motion_verb_prefers_camera_over_direction_axis(self):
        candidate = {
            "text": "Slow dolly forward toward the subject.",
            "role": "camera",
            "matched_keywords": ["dolly"],
            "metadata": {},
        }
        competing_index = (
            {
                "block_id": "core.camera.motion.dolly",
                "package_name": "core_camera",
                "role": "camera",
                "category": "camera",
                "tokens": frozenset({"dolly", "forward", "camera", "slow", "subject"}),
                "block_tokens": frozenset({"core", "camera", "motion", "dolly"}),
                "op_id": "camera.motion.dolly",
                "signature_id": "camera.motion.v1",
                "op_modalities": ("video",),
            },
            {
                "block_id": "core.direction.forward",
                "package_name": "core_direction",
                "role": None,
                "category": "direction",
                "tokens": frozenset({"forward", "toward", "move", "direction"}),
                "block_tokens": frozenset({"core", "direction", "forward"}),
                "op_id": "direction.axis.forward",
                "signature_id": "direction.axis.v1",
                "op_modalities": ("both",),
            },
        )
        match = match_candidate_to_primitive(candidate, primitive_index=competing_index)
        assert match is not None
        assert match["block_id"] == "core.camera.motion.dolly"

    def test_camera_motion_beats_anchor_without_explicit_relation_phrase(self):
        candidate = {
            "text": "Pan right to keep the runner centered in frame.",
            "role": "camera",
            "matched_keywords": ["pan", "frame"],
            "metadata": {},
        }
        competing_index = (
            {
                "block_id": "core.camera.motion.pan_right",
                "package_name": "core_camera",
                "role": "camera",
                "category": "camera",
                "tokens": frozenset({"pan", "right", "camera", "motion", "frame"}),
                "block_tokens": frozenset({"core", "camera", "motion", "pan", "right"}),
                "op_id": "camera.motion.pan_right",
                "signature_id": "camera.motion.v1",
                "op_modalities": ("video",),
            },
            {
                "block_id": "core.placement.anchor.right_of",
                "package_name": "core_placement",
                "role": None,
                "category": "location",
                "tokens": frozenset({"right", "frame", "placement", "relation"}),
                "block_tokens": frozenset({"core", "placement", "anchor", "right", "of"}),
                "op_id": "scene.anchor.place",
                "signature_id": "scene.anchor.v1",
                "op_modalities": ("image", "video"),
            },
        )
        match = match_candidate_to_primitive(candidate, primitive_index=competing_index)
        assert match is not None
        assert match["block_id"] == "core.camera.motion.pan_right"

    def test_lighting_with_placement(self):
        """Soft warm light + left placement â€” should pick light if role matches."""
        candidate = {
            "text": "Soft warm light from the left side.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        # Should match something â€” either light or placement
        # The key test is it doesn't crash or return nonsense
        if match is not None:
            assert match["block_id"] in (
                "core.light.state.soft_warm",
                "core.placement.anchor.left_of",
            )

    def test_zoom_meeting_false_friend(self):
        """'zoom meeting' â€” zoom in non-camera context.
        Should ideally not match camera.motion.zoom but may due to token overlap."""
        candidate = {
            "text": "The zoom meeting starts at three o'clock.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        # This is a known weakness â€” document behavior
        # If it matches, score should be low
        if match is not None:
            assert match["score"] < 0.7, (
                f"Zoom meeting should have low confidence, got {match['score']}"
            )


class TestCrossDomainAmbiguitySuppression:
    """Cross-domain near-ties should be suppressed in shadow metadata."""

    def test_near_tied_cross_domain_candidates_are_suppressed(self):
        ambiguous_index = (
            {
                "block_id": "core.camera.intent.focus",
                "package_name": "core_camera",
                "role": "camera",
                "category": "camera",
                "tokens": frozenset({"focus", "subject", "framing"}),
                "block_tokens": frozenset({"core", "camera", "intent", "focus"}),
                "op_id": "camera.intent.focus",
                "signature_id": None,
                "op_modalities": ("both",),
            },
            {
                "block_id": "core.light.intent.focus",
                "package_name": "core_light",
                "role": None,
                "category": "light",
                "tokens": frozenset({"focus", "subject", "ambient"}),
                "block_tokens": frozenset({"core", "light", "intent", "focus"}),
                "op_id": "light.intent.focus",
                "signature_id": None,
                "op_modalities": ("both",),
            },
        )
        candidate = {
            "text": "Focus subject",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(candidate, primitive_index=ambiguous_index)
        assert match is None

    def test_near_tied_same_domain_candidates_still_resolve(self):
        same_domain_index = (
            {
                "block_id": "core.camera.intent.alpha",
                "package_name": "core_camera",
                "role": "camera",
                "category": "camera",
                "tokens": frozenset({"focus", "subject", "alpha"}),
                "block_tokens": frozenset({"core", "camera", "intent", "alpha"}),
                "op_id": "camera.intent.alpha",
                "signature_id": None,
                "op_modalities": ("both",),
            },
            {
                "block_id": "core.camera.intent.beta",
                "package_name": "core_camera",
                "role": "camera",
                "category": "camera",
                "tokens": frozenset({"focus", "subject", "beta"}),
                "block_tokens": frozenset({"core", "camera", "intent", "beta"}),
                "op_id": "camera.intent.beta",
                "signature_id": None,
                "op_modalities": ("both",),
            },
        )
        candidate = {
            "text": "Focus subject",
            "role": "camera",
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(candidate, primitive_index=same_domain_index)
        assert match is not None
        assert match["block_id"] in {
            "core.camera.intent.alpha",
            "core.camera.intent.beta",
        }


# ---------------------------------------------------------------------------
# EDGE CASE 4: False-friend words
# ---------------------------------------------------------------------------

class TestFalseFriends:
    """Words that exist in primitive tokens but are used in unrelated context."""

    def test_pan_for_gold(self):
        """'pan' as gold panning, not camera pan."""
        candidate = {
            "text": "He pans for gold in the river.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        # If matched, should have low confidence â€” gold/river add no signal
        if match is not None:
            assert match["score"] < 0.6, f"Gold panning should score low, got {match['score']}"

    def test_truck_as_vehicle(self):
        """'truck' as vehicle, not camera truck."""
        candidate = {
            "text": "A delivery truck drives slowly down the road.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        if match is not None:
            assert match["score"] < 0.6

    def test_third_person_narrative_does_not_force_camera_pov(self):
        candidate = {
            "text": "Third person narrative style.",
            "role": "character",
            "matched_keywords": ["third-person", "person"],
            "metadata": {},
        }
        index = (
            {
                "block_id": "core.camera.pov.third_person_follow",
                "package_name": "core_pov",
                "role": "camera",
                "category": "camera",
                "tokens": frozenset({"third", "person", "follow", "pov", "camera"}),
                "block_tokens": frozenset({"core", "camera", "pov", "third", "person", "follow"}),
                "op_id": "camera.pov.set",
                "signature_id": "camera.pov.v1",
                "op_modalities": ("image", "video"),
            },
        )
        match = match_candidate_to_primitive(candidate, primitive_index=index)
        assert match is None

    def test_orbit_as_astronomy(self):
        """'orbit' in planetary context."""
        candidate = {
            "text": "The orbit of the planet takes 365 days.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        if match is not None:
            assert match["score"] < 0.6

    def test_tilt_as_head_gesture(self):
        """'tilt' as character head tilt."""
        candidate = {
            "text": "She tilts her head and smiles.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        # Single token 'tilt' â€” needs specific evidence to match
        if match is not None:
            assert match["score"] < 0.6

    def test_shallow_pool(self):
        """'shallow' as pool depth, not DOF."""
        candidate = {
            "text": "The shallow end of the pool.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        # Should not match â€” no camera/focus context
        # (shallow alone is one token, needs specific evidence)


    def test_hard_left_turn(self):
        """'hard' + 'left' as driving, not hard_cool lighting + left placement."""
        candidate = {
            "text": "Hard left turn on the mountain road.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(
            candidate, primitive_index=_synthetic_index()
        )
        # Could match hard_cool or left_of â€” document behavior
        if match is not None:
            # At minimum, it shouldn't be high confidence
            assert match["score"] < 0.8


# ---------------------------------------------------------------------------
# EDGE CASE 5: Tokenizer edge cases
# ---------------------------------------------------------------------------

class TestTokenizerEdgeCases:
    """Verify tokenization handles edge inputs."""

    def test_empty_string(self):
        assert _tokenize("") == set()

    def test_none_value(self):
        assert _tokenize(None) == set()

    def test_single_char_filtered(self):
        assert _tokenize("a") == set()

    def test_underscores_normalized(self):
        tokens = _tokenize("camera_motion_dolly")
        assert "camera" in tokens
        assert "motion" in tokens
        assert "dolly" in tokens

    def test_hyphens_normalized(self):
        tokens = _tokenize("dolly-in")
        assert "dolly" in tokens
        assert "in" in tokens

    def test_dots_normalized(self):
        tokens = _tokenize("core.camera.motion")
        assert "core" in tokens
        assert "camera" in tokens
        assert "motion" in tokens

    def test_stop_tokens_filtered(self):
        tokens = _tokenize("camera shot scene", stop_tokens={"camera", "shot", "scene"})
        assert tokens == set()

    def test_mixed_case(self):
        tokens = _tokenize("Dolly Forward SLOW")
        assert "dolly" in tokens
        assert "forward" in tokens
        assert "slow" in tokens


# ---------------------------------------------------------------------------
# EDGE CASE 6: Evidence extraction
# ---------------------------------------------------------------------------

class TestEvidenceExtraction:

    def test_empty_candidate(self):
        evidence = _extract_candidate_evidence({})
        assert evidence["text_tokens"] == set()
        assert evidence["keyword_tokens"] == set()
        assert evidence["role"] is None
        assert evidence["category"] is None

    def test_role_from_metadata(self):
        evidence = _extract_candidate_evidence({
            "text": "some text",
            "metadata": {"inferred_role": "camera"},
        })
        assert evidence["role"] == "camera"

    def test_category_from_metadata(self):
        evidence = _extract_candidate_evidence({
            "text": "some text",
            "metadata": {"category": "light"},
        })
        assert evidence["category"] == "light"

    def test_keyword_tokens_extracted(self):
        evidence = _extract_candidate_evidence({
            "text": "slow dolly forward",
            "matched_keywords": ["dolly"],
        })
        assert "dolly" in evidence["keyword_tokens"]
        assert "dolly" in evidence["text_tokens"]

    def test_directional_tokens_are_preserved(self):
        evidence = _extract_candidate_evidence({
            "text": "Zoom in, then move left and forward before backing out.",
            "matched_keywords": [],
        })
        assert "in" in evidence["text_tokens"]
        assert "left" in evidence["text_tokens"]
        assert "forward" in evidence["text_tokens"]
        assert "out" in evidence["text_tokens"]


# ---------------------------------------------------------------------------
# EDGE CASE 7: Scoring edge cases
# ---------------------------------------------------------------------------

class TestScoringEdgeCases:

    def test_no_overlap_returns_none(self):
        evidence = {
            "text_tokens": {"alpha", "beta"},
            "keyword_tokens": set(),
            "role": None,
            "category": None,
        }
        entry = {
            "tokens": {"gamma", "delta"},
            "role": None,
            "category": None,
        }
        assert _score_entry(evidence=evidence, entry=entry) is None

    def test_empty_probe_returns_none(self):
        evidence = {
            "text_tokens": set(),
            "keyword_tokens": set(),
            "role": None,
            "category": None,
        }
        entry = {
            "tokens": {"dolly", "forward"},
            "role": "camera",
            "category": "camera",
        }
        assert _score_entry(evidence=evidence, entry=entry) is None

    def test_empty_entry_returns_none(self):
        evidence = {
            "text_tokens": {"dolly", "forward"},
            "keyword_tokens": set(),
            "role": None,
            "category": None,
        }
        entry = {
            "tokens": set(),
            "role": None,
            "category": None,
        }
        assert _score_entry(evidence=evidence, entry=entry) is None

    def test_role_bonus_applied(self):
        evidence = {
            "text_tokens": {"dolly", "forward"},
            "keyword_tokens": {"dolly"},
            "role": "camera",
            "category": None,
        }
        entry = {
            "tokens": {"dolly", "forward", "slow"},
            "role": "camera",
            "category": "camera",
        }
        scored = _score_entry(evidence=evidence, entry=entry)
        assert scored is not None
        # Role bonus should boost score above base lexical
        assert scored["score"] >= 0.5

    def test_category_bonus_applied(self):
        evidence = {
            "text_tokens": {"soft", "warm"},
            "keyword_tokens": set(),
            "role": None,
            "category": "light",
        }
        entry = {
            "tokens": {"soft", "warm", "light"},
            "role": None,
            "category": "light",
        }
        scored = _score_entry(evidence=evidence, entry=entry)
        assert scored is not None
        assert scored["score"] >= 0.5

    def test_single_low_signal_overlap_rejected(self):
        """Single overlap on a low-signal token should be rejected."""
        evidence = {
            "text_tokens": {"motion", "beautiful"},
            "keyword_tokens": set(),
            "role": None,
            "category": None,
        }
        entry = {
            "tokens": {"motion", "dolly", "forward"},
            "role": "camera",
            "category": "camera",
        }
        scored = _score_entry(evidence=evidence, entry=entry)
        # Single overlap on "motion" (low-signal) â€” should be rejected
        # because has_specific_evidence requires either 2+ tokens,
        # keyword match, or a non-low-signal token
        assert scored is None

    def test_negative_evidence_penalizes_wrong_variant(self):
        """When probe includes competing distinguishing token, wrong variant is penalized."""
        evidence = {
            "text_tokens": {"worm", "eye", "angle", "low"},
            "keyword_tokens": set(),
            "role": "camera",
            "category": "camera",
        }
        bird_entry = {
            "tokens": {"bird", "eye", "angle", "low"},
            "block_tokens": {"core", "camera", "angle", "bird", "eye"},
            "distinguishing_tokens": {"bird"},
            "category_distinguishing_tokens": {"bird", "worm"},
            "role": "camera",
            "category": "camera",
        }
        worm_entry = {
            "tokens": {"worm", "eye", "angle", "low"},
            "block_tokens": {"core", "camera", "angle", "worm", "eye"},
            "distinguishing_tokens": {"worm"},
            "category_distinguishing_tokens": {"bird", "worm"},
            "role": "camera",
            "category": "camera",
        }
        bird_score = _score_entry(evidence=evidence, entry=bird_entry)
        worm_score = _score_entry(evidence=evidence, entry=worm_entry)
        assert bird_score is not None and worm_score is not None
        assert bird_score["negative_penalty"] < 1.0
        assert worm_score["score"] > bird_score["score"]

    def test_variant_discrimination_prefers_matching_block_id_tokens(self):
        variant_index = (
            {
                "block_id": "core.camera.angle.bird_eye",
                "package_name": "core_angle",
                "role": "camera",
                "category": "camera",
                "tokens": frozenset({"bird", "eye", "angle", "low"}),
                "block_tokens": frozenset({"core", "camera", "angle", "bird", "eye"}),
                "distinguishing_tokens": frozenset({"bird"}),
                "category_distinguishing_tokens": frozenset({"bird", "worm"}),
                "op_id": "camera.angle.bird_eye",
                "signature_id": None,
                "op_modalities": ("image", "video"),
            },
            {
                "block_id": "core.camera.angle.worm_eye",
                "package_name": "core_angle",
                "role": "camera",
                "category": "camera",
                "tokens": frozenset({"worm", "eye", "angle", "low"}),
                "block_tokens": frozenset({"core", "camera", "angle", "worm", "eye"}),
                "distinguishing_tokens": frozenset({"worm"}),
                "category_distinguishing_tokens": frozenset({"bird", "worm"}),
                "op_id": "camera.angle.worm_eye",
                "signature_id": None,
                "op_modalities": ("image", "video"),
            },
        )
        candidate = {
            "text": "Low angle worm-eye perspective.",
            "role": "camera",
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(candidate, primitive_index=variant_index)
        assert match is not None
        assert match["block_id"] == "core.camera.angle.worm_eye"

    def test_family_variant_penalty_prefers_dutch_right_over_high_angle(self):
        variant_index = (
            {
                "block_id": "core.camera.angle.high_angle",
                "package_name": "core_angle",
                "role": "camera",
                "category": "camera",
                "tokens": frozenset({"high", "angle", "tilt", "camera", "right", "dutch"}),
                "block_tokens": frozenset({"core", "camera", "angle", "high"}),
                "distinguishing_tokens": frozenset({"high"}),
                "category_distinguishing_tokens": frozenset({"high", "dutch", "right"}),
                "op_id": "camera.angle.high_angle",
                "signature_id": "camera.angle.v1",
                "op_modalities": ("image", "video"),
                "op_family": "camera.angle",
                "family_signal_tokens": frozenset({"high"}),
                "family_distinguishing_tokens": frozenset({"high", "dutch", "right"}),
            },
            {
                "block_id": "core.camera.angle.dutch_right",
                "package_name": "core_angle",
                "role": "camera",
                "category": "camera",
                "tokens": frozenset({"high", "angle", "tilt", "camera", "right", "dutch"}),
                "block_tokens": frozenset({"core", "camera", "angle", "dutch", "right"}),
                "distinguishing_tokens": frozenset({"dutch", "right"}),
                "category_distinguishing_tokens": frozenset({"high", "dutch", "right"}),
                "op_id": "camera.angle.dutch_right",
                "signature_id": "camera.angle.v1",
                "op_modalities": ("image", "video"),
                "op_family": "camera.angle",
                "family_signal_tokens": frozenset({"dutch", "right"}),
                "family_distinguishing_tokens": frozenset({"high", "dutch", "right"}),
            },
        )
        candidate = {
            "text": "High angle dutch tilt right.",
            "role": "camera",
            "matched_keywords": ["angle", "dutch", "right"],
            "metadata": {},
        }
        match = match_candidate_to_primitive(candidate, primitive_index=variant_index)
        assert match is not None
        assert match["block_id"] == "core.camera.angle.dutch_right"

    def test_zoom_signal_prefers_camera_motion_over_subject_look(self):
        competing_index = (
            {
                "block_id": "core.camera.motion.zoom",
                "package_name": "core_camera",
                "role": "camera",
                "category": "camera",
                "tokens": frozenset({"zoom", "camera", "motion", "framing"}),
                "block_tokens": frozenset({"core", "camera", "motion", "zoom"}),
                "op_id": "camera.motion.zoom",
                "signature_id": "camera.motion.v1",
                "op_modalities": ("image", "video"),
            },
            {
                "block_id": "core.subject.look.hold_eye_contact",
                "package_name": "core_subject_look",
                "role": None,
                "category": "character_pose",
                "tokens": frozenset({"character", "eyes", "look", "focus"}),
                "block_tokens": frozenset({"core", "subject", "look", "hold", "eye", "contact"}),
                "op_id": "subject.look.apply",
                "signature_id": "subject.look.v1",
                "op_modalities": ("image", "video"),
            },
        )
        candidate = {
            "text": "Zoom slowly into the character's eyes.",
            "role": "character",
            "matched_keywords": ["zoom", "character"],
            "metadata": {},
        }
        match = match_candidate_to_primitive(candidate, primitive_index=competing_index)
        assert match is not None
        assert match["block_id"] == "core.camera.motion.zoom"


# ---------------------------------------------------------------------------
# EDGE CASE 8: Placement recall and disambiguation
# ---------------------------------------------------------------------------

class TestPlacementRecallAndDisambiguation:
    def test_in_front_of_beats_character_object_cross_domain(self):
        index = (
            {
                "block_id": "core.placement.anchor.in_front_of",
                "package_name": "core_placement",
                "role": None,
                "category": "location",
                "tokens": frozenset({"front", "in", "placed", "placement", "relation"}),
                "block_tokens": frozenset({"core", "placement", "anchor", "in", "front", "of"}),
                "op_id": "scene.anchor.place",
                "signature_id": "scene.anchor.v1",
                "op_modalities": ("image", "video"),
            },
            {
                "block_id": "core.subject.hands.hands_hold_object",
                "package_name": "core_hands",
                "role": None,
                "category": "character_pose",
                "tokens": frozenset({"hands", "hold", "object", "character"}),
                "block_tokens": frozenset({"core", "subject", "hands", "hold", "object"}),
                "op_id": "subject.hands.set",
                "signature_id": "subject.hands.v1",
                "op_modalities": ("image", "video"),
            },
        )
        candidate = {
            "text": "Object placed in front of the character.",
            "role": "character",
            "matched_keywords": ["character"],
            "metadata": {},
        }
        match = match_candidate_to_primitive(candidate, primitive_index=index)
        assert match is not None
        assert match["block_id"] == "core.placement.anchor.in_front_of"

    def test_above_with_scene_context_reaches_placement_match(self):
        index = (
            {
                "block_id": "core.placement.anchor.above",
                "package_name": "core_placement",
                "role": None,
                "category": "location",
                "tokens": frozenset({"above", "overhead", "placement", "relation"}),
                "block_tokens": frozenset({"core", "placement", "anchor", "above"}),
                "distinguishing_tokens": frozenset({"above"}),
                "category_distinguishing_tokens": frozenset({"above", "below", "behind", "front"}),
                "op_id": "scene.anchor.place",
                "signature_id": "scene.anchor.v1",
                "op_modalities": ("image", "video"),
            },
        )
        candidate = {
            "text": "Flying above the cityscape.",
            "role": "other",
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(candidate, primitive_index=index)
        assert match is not None
        assert match["block_id"] == "core.placement.anchor.above"

    def test_below_with_scene_context_reaches_placement_match(self):
        index = (
            {
                "block_id": "core.placement.anchor.below",
                "package_name": "core_placement",
                "role": None,
                "category": "location",
                "tokens": frozenset({"below", "under", "placement", "relation"}),
                "block_tokens": frozenset({"core", "placement", "anchor", "below"}),
                "distinguishing_tokens": frozenset({"below"}),
                "category_distinguishing_tokens": frozenset({"above", "below", "behind", "front"}),
                "op_id": "scene.anchor.place",
                "signature_id": "scene.anchor.v1",
                "op_modalities": ("image", "video"),
            },
        )
        candidate = {
            "text": "Water flowing below the bridge.",
            "role": "other",
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(candidate, primitive_index=index)
        assert match is not None
        assert match["block_id"] == "core.placement.anchor.below"

    def test_below_relation_beats_run_false_friend_in_scene_prose(self):
        index = (
            {
                "block_id": "core.placement.anchor.below",
                "package_name": "core_placement",
                "role": None,
                "category": "location",
                "tokens": frozenset({"below", "under", "placement", "relation", "bridge"}),
                "block_tokens": frozenset({"core", "placement", "anchor", "below"}),
                "distinguishing_tokens": frozenset({"below"}),
                "category_distinguishing_tokens": frozenset({"above", "below", "behind", "front"}),
                "op_id": "scene.anchor.place",
                "signature_id": "scene.anchor.v1",
                "op_modalities": ("image", "video"),
            },
            {
                "block_id": "core.subject.motion.run_forward",
                "package_name": "core_subject_motion",
                "role": None,
                "category": "character_pose",
                "tokens": frozenset({"run", "running", "forward", "subject", "motion"}),
                "block_tokens": frozenset({"core", "subject", "motion", "run", "forward"}),
                "op_id": "subject.move.apply",
                "signature_id": "subject.move.v1",
                "op_modalities": ("image", "video"),
            },
        )
        candidate = {
            "text": "Water runs below the bridge.",
            "role": "action",
            "matched_keywords": ["runs", "run"],
            "metadata": {},
        }
        match = match_candidate_to_primitive(candidate, primitive_index=index)
        assert match is not None
        assert match["block_id"] == "core.placement.anchor.below"

    def test_turns_around_phrase_boosts_turn_around_variant(self):
        index = (
            {
                "block_id": "core.subject.motion.turn_around",
                "package_name": "core_subject_motion",
                "role": None,
                "category": "character_pose",
                "tokens": frozenset({"turn", "around", "subject", "motion"}),
                "block_tokens": frozenset({"core", "subject", "motion", "turn", "around"}),
                "op_id": "subject.move.apply",
                "signature_id": "subject.move.v1",
                "op_modalities": ("image", "video"),
            },
            {
                "block_id": "core.direction.around",
                "package_name": "core_direction",
                "role": None,
                "category": "direction",
                "tokens": frozenset({"around", "direction", "axis"}),
                "block_tokens": frozenset({"core", "direction", "around"}),
                "op_id": "direction.axis.around",
                "signature_id": "direction.axis.v1",
                "op_modalities": ("image", "video"),
            },
        )
        candidate = {
            "text": "He turns around to face the doorway.",
            "role": "other",
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(candidate, primitive_index=index)
        assert match is not None
        assert match["block_id"] == "core.subject.motion.turn_around"


# ---------------------------------------------------------------------------
# EDGE CASE 9: Sequence continuity projection
# ---------------------------------------------------------------------------


class TestSequenceContinuityProjection:
    def test_continuation_cue_prefers_continuation_variant(self):
        index = (
            {
                "block_id": "core.sequence.continuity.continuation_subject_lock",
                "package_name": "core_sequence_continuity",
                "role": "composition",
                "category": "continuity",
                "tokens": frozenset({"continuation", "subject", "continuity", "sequence", "high"}),
                "block_tokens": frozenset({"core", "sequence", "continuity", "continuation", "subject", "lock"}),
                "op_id": "sequence.continuity.apply",
                "signature_id": "sequence.continuity.v1",
                "op_modalities": ("image", "video"),
                "role_in_sequence": "continuation",
                "continuity_focus": "subject",
                "continuity_priority": "high",
            },
            {
                "block_id": "core.sequence.continuity.transition_setting_shift",
                "package_name": "core_sequence_continuity",
                "role": "composition",
                "category": "continuity",
                "tokens": frozenset({"transition", "setting", "continuity", "sequence", "medium"}),
                "block_tokens": frozenset({"core", "sequence", "continuity", "transition", "setting", "shift"}),
                "op_id": "sequence.continuity.apply",
                "signature_id": "sequence.continuity.v1",
                "op_modalities": ("image", "video"),
                "role_in_sequence": "transition",
                "continuity_focus": "setting",
                "continuity_priority": "medium",
            },
            {
                "block_id": "core.camera.motion.pan",
                "package_name": "core_camera",
                "role": "camera",
                "category": "camera",
                "tokens": frozenset({"pan", "camera", "motion", "frame"}),
                "block_tokens": frozenset({"core", "camera", "motion", "pan"}),
                "op_id": "camera.motion.pan",
                "signature_id": "camera.motion.v1",
                "op_modalities": ("video",),
            },
        )
        candidate = {
            "text": "Continue from previous frame and keep subject continuity.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(candidate, primitive_index=index)
        assert match is not None
        assert match["block_id"] == "core.sequence.continuity.continuation_subject_lock"
        assert match["role_in_sequence"] == "continuation"

    def test_transition_cue_prefers_transition_variant(self):
        index = (
            {
                "block_id": "core.sequence.continuity.continuation_subject_lock",
                "package_name": "core_sequence_continuity",
                "role": "composition",
                "category": "continuity",
                "tokens": frozenset({"continuation", "subject", "continuity", "sequence"}),
                "block_tokens": frozenset({"core", "sequence", "continuity", "continuation", "subject", "lock"}),
                "op_id": "sequence.continuity.apply",
                "signature_id": "sequence.continuity.v1",
                "op_modalities": ("image", "video"),
                "role_in_sequence": "continuation",
            },
            {
                "block_id": "core.sequence.continuity.transition_tone_shift",
                "package_name": "core_sequence_continuity",
                "role": "composition",
                "category": "continuity",
                "tokens": frozenset({"transition", "tone", "continuity", "sequence"}),
                "block_tokens": frozenset({"core", "sequence", "continuity", "transition", "tone", "shift"}),
                "op_id": "sequence.continuity.apply",
                "signature_id": "sequence.continuity.v1",
                "op_modalities": ("image", "video"),
                "role_in_sequence": "transition",
            },
        )
        candidate = {
            "text": "Transition to a new tone while preserving scene context.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(candidate, primitive_index=index)
        assert match is not None
        assert match["block_id"] == "core.sequence.continuity.transition_tone_shift"
        assert match["role_in_sequence"] == "transition"

    def test_non_sequence_prompt_does_not_force_sequence_match(self):
        index = (
            {
                "block_id": "core.sequence.continuity.continuation_subject_lock",
                "package_name": "core_sequence_continuity",
                "role": "composition",
                "category": "continuity",
                "tokens": frozenset({"continuation", "subject", "continuity", "sequence"}),
                "block_tokens": frozenset({"core", "sequence", "continuity", "continuation", "subject", "lock"}),
                "op_id": "sequence.continuity.apply",
                "signature_id": "sequence.continuity.v1",
                "op_modalities": ("image", "video"),
                "role_in_sequence": "continuation",
            },
        )
        candidate = {
            "text": "Soft warm light over a quiet skyline.",
            "role": None,
            "matched_keywords": [],
            "metadata": {},
        }
        match = match_candidate_to_primitive(candidate, primitive_index=index)
        assert match is None


# ---------------------------------------------------------------------------
# EDGE CASE 10: Enrich idempotency
# ---------------------------------------------------------------------------

class TestEnrichIdempotency:

    def test_already_enriched_skipped(self):
        """If primitive_match already exists, enrich should not overwrite."""
        candidates = [{
            "text": "Slow dolly forward",
            "role": "camera",
            "matched_keywords": ["dolly"],
            "metadata": {
                "primitive_match": {
                    "mode": "shadow",
                    "block_id": "custom.block",
                    "score": 0.99,
                }
            },
        }]
        enriched = enrich_candidates_with_primitive_projection(
            candidates,
            mode="shadow",
            primitive_index=_synthetic_index(),
        )
        # Should keep original match, not overwrite
        assert enriched[0]["metadata"]["primitive_match"]["block_id"] == "custom.block"
        assert enriched[0]["metadata"]["primitive_match"]["score"] == 0.99

    def test_mode_off_noop(self):
        candidates = [{
            "text": "Slow dolly forward",
            "role": "camera",
            "matched_keywords": ["dolly"],
            "metadata": {},
        }]
        enriched = enrich_candidates_with_primitive_projection(
            candidates,
            mode="off",
            primitive_index=_synthetic_index(),
        )
        assert "primitive_match" not in enriched[0].get("metadata", {})

    def test_empty_candidates_noop(self):
        result = enrich_candidates_with_primitive_projection(
            [],
            mode="shadow",
            primitive_index=_synthetic_index(),
        )
        assert result == []


# ---------------------------------------------------------------------------
# EDGE CASE 10: Integration with parse_prompt_to_candidates
# ---------------------------------------------------------------------------

class TestIntegrationParsePipeline:
    """Tests that go through the full parse â†’ enrich pipeline."""

    def test_dolly_prompt_matches_via_pipeline(self):
        result = asyncio.run(
            parse_prompt_to_candidates("Slow dolly forward toward the subject.")
        )
        candidates = result.get("candidates", [])
        assert len(candidates) >= 1
        # At least one candidate should have a primitive_match
        matches = [
            c["metadata"]["primitive_match"]
            for c in candidates
            if c.get("metadata", {}).get("primitive_match")
        ]
        # Note: may or may not match depending on actual content packs loaded
        # This test validates the pipeline doesn't crash

    def test_generic_prose_pipeline(self):
        result = asyncio.run(
            parse_prompt_to_candidates("A beautiful sunset over the ocean.")
        )
        candidates = result.get("candidates", [])
        assert len(candidates) >= 1
        # Should not crash; may or may not produce matches

    def test_projection_disabled_pipeline(self):
        result = asyncio.run(
            parse_prompt_to_candidates(
                "Slow dolly forward.",
                parser_config={"primitive_projection_mode": "off"},
            )
        )
        candidates = result.get("candidates", [])
        for c in candidates:
            assert "primitive_match" not in (c.get("metadata") or {})

    def test_multi_sentence_pipeline(self):
        """Multi-sentence prompt should parse into multiple candidates."""
        result = asyncio.run(
            parse_prompt_to_candidates(
                "The hero stands tall. Camera orbits slowly. Soft warm light fills the room."
            )
        )
        candidates = result.get("candidates", [])
        assert len(candidates) >= 2  # Should split into multiple sentences
