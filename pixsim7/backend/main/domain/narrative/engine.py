"""
Main narrative engine for executing prompt programs.
"""

import json
import re
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

from .context import (
    NarrativeContext,
    NPCContext,
    WorldContext,
    SessionContext,
    RelationshipContext,
    LocationContext,
    SceneContext
)
from .programs import PromptProgram, ConditionExpression
from .relationships import merge_npc_persona
from pixsim7.backend.main.domain.stats import StatEngine
from pixsim7.backend.main.domain.stats.migration import (
    migrate_world_meta_to_stats_config,
    needs_migration as needs_world_migration,
    get_default_relationship_definition,
)


class NarrativeEngine:
    """
    The main narrative engine that executes prompt programs to generate
    contextual dialogue and visual prompts.
    """

    def __init__(self, programs_dir: Optional[Path] = None):
        """
        Initialize the narrative engine.

        Args:
            programs_dir: Directory containing prompt program JSON files
        """
        self.programs_dir = programs_dir
        self._programs_cache: Dict[str, PromptProgram] = {}
        self._stage_outputs: Dict[str, str] = {}  # For debugging

    def build_dialogue_request(
        self,
        context: NarrativeContext,
        program_id: str = "default_dialogue"
    ) -> Dict[str, Any]:
        """
        Main entry point: build a dialogue request from context.

        Args:
            context: Complete narrative context
            program_id: ID of the prompt program to execute

        Returns:
            Dictionary with:
            - llm_prompt: The generated prompt for the LLM
            - visual_prompt: Optional visual generation prompt
            - metadata: Additional metadata (intents, expression hints, etc.)
        """
        # Load the program
        program = self._load_program(program_id)

        # Prepare template variables
        vars = context.to_template_vars()

        # Execute the program
        llm_prompt, metadata = self._execute_program(program, vars)

        # Extract visual prompt if present
        visual_prompt = metadata.pop("visual_prompt", None)

        return {
            "llm_prompt": llm_prompt,
            "visual_prompt": visual_prompt,
            "metadata": metadata
        }

    def build_context(
        self,
        world_id: int,
        session_id: int,
        npc_id: int,
        world_data: Dict[str, Any],
        session_data: Dict[str, Any],
        npc_data: Dict[str, Any],
        location_data: Optional[Dict[str, Any]] = None,
        scene_data: Optional[Dict[str, Any]] = None,
        player_input: Optional[str] = None
    ) -> NarrativeContext:
        """
        Build a complete narrative context from raw data.

        This is a convenience method that constructs the context object
        from database models and other sources.
        """
        # Extract world info
        world_meta = world_data.get("meta", {})
        relationship_schemas = world_meta.get("relationship_schemas", {})
        intimacy_schema = world_meta.get("intimacy_schema")
        npc_overrides = world_meta.get("npc_overrides", {}).get(str(npc_id), {})

        # Merge NPC persona
        base_personality = npc_data.get("personality", {})
        effective_persona = merge_npc_persona(base_personality, npc_overrides)

        # Get relationship data directly from stats
        relationships_data = session_data.get("relationships", {})
        npc_key = f"npc:{npc_id}"
        rel_data = relationships_data.get(npc_key, {})

        affinity = rel_data.get("affinity", 0)
        trust = rel_data.get("trust", 0)
        chemistry = rel_data.get("chemistry", 0)
        tension = rel_data.get("tension", 0)
        rel_flags = rel_data.get("flags", {})

        # Get or migrate stats config
        if needs_world_migration(world_meta):
            stats_config = migrate_world_meta_to_stats_config(world_meta)
        elif 'stats_config' in world_meta:
            from pixsim7.backend.main.domain.stats import WorldStatsConfig
            stats_config = WorldStatsConfig.model_validate(world_meta['stats_config'])
        else:
            from pixsim7.backend.main.domain.stats import WorldStatsConfig
            stats_config = WorldStatsConfig(
                version=1,
                definitions={"relationships": get_default_relationship_definition()}
            )

        # Get relationship definition
        relationship_definition = stats_config.definitions.get("relationships")
        if not relationship_definition:
            relationship_definition = get_default_relationship_definition()

        # Compute tier and intimacy using StatEngine
        relationship_tier = StatEngine.compute_tier(
            "affinity",
            affinity,
            relationship_definition.tiers
        )

        relationship_values = {
            "affinity": affinity,
            "trust": trust,
            "chemistry": chemistry,
            "tension": tension
        }
        intimacy_level = StatEngine.compute_level(
            relationship_values,
            relationship_definition.levels
        )

        # Build context objects
        npc_context = NPCContext(
            id=npc_id,
            name=npc_overrides.get("nameOverride", npc_data.get("name", "Unknown")),
            personality=effective_persona,
            home_location_id=npc_data.get("home_location_id")
        )

        world_context = WorldContext(
            world_id=world_id,
            world_name=world_data.get("name", "Unknown World"),
            world_meta=world_meta,
            relationship_schemas=relationship_schemas,
            intimacy_schema=intimacy_schema,
            npc_overrides=npc_overrides
        )

        # Extract arc state from flags
        session_flags = session_data.get("flags", {})
        arcs = session_flags.get("arcs", {})

        session_context = SessionContext(
            id=session_id,
            world_time=session_data.get("world_time", 0.0),
            flags=session_flags,
            arcs=arcs
        )

        relationship_context = RelationshipContext(
            affinity=affinity,
            trust=trust,
            chemistry=chemistry,
            tension=tension,
            flags=rel_flags,
            relationship_tier=relationship_tier,
            intimacy_level=intimacy_level
        )

        # Optional location context
        location_context = None
        if location_data:
            location_context = LocationContext(
                id=location_data["id"],
                name=location_data.get("name", "Unknown Location"),
                meta=location_data.get("meta", {})
            )

        # Optional scene context
        scene_context = None
        if scene_data:
            scene_context = SceneContext(
                scene_id=scene_data.get("scene_id"),
                node_id=scene_data.get("node_id"),
                node_meta=scene_data.get("node_meta", {}),
                speaker_role=scene_data.get("speaker_role")
            )

        return NarrativeContext(
            npc=npc_context,
            world=world_context,
            session=session_context,
            relationship=relationship_context,
            location=location_context,
            scene=scene_context,
            player_input=player_input
        )

    def _load_program(self, program_id: str) -> PromptProgram:
        """Load a prompt program by ID."""
        # Check cache
        if program_id in self._programs_cache:
            return self._programs_cache[program_id]

        # Try to load from file
        if self.programs_dir:
            program_file = self.programs_dir / f"{program_id}.json"
            if program_file.exists():
                with open(program_file, "r") as f:
                    data = json.load(f)
                program = PromptProgram.from_json(data)
                self._programs_cache[program_id] = program
                return program

        # Fallback to hardcoded example program
        program = self._get_default_program()
        self._programs_cache[program_id] = program
        return program

    def _get_default_program(self) -> PromptProgram:
        """Get a default/example prompt program."""
        return PromptProgram.from_json({
            "id": "default_dialogue",
            "version": "1.0.0",
            "description": "Default dialogue generation program",
            "inputs": {
                "required": ["npc_id", "affinity", "trust"],
                "optional": ["chemistry", "tension", "location_id", "player_input"]
            },
            "stages": [
                {
                    "id": "base_persona",
                    "type": "template",
                    "template": "You are {{npc.name}}. {{npc.personality.traits}} {{npc.personality.background}}"
                },
                {
                    "id": "relationship_context",
                    "type": "conditional",
                    "conditions": [
                        {
                            "test": "affinity >= 80",
                            "template": "You and the player are very close, with deep mutual affection."
                        },
                        {
                            "test": "affinity >= 60",
                            "template": "You and the player are close friends who trust each other."
                        },
                        {
                            "test": "affinity >= 30",
                            "template": "You know the player and are friendly but not particularly close."
                        },
                        {
                            "test": "affinity < 30",
                            "template": "You barely know the player and should be polite but reserved."
                        }
                    ]
                },
                {
                    "id": "intimacy_modifier",
                    "type": "conditional",
                    "conditions": [
                        {
                            "test": "chemistry >= 60 && intimacy_level == 'intimate'",
                            "template": "There's romantic tension between you. Your responses may have flirtatious undertones."
                        },
                        {
                            "test": "tension >= 70",
                            "template": "You feel nervous and there are unspoken things between you."
                        }
                    ]
                },
                {
                    "id": "final_prompt",
                    "type": "formatter",
                    "formatters": [
                        {
                            "type": "combine",
                            "separator": "\n\n",
                            "sources": ["base_persona", "relationship_context", "intimacy_modifier"]
                        },
                        {
                            "type": "append",
                            "template": "\n\nPlayer says: \"{{player_input}}\"\n\nRespond as {{npc.name}} would, staying in character. Keep responses concise (2-3 sentences)."
                        }
                    ]
                }
            ]
        })

    def _execute_program(
        self,
        program: PromptProgram,
        vars: Dict[str, Any]
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Execute a prompt program and return the generated prompt and metadata.

        Returns:
            Tuple of (prompt_string, metadata_dict)
        """
        self._stage_outputs = {}  # Reset for debugging
        metadata = {}

        for stage in program.stages:
            output = self._execute_stage(stage, vars)
            if output:
                self._stage_outputs[stage.id] = output

            # Process metadata if present
            if stage.metadata:
                stage_metadata = self._process_metadata(stage.metadata, vars)
                metadata.update(stage_metadata)

        # Get the final output (usually from the last formatter stage)
        final_output = ""
        for stage in reversed(program.stages):
            if stage.id in self._stage_outputs:
                final_output = self._stage_outputs[stage.id]
                break

        return final_output, metadata

    def _execute_stage(
        self,
        stage,
        vars: Dict[str, Any]
    ) -> Optional[str]:
        """Execute a single stage of the program."""
        if stage.type == "template":
            return self._substitute_template(stage.template, vars)

        elif stage.type == "conditional":
            outputs = []
            for condition in stage.conditions or []:
                result = condition.evaluate(vars)
                if result:
                    output = self._substitute_template(result, vars)
                    outputs.append(output)
            return "\n".join(outputs) if outputs else None

        elif stage.type == "selector":
            # Try selectors in order
            for selector in stage.selectors or []:
                result = selector.evaluate(vars)
                if result:
                    return self._substitute_template(result, vars)

            # Fall back to default
            if stage.default and "template" in stage.default:
                return self._substitute_template(stage.default["template"], vars)

            return None

        elif stage.type == "formatter":
            return self._execute_formatters(stage.formatters or [], vars)

        return None

    def _execute_formatters(
        self,
        formatters: List,
        vars: Dict[str, Any]
    ) -> str:
        """Execute a list of formatter operations."""
        result = ""

        for formatter in formatters:
            if formatter.type == "combine":
                # Combine outputs from named stages
                parts = []
                for source_id in formatter.sources or []:
                    if source_id in self._stage_outputs:
                        parts.append(self._stage_outputs[source_id])
                separator = formatter.separator or "\n"
                result = separator.join(parts)

            elif formatter.type == "append":
                if formatter.template:
                    appended = self._substitute_template(formatter.template, vars)
                    result = result + appended if result else appended

            elif formatter.type == "prepend":
                if formatter.template:
                    prepended = self._substitute_template(formatter.template, vars)
                    result = prepended + result if result else prepended

        return result

    def _substitute_template(
        self,
        template: Optional[str],
        vars: Dict[str, Any]
    ) -> str:
        """Substitute variables in a template string."""
        if not template:
            return ""

        result = template

        # Find all {{variable}} patterns
        pattern = r'\{\{([^}]+)\}\}'
        matches = re.findall(pattern, template)

        for var_path in matches:
            var_path = var_path.strip()
            value = vars.get(var_path, "")

            # Convert value to string
            if isinstance(value, bool):
                str_value = "true" if value else "false"
            elif value is None:
                str_value = ""
            else:
                str_value = str(value)

            result = result.replace(f"{{{{{var_path}}}}}", str_value)

        return result

    def _process_metadata(
        self,
        metadata_config,
        vars: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Process metadata generation from stage configuration."""
        metadata = {}

        # Process suggested intents
        if metadata_config.suggested_intents:
            intents = []
            for intent_config in metadata_config.suggested_intents:
                if "condition" in intent_config:
                    expr = ConditionExpression(expression=intent_config["condition"])
                    if expr.evaluate(vars):
                        intents.extend(intent_config.get("intents", []))
                else:
                    intents.extend(intent_config.get("intents", []))
            if intents:
                metadata["suggested_intents"] = intents

        # Process visual prompt
        if metadata_config.visual_prompt:
            vp_config = metadata_config.visual_prompt
            if "condition" in vp_config:
                expr = ConditionExpression(expression=vp_config["condition"])
                if expr.evaluate(vars) and "template" in vp_config:
                    metadata["visual_prompt"] = self._substitute_template(
                        vp_config["template"], vars
                    )
            elif "template" in vp_config:
                metadata["visual_prompt"] = self._substitute_template(
                    vp_config["template"], vars
                )

        # Process expression hint
        if metadata_config.expression_hint:
            eh_config = metadata_config.expression_hint
            if "condition" in eh_config:
                expr = ConditionExpression(expression=eh_config["condition"])
                if expr.evaluate(vars) and "value" in eh_config:
                    metadata["expression_hint"] = eh_config["value"]
            elif "value" in eh_config:
                metadata["expression_hint"] = eh_config["value"]

        return metadata

    def get_debug_info(self) -> Dict[str, Any]:
        """Get debugging information from the last execution."""
        return {
            "stage_outputs": self._stage_outputs.copy()
        }