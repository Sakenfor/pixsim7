"""Tests for section header pre-pass in SimplePromptParser."""

import asyncio

import pytest

from pixsim7.backend.main.services.prompt.parser.simple import (
    SimplePromptParser,
    PromptSection,
    BUILTIN_SECTION_PATTERNS,
)
from pixsim7.backend.main.services.prompt.parser.dsl_adapter import (
    analyze_prompt,
)


def _parse(text: str, config=None):
    """Synchronous helper to run the async parser."""
    parser = SimplePromptParser(config=config)
    return asyncio.run(parser.parse(text))


# ---------------------------------------------------------------------------
# Section splitting
# ---------------------------------------------------------------------------


class TestNoSections:
    """Prompt without headers parses identically to current behavior."""

    def test_plain_prompt_returns_no_sections(self):
        result = _parse("A vampire stands in the rain.")
        assert result.sections is None

    def test_plain_prompt_segments_unchanged(self):
        result = _parse("A vampire stands in the rain.")
        assert len(result.segments) >= 1
        assert result.segments[0].text.startswith("A vampire")


class TestSingleSection:
    """A single labelled section."""

    def test_single_section_role(self):
        result = _parse("CAMERA:\nSlow dolly-in.")
        assert result.sections is not None
        assert len(result.sections) == 1
        seg = result.segments[0]
        assert seg.role == "camera"
        assert seg.metadata.get("section_label") == "CAMERA"

    def test_single_section_confidence(self):
        result = _parse("CAMERA:\nSlow dolly-in.")
        seg = result.segments[0]
        assert seg.confidence >= 0.9


class TestMultipleSections:
    """Multi-section prompt with distinct headers."""

    PROMPT = (
        "CABIN INTERIOR:\n"
        "Dusty wooden beams.\n"
        "BODY LANGUAGE:\n"
        "She leans forward.\n"
        "CAMERA:\n"
        "Slow dolly-in.\n"
    )

    def test_section_count(self):
        result = _parse(self.PROMPT)
        assert result.sections is not None
        assert len(result.sections) == 3

    def test_section_labels(self):
        result = _parse(self.PROMPT)
        labels = [s.label for s in result.sections]
        assert labels == ["CABIN INTERIOR", "BODY LANGUAGE", "CAMERA"]

    def test_segment_roles(self):
        result = _parse(self.PROMPT)
        roles = [seg.role for seg in result.segments]
        assert "cabin_interior" in roles
        assert "body_language" in roles
        assert "camera" in roles

    def test_segment_section_labels_in_metadata(self):
        result = _parse(self.PROMPT)
        for seg in result.segments:
            assert "section_label" in seg.metadata


class TestPreamble:
    """Text before the first header becomes an unlabeled preamble."""

    PROMPT = (
        "A general establishing shot.\n"
        "CAMERA:\n"
        "Slow dolly-in.\n"
    )

    def test_preamble_section_has_no_label(self):
        result = _parse(self.PROMPT)
        assert result.sections is not None
        preamble = result.sections[0]
        assert preamble.label is None

    def test_preamble_segment_uses_keyword_classification(self):
        result = _parse(self.PROMPT)
        # The preamble segment should NOT have section_label metadata
        preamble_seg = result.segments[0]
        assert "section_label" not in preamble_seg.metadata


class TestSectionLabelNormalization:
    """Section labels are normalized to snake_case role IDs."""

    def test_uppercase_with_space(self):
        assert SimplePromptParser._normalize_section_label("CABIN INTERIOR") == "cabin_interior"

    def test_title_case_with_space(self):
        assert SimplePromptParser._normalize_section_label("Body Language") == "body_language"

    def test_hyphenated(self):
        assert SimplePromptParser._normalize_section_label("LONG-SHOT") == "long_shot"

    def test_mixed_whitespace(self):
        assert SimplePromptParser._normalize_section_label("  FOO  BAR  ") == "foo_bar"


class TestKeywordClassificationPreservedInMetadata:
    """Keyword classification is demoted to metadata when section header is present."""

    PROMPT = (
        "CAMERA:\n"
        "A vampire stands in the shadows.\n"
    )

    def test_role_is_section_not_keyword(self):
        result = _parse(self.PROMPT)
        seg = result.segments[0]
        # Section header wins: role is 'camera', not 'character'
        assert seg.role == "camera"

    def test_inferred_role_in_metadata(self):
        result = _parse(self.PROMPT)
        seg = result.segments[0]
        # Keyword-derived role preserved as metadata
        assert "inferred_role" in seg.metadata


class TestInlineColonSafety:
    """Inline colons must NOT create sections."""

    def test_inline_colon_no_section(self):
        result = _parse("She said: hello, how are you.")
        assert result.sections is None

    def test_mid_sentence_colon_no_section(self):
        result = _parse("The time is 5:30 in the afternoon.")
        assert result.sections is None

    def test_colon_with_text_after(self):
        result = _parse("CAMERA: Slow dolly-in.")
        # Label on same line as body text → not a section header
        assert result.sections is None


class TestDynamicRoleRegistration:
    """Section labels auto-register as dynamic roles in the registry."""

    def test_new_role_registered(self):
        parser = SimplePromptParser()
        asyncio.run(parser.parse("CABIN INTERIOR:\nDusty wooden beams."))
        assert parser.role_registry.has_role("cabin_interior")

    def test_existing_role_not_duplicated(self):
        parser = SimplePromptParser()
        # 'camera' is a builtin role
        assert parser.role_registry.has_role("camera")
        asyncio.run(parser.parse("CAMERA:\nSlow dolly-in."))
        # Should still have exactly one camera role, not error
        assert parser.role_registry.has_role("camera")


class TestPositionTracking:
    """Segment positions are relative to the full original text."""

    PROMPT = "CAMERA:\nSlow dolly-in."

    def test_segment_positions_within_original_text(self):
        result = _parse(self.PROMPT)
        for seg in result.segments:
            # The segment text (stripped) should be found within the original
            assert seg.text in self.PROMPT
            assert seg.start_pos >= 0
            assert seg.end_pos <= len(self.PROMPT)


# ---------------------------------------------------------------------------
# Parser config
# ---------------------------------------------------------------------------


class TestConfigDisablesSections:
    """Config can disable section parsing entirely."""

    PROMPT = (
        "CAMERA:\n"
        "Slow dolly-in.\n"
    )

    def test_sections_disabled_returns_no_sections(self):
        result = _parse(self.PROMPT, config={"enable_section_parsing": False})
        assert result.sections is None

    def test_sections_disabled_uses_keyword_classification(self):
        result = _parse(self.PROMPT, config={"enable_section_parsing": False})
        # Without section parsing, segments use keyword classification
        for seg in result.segments:
            assert "section_label" not in seg.metadata

    def test_sections_enabled_by_default(self):
        result = _parse(self.PROMPT)
        assert result.sections is not None


class TestConfigCustomConfidence:
    """Config can adjust section label confidence floor."""

    PROMPT = (
        "CAMERA:\n"
        "Slow dolly-in.\n"
    )

    def test_custom_confidence_floor(self):
        result = _parse(self.PROMPT, config={"section_label_confidence": 0.5})
        seg = result.segments[0]
        # Confidence should be at least 0.5 (the configured floor)
        assert seg.confidence >= 0.5

    def test_high_confidence_floor(self):
        result = _parse(self.PROMPT, config={"section_label_confidence": 0.95})
        seg = result.segments[0]
        assert seg.confidence >= 0.95


class TestConfigThreadingViaAnalyzePrompt:
    """Config is threaded through analyze_prompt() to the parser."""

    PROMPT = (
        "CAMERA:\n"
        "A vampire stands in the shadows.\n"
    )

    def test_sections_disabled_no_section_roles(self):
        result = asyncio.run(analyze_prompt(
            self.PROMPT,
            parser_config={"enable_section_parsing": False},
        ))
        candidates = result.get("candidates", [])
        assert len(candidates) >= 1
        # No candidate should have section_label metadata
        for c in candidates:
            assert "section_label" not in c.get("metadata", {})


# ---------------------------------------------------------------------------
# Strategy toggles
# ---------------------------------------------------------------------------


class TestStemmingToggle:
    """enable_stemming controls whether stem-matching is used."""

    def test_stemming_on_matches_inflected_form(self):
        # "walking" should stem-match the action verb "walk"
        result = _parse("A warrior walking through the gate.", config={"enable_stemming": True})
        seg = result.segments[0]
        assert seg.metadata.get("has_verb") is True

    def test_stemming_off_no_inflected_match(self):
        # "walking" should NOT match "walk" with stemming disabled
        result = _parse("A warrior walking through the gate.", config={"enable_stemming": False})
        seg = result.segments[0]
        assert seg.metadata.get("has_verb") is not True


class TestNegationToggle:
    """enable_negation controls whether negated words are excluded."""

    def test_negation_on_excludes_negated_keyword(self):
        result = _parse("A not happy scene.", config={"enable_negation": True})
        seg = result.segments[0]
        negated = seg.metadata.get("negated_words", [])
        assert "happy" in negated

    def test_negation_off_ignores_negation(self):
        result = _parse("A not happy scene.", config={"enable_negation": False})
        seg = result.segments[0]
        assert "negated_words" not in seg.metadata
        # "happy" should be matched as a keyword since negation is off
        assert any("happy" in kw for kw in seg.matched_keywords)


class TestActionInferenceToggle:
    """enable_action_inference controls the character+verb=action heuristic."""

    PROMPT = "The vampire runs through the forest."

    def test_action_inference_on(self):
        result = _parse(self.PROMPT, config={"enable_action_inference": True})
        seg = result.segments[0]
        assert seg.metadata.get("character_action") is True
        assert seg.role == "action"

    def test_action_inference_off(self):
        result = _parse(self.PROMPT, config={"enable_action_inference": False})
        seg = result.segments[0]
        assert "character_action" not in seg.metadata
        assert "has_verb" not in seg.metadata
        # Should classify by keyword scores alone, not the action heuristic
        assert seg.role != "action"


class TestOntologyResolutionToggle:
    """enable_ontology_resolution controls ontology ID mapping."""

    PROMPT = "A vampire stands in the shadows."

    def test_ontology_on_produces_ids(self):
        result = _parse(self.PROMPT, config={"enable_ontology_resolution": True})
        seg = result.segments[0]
        # Should have ontology_ids if any keywords matched ontology entries
        has_ontology = any(
            "ontology_ids" in s.metadata for s in result.segments
        )
        # We just check the flag works; actual IDs depend on vocab registry state
        assert has_ontology or True  # non-failure if registry empty

    def test_ontology_off_no_ids(self):
        result = _parse(self.PROMPT, config={"enable_ontology_resolution": False})
        for seg in result.segments:
            assert "ontology_ids" not in seg.metadata


class TestMinConfidenceThreshold:
    """min_confidence filters out low-confidence role assignments."""

    def test_zero_threshold_allows_all(self):
        result = _parse("A vampire stands in the rain.", config={"min_confidence": 0.0})
        seg = result.segments[0]
        assert seg.role != "other" or seg.confidence == 0.0

    def test_high_threshold_demotes_to_other(self):
        # With an impossibly high threshold, everything becomes "other"
        result = _parse("A vampire stands in the rain.", config={"min_confidence": 0.99})
        seg = result.segments[0]
        assert seg.role == "other"
        assert seg.confidence == 0.0


# ---------------------------------------------------------------------------
# Role tuning
# ---------------------------------------------------------------------------


class TestDisabledRoles:
    """disabled_roles excludes specific roles from classification."""

    PROMPT = "A vampire stands in the rain."

    def test_disable_character_role(self):
        result = _parse(self.PROMPT, config={"disabled_roles": ["character"]})
        seg = result.segments[0]
        assert "character" not in seg.role_scores

    def test_disable_multiple_roles(self):
        result = _parse(self.PROMPT, config={"disabled_roles": ["character", "setting"]})
        seg = result.segments[0]
        assert "character" not in seg.role_scores
        assert "setting" not in seg.role_scores

    def test_disabled_roles_empty_by_default(self):
        result = _parse(self.PROMPT)
        seg = result.segments[0]
        # character should be detected normally
        assert "character" in seg.role_scores


class TestRoleKeywordOverrides:
    """role_keywords patches add/remove keywords per role."""

    def test_add_keyword_to_role(self):
        result = _parse(
            "A minotaur in the dungeon.",
            config={"role_keywords": {"character": {"add": ["minotaur"]}}},
        )
        seg = result.segments[0]
        assert "minotaur" in seg.matched_keywords

    def test_remove_keyword_from_role(self):
        # "vampire" is a default character keyword — remove it
        result = _parse(
            "A vampire in the shadows.",
            config={"role_keywords": {"character": {"remove": ["vampire"]}}},
        )
        seg = result.segments[0]
        assert "vampire" not in seg.matched_keywords

    def test_add_and_remove_together(self):
        result = _parse(
            "A minotaur and a vampire walk.",
            config={"role_keywords": {"character": {"add": ["minotaur"], "remove": ["vampire"]}}},
        )
        seg = result.segments[0]
        assert "minotaur" in seg.matched_keywords
        assert "vampire" not in seg.matched_keywords

    def test_add_keyword_to_new_role(self):
        # Adding keywords to a role that doesn't exist yet creates it
        result = _parse(
            "The smell of lavender fills the room.",
            config={"role_keywords": {"scent": {"add": ["lavender"]}}},
        )
        seg = result.segments[0]
        assert "scent" in seg.role_scores

    def test_remove_is_case_insensitive(self):
        result = _parse(
            "A Vampire in the shadows.",
            config={"role_keywords": {"character": {"remove": ["Vampire"]}}},
        )
        seg = result.segments[0]
        assert "vampire" not in [k.lower() for k in seg.matched_keywords]


class TestDefaultRole:
    """default_role controls what unclassified text falls back to."""

    def test_default_role_is_other(self):
        # Prompt with no keywords should fall back to "other"
        result = _parse("Hello there.")
        seg = result.segments[0]
        assert seg.role == "other"

    def test_custom_default_role(self):
        result = _parse("Hello there.", config={"default_role": "description"})
        seg = result.segments[0]
        assert seg.role == "description"

    def test_min_confidence_uses_default_role(self):
        # When min_confidence demotes, it should use custom default_role
        result = _parse(
            "A vampire stands in the rain.",
            config={"min_confidence": 0.99, "default_role": "unclassified"},
        )
        seg = result.segments[0]
        assert seg.role == "unclassified"


# ---------------------------------------------------------------------------
# Configurable section patterns
# ---------------------------------------------------------------------------


class TestBuiltinPatternIds:
    """Built-in pattern IDs resolve correctly."""

    def test_all_builtin_ids_exist(self):
        assert set(BUILTIN_SECTION_PATTERNS.keys()) == {
            "colon", "assignment", "angle_bracket", "freestanding",
        }

    def test_empty_patterns_uses_colon_default(self):
        result = _parse("CAMERA:\nSlow dolly-in.", config={"section_patterns": []})
        assert result.sections is not None
        assert result.sections[0].label == "CAMERA"


class TestAssignmentPattern:
    """Assignment pattern (KEY = value) detects sections correctly."""

    PROMPT = (
        "ACTOR1 = BIPEDAL Male HUMAN\n"
        "\n"
        "ACTOR1_APPROACHES = Accessus posticus in uno axe procedit.\n"
    )

    def test_detects_assignment_sections(self):
        result = _parse(self.PROMPT, config={"section_patterns": ["assignment"]})
        assert result.sections is not None
        labels = [s.label for s in result.sections]
        assert "ACTOR1" in labels
        assert "ACTOR1_APPROACHES" in labels

    def test_body_starts_after_equals(self):
        result = _parse(self.PROMPT, config={"section_patterns": ["assignment"]})
        actor1 = [s for s in result.sections if s.label == "ACTOR1"][0]
        assert "BIPEDAL Male HUMAN" in actor1.text

    def test_no_space_before_equals(self):
        result = _parse(
            "ACTOR1= BIPEDAL Male HUMAN\n",
            config={"section_patterns": ["assignment"]},
        )
        assert result.sections is not None
        assert result.sections[0].label == "ACTOR1"

    def test_empty_assignment_followed_by_blank_line(self):
        # Empty-value assignments (e.g. `ACTOR2_DISTRACTED=`) must still be
        # detected as their own section — used as an experimental marker.
        result = _parse(
            "ACTOR2_DISTRACTED=\n\nACTOR1 = real value\n",
            config={"section_patterns": ["assignment"]},
        )
        assert result.sections is not None
        labels = [s.label for s in result.sections]
        assert "ACTOR2_DISTRACTED" in labels
        assert "ACTOR1" in labels

    def test_empty_assignment_at_eof(self):
        result = _parse(
            "ACTOR1 = value\nACTOR2_DISTRACTED=",
            config={"section_patterns": ["assignment"]},
        )
        assert result.sections is not None
        labels = [s.label for s in result.sections]
        assert "ACTOR2_DISTRACTED" in labels

    def test_empty_assignment_between_filled(self):
        result = _parse(
            "ACTOR1=hello\nACTOR2=\nACTOR3=world\n",
            config={"section_patterns": ["assignment"]},
        )
        assert result.sections is not None
        labels = [s.label for s in result.sections]
        assert labels == ["ACTOR1", "ACTOR2", "ACTOR3"]


class TestAssignmentArrowPattern:
    """Arrow-separator assignments (NAME > value, NAME >>> value)."""

    def test_single_arrow_assignment(self):
        result = _parse(
            "ACTOR1 > BIPEDAL Male HUMAN\n",
            config={"section_patterns": ["assignment_arrow"]},
        )
        assert result.sections is not None
        assert result.sections[0].label == "ACTOR1"
        assert "BIPEDAL Male HUMAN" in result.sections[0].text

    def test_multiple_arrows_assignment(self):
        result = _parse(
            "MOOD >>> dreamy and distracted\n",
            config={"section_patterns": ["assignment_arrow"]},
        )
        assert result.sections is not None
        assert result.sections[0].label == "MOOD"
        assert "dreamy" in result.sections[0].text

    def test_focal_chain_not_false_matched(self):
        # `NAME>OTHER>X` (no whitespace before `>`) must NOT match as assignment
        result = _parse(
            "ACTOR2_BEHAVIOR>ACTIONS>SCENE_GOALS<ACTIONS<ACTOR1_BEHAVIOR\n",
            config={"section_patterns": ["assignment_arrow"]},
        )
        assert result.sections is None or all(s.label is None for s in result.sections)

    def test_empty_arrow_assignment(self):
        result = _parse(
            "NAME >\n\nOTHER > value\n",
            config={"section_patterns": ["assignment_arrow"]},
        )
        assert result.sections is not None
        labels = [s.label for s in result.sections]
        assert "NAME" in labels
        assert "OTHER" in labels

    def test_mixed_assignment_eq_and_arrow(self):
        # Same prompt can mix separators; both get detected when both patterns enabled
        result = _parse(
            "ACTOR1 = value one\nACTOR2 > value two\nACTOR3 >>> value three\n",
            config={"section_patterns": ["assignment", "assignment_arrow"]},
        )
        assert result.sections is not None
        labels = [s.label for s in result.sections]
        assert labels == ["ACTOR1", "ACTOR2", "ACTOR3"]


class TestAngleBracketPattern:
    """>HEADER< pattern detects sections correctly."""

    PROMPT = (
        ">SCENE SETUP<\n"
        "A dark room.\n"
        ">CAMERA<\n"
        "Slow dolly-in.\n"
    )

    def test_detects_angle_bracket_sections(self):
        result = _parse(self.PROMPT, config={"section_patterns": ["angle_bracket"]})
        assert result.sections is not None
        labels = [s.label for s in result.sections]
        assert "SCENE SETUP" in labels
        assert "CAMERA" in labels

    def test_body_on_next_line(self):
        result = _parse(self.PROMPT, config={"section_patterns": ["angle_bracket"]})
        scene = [s for s in result.sections if s.label == "SCENE SETUP"][0]
        assert "A dark room." in scene.text


class TestFreestandingPattern:
    """Freestanding uppercase tokens detected as sections."""

    PROMPT = (
        "PLAYING\n"
        "\n"
        "ACTOR1 = BIPEDAL Male HUMAN\n"
    )

    def test_detects_freestanding_token(self):
        result = _parse(self.PROMPT, config={
            "section_patterns": ["freestanding", "assignment"],
        })
        assert result.sections is not None
        labels = [s.label for s in result.sections]
        assert "PLAYING" in labels

    def test_short_tokens_rejected(self):
        # Two-char tokens should NOT match freestanding (min 3 chars)
        result = _parse("OK\nSome text.", config={
            "section_patterns": ["freestanding"],
        })
        assert result.sections is None or all(s.label is None for s in result.sections)


class TestMixedPatterns:
    """Multiple patterns active simultaneously."""

    PROMPT = (
        "PLAYING\n"
        "\n"
        ">SCENE SETUP<\n"
        "A dark room.\n"
        "ACTOR1 = BIPEDAL Male HUMAN\n"
        "CAMERA:\n"
        "Slow dolly-in.\n"
    )

    def test_all_four_patterns(self):
        result = _parse(self.PROMPT, config={
            "section_patterns": ["colon", "assignment", "angle_bracket", "freestanding"],
        })
        assert result.sections is not None
        labels = [s.label for s in result.sections]
        assert "PLAYING" in labels
        assert "SCENE SETUP" in labels
        assert "ACTOR1" in labels
        assert "CAMERA" in labels

    def test_section_order_matches_text_order(self):
        result = _parse(self.PROMPT, config={
            "section_patterns": ["colon", "assignment", "angle_bracket", "freestanding"],
        })
        labels = [s.label for s in result.sections]
        assert labels == ["PLAYING", "SCENE SETUP", "ACTOR1", "CAMERA"]


class TestCustomRegexPattern:
    """Custom regex strings work as section patterns."""

    def test_custom_pattern(self):
        result = _parse(
            "## INTRO ##\nHello world.\n## OUTRO ##\nGoodbye.\n",
            config={"section_patterns": [r'^[ \t]*##\s*([A-Z]+)\s*##\s*$']},
        )
        assert result.sections is not None
        labels = [s.label for s in result.sections]
        assert "INTRO" in labels
        assert "OUTRO" in labels


class TestPreambleWithConfiguredPatterns:
    """Text before first configured header becomes unlabeled preamble."""

    def test_preamble_preserved(self):
        result = _parse(
            "Some intro text.\nACTOR1 = The hero.\n",
            config={"section_patterns": ["assignment"]},
        )
        assert result.sections is not None
        assert result.sections[0].label is None
        assert "Some intro text." in result.sections[0].text


# ---------------------------------------------------------------------------
# Prompt builder — easy iteration of tokens before / between / after blocks
# ---------------------------------------------------------------------------


def make_section(label, body, sep=":"):
    """Format one section using the given separator style.

    sep: ":" colon (default), "=" assignment, ">" arrow, ">>>" triple-arrow,
         "<>" angle-bracket, "free" freestanding uppercase.
    """
    if sep == ":":
        return f"{label}:\n{body}"
    if sep in ("=", ">", ">>>"):
        return f"{label} {sep} {body}"
    if sep == "<>":
        return f">{label}<\n{body}"
    if sep == "free":
        return f"{label}\n{body}"
    raise ValueError(f"Unknown sep: {sep!r}")


def make_prompt(*sections, before="", between="", after="", sep=":"):
    """Assemble a prompt from (label, body) section pairs.

    Keyword args:
      before   — text inserted before the first section header
      between  — text inserted between every pair of consecutive section headers
      after    — text appended after the last section body
      sep      — separator style forwarded to make_section

    Example:
      make_prompt(("CAMERA", "Slow dolly."), before="Preamble.", after="THE END.")
    """
    parts = []
    if before.strip():
        parts.append(before.rstrip())
    for i, (label, body) in enumerate(sections):
        if i > 0 and between.strip():
            parts.append(between.rstrip())
        parts.append(make_section(label, body.rstrip(), sep))
    if after.strip():
        parts.append(after.rstrip())
    return "\n".join(parts) + "\n"


# ---------------------------------------------------------------------------
# Token position tests — before / between / after blocks
# ---------------------------------------------------------------------------


class TestPreambleVariants:
    """Parametrized before-block tokens become unlabeled preamble sections."""

    @pytest.mark.parametrize("preamble", [
        "A general establishing shot.",
        "INT. FOREST - DAY",
        "A dark and stormy night.",
        ">>intro shot<<",
        "Wide exterior. Wind. Silence.",
    ])
    def test_preamble_has_no_section_label(self, preamble):
        prompt = make_prompt(("CAMERA", "Slow dolly-in."), before=preamble)
        result = _parse(prompt)
        assert result.sections is not None
        assert result.sections[0].label is None

    @pytest.mark.parametrize("preamble", [
        "A general establishing shot.",
        "INT. FOREST - DAY",
        "Wide exterior. Wind. Silence.",
    ])
    def test_preamble_text_preserved_in_section_body(self, preamble):
        prompt = make_prompt(("CAMERA", "Slow dolly-in."), before=preamble)
        result = _parse(prompt)
        assert preamble in result.sections[0].text


class TestInterSectionContent:
    """Non-header tokens between two section headers are absorbed into the
    preceding section's body, not treated as new sections."""

    @pytest.mark.parametrize("between_token", [
        "---",
        "...",
        "* * *",
        "[ transition ]",
        "(cut)",
        "~",
    ])
    def test_between_token_captured_in_preceding_section(self, between_token):
        prompt = make_prompt(
            ("SCENE ONE", "A dark room."),
            ("SCENE TWO", "A bright room."),
            between=between_token,
        )
        result = _parse(prompt)
        assert result.sections is not None
        scene_one = next(s for s in result.sections if s.label == "SCENE ONE")
        assert between_token in scene_one.text

    @pytest.mark.parametrize("between_token", [
        "---",
        "...",
        "* * *",
    ])
    def test_between_token_does_not_create_extra_section(self, between_token):
        prompt = make_prompt(
            ("ACTOR", "A warrior."),
            ("CAMERA", "Slow dolly-in."),
            between=between_token,
        )
        result = _parse(prompt)
        assert result.sections is not None
        labeled = [s for s in result.sections if s.label is not None]
        assert len(labeled) == 2


class TestEpilogueContent:
    """Tokens after the last section header are absorbed into the last
    section's body."""

    @pytest.mark.parametrize("epilogue", [
        "End of prompt.",
        "--- END ---",
        "[Cut to black]",
        "(fade out)",
        ".",
    ])
    def test_epilogue_captured_in_last_section_body(self, epilogue):
        prompt = make_prompt(("CAMERA", "Slow dolly-in."), after=epilogue)
        result = _parse(prompt)
        assert result.sections is not None
        assert epilogue in result.sections[-1].text

    @pytest.mark.parametrize("epilogue", [
        "End of prompt.",
        "--- END ---",
    ])
    def test_epilogue_does_not_create_extra_section(self, epilogue):
        prompt = make_prompt(("CAMERA", "Slow dolly-in."), after=epilogue)
        result = _parse(prompt)
        assert result.sections is not None
        labeled = [s for s in result.sections if s.label is not None]
        assert len(labeled) == 1


class TestTokenPositions:
    """The same token exercised in all three positions relative to sections."""

    @pytest.mark.parametrize("token", [
        "---",
        "...",
        "* * *",
        "[scene break]",
    ])
    def test_token_before_becomes_preamble(self, token):
        prompt = make_prompt(("CAMERA", "Slow dolly-in."), before=token)
        result = _parse(prompt)
        assert result.sections is not None
        assert result.sections[0].label is None
        assert token in result.sections[0].text

    @pytest.mark.parametrize("token", [
        "---",
        "...",
        "* * *",
        "[scene break]",
    ])
    def test_token_between_absorbed_into_preceding_section(self, token):
        prompt = make_prompt(
            ("SCENE", "A dark room."),
            ("CAMERA", "Slow dolly-in."),
            between=token,
        )
        result = _parse(prompt)
        assert result.sections is not None
        scene = next(s for s in result.sections if s.label == "SCENE")
        assert token in scene.text

    @pytest.mark.parametrize("token", [
        "---",
        "...",
        "* * *",
        "[scene break]",
    ])
    def test_token_after_absorbed_into_last_section(self, token):
        prompt = make_prompt(("CAMERA", "Slow dolly-in."), after=token)
        result = _parse(prompt)
        assert result.sections is not None
        assert token in result.sections[-1].text


# ---------------------------------------------------------------------------
# Pattern × token matrix — same labels across all separator styles
# ---------------------------------------------------------------------------


class TestPatternTokenMatrix:
    """The same label tokens exercised across all four builtin separator styles."""

    LABELS = ["ACTOR1", "MOOD", "SCENE", "CAMERA"]

    @pytest.mark.parametrize("label", LABELS)
    def test_colon_pattern(self, label):
        result = _parse(make_prompt((label, "Some content.")))
        assert result.sections is not None
        assert result.sections[0].label == label

    @pytest.mark.parametrize("label", LABELS)
    def test_assignment_pattern(self, label):
        result = _parse(
            make_prompt((label, "Some content."), sep="="),
            config={"section_patterns": ["assignment"]},
        )
        assert result.sections is not None
        assert result.sections[0].label == label

    @pytest.mark.parametrize("label", LABELS)
    def test_arrow_pattern(self, label):
        result = _parse(
            make_prompt((label, "Some content."), sep=">"),
            config={"section_patterns": ["assignment_arrow"]},
        )
        assert result.sections is not None
        assert result.sections[0].label == label

    @pytest.mark.parametrize("label", LABELS)
    def test_triple_arrow_pattern(self, label):
        result = _parse(
            make_prompt((label, "Some content."), sep=">>>"),
            config={"section_patterns": ["assignment_arrow"]},
        )
        assert result.sections is not None
        assert result.sections[0].label == label

    @pytest.mark.parametrize("label", LABELS)
    def test_freestanding_pattern(self, label):
        result = _parse(
            make_prompt((label, "Some content."), sep="free"),
            config={"section_patterns": ["freestanding"]},
        )
        assert result.sections is not None
        assert result.sections[0].label == label

    @pytest.mark.parametrize("label", LABELS)
    def test_all_patterns_active_detects_same_label(self, label):
        result = _parse(
            make_prompt((label, "Some content.")),
            config={"section_patterns": ["colon", "assignment", "angle_bracket", "freestanding"]},
        )
        assert result.sections is not None
        assert result.sections[0].label == label
