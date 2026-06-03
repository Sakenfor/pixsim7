"""Per-error-code retry policy overrides.

By default a generation's retryability is decided by the static
``RETRYABLE_ERROR_CODES`` set. Provider behavior shifts over time, though
(e.g. the pixverse v6 render-time moderation change), so for the small set of
*judgment-call* codes (``TWEAKABLE_ERROR_CODES``) we allow a DB-backed override
to flip retryability and/or set a per-code max-attempts cap — tunable live from
the error catalog in Library → Maintenance, no code change needed.

Overrides are stored as plain JSON (``dict[str, dict]``) keyed by the
``GenerationErrorCode`` value, so settings persistence stays simple. Only codes
in ``TWEAKABLE_ERROR_CODES`` are honoured; a stale override for any other code
is ignored.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from pixsim7.backend.main.domain.enums import TWEAKABLE_ERROR_CODES
from pixsim7.backend.main.services.system_config.settings_base import SettingsBase

# String values of the tweakable codes — convenient for membership checks
# against the raw ``error_code`` strings stored on generations.
TWEAKABLE_ERROR_CODE_VALUES: frozenset[str] = frozenset(
    c.value for c in TWEAKABLE_ERROR_CODES
)


class ErrorPolicyOverride(BaseModel):
    """Resolved override for one error code."""

    retryable: bool
    # None → fall back to the global auto_retry_max_attempts.
    max_attempts: int | None = Field(default=None, ge=1, le=20)


class GenerationErrorPolicySettings(SettingsBase):
    """Per-error-code retry overrides (judgment-call content_* codes only)."""

    _namespace = "generation_error_policy"

    overrides: dict[str, dict] = Field(
        default_factory=dict,
        description=(
            "Per-error-code retry overrides keyed by GenerationErrorCode value. "
            "Each value: {retryable: bool, max_attempts: int|null}. Only "
            "tweakable content_* codes are honoured."
        ),
    )


def get_error_policy_settings() -> GenerationErrorPolicySettings:
    """Global GenerationErrorPolicySettings singleton."""
    return GenerationErrorPolicySettings.get()  # type: ignore[return-value]


def parse_override(raw: object) -> ErrorPolicyOverride | None:
    """Parse a stored raw override dict, or None if absent/malformed.

    Single source of truth for override parsing (shared by the runtime retry
    check and the error-catalog endpoint) — a malformed stored value falls back
    to defaults rather than raising.
    """
    if not isinstance(raw, dict):
        return None
    try:
        return ErrorPolicyOverride(**raw)
    except Exception:
        return None


def get_error_policy_override(error_code: str | None) -> ErrorPolicyOverride | None:
    """Resolve a per-code override, or None if there isn't a valid, honoured one.

    Gated on ``TWEAKABLE_ERROR_CODE_VALUES`` so an override left behind for a
    non-tweakable code (e.g. after the tweakable set shrinks) is ignored.
    """
    if not error_code or error_code not in TWEAKABLE_ERROR_CODE_VALUES:
        return None
    return parse_override(get_error_policy_settings().overrides.get(error_code))
