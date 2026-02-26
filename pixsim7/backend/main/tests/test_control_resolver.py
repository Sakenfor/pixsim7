"""Tests for the control resolution layer (control_resolver.py)."""
from __future__ import annotations

import pytest

from pixsim7.backend.main.services.prompt.block.control_resolver import (
    LAZY_CONTROL_TYPES,
    BlockQueryFn,
    _auto_label,
    is_lazy_control,
    resolve_control,
    resolve_controls,
    resolve_tag_select_control,
)
from pixsim7.backend.main.services.prompt.block.template_controls import (
    expand_control_presets,
)


# ── _auto_label ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("value,expected", [
    ("utility",       "Utility"),
    ("sandy_warm",    "Sandy Warm"),
    ("skin_tight",    "Skin Tight"),
    ("a_line",        "A Line"),
    ("ots",           "Ots"),        # no override — raw title case
    ("arm_reach",     "Arm Reach"),
    ("cold_earth",    "Cold Earth"),
])
def test_auto_label_snake_case(value: str, expected: str) -> None:
    assert _auto_label(value) == expected


def test_auto_label_vocab_override() -> None:
    meta = {"value_labels": {"ots": "Over-Shoulder", "pov_hand": "POV (Hand)"}}
    assert _auto_label("ots", meta) == "Over-Shoulder"
    assert _auto_label("pov_hand", meta) == "POV (Hand)"


def test_auto_label_missing_override_falls_back() -> None:
    meta = {"value_labels": {"desert": "Desert Sands"}}
    assert _auto_label("forest", meta) == "Forest"  # not in value_labels → auto


def test_auto_label_no_meta() -> None:
    assert _auto_label("moss_earth") == "Moss Earth"


# ── is_lazy_control ───────────────────────────────────────────────────────────

def test_is_lazy_tag_select() -> None:
    assert is_lazy_control({"type": "tag_select", "id": "x", "label": "X",
                             "target_tag": "variant", "target_slot": "Aesthetic style"})


def test_is_lazy_slider_false() -> None:
    assert not is_lazy_control({"type": "slider", "id": "x"})


def test_is_lazy_explicit_select_false() -> None:
    # A plain 'select' with hardcoded options is not lazy
    assert not is_lazy_control({"type": "select", "id": "x", "options": []})


def test_is_lazy_non_dict_false() -> None:
    assert not is_lazy_control("tag_select")
    assert not is_lazy_control(None)


# ── resolve_tag_select_control ────────────────────────────────────────────────

_VOCAB_WITH_ALLOWED = {
    "theme_variant": {
        "allowed_values": ["general", "desert", "forest", "mountain", "tundra"],
        "label": "Theme Variant",
    }
}

_VARIANT_CONTROL = {
    "id": "style_variant",
    "type": "tag_select",
    "label": "Style Variant",
    "defaultValue": "utility",
    "target_tag": "variant",
    "target_slot": "Aesthetic style",
}

_THEME_VARIANT_CONTROL = {
    "id": "tribal_subgenre",
    "type": "tag_select",
    "label": "Tribal Sub-Genre",
    "target_tag": "theme_variant",
    "target_slot": "Aesthetic theme",
}


class TestResolveTagSelectVocabDriven:
    def test_returns_select_type(self) -> None:
        result = resolve_tag_select_control(_THEME_VARIANT_CONTROL, vocab=_VOCAB_WITH_ALLOWED)
        assert result["type"] == "select"

    def test_preserves_id_and_label(self) -> None:
        result = resolve_tag_select_control(_THEME_VARIANT_CONTROL, vocab=_VOCAB_WITH_ALLOWED)
        assert result["id"] == "tribal_subgenre"
        assert result["label"] == "Tribal Sub-Genre"

    def test_options_count_matches_allowed_values(self) -> None:
        result = resolve_tag_select_control(_THEME_VARIANT_CONTROL, vocab=_VOCAB_WITH_ALLOWED)
        assert len(result["options"]) == 5

    def test_option_order_matches_vocab(self) -> None:
        result = resolve_tag_select_control(_THEME_VARIANT_CONTROL, vocab=_VOCAB_WITH_ALLOWED)
        ids = [o["id"] for o in result["options"]]
        assert ids == ["general", "desert", "forest", "mountain", "tundra"]

    def test_option_labels_auto_generated(self) -> None:
        result = resolve_tag_select_control(_THEME_VARIANT_CONTROL, vocab=_VOCAB_WITH_ALLOWED)
        labels = [o["label"] for o in result["options"]]
        assert labels == ["General", "Desert", "Forest", "Mountain", "Tundra"]

    def test_each_option_has_one_effect(self) -> None:
        result = resolve_tag_select_control(_THEME_VARIANT_CONTROL, vocab=_VOCAB_WITH_ALLOWED)
        for opt in result["options"]:
            assert len(opt["effects"]) == 1

    def test_effect_boosts_selected_value(self) -> None:
        result = resolve_tag_select_control(_THEME_VARIANT_CONTROL, vocab=_VOCAB_WITH_ALLOWED)
        desert_opt = next(o for o in result["options"] if o["id"] == "desert")
        assert desert_opt["effects"][0]["boostTags"] == {"theme_variant": "desert"}

    def test_effect_avoids_all_others(self) -> None:
        result = resolve_tag_select_control(_THEME_VARIANT_CONTROL, vocab=_VOCAB_WITH_ALLOWED)
        desert_opt = next(o for o in result["options"] if o["id"] == "desert")
        avoid = desert_opt["effects"][0]["avoidTags"]["theme_variant"]
        assert set(avoid) == {"general", "forest", "mountain", "tundra"}
        assert "desert" not in avoid

    def test_effect_targets_correct_slot(self) -> None:
        result = resolve_tag_select_control(_THEME_VARIANT_CONTROL, vocab=_VOCAB_WITH_ALLOWED)
        for opt in result["options"]:
            assert opt["effects"][0]["slotLabel"] == "Aesthetic theme"

    def test_default_value_preserved_when_set(self) -> None:
        ctrl = {**_THEME_VARIANT_CONTROL, "defaultValue": "desert"}
        result = resolve_tag_select_control(ctrl, vocab=_VOCAB_WITH_ALLOWED)
        assert result["defaultValue"] == "desert"

    def test_default_value_falls_back_to_first_option(self) -> None:
        # No defaultValue in control
        ctrl = {k: v for k, v in _THEME_VARIANT_CONTROL.items() if k != "defaultValue"}
        result = resolve_tag_select_control(ctrl, vocab=_VOCAB_WITH_ALLOWED)
        assert result["defaultValue"] == "general"

    def test_no_avoid_tags_when_single_option(self) -> None:
        vocab = {"lone_tag": {"allowed_values": ["only"]}}
        ctrl = {"id": "x", "type": "tag_select", "label": "X",
                "target_tag": "lone_tag", "target_slot": "Some slot"}
        result = resolve_tag_select_control(ctrl, vocab=vocab)
        assert len(result["options"]) == 1
        assert "avoidTags" not in result["options"][0]["effects"][0]

    def test_lazy_fields_not_in_output(self) -> None:
        result = resolve_tag_select_control(_THEME_VARIANT_CONTROL, vocab=_VOCAB_WITH_ALLOWED)
        assert "target_tag" not in result
        assert "target_slot" not in result

    def test_extra_authoring_fields_forwarded(self) -> None:
        ctrl = {**_THEME_VARIANT_CONTROL, "description": "Pick a sub-genre"}
        result = resolve_tag_select_control(ctrl, vocab=_VOCAB_WITH_ALLOWED)
        assert result["description"] == "Pick a sub-genre"


class TestResolveTagSelectCatalogFallback:
    """For open-vocab tags (no allowed_values) the catalog fn is the source."""

    def _make_query_fn(self, values: list[str]) -> BlockQueryFn:
        def fn(tag: str, constraints: dict) -> list[str]:
            return values
        return fn

    def test_falls_back_to_catalog_when_no_allowed_values(self) -> None:
        vocab = {"variant": {"allowed_values": []}}
        fn = self._make_query_fn(["utility", "shadow", "outlaw", "guild"])
        result = resolve_tag_select_control(
            _VARIANT_CONTROL, vocab=vocab, block_query_fn=fn
        )
        assert [o["id"] for o in result["options"]] == ["utility", "shadow", "outlaw", "guild"]

    def test_catalog_fn_receives_slot_constraints(self) -> None:
        received: list[tuple] = []

        def fn(tag: str, constraints: dict) -> list[str]:
            received.append((tag, constraints))
            return ["a", "b"]

        vocab = {"variant": {"allowed_values": []}}
        slot_constraints = {"aesthetic": "medieval_thief"}
        resolve_tag_select_control(
            _VARIANT_CONTROL, vocab=vocab,
            block_query_fn=fn,
            slot_constraints=slot_constraints,
        )
        assert received[0][0] == "variant"
        assert received[0][1] == {"aesthetic": "medieval_thief"}

    def test_empty_when_no_vocab_and_no_fn(self) -> None:
        # No allowed_values, no catalog fn → empty options.
        # defaultValue from the control spec is preserved even when options are empty.
        vocab: dict = {}
        ctrl = {k: v for k, v in _VARIANT_CONTROL.items() if k != "defaultValue"}
        result = resolve_tag_select_control(ctrl, vocab=vocab)
        assert result["options"] == []
        assert result["defaultValue"] is None  # no spec default, no options → None


# ── resolve_control dispatch ──────────────────────────────────────────────────

def test_resolve_control_slider_passthrough() -> None:
    slider = {"id": "pose", "type": "slider", "min": 0, "max": 10,
              "label": "Pose Lock", "effects": []}
    result = resolve_control(slider, vocab={})
    assert result is slider  # exact same object — no copy


def test_resolve_control_explicit_select_passthrough() -> None:
    sel = {"id": "x", "type": "select", "options": [{"id": "a"}, {"id": "b"}]}
    result = resolve_control(sel, vocab={})
    assert result is sel


def test_resolve_control_tag_select_resolved() -> None:
    ctrl = {
        "id": "subgenre",
        "type": "tag_select",
        "label": "Sub-Genre",
        "target_tag": "theme_variant",
        "target_slot": "Aesthetic theme",
    }
    result = resolve_control(ctrl, vocab=_VOCAB_WITH_ALLOWED)
    assert result["type"] == "select"
    assert len(result["options"]) == 5


def test_resolve_control_uses_slot_constraints_by_label() -> None:
    captured: list[dict] = []

    def fn(tag: str, constraints: dict) -> list[str]:
        captured.append(constraints)
        return ["x"]

    vocab = {"variant": {"allowed_values": []}}
    ctrl = {"id": "v", "type": "tag_select", "label": "V",
            "target_tag": "variant", "target_slot": "Aesthetic style"}
    resolve_control(
        ctrl,
        vocab=vocab,
        block_query_fn=fn,
        slot_constraints_by_label={"Aesthetic style": {"aesthetic": "medieval_thief"}},
    )
    assert captured[0] == {"aesthetic": "medieval_thief"}


# ── resolve_controls (list helper) ───────────────────────────────────────────

def test_resolve_controls_empty() -> None:
    assert resolve_controls([], vocab={}) == []


def test_resolve_controls_mixed() -> None:
    slider = {"id": "s", "type": "slider", "min": 0, "max": 5, "label": "S"}
    tag_sel = {
        "id": "t", "type": "tag_select", "label": "T",
        "target_tag": "theme_variant", "target_slot": "Aesthetic theme",
    }
    results = resolve_controls([slider, tag_sel], vocab=_VOCAB_WITH_ALLOWED)
    assert len(results) == 2
    assert results[0]["type"] == "slider"
    assert results[1]["type"] == "select"
    assert len(results[1]["options"]) == 5


# ── expand_control_presets: tag_select validation ─────────────────────────────

def test_expand_valid_tag_select_passes_through() -> None:
    ctrl = {
        "id": "style_variant",
        "type": "tag_select",
        "label": "Style Variant",
        "defaultValue": "utility",
        "target_tag": "variant",
        "target_slot": "Aesthetic style",
    }
    result = expand_control_presets([ctrl])
    assert result == [ctrl]


@pytest.mark.parametrize("missing_field", ["id", "label", "target_tag", "target_slot"])
def test_expand_tag_select_missing_required_field_raises(missing_field: str) -> None:
    ctrl = {
        "id": "x", "type": "tag_select", "label": "X",
        "target_tag": "variant", "target_slot": "Slot",
    }
    del ctrl[missing_field]
    with pytest.raises(ValueError, match="tag_select control"):
        expand_control_presets([ctrl])


def test_expand_tag_select_empty_string_field_raises() -> None:
    ctrl = {
        "id": "x", "type": "tag_select", "label": "X",
        "target_tag": "",  # empty
        "target_slot": "Slot",
    }
    with pytest.raises(ValueError, match="non-empty string"):
        expand_control_presets([ctrl])
