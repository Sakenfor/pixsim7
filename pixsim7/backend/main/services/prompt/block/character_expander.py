"""Character Binding Expander

Resolves {{role}} and {{role.attr}} placeholders in block text using
Character entities + species vocabulary definitions.

Does NOT collide with existing {{character:id}} syntax (colon prevents match).
"""
import re
from random import Random
from typing import Any, Dict, List, Optional

from pixsim7.backend.main.domain.game.entities.character import Character

_PLACEHOLDER_RE = re.compile(
    r"\{\{([a-zA-Z_][a-zA-Z0-9_]*)(?:\.([a-zA-Z_][a-zA-Z0-9_.]*))?\}\}"
)


class CharacterBindingExpander:
    """Expands {{role}} / {{role.attr}} placeholders in prompt text.

    Supported expansions:
      {{role}}                -> character display_name or name
      {{role.name}}           -> character.name
      {{role.limbs}}          -> species anatomy_map["limbs"]
      {{role.stance}}         -> species anatomy_map["stance"] or default_stance
      {{role.movement}}       -> random choice from movement_verbs
      {{role.pronoun}}        -> pronoun_set["subject"]
      {{role.pronoun.subject}}   -> pronoun_set["subject"]
      {{role.pronoun.object}}    -> pronoun_set["object"]
      {{role.pronoun.possessive}} -> pronoun_set["possessive"]
      Any anatomy_map key     -> direct lookup
    """

    def __init__(self, character_loader):
        """
        Args:
            character_loader: async callable(character_id: str) -> Optional[Character]
        """
        self._load_character = character_loader
        self._cache: Dict[str, Optional[Character]] = {}

    async def _get_character(self, character_id: str) -> Optional[Character]:
        if character_id not in self._cache:
            self._cache[character_id] = await self._load_character(character_id)
        return self._cache[character_id]

    async def expand(
        self,
        text: str,
        bindings: Dict[str, Any],
        rng: Optional[Random] = None,
    ) -> Dict[str, Any]:
        """Expand placeholders in text using character bindings.

        Args:
            text: Prompt text with {{role}} / {{role.attr}} placeholders.
            bindings: Mapping of role -> {"character_id": str}.
            rng: Seeded Random instance for deterministic movement verb picks.

        Returns:
            Dict with keys:
              expanded_text: str
              characters_resolved: Dict[str, str]  (role -> display_name)
              unresolved_roles: List[str]
              expansion_errors: List[str]
        """
        if rng is None:
            rng = Random()

        characters_resolved: Dict[str, str] = {}
        unresolved_roles: List[str] = []
        expansion_errors: List[str] = []

        # Pre-resolve characters for all bound roles
        role_characters: Dict[str, Character] = {}
        role_species: Dict[str, Any] = {}

        for role, binding in bindings.items():
            if not isinstance(binding, dict):
                expansion_errors.append(f"Invalid binding for role '{role}': expected dict")
                continue

            char_id = binding.get("character_id")
            if not char_id:
                expansion_errors.append(f"Missing character_id for role '{role}'")
                continue

            character = await self._get_character(char_id)
            if not character:
                expansion_errors.append(f"Character '{char_id}' not found for role '{role}'")
                unresolved_roles.append(role)
                continue

            role_characters[role] = character
            characters_resolved[role] = character.display_name or character.name or char_id

            # Resolve species vocab
            if character.species:
                from pixsim7.backend.main.shared.ontology.vocabularies.registry import get_registry
                species_id = character.species
                if not species_id.startswith("species:"):
                    species_id = f"species:{species_id}"
                species_def = get_registry().get_species(species_id)
                if species_def:
                    role_species[role] = species_def

        def _replace_match(match: re.Match) -> str:
            role = match.group(1)
            attr_path = match.group(2)

            if role not in role_characters:
                if role not in [r for r in bindings]:
                    # Not a bound role — leave placeholder as-is
                    return match.group(0)
                # Bound but unresolved
                return match.group(0)

            character = role_characters[role]
            species = role_species.get(role)

            # {{role}} -> display name
            if attr_path is None:
                return character.display_name or character.name or role

            # {{role.name}}
            if attr_path == "name":
                return character.name or role

            # {{role.movement}} -> random verb
            if attr_path == "movement":
                if species and species.movement_verbs:
                    return rng.choice(species.movement_verbs)
                return "moves"

            # {{role.pronoun}} -> subject pronoun
            if attr_path == "pronoun":
                if species and species.pronoun_set:
                    return species.pronoun_set.get("subject", "they")
                return "they"

            # {{role.pronoun.X}}
            if attr_path.startswith("pronoun."):
                pronoun_key = attr_path.split(".", 1)[1]
                if species and species.pronoun_set:
                    val = species.pronoun_set.get(pronoun_key)
                    if val:
                        return val
                # Fallback defaults
                defaults = {"subject": "they", "object": "them", "possessive": "their"}
                return defaults.get(pronoun_key, "they")

            # {{role.stance}} -> anatomy_map["stance"] or default_stance
            if attr_path == "stance":
                if species:
                    stance = species.anatomy_map.get("stance") or species.default_stance
                    if stance:
                        return stance
                return "standing"

            # Check anatomy_map for the attr
            if species and attr_path in species.anatomy_map:
                return species.anatomy_map[attr_path]

            # Check character visual_traits as fallback
            if character.visual_traits and attr_path in character.visual_traits:
                val = character.visual_traits[attr_path]
                return str(val) if val is not None else match.group(0)

            expansion_errors.append(
                f"Unknown attribute '{attr_path}' for role '{role}'"
            )
            return match.group(0)

        expanded_text = _PLACEHOLDER_RE.sub(_replace_match, text)

        return {
            "expanded_text": expanded_text,
            "characters_resolved": characters_resolved,
            "unresolved_roles": unresolved_roles,
            "expansion_errors": expansion_errors,
        }
