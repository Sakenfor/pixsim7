"""Tests for the prompt facet registry (user-pref class-wide facets)."""
import pytest

from pixsim7.backend.main.services.prompt import facet_registry as fr


def test_add_and_read_normalizes_uppercase():
    prefs = fr.add_prompt_facet({}, "actor", "methods")
    assert prefs == {"prompt_facets": {"ACTOR": ["METHODS"]}}
    assert fr.read_prompt_facets(prefs) == {"ACTOR": ["METHODS"]}
    assert fr.facet_is_registered(prefs, "ACTOR", "methods")


def test_add_dedupes_and_sorts():
    prefs = {}
    prefs = fr.add_prompt_facet(prefs, "ACTOR", "STANCE")
    prefs = fr.add_prompt_facet(prefs, "ACTOR", "METHODS")
    prefs = fr.add_prompt_facet(prefs, "ACTOR", "METHODS")  # dup
    assert fr.read_prompt_facets(prefs) == {"ACTOR": ["METHODS", "STANCE"]}


def test_remove_drops_token_and_empty_class():
    prefs = fr.add_prompt_facet({}, "ACTOR", "METHODS")
    prefs = fr.remove_prompt_facet(prefs, "ACTOR", "METHODS")
    # class with no tokens is dropped entirely
    assert fr.read_prompt_facets(prefs) == {}
    assert "prompt_facets" not in prefs


def test_canonicalize_skips_malformed_entries():
    raw = {
        "ACTOR": ["METHODS", "bad token!", 5],
        "lower bad": ["X"],
        "SCENE": "notalist",
        "GOAL": ["TWIST"],
    }
    assert fr.canonicalize_prompt_facets(raw) == {"ACTOR": ["METHODS"], "GOAL": ["TWIST"]}


def test_normalize_rejects_bad_tokens():
    with pytest.raises(ValueError):
        fr.normalize_facet_token("has space")
    with pytest.raises(ValueError):
        fr.normalize_facet_class_name("")
