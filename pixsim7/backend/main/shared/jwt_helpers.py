"""
Generic JWT utilities for provider authentication

Providers like Sora, Runway, etc. use JWT bearer tokens with different payload structures.
This module provides generic utilities to parse and extract data from various JWT formats.
"""
import json
import base64
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


def parse_jwt_payload(token: str) -> Dict[str, Any]:
    """
    Parse JWT token and return payload as dict

    Args:
        token: JWT token string (without "Bearer " prefix)

    Returns:
        Decoded payload dictionary

    Raises:
        ValueError: If token format is invalid

    Example:
        >>> token = "eyJhbGci...header.eyJlbWFpbCI...payload.signature"
        >>> payload = parse_jwt_payload(token)
        >>> print(payload["email"])
    """
    try:
        parts = token.split(".")
        if len(parts) < 2:
            raise ValueError("Invalid JWT format - expected 3 parts separated by '.'")

        # Get payload (second part)
        payload_b64 = parts[1]

        # Add padding if needed (base64 requires length to be multiple of 4)
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding

        # Decode base64 and parse JSON
        payload_json = base64.urlsafe_b64decode(payload_b64).decode("utf-8")
        payload = json.loads(payload_json)

        return payload

    except Exception as e:
        logger.error(f"Failed to parse JWT payload: {e}")
        raise ValueError(f"Invalid JWT token: {e}")


def get_nested_value(data: Dict[str, Any], path: str) -> Optional[Any]:
    """
    Get value from nested dict using dot-notation path

    Args:
        data: Dictionary to search
        path: Dot-separated path (e.g., "user.profile.email")

    Returns:
        Value at path, or None if not found

    Example:
        >>> data = {"user": {"profile": {"email": "test@example.com"}}}
        >>> get_nested_value(data, "user.profile.email")
        "test@example.com"
    """
    keys = path.split(".")
    value = data

    for key in keys:
        if isinstance(value, dict):
            value = value.get(key)
            if value is None:
                return None
        else:
            return None

    return value


def extract_from_jwt(
    payload: Dict[str, Any],
    field_paths: List[str],
    validator: Optional[callable] = None
) -> Optional[str]:
    """
    Extract a field from JWT payload by trying multiple possible paths

    Args:
        payload: Decoded JWT payload
        field_paths: List of possible paths to try (in order)
        validator: Optional function to validate extracted value

    Returns:
        First valid value found, or None

    Example:
        >>> payload = {"email": "test@example.com"}
        >>> extract_from_jwt(
        ...     payload,
        ...     ["https://api.openai.com/profile.email", "email"],
        ...     validator=lambda v: "@" in v
        ... )
        "test@example.com"
    """
    for path in field_paths:
        value = get_nested_value(payload, path)

        if value is not None:
            # Convert to string
            value_str = str(value)

            # Validate if validator provided
            if validator is None or validator(value_str):
                return value_str

    return None


def extract_email_from_jwt(payload: Dict[str, Any], paths: List[str]) -> Optional[str]:
    """
    Extract email from JWT payload

    Args:
        payload: Decoded JWT payload
        paths: List of possible paths where email might be stored

    Returns:
        Email address or None

    Example:
        >>> payload = {"https://api.openai.com/profile": {"email": "test@example.com"}}
        >>> extract_email_from_jwt(
        ...     payload,
        ...     ["https://api.openai.com/profile.email", "email"]
        ... )
        "test@example.com"
    """
    return extract_from_jwt(
        payload,
        paths,
        validator=lambda v: "@" in v  # Basic email validation
    )


def extract_user_id_from_jwt(payload: Dict[str, Any], paths: List[str]) -> Optional[str]:
    """
    Extract user ID from JWT payload

    Args:
        payload: Decoded JWT payload
        paths: List of possible paths where user ID might be stored

    Returns:
        User ID or None

    Example:
        >>> payload = {"sub": "user-ABC123", "user_id": "123"}
        >>> extract_user_id_from_jwt(payload, ["sub", "user_id"])
        "user-ABC123"
    """
    return extract_from_jwt(
        payload,
        paths,
        validator=lambda v: len(v) > 0  # Non-empty
    )


def extract_username_from_jwt(payload: Dict[str, Any], paths: List[str]) -> Optional[str]:
    """
    Extract username from JWT payload

    Args:
        payload: Decoded JWT payload
        paths: List of possible paths where username might be stored

    Returns:
        Username or None
    """
    return extract_from_jwt(
        payload,
        paths,
        validator=lambda v: len(v) > 0
    )


class JWTExtractor:
    """
    Configurable JWT extractor for different provider formats

    Define field mappings once, then extract all data easily.

    Example:
        >>> # OpenAI/Sora format
        >>> sora_extractor = JWTExtractor(
        ...     email_paths=["https://api.openai.com/profile.email", "email"],
        ...     user_id_paths=["https://api.openai.com/auth.user_id", "sub"],
        ...     username_paths=["username", "name"]
        ... )
        >>>
        >>> data = sora_extractor.extract(jwt_token)
        >>> print(data["email"], data["user_id"])

        >>> # Generic format
        >>> generic_extractor = JWTExtractor(
        ...     email_paths=["email", "user.email"],
        ...     user_id_paths=["user_id", "sub", "id"],
        ...     username_paths=["username", "user.name", "name"]
        ... )
    """

    def __init__(
        self,
        email_paths: List[str],
        user_id_paths: List[str],
        username_paths: Optional[List[str]] = None,
        custom_fields: Optional[Dict[str, List[str]]] = None
    ):
        """
        Initialize JWT extractor with field path mappings

        Args:
            email_paths: Possible paths for email field
            user_id_paths: Possible paths for user ID field
            username_paths: Possible paths for username field
            custom_fields: Additional custom field mappings
        """
        self.email_paths = email_paths
        self.user_id_paths = user_id_paths
        self.username_paths = username_paths or []
        self.custom_fields = custom_fields or {}

    def extract(self, token: str) -> Dict[str, Optional[str]]:
        """
        Extract all configured fields from JWT token

        Args:
            token: JWT token string

        Returns:
            Dict with extracted fields (email, user_id, username, etc.)

        Example:
            >>> extractor = JWTExtractor(
            ...     email_paths=["email"],
            ...     user_id_paths=["sub"]
            ... )
            >>> data = extractor.extract(jwt_token)
            >>> print(data)
            {"email": "test@example.com", "user_id": "user-123", "username": None}
        """
        # Parse JWT
        payload = parse_jwt_payload(token)

        # Extract standard fields
        result = {
            "email": extract_email_from_jwt(payload, self.email_paths),
            "user_id": extract_user_id_from_jwt(payload, self.user_id_paths),
            "username": extract_username_from_jwt(payload, self.username_paths) if self.username_paths else None,
        }

        # Extract custom fields
        for field_name, paths in self.custom_fields.items():
            result[field_name] = extract_from_jwt(payload, paths)

        return result
