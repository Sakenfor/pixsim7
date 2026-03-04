"""
Capability API manifest — single source of truth for capability descriptors.

Each entry describes a capability API class exposed to plugins.
The graph builder reads this manifest instead of hardcoded arrays.
"""

from typing import Dict, List, TypedDict


class CapabilityDescriptor(TypedDict):
    name: str
    file: str
    category: str
    description: str
    methods: List[str]
    permission: str


CAPABILITY_MANIFEST: Dict[str, CapabilityDescriptor] = {
    "world_read": {
        "name": "WorldReadAPI",
        "file": "world.py",
        "category": "read",
        "description": "Read world/NPC data",
        "methods": ["get_world", "get_npc", "list_world_npcs"],
        "permission": "world:read",
    },
    "session_read": {
        "name": "SessionReadAPI",
        "file": "session.py",
        "category": "read",
        "description": "Read session state",
        "methods": ["get_session", "get_session_relationships", "get_session_flags"],
        "permission": "session:read",
    },
    "session_mutations": {
        "name": "SessionMutationsAPI",
        "file": "session.py",
        "category": "write",
        "description": "Modify session state",
        "methods": ["execute_interaction", "update_relationship", "set_flag"],
        "permission": "session:write",
    },
    "component": {
        "name": "ComponentAPI",
        "file": "components.py",
        "category": "ecs",
        "description": "ECS component operations",
        "methods": ["register_component", "get_component", "set_component", "remove_component"],
        "permission": "component:write",
    },
    "behavior_extension": {
        "name": "BehaviorExtensionAPI",
        "file": "behaviors.py",
        "category": "behavior",
        "description": "Register conditions, effects, scoring functions",
        "methods": ["register_condition", "register_effect", "register_scoring_function"],
        "permission": "behavior:register",
    },
    "logging": {
        "name": "LoggingAPI",
        "file": "logging.py",
        "category": "logging",
        "description": "Structured logging",
        "methods": ["info", "warning", "debug", "error"],
        "permission": "log:emit",
    },
}
