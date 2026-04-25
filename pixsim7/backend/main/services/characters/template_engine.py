"""Character Template Engine - Expands {{character:id}} references in prompts

Handles template expansion for character references, allowing prompts to be
written as templates and dynamically expanded with character details.

Example:
    Template: "{{character:gorilla_01}} approaches {{character:sarah}}"
    Expanded: "Koba the gorilla—tribal, muscular, towering—approaches Sarah the dancer..."
"""
import re
from typing import Dict, Any, Optional, Set
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.game.entities import Character
from pixsim7.backend.main.services.characters.character import CharacterService
from pixsim7.backend.main.shared.ontology.vocabularies import (
    get_registry,
    normalize_species_id,
)
from pixsim7.backend.main.shared.ontology.vocabularies.types import SpeciesDef


class CharacterTemplateEngine:
    """Engine for expanding character template references"""

    # Pattern to match {{character:character_id}} or {{character:character_id:detail}}
    TEMPLATE_PATTERN = re.compile(r'\{\{character:([a-zA-Z0-9_-]+)(?::([a-zA-Z0-9_-]+))?\}\}')
    _DEFAULT_VISUAL_PRIORITY = ["build", "height", "skin_fur", "eyes", "distinguishing_marks"]
    _RENDER_TEMPLATE_PLACEHOLDER = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")
    _RENDER_TEMPLATE_OPTIONAL = re.compile(r"\[([^\[\]]+)\]")

    def __init__(self, db: AsyncSession):
        self.db = db
        self.service = CharacterService(db)

    async def expand_prompt(
        self,
        prompt_text: str,
        track_usage: bool = True,
        prompt_version_id: Optional[UUID] = None
    ) -> Dict[str, Any]:
        """Expand all character references in a prompt

        Args:
            prompt_text: Prompt with {{character:id}} references
            track_usage: Track character usage
            prompt_version_id: Link usage to prompt version

        Returns:
            {
                "expanded_text": "...",
                "characters_used": [...],
                "template_references": {...}
            }
        """
        # Find all character references
        matches = self.TEMPLATE_PATTERN.finditer(prompt_text)
        references = {}
        characters_used = []

        # Build replacement map
        for match in matches:
            character_id = match.group(1)
            detail_key = match.group(2)  # Optional detail specifier
            template_ref = match.group(0)

            # Skip if already processed
            if template_ref in references:
                continue

            # Get character
            character = await self.service.get_character_by_id(character_id)
            if not character:
                references[template_ref] = f"[UNKNOWN_CHARACTER:{character_id}]"
                continue

            # Expand to text
            expanded = self._expand_character(character, detail_key)
            references[template_ref] = expanded
            characters_used.append(character)

            # Track usage
            if track_usage:
                await self.service.track_usage(
                    character_id=character_id,
                    usage_type="prompt",
                    prompt_version_id=prompt_version_id,
                    template_reference=template_ref
                )

        # Replace all references
        expanded_text = prompt_text
        for template_ref, replacement in references.items():
            expanded_text = expanded_text.replace(template_ref, replacement)

        return {
            "expanded_text": expanded_text,
            "characters_used": [
                {
                    "id": str(c.id),
                    "character_id": c.character_id,
                    "name": c.name,
                    "display_name": c.display_name
                }
                for c in characters_used
            ],
            "template_references": references,
            "has_unknowns": any("[UNKNOWN_CHARACTER:" in v for v in references.values())
        }

    def _expand_character(
        self,
        character: Character,
        detail_key: Optional[str] = None
    ) -> str:
        """Expand a character to text

        Args:
            character: Character to expand
            detail_key: Optional specific detail to extract
                - "name": Just the name
                - "visual": Just visual traits
                - "full": Full description (default)

        Returns:
            Expanded text
        """
        if detail_key == "name":
            return character.name or character.character_id

        if detail_key == "visual":
            return self._build_visual_description(character)

        # Default: full expansion
        parts = []

        # Start with display name or name
        if character.display_name:
            parts.append(character.display_name)
        elif character.name and character.species:
            parts.append(f"{character.name} the {character.species}")
        elif character.name:
            parts.append(character.name)
        elif character.species:
            parts.append(f"the {character.species}")

        # Add visual traits
        visual_desc = self._build_visual_description(character)
        if visual_desc:
            if parts:
                parts.append("—" + visual_desc)
            else:
                parts.append(visual_desc)

        return "".join(parts) if parts else character.character_id

    def _build_visual_description(self, character: Character) -> str:
        """Build visual description from visual_traits"""
        traits = character.visual_traits if isinstance(character.visual_traits, dict) else {}
        species = self._get_species_definition(character)
        if not traits and not species:
            return ""

        if species and species.render_template:
            rendered = self._render_species_template(species.render_template, traits, species)
            if rendered:
                return rendered

        priority_keys = (
            list(species.visual_priority)
            if species and species.visual_priority
            else list(self._DEFAULT_VISUAL_PRIORITY)
        )
        parts = []
        seen_keys = set()

        for key in priority_keys:
            seen_keys.add(key)
            parts.extend(self._flatten_trait_value(self._resolve_visual_trait_value(key, traits, species)))

        # Add any other traits not in priority list
        for key, value in traits.items():
            if key in seen_keys:
                continue
            parts.extend(self._flatten_trait_value(value))

        return ", ".join(str(p) for p in parts if p)

    def _get_species_definition(self, character: Character) -> Optional[SpeciesDef]:
        species_id = normalize_species_id(character.species)
        if not species_id:
            return None
        return get_registry().get_species(species_id)

    def _resolve_visual_trait_value(
        self,
        key: str,
        traits: Dict[str, Any],
        species: Optional[SpeciesDef],
    ) -> Any:
        value, _ = self._resolve_visual_trait_value_sourced(key, traits, species)
        return value

    def _resolve_visual_trait_value_sourced(
        self,
        key: str,
        traits: Dict[str, Any],
        species: Optional[SpeciesDef],
    ) -> tuple[Any, Optional[str]]:
        """Resolve a visual trait value and return (value, source).

        Source is one of: "visual_trait", "species_anatomy", "species_default", or None.
        """
        if key in traits:
            return traits.get(key), "visual_trait"

        if not species:
            return None, None

        if key == "stance":
            if species.anatomy_map.get("stance"):
                return species.anatomy_map.get("stance"), "species_anatomy"
            return species.default_stance, "species_default"

        if key in species.anatomy_map:
            return species.anatomy_map.get(key), "species_anatomy"

        if key == "movement" and species.movement_verbs:
            return species.movement_verbs[0], "species_default"

        if key.startswith("pronoun."):
            pronoun_key = key.split(".", 1)[1]
            return species.pronoun_set.get(pronoun_key), "species_default"
        if key == "pronoun":
            return species.pronoun_set.get("subject"), "species_default"

        return None, None

    def _flatten_trait_value(self, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, (list, tuple, set)):
            out = []
            for item in value:
                text = str(item).strip()
                if text:
                    out.append(text)
            return out
        text = str(value).strip()
        return [text] if text else []

    def _stringify_trait_value(self, value: Any) -> str:
        values = self._flatten_trait_value(value)
        return ", ".join(values)

    def _render_species_template(
        self,
        template: str,
        traits: Dict[str, Any],
        species: SpeciesDef,
    ) -> str:
        source = str(template or "").strip()
        if not source:
            return ""

        def render_segment(segment: str, *, drop_if_empty: bool) -> str:
            had_value = False

            def replace_placeholder(match: re.Match) -> str:
                nonlocal had_value
                key = match.group(1)
                rendered = self._stringify_trait_value(
                    self._resolve_visual_trait_value(key, traits, species)
                )
                if rendered:
                    had_value = True
                return rendered

            rendered_segment = self._RENDER_TEMPLATE_PLACEHOLDER.sub(
                replace_placeholder,
                segment,
            )
            if drop_if_empty and not had_value:
                return ""
            return rendered_segment

        rendered = source
        previous = None
        while rendered != previous:
            previous = rendered
            rendered = self._RENDER_TEMPLATE_OPTIONAL.sub(
                lambda m: render_segment(m.group(1), drop_if_empty=True),
                rendered,
            )

        rendered = render_segment(rendered, drop_if_empty=False)
        return self._cleanup_rendered_text(rendered)

    def _cleanup_rendered_text(self, text: str) -> str:
        cleaned = re.sub(r"\s+", " ", text).strip()
        cleaned = re.sub(r"\s+([,;:.!?])", r"\1", cleaned)
        cleaned = re.sub(r"([,;:])(?!\s|$)", r"\1 ", cleaned)
        cleaned = re.sub(r"(,\s*){2,}", ", ", cleaned)
        cleaned = re.sub(r"\(\s*\)", "", cleaned)
        cleaned = re.sub(r"\[\s*\]", "", cleaned)
        cleaned = re.sub(r"\s{2,}", " ", cleaned)
        cleaned = cleaned.strip(" ,;:-")
        return cleaned

    async def resolve_character_template(
        self,
        character_id: str,
        template_source: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Resolve a character's template into expanded prose with field source map.

        Args:
            character_id: Character to resolve
            template_source: Optional template override. If not provided, uses
                the character's species render_template.

        Returns:
            {
                "expanded_text": "sleek octopod detective, waist-high mantle, ...",
                "template_source": "{build}[, {height}]...",
                "field_map": [
                    {"key": "build", "value": "sleek octopod detective", "source": "visual_trait"},
                    {"key": "height", "value": "waist-high mantle", "source": "visual_trait"},
                    {"key": "stance", "value": "upright on two rear tentacles", "source": "species_anatomy"},
                    ...
                ],
                "character": {"character_id": "...", "name": "...", "display_name": "..."},
                "species": "cephalopod",
                "full_expansion": "Neris the Octopod Detective—sleek octopod detective, ..."
            }
        """
        character = await self.service.get_character_by_id(character_id)
        if not character:
            return {"error": f"Character '{character_id}' not found"}

        traits = character.visual_traits if isinstance(character.visual_traits, dict) else {}
        species = self._get_species_definition(character)

        # Determine template source
        effective_template = template_source
        if not effective_template and species and species.render_template:
            effective_template = species.render_template

        # Build field map by resolving each placeholder
        field_map: list[Dict[str, Any]] = []
        if effective_template:
            for match in self._RENDER_TEMPLATE_PLACEHOLDER.finditer(effective_template):
                key = match.group(1)
                # Skip duplicates (same key appears multiple times in template)
                if any(f["key"] == key for f in field_map):
                    continue
                value, source = self._resolve_visual_trait_value_sourced(key, traits, species)
                rendered = self._stringify_trait_value(value)
                field_map.append({
                    "key": key,
                    "value": rendered if rendered else None,
                    "source": source,
                })
        else:
            # No template — use priority-based fallback, still track sources
            priority_keys = (
                list(species.visual_priority)
                if species and species.visual_priority
                else list(self._DEFAULT_VISUAL_PRIORITY)
            )
            seen = set()
            for key in priority_keys:
                seen.add(key)
                value, source = self._resolve_visual_trait_value_sourced(key, traits, species)
                rendered = self._stringify_trait_value(value)
                if rendered:
                    field_map.append({"key": key, "value": rendered, "source": source})
            for key in traits:
                if key not in seen:
                    field_map.append({"key": key, "value": self._stringify_trait_value(traits[key]), "source": "visual_trait"})

        # Expanded prose
        expanded_text = self._build_visual_description(character)
        full_expansion = self._expand_character(character)

        # Build available_keys: all keys from species with defaults + origin
        available_keys = self._build_available_keys(effective_template, species)

        return {
            "expanded_text": expanded_text,
            "template_source": effective_template or None,
            "field_map": field_map,
            "available_keys": available_keys,
            "character": {
                "character_id": character.character_id,
                "name": character.name,
                "display_name": character.display_name,
            },
            "species": character.species,
            "full_expansion": full_expansion,
        }

    def _build_available_keys(
        self,
        template: Optional[str],
        species: Optional[SpeciesDef],
    ) -> list[Dict[str, Any]]:
        """Build list of available visual trait keys with defaults from species.

        Each entry: {"key": str, "default": str|None, "origin": "template"|"anatomy"|"priority"|"common"}
        """
        keys: dict[str, Dict[str, Any]] = {}

        # 1. Keys from render_template placeholders (highest priority)
        if template:
            for match in self._RENDER_TEMPLATE_PLACEHOLDER.finditer(template):
                key = match.group(1)
                if key not in keys:
                    default = None
                    if species and key in species.anatomy_map:
                        default = species.anatomy_map[key]
                    elif species and key == "stance":
                        default = species.anatomy_map.get("stance") or species.default_stance
                    keys[key] = {"key": key, "default": default, "origin": "template"}

        # 2. Keys from anatomy_map (skip explicitly empty values like tail:"")
        if species:
            for key, default in species.anatomy_map.items():
                if key not in keys and default:
                    keys[key] = {"key": key, "default": default, "origin": "anatomy"}

        # 3. Keys from visual_priority
        if species and species.visual_priority:
            for key in species.visual_priority:
                if key not in keys:
                    default = species.anatomy_map.get(key)
                    keys[key] = {"key": key, "default": default, "origin": "priority"}

        # 4. Common defaults if no species
        if not species:
            for key in self._DEFAULT_VISUAL_PRIORITY:
                if key not in keys:
                    keys[key] = {"key": key, "default": None, "origin": "common"}

        return list(keys.values())

    async def find_character_references(
        self,
        prompt_text: str
    ) -> Set[str]:
        """Find all character references in a prompt without expanding

        Args:
            prompt_text: Text to scan

        Returns:
            Set of character_ids referenced
        """
        matches = self.TEMPLATE_PATTERN.finditer(prompt_text)
        return {match.group(1) for match in matches}

    async def validate_character_references(
        self,
        prompt_text: str
    ) -> Dict[str, Any]:
        """Validate that all character references exist

        Args:
            prompt_text: Text to validate

        Returns:
            {
                "valid": bool,
                "missing_characters": [...],
                "found_characters": [...]
            }
        """
        character_ids = await self.find_character_references(prompt_text)
        missing = []
        found = []

        for char_id in character_ids:
            character = await self.service.get_character_by_id(char_id)
            if character:
                found.append(char_id)
            else:
                missing.append(char_id)

        return {
            "valid": len(missing) == 0,
            "missing_characters": missing,
            "found_characters": found
        }

    async def expand_action_block_prompt(
        self,
        block_prompt: str,
        track_usage: bool = True,
        action_block_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Expand character references in an action block

        Args:
            block_prompt: Action block prompt text
            track_usage: Track character usage
            action_block_id: Link usage to action block

        Returns:
            Same format as expand_prompt
        """
        matches = self.TEMPLATE_PATTERN.finditer(block_prompt)
        references = {}
        characters_used = []

        for match in matches:
            character_id = match.group(1)
            detail_key = match.group(2)
            template_ref = match.group(0)

            if template_ref in references:
                continue

            character = await self.service.get_character_by_id(character_id)
            if not character:
                references[template_ref] = f"[UNKNOWN_CHARACTER:{character_id}]"
                continue

            expanded = self._expand_character(character, detail_key)
            references[template_ref] = expanded
            characters_used.append(character)

            if track_usage:
                await self.service.track_usage(
                    character_id=character_id,
                    usage_type="action_block",
                    action_block_id=action_block_id,
                    template_reference=template_ref
                )

        expanded_text = block_prompt
        for template_ref, replacement in references.items():
            expanded_text = expanded_text.replace(template_ref, replacement)

        return {
            "expanded_text": expanded_text,
            "characters_used": [
                {
                    "id": str(c.id),
                    "character_id": c.character_id,
                    "name": c.name,
                    "display_name": c.display_name
                }
                for c in characters_used
            ],
            "template_references": references,
            "has_unknowns": any("[UNKNOWN_CHARACTER:" in v for v in references.values())
        }

    def create_character_template(
        self,
        character: Character,
        detail_level: str = "full"
    ) -> str:
        """Generate template reference for a character

        Args:
            character: Character to create template for
            detail_level: "name", "visual", or "full"

        Returns:
            Template string like "{{character:gorilla_01}}"
        """
        if detail_level == "full" or detail_level is None:
            return f"{{{{character:{character.character_id}}}}}"
        else:
            return f"{{{{character:{character.character_id}:{detail_level}}}}}"

    async def bulk_expand(
        self,
        prompts: Dict[str, str],
        track_usage: bool = False
    ) -> Dict[str, Dict[str, Any]]:
        """Expand multiple prompts at once

        Args:
            prompts: Dict of {prompt_id: prompt_text}
            track_usage: Track character usage

        Returns:
            Dict of {prompt_id: expansion_result}
        """
        results = {}

        for prompt_id, prompt_text in prompts.items():
            results[prompt_id] = await self.expand_prompt(
                prompt_text=prompt_text,
                track_usage=track_usage
            )

        return results
