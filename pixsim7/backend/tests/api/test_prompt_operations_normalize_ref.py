"""Unit tests for _normalize_ref in /prompts/operations/execute.

Phase 2b of plan:op-runtime-span-popover. Refs are user-supplied tokens
from the polymorphic RefPickerField; the executor normalizes them to
canonical entity / role / symbol form before stamping into
OpExecuteOverlayEntry.op_refs. Malformed refs return None at this layer
and are kept verbatim with a warning by the caller.
"""
from __future__ import annotations

import pytest

from pixsim7.backend.main.api.v1.prompt_operations import _normalize_ref


class TestNormalizeRefEntityRefs:
    """Entity refs (asset:N, character_instance:N, ...) round-trip through
    EntityRef.parse_flexible / to_string."""

    def test_asset_ref_stays_canonical(self) -> None:
        assert _normalize_ref("asset:42") == "asset:42"

    def test_character_instance_ref_stays_canonical(self) -> None:
        assert _normalize_ref("character_instance:7") == "character_instance:7"

    def test_unregistered_entity_kind_returns_none(self) -> None:
        # EntityRef.parse_flexible gates on registered entity types; an
        # unrecognised prefix doesn't parse and the normalizer falls
        # through to None (caller keeps raw with a warning).
        assert _normalize_ref("npc:alice") is None

    def test_whitespace_trimmed(self) -> None:
        assert _normalize_ref("  asset:42  ") == "asset:42"


class TestNormalizeRefRole:
    """role:X tokens are validated through resolve_role and returned in
    canonical form. Unknown role IDs return None."""

    def test_known_role_canonical(self) -> None:
        # `subject` is a registered role concept; resolve_role normalizes
        # to canonical form.
        result = _normalize_ref("role:subject")
        assert result is not None
        assert result.startswith("role:")

    def test_arbitrary_role_id_passed_through(self) -> None:
        # resolve_role is permissive — it normalizes any non-empty role
        # ID into a canonical "role:<id>" form. Plugin-contributed role
        # IDs that aren't in the core vocab are still valid tokens.
        result = _normalize_ref("role:my-plugin-role")
        assert result is not None
        assert result.startswith("role:")

    def test_empty_role_id_returns_none(self) -> None:
        # Bare "role:" with no payload → resolve_role can't normalize →
        # normalizer returns None.
        assert _normalize_ref("role:") is None


class TestNormalizeRefSymbol:
    """symbol:X tokens require non-empty payload."""

    def test_simple_symbol_kept(self) -> None:
        assert _normalize_ref("symbol:foo") == "symbol:foo"

    def test_symbol_with_underscores(self) -> None:
        assert _normalize_ref("symbol:my_anchor_token") == "symbol:my_anchor_token"

    def test_empty_symbol_returns_none(self) -> None:
        # `symbol:` with no payload is malformed — caller surfaces a
        # warning and keeps the raw input verbatim.
        assert _normalize_ref("symbol:") is None

    def test_symbol_payload_trimmed(self) -> None:
        assert _normalize_ref("symbol:  bar  ") == "symbol:bar"


class TestNormalizeRefMalformed:
    """Inputs that don't match any known prefix or shape return None."""

    def test_empty_string(self) -> None:
        assert _normalize_ref("") is None

    def test_whitespace_only(self) -> None:
        assert _normalize_ref("   ") is None

    def test_no_colon(self) -> None:
        assert _normalize_ref("just-a-string") is None

    def test_non_string_input(self) -> None:
        # Defensive: refs come in as Dict[str, str] but a misuse could
        # send numbers / None. Normalizer returns None rather than raising.
        assert _normalize_ref(None) is None
        assert _normalize_ref(42) is None
        assert _normalize_ref({"key": "value"}) is None


class TestNormalizeRefIdempotence:
    """Already-canonical tokens normalize to themselves — round-trip
    safe so re-running the executor on stored op_refs doesn't drift
    the values."""

    @pytest.mark.parametrize(
        "token",
        [
            "asset:1",
            "asset:99999",
            "character_instance:42",
            "symbol:bar",
        ],
    )
    def test_canonical_token_idempotent(self, token: str) -> None:
        once = _normalize_ref(token)
        assert once == token
        twice = _normalize_ref(once) if once else None
        assert twice == once
