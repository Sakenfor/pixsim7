"""Composer section-header emission — roundtrip tests.

Validates the slot.section field + sectioned composition strategy + parser
recognition contract. The composer emits ``LABEL:`` header lines at section
boundaries; the parser's existing ``colon`` header pattern (in
``grammar_rules.json``) classifies them back as ``kind: header``. No grammar
change required — this test pins the asymmetry fix.

Plan: composer-section-emission.
"""
from __future__ import annotations

import pytest

from pixsim7.backend.main.services.prompt.block.composition_layers import (
    SECTION_LABELS,
    emit_section_headers,
    ensure_period,
    join_blocks,
    resolve_section_label,
)
from pixsim7.backend.main.services.prompt.block.template_slots import (
    TEMPLATE_SLOT_SCHEMA_VERSION,
    TemplateSlotSpec,
    normalize_template_slot,
    normalize_template_slots,
)
from pixsim7.backend.main.services.prompt.parser.tokenizer import tokenize


# ── resolve_section_label ──────────────────────────────────────────────────


class TestResolveSectionLabel:
    def test_canonical_render_style(self):
        assert resolve_section_label("render_style") == "RENDER STYLE"

    def test_canonical_scene(self):
        assert resolve_section_label("scene") == "SCENE"

    def test_canonical_subject(self):
        assert resolve_section_label("subject") == "SUBJECT"

    def test_unknown_id_falls_back_to_uppercased(self):
        # Free-form ids in user-authored templates should not crash composition.
        assert resolve_section_label("my_custom_section") == "MY CUSTOM SECTION"

    def test_empty_id_returns_empty(self):
        assert resolve_section_label("") == ""

    def test_single_word_no_underscores(self):
        assert resolve_section_label("mood") == "MOOD"
        # Canonical wins over default uppercase even for single-word ids.
        assert SECTION_LABELS["mood"] == "MOOD"


# ── emit_section_headers ───────────────────────────────────────────────────


class TestEmitSectionHeaders:
    def test_empty_input(self):
        assert emit_section_headers([]) == []

    def test_single_section_emits_one_header(self):
        result = emit_section_headers([
            ("first", "scene"),
            ("second", "scene"),
        ])
        assert result == ["SCENE:", "first", "second"]

    def test_section_transition_emits_new_header(self):
        result = emit_section_headers([
            ("a", "render_style"),
            ("b", "render_style"),
            ("c", "scene"),
            ("d", "scene"),
        ])
        assert result == ["RENDER STYLE:", "a", "b", "SCENE:", "c", "d"]

    def test_repeated_section_does_not_emit_duplicate_header(self):
        # Three consecutive parts in same section → only one header at start.
        result = emit_section_headers([
            ("a", "scene"),
            ("b", "scene"),
            ("c", "scene"),
        ])
        assert result.count("SCENE:") == 1

    def test_unsectioned_parts_emit_no_header(self):
        result = emit_section_headers([
            ("a", None),
            ("b", None),
        ])
        assert result == ["a", "b"]

    def test_unsectioned_then_sectioned(self):
        # Preamble parts (no section) followed by sectioned content. Header
        # emits at the first sectioned part, not before.
        result = emit_section_headers([
            ("preamble", None),
            ("first scene line", "scene"),
        ])
        assert result == ["preamble", "SCENE:", "first scene line"]

    def test_empty_text_dropped(self):
        result = emit_section_headers([
            ("", "scene"),
            ("real", "scene"),
        ])
        # Empty text should not trigger a header for an empty section.
        assert result == ["SCENE:", "real"]

    def test_revisiting_section_re_emits_header(self):
        # If composition leaves a section and comes back, that's still a
        # transition — emit the header again. (Caller's job to order slots so
        # this doesn't happen unless intended.)
        result = emit_section_headers([
            ("a", "scene"),
            ("b", "render_style"),
            ("c", "scene"),
        ])
        assert result == ["SCENE:", "a", "RENDER STYLE:", "b", "SCENE:", "c"]


# ── ensure_period keeps terminal colon ─────────────────────────────────────


class TestEnsurePeriodKeepsColon:
    def test_colon_terminal_not_punctuated(self):
        # ``ensure_period`` must leave header lines alone or the parser's
        # ``colon`` pattern (requires line-terminal ``:``) won't match.
        assert ensure_period("RENDER STYLE:") == "RENDER STYLE:"

    def test_period_still_appended_for_normal_text(self):
        assert ensure_period("a normal block of text") == "a normal block of text."

    def test_existing_sentence_endings_preserved(self):
        assert ensure_period("ending in period.") == "ending in period."
        assert ensure_period("ending in question?") == "ending in question?"
        assert ensure_period("ending in exclaim!") == "ending in exclaim!"


# ── Roundtrip: emit + join + tokenize → parser sees header lines ───────────


class TestRoundtripParser:
    def test_single_section_header_tokenized(self):
        parts = emit_section_headers([
            ("crimson sunset light", "render_style"),
            ("low-angle cinematic shot", "render_style"),
        ])
        prompt = join_blocks(parts)
        tokens = tokenize(prompt)
        lines = tokens["lines"]

        # First line must be a colon-pattern header with label "RENDER STYLE".
        header_lines = [ln for ln in lines if ln["kind"] == "header"]
        assert len(header_lines) == 1, f"expected 1 header line in {lines!r}"
        assert header_lines[0]["pattern"] == "colon"
        assert header_lines[0]["label"] == "RENDER STYLE"

    def test_section_transition_produces_two_headers(self):
        parts = emit_section_headers([
            ("painted realism", "render_style"),
            ("amber-lit alley", "scene"),
            ("static subject pose", "subject"),
        ])
        prompt = join_blocks(parts)
        tokens = tokenize(prompt)
        lines = tokens["lines"]

        header_labels = [
            ln["label"] for ln in lines
            if ln["kind"] == "header" and ln["pattern"] == "colon"
        ]
        assert header_labels == ["RENDER STYLE", "SCENE", "SUBJECT"]

    def test_unsectioned_prompt_produces_no_headers(self):
        parts = emit_section_headers([
            ("plain prompt line one", None),
            ("plain prompt line two", None),
        ])
        prompt = join_blocks(parts)
        tokens = tokenize(prompt)
        lines = tokens["lines"]

        assert not any(ln["kind"] == "header" for ln in lines), (
            f"expected no header lines in {lines!r}"
        )


# ── Schema: TemplateSlotSpec.section round-trip ────────────────────────────


class TestTemplateSlotSpecSection:
    def test_schema_version_is_4(self):
        # Bumped from 3 with the addition of the ``section`` field.
        assert TEMPLATE_SLOT_SCHEMA_VERSION == 4

    def test_spec_accepts_section_field(self):
        spec = TemplateSlotSpec(
            label="Style homage",
            category="style_homage",
            section="render_style",
        )
        assert spec.section == "render_style"

    def test_spec_section_defaults_to_none(self):
        spec = TemplateSlotSpec(label="Plain slot")
        assert spec.section is None

    def test_normalize_preserves_section(self):
        # normalize_template_slot is the boundary that templates pass through;
        # the section field must survive normalization.
        normalized = normalize_template_slot({
            "label": "Style homage",
            "category": "style_homage",
            "section": "render_style",
        })
        assert normalized["section"] == "render_style"

    def test_v3_specs_load_without_section(self):
        # Older v3-stamped slot specs lack the section field; loading them at
        # current schema version must not crash, and section should be None.
        normalized = normalize_template_slots(
            [{"label": "Camera", "category": "camera"}],
            schema_version=3,
        )
        assert len(normalized) == 1
        assert normalized[0]["section"] is None

    def test_section_too_long_rejected(self):
        # Field has max_length=120 to bound display labels.
        with pytest.raises(Exception):
            TemplateSlotSpec(label="x", section="x" * 121)

    def test_section_min_length_one(self):
        # Empty string section should be rejected — use None for "no section".
        with pytest.raises(Exception):
            TemplateSlotSpec(label="x", section="")
