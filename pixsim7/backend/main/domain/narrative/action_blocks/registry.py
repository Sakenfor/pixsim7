"""
BlockRegistry - Pure storage for action blocks.

Responsible only for storing, retrieving, and managing action blocks.
No business logic - that's in BlockSelector and strategies.
"""

import json
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

import pixsim_logging

from pixsim7.backend.main.lib.registry import SimpleRegistry

from .types_unified import ActionBlock

logger = pixsim_logging.get_logger()


class BlockRegistry(SimpleRegistry[str, ActionBlock]):
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
        self._by_kind: Dict[str, List[str]] = {
            "single_state": [],
            "transition": [],
        }
        self._by_location: Dict[str, List[str]] = {}
        super().__init__(name="action_blocks", allow_overwrite=True)

    def _get_item_key(self, block: ActionBlock) -> str:
        return block.id

    # =========================================================================
    # CRUD Operations
    # =========================================================================

    def add(self, block: ActionBlock) -> None:
        """Add or update a block in the registry."""
        super().register(block.id, block)

    def get(self, block_id: str) -> Optional[ActionBlock]:
        """Get a block by ID."""
        return self.get_or_none(block_id)

    def remove(self, block_id: str) -> bool:
        """Remove a block by ID. Returns True if removed."""
        return super().unregister(block_id) is not None

    def clear(self) -> None:
        """Remove all blocks."""
        super().clear()

    # =========================================================================
    # Query Operations
    # =========================================================================

    def all(self) -> Iterator[ActionBlock]:
        """Iterate over all blocks."""
        return iter(self.values())

    def list_ids(self) -> List[str]:
        """Get all block IDs."""
        return self.keys()

    def count(self) -> int:
        """Get total number of blocks."""
        return len(self)

    def by_kind(self, kind: str) -> List[ActionBlock]:
        """Get blocks by kind (single_state or transition)."""
        ids = self._by_kind.get(kind, [])
        return [b for bid in ids if (b := self.get_or_none(bid)) is not None]

    def by_location(self, location: str) -> List[ActionBlock]:
        """Get blocks by location tag."""
        ids = self._by_location.get(location, [])
        return [b for bid in ids if (b := self.get_or_none(bid)) is not None]

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
            bid: block.model_dump() for bid, block in self.items()
        }

    def to_list(self) -> List[Dict[str, Any]]:
        """Export all blocks as a list of dicts."""
        return [block.model_dump() for block in self.values()]

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

    def _remove_from_indices(
        self,
        block_id: str,
        block: Optional[ActionBlock] = None,
    ) -> None:
        """Remove block from indices."""
        block = block or self.get_or_none(block_id)
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

    def _on_register(
        self,
        key: str,
        item: ActionBlock,
        previous: Optional[ActionBlock],
    ) -> None:
        if previous:
            self._remove_from_indices(key, previous)
        self._add_to_indices(item)

    def _on_unregister(self, key: str, item: ActionBlock) -> None:
        self._remove_from_indices(key, item)

    def _on_clear(self, items: Dict[str, ActionBlock]) -> None:
        self._by_kind = {"single_state": [], "transition": []}
        self._by_location.clear()
