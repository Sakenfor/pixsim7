import pytest
from pixsim7_backend.domain.automation.execution_loop import ExecutionLoop, PresetExecutionMode


def test_get_next_preset_single_mode():
    loop = ExecutionLoop(user_id=1, name="test", preset_id=42)
    assert loop.get_next_preset_for_account(10) == 42


def test_get_next_preset_shared_list_advances():
    loop = ExecutionLoop(
        user_id=1,
        name="test",
        preset_execution_mode=PresetExecutionMode.SHARED_LIST,
        shared_preset_ids=[1, 2, 3],
    )
    assert loop.get_next_preset_for_account(7) == 1
    loop.advance_preset_index(7)
    assert loop.get_next_preset_for_account(8) == 2


def test_get_next_preset_per_account_state():
    loop = ExecutionLoop(
        user_id=1,
        name="test",
        preset_execution_mode=PresetExecutionMode.PER_ACCOUNT,
        account_preset_config={"5": [10, 11]},
    )
    # First call returns first preset
    assert loop.get_next_preset_for_account(5) == 10
    # After advancing only for account 5
    loop.advance_preset_index(5)
    assert loop.get_next_preset_for_account(5) == 11
    # Another account uses default (legacy) preset_id which is None
    assert loop.get_next_preset_for_account(6) is None
