"""
Pixverse Account Management
Handles account rotation and load balancing
"""

import random
from datetime import datetime
from typing import List, Literal, Optional, Dict, Any
from .models import Account
from .exceptions import AuthenticationError


RotationStrategy = Literal["round_robin", "least_used", "random", "weighted"]


class AccountPool:
    """
    Manages multiple Pixverse accounts with rotation strategies

    Example:
        >>> pool = AccountPool([
        ...     {"email": "user1@gmail.com", "password": "pass1"},
        ...     {"email": "user2@gmail.com", "password": "pass2"},
        ... ], strategy="round_robin")
        >>> account = pool.get_next()
    """

    def __init__(
        self,
        accounts: List[Dict[str, Any]],
        strategy: RotationStrategy = "round_robin"
    ):
        """
        Initialize account pool

        Args:
            accounts: List of account dictionaries with 'email' and 'password'
            strategy: Rotation strategy to use
                - round_robin: Cycle through accounts in order
                - least_used: Pick account with lowest usage count
                - random: Pick random account
                - weighted: Weighted random based on success rate
        """
        if not accounts:
            raise ValueError("At least one account is required")

        self.accounts = [Account(**acc) for acc in accounts]
        self.strategy = strategy
        self.current_index = 0

    def get_next(self) -> Account:
        """
        Get next account based on rotation strategy

        Returns:
            Next available account

        Raises:
            AuthenticationError: If no active accounts available
        """
        # Filter active accounts
        active_accounts = [acc for acc in self.accounts if acc.is_active and not acc.is_rate_limited]

        if not active_accounts:
            raise AuthenticationError("No active accounts available")

        if self.strategy == "round_robin":
            account = self._round_robin(active_accounts)
        elif self.strategy == "least_used":
            account = self._least_used(active_accounts)
        elif self.strategy == "random":
            account = self._random(active_accounts)
        elif self.strategy == "weighted":
            account = self._weighted(active_accounts)
        else:
            raise ValueError(f"Unknown strategy: {self.strategy}")

        account.last_used = datetime.now()
        return account

    def _round_robin(self, accounts: List[Account]) -> Account:
        """Round-robin selection"""
        account = accounts[self.current_index % len(accounts)]
        self.current_index = (self.current_index + 1) % len(accounts)
        return account

    def _least_used(self, accounts: List[Account]) -> Account:
        """Pick account with lowest usage count"""
        return min(accounts, key=lambda a: a.usage_count)

    def _random(self, accounts: List[Account]) -> Account:
        """Random selection"""
        return random.choice(accounts)

    def _weighted(self, accounts: List[Account]) -> Account:
        """Weighted random based on success rate"""
        # Calculate weights (inverse of failure rate)
        weights = []
        for acc in accounts:
            if acc.usage_count == 0:
                weight = 1.0
            else:
                success_rate = 1 - (acc.failed_count / max(acc.usage_count, 1))
                weight = max(success_rate, 0.1)  # Minimum weight 0.1
            weights.append(weight)

        return random.choices(accounts, weights=weights, k=1)[0]

    def mark_success(self, account: Account):
        """Mark account as successfully used"""
        account.usage_count += 1
        account.last_used = datetime.now()

    def mark_failed(self, account: Account, is_rate_limit: bool = False):
        """
        Mark account as failed

        Args:
            account: Account that failed
            is_rate_limit: Whether failure was due to rate limiting
        """
        account.failed_count += 1
        account.last_failed = datetime.now()

        if is_rate_limit:
            account.is_rate_limited = True

    def mark_rate_limited(self, account: Account):
        """Mark account as rate limited"""
        self.mark_failed(account, is_rate_limit=True)

    def reset_rate_limit(self, account: Account):
        """Reset rate limit status for account"""
        account.is_rate_limited = False

    def deactivate(self, account: Account):
        """Deactivate an account (e.g., banned, invalid credentials)"""
        account.is_active = False

    def get_stats(self) -> Dict[str, Any]:
        """Get pool statistics"""
        total = len(self.accounts)
        active = sum(1 for a in self.accounts if a.is_active)
        rate_limited = sum(1 for a in self.accounts if a.is_rate_limited)
        total_usage = sum(a.usage_count for a in self.accounts)
        total_failures = sum(a.failed_count for a in self.accounts)

        return {
            "total_accounts": total,
            "active_accounts": active,
            "rate_limited_accounts": rate_limited,
            "total_usage": total_usage,
            "total_failures": total_failures,
            "success_rate": (total_usage - total_failures) / max(total_usage, 1),
        }

    def __len__(self) -> int:
        """Get number of accounts in pool"""
        return len(self.accounts)

    def __repr__(self) -> str:
        stats = self.get_stats()
        return f"AccountPool(total={stats['total_accounts']}, active={stats['active_accounts']}, strategy={self.strategy})"
