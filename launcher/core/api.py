"""
API client for communicating with the pixsim7 backend.

Provides simple HTTP client utilities for fetching metadata and configuration
from the backend API.
"""
import requests
import json
from typing import Optional, Dict, List, Any
from pathlib import Path


DEFAULT_API_URL = "http://localhost:8000"
CACHE_DIR = Path("data/cache")


class BackendAPIClient:
    """Client for fetching metadata from the pixsim7 backend API."""

    def __init__(self, base_url: str = DEFAULT_API_URL, timeout: int = 2):
        """
        Initialize the API client.

        Args:
            base_url: Base URL for the backend API (e.g., "http://localhost:8000")
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout

    def get_console_fields(self) -> Optional[List[Dict[str, Any]]]:
        """
        Fetch console field metadata from the backend.

        Returns:
            List of field definitions with name, color, clickable, pattern, etc.
            Returns None if the API call fails.
        """
        try:
            url = f"{self.base_url}/api/v1/logs/console-fields"
            response = requests.get(url, timeout=self.timeout)

            if response.status_code == 200:
                data = response.json()
                return data.get('fields', [])
            else:
                return None
        except Exception:
            # Silently fail - caller will handle fallback
            return None

    def get_console_fields_cached(self, cache_file: Optional[Path] = None) -> Optional[List[Dict[str, Any]]]:
        """
        Fetch console fields with disk caching.

        Tries to fetch from API first, then falls back to cache.
        Updates cache if API call succeeds.

        Args:
            cache_file: Path to cache file (default: data/cache/console_fields.json)

        Returns:
            List of field definitions, or None if both API and cache fail
        """
        if cache_file is None:
            cache_file = CACHE_DIR / "console_fields.json"

        # Try to fetch from API
        fields = self.get_console_fields()

        if fields is not None:
            # Update cache
            try:
                cache_file.parent.mkdir(parents=True, exist_ok=True)
                with open(cache_file, 'w') as f:
                    json.dump(fields, f, indent=2)
            except Exception:
                pass  # Cache write failure is non-fatal

            return fields

        # Fall back to cached version
        try:
            if cache_file.exists():
                with open(cache_file, 'r') as f:
                    return json.load(f)
        except Exception:
            pass

        return None


def get_console_field_metadata(
    api_url: str = DEFAULT_API_URL,
    use_cache: bool = True,
    timeout: int = 2
) -> Optional[List[Dict[str, Any]]]:
    """
    Convenience function to fetch console field metadata.

    Args:
        api_url: Base URL for backend API
        use_cache: Whether to use disk caching
        timeout: Request timeout in seconds

    Returns:
        List of field definitions, or None if fetch fails
    """
    client = BackendAPIClient(base_url=api_url, timeout=timeout)

    if use_cache:
        return client.get_console_fields_cached()
    else:
        return client.get_console_fields()
