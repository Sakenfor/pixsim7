from pixsim7.backend.main.services.prompt.llm_resolution import (
    normalize_llm_provider_id,
    resolve_llm_provider_id,
    resolve_llm_model_id,
)


def test_normalize_llm_provider_id():
    assert normalize_llm_provider_id("openai") == "openai-llm"
    assert normalize_llm_provider_id("local-llm") == "local-llm"
    assert normalize_llm_provider_id("  ANTHROPIC ") == "anthropic-llm"
    assert normalize_llm_provider_id(None) is None


def test_resolve_llm_provider_id_precedence():
    assert (
        resolve_llm_provider_id(
            explicit_provider_id="local-llm",
            analyzer_provider_id="openai-llm",
            user_provider_id="anthropic-llm",
        )
        == "local-llm"
    )
    assert (
        resolve_llm_provider_id(
            explicit_provider_id=None,
            analyzer_provider_id="openai-llm",
            user_provider_id="anthropic-llm",
        )
        == "openai-llm"
    )
    assert (
        resolve_llm_provider_id(
            explicit_provider_id=None,
            analyzer_provider_id=None,
            user_provider_id="local",
        )
        == "local-llm"
    )
    assert (
        resolve_llm_provider_id(
            explicit_provider_id=None,
            analyzer_provider_id=None,
            user_provider_id=None,
            fallback_provider_id="openai",
        )
        == "openai-llm"
    )
    assert (
        resolve_llm_provider_id(
            explicit_provider_id=None,
            analyzer_provider_id=None,
            user_provider_id=None,
            fallback_provider_id=None,
        )
        is None
    )


def test_resolve_llm_model_id_uses_user_default_only_when_provider_matches():
    assert (
        resolve_llm_model_id(
            explicit_model_id="m-explicit",
            analyzer_model_id="m-analyzer",
            user_model_id="m-user",
            user_provider_id="openai-llm",
            resolved_provider_id="openai-llm",
        )
        == "m-explicit"
    )
    assert (
        resolve_llm_model_id(
            explicit_model_id=None,
            analyzer_model_id="m-analyzer",
            user_model_id="m-user",
            user_provider_id="openai-llm",
            resolved_provider_id="openai-llm",
        )
        == "m-user"
    )
    assert (
        resolve_llm_model_id(
            explicit_model_id=None,
            analyzer_model_id="m-analyzer",
            user_model_id="m-user",
            user_provider_id="openai-llm",
            resolved_provider_id="local-llm",
        )
        == "m-analyzer"
    )
