"""
Google ID token authentication helper

Exchanges a Google `id_token` for a Pixverse session using the
`/creative_platform/oauth2/google/auto_login` endpoint.
"""

from typing import Dict, Any
import requests

from ..exceptions import AuthenticationError


BASE_URL = "https://app-api.pixverse.ai"


def login_with_google_id_token(id_token: str) -> Dict[str, Any]:
    """
    Exchange a Google ID token for a Pixverse session.

    Args:
        id_token: Google ID token obtained from the OAuth flow.

    Returns:
        Session data with JWT token and account info:
            {
                "jwt_token": str,
                "account_id": ...,
                "username": ...,
                "nickname": ...,
                "cookies": {...},
            }

    Raises:
        AuthenticationError: If the Pixverse API call fails.
    """
    try:
        response = requests.post(
            f"{BASE_URL}/creative_platform/oauth2/google/auto_login",
            json={"id_token": id_token},
            timeout=30,
        )
    except requests.RequestException as e:
        raise AuthenticationError(f"Google auto_login request failed: {e}")

    if response.status_code != 200:
        raise AuthenticationError(f"Google auto_login failed with status {response.status_code}")

    try:
        data = response.json()
    except ValueError as e:
        raise AuthenticationError(f"Invalid JSON from Google auto_login: {e}")

    if data.get("ErrCode") != 0:
        raise AuthenticationError(f"Google auto_login failed: {data.get('ErrMsg', 'Unknown error')}")

    result = (data.get("Resp") or {}).get("Result") or {}
    token = result.get("Token")
    if not token:
        raise AuthenticationError("Google auto_login response missing Token")

    session: Dict[str, Any] = {
        "jwt_token": token,
        "account_id": result.get("AccountId"),
        "username": result.get("Username"),
        "nickname": result.get("Nickname"),
        "cookies": dict(response.cookies),
    }

    return session

