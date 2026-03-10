"""Backward-compatible stats exports.

This module preserves the historical import path:
`pixsim7.backend.main.domain.stats`

Canonical implementation now lives under `domain.game.stats`.
"""

from pixsim7.backend.main.domain.game.stats import *  # noqa: F401,F403

