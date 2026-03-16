"""Tests for the Vocabulary Governance Service."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from pixsim7.backend.main.services.prompt.block.vocabulary_governance import (
    ConflictRecord,
    SuggestionResult,
    TagValidationEntry,
    ValidationResult,
    VocabularyGovernanceService,
)

TEST_SUITE = {
    "id": "prompt-vocabulary-governance",
    "label": "Prompt Vocabulary Governance",
    "kind": "unit",
    "category": "backend/services/prompt",
    "subcategory": "vocabulary-governance",
    "covers": [
        "pixsim7/backend/main/services/prompt/block/vocabulary_governance.py",
    ],
}


_MOCK_DICTIONARY = {
    "intensity": {
        "description": "How strong the effect is",
        "data_type": "string",
        "allowed_values": ["1", "2", "3", "4", "5"],
        "aliases": ["strength"],
        "value_aliases": {"low": "1", "high": "5"},
        "applies_to": [],
        "status": "active",
    },
    "mood": {
        "description": "Emotional tone",
        "data_type": "string",
        "allowed_values": ["happy", "sad", "neutral"],
        "aliases": ["emotion"],
        "value_aliases": {},
        "applies_to": [],
        "status": "active",
    },
    "old_tag": {
        "description": "A deprecated tag",
        "data_type": "string",
        "allowed_values": [],
        "aliases": [],
        "value_aliases": {},
        "applies_to": [],
        "status": "deprecated",
        "replacement": "new_tag",
    },
}

_MOCK_ALIAS_MAP = {
    "strength": "intensity",
    "emotion": "mood",
}

# Patches target the source module (tag_dictionary) because
# vocabulary_governance uses deferred imports inside methods.
_TAG_DICT_MODULE = "pixsim7.backend.main.services.prompt.block.tag_dictionary"


def _patch_dictionary():
    return patch(
        f"{_TAG_DICT_MODULE}.get_canonical_block_tag_dictionary",
        return_value=_MOCK_DICTIONARY,
    )


def _patch_alias_map():
    return patch(
        f"{_TAG_DICT_MODULE}.get_block_tag_alias_key_map",
        return_value=_MOCK_ALIAS_MAP,
    )


def _patch_normalize():
    def _fake_normalize(tags, **kwargs):
        return {
            "normalized_tags": dict(tags),
            "changed": False,
            "key_changes": [],
            "value_changes": [],
            "warnings": [],
            "unknown_keys": [],
            "alias_keys_seen": [],
        }
    return patch(
        f"{_TAG_DICT_MODULE}.normalize_block_tags",
        side_effect=_fake_normalize,
    )


class TestValidateTags:
    def test_valid_canonical_tag(self):
        with _patch_dictionary(), _patch_alias_map():
            service = VocabularyGovernanceService()
            result = service.validate_tags({"intensity": "3"})
            assert result.valid is True
            assert len(result.entries) == 1
            assert result.entries[0].status == "valid"

    def test_alias_tag(self):
        with _patch_dictionary(), _patch_alias_map():
            service = VocabularyGovernanceService()
            result = service.validate_tags({"strength": "3"})
            assert result.valid is True
            assert len(result.entries) == 1
            assert result.entries[0].status == "alias"
            assert result.entries[0].canonical_key == "intensity"

    def test_unknown_tag(self):
        with _patch_dictionary(), _patch_alias_map():
            service = VocabularyGovernanceService()
            result = service.validate_tags({"totally_unknown": "value"})
            assert result.valid is False
            assert len(result.errors) == 1
            assert result.entries[0].status == "unknown"

    def test_deprecated_tag(self):
        with _patch_dictionary(), _patch_alias_map():
            service = VocabularyGovernanceService()
            result = service.validate_tags({"old_tag": "value"})
            assert result.valid is True  # deprecated is a warning, not error
            assert result.entries[0].status == "deprecated"
            assert result.entries[0].replacement == "new_tag"

    def test_value_alias(self):
        with _patch_dictionary(), _patch_alias_map():
            service = VocabularyGovernanceService()
            result = service.validate_tags({"intensity": "low"})
            assert result.valid is True
            assert result.entries[0].status == "alias"
            assert result.entries[0].canonical_value == "1"

    def test_multiple_tags(self):
        with _patch_dictionary(), _patch_alias_map():
            service = VocabularyGovernanceService()
            result = service.validate_tags({
                "intensity": "3",
                "mood": "happy",
                "unknown_key": "x",
            })
            assert result.valid is False
            assert len(result.entries) == 3
            valid_count = sum(1 for e in result.entries if e.status == "valid")
            assert valid_count == 2


class TestSuggestTags:
    def test_prefix_match(self):
        with _patch_dictionary():
            service = VocabularyGovernanceService()
            results = service.suggest_tags("int")
            assert len(results) >= 1
            assert results[0].key == "intensity"

    def test_empty_query(self):
        with _patch_dictionary():
            service = VocabularyGovernanceService()
            results = service.suggest_tags("")
            assert results == []

    def test_no_match(self):
        with _patch_dictionary():
            service = VocabularyGovernanceService()
            results = service.suggest_tags("zzz_nonexistent")
            assert results == []

    def test_skips_deprecated(self):
        with _patch_dictionary():
            service = VocabularyGovernanceService()
            results = service.suggest_tags("old")
            keys = [r.key for r in results]
            assert "old_tag" not in keys

    def test_description_match(self):
        with _patch_dictionary():
            service = VocabularyGovernanceService()
            results = service.suggest_tags("emotional")
            assert len(results) >= 1
            assert any(r.key == "mood" for r in results)


class TestDetectConflicts:
    def test_no_conflicts(self):
        with _patch_dictionary(), _patch_alias_map():
            service = VocabularyGovernanceService()
            conflicts = service.detect_conflicts({"intensity": "3"})
            assert len(conflicts) == 0

    def test_unknown_namespace(self):
        with _patch_dictionary(), _patch_alias_map():
            service = VocabularyGovernanceService()
            conflicts = service.detect_conflicts({"unknown_key": "value"})
            assert len(conflicts) == 1
            assert conflicts[0].kind == "unknown_namespace"

    def test_deprecated_conflict(self):
        with _patch_dictionary(), _patch_alias_map():
            service = VocabularyGovernanceService()
            conflicts = service.detect_conflicts({"old_tag": "value"})
            assert any(c.kind == "deprecated_id" for c in conflicts)

    def test_invalid_value(self):
        with _patch_dictionary(), _patch_alias_map():
            service = VocabularyGovernanceService()
            conflicts = service.detect_conflicts({"intensity": "999"})
            assert any(c.kind == "invalid_value" for c in conflicts)


class TestResolveCanonical:
    def test_canonical_key(self):
        with _patch_normalize():
            service = VocabularyGovernanceService()
            result = service.resolve_canonical("intensity", "3")
            assert result["original_key"] == "intensity"
            assert result["canonical_key"] == "intensity"
