"""
Tests for the shared execution policy — provider/model precedence resolution.

Covers:
  - Provider precedence vectors (explicit > analyzer > user > fallback)
  - Model precedence vectors (explicit > user-if-provider-matches > analyzer)
  - Model catalog inference
  - Provider-model conflict handling
  - Provider default model lookup
  - No implicit hidden fallback drift
  - Provenance tracking
"""

from types import SimpleNamespace

import pytest

import pixsim7.backend.main.services.analysis.execution_policy as policy_module
from pixsim7.backend.main.services.analysis.execution_policy import (
    DEFAULT_MODEL_BY_PROVIDER,
    ProviderModelPrecedenceRequest,
    resolve_provider_model_precedence,
)


# ---------------------------------------------------------------------------
# Provider precedence
# ---------------------------------------------------------------------------


class TestProviderPrecedence:
    """Provider resolution follows explicit > analyzer > user > fallback."""

    def test_explicit_provider_wins_over_all(self):
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                explicit_provider_id="anthropic-llm",
                analyzer_provider_id="openai-llm",
                user_provider_id="local-llm",
                fallback_provider_id="cmd-llm",
            ),
            use_model_catalog=False,
        )
        assert result.provider_id == "anthropic-llm"
        assert result.provider_source == "explicit"

    def test_analyzer_provider_wins_over_user_and_fallback(self):
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                analyzer_provider_id="openai-llm",
                user_provider_id="local-llm",
                fallback_provider_id="cmd-llm",
            ),
            use_model_catalog=False,
        )
        assert result.provider_id == "openai-llm"
        assert result.provider_source == "analyzer"

    def test_user_provider_wins_over_fallback(self):
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                user_provider_id="local-llm",
                fallback_provider_id="cmd-llm",
            ),
            use_model_catalog=False,
        )
        assert result.provider_id == "local-llm"
        assert result.provider_source == "user"

    def test_fallback_provider_used_when_no_other(self):
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                fallback_provider_id="openai-llm",
            ),
            use_model_catalog=False,
        )
        assert result.provider_id == "openai-llm"
        assert result.provider_source == "fallback"

    def test_provider_alias_normalized(self):
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                explicit_provider_id="openai",
            ),
            use_model_catalog=False,
        )
        assert result.provider_id == "openai-llm"


# ---------------------------------------------------------------------------
# Model precedence
# ---------------------------------------------------------------------------


class TestModelPrecedence:
    """Model resolution follows explicit > user (if provider matches) > analyzer."""

    def test_explicit_model_wins_over_all(self):
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                explicit_provider_id="openai-llm",
                explicit_model_id="gpt-4-turbo",
                analyzer_model_id="gpt-4",
                user_model_id="gpt-4o",
                user_provider_id="openai-llm",
            ),
            use_model_catalog=False,
        )
        assert result.model_id == "gpt-4-turbo"
        assert result.model_source == "explicit"

    def test_user_model_used_when_provider_matches(self):
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                analyzer_provider_id="openai-llm",
                analyzer_model_id="gpt-4",
                user_model_id="gpt-4o",
                user_provider_id="openai-llm",
            ),
            use_model_catalog=False,
        )
        assert result.model_id == "gpt-4o"
        assert result.model_source == "user"

    def test_user_model_skipped_when_provider_mismatch(self):
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                analyzer_provider_id="openai-llm",
                analyzer_model_id="gpt-4",
                user_model_id="claude-custom",
                user_provider_id="anthropic-llm",
            ),
            use_model_catalog=False,
        )
        assert result.model_id == "gpt-4"
        assert result.model_source == "analyzer"

    def test_analyzer_model_used_as_fallback(self):
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                analyzer_provider_id="local-llm",
                analyzer_model_id="my-model",
            ),
            use_model_catalog=False,
        )
        assert result.model_id == "my-model"
        assert result.model_source == "analyzer"


# ---------------------------------------------------------------------------
# Model catalog inference
# ---------------------------------------------------------------------------


class TestModelCatalogInference:
    """Model catalog fills provider when model is known but provider is not."""

    def test_provider_inferred_from_model_catalog(self, monkeypatch):
        monkeypatch.setattr(
            policy_module,
            "ai_model_registry",
            SimpleNamespace(
                get=lambda model_id: (
                    SimpleNamespace(provider_id="anthropic-llm")
                    if model_id == "claude-custom"
                    else None
                ),
            ),
        )

        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                explicit_model_id="claude-custom",
            ),
            use_model_catalog=True,
        )
        assert result.provider_id == "anthropic-llm"
        assert result.provider_source == "model_catalog"
        assert result.model_id == "claude-custom"

    def test_catalog_disabled_does_not_infer_provider(self):
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                explicit_model_id="claude-custom",
            ),
            use_model_catalog=False,
        )
        assert result.provider_id is None
        assert result.provider_source == "none"

    def test_preference_provider_not_overridden_by_catalog(self, monkeypatch):
        """Explicit/analyzer provider should NOT be replaced by model catalog."""
        monkeypatch.setattr(
            policy_module,
            "ai_model_registry",
            SimpleNamespace(
                get=lambda model_id: (
                    SimpleNamespace(provider_id="openai-llm")
                    if model_id == "gpt-4"
                    else None
                ),
            ),
        )

        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                explicit_provider_id="openai-llm",
                explicit_model_id="gpt-4",
            ),
            use_model_catalog=True,
        )
        assert result.provider_id == "openai-llm"
        assert result.provider_source == "explicit"
        assert not result.conflict_detected


# ---------------------------------------------------------------------------
# Conflict detection
# ---------------------------------------------------------------------------


class TestConflictDetection:
    """Provider-model mismatch results in model being dropped."""

    def test_conflict_drops_model_and_uses_provider_default(self, monkeypatch):
        monkeypatch.setattr(
            policy_module,
            "ai_model_registry",
            SimpleNamespace(
                get=lambda model_id: (
                    SimpleNamespace(provider_id="openai-llm")
                    if model_id == "gpt-4"
                    else None
                ),
            ),
        )

        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                explicit_provider_id="local-llm",
                explicit_model_id="gpt-4",
            ),
            use_model_catalog=True,
        )
        assert result.provider_id == "local-llm"
        assert result.model_id == "smollm2-1.7b"
        assert result.conflict_detected is True
        assert result.model_source == "provider_default"

    def test_no_conflict_when_provider_and_model_agree(self, monkeypatch):
        monkeypatch.setattr(
            policy_module,
            "ai_model_registry",
            SimpleNamespace(
                get=lambda model_id: (
                    SimpleNamespace(provider_id="openai-llm")
                    if model_id == "gpt-4"
                    else None
                ),
            ),
        )

        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                explicit_provider_id="openai-llm",
                explicit_model_id="gpt-4",
            ),
            use_model_catalog=True,
        )
        assert result.provider_id == "openai-llm"
        assert result.model_id == "gpt-4"
        assert result.conflict_detected is False

    def test_no_conflict_when_model_not_in_catalog(self, monkeypatch):
        monkeypatch.setattr(
            policy_module,
            "ai_model_registry",
            SimpleNamespace(get=lambda model_id: None),
        )

        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                explicit_provider_id="local-llm",
                explicit_model_id="unknown-model",
            ),
            use_model_catalog=True,
        )
        assert result.provider_id == "local-llm"
        assert result.model_id == "unknown-model"
        assert result.conflict_detected is False


# ---------------------------------------------------------------------------
# Provider default model
# ---------------------------------------------------------------------------


class TestProviderDefaultModel:
    """When provider is known but model is missing, use provider default."""

    def test_provider_known_gets_default_model(self):
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                explicit_provider_id="local-llm",
            ),
            use_model_catalog=False,
        )
        assert result.provider_id == "local-llm"
        assert result.model_id == DEFAULT_MODEL_BY_PROVIDER["local-llm"]
        assert result.model_source == "provider_default"

    def test_each_canonical_provider_has_default(self):
        for provider_id, expected_model in DEFAULT_MODEL_BY_PROVIDER.items():
            result = resolve_provider_model_precedence(
                ProviderModelPrecedenceRequest(
                    explicit_provider_id=provider_id,
                ),
                use_model_catalog=False,
            )
            assert result.model_id == expected_model

    def test_provider_default_disabled_leaves_model_none(self):
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                explicit_provider_id="local-llm",
            ),
            use_model_catalog=False,
            apply_provider_defaults=False,
        )
        assert result.provider_id == "local-llm"
        assert result.model_id is None


# ---------------------------------------------------------------------------
# No hidden fallback drift
# ---------------------------------------------------------------------------


class TestNoHiddenFallback:
    """Fully unspecified calls return None — no implicit hardcoded defaults."""

    def test_fully_unspecified_returns_none(self):
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(),
            use_model_catalog=False,
        )
        assert result.provider_id is None
        assert result.model_id is None
        assert result.provider_source == "none"
        assert result.model_source == "none"

    def test_no_implicit_provider_when_only_user_model_given(self):
        """User model without matching provider should not produce a provider."""
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                user_model_id="gpt-4o",
            ),
            use_model_catalog=False,
        )
        assert result.provider_id is None

    def test_unknown_provider_gets_no_default_model(self):
        """Unknown provider not in DEFAULT_MODEL_BY_PROVIDER should leave model None."""
        result = resolve_provider_model_precedence(
            ProviderModelPrecedenceRequest(
                explicit_provider_id="custom-llm",
            ),
            use_model_catalog=False,
            apply_provider_defaults=True,
        )
        # "custom-llm" is not a canonical provider, so normalize returns None
        # and provider resolution returns None
        assert result.provider_id is None
