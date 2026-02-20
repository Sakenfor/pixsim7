#!/usr/bin/env python3
"""
Phase 0 - Cross-domain foreign key checker.

Scans SQLModel files and Alembic migrations for foreign key declarations
that cross the game/main database boundary defined in TABLE_OWNERSHIP.md.

Run: python pixsim7/backend/main/scripts/check_cross_domain_fks.py
Exit code 0 = clean, 1 = violations found.
"""
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent  # pixsim7/backend/main/
MIGRATIONS_ROOT = BACKEND_ROOT / "infrastructure" / "database" / "migrations" / "versions"

# Tables belonging to the game database.
# Everything not listed here belongs to main.
GAME_TABLES: set[str] = {
    # Core
    "game_worlds",
    "game_world_states",
    "game_scenes",
    "game_scene_nodes",
    "game_scene_edges",
    "game_sessions",
    "game_session_events",
    "game_locations",
    "game_npcs",
    "game_items",
    "game_hotspots",
    "game_project_snapshots",
    # NPC
    "npc_schedules",
    "npc_state",
    "npc_expressions",
    "npc_conversation_memories",
    "npc_emotional_states",
    "npc_conversation_topics",
    "npc_relationship_milestones",
    "npc_world_context",
    "npc_personality_evolution",
    "npc_dialogue_analytics",
    # Characters
    "characters",
    "character_relationships",
    "character_usage",
    "character_instances",
    "character_capabilities",
    "scene_character_manifests",
    "character_dialogue_profiles",
    # Templates
    "item_templates",
    "location_templates",
    # Clip sequences (reclassified from assets to game)
    "clip_sequences",
    "clip_sequence_entries",
}

# Files that are game-owned (relative to BACKEND_ROOT)
GAME_FILE_PREFIXES: list[str] = [
    "domain/game/",
]

# Files that are main-owned but reclassified as game (none remaining after Phase 2)
GAME_FILE_RECLASSIFIED: list[str] = []

# FK target patterns
FK_KW_PATTERN = re.compile(r'foreign_key\s*=\s*["\']([^"\']+)["\']')
FK_CALL_PATTERN = re.compile(r'ForeignKey\(\s*["\']([^"\']+)["\']')
FK_CONSTRAINT_INLINE_PATTERN = re.compile(r"ForeignKeyConstraint\(([^\)]*)\)")
FK_TARGET_IN_LIST_PATTERN = re.compile(r'["\']([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)["\']')

# Migration context patterns
CREATE_TABLE_PATTERN = re.compile(r'op\.create_table\(\s*["\']([A-Za-z_][A-Za-z0-9_]*)["\']')
CREATE_TABLE_START_PATTERN = re.compile(r"op\.create_table\(")
TABLE_NAME_LINE_PATTERN = re.compile(r'\s*["\']([A-Za-z_][A-Za-z0-9_]*)["\']\s*,?')
ADD_COLUMN_PATTERN = re.compile(r'op\.add_column\(\s*["\']([A-Za-z_][A-Za-z0-9_]*)["\']')
CREATE_FK_CALL_PATTERN = re.compile(
    r'\b\w+\.create_foreign_key\(\s*[^,]*,\s*["\']([A-Za-z_][A-Za-z0-9_]*)["\']\s*,\s*["\']([A-Za-z_][A-Za-z0-9_]*)["\']',
    re.S,
)

# Known cross-domain FKs — historical migration artifacts only.
# Domain-model violations were resolved in Phase 2 (FK removal + file moves).
# Key format: <rel_path>:<source_table>-><target_table>
KNOWN_VIOLATIONS: dict[str, str] = {
    # Alembic migration history (read-only historical artifacts — cannot change)
    "infrastructure/database/migrations/versions/20251118_1400_add_npc_memory_and_emotional_states.py:npc_conversation_memories->users": "Migration history: FK dropped in 20260219_0002",
    "infrastructure/database/migrations/versions/20251118_1400_add_npc_memory_and_emotional_states.py:npc_conversation_topics->users": "Migration history: FK dropped in 20260219_0002",
    "infrastructure/database/migrations/versions/20251118_1500_add_advanced_npc_features.py:npc_relationship_milestones->users": "Migration history: FK dropped in 20260219_0002",
    "infrastructure/database/migrations/versions/20251118_1500_add_advanced_npc_features.py:npc_personality_evolution->users": "Migration history: FK dropped in 20260219_0002",
    "infrastructure/database/migrations/versions/20251118_1500_add_advanced_npc_features.py:npc_dialogue_analytics->users": "Migration history: FK dropped in 20260219_0002",
    "infrastructure/database/migrations/versions/20251118_1200_add_character_registry.py:character_usage->prompt_versions": "Migration history: FK dropped in 20260219_0002",
    "infrastructure/database/migrations/versions/20251118_1200_add_character_registry.py:character_usage->action_blocks": "Migration history: FK dropped in 20260219_0002",
    "infrastructure/database/migrations/versions/20251118_1300_add_character_integrations.py:character_npc_links->character_instances": "Legacy migration history: table removed by link consolidation",
    "infrastructure/database/migrations/versions/20251118_1300_add_character_integrations.py:character_npc_links->game_npcs": "Legacy migration history: table removed by link consolidation",
    "infrastructure/database/migrations/versions/20260112_0002_add_clip_sequences.py:clip_sequence_entries->assets": "Migration history: FK dropped in 20260219_0002",
    "infrastructure/database/migrations/versions/20260112_0002_add_clip_sequences.py:clip_sequence_entries->asset_branches": "Migration history: FK dropped in 20260219_0002",
    "infrastructure/database/migrations/versions/20260112_0002_add_clip_sequences.py:clip_sequence_entries->asset_clips": "Migration history: FK dropped in 20260219_0002",
}


def get_table_from_fk(fk_target: str) -> str:
    """Extract table name from FK target like 'game_npcs.id'."""
    return fk_target.split(".")[0]


def is_game_file(rel_path: str) -> bool:
    """Check if a file belongs to the game domain."""
    for prefix in GAME_FILE_PREFIXES:
        if rel_path.startswith(prefix):
            return True
    for path in GAME_FILE_RECLASSIFIED:
        if rel_path == path:
            return True
    return False


def is_game_table(table: str) -> bool:
    return table in GAME_TABLES


def _extract_fk_targets_from_snippet(snippet: str) -> list[str]:
    targets: list[str] = []

    for match in FK_KW_PATTERN.finditer(snippet):
        targets.append(match.group(1))

    for match in FK_CALL_PATTERN.finditer(snippet):
        targets.append(match.group(1))

    for match in FK_CONSTRAINT_INLINE_PATTERN.finditer(snippet):
        constraint_body = match.group(1)
        for target in FK_TARGET_IN_LIST_PATTERN.findall(constraint_body):
            targets.append(target)

    return targets


def _get_upgrade_line_range(source: str) -> tuple[int, int]:
    """
    Return (start_line, end_line) for the migration upgrade() function.

    If parsing fails or no upgrade() exists, scan the full file.
    """
    lines = source.splitlines()
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return 1, len(lines)

    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "upgrade":
            start = getattr(node, "lineno", 1)
            end = getattr(node, "end_lineno", len(lines))
            return start, end

    return 1, len(lines)


def _find_known_violation(rel_path: str, source_table: str | None, target_table: str) -> str | None:
    if source_table:
        exact_key = f"{rel_path}:{source_table}->{target_table}"
        if exact_key in KNOWN_VIOLATIONS:
            return KNOWN_VIOLATIONS[exact_key]

    key_prefix = f"{rel_path}:"
    target_suffix = f"->{target_table}"
    for known_key, known_msg in KNOWN_VIOLATIONS.items():
        if known_key.startswith(key_prefix) and known_key.endswith(target_suffix):
            return known_msg

    return None


def _record_fk(
    *,
    rel_path: str,
    lineno: int,
    source_table: str | None,
    target_table: str,
    target_display: str,
    known_hits: list[str],
    new_violations: list[str],
) -> None:
    if source_table is not None:
        source_is_game = is_game_table(source_table)
    else:
        source_is_game = is_game_file(rel_path)

    target_is_game = is_game_table(target_table)

    if source_is_game and not target_is_game:
        violation_type = "game->main"
    elif not source_is_game and target_is_game:
        violation_type = "main->game"
    else:
        return

    known_reason = _find_known_violation(rel_path, source_table, target_table)
    fk_label = f"{source_table}->{target_table}" if source_table else target_display

    if known_reason:
        known_hits.append(
            f"  [known] {rel_path}:{lineno} FK {fk_label} ({violation_type}) - {known_reason}"
        )
    else:
        new_violations.append(
            f"  {rel_path}:{lineno} FK {fk_label} ({violation_type})"
        )


def _scan_model_file(filepath: Path, known_hits: list[str], new_violations: list[str]) -> None:
    rel_path = filepath.relative_to(BACKEND_ROOT).as_posix()

    try:
        source = filepath.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return

    for lineno, line in enumerate(source.splitlines(), 1):
        for fk_target in _extract_fk_targets_from_snippet(line):
            target_table = get_table_from_fk(fk_target)
            _record_fk(
                rel_path=rel_path,
                lineno=lineno,
                source_table=None,
                target_table=target_table,
                target_display=fk_target,
                known_hits=known_hits,
                new_violations=new_violations,
            )


def _scan_migration_file(filepath: Path, known_hits: list[str], new_violations: list[str]) -> None:
    rel_path = filepath.relative_to(BACKEND_ROOT).as_posix()

    try:
        source = filepath.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return

    all_lines = source.splitlines()
    upgrade_start, upgrade_end = _get_upgrade_line_range(source)
    line_offset = upgrade_start - 1
    lines = all_lines[line_offset:upgrade_end]

    current_table: str | None = None
    pending_table_name = False
    create_table_depth = 0
    collecting_constraint = False
    constraint_start_line = 0
    constraint_buffer: list[str] = []

    for local_lineno, line in enumerate(lines, 1):
        lineno = line_offset + local_lineno
        if current_table is None and not pending_table_name:
            create_match_inline = CREATE_TABLE_PATTERN.search(line)
            if create_match_inline:
                current_table = create_match_inline.group(1)
                create_table_depth = line.count("(") - line.count(")")
            elif CREATE_TABLE_START_PATTERN.search(line):
                pending_table_name = True
                create_table_depth = line.count("(") - line.count(")")
        elif current_table is None and pending_table_name:
            create_table_depth += line.count("(") - line.count(")")
            table_name_match = TABLE_NAME_LINE_PATTERN.search(line)
            if table_name_match:
                current_table = table_name_match.group(1)
                pending_table_name = False
        else:
            create_table_depth += line.count("(") - line.count(")")

            if collecting_constraint:
                constraint_buffer.append(line)
                if ")" in line:
                    snippet = " ".join(constraint_buffer)
                    for fk_target in _extract_fk_targets_from_snippet(snippet):
                        target_table = get_table_from_fk(fk_target)
                        _record_fk(
                            rel_path=rel_path,
                            lineno=constraint_start_line,
                            source_table=current_table,
                            target_table=target_table,
                            target_display=fk_target,
                            known_hits=known_hits,
                            new_violations=new_violations,
                        )
                    collecting_constraint = False
                    constraint_buffer = []
            else:
                if "ForeignKeyConstraint(" in line and ")" not in line:
                    collecting_constraint = True
                    constraint_start_line = lineno
                    constraint_buffer = [line]
                else:
                    for fk_target in _extract_fk_targets_from_snippet(line):
                        target_table = get_table_from_fk(fk_target)
                        _record_fk(
                            rel_path=rel_path,
                            lineno=lineno,
                            source_table=current_table,
                            target_table=target_table,
                            target_display=fk_target,
                            known_hits=known_hits,
                            new_violations=new_violations,
                        )

            if create_table_depth <= 0:
                current_table = None
                pending_table_name = False
                create_table_depth = 0
                collecting_constraint = False
                constraint_buffer = []

        add_column_match = ADD_COLUMN_PATTERN.search(line)
        if add_column_match:
            source_table = add_column_match.group(1)
            for fk_target in _extract_fk_targets_from_snippet(line):
                target_table = get_table_from_fk(fk_target)
                _record_fk(
                    rel_path=rel_path,
                    lineno=lineno,
                    source_table=source_table,
                    target_table=target_table,
                    target_display=fk_target,
                    known_hits=known_hits,
                    new_violations=new_violations,
                )

    upgrade_source = "\n".join(lines)
    for match in CREATE_FK_CALL_PATTERN.finditer(upgrade_source):
        source_table = match.group(1)
        target_table = match.group(2)
        lineno = line_offset + upgrade_source.count("\n", 0, match.start()) + 1
        _record_fk(
            rel_path=rel_path,
            lineno=lineno,
            source_table=source_table,
            target_table=target_table,
            target_display=f"{target_table}.id",
            known_hits=known_hits,
            new_violations=new_violations,
        )


def check_fks() -> tuple[list[str], list[str]]:
    """Scan model and migration files for cross-domain FK violations."""
    new_violations: list[str] = []
    known_hits: list[str] = []

    model_root = BACKEND_ROOT / "domain"
    for filepath in sorted(model_root.rglob("*.py")):
        if "__pycache__" in str(filepath):
            continue
        _scan_model_file(filepath, known_hits, new_violations)

    if MIGRATIONS_ROOT.exists():
        for filepath in sorted(MIGRATIONS_ROOT.rglob("*.py")):
            if "__pycache__" in str(filepath):
                continue
            _scan_migration_file(filepath, known_hits, new_violations)

    return new_violations, known_hits


def main() -> int:
    new_violations, known_hits = check_fks()

    if known_hits:
        print(f"Known cross-domain FKs (tracked for Phase 2): {len(known_hits)}")
        for hit in known_hits:
            print(hit)
        print()

    if new_violations:
        print(f"NEW cross-domain FK violations: {len(new_violations)}")
        for violation in new_violations:
            print(violation)
        print()
        print("Fix these or add them to KNOWN_VIOLATIONS with a phase target.")
        return 1

    print("Cross-domain FK boundaries clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
