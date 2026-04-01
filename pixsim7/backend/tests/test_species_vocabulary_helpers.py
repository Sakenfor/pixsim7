from __future__ import annotations

from pixsim7.backend.main.shared.ontology.vocabularies.factories import make_species
from pixsim7.backend.main.shared.ontology.vocabularies.species import normalize_species_id


def test_normalize_species_id_handles_prefix_and_case():
    assert normalize_species_id("CePhAlOpOd") == "species:cephalopod"
    assert normalize_species_id("species:CePhAlOpOd") == "species:cephalopod"
    assert normalize_species_id("  ") is None
    assert normalize_species_id(None) is None


def test_make_species_preserves_visual_priority_and_render_template():
    species = make_species(
        id="species:cephalopod",
        source="test",
        data={
            "label": "Cephalopod",
            "category": "mollusk",
            "anatomy_map": {
                "stance": "upright on two rear tentacles",
                "mantle": "smooth cephalopod mantle",
            },
            "movement_verbs": ["walks deliberately"],
            "pronoun_set": {"subject": "it", "object": "it", "possessive": "its"},
            "visual_priority": ["stance", "mantle", "build"],
            "render_template": "{build}[, {stance}][, {mantle}]",
            "word_lists": {"skin_display": ["steady dark blue-grey"]},
        },
    )

    assert species.visual_priority == ["stance", "mantle", "build"]
    assert species.render_template == "{build}[, {stance}][, {mantle}]"
    assert "skin_display" in species.modifiers
