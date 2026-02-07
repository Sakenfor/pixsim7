"""
JWT token utilities - CLEAN VERSION

Parse JWT tokens to extract expiration and metadata
NO VALIDATION - just parsing for display purposes
"""
import json
import base64
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class JWTInfo(BaseModel):
    """Parsed JWT token info"""
    is_expired: bool
    is_valid: bool
    expires_at: Optional[datetime]
    issued_at: Optional[datetime]
    user_id: Optional[str]
    email: Optional[str]

    class Config:
        from_attributes = True


def parse_jwt_token(token: str) -> JWTInfo:
    """
    Parse JWT token and extract info (NO VALIDATION - just parsing)

    Args:
        token: JWT token string

    Returns:
        JWTInfo with expiration and metadata
    """
    try:
        parts = token.split('.')
        if len(parts) != 3:
            logger.warning("Invalid JWT format: expected 3 parts")
            return JWTInfo(
                is_expired=True,
                is_valid=False,
                expires_at=None,
                issued_at=None,
                user_id=None,
                email=None
            )

        # Decode payload (second part)
        payload_part = parts[1]
        # Add padding if needed
        payload_part += '=' * (4 - len(payload_part) % 4)

        decoded = base64.urlsafe_b64decode(payload_part)
        payload = json.loads(decoded)

        # Extract fields
        exp = payload.get("exp")
        iat = payload.get("iat")
        user_id = payload.get("sub") or payload.get("userId") or payload.get("Username")

        # Try to find email in various fields
        email = _extract_email(payload)

        expires_at = datetime.fromtimestamp(exp) if exp else None
        issued_at = datetime.fromtimestamp(iat) if iat else None
        is_expired = expires_at < datetime.now(timezone.utc) if expires_at else False

        return JWTInfo(
            is_expired=is_expired,
            is_valid=True,
            expires_at=expires_at,
            issued_at=issued_at,
            user_id=user_id,
            email=email
        )
    except Exception as e:
        logger.error(f"Failed to parse JWT token: {e}")
        return JWTInfo(
            is_expired=True,
            is_valid=False,
            expires_at=None,
            issued_at=None,
            user_id=None,
            email=None
        )


def _extract_email(payload: Dict[str, Any]) -> Optional[str]:
    """Extract email from JWT payload, trying multiple field names"""
    possible_fields = [
        'email', 'Email', 'EmailAddress', 'email_address',
        'username', 'Username', 'user', 'sub'
    ]

    for field in possible_fields:
        value = payload.get(field)
        if value and isinstance(value, str) and '@' in value:
            return value

    return None


def extract_jwt_from_cookies(cookies: Dict[str, str]) -> Optional[str]:
    """
    Extract JWT token from cookies dict

    Args:
        cookies: Dictionary of cookies (key: name, value: value)

    Returns:
        JWT token string or None
    """
    if isinstance(cookies, dict):
        return cookies.get('_ai_token')

    # Handle list format (Chrome cookie export)
    if isinstance(cookies, list):
        for cookie in cookies:
            if isinstance(cookie, dict) and cookie.get('name') == '_ai_token':
                return cookie.get('value')

    return None


def is_jwt_expired(token: str) -> bool:
    """
    Check if JWT token is expired

    Args:
        token: JWT token string

    Returns:
        True if expired, False otherwise
    """
    info = parse_jwt_token(token)
    return info.is_expired


def needs_refresh(token: Optional[str], hours_threshold: int = 24) -> bool:
    """
    Check if JWT token needs refresh (expired or expires soon).

    Args:
        token: JWT token string or None.
        hours_threshold: Refresh if expires within this many hours.

    Returns:
        True if token is missing, expired, or expires soon.
    """
    if not token:
        return True

    info = parse_jwt_token(token)
    if not info.is_valid:
        return True

    if info.is_expired:
        return True

    if info.expires_at is not None:
        from datetime import datetime, timedelta

        threshold = datetime.now(timezone.utc) + timedelta(hours=hours_threshold)
        if info.expires_at < threshold:
            return True

    return False
