"""
Authentication utilities - password hashing and JWT token management

Clean auth utilities for PixSim7
"""
from datetime import datetime, timedelta
from typing import Optional
import secrets
import hashlib
import asyncio

import bcrypt
from jose import JWTError, jwt

from pixsim7_backend.shared.config import settings


# ===== PASSWORD HASHING =====

def _prepare_password(password: str) -> bytes:
    """
    Prepare password for bcrypt by handling length limits.

    Bcrypt has a 72-byte limit. For longer passwords, we pre-hash with SHA256.
    This is a common pattern that maintains security while supporting any length.

    Args:
        password: Plain text password

    Returns:
        Password bytes ready for bcrypt
    """
    password_bytes = password.encode('utf-8')

    # If password is short enough, use as-is
    if len(password_bytes) <= 72:
        return password_bytes

    # For longer passwords, pre-hash with SHA256
    # This maintains security while allowing any length password
    return hashlib.sha256(password_bytes).hexdigest().encode('utf-8')


def _hash_password_sync(password: str) -> str:
    """
    Synchronous password hashing (for internal use)

    Args:
        password: Plain text password

    Returns:
        Hashed password (as string)
    """
    password_bytes = _prepare_password(password)
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def _verify_password_sync(plain_password: str, hashed_password: str) -> bool:
    """
    Synchronous password verification (for internal use)

    Args:
        plain_password: Plain text password
        hashed_password: Hashed password from database

    Returns:
        True if password matches
    """
    password_bytes = _prepare_password(plain_password)
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hashed_bytes)


async def hash_password(password: str) -> str:
    """
    Hash a password using bcrypt (async, runs in thread pool)

    Supports passwords of any length by pre-hashing long passwords with SHA256.

    Args:
        password: Plain text password

    Returns:
        Hashed password (as string)
    """
    return await asyncio.to_thread(_hash_password_sync, password)


async def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a password against a hash (async, runs in thread pool)

    Args:
        plain_password: Plain text password
        hashed_password: Hashed password from database

    Returns:
        True if password matches
    """
    return await asyncio.to_thread(_verify_password_sync, plain_password, hashed_password)


# Legacy sync versions for backwards compatibility
def hash_password_sync(password: str) -> str:
    """Synchronous version of hash_password for non-async contexts"""
    return _hash_password_sync(password)


def verify_password_sync(plain_password: str, hashed_password: str) -> bool:
    """Synchronous version of verify_password for non-async contexts"""
    return _verify_password_sync(plain_password, hashed_password)


# ===== JWT TOKEN MANAGEMENT =====

def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create JWT access token

    Args:
        data: Data to encode in token (must include "sub" for user_id)
        expires_delta: Token expiration time (default: from settings)

    Returns:
        JWT token string

    Example:
        token = create_access_token(
            data={"sub": str(user.id), "email": user.email},
            expires_delta=timedelta(days=30)
        )
    """
    to_encode = data.copy()

    # Set expiration
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=settings.jwt_expiration_days)

    to_encode.update({"exp": expire})

    # Generate unique token ID (jti) for revocation
    if "jti" not in to_encode:
        to_encode["jti"] = secrets.token_urlsafe(32)

    # Encode token
    encoded_jwt = jwt.encode(
        to_encode,
        settings.secret_key,
        algorithm=settings.jwt_algorithm
    )

    return encoded_jwt


def decode_access_token(token: str) -> dict:
    """
    Decode and verify JWT token

    Args:
        token: JWT token string

    Returns:
        Decoded token payload

    Raises:
        JWTError: If token is invalid or expired
    """
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}")


def get_token_user_id(token: str) -> int:
    """
    Extract user_id from token

    Args:
        token: JWT token string

    Returns:
        User ID from token

    Raises:
        ValueError: If token is invalid or missing user_id
    """
    payload = decode_access_token(token)
    user_id = payload.get("sub")

    if user_id is None:
        raise ValueError("Token missing 'sub' claim")

    try:
        return int(user_id)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid user_id in token: {user_id}")


def get_token_jti(token: str) -> str:
    """
    Extract jti (token ID) from token

    Args:
        token: JWT token string

    Returns:
        Token ID (jti)

    Raises:
        ValueError: If token is invalid or missing jti
    """
    payload = decode_access_token(token)
    jti = payload.get("jti")

    if jti is None:
        raise ValueError("Token missing 'jti' claim")

    return jti


def create_password_reset_token(user_id: int) -> str:
    """
    Create password reset token (short-lived)

    Args:
        user_id: User ID

    Returns:
        Password reset token (valid for 1 hour)
    """
    return create_access_token(
        data={"sub": str(user_id), "type": "password_reset"},
        expires_delta=timedelta(hours=1)
    )


def create_email_verification_token(user_id: int) -> str:
    """
    Create email verification token

    Args:
        user_id: User ID

    Returns:
        Email verification token (valid for 7 days)
    """
    return create_access_token(
        data={"sub": str(user_id), "type": "email_verification"},
        expires_delta=timedelta(days=7)
    )
