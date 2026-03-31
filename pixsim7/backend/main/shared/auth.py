"""
Authentication utilities - password hashing and JWT token management

Clean auth utilities for PixSim7
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
import hashlib
import asyncio

import bcrypt
from jose import JWTError, jwt

from pixsim7.backend.main.shared.config import settings


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
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expiration_days)

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


_launcher_key_cache: Optional[str] = None

def _get_launcher_public_key() -> Optional[str]:
    """Get the launcher public key for RS256 verification.

    Sources (in order):
    1. PIXSIM_LAUNCHER_PUBLIC_KEY env var (base64 PEM, set by launcher)
    2. ~/.pixsim/keys/public.pem file (written by launcher setup)
    """
    global _launcher_key_cache
    if _launcher_key_cache is not None:
        return _launcher_key_cache if _launcher_key_cache else None

    # Try env var first
    raw = settings.launcher_public_key
    if raw:
        try:
            import base64
            _launcher_key_cache = base64.b64decode(raw).decode()
            return _launcher_key_cache
        except Exception:
            pass

    # Try well-known file
    try:
        from pathlib import Path
        pub_path = Path.home() / ".pixsim" / "keys" / "public.pem"
        if pub_path.exists():
            _launcher_key_cache = pub_path.read_text()
            return _launcher_key_cache
    except Exception:
        pass

    _launcher_key_cache = ""  # negative cache
    return None


def decode_access_token(token: str) -> dict:
    """
    Decode and verify JWT token.

    Tries RS256 with the launcher public key first (if configured),
    then falls back to HS256 with the secret key. This allows both
    launcher-minted tokens and backend-minted tokens to work.

    Args:
        token: JWT token string

    Returns:
        Decoded token payload

    Raises:
        ValueError: If token is invalid or expired
    """
    # Try launcher RS256 key first (if configured)
    launcher_key = _get_launcher_public_key()
    if launcher_key:
        try:
            payload = jwt.decode(token, launcher_key, algorithms=["RS256"])
            return payload
        except JWTError:
            pass  # Not a launcher token — fall through to HS256

    # Fall back to backend HS256 key
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


# ===== DEPRECATED — use services.user.token_policy.mint_token directly =====
# These are removed. Import from token_policy instead:
#   from pixsim7.backend.main.services.user.token_policy import TokenKind, mint_token
