"""Tests for param-aware text_synthesis prose rendering.

`text_synthesis` (plan:op-runtime-span-popover, variant-densification path)
bakes a variant's `.text` from a template + per-param word_tables at compile
time — single source of truth in CUE, no runtime engine, no Python prose
tables to keep in sync with the op's enum space.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from pixsim7.backend.main.services.prompt.block.content_pack_loader import (
    CONTENT_PACKS_DIR,
    parse_blocks,
)
from pixsim7.backend.main.services.prompt.block.content_pack_schema_compiler import (
    SchemaCompilerValidationError,
    _render_text_synthesis,
)

_SRC = Path("test://core_light")


def _light_synthesis() -> dict:
    return {
        "template": "{intensity} {temperature} {contrast} {key_light} lighting.",
        "word_tables": {
            "intensity": {"low": "dim", "medium": "", "high": "bright"},
            "temperature": {
                "warm": "warm",
                "cool": "cool",
                "neutral": "",
                "mixed": "mixed-temperature",
            },
            "contrast": {
                "low": "low-contrast",
                "medium": "",
                "high": "high-contrast",
            },
            "key_light": {
                "diffuse": "diffused",
                "soft": "soft",
                "hard": "hard",
                "rim": "rim-lit",
                "backlit": "backlit",
            },
        },
    }


class TestRenderTextSynthesis:
    def _render(self, **op_args: str) -> str:
        return _render_text_synthesis(
            _light_synthesis(),
            variant_key="v",
            op_args=op_args,
            src=_SRC,
        )

    def test_all_defaults_elide_to_minimal_prose(self):
        assert (
            self._render(
                key_light="diffuse",
                intensity="medium",
                temperature="neutral",
                contrast="medium",
            )
            == "Diffused lighting."
        )

    def test_off_default_params_compose_in_template_order(self):
        assert (
            self._render(
                key_light="hard",
                intensity="high",
                temperature="cool",
                contrast="high",
            )
            == "Bright cool high-contrast hard lighting."
        )

    def test_partial_off_default(self):
        # soft_warm: intensity=medium (elide), contrast=low
        assert (
            self._render(
                key_light="soft",
                intensity="medium",
                temperature="warm",
                contrast="low",
            )
            == "Warm low-contrast soft lighting."
        )

    def test_unmapped_value_falls_through_verbatim(self):
        # A value with no word_tables entry passes through as-is.
        out = self._render(
            key_light="diffuse",
            intensity="medium",
            temperature="ultraviolet",
            contrast="medium",
        )
        assert "ultraviolet" in out.lower()

    def test_missing_template_param_collapses_not_crashes(self):
        # Template references {contrast} but op_args omits it → empty slot.
        out = _render_text_synthesis(
            _light_synthesis(),
            variant_key="v",
            op_args={"key_light": "rim", "intensity": "high"},
            src=_SRC,
        )
        assert out == "Bright rim-lit lighting."

    def test_capitalizes_first_character(self):
        assert self._render(
            key_light="soft", intensity="medium", temperature="warm", contrast="medium"
        ).startswith("Warm ")

    def test_invalid_template_type_raises(self):
        with pytest.raises(SchemaCompilerValidationError):
            _render_text_synthesis(
                {"template": 123},
                variant_key="v",
                op_args={},
                src=_SRC,
            )

    def test_invalid_word_tables_type_raises(self):
        with pytest.raises(SchemaCompilerValidationError):
            _render_text_synthesis(
                {"template": "{x} lighting.", "word_tables": "nope"},
                variant_key="v",
                op_args={},
                src=_SRC,
            )


class TestCoreLightCompiledProse:
    """End-to-end: core_light variants compile to real prose, not placeholders."""

    def test_core_light_has_real_prose(self):
        blocks = parse_blocks(CONTENT_PACKS_DIR / "core_light")
        by_id = {b["block_id"]: b.get("text") for b in blocks}

        assert by_id["core.light.state.diffuse_neutral"] == "Diffused lighting."
        assert (
            by_id["core.light.state.soft_warm"]
            == "Warm low-contrast soft lighting."
        )
        assert (
            by_id["core.light.state.hard_cool"]
            == "Bright cool high-contrast hard lighting."
        )
        # No placeholder leakage.
        for text in by_id.values():
            assert text and "token:" not in text
