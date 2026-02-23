"""Shared Pixverse concurrency resolution helpers.

Keeps plan-sync and auth/import paths aligned on how `max_concurrent_jobs`
is derived and how fallback provenance is reported.
"""

from typing import Any, Dict, Optional

PIXVERSE_FREE_MAX_CONCURRENT_JOBS = 2
PIXVERSE_PRO_MAX_CONCURRENT_JOBS = 5


def coerce_positive_int(value: Any) -> Optional[int]:
    """Coerce provider values like 5 / '5' / '5.0' into a positive int."""
    try:
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value if value > 0 else None
        if isinstance(value, float):
            iv = int(value)
            return iv if iv > 0 else None
        if isinstance(value, str):
            s = value.strip()
            if not s:
                return None
            if s.isdigit():
                iv = int(s)
                return iv if iv > 0 else None
            fv = float(s)
            iv = int(fv)
            return iv if iv > 0 else None
    except Exception:
        return None
    return None


def coerce_int(value: Any) -> Optional[int]:
    try:
        if isinstance(value, bool):
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            s = value.strip()
            if not s:
                return None
            if s.lstrip("-").isdigit():
                return int(s)
            return int(float(s))
    except Exception:
        return None
    return None


def resolve_pixverse_max_concurrent_jobs(
    payload: Dict[str, Any],
    *,
    allow_sdk_max: bool = True,
    allow_plan_type_fallback: bool = True,
) -> Dict[str, Any]:
    """Resolve Pixverse concurrency from a plan/user payload.

    Priority:
    1) Raw provider `gen_simultaneously` (authoritative when present)
    2) `max_concurrent_jobs` from SDK/user-info normalization (optional)
    3) Backend fallback from `current_plan_type` (optional)
    """
    gen_raw = payload.get("gen_simultaneously")
    gen = coerce_positive_int(gen_raw)
    sdk_raw = payload.get("max_concurrent_jobs")
    sdk = coerce_positive_int(sdk_raw) if allow_sdk_max else None
    plan_type = coerce_int(payload.get("current_plan_type"))
    is_pro = bool(plan_type is not None and plan_type >= 1)

    if gen is not None:
        return {
            "max_concurrent_jobs": gen,
            "source": "provider_gen_simultaneously",
            "plan_gen_simultaneously": gen,
            "plan_max_concurrent_jobs_raw": sdk_raw,
            "plan_max_concurrent_jobs_parsed": coerce_positive_int(sdk_raw),
            "plan_type": plan_type,
            "is_pro": is_pro,
        }

    if sdk is not None:
        return {
            "max_concurrent_jobs": sdk,
            "source": "sdk_normalized_or_fallback",
            "plan_gen_simultaneously": None,
            "plan_max_concurrent_jobs_raw": sdk_raw,
            "plan_max_concurrent_jobs_parsed": sdk,
            "plan_type": plan_type,
            "is_pro": is_pro,
        }

    if allow_plan_type_fallback and plan_type is not None:
        fallback_value = PIXVERSE_PRO_MAX_CONCURRENT_JOBS if plan_type >= 1 else PIXVERSE_FREE_MAX_CONCURRENT_JOBS
        return {
            "max_concurrent_jobs": fallback_value,
            "source": "backend_plan_type_fallback",
            "plan_gen_simultaneously": None,
            "plan_max_concurrent_jobs_raw": sdk_raw,
            "plan_max_concurrent_jobs_parsed": coerce_positive_int(sdk_raw),
            "plan_type": plan_type,
            "is_pro": is_pro,
        }

    return {
        "max_concurrent_jobs": None,
        "source": None,
        "plan_gen_simultaneously": None,
        "plan_max_concurrent_jobs_raw": sdk_raw,
        "plan_max_concurrent_jobs_parsed": coerce_positive_int(sdk_raw),
        "plan_type": plan_type,
        "is_pro": is_pro,
    }

