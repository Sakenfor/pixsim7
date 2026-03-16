"""
Client-side authentication — login and token storage.

Stores the API token in ~/.pixsim/token for use by the MCP server
and standalone Claude sessions.
"""
from __future__ import annotations

import getpass
import json
import os
import sys
from pathlib import Path

import httpx


PIXSIM_DIR = Path.home() / ".pixsim"
TOKEN_FILE_PATH = str(PIXSIM_DIR / "token")


def login_and_store(
    api_url: str = "http://localhost:8000",
    username: str | None = None,
    password: str | None = None,
) -> str:
    """Authenticate with the backend and store the token.

    Returns the JWT token string.
    """
    if not username:
        username = input("Username or email: ").strip()
    if not password:
        password = getpass.getpass("Password: ")

    if not username or not password:
        print("Username and password are required.", file=sys.stderr)
        sys.exit(1)

    print(f"Logging in to {api_url}...")

    try:
        resp = httpx.post(
            f"{api_url}/api/v1/auth/login",
            json={"email_or_username": username, "password": password},
            timeout=10,
        )
    except httpx.ConnectError:
        print(f"Connection refused: {api_url} — is the backend running?", file=sys.stderr)
        sys.exit(1)

    if resp.status_code != 200:
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:
            detail = resp.text
        print(f"Login failed ({resp.status_code}): {detail}", file=sys.stderr)
        sys.exit(1)

    data = resp.json()
    token = data.get("token") or data.get("access_token", "")
    if not token:
        print("Login succeeded but no token in response.", file=sys.stderr)
        sys.exit(1)

    # Store token
    _store_token(token)

    user_info = data.get("user", {})
    display = user_info.get("username") or user_info.get("email") or username
    print(f"Logged in as: {display}")
    print(f"Token stored: {TOKEN_FILE_PATH}")

    return token


def _store_token(token: str) -> None:
    """Write token to ~/.pixsim/token."""
    PIXSIM_DIR.mkdir(parents=True, exist_ok=True)
    with open(TOKEN_FILE_PATH, "w") as f:
        f.write(token)
    # Restrict permissions on Unix
    try:
        os.chmod(TOKEN_FILE_PATH, 0o600)
    except OSError:
        pass


def get_stored_token() -> str | None:
    """Read the stored token, or None if not logged in."""
    try:
        with open(TOKEN_FILE_PATH, "r") as f:
            token = f.read().strip()
            return token if token else None
    except FileNotFoundError:
        return None
