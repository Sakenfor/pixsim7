"""
Auth Capture Schemas

Data shapes for browser-captured authentication data.
Used when importing accounts from the browser extension.
"""
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class AuthCaptureData(BaseModel):
    """
    Raw authentication data captured from browser

    This is the data shape expected from the browser extension's content script.
    Provider adapters implement extract_account_data() to parse this into
    structured account data.
    """
    cookies: Dict[str, Any] = Field(
        default_factory=dict,
        description="Cookies captured from provider domain"
    )
    localStorage: Dict[str, Any] = Field(
        default_factory=dict,
        description="localStorage data captured from provider domain"
    )
    sessionStorage: Dict[str, Any] = Field(
        default_factory=dict,
        description="sessionStorage data captured from provider domain"
    )
    url: Optional[str] = Field(
        default=None,
        description="URL where capture occurred (for provider detection)"
    )
    provider_id: Optional[str] = Field(
        default=None,
        description="Explicit provider ID (if known)"
    )


class AuthCaptureResult(BaseModel):
    """
    Structured result from auth capture extraction

    This is what provider adapters return from extract_account_data().
    """
    email: str = Field(..., description="User email (required)")
    jwt_token: Optional[str] = Field(
        default=None,
        description="JWT authentication token (if available)"
    )
    api_key: Optional[str] = Field(
        default=None,
        description="API key (if available)"
    )
    api_keys: Optional[list[Dict[str, Any]]] = Field(
        default=None,
        description="List of API keys with metadata"
    )
    cookies: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Cleaned cookies to store"
    )
    credits: Optional[Dict[str, int]] = Field(
        default=None,
        description="Credits by type (e.g., {'web': 100, 'openapi': 50})"
    )
    provider_user_id: Optional[str] = Field(
        default=None,
        description="Provider's user ID"
    )
    provider_metadata: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional provider-specific metadata"
    )
    is_google_account: bool = Field(
        default=False,
        description="Whether account uses Google OAuth"
    )
