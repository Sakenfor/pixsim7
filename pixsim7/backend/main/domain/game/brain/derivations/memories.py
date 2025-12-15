"""
Memories derivation plugin.

Extracts NPC memories from session flags and populates brain.derived['memories'].

Memories are sourced from session.flags.npcs["npc:ID"].memories and normalized
to the BrainMemory format.

Example output:
    [
        {
            "id": "mem_001",
            "timestamp": "2024-01-15T10:30:00Z",
            "summary": "Had a pleasant conversation about the garden",
            "tags": ["conversation", "garden", "positive"],
            "source": "scene"
        }
    ]
"""

from typing import List, Optional, Any, Dict

from ..derivation_plugin import BaseDerivationPlugin
from ..types import DerivationContext, DerivationResult, BrainMemory


class MemoriesDerivation(BaseDerivationPlugin):
    """
    Extracts memories from session flags and normalizes to BrainMemory format.

    Memory sources (in priority order):
    1. session.flags.npcs["npc:ID"].memories - direct memory list
    2. session.flags.npcs["npc:ID"].recent_events - event-based memories

    Configuration via world meta:
        world.meta.brain_config.plugins.memories = {
            "max_memories": 20,  # Maximum number of memories to include
            "include_sources": ["scene", "event", "flag"],  # Which sources to include
        }
    """

    @property
    def id(self) -> str:
        return "memories"

    @property
    def name(self) -> str:
        return "Memories from Session"

    @property
    def required_stats(self) -> List[str]:
        return []  # Works with session flags, not stats

    @property
    def optional_stats(self) -> List[str]:
        return []

    @property
    def priority(self) -> int:
        return 20  # Run early

    def compute(self, context: DerivationContext) -> Optional[DerivationResult]:
        # Get configuration
        plugin_cfg = context.get_plugin_config(self.id)
        max_memories = plugin_cfg.get("max_memories", 20)
        include_sources = plugin_cfg.get("include_sources", ["scene", "event", "flag"])

        # Get NPC's memories from session flags
        npc_key = f"npc:{context.npc_id}"
        npc_data = context.session_flags.get("npcs", {}).get(npc_key, {})

        memories: List[Dict[str, Any]] = []

        # Source 1: Direct memory list
        raw_memories = npc_data.get("memories", [])
        if isinstance(raw_memories, list):
            for mem in raw_memories:
                if isinstance(mem, dict):
                    normalized = self._normalize_memory(mem, include_sources)
                    if normalized:
                        memories.append(normalized)

        # Source 2: Recent events (if available)
        recent_events = npc_data.get("recent_events", [])
        if isinstance(recent_events, list):
            for event in recent_events:
                if isinstance(event, dict):
                    # Convert event to memory format
                    memory = self._event_to_memory(event, include_sources)
                    if memory:
                        memories.append(memory)

        # Sort by timestamp (most recent first) and limit
        memories.sort(key=lambda m: m.get("timestamp", ""), reverse=True)
        memories = memories[:max_memories]

        # Only return if we have memories
        if not memories:
            return None

        return DerivationResult(
            key="memories",
            value=memories,
            metadata={
                "count": len(memories),
                "max_memories": max_memories,
            }
        )

    def _normalize_memory(
        self,
        raw: Dict[str, Any],
        include_sources: List[str]
    ) -> Optional[Dict[str, Any]]:
        """Normalize a raw memory dict to BrainMemory format."""
        # Check source filter
        source = raw.get("source")
        if source and source not in include_sources:
            return None

        # Extract required fields
        memory_id = raw.get("id") or raw.get("memory_id") or f"mem_{hash(str(raw)) % 100000:05d}"
        timestamp = raw.get("timestamp") or raw.get("created_at") or ""
        summary = raw.get("summary") or raw.get("content") or raw.get("text") or ""

        if not summary:
            return None

        # Extract optional fields
        tags = raw.get("tags", [])
        if not isinstance(tags, list):
            tags = [str(tags)] if tags else []

        return {
            "id": str(memory_id),
            "timestamp": str(timestamp),
            "summary": str(summary),
            "tags": [str(t) for t in tags],
            "source": str(source) if source else None,
        }

    def _event_to_memory(
        self,
        event: Dict[str, Any],
        include_sources: List[str]
    ) -> Optional[Dict[str, Any]]:
        """Convert an event to memory format."""
        # Events should have source="event"
        if "event" not in include_sources:
            return None

        event_id = event.get("id") or event.get("event_id")
        timestamp = event.get("timestamp") or event.get("occurred_at") or ""
        summary = event.get("description") or event.get("summary") or event.get("name") or ""

        if not summary:
            return None

        # Event type becomes a tag
        event_type = event.get("type") or event.get("event_type")
        tags = []
        if event_type:
            tags.append(str(event_type))

        return {
            "id": f"evt_{event_id}" if event_id else f"evt_{hash(str(event)) % 100000:05d}",
            "timestamp": str(timestamp),
            "summary": str(summary),
            "tags": tags,
            "source": "event",
        }
