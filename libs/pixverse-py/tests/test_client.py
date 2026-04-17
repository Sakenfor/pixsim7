"""
Tests for PixverseClient
"""

import pytest
from pixverse import PixverseClient, AccountPool
from pixverse.exceptions import AuthenticationError, RateLimitError


def test_single_account_initialization():
    """Test client initialization with single account"""
    client = PixverseClient(email="test@example.com", password="password")
    assert client.pool is not None
    assert len(client.pool) == 1


def test_account_pool_initialization():
    """Test client initialization with account pool"""
    pool = AccountPool([
        {"email": "user1@example.com", "password": "pass1"},
        {"email": "user2@example.com", "password": "pass2"},
    ])
    client = PixverseClient(account_pool=pool)
    assert client.multi_account is True
    assert len(client.pool) == 2


def test_missing_credentials():
    """Test that missing credentials raises error"""
    with pytest.raises(ValueError):
        PixverseClient()


def test_pool_stats():
    """Test pool statistics"""
    pool = AccountPool([
        {"email": "user1@example.com", "password": "pass1"},
        {"email": "user2@example.com", "password": "pass2"},
    ])
    client = PixverseClient(account_pool=pool)

    stats = client.get_pool_stats()
    assert stats["total_accounts"] == 2
    assert stats["active_accounts"] == 2
    assert stats["total_usage"] == 0
