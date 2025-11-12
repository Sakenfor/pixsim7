"""
UserService - user management and quota enforcement

Clean service for user CRUD and quota checks
"""
from datetime import datetime, timedelta
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from pixsim7_backend.domain import User, UserQuotaUsage
from pixsim7_backend.shared.auth import hash_password
from pixsim7_backend.shared.errors import (
    ResourceNotFoundError,
    ResourceAlreadyExistsError,
    QuotaError,
)


class UserService:
    """
    User management service

    Handles:
    - User CRUD
    - Quota checking and enforcement
    - Usage tracking
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ===== USER CRUD =====

    async def create_user(
        self,
        email: str,
        username: str,
        password: str,
        role: str = "user"
    ) -> User:
        """
        Create new user

        Args:
            email: User email (unique)
            username: Username (unique)
            password: Plain text password (will be hashed)
            role: User role (default: "user")

        Returns:
            Created user

        Raises:
            ResourceAlreadyExistsError: Email or username already exists
        """
        # Check if email exists
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        if result.scalar_one_or_none():
            raise ResourceAlreadyExistsError("User", f"email={email}")

        # Check if username exists
        result = await self.db.execute(
            select(User).where(User.username == username)
        )
        if result.scalar_one_or_none():
            raise ResourceAlreadyExistsError("User", f"username={username}")

        # Create user (hash password asynchronously)
        password_hash = await hash_password(password)

        user = User(
            email=email,
            username=username,
            password_hash=password_hash,
            role=role,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)

        return user

    async def get_user(self, user_id: int) -> User:
        """
        Get user by ID

        Args:
            user_id: User ID

        Returns:
            User

        Raises:
            ResourceNotFoundError: User not found
        """
        user = await self.db.get(User, user_id)
        if not user:
            raise ResourceNotFoundError("User", user_id)
        return user

    async def get_user_by_email(self, email: str) -> Optional[User]:
        """
        Get user by email

        Args:
            email: User email

        Returns:
            User or None
        """
        result = await self.db.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()

    async def get_user_by_username(self, username: str) -> Optional[User]:
        """
        Get user by username

        Args:
            username: Username

        Returns:
            User or None
        """
        result = await self.db.execute(
            select(User).where(User.username == username)
        )
        return result.scalar_one_or_none()

    async def update_user(
        self,
        user_id: int,
        **updates
    ) -> User:
        """
        Update user

        Args:
            user_id: User ID
            **updates: Fields to update

        Returns:
            Updated user

        Raises:
            ResourceNotFoundError: User not found
        """
        user = await self.get_user(user_id)

        # Update fields
        for key, value in updates.items():
            if hasattr(user, key):
                setattr(user, key, value)

        user.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(user)

        return user

    async def delete_user(self, user_id: int) -> None:
        """
        Delete user (soft delete - set is_active=False)

        Args:
            user_id: User ID

        Raises:
            ResourceNotFoundError: User not found
        """
        user = await self.get_user(user_id)
        user.is_active = False
        user.updated_at = datetime.utcnow()

        await self.db.commit()

    # ===== QUOTA MANAGEMENT =====

    async def check_can_create_job(self, user: User) -> None:
        """
        Check if user can create a job

        Args:
            user: User to check

        Raises:
            QuotaError: If user exceeded quotas
        """
        if not user.is_active:
            raise QuotaError("User account is inactive")

        # Reset daily counter if needed
        await self._reset_daily_quota_if_needed(user)

        # Check daily limit
        if user.jobs_today >= user.max_daily_jobs:
            raise QuotaError(
                f"Daily job limit exceeded ({user.max_daily_jobs}). "
                f"Resets at midnight UTC."
            )

    async def check_storage_available(self, user: User, required_gb: float) -> None:
        """
        Check if user has storage available

        Args:
            user: User to check
            required_gb: Storage required in GB

        Raises:
            QuotaError: If storage quota exceeded
        """
        if user.current_storage_gb + required_gb > user.max_storage_gb:
            raise QuotaError(
                f"Storage quota exceeded. "
                f"Used: {user.current_storage_gb:.2f}GB, "
                f"Limit: {user.max_storage_gb:.2f}GB"
            )

    async def increment_job_count(self, user: User) -> None:
        """
        Increment user's job count

        Args:
            user: User
        """
        user.jobs_today += 1
        user.total_jobs_created += 1
        await self.db.commit()

    async def increment_storage(self, user: User, gb: float) -> None:
        """
        Increment user's storage usage

        Args:
            user: User
            gb: Storage to add in GB
        """
        user.current_storage_gb += gb
        await self.db.commit()

    async def decrement_storage(self, user: User, gb: float) -> None:
        """
        Decrement user's storage usage

        Args:
            user: User
            gb: Storage to remove in GB
        """
        user.current_storage_gb = max(0, user.current_storage_gb - gb)
        await self.db.commit()

    async def _reset_daily_quota_if_needed(self, user: User) -> None:
        """
        Reset daily quota if it's a new day

        Args:
            user: User to check
        """
        now = datetime.utcnow()

        # Check if last reset was today
        if user.last_job_reset:
            # If last reset was today, no need to reset
            if user.last_job_reset.date() == now.date():
                return

        # Reset counter
        user.jobs_today = 0
        user.last_job_reset = now
        await self.db.commit()

    # ===== USAGE TRACKING =====

    async def record_daily_usage(
        self,
        user_id: int,
        jobs_created: int = 0,
        jobs_completed: int = 0,
        jobs_failed: int = 0,
        assets_created: int = 0,
        storage_added_gb: float = 0.0
    ) -> UserQuotaUsage:
        """
        Record daily usage for analytics

        Args:
            user_id: User ID
            jobs_created: Number of jobs created
            jobs_completed: Number of jobs completed
            jobs_failed: Number of jobs failed
            assets_created: Number of assets created
            storage_added_gb: Storage added in GB

        Returns:
            UserQuotaUsage record
        """
        today = datetime.utcnow().date()

        # Get or create today's record
        result = await self.db.execute(
            select(UserQuotaUsage).where(
                UserQuotaUsage.user_id == user_id,
                func.date(UserQuotaUsage.date) == today
            )
        )
        usage = result.scalar_one_or_none()

        if not usage:
            usage = UserQuotaUsage(
                user_id=user_id,
                date=datetime.utcnow(),
            )
            self.db.add(usage)

        # Update counters
        usage.jobs_created += jobs_created
        usage.jobs_completed += jobs_completed
        usage.jobs_failed += jobs_failed
        usage.assets_created += assets_created
        usage.storage_added_gb += storage_added_gb
        usage.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(usage)

        return usage

    async def get_user_usage(
        self,
        user_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> list[UserQuotaUsage]:
        """
        Get user usage history

        Args:
            user_id: User ID
            start_date: Start date (inclusive)
            end_date: End date (inclusive)

        Returns:
            List of usage records
        """
        query = select(UserQuotaUsage).where(
            UserQuotaUsage.user_id == user_id
        )

        if start_date:
            query = query.where(UserQuotaUsage.date >= start_date)
        if end_date:
            query = query.where(UserQuotaUsage.date <= end_date)

        query = query.order_by(UserQuotaUsage.date.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())
