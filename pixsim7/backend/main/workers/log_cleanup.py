"""
Log retention cleanup — purges log_entries older than the configured retention period.

Runs as an arq cron job (daily). Reads retention_days from LoggingSettings.
"""
from __future__ import annotations

from pixsim_logging import get_logger

logger = get_logger()


async def cleanup_old_logs(ctx: dict) -> dict:
    """Delete log entries older than the configured retention period."""
    from pixsim7.backend.main.services.logging_config.settings import get_logging_settings
    from pixsim7.backend.main.infrastructure.database.session import AsyncLogSessionLocal
    from sqlalchemy import text

    settings = get_logging_settings()
    retention_days = settings.log_retention_days

    try:
        async with AsyncLogSessionLocal() as db:
            result = await db.execute(
                text(
                    "DELETE FROM log_entries "
                    "WHERE timestamp < now() - make_interval(days => :days)"
                ),
                {"days": retention_days},
            )
            await db.commit()
            deleted = result.rowcount or 0

        if deleted > 0:
            logger.info(
                "log_cleanup_completed",
                deleted=deleted,
                retention_days=retention_days,
                domain="system",
            )
        else:
            logger.debug(
                "log_cleanup_noop",
                retention_days=retention_days,
                domain="system",
            )

        return {"deleted": deleted, "retention_days": retention_days}

    except Exception as e:
        logger.error(
            "log_cleanup_failed",
            error=str(e),
            retention_days=retention_days,
            domain="system",
        )
        return {"deleted": 0, "error": str(e)}
