"""
Narrative context data structures.
"""

from typing import Dict, Any, Optional
from pydantic import BaseModel


class NPCContext(BaseModel):
    """NPC-specific context for narrative generation."""
    id: int
    name: str
    personality: Dict[str, Any] = {}
    home_location_id: Optional[int] = None


class LocationContext(BaseModel):
    """Location context for narrative generation."""
    id: int
    name: str
    meta: Dict[str, Any] = {}


class RelationshipContext(BaseModel):
    """Relationship state between NPC and player."""
    affinity: float = 0.0
    trust: float = 0.0
    chemistry: float = 0.0
    tension: float = 0.0
    flags: Dict[str, Any] = {}

    # Computed fields
    relationship_tier: Optional[str] = None
    intimacy_level: Optional[str] = None


class SessionContext(BaseModel):
    """Game session context."""
    id: int
    world_time: float = 0.0
    flags: Dict[str, Any] = {}
    arcs: Dict[str, Any] = {}


class SceneContext(BaseModel):
    """Scene and node context."""
    scene_id: Optional[int] = None
    node_id: Optional[int] = None
    node_meta: Dict[str, Any] = {}
    speaker_role: Optional[str] = None


class WorldContext(BaseModel):
    """World-level context."""
    world_id: int
    world_name: str
    world_meta: Dict[str, Any] = {}
    relationship_schemas: Dict[str, Any] = {}
    intimacy_schema: Optional[Dict[str, Any]] = None
    npc_overrides: Dict[str, Any] = {}


class NarrativeContext(BaseModel):
    """
    Complete context for narrative generation.

    This aggregates all the contextual information needed to generate
    appropriate dialogue and visual prompts for an NPC interaction.
    """
    # Core contexts
    npc: NPCContext
    world: WorldContext
    session: SessionContext
    relationship: RelationshipContext

    # Optional contexts
    location: Optional[LocationContext] = None
    scene: Optional[SceneContext] = None

    # Player input
    player_input: Optional[str] = None
    player_choice_id: Optional[str] = None

    def to_template_vars(self) -> Dict[str, Any]:
        """
        Convert context to a flat dictionary for template substitution.

        Returns a dictionary with dotted keys like 'npc.name', 'relationship.affinity', etc.
        """
        vars = {}

        # NPC vars
        vars["npc.id"] = self.npc.id
        vars["npc.name"] = self.npc.name
        for key, value in self.npc.personality.items():
            vars[f"npc.personality.{key}"] = value

        # Relationship vars
        vars["affinity"] = self.relationship.affinity
        vars["trust"] = self.relationship.trust
        vars["chemistry"] = self.relationship.chemistry
        vars["tension"] = self.relationship.tension
        vars["relationship_tier"] = self.relationship.relationship_tier
        vars["intimacy_level"] = self.relationship.intimacy_level

        for key, value in self.relationship.flags.items():
            vars[f"flags.{key}"] = value

        # Session vars
        vars["world_time"] = self.session.world_time
        for key, value in self.session.flags.items():
            vars[f"flags.{key}"] = value
        for arc_id, arc_data in self.session.arcs.items():
            if isinstance(arc_data, dict):
                for key, value in arc_data.items():
                    vars[f"arcs.{arc_id}.{key}"] = value
            else:
                vars[f"arcs.{arc_id}"] = arc_data

        # Location vars
        if self.location:
            vars["location.id"] = self.location.id
            vars["location.name"] = self.location.name
            for key, value in self.location.meta.items():
                vars[f"location.meta.{key}"] = value

        # Scene vars
        if self.scene:
            vars["scene.id"] = self.scene.scene_id
            vars["node.id"] = self.scene.node_id
            for key, value in self.scene.node_meta.items():
                vars[f"node.meta.{key}"] = value
            if self.scene.speaker_role:
                vars["node.speaker_role"] = self.scene.speaker_role

        # Player input
        if self.player_input:
            vars["player_input"] = self.player_input
        if self.player_choice_id:
            vars["player_choice_id"] = self.player_choice_id

        return vars