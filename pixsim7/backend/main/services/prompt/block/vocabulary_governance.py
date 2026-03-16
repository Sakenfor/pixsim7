"""Vocabulary Governance Service.

Validates tags and ontology IDs against the canonical vocabulary,
provides fuzzy suggestions, and detects conflicts.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class TagValidationEntry(BaseModel):
    key: str
    status: str  # "valid" | "alias" | "deprecated" | "unknown"
    canonical_key: Optional[str] = None
    canonical_value: Optional[Any] = None
    message: Optional[str] = None
    replacement: Optional[str] = None


class ValidationResult(BaseModel):
    valid: bool
    entries: List[TagValidationEntry] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class SuggestionResult(BaseModel):
    key: str
    label: str
    score: float
    values: List[str] = Field(default_factory=list)


class ConflictRecord(BaseModel):
    kind: str  # "unknown_namespace" | "invalid_value" | "deprecated_id" | "alias_collision"
    key: str
    value: Optional[str] = None
    message: str
    suggestion: Optional[str] = None


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class VocabularyGovernanceService:
    """Validates, suggests, and governs prompt-block vocabulary."""

    def validate_tags(self, tags: Dict[str, Any]) -> ValidationResult:
        """Validate all tags against the canonical dictionary."""
        from pixsim7.backend.main.services.prompt.block.tag_dictionary import (
            get_block_tag_alias_key_map,
            get_canonical_block_tag_dictionary,
        )

        canonical = get_canonical_block_tag_dictionary()
        alias_map = get_block_tag_alias_key_map()
        canonical_keys = set(canonical.keys())

        entries: List[TagValidationEntry] = []
        warnings: List[str] = []
        errors: List[str] = []
        has_error = False

        for key, value in tags.items():
            key_str = str(key)

            if key_str in canonical_keys:
                meta = canonical[key_str]
                status = str(meta.get("status", "active"))

                if status == "deprecated":
                    replacement = meta.get("replacement")
                    entries.append(TagValidationEntry(
                        key=key_str,
                        status="deprecated",
                        canonical_key=key_str,
                        message=f"Tag '{key_str}' is deprecated.",
                        replacement=str(replacement) if replacement else None,
                    ))
                    warnings.append(f"Deprecated tag: '{key_str}'")
                else:
                    # Check value validity
                    allowed = meta.get("allowed_values") or []
                    entry = TagValidationEntry(
                        key=key_str,
                        status="valid",
                        canonical_key=key_str,
                    )
                    if allowed and isinstance(value, str) and value not in allowed:
                        # Check value aliases
                        value_aliases = meta.get("value_aliases") or {}
                        if isinstance(value_aliases, dict) and value in value_aliases:
                            entry.status = "alias"
                            entry.canonical_value = value_aliases[value]
                            entry.message = f"Value '{value}' is an alias for '{value_aliases[value]}'"
                        else:
                            entry.message = f"Value '{value}' not in allowed values for '{key_str}'"
                            warnings.append(entry.message)
                    entries.append(entry)

            elif key_str in alias_map:
                canonical_key = alias_map[key_str]
                entries.append(TagValidationEntry(
                    key=key_str,
                    status="alias",
                    canonical_key=canonical_key,
                    message=f"'{key_str}' is an alias for canonical key '{canonical_key}'",
                ))
                warnings.append(f"Alias key: '{key_str}' -> '{canonical_key}'")

            else:
                entries.append(TagValidationEntry(
                    key=key_str,
                    status="unknown",
                    message=f"Unknown tag key: '{key_str}'",
                ))
                errors.append(f"Unknown tag key: '{key_str}'")
                has_error = True

        return ValidationResult(
            valid=not has_error,
            entries=entries,
            warnings=warnings,
            errors=errors,
        )

    def validate_ontology_ids(self, ids: List[str]) -> ValidationResult:
        """Validate ontology/concept IDs against VocabularyRegistry."""
        entries: List[TagValidationEntry] = []
        errors: List[str] = []
        has_error = False

        try:
            from pixsim7.backend.main.shared.ontology.vocabularies import get_registry
            registry = get_registry()
        except Exception:
            return ValidationResult(
                valid=True,
                entries=[],
                warnings=["VocabularyRegistry not available"],
                errors=[],
            )

        for concept_id in ids:
            try:
                is_known = registry.is_known_concept(concept_id)
            except Exception:
                is_known = False

            if is_known:
                entries.append(TagValidationEntry(
                    key=concept_id,
                    status="valid",
                ))
            else:
                entries.append(TagValidationEntry(
                    key=concept_id,
                    status="unknown",
                    message=f"Unknown ontology ID: '{concept_id}'",
                ))
                errors.append(f"Unknown ontology ID: '{concept_id}'")
                has_error = True

        return ValidationResult(
            valid=not has_error,
            entries=entries,
            errors=errors,
        )

    def suggest_tags(
        self,
        partial: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> List[SuggestionResult]:
        """Suggest canonical tags based on partial input (fuzzy match)."""
        from pixsim7.backend.main.services.prompt.block.tag_dictionary import (
            get_canonical_block_tag_dictionary,
        )

        canonical = get_canonical_block_tag_dictionary()
        partial_lower = partial.lower().strip()

        if not partial_lower:
            return []

        results: List[SuggestionResult] = []

        for key, meta in canonical.items():
            status = str(meta.get("status", "active"))
            if status == "deprecated":
                continue

            score = 0.0
            key_lower = key.lower()

            # Exact prefix match
            if key_lower.startswith(partial_lower):
                score = 1.0 - (len(key) - len(partial)) * 0.01
            # Substring match
            elif partial_lower in key_lower:
                score = 0.5
            # Description match
            elif partial_lower in str(meta.get("description", "")).lower():
                score = 0.3
            # Alias match
            else:
                aliases = meta.get("aliases") or []
                for alias in aliases:
                    if partial_lower in str(alias).lower():
                        score = 0.4
                        break

            if score > 0:
                label = meta.get("label") or key.replace("_", " ").title()
                allowed = [str(v) for v in (meta.get("allowed_values") or [])[:10]]
                results.append(SuggestionResult(
                    key=key,
                    label=str(label),
                    score=round(score, 3),
                    values=allowed,
                ))

        results.sort(key=lambda r: -r.score)
        return results[:20]

    def detect_conflicts(self, tags: Dict[str, Any]) -> List[ConflictRecord]:
        """Detect namespace violations, deprecated IDs, and alias collisions."""
        from pixsim7.backend.main.services.prompt.block.tag_dictionary import (
            get_block_tag_alias_key_map,
            get_canonical_block_tag_dictionary,
        )

        canonical = get_canonical_block_tag_dictionary()
        alias_map = get_block_tag_alias_key_map()
        canonical_keys = set(canonical.keys())

        conflicts: List[ConflictRecord] = []
        seen_canonical: Dict[str, str] = {}

        for key, value in tags.items():
            key_str = str(key)

            # Check for unknown namespace
            if key_str not in canonical_keys and key_str not in alias_map:
                conflicts.append(ConflictRecord(
                    kind="unknown_namespace",
                    key=key_str,
                    message=f"Tag key '{key_str}' is not in canonical vocabulary",
                ))

            # Check for deprecated
            if key_str in canonical_keys:
                meta = canonical[key_str]
                if str(meta.get("status", "active")) == "deprecated":
                    replacement = meta.get("replacement")
                    conflicts.append(ConflictRecord(
                        kind="deprecated_id",
                        key=key_str,
                        message=f"Tag '{key_str}' is deprecated",
                        suggestion=str(replacement) if replacement else None,
                    ))

                # Check for invalid values
                allowed = meta.get("allowed_values") or []
                if allowed and isinstance(value, str) and value not in allowed:
                    value_aliases = meta.get("value_aliases") or {}
                    if not (isinstance(value_aliases, dict) and value in value_aliases):
                        conflicts.append(ConflictRecord(
                            kind="invalid_value",
                            key=key_str,
                            value=str(value),
                            message=f"Value '{value}' not allowed for tag '{key_str}'",
                        ))

            # Check for alias collisions
            if key_str in alias_map:
                canonical_key = alias_map[key_str]
                if canonical_key in seen_canonical:
                    conflicts.append(ConflictRecord(
                        kind="alias_collision",
                        key=key_str,
                        message=(
                            f"Alias '{key_str}' maps to '{canonical_key}' which is "
                            f"also provided via '{seen_canonical[canonical_key]}'"
                        ),
                    ))
                seen_canonical[canonical_key] = key_str
            elif key_str in canonical_keys:
                if key_str in seen_canonical:
                    conflicts.append(ConflictRecord(
                        kind="alias_collision",
                        key=key_str,
                        message=f"Canonical key '{key_str}' conflicts with alias '{seen_canonical[key_str]}'",
                    ))
                seen_canonical[key_str] = key_str

        return conflicts

    def resolve_canonical(
        self,
        tag_key: str,
        tag_value: Any,
    ) -> Dict[str, Any]:
        """Full normalization of a single tag with provenance."""
        from pixsim7.backend.main.services.prompt.block.tag_dictionary import (
            normalize_block_tags,
        )

        result = normalize_block_tags({tag_key: tag_value})
        normalized = result.get("normalized_tags", {})

        canonical_key = list(normalized.keys())[0] if normalized else tag_key
        canonical_value = normalized.get(canonical_key, tag_value)

        return {
            "original_key": tag_key,
            "original_value": tag_value,
            "canonical_key": canonical_key,
            "canonical_value": canonical_value,
            "changed": result.get("changed", False),
            "key_changes": result.get("key_changes", []),
            "value_changes": result.get("value_changes", []),
        }
