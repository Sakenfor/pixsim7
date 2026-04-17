"""
Tests for AccountPool
"""

import pytest
from pixverse import AccountPool, Account
from pixverse.exceptions import AuthenticationError


def test_account_pool_creation():
    """Test creating an account pool"""
    pool = AccountPool([
        {"email": "user1@example.com", "password": "pass1"},
        {"email": "user2@example.com", "password": "pass2"},
    ])
    assert len(pool) == 2


def test_empty_pool():
    """Test that empty pool raises error"""
    with pytest.raises(ValueError):
        AccountPool([])


def test_round_robin_strategy():
    """Test round-robin rotation"""
    pool = AccountPool([
        {"email": "user1@example.com", "password": "pass1"},
        {"email": "user2@example.com", "password": "pass2"},
    ], strategy="round_robin")

    # Should cycle through accounts
    acc1 = pool.get_next()
    acc2 = pool.get_next()
    acc3 = pool.get_next()

    assert acc1.email == "user1@example.com"
    assert acc2.email == "user2@example.com"
    assert acc3.email == "user1@example.com"  # Back to first


def test_least_used_strategy():
    """Test least-used strategy"""
    pool = AccountPool([
        {"email": "user1@example.com", "password": "pass1"},
        {"email": "user2@example.com", "password": "pass2"},
    ], strategy="least_used")

    # First call should get either account
    acc1 = pool.get_next()
    pool.mark_success(acc1)

    # Second call should get the other account (least used)
    acc2 = pool.get_next()
    assert acc1.email != acc2.email


def test_mark_failed():
    """Test marking account as failed"""
    pool = AccountPool([
        {"email": "user1@example.com", "password": "pass1"},
    ])

    account = pool.accounts[0]
    assert account.failed_count == 0

    pool.mark_failed(account)
    assert account.failed_count == 1


def test_mark_rate_limited():
    """Test marking account as rate limited"""
    pool = AccountPool([
        {"email": "user1@example.com", "password": "pass1"},
    ])

    account = pool.accounts[0]
    assert account.is_rate_limited is False

    pool.mark_rate_limited(account)
    assert account.is_rate_limited is True


def test_no_active_accounts():
    """Test that error is raised when no active accounts"""
    pool = AccountPool([
        {"email": "user1@example.com", "password": "pass1"},
    ])

    # Deactivate the only account
    pool.deactivate(pool.accounts[0])

    # Should raise error
    with pytest.raises(AuthenticationError):
        pool.get_next()


def test_pool_stats():
    """Test pool statistics"""
    pool = AccountPool([
        {"email": "user1@example.com", "password": "pass1"},
        {"email": "user2@example.com", "password": "pass2"},
    ])

    stats = pool.get_stats()
    assert stats["total_accounts"] == 2
    assert stats["active_accounts"] == 2
    assert stats["total_usage"] == 0

    # Use an account
    acc = pool.get_next()
    pool.mark_success(acc)

    stats = pool.get_stats()
    assert stats["total_usage"] == 1
