"""Database tools for the launcher — backups, restore, health.

Parallel to ``migration_tools.py`` but for operational DB management rather
than schema evolution.  Uses ``pg_dump`` / ``pg_restore`` under the hood.

Detects Docker-hosted Postgres automatically: if the DB URL port matches a
port mapping on a running postgres/pgvector/timescale container, the backup
is taken via ``docker exec <container> pg_dump`` (no host-side install of
PostgreSQL client tools required).  Falls back to a local ``pg_dump`` binary
when no matching container is found.
"""
from __future__ import annotations

import os
import re
import subprocess
import urllib.parse
from datetime import datetime
from pathlib import Path
from typing import Optional


# Map launcher db_id → env var holding the DB URL.  Falls back to the main
# DATABASE_URL for ids that don't have a dedicated override (matches how
# ``shared/config.py`` resolves them on the backend side).
_DB_URL_ENV = {
    "main": "DATABASE_URL",
    "blocks": "BLOCKS_DATABASE_URL",
    "logs": "LOG_DATABASE_URL",
    "game": "DATABASE_URL",  # game currently shares main; kept for symmetry
}


def resolve_db_url(db_id: str) -> Optional[str]:
    """Resolve the DB URL for a given db_id from env vars.

    Returns ``None`` if nothing is configured.
    """
    env_var = _DB_URL_ENV.get(db_id, "DATABASE_URL")
    url = os.environ.get(env_var) or os.environ.get("DATABASE_URL")
    if not url:
        # Last-ditch: load from .env next to the repo root.
        repo_root = Path(__file__).resolve().parent.parent.parent
        dotenv = repo_root / ".env"
        if dotenv.exists():
            for line in dotenv.read_text().splitlines():
                line = line.strip()
                if line.startswith(f"{env_var}="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
                if line.startswith("DATABASE_URL=") and env_var != "DATABASE_URL":
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    # Keep looking for the more-specific var
    return url or None


def get_backups_dir() -> Path:
    """Resolve the directory where backup .dump files live.

    Prefers the shared ``path_registry.pixsim_home`` used by the main backend
    — this ensures backups land under the same root as media/logs/settings,
    honouring any ``PIXSIM_HOME`` override the user has configured (via env
    var, ``.env``, or DB-persisted system settings).  Falls back to an OS
    default only if the main package isn't importable (e.g. launcher running
    in isolation).
    """
    base: Optional[Path] = None
    try:
        from pixsim7.backend.main.shared.path_registry import get_path_registry
        base = Path(get_path_registry().pixsim_home)
    except Exception:
        pixsim_home = os.environ.get("PIXSIM_HOME")
        if pixsim_home:
            base = Path(pixsim_home)
        elif os.name == "nt":
            base = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "PixSim7"
        else:
            base = Path.home() / ".local" / "share" / "pixsim7"
    d = base / "backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _find_pg_dump() -> Optional[str]:
    """Find pg_dump on PATH, falling back to ``PG_DUMP_PATH`` env override.

    On Windows, PostgreSQL installers often don't add ``bin/`` to PATH — the
    env override lets users point at ``C:\\Program Files\\PostgreSQL\\NN\\bin\\pg_dump.exe``.
    """
    override = os.environ.get("PG_DUMP_PATH")
    if override and Path(override).exists():
        return override
    from shutil import which
    return which("pg_dump") or which("pg_dump.exe")


_POSTGRES_IMAGE_MARKERS = ("postgres", "pgvector", "timescale", "crunchydata")


def _parse_db_url(url: str) -> dict:
    """Parse a postgres URL into pg_dump-compatible components.

    Handles the ``postgresql+asyncpg://`` SQLAlchemy-style prefix by stripping
    the driver.
    """
    scheme, _, rest = url.partition("://")
    scheme = scheme.split("+", 1)[0]  # drop +asyncpg / +psycopg
    clean = f"{scheme}://{rest}"
    p = urllib.parse.urlparse(clean)
    return {
        "user": p.username or "postgres",
        "password": p.password or "",
        "host": p.hostname or "localhost",
        "port": p.port or 5432,
        "dbname": (p.path or "/").lstrip("/") or "postgres",
    }


def _detect_postgres_container(db_url: str) -> Optional[str]:
    """Find a running Docker container whose port mapping covers the host
    port in ``db_url``.

    Match strategy: extract the host-side port from the URL, then look for a
    postgres-family container (image name contains postgres / pgvector /
    timescale / crunchydata) whose port mapping includes that port.  Returns
    the container name, or None if no match (or docker CLI unavailable).
    """
    parsed = _parse_db_url(db_url)
    host_port = parsed["port"]

    try:
        result = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}}\t{{.Image}}\t{{.Ports}}"],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None

    for line in result.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        name, image, ports = parts[0], parts[1], parts[2]
        if not any(m in image.lower() for m in _POSTGRES_IMAGE_MARKERS):
            continue
        # Host-side port appears like "0.0.0.0:5434->5432/tcp" or "[::]:5434->5432/tcp"
        if re.search(rf"(^|[:\s]){host_port}->", ports):
            return name
    return None


def probe_backup_capability(db_id: str) -> dict:
    """Report which backup mode would be used for ``db_id`` without executing
    anything.  Feeds the UI so we can label the backup button with the mode
    and surface "no backup available" states before the user clicks.
    """
    url = resolve_db_url(db_id)
    if not url:
        return {"mode": "unavailable", "reason": "DB URL not configured"}
    container = _detect_postgres_container(url)
    if container:
        return {"mode": "docker", "container": container}
    if _find_pg_dump():
        return {"mode": "local", "pg_dump_path": _find_pg_dump()}
    return {
        "mode": "unavailable",
        "reason": (
            "No postgres container found for this DB's port, and no local "
            "pg_dump on PATH.  Start your Docker DB or install PostgreSQL "
            "client tools."
        ),
    }


def run_pg_dump(db_id: str, db_url: str, *, timeout: int = 600) -> tuple[int, Optional[Path], str, str]:
    """Run ``pg_dump -Fc`` for ``db_id`` against ``db_url``.

    Prefers ``docker exec <container> pg_dump`` when a matching postgres
    container is running — this avoids requiring PostgreSQL client tools on
    the host.  Falls back to a local ``pg_dump`` binary otherwise.

    Returns ``(exit_code, output_path, error_message, mode)``:
      * ``output_path`` populated on success
      * ``error_message`` carries stderr (or a recognizable preamble for
        common failures like "pg_dump not found")
      * ``mode`` is ``"docker"`` or ``"local"`` — surfaced to the UI for the
        result banner
    """
    backups = get_backups_dir()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = backups / f"{db_id}-{timestamp}.dump"

    container = _detect_postgres_container(db_url)
    if container:
        return _run_pg_dump_via_docker(container, db_url, out_file, timeout=timeout) + ("docker",)

    pg_dump = _find_pg_dump()
    if not pg_dump:
        return (
            127,
            None,
            (
                "No postgres container found for this DB's port and no local "
                "pg_dump on PATH.  Start the DB container or install PostgreSQL "
                "client tools (set PG_DUMP_PATH if pg_dump is not on PATH)."
            ),
            "unavailable",
        )
    return _run_pg_dump_local(pg_dump, db_url, out_file, timeout=timeout) + ("local",)


def _run_pg_dump_local(
    pg_dump: str, db_url: str, out_file: Path, *, timeout: int
) -> tuple[int, Optional[Path], str]:
    cmd = [pg_dump, "-Fc", "--no-owner", "--no-privileges", "-d", db_url, "-f", str(out_file)]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if res.returncode == 0 and out_file.exists():
            return 0, out_file, res.stderr.strip()
        _cleanup_partial(out_file)
        return res.returncode, None, (res.stderr or res.stdout or "pg_dump failed").strip()
    except subprocess.TimeoutExpired:
        _cleanup_partial(out_file)
        return 124, None, f"pg_dump timed out after {timeout}s."
    except Exception as exc:  # noqa: BLE001
        _cleanup_partial(out_file)
        return 1, None, f"{type(exc).__name__}: {exc}"


def _run_pg_dump_via_docker(
    container: str, db_url: str, out_file: Path, *, timeout: int
) -> tuple[int, Optional[Path], str]:
    """Stream ``pg_dump`` stdout from inside the container to ``out_file`` on
    the host.  Connects via ``localhost:5432`` from inside the container
    (ignores the URL's host/port — those are host-side mappings).
    """
    parsed = _parse_db_url(db_url)
    exec_args = ["docker", "exec"]
    if parsed["password"]:
        exec_args += ["-e", f"PGPASSWORD={parsed['password']}"]
    exec_args += [
        container,
        "pg_dump",
        "-Fc",
        "--no-owner",
        "--no-privileges",
        "-U",
        parsed["user"],
        "-d",
        parsed["dbname"],
    ]

    try:
        with open(out_file, "wb") as f:
            res = subprocess.run(
                exec_args,
                stdout=f,
                stderr=subprocess.PIPE,
                timeout=timeout,
            )
        if res.returncode == 0 and out_file.exists() and out_file.stat().st_size > 0:
            return 0, out_file, (res.stderr.decode("utf-8", errors="replace").strip())
        _cleanup_partial(out_file)
        err = res.stderr.decode("utf-8", errors="replace").strip() if res.stderr else ""
        return res.returncode, None, err or f"docker exec pg_dump failed (exit {res.returncode})"
    except subprocess.TimeoutExpired:
        _cleanup_partial(out_file)
        return 124, None, f"docker exec pg_dump timed out after {timeout}s."
    except FileNotFoundError:
        _cleanup_partial(out_file)
        return 127, None, "docker CLI not found on PATH."
    except Exception as exc:  # noqa: BLE001
        _cleanup_partial(out_file)
        return 1, None, f"{type(exc).__name__}: {exc}"


def _cleanup_partial(path: Path) -> None:
    if path.exists():
        try:
            path.unlink()
        except OSError:
            pass


def get_database_health(db_id: str, *, timeout: int = 30) -> dict:
    """Report DB size + table stats + migration history for the health panel.

    Read-only.  Runs three SQL queries via psql (inside the postgres container
    when one is running) and one ``alembic history`` invocation.  Shapes the
    result so the UI can render size at the top, top-N tables in the middle,
    and recent migrations at the bottom.
    """
    url = resolve_db_url(db_id)
    if not url:
        return {"ok": False, "error": f"DB URL not configured for '{db_id}'"}

    container = _detect_postgres_container(url)
    parsed = _parse_db_url(url)

    # Size of the current database, as a pretty string + raw bytes.
    size_sql = (
        "SELECT pg_database_size(current_database())::bigint AS size_bytes, "
        "pg_size_pretty(pg_database_size(current_database())) AS size_pretty;"
    )

    # Table count + top-10 tables by total size (including indexes + toast).
    # Uses pg_total_relation_size which counts heap + indexes + TOAST.
    top_tables_sql = (
        "SELECT schemaname, relname, "
        "pg_total_relation_size(schemaname||'.'||relname)::bigint AS total_bytes, "
        "pg_relation_size(schemaname||'.'||relname)::bigint AS heap_bytes, "
        "COALESCE(n_live_tup, 0)::bigint AS row_estimate "
        "FROM pg_stat_user_tables "
        "ORDER BY total_bytes DESC LIMIT 10;"
    )

    # Total table count across user schemas.
    total_tables_sql = (
        "SELECT count(*)::int FROM pg_stat_user_tables;"
    )

    def _query(sql: str) -> tuple[int, list[list[str]], str]:
        # psql -At gives tuples-only, unaligned, pipe-separated.
        base_args: list[str]
        if container:
            base_args = ["docker", "exec"]
            if parsed["password"]:
                base_args += ["-e", f"PGPASSWORD={parsed['password']}"]
            base_args += [
                container, "psql", "-U", parsed["user"], "-d", parsed["dbname"],
                "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-c", sql,
            ]
        else:
            base_args = [
                "psql", "-h", parsed["host"], "-p", str(parsed["port"]),
                "-U", parsed["user"], "-d", parsed["dbname"],
                "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-c", sql,
            ]
            if parsed["password"] and not os.environ.get("PGPASSWORD"):
                os.environ["PGPASSWORD"] = parsed["password"]
        try:
            res = subprocess.run(base_args, capture_output=True, text=True, timeout=timeout)
            if res.returncode != 0:
                return res.returncode, [], (res.stderr or res.stdout or "psql failed").strip()
            rows = [line.split("|") for line in res.stdout.strip().splitlines() if line]
            return 0, rows, ""
        except subprocess.TimeoutExpired:
            return 124, [], f"psql timed out after {timeout}s"
        except FileNotFoundError:
            return 127, [], "psql not found"
        except Exception as exc:  # noqa: BLE001
            return 1, [], f"{type(exc).__name__}: {exc}"

    # Size
    code, rows, err = _query(size_sql)
    if code != 0:
        return {"ok": False, "error": f"size query failed: {err}"}
    size_bytes = int(rows[0][0]) if rows and rows[0] else 0
    size_pretty = rows[0][1] if rows and len(rows[0]) > 1 else ""

    # Table count
    code, rows, err = _query(total_tables_sql)
    table_count = int(rows[0][0]) if code == 0 and rows else None

    # Top tables
    code, rows, err = _query(top_tables_sql)
    top_tables: list[dict] = []
    if code == 0:
        for r in rows:
            if len(r) < 5:
                continue
            try:
                top_tables.append({
                    "schema": r[0],
                    "name": r[1],
                    "total_bytes": int(r[2]),
                    "heap_bytes": int(r[3]),
                    "row_estimate": int(r[4]),
                })
            except (ValueError, IndexError):
                continue

    # Recent migrations via alembic history
    history: list[dict] = []
    history_error: Optional[str] = None
    try:
        from launcher.core.migration_tools import _run_alembic, discover_databases
        dbs = discover_databases()
        db = next((d for d in dbs if d.get("id") == db_id), None)
        if db:
            code, out, err2 = _run_alembic("history", "-n", "10", config=db["config"])
            if code == 0:
                for line in out.splitlines():
                    line = line.strip()
                    if not line or line.startswith("Rev:"):
                        continue
                    # alembic history default format: "<revision> -> <target>, <message>"
                    # or "<revision> (head), <message>"
                    history.append({"line": line})
            else:
                history_error = err2.strip() or "alembic history failed"
    except Exception as exc:  # noqa: BLE001
        history_error = f"{type(exc).__name__}: {exc}"

    # Fallback: if alembic history couldn't produce anything (e.g., stale
    # pycache after a squash, script_location mismatch), read the current
    # revision directly from the alembic_version table so the UI at least
    # shows *something* meaningful.
    if not history:
        code, rows, err = _query("SELECT version_num FROM alembic_version;")
        if code == 0 and rows and rows[0]:
            history.append({"line": f"{rows[0][0]} (current — from alembic_version)"})
            # Don't surface the history_error if we recovered via fallback.
            history_error = None

    return {
        "ok": True,
        "db_id": db_id,
        "size_bytes": size_bytes,
        "size_pretty": size_pretty,
        "table_count": table_count,
        "top_tables": top_tables,
        "recent_migrations": history,
        "recent_migrations_error": history_error,
    }


def inspect_table(db_id: str, schema: str, name: str, *, timeout: int = 30) -> dict:
    """Return column list + indexes + exact row count for one table."""
    url = resolve_db_url(db_id)
    if not url:
        return {"ok": False, "error": f"DB URL not configured for '{db_id}'"}
    # Basic identifier-shape guard — we interpolate schema/name into SQL so
    # only accept safe ASCII names.
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", schema):
        return {"ok": False, "error": f"invalid schema name: {schema!r}"}
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
        return {"ok": False, "error": f"invalid table name: {name!r}"}

    container = _detect_postgres_container(url)
    parsed = _parse_db_url(url)

    def _query(sql: str) -> tuple[int, list[list[str]], str]:
        if container:
            args = ["docker", "exec"]
            if parsed["password"]:
                args += ["-e", f"PGPASSWORD={parsed['password']}"]
            args += [container, "psql", "-U", parsed["user"], "-d", parsed["dbname"],
                     "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-c", sql]
        else:
            args = ["psql", "-h", parsed["host"], "-p", str(parsed["port"]),
                    "-U", parsed["user"], "-d", parsed["dbname"],
                    "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-c", sql]
            if parsed["password"] and not os.environ.get("PGPASSWORD"):
                os.environ["PGPASSWORD"] = parsed["password"]
        try:
            res = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
            if res.returncode != 0:
                return res.returncode, [], (res.stderr or res.stdout or "psql failed").strip()
            rows = [line.split("|") for line in res.stdout.strip().splitlines() if line]
            return 0, rows, ""
        except subprocess.TimeoutExpired:
            return 124, [], f"psql timed out after {timeout}s"
        except Exception as exc:  # noqa: BLE001
            return 1, [], f"{type(exc).__name__}: {exc}"

    fq = f"{schema}.{name}"

    # 1. Columns
    cols_sql = (
        "SELECT column_name, data_type, is_nullable, column_default "
        f"FROM information_schema.columns "
        f"WHERE table_schema = '{schema}' AND table_name = '{name}' "
        "ORDER BY ordinal_position;"
    )
    code, rows, err = _query(cols_sql)
    if code != 0:
        return {"ok": False, "error": f"columns query failed: {err}"}
    columns = [
        {
            "name": r[0],
            "type": r[1] if len(r) > 1 else "",
            "nullable": (r[2] if len(r) > 2 else "").upper() == "YES",
            "default": r[3] if len(r) > 3 and r[3] else None,
        }
        for r in rows
    ]

    # 2. Indexes — pg_indexes.indexdef has the human-readable form
    idx_sql = (
        "SELECT indexname, indexdef FROM pg_indexes "
        f"WHERE schemaname = '{schema}' AND tablename = '{name}' "
        "ORDER BY indexname;"
    )
    code, rows, err = _query(idx_sql)
    indexes = []
    if code == 0:
        for r in rows:
            if len(r) < 2:
                continue
            indexes.append({"name": r[0], "definition": r[1]})

    # 3. Exact row count — potentially slow, but for most tables < 10M rows
    # it's fine.  Cap the query timeout so we don't hang on huge tables; fall
    # back to the planner estimate if we hit that.
    count_sql = f'SELECT count(*) FROM "{schema}"."{name}";'
    code, rows, err = _query(count_sql)
    exact_count: Optional[int] = None
    estimate_count: Optional[int] = None
    if code == 0 and rows:
        try:
            exact_count = int(rows[0][0])
        except (ValueError, IndexError):
            exact_count = None
    else:
        # Fallback: planner estimate
        est_sql = (
            "SELECT reltuples::bigint FROM pg_class c "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            f"WHERE n.nspname = '{schema}' AND c.relname = '{name}';"
        )
        code2, rows2, _err2 = _query(est_sql)
        if code2 == 0 and rows2:
            try:
                estimate_count = int(rows2[0][0])
            except (ValueError, IndexError):
                pass

    # 4. Size
    size_sql = (
        f"SELECT pg_total_relation_size('{schema}.{name}')::bigint, "
        f"pg_relation_size('{schema}.{name}')::bigint;"
    )
    code, rows, err = _query(size_sql)
    total_bytes = int(rows[0][0]) if code == 0 and rows else 0
    heap_bytes = int(rows[0][1]) if code == 0 and rows and len(rows[0]) > 1 else 0

    return {
        "ok": True,
        "schema": schema,
        "name": name,
        "columns": columns,
        "indexes": indexes,
        "exact_row_count": exact_count,
        "estimated_row_count": estimate_count,
        "total_bytes": total_bytes,
        "heap_bytes": heap_bytes,
    }


def list_backups() -> list[dict]:
    """List all ``.dump`` files in the backups directory, newest first."""
    out: list[dict] = []
    for p in sorted(get_backups_dir().glob("*.dump"), key=lambda f: f.stat().st_mtime, reverse=True):
        stat = p.stat()
        name = p.stem
        # Parse filename shape: "<db_id>-YYYYMMDD_HHMMSS"
        db_id = "unknown"
        if "-" in name:
            maybe_id, _, tail = name.rpartition("-")
            if maybe_id and len(tail) >= 8:
                db_id = maybe_id
        out.append({
            "filename": p.name,
            "path": str(p),
            "db_id": db_id,
            "size_bytes": stat.st_size,
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
        })
    return out
