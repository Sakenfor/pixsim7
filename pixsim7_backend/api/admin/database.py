"""
Database admin API endpoints
Provides migration status, schema viewing, SQL query execution, and table browsing
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from alembic.config import Config
from alembic.script import ScriptDirectory
from typing import Dict, Any
import logging
import time

from pixsim7_backend.api.dependencies import get_db, require_admin
from pixsim7_backend.domain import User

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/admin/database/status")
async def get_database_status(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get database and migration status (read-only)

    Returns:
        - Current migration version
        - Latest available migration
        - Database health metrics (table counts)
    """
    try:
        # Get current migration version from database
        result = await db.execute(text("SELECT version_num FROM alembic_version"))
        current_version = result.scalar_one_or_none()

        # Get latest version from migration scripts
        config = Config("pixsim7_backend/infrastructure/database/alembic.ini")
        script = ScriptDirectory.from_config(config)
        latest_version = script.get_current_head()

        # Get table counts
        table_counts = {}
        tables = ['jobs', 'assets', 'provider_accounts', 'provider_submissions', 'users']

        for table in tables:
            try:
                count_result = await db.execute(text(f"SELECT COUNT(*) FROM {table}"))
                table_counts[table] = count_result.scalar()
            except Exception as e:
                logger.warning(f"Failed to count {table}: {e}")
                table_counts[table] = 0

        return {
            "migration": {
                "current": current_version,
                "latest": latest_version,
                "upToDate": current_version == latest_version,
                "pending": current_version != latest_version
            },
            "health": {
                "status": "healthy",
                "tables": table_counts
            }
        }
    except Exception as e:
        logger.error(f"Failed to get database status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/database/schema")
async def get_schema(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Get list of all tables in the database"""
    try:
        result = await db.execute(text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            ORDER BY table_name
        """))

        tables = [row[0] for row in result.fetchall()]

        return {"tables": tables}
    except Exception as e:
        logger.error(f"Failed to get schema: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/database/schema/{table_name}")
async def get_table_schema(
    table_name: str,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Get detailed schema for a specific table"""
    try:
        # Get column information
        columns_result = await db.execute(text("""
            SELECT
                column_name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
            AND table_name = :table_name
            ORDER BY ordinal_position
        """), {"table_name": table_name})

        columns = []
        for row in columns_result.fetchall():
            columns.append({
                "name": row[0],
                "type": row[1],
                "nullable": row[2] == 'YES',
                "default": row[3],
                "isPrimary": False,
                "isForeign": False
            })

        return {
            "table": table_name,
            "columns": columns,
            "indexes": []
        }
    except Exception as e:
        logger.error(f"Failed to get table schema for {table_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/database/tables/{table_name}")
async def browse_table_data(
    table_name: str,
    limit: int = 20,
    offset: int = 0,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Browse data in a table with pagination"""
    try:
        # Validate table name (security) using whitelist from information_schema
        # Only allow public base tables
        allowed_tables_result = await db.execute(text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        """))
        allowed_tables = {row[0] for row in allowed_tables_result.fetchall()}
        if table_name not in allowed_tables:
            raise HTTPException(status_code=400, detail="Table not allowed")

        # Clamp pagination
        limit = max(1, min(limit, 500))
        offset = max(0, offset)

        # Get total count
        count_result = await db.execute(text(f"SELECT COUNT(*) FROM \"{table_name}\""))
        total = count_result.scalar()

        # Get data
        data_result = await db.execute(
            text(f"SELECT * FROM \"{table_name}\" LIMIT :limit OFFSET :offset"),
            {"limit": limit, "offset": offset}
        )

        # Convert to dict
        rows = []
        for row in data_result.fetchall():
            rows.append(dict(row._mapping))

        return {
            "table": table_name,
            "rows": rows,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Failed to browse table {table_name}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/database/query")
async def execute_query(
    request: Dict[str, Any],
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """
    Execute a SQL query (with safety checks)

    Body:
        - query: SQL query string
        - readOnly: boolean (default true)
    """
    try:
        query = request.get("query", "").strip()
        read_only = request.get("readOnly", True)

        if not query:
            raise HTTPException(status_code=400, detail="Query is required")

        # Enforce single-statement queries (no semicolons)
        if ';' in query:
            raise HTTPException(status_code=400, detail="Multiple statements not allowed")

        # Allowlist for read-only queries
        if read_only:
            q = query.strip().lstrip('(').lower()
            allowed_prefixes = (
                "select ",  # standard select
                "with ",    # CTEs
                "explain ", # explain plans
                "show ",    # show statements (if supported)
                "values ",  # values lists
            )
            if not q.startswith(allowed_prefixes):
                raise HTTPException(status_code=403, detail="Query type not allowed in read-only mode")

        # Execute query with timeout and read-only transaction if requested
        start = time.time()
        if read_only:
            async with db.begin():
                # Set transaction read-only and a short statement timeout
                await db.execute(text("SET TRANSACTION READ ONLY"))
                await db.execute(text("SET LOCAL statement_timeout = 3000"))
                result = await db.execute(text(query))
        else:
            # Non-read-only: still set a statement timeout
            async with db.begin():
                await db.execute(text("SET LOCAL statement_timeout = 5000"))
                result = await db.execute(text(query))
                # Commit effects if any
                await db.commit()
        duration_ms = int((time.time() - start) * 1000)

        # Try to fetch rows
        try:
            rows = []
            for row in result.fetchall():
                rows.append(dict(row._mapping))

            return {
                "rows": rows,
                "rowCount": len(rows),
                "duration": duration_ms
            }
        except Exception:
            # Query didn't return rows
            return {
                "rows": [],
                "rowCount": result.rowcount,
                "duration": duration_ms
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Query execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
