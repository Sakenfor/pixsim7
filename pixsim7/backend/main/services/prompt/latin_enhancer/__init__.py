"""Latin enhancer composer — picks N tagged Latin variants and joins them."""

from .composer import (
    ComposeRequest,
    ComposeResponse,
    ComposedVariant,
    LATIN_ENHANCER_CAPABILITY,
    LENGTH_TIER_COUNTS,
    INTENSITY_ORDER,
    compose,
    compose_pure,
    fetch_latin_pool,
    resolve_intensity_curve,
)

__all__ = [
    "ComposeRequest",
    "ComposeResponse",
    "ComposedVariant",
    "LATIN_ENHANCER_CAPABILITY",
    "LENGTH_TIER_COUNTS",
    "INTENSITY_ORDER",
    "compose",
    "compose_pure",
    "fetch_latin_pool",
    "resolve_intensity_curve",
]
