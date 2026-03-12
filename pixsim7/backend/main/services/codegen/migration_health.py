"""
Migration health helpers for devtools.

Tracks migration file hashes in a local sidecar and compares them against the
current database revision state for each migration chain.
"""

from __future__ import annotations

import ast
import hashlib
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text

from pixsim7.backend.main.shared.config import settings


MIGRATION_CHAIN_ORDER = ("main", "game", "blocks", "logs")

CHAIN_CONFIG: dict[str, dict[str, str]] = {
    "main": {
        "config_file": "alembic.ini",
        "script_location": "pixsim7/backend/main/infrastructure/database/migrations",
        "version_table": "alembic_version",
    },
    "game": {
        "config_file": "alembic_game.ini",
        "script_location": "pixsim7/backend/main/infrastructure/database/game_migrations",
        "version_table": "alembic_version_game",
    },
    "blocks": {
        "config_file": "alembic_blocks.ini",
        "script_location": "pixsim7/backend/main/infrastructure/database/blocks_migrations",
        "version_table": "alembic_version_blocks",
    },
    "logs": {
        "config_file": "alembic_logs.ini",
        "script_location": "pixsim7/backend/main/infrastructure/database/log_migrations",
        "version_table": "alembic_version_logs",
    },
}

SIDECAR_DIRNAME = ".pixsim7"
SIDECAR_FILENAME = "migration_hashes.json"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _sha256_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _normalize_sync_db_url(raw_url: str) -> str:
    if raw_url.startswith("postgresql+asyncpg://"):
        return raw_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    return raw_url


def _mask_url(url: str) -> str:
    # Keep host/db visible while masking credentials.
    return url.replace(url.partition("://")[2].partition("@")[0], "****", 1) if "@" in url else url


def _extract_literal(value_node: ast.AST) -> str | None | list[str]:
    if isinstance(value_node, ast.Constant):
        if isinstance(value_node.value, str):
            return value_node.value
        if value_node.value is None:
            return None
    if isinstance(value_node, (ast.Tuple, ast.List)):
        values: list[str] = []
        for elt in value_node.elts:
            if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                values.append(elt.value)
        return values
    return None


def _parse_revision_metadata(path: Path) -> tuple[str | None, list[str]]:
    """
    Parse revision and down_revision from a migration script without importing it.
    """
    try:
        source = path.read_text(encoding="utf-8")
    except Exception:
        return None, []

    try:
        tree = ast.parse(source, filename=str(path))
    except SyntaxError:
        return None, []

    revision: str | None = None
    down_revision_values: list[str] = []

    for node in tree.body:
        target_name: str | None = None
        value_node: ast.AST | None = None

        if isinstance(node, ast.Assign):
            if len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                target_name = node.targets[0].id
                value_node = node.value
        elif isinstance(node, ast.AnnAssign):
            if isinstance(node.target, ast.Name):
                target_name = node.target.id
                value_node = node.value

        if target_name not in {"revision", "down_revision"} or value_node is None:
            continue

        literal = _extract_literal(value_node)
        if target_name == "revision":
            if isinstance(literal, str):
                revision = literal
        else:
            if isinstance(literal, str):
                down_revision_values = [literal]
            elif isinstance(literal, list):
                down_revision_values = [item for item in literal if item]
            elif literal is None:
                down_revision_values = []

    return revision, down_revision_values


def _resolve_repo_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "scripts" / "migrate_all.py").is_file():
            return parent
    raise FileNotFoundError("Cannot locate repository root")


class MigrationHealthService:
    def __init__(self, repo_root: Path | None = None) -> None:
        self.repo_root = repo_root or _resolve_repo_root()
        self.sidecar_path = self.repo_root / SIDECAR_DIRNAME / SIDECAR_FILENAME

    def _chain_db_url(self, scope: str) -> str:
        if scope == "main":
            return settings.database_url
        if scope == "game":
            return settings.database_url
        if scope == "blocks":
            return settings.blocks_database_url_resolved
        if scope == "logs":
            return settings.log_database_url_resolved
        raise ValueError(f"Unknown migration scope: {scope}")

    def _load_sidecar(self) -> tuple[dict[str, Any], bool]:
        """
        Returns:
            Tuple[sidecar_data, created]
        """
        default_data: dict[str, Any] = {
            "version": 1,
            "updated_at": _utc_now_iso(),
            "chains": {},
        }

        if not self.sidecar_path.is_file():
            return default_data, True

        try:
            raw = json.loads(self.sidecar_path.read_text(encoding="utf-8"))
        except Exception:
            return default_data, True

        chains_raw = raw.get("chains")
        if not isinstance(chains_raw, dict):
            return default_data, True

        normalized_chains: dict[str, dict[str, dict[str, str]]] = {}
        for scope, scope_payload in chains_raw.items():
            if not isinstance(scope_payload, dict):
                continue
            normalized_scope: dict[str, dict[str, str]] = {}
            for revision, revision_payload in scope_payload.items():
                if isinstance(revision_payload, str):
                    normalized_scope[revision] = {"hash": revision_payload, "updated_at": _utc_now_iso()}
                elif isinstance(revision_payload, dict):
                    raw_hash = revision_payload.get("hash")
                    if isinstance(raw_hash, str) and raw_hash:
                        normalized_scope[revision] = {
                            "hash": raw_hash,
                            "updated_at": str(revision_payload.get("updated_at") or _utc_now_iso()),
                        }
            normalized_chains[scope] = normalized_scope

        normalized_data = {
            "version": 1,
            "updated_at": str(raw.get("updated_at") or _utc_now_iso()),
            "chains": normalized_chains,
        }
        return normalized_data, False

    def _save_sidecar(self, data: dict[str, Any]) -> None:
        self.sidecar_path.parent.mkdir(parents=True, exist_ok=True)
        data["updated_at"] = _utc_now_iso()
        self.sidecar_path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    def _read_db_heads(self, db_url: str, version_table: str) -> tuple[list[str], str | None]:
        sync_url = _normalize_sync_db_url(db_url)
        engine = create_engine(sync_url, future=True)
        try:
            with engine.connect() as connection:
                rows = connection.execute(text(f'SELECT version_num FROM "{version_table}"')).fetchall()
            heads = sorted(
                {str(row[0]) for row in rows if row and row[0] is not None and str(row[0]).strip()}
            )
            return heads, None
        except Exception as exc:
            return [], str(exc)
        finally:
            engine.dispose()

    def _collect_scripts(self, scope: str, script_location: str) -> dict[str, dict[str, Any]]:
        versions_dir = self.repo_root / script_location / "versions"
        if not versions_dir.is_dir():
            return {}

        scripts: dict[str, dict[str, Any]] = {}
        for path in sorted(versions_dir.glob("*.py")):
            if path.name == "__init__.py":
                continue
            revision, down_revisions = _parse_revision_metadata(path)
            if not revision:
                continue
            file_bytes = path.read_bytes()
            scripts[revision] = {
                "scope": scope,
                "revision": revision,
                "filename": path.name,
                "path": str(path.relative_to(self.repo_root)),
                "sha256": _sha256_bytes(file_bytes),
                "down_revisions": down_revisions,
                "is_merge": len(down_revisions) > 1,
            }
        return scripts

    @staticmethod
    def _compute_script_heads(scripts: dict[str, dict[str, Any]]) -> list[str]:
        revisions = set(scripts.keys())
        down_revisions: set[str] = set()
        for script in scripts.values():
            for parent in script["down_revisions"]:
                if parent:
                    down_revisions.add(parent)
        return sorted(revisions - down_revisions)

    @staticmethod
    def _compute_applied_revisions(
        scripts: dict[str, dict[str, Any]],
        current_heads: list[str],
    ) -> tuple[set[str], set[str]]:
        """
        Walk from current DB head(s) backward through down_revision links.

        Returns:
            Tuple[applied_known_revisions, unknown_applied_revisions]
        """
        applied_known: set[str] = set()
        unknown_applied: set[str] = set()

        stack = list(current_heads)
        visited: set[str] = set()

        while stack:
            revision = stack.pop()
            if revision in visited:
                continue
            visited.add(revision)

            script = scripts.get(revision)
            if not script:
                unknown_applied.add(revision)
                continue

            applied_known.add(revision)
            for parent in script["down_revisions"]:
                if parent:
                    stack.append(parent)

        return applied_known, unknown_applied

    def _ensure_applied_hashes_in_sidecar(
        self,
        sidecar: dict[str, Any],
        scope: str,
        applied_revisions: set[str],
        scripts: dict[str, dict[str, Any]],
    ) -> bool:
        changed = False
        chains = sidecar.setdefault("chains", {})
        scope_hashes: dict[str, dict[str, str]] = chains.setdefault(scope, {})

        for revision in sorted(applied_revisions):
            script = scripts.get(revision)
            if not script:
                continue
            existing = scope_hashes.get(revision)
            if isinstance(existing, dict) and isinstance(existing.get("hash"), str):
                continue
            scope_hashes[revision] = {
                "hash": script["sha256"],
                "updated_at": _utc_now_iso(),
            }
            changed = True

        return changed

    def get_health(self, scopes: list[str] | None = None) -> dict[str, Any]:
        active_scopes = scopes or list(MIGRATION_CHAIN_ORDER)
        for scope in active_scopes:
            if scope not in CHAIN_CONFIG:
                raise ValueError(f"Unknown migration scope: {scope}")

        sidecar, sidecar_created = self._load_sidecar()
        sidecar_changed = False

        chains_payload: list[dict[str, Any]] = []
        dirty_migration_total = 0
        pending_migration_total = 0
        dirty_chain_total = 0

        for scope in MIGRATION_CHAIN_ORDER:
            if scope not in active_scopes:
                continue

            cfg = CHAIN_CONFIG[scope]
            db_url = self._chain_db_url(scope)
            scripts = self._collect_scripts(scope, cfg["script_location"])
            script_heads = self._compute_script_heads(scripts)
            current_heads, db_error = self._read_db_heads(db_url, cfg["version_table"])

            applied_revisions, unknown_applied = self._compute_applied_revisions(scripts, current_heads)
            sidecar_changed = (
                self._ensure_applied_hashes_in_sidecar(sidecar, scope, applied_revisions, scripts)
                or sidecar_changed
            )

            sidecar_scope: dict[str, dict[str, str]] = sidecar.get("chains", {}).get(scope, {})
            dirty_revisions: set[str] = set()

            for revision in applied_revisions:
                script = scripts.get(revision)
                if not script:
                    continue
                recorded_hash = sidecar_scope.get(revision, {}).get("hash")
                if isinstance(recorded_hash, str) and recorded_hash and recorded_hash != script["sha256"]:
                    dirty_revisions.add(revision)

            pending_revisions = set(scripts.keys()) - applied_revisions
            dirty_count = len(dirty_revisions)
            pending_count = len(pending_revisions)

            if dirty_count > 0:
                dirty_chain_total += 1
            dirty_migration_total += dirty_count
            pending_migration_total += pending_count

            migrations: list[dict[str, Any]] = []
            for script in sorted(scripts.values(), key=lambda item: item["filename"]):
                revision = script["revision"]
                migrations.append(
                    {
                        "revision": revision,
                        "filename": script["filename"],
                        "path": script["path"],
                        "sha256": script["sha256"],
                        "down_revisions": script["down_revisions"],
                        "is_merge": script["is_merge"],
                        "is_applied": revision in applied_revisions,
                        "is_pending": revision in pending_revisions,
                        "is_dirty": revision in dirty_revisions,
                        "is_current_head": revision in current_heads,
                        "is_script_head": revision in script_heads,
                    }
                )

            chains_payload.append(
                {
                    "scope": scope,
                    "config_file": cfg["config_file"],
                    "script_location": cfg["script_location"],
                    "database_url": _mask_url(db_url),
                    "version_table": cfg["version_table"],
                    "current_heads": current_heads,
                    "script_heads": script_heads,
                    "total_migrations": len(scripts),
                    "applied_count": len(applied_revisions),
                    "pending_count": pending_count,
                    "dirty_count": dirty_count,
                    "unknown_applied_revisions": sorted(unknown_applied),
                    "db_error": db_error,
                    "migrations": migrations,
                }
            )

        if sidecar_changed or sidecar_created:
            self._save_sidecar(sidecar)

        return {
            "available": True,
            "sidecar_path": str(self.sidecar_path.relative_to(self.repo_root)),
            "sidecar_bootstrapped": sidecar_created or sidecar_changed,
            "summary": {
                "chains": len(chains_payload),
                "dirty_chains": dirty_chain_total,
                "dirty_migrations": dirty_migration_total,
                "pending_migrations": pending_migration_total,
            },
            "chains": chains_payload,
        }

    def snapshot_hashes(self, scope: str = "all") -> dict[str, Any]:
        if scope != "all" and scope not in CHAIN_CONFIG:
            raise ValueError(f"Unknown migration scope: {scope}")

        target_scopes = list(MIGRATION_CHAIN_ORDER) if scope == "all" else [scope]
        sidecar, _ = self._load_sidecar()
        updated = 0

        for chain_scope in target_scopes:
            cfg = CHAIN_CONFIG[chain_scope]
            scripts = self._collect_scripts(chain_scope, cfg["script_location"])
            chains = sidecar.setdefault("chains", {})
            scope_hashes: dict[str, dict[str, str]] = chains.setdefault(chain_scope, {})
            for revision, script in scripts.items():
                scope_hashes[revision] = {
                    "hash": script["sha256"],
                    "updated_at": _utc_now_iso(),
                }
                updated += 1

        self._save_sidecar(sidecar)

        return {
            "ok": True,
            "scope": scope,
            "updated_revisions": updated,
            "sidecar_path": str(self.sidecar_path.relative_to(self.repo_root)),
        }

    def reapply_dirty_revision(self, scope: str, revision: str, timeout_s: int = 300) -> dict[str, Any]:
        if scope not in CHAIN_CONFIG:
            raise ValueError(f"Unknown migration scope: {scope}")

        health = self.get_health(scopes=[scope])
        chain = next((item for item in health["chains"] if item["scope"] == scope), None)
        if not chain:
            raise ValueError(f"Chain not found for scope: {scope}")
        if chain["db_error"]:
            raise ValueError(f"Cannot reapply with DB error: {chain['db_error']}")

        migration = next((m for m in chain["migrations"] if m["revision"] == revision), None)
        if not migration:
            raise ValueError(f"Revision '{revision}' was not found in scope '{scope}'")
        if not migration["is_dirty"]:
            raise ValueError(f"Revision '{revision}' is not dirty")
        if not migration["is_current_head"]:
            raise ValueError("Only current head revisions can be re-applied safely")
        if len(chain["current_heads"]) != 1:
            raise ValueError("Re-apply requires exactly one current DB head")
        if migration["is_merge"] or len(migration["down_revisions"]) != 1:
            raise ValueError("Merge/base revisions are not supported for automatic re-apply")

        downgrade_target = migration["down_revisions"][0]
        cfg = CHAIN_CONFIG[scope]
        ini_path = self.repo_root / cfg["config_file"]

        env = os.environ.copy()
        existing_pythonpath = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = f"{self.repo_root}{os.pathsep}{existing_pythonpath}" if existing_pythonpath else str(self.repo_root)

        start = time.monotonic()

        def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                [sys.executable, "-m", "alembic", "-c", str(ini_path), *args],
                cwd=str(self.repo_root),
                env=env,
                text=True,
                capture_output=True,
                timeout=timeout_s,
            )

        downgrade_proc = _run(["downgrade", downgrade_target])
        combined_stdout = (downgrade_proc.stdout or "").strip()
        combined_stderr = (downgrade_proc.stderr or "").strip()

        if downgrade_proc.returncode != 0:
            elapsed_ms = int((time.monotonic() - start) * 1000)
            return {
                "ok": False,
                "scope": scope,
                "revision": revision,
                "downgrade_target": downgrade_target,
                "exit_code": downgrade_proc.returncode,
                "duration_ms": elapsed_ms,
                "stdout": combined_stdout,
                "stderr": combined_stderr,
            }

        upgrade_proc = _run(["upgrade", revision])
        upgrade_stdout = (upgrade_proc.stdout or "").strip()
        upgrade_stderr = (upgrade_proc.stderr or "").strip()

        if upgrade_stdout:
            combined_stdout = f"{combined_stdout}\n{upgrade_stdout}".strip()
        if upgrade_stderr:
            combined_stderr = f"{combined_stderr}\n{upgrade_stderr}".strip()

        elapsed_ms = int((time.monotonic() - start) * 1000)

        if upgrade_proc.returncode == 0:
            sidecar, _ = self._load_sidecar()
            scripts = self._collect_scripts(scope, cfg["script_location"])
            script = scripts.get(revision)
            if script:
                chains = sidecar.setdefault("chains", {})
                scope_hashes: dict[str, dict[str, str]] = chains.setdefault(scope, {})
                scope_hashes[revision] = {
                    "hash": script["sha256"],
                    "updated_at": _utc_now_iso(),
                }
                self._save_sidecar(sidecar)

        return {
            "ok": upgrade_proc.returncode == 0,
            "scope": scope,
            "revision": revision,
            "downgrade_target": downgrade_target,
            "exit_code": upgrade_proc.returncode,
            "duration_ms": elapsed_ms,
            "stdout": combined_stdout,
            "stderr": combined_stderr,
        }
