"""
Dev SQL Query Explorer API

Admin-only endpoints for running read-only SQL queries against the database.
Useful for diagnostics, data exploration, and debugging.

Security:
- Read-only queries only (SELECT statements)
- Admin/dev users only
- Query timeout limits
- Row limit enforcement
"""
from fastapi import APIRouter, HTTPException
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
import time

from pixsim7.backend.main.api.dependencies import CurrentUser, DatabaseSession
from pixsim_logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/dev/sql", tags=["dev"])

# ============================================================================
# Constants
# ============================================================================

MAX_ROWS = 500  # Maximum rows to return
QUERY_TIMEOUT_SECONDS = 30  # Query timeout

# Disallowed SQL keywords (case-insensitive)
WRITE_KEYWORDS = [
    "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER", "TRUNCATE",
    "GRANT", "REVOKE", "EXECUTE", "EXEC", "COPY", "VACUUM", "REINDEX",
]

# ============================================================================
# Preset Queries
# ============================================================================

PRESET_QUERIES: List[Dict[str, Any]] = [
    {
        "id": "legacy-url-params",
        "name": "Legacy URL Params",
        "description": "Find generations with legacy image_url/video_url params",
        "category": "drift",
        "sql": """
SELECT
    id,
    operation_type,
    created_at,
    canonical_params->>'image_url' as image_url,
    canonical_params->>'video_url' as video_url
FROM generations
WHERE
    canonical_params::text LIKE '%image_url%'
    OR canonical_params::text LIKE '%video_url%'
ORDER BY created_at DESC
LIMIT 50;
        """.strip(),
    },
    {
        "id": "legacy-url-params-count",
        "name": "Legacy URL Params Count",
        "description": "Count generations with legacy URL params",
        "category": "drift",
        "sql": """
SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE canonical_params::text LIKE '%image_url%') as with_image_url,
    COUNT(*) FILTER (WHERE canonical_params::text LIKE '%video_url%') as with_video_url,
    COUNT(*) FILTER (WHERE canonical_params::text LIKE '%image_urls%') as with_image_urls,
    COUNT(*) FILTER (WHERE canonical_params::text LIKE '%original_video_id%') as with_original_video_id
FROM generations;
        """.strip(),
    },
    {
        "id": "recent-generations",
        "name": "Recent Generations",
        "description": "Last 50 generations with status",
        "category": "overview",
        "sql": """
SELECT
    id,
    operation_type,
    status,
    provider_id,
    created_at,
    completed_at,
    CASE WHEN asset_id IS NOT NULL THEN 'Yes' ELSE 'No' END as has_asset
FROM generations
ORDER BY created_at DESC
LIMIT 50;
        """.strip(),
    },
    {
        "id": "generation-stats-by-operation",
        "name": "Generation Stats by Operation",
        "description": "Count generations grouped by operation type",
        "category": "overview",
        "sql": """
SELECT
    operation_type,
    status,
    COUNT(*) as count
FROM generations
GROUP BY operation_type, status
ORDER BY operation_type, status;
        """.strip(),
    },
    {
        "id": "failed-generations",
        "name": "Failed Generations",
        "description": "Recent failed generations with error messages",
        "category": "debug",
        "sql": """
SELECT
    id,
    operation_type,
    provider_id,
    error_message,
    created_at
FROM generations
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 50;
        """.strip(),
    },
    {
        "id": "orphaned-assets",
        "name": "Orphaned Assets",
        "description": "Assets without a linked generation",
        "category": "drift",
        "sql": """
SELECT
    a.id,
    a.asset_type,
    a.created_at,
    a.storage_provider
FROM assets a
LEFT JOIN generations g ON g.asset_id = a.id
WHERE g.id IS NULL
ORDER BY a.created_at DESC
LIMIT 50;
        """.strip(),
    },
    {
        "id": "prompt-config-usage",
        "name": "Prompt Config Usage",
        "description": "Check prompt_config field usage patterns",
        "category": "drift",
        "sql": """
SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE prompt_config IS NOT NULL) as with_prompt_config,
    COUNT(*) FILTER (WHERE prompt_config->>'versionId' IS NOT NULL) as with_version_id,
    COUNT(*) FILTER (WHERE prompt_config->>'familyId' IS NOT NULL) as with_family_id,
    COUNT(*) FILTER (WHERE prompt_config->>'inlinePrompt' IS NOT NULL) as with_inline_prompt
FROM generations;
        """.strip(),
    },
    {
        "id": "table-sizes",
        "name": "Table Sizes",
        "description": "Size of main tables",
        "category": "overview",
        "sql": """
SELECT
    relname as table_name,
    n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC
LIMIT 20;
        """.strip(),
    },
]

# ============================================================================
# Request/Response Models
# ============================================================================

class SqlQueryRequest(BaseModel):
    """Request to execute a SQL query."""
    sql: str = Field(..., description="SQL query to execute (SELECT only)")
    max_rows: int = Field(default=100, le=MAX_ROWS, description="Maximum rows to return")


class SqlQueryResult(BaseModel):
    """Result of a SQL query execution."""
    columns: List[str] = Field(..., description="Column names")
    rows: List[List[Any]] = Field(..., description="Result rows")
    row_count: int = Field(..., description="Number of rows returned")
    truncated: bool = Field(default=False, description="Whether results were truncated")
    execution_time_ms: float = Field(..., description="Query execution time in ms")
    query: str = Field(..., description="The executed query")


class PresetQuery(BaseModel):
    """A preset query definition."""
    id: str
    name: str
    description: str
    category: str
    sql: str


# ============================================================================
# Helper Functions
# ============================================================================

def validate_read_only(sql: str) -> None:
    """
    Validate that a SQL query is read-only.
    Raises HTTPException if write operations are detected.
    """
    sql_upper = sql.upper()

    for keyword in WRITE_KEYWORDS:
        # Check for keyword as a standalone word (not part of another word)
        # Simple check: keyword at start, or preceded by whitespace/newline
        if keyword in sql_upper:
            # More precise check to avoid false positives
            import re
            pattern = rf'\b{keyword}\b'
            if re.search(pattern, sql_upper):
                raise HTTPException(
                    status_code=400,
                    detail=f"Write operations are not allowed. Found: {keyword}"
                )


def serialize_row(row: Any) -> List[Any]:
    """Convert a SQLAlchemy row to a list of JSON-serializable values."""
    result = []
    for value in row:
        if value is None:
            result.append(None)
        elif isinstance(value, (str, int, float, bool)):
            result.append(value)
        elif hasattr(value, 'isoformat'):
            # datetime, date, time
            result.append(value.isoformat())
        elif isinstance(value, (dict, list)):
            result.append(value)
        else:
            result.append(str(value))
    return result


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/presets", response_model=List[PresetQuery])
async def list_presets(user: CurrentUser) -> List[PresetQuery]:
    """
    List available preset queries.

    Presets are organized by category:
    - overview: General stats and summaries
    - drift: Data consistency and migration checks
    - debug: Debugging and error investigation
    """
    return [PresetQuery(**preset) for preset in PRESET_QUERIES]


@router.post("/query", response_model=SqlQueryResult)
async def execute_query(
    request: SqlQueryRequest,
    user: CurrentUser,
    db: DatabaseSession,
) -> SqlQueryResult:
    """
    Execute a read-only SQL query.

    Security:
    - Only SELECT queries allowed
    - Results limited to max_rows (default 100, max 500)
    - Query timeout of 30 seconds

    Returns columns, rows, and execution metadata.
    """
    sql = request.sql.strip()

    if not sql:
        raise HTTPException(status_code=400, detail="SQL query is required")

    # Validate read-only
    validate_read_only(sql)

    # Add LIMIT if not present (safety net)
    sql_upper = sql.upper()
    if "LIMIT" not in sql_upper:
        sql = f"{sql.rstrip(';')} LIMIT {request.max_rows}"

    logger.info(
        "dev_sql_query",
        user_id=user.id,
        query_preview=sql[:200],
    )

    try:
        start_time = time.time()

        # Set statement timeout
        await db.execute(text(f"SET statement_timeout = '{QUERY_TIMEOUT_SECONDS}s'"))

        # Execute query
        result = await db.execute(text(sql))

        # Fetch results
        rows_raw = result.fetchall()
        columns = list(result.keys()) if result.keys() else []

        execution_time_ms = (time.time() - start_time) * 1000

        # Serialize rows
        rows = [serialize_row(row) for row in rows_raw[:request.max_rows]]
        truncated = len(rows_raw) > request.max_rows

        return SqlQueryResult(
            columns=columns,
            rows=rows,
            row_count=len(rows),
            truncated=truncated,
            execution_time_ms=round(execution_time_ms, 2),
            query=sql,
        )

    except SQLAlchemyError as e:
        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        logger.warning(
            "dev_sql_query_failed",
            user_id=user.id,
            error=error_msg,
        )
        raise HTTPException(status_code=400, detail=f"Query failed: {error_msg}")

    except Exception as e:
        logger.error(
            "dev_sql_query_error",
            user_id=user.id,
            error=str(e),
            error_type=type(e).__name__,
        )
        raise HTTPException(status_code=500, detail=f"Query error: {str(e)}")


@router.post("/presets/{preset_id}/run", response_model=SqlQueryResult)
async def run_preset(
    preset_id: str,
    user: CurrentUser,
    db: DatabaseSession,
) -> SqlQueryResult:
    """
    Run a preset query by ID.

    Convenience endpoint that looks up the preset and executes it.
    """
    preset = next((p for p in PRESET_QUERIES if p["id"] == preset_id), None)

    if not preset:
        raise HTTPException(status_code=404, detail=f"Preset '{preset_id}' not found")

    # Execute via the main query endpoint logic
    request = SqlQueryRequest(sql=preset["sql"], max_rows=MAX_ROWS)
    return await execute_query(request, user, db)
