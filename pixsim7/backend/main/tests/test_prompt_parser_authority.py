import asyncio
from pathlib import Path


def test_prompt_role_registry_uses_vocab_role_keywords():
    from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry

    registry = PromptRoleRegistry.default()
    keywords = registry.get_role_keywords()

    assert "camera" in keywords
    assert "point of view" in keywords["camera"]
    assert "close up" in keywords["camera"]


def test_simple_parser_resolves_camera_ids_from_normalized_keywords():
    from pixsim7.backend.main.services.prompt.parser.simple import SimplePromptParser

    parser = SimplePromptParser()
    result = asyncio.run(parser.parse("Point of view close up shot."))

    assert len(result.segments) == 1
    metadata = result.segments[0].metadata
    ontology_ids = set(metadata.get("ontology_ids") or [])
    assert "camera:angle_pov" in ontology_ids
    assert "camera:framing_closeup" in ontology_ids


def test_prompt_role_registry_loads_action_verbs_from_vocab():
    from pixsim7.backend.main.services.prompt.role_registry import PromptRoleRegistry

    registry = PromptRoleRegistry.default()
    action = registry.get_role("action")
    assert action is not None
    assert "open" in action.action_verbs
    assert "closes" in action.action_verbs


def test_simple_parser_uses_action_verb_list_from_vocab():
    from pixsim7.backend.main.services.prompt.parser.simple import SimplePromptParser

    parser = SimplePromptParser()
    result = asyncio.run(parser.parse("She opens the ancient gate."))
    assert len(result.segments) == 1
    metadata = result.segments[0].metadata
    assert metadata.get("has_verb") is True


def test_parser_runtime_has_no_ontology_keyword_authority_imports():
    simple_source = Path(
        "pixsim7/backend/main/services/prompt/parser/simple.py"
    ).read_text(encoding="utf-8")
    role_registry_source = Path(
        "pixsim7/backend/main/services/prompt/role_registry.py"
    ).read_text(encoding="utf-8")

    assert "from .ontology import ACTION_VERBS" not in simple_source
    assert "parser.ontology import ROLE_KEYWORDS" not in role_registry_source
