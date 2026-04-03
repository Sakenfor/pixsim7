from pixsim7.backend.main.services.prompt.analysis import _attach_sequence_context


def test_attach_sequence_context_prefers_highest_scoring_primitive_projection():
    analysis = {
        "candidates": [
            {
                "primitive_projection": {
                    "status": "matched",
                    "selected_index": 0,
                    "hypotheses": [
                        {
                            "role_in_sequence": "continuation",
                            "score": 0.62,
                            "confidence": 0.62,
                            "block_id": "core.sequence.continuity.continuation_subject_lock",
                        }
                    ],
                },
            },
            {
                "primitive_projection": {
                    "status": "matched",
                    "selected_index": 0,
                    "hypotheses": [
                        {
                            "role_in_sequence": "transition",
                            "score": 0.91,
                            "confidence": 0.91,
                            "block_id": "core.sequence.continuity.transition_setting_shift",
                        }
                    ],
                },
            },
        ],
        "tags": [],
    }

    _attach_sequence_context(analysis)

    assert analysis["sequence_context"]["role_in_sequence"] == "transition"
    assert analysis["sequence_context"]["source"] == "analysis.candidates[].primitive_projection"
    assert analysis["sequence_context"]["matched_block_id"] == "core.sequence.continuity.transition_setting_shift"
    assert analysis["sequence_context"]["confidence"] == 0.91


def test_attach_sequence_context_falls_back_to_sequence_tag():
    analysis = {
        "candidates": [],
        "tags": ["style:etching", "sequence:continuation"],
    }

    _attach_sequence_context(analysis)

    assert analysis["sequence_context"]["role_in_sequence"] == "continuation"
    assert analysis["sequence_context"]["source"] == "analysis.tags"
    assert analysis["sequence_context"]["matched_block_id"] is None
    assert analysis["sequence_context"]["confidence"] is None


def test_attach_sequence_context_respects_existing_non_unspecified_role():
    analysis = {
        "candidates": [],
        "tags": ["sequence:transition"],
        "sequence_context": {
            "role_in_sequence": "initial",
            "source": "analysis.sequence_context",
            "confidence": 0.77,
            "matched_block_id": "custom.block",
        },
    }

    _attach_sequence_context(analysis)

    assert analysis["sequence_context"]["role_in_sequence"] == "initial"
    assert analysis["sequence_context"]["source"] == "analysis.sequence_context"
    assert analysis["sequence_context"]["matched_block_id"] == "custom.block"
    assert analysis["sequence_context"]["confidence"] == 0.77
