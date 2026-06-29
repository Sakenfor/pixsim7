"""
Shared enums for PixSim7 domain models
"""
from enum import Enum
from typing import Type

from sqlalchemy import Column, Enum as SAEnum


def enum_column(enum_cls: Type[Enum], name: str, index: bool = False) -> Column:
    """Create SQLAlchemy Enum column that properly maps str,Enum values.

    Uses values_callable to ensure lowercase enum values are used for storage.
    The enum name is prefixed with underscore to avoid conflicts with any
    cached enum types that may have been created with wrong values.

    Args:
        enum_cls: The Python Enum class (must inherit from str, Enum)
        name: The database enum type name
        index: Whether to create an index on this column
    """
    return Column(
        SAEnum(
            enum_cls,
            name=f"_{name}",  # Prefix to avoid cache conflicts with old types
            native_enum=False,
            create_constraint=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        index=index,
    )


def normalize_enum(v, enum_cls: Type[Enum]):
    """Normalize enum value - handles both uppercase DB values and enum instances.

    Use this in Pydantic field_validators or SQLAlchemy model validators to
    handle legacy uppercase enum values stored in the database.

    Args:
        v: The value to normalize (can be enum instance, string, or None)
        enum_cls: The target enum class

    Returns:
        The enum member, or the original value if already correct type or None
    """
    if v is None or isinstance(v, enum_cls):
        return v
    if isinstance(v, str):
        return enum_cls(v.lower())
    return v


class MediaType(str, Enum):
    """Asset media type"""
    VIDEO = "video"
    IMAGE = "image"
    AUDIO = "audio"
    MODEL_3D = "3d_model"


class SyncStatus(str, Enum):
    """Asset synchronization status"""
    REMOTE = "remote"           # Only exists on provider
    DOWNLOADING = "downloading" # Download in progress
    DOWNLOADED = "downloaded"   # Local copy exists
    ERROR = "error"            # Download failed


class GenerationStatus(str, Enum):
    """Generation execution status"""
    PENDING = "pending"
    PROCESSING = "processing"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class OperationType(str, Enum):
    """Content generation operation types"""
    TEXT_TO_IMAGE = "text_to_image"
    IMAGE_TO_IMAGE = "image_to_image"
    TEXT_TO_VIDEO = "text_to_video"
    IMAGE_TO_VIDEO = "image_to_video"
    VIDEO_EXTEND = "video_extend"
    VIDEO_TRANSITION = "video_transition"
    VIDEO_MODIFY = "video_modify"
    FUSION = "fusion"
    FRAME_EXTRACTION = "frame_extraction"  # Extract frame from video
    IMAGE_EDIT = "image_edit"              # Multi-image edit/combine
    IMAGE_COMPOSITE = "image_composite"    # Layer-based composition


class InfluenceType(str, Enum):
    """How a parent asset influenced the output in multi-image operations."""
    CONTENT = "content"           # Provides subject/objects
    STYLE = "style"               # Provides aesthetic/style
    STRUCTURE = "structure"       # Provides composition/pose/layout
    MASK = "mask"                 # Affects specific masked region
    BLEND = "blend"               # Blended/mixed into result
    REPLACEMENT = "replacement"   # Replaces element from another input
    REFERENCE = "reference"       # Visual reference only (not directly used)


class AccountStatus(str, Enum):
    """Provider account status"""
    ACTIVE = "active"
    EXHAUSTED = "exhausted"
    ERROR = "error"
    DISABLED = "disabled"
    RATE_LIMITED = "rate_limited"


class ProviderStatus(str, Enum):
    """Universal provider operation status (for images, videos, and all generation types)"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    FILTERED = "filtered"  # Content policy violation
    CANCELLED = "cancelled"


class ReviewStatus(str, Enum):
    """Approval workflow status for user-created presets."""
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ContentDomain(str, Enum):
    """Content domain for specialized metadata"""
    GENERAL = "general"
    ADULT = "adult"
    MEDICAL = "medical"
    SPORTS = "sports"
    FASHION = "fashion"
    EDUCATION = "education"


class BillingState(str, Enum):
    """Generation billing state"""
    PENDING = "pending"    # Not yet charged (generation in progress)
    CHARGED = "charged"    # Credits successfully deducted
    SKIPPED = "skipped"    # No charge (failed/cancelled generation)
    FAILED = "failed"      # Deduction attempted but failed


class GenerationOrigin(str, Enum):
    """Origin of generation record"""
    LOCAL = "local"          # Created via UI/API
    SYNC = "sync"            # Imported from provider (synthetic generation)
    MIGRATION = "migration"  # Backfilled from legacy data


class GenerationErrorCode(str, Enum):
    """Structured error codes for generation failures.

    Single source of truth for error categorisation. Each code indicates
    *why* a generation failed so that consumers (job processor, retry
    service, frontend) can dispatch on the code instead of parsing
    the human-readable error_message string.
    """

    # Content moderation
    CONTENT_PROMPT_REJECTED = "content_prompt_rejected"
    CONTENT_TEXT_REJECTED = "content_text_rejected"
    CONTENT_OUTPUT_REJECTED = "content_output_rejected"
    CONTENT_IMAGE_REJECTED = "content_image_rejected"
    CONTENT_FILTERED = "content_filtered"
    # Render-time moderation with NO usable output: the provider reported a
    # FILTERED terminal AND the real CDN file never became retrievable (we
    # re-probe the preserved /ori/ URL before classifying — a 200 there is
    # salvaged to COMPLETED instead). Distinct from CONTENT_FILTERED (retryable,
    # "output varies") because here the job genuinely produced no video and the
    # same prompt keeps failing fast. Retryable (some prompts pass on a re-roll)
    # but backed off + capped by the per-prompt render-moderation retry cap
    # (worker_concurrency): once a prompt+image fails N times in a row, AUTO-
    # retry is suppressed (job stays Failed — still manually retryable, never
    # paused). Also TWEAKABLE, so an operator can flip it terminal live from the
    # error catalog if a provider rollout changes things.
    CONTENT_RENDER_MODERATED = "content_render_moderated"
    # External partner (e.g. fal-proxied models like grok-imagine, happyhorse-1.0)
    # accepted the job then refused mid-stream. We don't get a structured reason
    # back — could be prompt, image, or some other partner-side policy. Distinct
    # from CONTENT_PROMPT_REJECTED (which implies the prompt specifically was the
    # trigger) and from CONTENT_FILTERED (which is retryable on the assumption
    # that output varies — false here since the partner refused the input).
    EXTERNAL_PARTNER_REFUSED = "external_partner_refused"

    # Parameter validation (all non-retryable)
    PARAM_TOO_LONG = "param_too_long"
    PARAM_INVALID = "param_invalid"
    PARAM_MISSING = "param_missing"
    PARAM_ASSET_UNRESOLVABLE = "param_asset_unresolvable"

    # Provider errors
    PROVIDER_QUOTA = "provider_quota"
    PROVIDER_RATE_LIMIT = "provider_rate_limit"
    PROVIDER_CONCURRENT_LIMIT = "provider_concurrent_limit"
    PROVIDER_AUTH = "provider_auth"
    PROVIDER_TIMEOUT = "provider_timeout"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    PROVIDER_GENERIC = "provider_generic"


# Which codes are worth retrying by DEFAULT (transient / output-varies).
# Per-code overrides (see services/generation/error_policy.py) can flip the
# retryability of TWEAKABLE_ERROR_CODES at runtime without a code change.
RETRYABLE_ERROR_CODES: frozenset[GenerationErrorCode] = frozenset({
    GenerationErrorCode.CONTENT_OUTPUT_REJECTED,
    GenerationErrorCode.CONTENT_IMAGE_REJECTED,
    GenerationErrorCode.CONTENT_FILTERED,
    # Retryable because pixverse occasionally renders a prompt its moderation
    # usually filters — but auto-retry is capped per-prompt (worker_concurrency
    # render-moderation retry cap) so a persistently-filtered prompt stops
    # auto-retrying instead of churning. Retries are backed off + same-account.
    GenerationErrorCode.CONTENT_RENDER_MODERATED,
    GenerationErrorCode.PROVIDER_QUOTA,
    GenerationErrorCode.PROVIDER_CONCURRENT_LIMIT,
    GenerationErrorCode.PROVIDER_RATE_LIMIT,
    GenerationErrorCode.PROVIDER_UNAVAILABLE,
    GenerationErrorCode.PROVIDER_TIMEOUT,
    GenerationErrorCode.PROVIDER_GENERIC,
})

# Codes whose retry policy is a judgment call (output varies / provider
# behavior shifts over time, e.g. the pixverse v6 moderation change). Only
# these may be tuned via per-code overrides — deterministic input rejections
# (param_*, prompt/text rejected) and partner refusals stay fixed.
TWEAKABLE_ERROR_CODES: frozenset[GenerationErrorCode] = frozenset({
    GenerationErrorCode.CONTENT_FILTERED,
    GenerationErrorCode.CONTENT_OUTPUT_REJECTED,
    GenerationErrorCode.CONTENT_IMAGE_REJECTED,
    GenerationErrorCode.CONTENT_RENDER_MODERATED,
})

# Error codes that count as a "filtered" outcome when computing a prompt's
# success rate (passed = COMPLETED; filtered = these; rate = passed/(passed+
# filtered), with all OTHER outcomes — quota, timeouts, param errors — excluded
# from the denominator). Single source of truth shared by the prompt-box
# moderation chip (/generations/prompt-stats) and the gallery "prompt success
# rate" filter, so the two numbers can never drift. content_render_moderated is
# the i2v/t2v fast-fail; content_filtered is the i2i filter.
FILTERED_OUTCOME_ERROR_CODES: frozenset[GenerationErrorCode] = frozenset({
    GenerationErrorCode.CONTENT_RENDER_MODERATED,
    GenerationErrorCode.CONTENT_FILTERED,
})

# Coarse grouping for display in the error catalog.
ERROR_CODE_CATEGORY: dict[GenerationErrorCode, str] = {
    GenerationErrorCode.CONTENT_PROMPT_REJECTED: "moderation",
    GenerationErrorCode.CONTENT_TEXT_REJECTED: "moderation",
    GenerationErrorCode.CONTENT_OUTPUT_REJECTED: "moderation",
    GenerationErrorCode.CONTENT_IMAGE_REJECTED: "moderation",
    GenerationErrorCode.CONTENT_FILTERED: "moderation",
    GenerationErrorCode.CONTENT_RENDER_MODERATED: "moderation",
    GenerationErrorCode.EXTERNAL_PARTNER_REFUSED: "moderation",
    GenerationErrorCode.PARAM_TOO_LONG: "param",
    GenerationErrorCode.PARAM_INVALID: "param",
    GenerationErrorCode.PARAM_MISSING: "param",
    GenerationErrorCode.PARAM_ASSET_UNRESOLVABLE: "param",
    GenerationErrorCode.PROVIDER_QUOTA: "provider",
    GenerationErrorCode.PROVIDER_RATE_LIMIT: "provider",
    GenerationErrorCode.PROVIDER_CONCURRENT_LIMIT: "provider",
    GenerationErrorCode.PROVIDER_AUTH: "provider",
    GenerationErrorCode.PROVIDER_TIMEOUT: "provider",
    GenerationErrorCode.PROVIDER_UNAVAILABLE: "provider",
    GenerationErrorCode.PROVIDER_GENERIC: "provider",
}

# Human-readable descriptions surfaced in the error catalog (single source of
# truth — keep in sync with the enum). Terse, one line each.
ERROR_CODE_DESCRIPTIONS: dict[GenerationErrorCode, str] = {
    GenerationErrorCode.CONTENT_PROMPT_REJECTED: "Provider rejected the prompt at submit time (deterministic).",
    GenerationErrorCode.CONTENT_TEXT_REJECTED: "Provider rejected the text input at submit time.",
    GenerationErrorCode.CONTENT_OUTPUT_REJECTED: "Rendered output was moderated; a re-roll may pass.",
    GenerationErrorCode.CONTENT_IMAGE_REJECTED: "Source image was rejected by moderation.",
    GenerationErrorCode.CONTENT_FILTERED: "Generic content filter; output varies, so a retry may pass.",
    GenerationErrorCode.CONTENT_RENDER_MODERATED: "Accepted at submit but moderated at render with no retrievable video (early/fast fail).",
    GenerationErrorCode.EXTERNAL_PARTNER_REFUSED: "Fal-proxied partner accepted then refused mid-stream (no structured reason).",
    GenerationErrorCode.PARAM_TOO_LONG: "A parameter exceeded the provider's length limit.",
    GenerationErrorCode.PARAM_INVALID: "A parameter value was invalid for this operation.",
    GenerationErrorCode.PARAM_MISSING: "A required parameter was missing.",
    GenerationErrorCode.PARAM_ASSET_UNRESOLVABLE: "An input asset reference could not be resolved.",
    GenerationErrorCode.PROVIDER_QUOTA: "Account out of credits/quota; another account may have capacity.",
    GenerationErrorCode.PROVIDER_RATE_LIMIT: "Provider rate-limited the request.",
    GenerationErrorCode.PROVIDER_CONCURRENT_LIMIT: "Provider concurrent-job limit hit.",
    GenerationErrorCode.PROVIDER_AUTH: "Provider authentication/session failure.",
    GenerationErrorCode.PROVIDER_TIMEOUT: "Provider did not respond in time.",
    GenerationErrorCode.PROVIDER_UNAVAILABLE: "Provider temporarily unavailable.",
    GenerationErrorCode.PROVIDER_GENERIC: "Unspecified provider-side failure.",
}
