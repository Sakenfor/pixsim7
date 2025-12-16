#!/usr/bin/env python3
"""
Batch update imports for Game/NPC domain consolidation.
Updates imports from old structure to new consolidated structure.
"""

import re
from pathlib import Path

# Define import replacements
REPLACEMENTS = [
    # Old game.models -> game (use main barrel)
    (r'from pixsim7\.backend\.main\.domain\.game\.models import',
     'from pixsim7.backend.main.domain.game import'),

    # Character domain -> game.entities
    (r'from pixsim7\.backend\.main\.domain\.character import',
     'from pixsim7.backend.main.domain.game.entities import'),
    (r'from pixsim7\.backend\.main\.domain\.character_integrations import',
     'from pixsim7.backend.main.domain.game.entities import'),
    (r'from pixsim7\.backend\.main\.domain\.character_graph import',
     'from pixsim7.backend.main.domain.game.entities import'),
    (r'from pixsim7\.backend\.main\.domain\.character_linkage import',
     'from pixsim7.backend.main.domain.game.entities import'),
    (r'from pixsim7\.backend\.main\.domain\.npc_memory import',
     'from pixsim7.backend.main.domain.game.entities.npc_memory import'),

    # Stats -> game.stats
    (r'from pixsim7\.backend\.main\.domain\.stats\.',
     'from pixsim7.backend.main.domain.game.stats.'),
    (r'from pixsim7\.backend\.main\.domain\.stats import',
     'from pixsim7.backend.main.domain.game.stats import'),

    # Behavior -> game.behavior
    (r'from pixsim7\.backend\.main\.domain\.behavior import',
     'from pixsim7.backend.main.domain.game.behavior import'),

    # Brain -> game.brain
    (r'from pixsim7\.backend\.main\.domain\.brain import',
     'from pixsim7.backend.main.domain.game.brain import'),

    # NPC surfaces -> game.entities.npc_surfaces
    (r'from pixsim7\.backend\.main\.domain\.npc_surfaces import',
     'from pixsim7.backend.main.domain.game.entities.npc_surfaces import'),
]

def update_file_imports(file_path: Path) -> bool:
    """Update imports in a single file. Returns True if file was modified."""
    try:
        content = file_path.read_text(encoding='utf-8')
        original = content

        for pattern, replacement in REPLACEMENTS:
            content = re.sub(pattern, replacement, content)

        if content != original:
            file_path.write_text(content, encoding='utf-8')
            return True
        return False
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return False

def main():
    """Update imports in all service and API files."""
    base_path = Path(__file__).parent / "pixsim7" / "backend" / "main"

    # Directories to update
    paths_to_update = [
        base_path / "services" / "characters",
        base_path / "services" / "npc",
        base_path / "services" / "game",
        base_path / "api" / "v1",
    ]

    updated_files = []

    for path in paths_to_update:
        if not path.exists():
            print(f"Skipping non-existent path: {path}")
            continue

        print(f"\nProcessing {path}...")
        for py_file in path.glob("*.py"):
            if py_file.name.startswith("__"):
                continue
            if update_file_imports(py_file):
                updated_files.append(py_file)
                print(f"  Updated {py_file.name}")

    print(f"\n{'='*60}")
    print(f"Updated {len(updated_files)} files total")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
