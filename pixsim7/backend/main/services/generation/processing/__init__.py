"""Host-agnostic generation-processing logic.

The arq generation worker (``workers/job_processor.py``) is a transport host: it
owns the queue/concurrency/lifecycle and delegates the actual processing logic
to this package (``worker-thin-host-canon`` plan, checkpoint
``generation-worker-extraction``). Slice 2 will add a ``GenerationProcessingService``
here that ``process_generation`` calls as thin glue.

Submodules:
- ``errors``: provider-error classification / retryability (static surface).
- ``account_ops``: credit verification, account reserve/release/cooldown, hints.
- ``requeue``: account-rotation requeue + pinned-generation deferral.
"""
from pixsim7.backend.main.services.generation.processing.errors import (
    EXPECTED_ERRORS,
    NON_RETRYABLE_ERROR_PATTERNS,
    _is_non_retryable_error,
    _extract_error_code,
    _is_auth_rotation_error,
    _get_max_tries,
    _is_final_try,
)
from pixsim7.backend.main.services.generation.processing.account_ops import (
    refresh_account_credits,
    refresh_account_credits_best_effort,
    has_sufficient_credits,
    has_positive_credits,
    resolve_required_credit_types,
    _required_generation_credit_hint,
    is_unlimited_model,
    _is_pinned_account,
    _release_account_reservation,
    _apply_account_cooldown,
)
from pixsim7.backend.main.services.generation.processing.requeue import (
    _requeue_generation_for_account_rotation,
    _defer_pinned_generation,
    _count_pending_pinned_siblings,
    _publish_job_retrying,
)

__all__ = [
    # errors
    "EXPECTED_ERRORS",
    "NON_RETRYABLE_ERROR_PATTERNS",
    "_is_non_retryable_error",
    "_extract_error_code",
    "_is_auth_rotation_error",
    "_get_max_tries",
    "_is_final_try",
    # account_ops
    "refresh_account_credits",
    "refresh_account_credits_best_effort",
    "has_sufficient_credits",
    "has_positive_credits",
    "resolve_required_credit_types",
    "_required_generation_credit_hint",
    "is_unlimited_model",
    "_is_pinned_account",
    "_release_account_reservation",
    "_apply_account_cooldown",
    # requeue
    "_requeue_generation_for_account_rotation",
    "_defer_pinned_generation",
    "_count_pending_pinned_siblings",
    "_publish_job_retrying",
]
