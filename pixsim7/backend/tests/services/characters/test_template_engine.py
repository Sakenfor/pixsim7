from __future__ import annotations

from random import Random

import pytest

from pixsim7.backend.main.domain.game.entities.character import Character
from pixsim7.backend.main.services.characters.template_engine import CharacterTemplateEngine
from pixsim7.backend.main.services.prompt.block.character_expander import CharacterBindingExpander
from pixsim7.backend.main.shared.ontology.vocabularies import get_registry
from pixsim7.backend.main.shared.ontology.vocabularies.registry import reset_registry


@pytest.fixture(autouse=True)
def _reset_vocab_registry():
    reset_registry()
    yield
    reset_registry()


def _make_character(**kwargs) -> Character:
    payload = {
        "character_id": "char_test",
        "category": "creature",
        "name": "Test Character",
        "species": "human",
        "visual_traits": {},
    }
    payload.update(kwargs)
    return Character(**payload)


class _FakeCharacterService:
    def __init__(self, characters: dict[str, Character]):
        self._characters = characters
        self.usage_events: list[dict] = []

    async def get_character_by_id(self, character_id: str):
        return self._characters.get(character_id)

    async def track_usage(self, **kwargs):
        self.usage_events.append(kwargs)


def test_build_visual_description_humanoid_output_parity():
    engine = CharacterTemplateEngine(db=None)
    character = _make_character(
        species="human",
        visual_traits={
            "build": "lean",
            "height": "tall",
            "skin_fur": "tan skin",
            "eyes": "amber eyes",
            "distinguishing_marks": "scar on cheek",
            "clothing": "old jacket",
        },
    )

    result = engine._build_visual_description(character)

    assert result == "lean, tall, tan skin, amber eyes, scar on cheek, old jacket"


def test_build_visual_description_cephalopod_visual_priority_ordering(monkeypatch: pytest.MonkeyPatch):
    engine = CharacterTemplateEngine(db=None)
    species = get_registry().get_species("species:cephalopod")
    assert species is not None
    monkeypatch.setattr(species, "render_template", "")

    character = _make_character(
        species="cephalopod",
        visual_traits={
            "build": "sleek octopod detective",
            "distinguishing_marks": "brass monocle",
            "clothing": "tailored coat",
        },
    )

    result = engine._build_visual_description(character)

    assert result == (
        "upright on two rear tentacles, smooth cephalopod mantle, "
        "chromatophore patterns, large horizontally-pupiled eyes, "
        "sleek octopod detective, brass monocle, tailored coat"
    )


def test_build_visual_description_cephalopod_render_template_missing_keys():
    engine = CharacterTemplateEngine(db=None)
    character = _make_character(
        species="cephalopod",
        visual_traits={
            "build": "sleek octopod detective",
            "height": "waist-high mantle",
            "distinguishing_marks": "brass monocle",
        },
    )

    result = engine._build_visual_description(character)

    assert result == (
        "sleek octopod detective, waist-high mantle, upright on two rear tentacles, "
        "smooth cephalopod mantle, chromatophore patterns, large horizontally-pupiled eyes, brass monocle"
    )


def test_build_visual_description_cephalopod_render_template_empty_values_cleanup():
    engine = CharacterTemplateEngine(db=None)
    character = _make_character(
        species="cephalopod",
        visual_traits={
            "build": "sleek octopod detective",
            "height": "",
            "clothing": " ",
            "accessories": [],
        },
    )

    result = engine._build_visual_description(character)

    assert "wearing" not in result
    assert "with " not in result
    assert ", ," not in result
    assert not result.endswith(",")
    assert result == (
        "sleek octopod detective, upright on two rear tentacles, smooth cephalopod mantle, "
        "chromatophore patterns, large horizontally-pupiled eyes"
    )


@pytest.mark.asyncio
async def test_octopod_detective_end_to_end_template_and_role_binding_expansion():
    character = _make_character(
        character_id="octopod_detective",
        category="creature",
        name="Neris",
        display_name="Neris the Octopod Detective",
        species="cephalopod",
        visual_traits={
            "build": "sleek octopod detective",
            "height": "waist-high mantle",
            "distinguishing_marks": "brass monocle",
            "clothing": "tailored coat",
            "accessories": "clockwork satchel",
        },
    )

    # Prompt-family style template expansion via {{character:id}} references.
    engine = CharacterTemplateEngine(db=None)
    fake_service = _FakeCharacterService({character.character_id: character})
    engine.service = fake_service
    prompt_template = (
        "Family opener: {{character:octopod_detective}}. "
        "Visual beat: {{character:octopod_detective:visual}}."
    )

    expanded_prompt = await engine.expand_prompt(prompt_template, track_usage=True)
    expanded_text = expanded_prompt["expanded_text"]

    assert "Neris the Octopod Detective" in expanded_text
    assert "sleek octopod detective" in expanded_text
    assert "upright on two rear tentacles" in expanded_text
    assert "smooth cephalopod mantle" in expanded_text
    assert "brass monocle" in expanded_text
    assert "tailored coat" in expanded_text
    assert expanded_prompt["has_unknowns"] is False
    assert fake_service.usage_events
    assert all(event["character_id"] == "octopod_detective" for event in fake_service.usage_events)

    # Role-binding expansion via {{role.attr}} placeholders using species vocab.
    async def _load_character(character_id: str):
        return character if character_id == "octopod_detective" else None

    role_expander = CharacterBindingExpander(character_loader=_load_character)
    role_template = (
        "{{detective}} moves with {{detective.movement}} while {{detective.limbs}} "
        "anchor {{detective.pronoun.possessive}} coat."
    )
    role_result = await role_expander.expand(
        role_template,
        {"detective": {"character_id": "octopod_detective"}},
        rng=Random(7),
        intensity=7,
    )
    role_text = role_result["expanded_text"]

    assert "Neris the Octopod Detective" in role_text
    assert "tentacles" in role_text
    assert "its coat" in role_text
    assert any(
        movement in role_text
        for movement in [
            "grips forward",
            "walks deliberately",
            "shuffles",
            "picks its way",
            "navigates",
            "plants tentacles",
        ]
    )
    assert "{{" not in role_text and "}}" not in role_text
    assert role_result["expansion_errors"] == []
    assert role_result["unresolved_roles"] == []
