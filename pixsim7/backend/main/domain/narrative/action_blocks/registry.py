"""
BlockRegistry - Pure storage for action blocks.

Responsible only for storing, retrieving, and managing action blocks.
No business logic - that's in BlockSelector and strategies.
"""

import json
from pathlib import Path
from typing import Dict, List, Optional, Any, Iterator

import pixsim_logging

from .types_unified import ActionBlock

logger = pixsim_logging.get_logger()


class BlockRegistry:
    """
    Pure storage for action blocks.

    Supports loading from:
    - JSON library files (static blocks)
    - Database (generated blocks)
    - Runtime registration (dynamic blocks)

    Thread-safe for read operations. Write operations should be
    coordinated externally if needed.
    """

    def __init__(self):
        self._blocks: Dict[str, ActionBlock] = {}
        self._by_kind: Dict[str, List[str]] = {
            "single_state": [],
            "transition": [],
        }
        self._by_location: Dict[str, List[str]] = {}

    # =========================================================================
    # CRUD Operations
    # =========================================================================

    def add(self, block: ActionBlock) -> None:
        """Add or update a block in the registry."""
        block_id = block.id

        # Remove from indices if updating
        if block_id in self._blocks:
            self._remove_from_indices(block_id)

        # Store block
        self._blocks[block_id] = block

        # Update indices
        self._add_to_indices(block)

        logger.debug(f"Registered block: {block_id}")

    def get(self, block_id: str) -> Optional[ActionBlock]:
        """Get a block by ID."""
        return self._blocks.get(block_id)

    def remove(self, block_id: str) -> bool:
        """Remove a block by ID. Returns True if removed."""
        if block_id not in self._blocks:
            return False

        self._remove_from_indices(block_id)
        del self._blocks[block_id]
        logger.debug(f"Removed block: {block_id}")
        return True

    def has(self, block_id: str) -> bool:
        """Check if a block exists."""
        return block_id in self._blocks

    def clear(self) -> None:
        """Remove all blocks."""
        self._blocks.clear()
        self._by_kind = {"single_state": [], "transition": []}
        self._by_location.clear()

    # =========================================================================
    # Query Operations
    # =========================================================================

    def all(self) -> Iterator[ActionBlock]:
        """Iterate over all blocks."""
        return iter(self._blocks.values())

    def list_ids(self) -> List[str]:
        """Get all block IDs."""
        return list(self._blocks.keys())

    def count(self) -> int:
        """Get total number of blocks."""
        return len(self._blocks)

    def by_kind(self, kind: str) -> List[ActionBlock]:
        """Get blocks by kind (single_state or transition)."""
        ids = self._by_kind.get(kind, [])
        return [self._blocks[bid] for bid in ids if bid in self._blocks]

    def by_location(self, location: str) -> List[ActionBlock]:
        """Get blocks by location tag."""
        ids = self._by_location.get(location, [])
        return [self._blocks[bid] for bid in ids if bid in self._blocks]

    # =========================================================================
    # Bulk Operations
    # =========================================================================

    def add_many(self, blocks: List[ActionBlock]) -> int:
        """Add multiple blocks. Returns count added."""
        for block in blocks:
            self.add(block)
        return len(blocks)

    def load_from_json(self, json_path: Path) -> int:
        """
        Load blocks from a JSON file.

        Supports both single block and list of blocks format.
        Returns count of blocks loaded.
        """
        if not json_path.exists():
            logger.warning(f"JSON file not found: {json_path}")
            return 0

        try:
            with open(json_path, "r") as f:
                data = json.load(f)

            blocks_data = data if isinstance(data, list) else [data]
            count = 0

            for block_data in blocks_data:
                block = self._parse_block(block_data)
                if block:
                    self.add(block)
                    count += 1

            logger.info(f"Loaded {count} blocks from {json_path.name}")
            return count

        except Exception as e:
            logger.error(f"Failed to load {json_path}: {e}")
            return 0

    def load_from_directory(self, directory: Path) -> int:
        """Load all JSON files from a directory. Returns total count."""
        if not directory.exists():
            logger.warning(f"Directory not found: {directory}")
            return 0

        total = 0
        for json_file in directory.glob("*.json"):
            total += self.load_from_json(json_file)

        return total

    # =========================================================================
    # Serialization
    # =========================================================================

    def to_dict(self) -> Dict[str, Any]:
        """Export all blocks as a dictionary."""
        return {
            bid: block.model_dump() for bid, block in self._blocks.items()
        }

    def to_list(self) -> List[Dict[str, Any]]:
        """Export all blocks as a list of dicts."""
        return [block.model_dump() for block in self._blocks.values()]

    # =========================================================================
    # Internal
    # =========================================================================

    def _parse_block(self, data: Dict[str, Any]) -> Optional[ActionBlock]:
        """Parse a block from dict data."""
        try:
            # Handle 'from' -> 'from_' alias for transitions
            if data.get("kind") == "transition" and "from" in data:
                data["from_"] = data.pop("from")

            return ActionBlock(**data)
        except Exception as e:
            logger.error(f"Failed to parse block: {e}")
            return None

    def _add_to_indices(self, block: ActionBlock) -> None:
        """Add block to indices."""
        # Kind index
        kind = block.kind
        if kind in self._by_kind:
            self._by_kind[kind].append(block.id)

        # Location index
        if block.tags.location:
            loc = block.tags.location
            if loc not in self._by_location:
                self._by_location[loc] = []
            self._by_location[loc].append(block.id)

    def _remove_from_indices(self, block_id: str) -> None:
        """Remove block from indices."""
        block = self._blocks.get(block_id)
        if not block:
            return

        # Kind index
        kind = block.kind
        if kind in self._by_kind and block_id in self._by_kind[kind]:
            self._by_kind[kind].remove(block_id)

        # Location index
        if block.tags.location:
            loc = block.tags.location
            if loc in self._by_location and block_id in self._by_location[loc]:
                self._by_location[loc].remove(block_id)
