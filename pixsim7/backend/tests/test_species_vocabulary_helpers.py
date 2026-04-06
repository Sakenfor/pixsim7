from __future__ import annotations

import pytest

from pixsim7.backend.main.shared.ontology.vocabularies.factories import (
    _validate_species_schema,
    make_species,
)
from pixsim7.backend.main.shared.ontology.vocabularies.species import normalize_species_id
from pixsim7.backend.main.shared.ontology.vocabularies.types import (
    DEFAULT_MODIFIER_ROLE_MAPPING,
    REQUIRED_ANATOMY_KEYS,
    REQUIRED_MODIFIER_ROLES,
)


# ---------------------------------------------------------------------------
# Helpers — minimal valid species data
# ---------------------------------------------------------------------------

def _base_anatomy() -> dict:
    """Anatomy map with all required keys."""
    return {
        "limbs": "hands",
        "grip": "fingers",
        "stance": "standing upright",
        "feet": "feet",
        "forelimbs": "arms",
    }


def _base_word_lists() -> dict:
    """Word lists that satisfy the default modifier_role mapping."""
    return {
        "vocal_pleasure": ["sighs softly", "moans"],
        "vocal_pain": ["winces", "yelps"],
        "vocal_surprise": ["blinks", "gasps"],
        "vocal_effort": ["exhales", "grunts"],
        "breath": ["steady breath", "panting"],
        "posture": ["relaxed", "tense"],
        "muscle": ["relaxed", "straining"],
    }


def _valid_mammal_data(**overrides) -> dict:
    data = {
        "label": "Test Mammal",
        "category": "mammal",
        "anatomy_map": _base_anatomy(),
        "movement_verbs": ["walks", "runs"],
        "pronoun_set": {"subject": "it", "object": "it", "possessive": "its"},
        "word_lists": _base_word_lists(),
    }
    data.update(overrides)
    return data


# ---------------------------------------------------------------------------
# normalize_species_id
# ---------------------------------------------------------------------------

def test_normalize_species_id_handles_prefix_and_case():
    assert normalize_species_id("CePhAlOpOd") == "species:cephalopod"
    assert normalize_species_id("species:CePhAlOpOd") == "species:cephalopod"
    assert normalize_species_id("  ") is None
    assert normalize_species_id(None) is None


# ---------------------------------------------------------------------------
# Schema validation — anatomy_map
# ---------------------------------------------------------------------------

def test_missing_required_anatomy_key_raises():
    data = _valid_mammal_data()
    del data["anatomy_map"]["limbs"]
    with pytest.raises(ValueError, match="missing required anatomy_map keys"):
        make_species("species:bad", data, "test")


def test_empty_anatomy_value_is_allowed():
    """Empty string values are valid (e.g. human tail='')."""
    data = _valid_mammal_data()
    data["anatomy_map"]["limbs"] = ""
    species = make_species("species:ok", data, "test")
    assert species.anatomy_map["limbs"] == ""


# ---------------------------------------------------------------------------
# Schema validation — modifier_roles
# ---------------------------------------------------------------------------

def test_default_modifier_roles_applied_for_mammals():
    """When no modifier_roles specified, defaults are applied."""
    data = _valid_mammal_data()
    species = make_species("species:mammal", data, "test")
    assert species.modifier_roles == DEFAULT_MODIFIER_ROLE_MAPPING


def test_explicit_modifier_roles_override_defaults():
    """Cephalopod-style explicit roles override default mapping."""
    data = _valid_mammal_data()
    data["word_lists"]["chromatophore_mood"] = ["steady blue", "flaring"]
    data["modifier_roles"] = {"pleasure_expression": "chromatophore_mood"}
    species = make_species("species:custom", data, "test")
    assert species.modifier_roles["pleasure_expression"] == "chromatophore_mood"
    # Other roles still get defaults
    assert species.modifier_roles["body_posture"] == "posture"


def test_modifier_role_mapping_to_missing_word_list_raises():
    """If a modifier_role maps to a word_list key that doesn't exist, fail."""
    data = _valid_mammal_data()
    data["modifier_roles"] = {"pleasure_expression": "nonexistent_list"}
    with pytest.raises(ValueError, match="maps to 'nonexistent_list'"):
        make_species("species:bad", data, "test")


def test_all_required_modifier_roles_present():
    """Every required role must appear in the effective mapping."""
    species = make_species("species:ok", _valid_mammal_data(), "test")
    for role in REQUIRED_MODIFIER_ROLES:
        assert role in species.modifier_roles


# ---------------------------------------------------------------------------
# Schema validation — render_template
# ---------------------------------------------------------------------------

def test_render_template_valid_placeholders(caplog):
    """Placeholders referencing anatomy_map or visual_trait keys are fine."""
    data = _valid_mammal_data()
    data["render_template"] = "{build}[, {stance}][, {limbs}]"
    species = make_species("species:ok", data, "test")
    assert species.render_template == "{build}[, {stance}][, {limbs}]"
    assert "unknown keys" not in caplog.text


def test_render_template_unknown_placeholder_warns(caplog):
    """Unknown placeholder keys trigger a warning but don't fail."""
    import logging
    with caplog.at_level(logging.WARNING):
        data = _valid_mammal_data()
        data["render_template"] = "{build}[, {totally_unknown}]"
        species = make_species("species:ok", data, "test")
        assert species is not None
    assert "totally_unknown" in caplog.text


# ---------------------------------------------------------------------------
# Empty word_list validation
# ---------------------------------------------------------------------------

def test_empty_word_list_raises():
    data = _valid_mammal_data()
    data["word_lists"]["vocal_pleasure"] = []
    with pytest.raises(ValueError, match="word_list 'vocal_pleasure' is empty"):
        make_species("species:bad", data, "test")


# ---------------------------------------------------------------------------
# Cephalopod-style full species
# ---------------------------------------------------------------------------

def test_cephalopod_style_species_loads():
    """Full cephalopod-style species with custom modifier_roles + render_template."""
    data = {
        "label": "Cephalopod",
        "category": "mollusk",
        "anatomy_map": {
            "limbs": "tentacles",
            "grip": "suckers",
            "stance": "upright on two rear tentacles",
            "feet": "walking tentacles",
            "forelimbs": "manipulation tentacles",
            "mantle": "smooth cephalopod mantle",
            "skin_display": "chromatophore patterns",
        },
        "movement_verbs": ["walks deliberately"],
        "pronoun_set": {"subject": "it", "object": "it", "possessive": "its"},
        "visual_priority": ["stance", "mantle", "build"],
        "render_template": "{build}[, {stance}][, {mantle}]",
        "modifier_roles": {
            "pleasure_expression": "chromatophore_mood",
            "pain_expression": "tentacle_motion",
            "surprise_expression": "vocal_surprise",
            "effort_expression": "vocal_effort",
            "breath_pattern": "breath",
            "body_posture": "tentacle_motion",
            "tension_indicator": "sucker_state",
        },
        "word_lists": {
            "chromatophore_mood": ["steady dark blue-grey", "flaring bright"],
            "tentacle_motion": ["still and coiled", "thrashing"],
            "sucker_state": ["relaxed", "clamped"],
            "vocal_surprise": ["jets backward", "flashes chromatophores"],
            "vocal_effort": ["darkens", "strains dark"],
            "breath": ["slow siphon pulse", "siphon flaring"],
        },
    }
    species = make_species("species:cephalopod", data, "test")
    assert species.visual_priority == ["stance", "mantle", "build"]
    assert species.render_template == "{build}[, {stance}][, {mantle}]"
    assert "skin_display" in species.modifiers
    assert species.modifier_roles["pleasure_expression"] == "chromatophore_mood"
    assert species.modifier_roles["body_posture"] == "tentacle_motion"
