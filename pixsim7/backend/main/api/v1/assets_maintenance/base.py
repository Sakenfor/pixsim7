"""Shared helpers for the asset-maintenance endpoints."""
from pydantic import BaseModel


def _coverage_pct(numerator: float, denominator: float) -> float:
    """Coverage percentage, guarding division by zero. Callers round as needed."""
    return (numerator / denominator * 100) if denominator > 0 else 0.0


class BackfillResultBase(BaseModel):
    """Shared shape for batch backfill responses.

    Every backfill endpoint reports the rows it walked (`processed`), left
    untouched (`skipped`), and that raised (`errors`), plus an overall
    `success` flag. Endpoint-specific success counters (updated / linked /
    synced / converted / …) are added by subclasses.

    `BackfillFolderContextResponse` stays standalone — its phase-based
    counters don't roll up into a single `processed` total.
    """
    success: bool
    processed: int
    skipped: int
    errors: int
