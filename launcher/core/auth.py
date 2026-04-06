"""Launcher identity and token management.

Generates RS256 signing keypair, manages local admin identity,
and mints JWTs for services managed by the launcher.

Key storage:   ~/.pixsim/keys/{private.pem, public.pem}
Identity:      ~/.pixsim/identity.json
"""
from __future__ import annotations

import base64
import json
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

PIXSIM_DIR = Path.home() / ".pixsim"
KEYS_DIR = PIXSIM_DIR / "keys"
IDENTITY_PATH = PIXSIM_DIR / "identity.json"


# ---------------------------------------------------------------------------
# Identity
# ---------------------------------------------------------------------------

@dataclass
class LauncherIdentity:
    """Local admin identity stored at ~/.pixsim/identity.json."""
    user_id: int
    username: str
    email: str = ""
    backend_url: str = "http://localhost:8000"
    keypair_id: str = ""          # SHA-256 fingerprint of the public key
    created_at: str = ""          # ISO timestamp

    def save(self) -> None:
        PIXSIM_DIR.mkdir(parents=True, exist_ok=True)
        data = asdict(self)
        IDENTITY_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")

    @classmethod
    def load(cls) -> Optional["LauncherIdentity"]:
        """Load identity from disk, or None if not set up."""
        if not IDENTITY_PATH.exists():
            return None
        try:
            data = json.loads(IDENTITY_PATH.read_text(encoding="utf-8"))
            return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})
        except Exception:
            return None


def identity_exists() -> bool:
    return IDENTITY_PATH.exists()


# ---------------------------------------------------------------------------
# RS256 Keypair
# ---------------------------------------------------------------------------

def _fingerprint(public_pem: bytes) -> str:
    """SHA-256 fingerprint of a PEM-encoded public key."""
    import hashlib
    return hashlib.sha256(public_pem).hexdigest()[:16]


def ensure_keypair() -> tuple[bytes, bytes]:
    """Ensure an RS256 keypair exists. Returns (private_pem, public_pem).

    Generates a new 2048-bit RSA keypair if one doesn't exist yet.
    """
    private_path = KEYS_DIR / "private.pem"
    public_path = KEYS_DIR / "public.pem"

    if private_path.exists() and public_path.exists():
        return private_path.read_bytes(), public_path.read_bytes()

    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    KEYS_DIR.mkdir(parents=True, exist_ok=True)
    private_path.write_bytes(private_pem)
    public_path.write_bytes(public_pem)

    # Restrict private key permissions on Unix
    if os.name != "nt":
        try:
            os.chmod(private_path, 0o600)
        except OSError:
            pass

    return private_pem, public_pem


def get_public_key_pem() -> Optional[bytes]:
    """Read the public key PEM, or None if not generated yet."""
    path = KEYS_DIR / "public.pem"
    return path.read_bytes() if path.exists() else None


def get_public_key_b64() -> Optional[str]:
    """Public key as base64-encoded PEM string (for env var injection)."""
    pem = get_public_key_pem()
    return base64.b64encode(pem).decode() if pem else None


# ---------------------------------------------------------------------------
# Token minting
# ---------------------------------------------------------------------------

def mint_token(
    user_id: int,
    purpose: str = "launcher",
    ttl_hours: float = 24,
    **extra_claims,
) -> str:
    """Mint an RS256 JWT signed with the launcher's private key.

    Args:
        user_id: Backend user ID this token represents.
        purpose: Token purpose claim (default "launcher").
        ttl_hours: Hours until expiry.
        **extra_claims: Additional JWT claims (profile_id, agent_type, etc.).

    Returns:
        Encoded JWT string.
    """
    import uuid
    import jwt

    private_pem = (KEYS_DIR / "private.pem").read_bytes()

    now = time.time()
    payload = {
        "sub": str(user_id),
        "jti": uuid.uuid4().hex,
        "purpose": purpose,
        "principal_type": "user",
        "iss": "pixsim-launcher",
        "iat": int(now),
        "exp": int(now + ttl_hours * 3600),
        "is_admin": True,
        "is_active": True,
        "on_behalf_of": user_id,
        **extra_claims,
    }

    return jwt.encode(payload, private_pem, algorithm="RS256")


# ---------------------------------------------------------------------------
# Setup orchestration
# ---------------------------------------------------------------------------

TOKEN_PATH = PIXSIM_DIR / "token"

# Refresh the token when less than this fraction of TTL remains.
# e.g. 0.5 means refresh at the halfway point of the 24h window (= 12h).
_REFRESH_THRESHOLD = 0.5


def get_token_info() -> Optional[dict]:
    """Decode the stored token and return its claims, or None.

    Does NOT verify the signature — this is for local introspection only.
    """
    if not TOKEN_PATH.exists():
        return None
    try:
        import jwt
        token = TOKEN_PATH.read_text(encoding="utf-8").strip()
        if not token:
            return None
        return jwt.decode(token, options={"verify_signature": False})
    except Exception:
        return None


def token_needs_refresh(threshold: float = _REFRESH_THRESHOLD) -> bool:
    """Return True if the stored token should be refreshed.

    Triggers when remaining lifetime is below *threshold* fraction of the
    original TTL, or if the token is already expired / missing.
    """
    info = get_token_info()
    if not info:
        return True
    exp = info.get("exp")
    iat = info.get("iat")
    if not exp:
        return True
    now = time.time()
    if now >= exp:
        return True  # already expired
    if iat:
        ttl = exp - iat
        remaining = exp - now
        if remaining < ttl * threshold:
            return True
    return False


def ensure_identity() -> Optional[LauncherIdentity]:
    """Load existing identity, or return None if first-time setup is needed.

    Call this early in launcher startup. If None is returned, the launcher
    should show the setup UI (Phase 2) before proceeding.
    """
    return LauncherIdentity.load()


def refresh_stored_token(identity: LauncherIdentity) -> bool:
    """Mint a fresh launcher token and write it to ~/.pixsim/token.

    Called on launcher startup to ensure MCP/bridge always have a valid token.
    The token is signed with the launcher's RS256 key — the backend must have
    PIXSIM_LAUNCHER_PUBLIC_KEY set to accept it (Phase 3).
    """
    private_path = KEYS_DIR / "private.pem"
    if not private_path.exists():
        return False

    token = mint_token(
        user_id=identity.user_id,
        purpose="launcher",
        ttl_hours=24,
        on_behalf_of=identity.user_id,
        username=identity.username,
        email=identity.email,
    )
    PIXSIM_DIR.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(token)
    if os.name != "nt":
        try:
            os.chmod(TOKEN_PATH, 0o600)
        except OSError:
            pass
    return True


def create_identity(
    user_id: int,
    username: str,
    email: str = "",
    backend_url: str = "http://localhost:8000",
) -> LauncherIdentity:
    """Create a new launcher identity and generate the signing keypair.

    Called by the setup flow after the admin account is created or linked.
    """
    _, public_pem = ensure_keypair()

    identity = LauncherIdentity(
        user_id=user_id,
        username=username,
        email=email,
        backend_url=backend_url,
        keypair_id=_fingerprint(public_pem),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    identity.save()
    return identity
