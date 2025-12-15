"""
Derivation Engine - Computes derived stat values from semantic types.

This engine resolves semantic types across packages and computes derived
values using the formulas and transforms declared in DerivationCapability.
It enables fully data-driven derivations without hardcoded logic.

Two-phase processing:
1. Formulas: Compute numeric axis values from semantic sources
2. Transforms: Derive categorical/label values from computed axes

Usage:
    from pixsim7.backend.main.domain.stats.derivation_engine import DerivationEngine

    engine = DerivationEngine()

    # Given stat values from active packages
    stat_values = {
        "relationships": {"affinity": 75, "chemistry": 60, "tension": 20},
    }

    # Compute derived mood
    derived = engine.compute_derivations(
        stat_values=stat_values,
        package_ids=["core.relationships", "core.mood"],
    )
    # derived = {
    #     "mood": {
    #         "valence": 75,
    #         "arousal": 60,
    #         "label": "happy",  # From transform rules
    #     }
    # }
"""

from __future__ import annotations

from typing import Dict, List, Optional, Set, Tuple, Any
from dataclasses import dataclass, field
import logging

from .schemas import StatAxis, StatDefinition
from .package_registry import (
    StatPackage,
    get_stat_package,
    get_all_semantic_types,
    find_axes_by_semantic_type,
    get_applicable_derivations,
)
from .derivation_schemas import DerivationCapability, DerivationFormula

logger = logging.getLogger(__name__)


@dataclass
class ResolvedAxis:
    """A resolved axis with its value and metadata."""
    package_id: str
    stat_definition_id: str
    axis_name: str
    axis: StatAxis
    value: float


@dataclass
class DerivationResult:
    """Result of computing a derivation."""
    stat_definition_id: str
    axis_values: Dict[str, float]
    transformed_values: Dict[str, Any] = field(default_factory=dict)
    source_derivation_id: str = ""
    sources_used: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Combine axis and transformed values into a single dict."""
        result: Dict[str, Any] = dict(self.axis_values)
        result.update(self.transformed_values)
        return result


class DerivationEngine:
    """
    Engine for computing derived stat values from semantic types.

    The engine:
    1. Finds all applicable derivations based on available semantic types
    2. Resolves semantic types to actual axis values
    3. Combines multiple sources of the same semantic type
    4. Computes output values using the declared formulas
    5. Applies transform rules to derive categorical values (labels, etc.)
    """

    def compute_derivations(
        self,
        stat_values: Dict[str, Dict[str, Any]],
        package_ids: List[str],
        excluded_derivation_ids: Optional[Set[str]] = None,
        already_computed: Optional[Set[str]] = None,
    ) -> Dict[str, Dict[str, Any]]:
        """
        Compute all applicable derivations given stat values and active packages.

        Args:
            stat_values: Map of stat_definition_id -> {axis_name: value}
            package_ids: List of active package IDs
            excluded_derivation_ids: Optional set of derivation IDs to skip
            already_computed: Optional set of stat_definition_ids that already
                              have explicit values (won't be derived)

        Returns:
            Map of derived stat_definition_id -> {key: value}
            Contains both numeric axis values and transformed values (labels, etc.)
        """
        excluded = excluded_derivation_ids or set()
        computed = already_computed or set(stat_values.keys())

        # Get applicable derivations sorted by priority
        applicable = get_applicable_derivations(package_ids, excluded)

        derived: Dict[str, Dict[str, Any]] = {}

        for pkg, capability in applicable:
            # Skip if target stat is already computed/derived
            if capability.to_stat_definition in computed:
                logger.debug(
                    f"Skipping derivation {capability.id}: "
                    f"{capability.to_stat_definition} already has values"
                )
                continue

            # Try to compute this derivation
            result = self._compute_derivation(
                capability=capability,
                stat_values={**stat_values, **derived},  # Include already derived
                package_ids=package_ids,
            )

            if result:
                # Combine axis values and transformed values
                derived[result.stat_definition_id] = result.to_dict()
                computed.add(result.stat_definition_id)
                logger.debug(
                    f"Derived {result.stat_definition_id} from {result.sources_used} "
                    f"using {result.source_derivation_id}: "
                    f"axes={result.axis_values}, transforms={result.transformed_values}"
                )

        return derived

    def _compute_derivation(
        self,
        capability: DerivationCapability,
        stat_values: Dict[str, Dict[str, Any]],
        package_ids: List[str],
    ) -> Optional[DerivationResult]:
        """
        Compute a single derivation.

        Two-phase processing:
        1. Compute axis values from formulas
        2. Apply transform rules to derive categorical values

        Returns None if required semantic types are not available.
        """
        axis_values: Dict[str, float] = {}
        all_sources: List[str] = []

        # Phase 1: Compute axis values from formulas
        for formula in capability.formulas:
            result = self._compute_formula(formula, stat_values, package_ids)
            if result is not None:
                value, sources = result
                axis_values[formula.output_axis] = value
                all_sources.extend(sources)
            else:
                # Formula couldn't be computed - use default value
                default = self._get_axis_default(
                    capability.to_stat_definition,
                    formula.output_axis,
                    package_ids,
                )
                axis_values[formula.output_axis] = default

        # If no formulas produced values and no transforms, skip
        if not axis_values and not capability.transforms:
            return None

        # Phase 2: Apply transform rules
        transformed_values: Dict[str, Any] = {}
        for transform in capability.transforms:
            value = transform.compute(axis_values)
            transformed_values[transform.output_key] = value

        # If we have nothing, return None
        if not axis_values and not transformed_values:
            return None

        return DerivationResult(
            stat_definition_id=capability.to_stat_definition,
            axis_values=axis_values,
            transformed_values=transformed_values,
            source_derivation_id=capability.id,
            sources_used=all_sources,
        )

    def _get_axis_default(
        self,
        stat_def_id: str,
        axis_name: str,
        package_ids: List[str],
    ) -> float:
        """Get default value for an axis from its definition."""
        for pid in package_ids:
            pkg = get_stat_package(pid)
            if pkg and stat_def_id in pkg.definitions:
                stat_def = pkg.definitions[stat_def_id]
                for axis in stat_def.axes:
                    if axis.name == axis_name:
                        return axis.default_value
        return 50.0  # Neutral default

    def _compute_formula(
        self,
        formula: DerivationFormula,
        stat_values: Dict[str, Dict[str, float]],
        package_ids: List[str],
    ) -> Optional[Tuple[float, List[str]]]:
        """
        Compute a single formula's output value.

        Returns (value, sources_used) or None if required sources unavailable.
        """
        # Resolve each semantic type to actual values
        resolved_sources: Dict[str, List[ResolvedAxis]] = {}

        for key, semantic_type in formula.source_semantic_types.items():
            axes = find_axes_by_semantic_type(semantic_type, package_ids)
            if not axes:
                # Required semantic type not available
                logger.debug(
                    f"Formula for {formula.output_axis}: "
                    f"semantic type '{semantic_type}' not available"
                )
                return None

            resolved = []
            for pkg, stat_def, axis in axes:
                # Get the actual value for this axis
                stat_vals = stat_values.get(stat_def.id, {})
                if axis.name in stat_vals:
                    resolved.append(ResolvedAxis(
                        package_id=pkg.id,
                        stat_definition_id=stat_def.id,
                        axis_name=axis.name,
                        axis=axis,
                        value=stat_vals[axis.name],
                    ))

            if not resolved:
                # No actual values for this semantic type
                return None

            resolved_sources[key] = resolved

        # Combine sources for each key
        combined_values: Dict[str, float] = {}
        sources_used: List[str] = []

        for key, resolved_list in resolved_sources.items():
            combined = self._combine_sources(resolved_list, formula.multi_source_strategy)
            combined_values[key] = combined
            sources_used.extend(
                f"{r.package_id}.{r.stat_definition_id}.{r.axis_name}"
                for r in resolved_list
            )

        # Apply transform to get final value
        final_value = self._apply_transform(
            combined_values,
            formula.weights,
            formula.transform,
        )

        # Apply offset
        final_value += formula.offset

        # Normalize if requested
        if formula.normalize:
            final_value = max(0.0, min(100.0, final_value))

        return final_value, sources_used

    def _combine_sources(
        self,
        resolved: List[ResolvedAxis],
        strategy: str,
    ) -> float:
        """
        Combine multiple sources of the same semantic type.

        Uses each axis's semantic_weight for weighted strategies.
        """
        if not resolved:
            return 0.0

        if strategy == "first":
            return resolved[0].value

        if strategy == "max":
            return max(r.value for r in resolved)

        if strategy == "min":
            return min(r.value for r in resolved)

        if strategy == "sum":
            return sum(r.value * r.axis.semantic_weight for r in resolved)

        # Default: weighted_avg
        total_weight = sum(r.axis.semantic_weight for r in resolved)
        if total_weight == 0:
            return sum(r.value for r in resolved) / len(resolved)

        weighted_sum = sum(r.value * r.axis.semantic_weight for r in resolved)
        return weighted_sum / total_weight

    def _apply_transform(
        self,
        values: Dict[str, float],
        weights: Dict[str, float],
        transform: str,
    ) -> float:
        """
        Apply transform to combine weighted values into final output.
        """
        if not values:
            return 0.0

        if transform == "max":
            return max(values[k] * weights[k] for k in values)

        if transform == "min":
            return min(values[k] * weights[k] for k in values)

        if transform == "sum":
            return sum(values[k] * weights[k] for k in values)

        if transform == "first":
            first_key = next(iter(values))
            return values[first_key] * weights[first_key]

        # Default: weighted_avg
        total_weight = sum(abs(weights[k]) for k in values)
        if total_weight == 0:
            return sum(values.values()) / len(values)

        weighted_sum = sum(values[k] * weights[k] for k in values)
        return weighted_sum / total_weight


# Singleton instance
_engine: Optional[DerivationEngine] = None


def get_derivation_engine() -> DerivationEngine:
    """Get the singleton derivation engine instance."""
    global _engine
    if _engine is None:
        _engine = DerivationEngine()
    return _engine
