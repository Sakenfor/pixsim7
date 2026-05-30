"""Tests for ecs_helpers after migrating narrative state onto the canonical
GameObject store (checkpoint npc-ecs-on-canonical, narrative half)."""
from types import SimpleNamespace

from pixsim7.backend.main.domain.narrative.ecs_helpers import (
    NARRATIVE_COMPONENT_TYPE,
    advance_to_node,
    clear_narrative_state,
    get_narrative_state,
    is_program_active,
    set_narrative_state,
    start_program,
)
from pixsim7.backend.main.domain.narrative.schema import NarrativeRuntimeState

WORLD_ID = 1


def _new_session():
    return SimpleNamespace(flags={}, world_id=WORLD_ID)


def _fresh_state(**overrides) -> NarrativeRuntimeState:
    defaults = dict(
        active_program_id=None,
        active_node_id=None,
        stack=[],
        history=[],
        variables={},
        last_step_at=None,
        paused=False,
        error=None,
    )
    defaults.update(overrides)
    return NarrativeRuntimeState(**defaults)


def test_set_narrative_state_writes_canonical_npc_component():
    session = _new_session()
    state = _fresh_state(
        active_program_id="prog-1",
        active_node_id="node-1",
        variables={"x": 1},
        last_step_at=100,
    )

    set_narrative_state(session, 42, state)

    npc = session.flags["gameObjects"]["objects"]["npc:42"]
    assert npc["kind"] == "npc"
    narrative_comp = next(c for c in npc["components"] if c["type"] == NARRATIVE_COMPONENT_TYPE)
    assert narrative_comp["data"]["active_program_id"] == "prog-1"
    assert narrative_comp["data"]["variables"] == {"x": 1}

    # Legacy location is NOT written to — that bridge is intentionally gone.
    legacy_components = (
        session.flags.get("npcs", {}).get("npc:42", {}).get("components", {})
    )
    assert "narrative" not in legacy_components


def test_get_narrative_state_returns_empty_when_absent():
    session = _new_session()
    state = get_narrative_state(session, 99)
    assert state.active_program_id is None
    assert state.history == []


def test_round_trip_set_then_get():
    session = _new_session()
    set_narrative_state(
        session, 7,
        _fresh_state(
            active_program_id="p",
            active_node_id="n",
            variables={"a": 2},
            last_step_at=200,
            paused=True,
        ),
    )

    fetched = get_narrative_state(session, 7)
    assert fetched.active_program_id == "p"
    assert fetched.active_node_id == "n"
    assert fetched.variables == {"a": 2}
    assert fetched.paused is True


def test_clear_narrative_state_removes_component():
    session = _new_session()
    set_narrative_state(
        session, 1,
        _fresh_state(active_program_id="p", active_node_id="n", last_step_at=1),
    )

    clear_narrative_state(session, 1)

    npc = session.flags["gameObjects"]["objects"]["npc:1"]
    assert all(c.get("type") != NARRATIVE_COMPONENT_TYPE for c in npc.get("components", []))
    # Reading again yields the fresh/empty default.
    fresh = get_narrative_state(session, 1)
    assert fresh.active_program_id is None


def test_multiple_npcs_keep_independent_state():
    session = _new_session()
    set_narrative_state(
        session, 1,
        _fresh_state(active_program_id="A", active_node_id="n", last_step_at=1),
    )
    set_narrative_state(
        session, 2,
        _fresh_state(active_program_id="B", active_node_id="m", last_step_at=2),
    )

    assert get_narrative_state(session, 1).active_program_id == "A"
    assert get_narrative_state(session, 2).active_program_id == "B"


def test_start_program_writes_via_canonical_path():
    session = _new_session()

    state = start_program(session, 11, "prog-x", "entry-node")

    assert state.active_program_id == "prog-x"
    assert state.active_node_id == "entry-node"
    npc = session.flags["gameObjects"]["objects"]["npc:11"]
    narrative_data = next(
        c for c in npc["components"] if c["type"] == NARRATIVE_COMPONENT_TYPE
    )["data"]
    assert narrative_data["active_program_id"] == "prog-x"
    assert is_program_active(session, 11) is True


def test_advance_to_node_persists_through_canonical():
    session = _new_session()
    start_program(session, 3, "p", "n1")

    advance_to_node(session, 3, "n2", choice_id="c1")

    state = get_narrative_state(session, 3)
    assert state.active_node_id == "n2"
    assert any(h.node_id == "n2" for h in state.history)
