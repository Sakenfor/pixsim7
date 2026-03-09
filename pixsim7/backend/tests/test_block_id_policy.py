from pixsim7.backend.main.services.prompt.block.block_id_policy import (
    is_namespaced_block_id,
    namespaced_block_id_error,
)


def test_is_namespaced_block_id_requires_namespace_and_leaf() -> None:
    assert is_namespaced_block_id("bananza.deck_cafe") is True
    assert is_namespaced_block_id("bananza.character.banana") is True
    assert is_namespaced_block_id("plain_id") is False
    assert is_namespaced_block_id("namespace.") is False
    assert is_namespaced_block_id(".name") is False


def test_namespaced_block_id_error_mentions_expected_shape() -> None:
    message = namespaced_block_id_error("plain_id")
    assert "<namespace>.<name>" in message
    assert "plain_id" in message
