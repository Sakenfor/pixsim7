"""
Memory Policy Registry

Single source of truth for memory TTLs, decay rates, and thresholds.
Consumed by MemoryService and EmotionalStateService.
"""
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional, Dict, Tuple

from sqlalchemy import case as sa_case

from pixsim7.backend.main.domain.game.entities.npc_memory import (
    MemoryType,
    MemoryImportance,
)


@dataclass(frozen=True)
class MemoryCellPolicy:
    """Policy for a single (MemoryType, MemoryImportance) combination."""
    ttl: Optional[timedelta]
    decay_rate: float


# ── policy table (3 types × 4 importances = 12 entries) ──────────────

MEMORY_POLICY: Dict[Tuple[MemoryType, MemoryImportance], MemoryCellPolicy] = {
    # Long-term
    (MemoryType.LONG_TERM, MemoryImportance.CRITICAL):  MemoryCellPolicy(ttl=None,                  decay_rate=0.001),
    (MemoryType.LONG_TERM, MemoryImportance.IMPORTANT): MemoryCellPolicy(ttl=timedelta(days=365),    decay_rate=0.001),
    (MemoryType.LONG_TERM, MemoryImportance.NORMAL):    MemoryCellPolicy(ttl=timedelta(days=90),     decay_rate=0.001),
    (MemoryType.LONG_TERM, MemoryImportance.TRIVIAL):   MemoryCellPolicy(ttl=timedelta(days=90),     decay_rate=0.001),
    # Short-term
    (MemoryType.SHORT_TERM, MemoryImportance.CRITICAL):  MemoryCellPolicy(ttl=timedelta(days=30),    decay_rate=0.005),
    (MemoryType.SHORT_TERM, MemoryImportance.IMPORTANT): MemoryCellPolicy(ttl=timedelta(days=7),     decay_rate=0.01),
    (MemoryType.SHORT_TERM, MemoryImportance.NORMAL):    MemoryCellPolicy(ttl=timedelta(days=1),     decay_rate=0.02),
    (MemoryType.SHORT_TERM, MemoryImportance.TRIVIAL):   MemoryCellPolicy(ttl=timedelta(hours=6),    decay_rate=0.02),
    # Working
    (MemoryType.WORKING, MemoryImportance.CRITICAL):  MemoryCellPolicy(ttl=timedelta(hours=1), decay_rate=0.005),
    (MemoryType.WORKING, MemoryImportance.IMPORTANT): MemoryCellPolicy(ttl=timedelta(hours=1), decay_rate=0.01),
    (MemoryType.WORKING, MemoryImportance.NORMAL):    MemoryCellPolicy(ttl=timedelta(hours=1), decay_rate=0.02),
    (MemoryType.WORKING, MemoryImportance.TRIVIAL):   MemoryCellPolicy(ttl=timedelta(hours=1), decay_rate=0.02),
}


def get_policy(memory_type: MemoryType, importance: MemoryImportance) -> MemoryCellPolicy:
    """Look up the policy for a (type, importance) pair."""
    try:
        return MEMORY_POLICY[(memory_type, importance)]
    except KeyError:
        raise KeyError(
            f"No memory policy for ({memory_type.value}, {importance.value})"
        )


def build_decay_rate_case(type_col, importance_col):
    """
    Build a SQLAlchemy case() expression for decay rates,
    grouping entries by unique rate for compact SQL.
    """
    from collections import defaultdict

    by_rate: Dict[float, list] = defaultdict(list)
    for (mtype, imp), policy in MEMORY_POLICY.items():
        by_rate[policy.decay_rate].append((mtype, imp))

    # Sort rates so the most common (largest group) is the else_ clause
    sorted_rates = sorted(by_rate.items(), key=lambda kv: -len(kv[1]))
    else_rate = sorted_rates[0][0]

    whens = []
    for rate, combos in sorted_rates[1:]:
        from sqlalchemy import and_ as sa_and, or_ as sa_or
        conditions = sa_or(
            *(sa_and(type_col == mt, importance_col == imp) for mt, imp in combos)
        )
        whens.append((conditions, rate))

    return sa_case(*whens, else_=else_rate)


@dataclass(frozen=True)
class _MemoryConstants:
    """Consolidated magic numbers used across memory services."""
    weakness_threshold: float = 0.1
    access_boost: float = 0.05
    emotion_default_decay: float = 0.1
    emotion_inactivity_threshold: float = 0.05


MEMORY_CONSTANTS = _MemoryConstants()
