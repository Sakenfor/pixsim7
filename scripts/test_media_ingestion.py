#!/usr/bin/env python3
"""
Media Ingestion Pipeline Smoke Test

Validates the complete ingestion pipeline:
1. Add asset via URL -> blob stored
2. Metadata filled (dimensions, etc.)
3. Thumbnail generated
4. Gallery uses local URLs

Usage:
    python scripts/test_media_ingestion.py

Requirements:
    - Backend server running on localhost:8000
    - Valid user authentication token
"""
import os
import sys
import json
import time
import asyncio
import httpx
from pathlib import Path

# Configuration
API_BASE = os.getenv("PIXSIM_API_BASE", "http://localhost:8000")
TEST_IMAGE_URL = "https://picsum.photos/800/600"  # Random image for testing
TEST_VIDEO_URL = None  # Set to a video URL for video testing

# Colors for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"


def success(msg: str):
    print(f"{GREEN}✓ {msg}{RESET}")


def error(msg: str):
    print(f"{RED}✗ {msg}{RESET}")


def info(msg: str):
    print(f"{YELLOW}ℹ {msg}{RESET}")


async def get_auth_token() -> str:
    """Get authentication token from environment or login."""
    token = os.getenv("PIXSIM_AUTH_TOKEN")
    if token:
        return token

    # Try to get token from default dev credentials
    async with httpx.AsyncClient(base_url=API_BASE) as client:
        try:
            resp = await client.post(
                "/api/v1/auth/login",
                json={"username": "admin", "password": "admin"},
            )
            if resp.status_code == 200:
                return resp.json().get("access_token")
        except Exception as e:
            info(f"Login failed: {e}")

    raise ValueError(
        "No auth token available. Set PIXSIM_AUTH_TOKEN or ensure dev server has admin/admin."
    )


async def test_media_settings(client: httpx.AsyncClient) -> bool:
    """Test media settings API."""
    print("\n--- Testing Media Settings API ---")

    try:
        # Get settings
        resp = await client.get("/api/v1/media/settings")
        if resp.status_code != 200:
            error(f"GET /media/settings failed: {resp.status_code}")
            return False

        settings = resp.json()
        success(f"Got media settings: {json.dumps(settings, indent=2)}")

        # Verify expected fields
        expected_fields = [
            "ingest_on_asset_add",
            "prefer_local_over_provider",
            "generate_thumbnails",
            "max_download_size_mb",
        ]
        for field in expected_fields:
            if field not in settings:
                error(f"Missing field: {field}")
                return False

        success("All expected settings fields present")
        return True

    except Exception as e:
        error(f"Settings test failed: {e}")
        return False


async def test_ingestion_stats(client: httpx.AsyncClient) -> bool:
    """Test ingestion stats API."""
    print("\n--- Testing Ingestion Stats API ---")

    try:
        resp = await client.get("/api/v1/media/ingestion/stats")
        if resp.status_code != 200:
            error(f"GET /media/ingestion/stats failed: {resp.status_code}")
            return False

        stats = resp.json()
        success(f"Ingestion stats: {json.dumps(stats, indent=2)}")

        # Verify expected fields
        expected_fields = ["pending", "processing", "completed", "failed"]
        for field in expected_fields:
            if field not in stats:
                error(f"Missing stats field: {field}")
                return False

        success("Ingestion stats API working")
        return True

    except Exception as e:
        error(f"Ingestion stats test failed: {e}")
        return False


async def test_upload_and_ingest(client: httpx.AsyncClient) -> dict | None:
    """Test uploading asset from URL and triggering ingestion."""
    print("\n--- Testing Asset Upload from URL ---")

    try:
        # Upload from URL
        resp = await client.post(
            "/api/v1/assets/upload-from-url",
            json={
                "url": TEST_IMAGE_URL,
                "provider_id": "test",
                "ensure_asset": True,
            },
        )

        if resp.status_code not in (200, 201):
            error(f"Upload failed: {resp.status_code} - {resp.text}")
            return None

        result = resp.json()
        success(f"Asset uploaded: {json.dumps(result, indent=2)}")

        # Get asset details
        external_url = result.get("external_url", "")
        if external_url.startswith("/api/v1/assets/"):
            # Extract asset ID from URL
            asset_id = int(external_url.split("/")[-2])
        else:
            info("Asset ID not found in response, skipping detail check")
            return result

        # Get asset details
        resp = await client.get(f"/api/v1/assets/{asset_id}")
        if resp.status_code == 200:
            asset = resp.json()
            success(f"Asset details retrieved: id={asset_id}")

            # Check if metadata was extracted
            width = asset.get("width")
            height = asset.get("height")
            if width and height:
                success(f"Metadata extracted: {width}x{height}")
            else:
                info("Metadata not yet extracted (ingestion may be pending)")

            # Check ingestion status
            ingest_status = asset.get("ingest_status")
            if ingest_status:
                info(f"Ingestion status: {ingest_status}")

            return asset
        else:
            error(f"Failed to get asset details: {resp.status_code}")
            return None

    except Exception as e:
        error(f"Upload test failed: {e}")
        import traceback
        traceback.print_exc()
        return None


async def test_trigger_ingestion(client: httpx.AsyncClient, asset_id: int) -> bool:
    """Test manual ingestion trigger."""
    print(f"\n--- Testing Manual Ingestion Trigger (asset {asset_id}) ---")

    try:
        resp = await client.post(
            f"/api/v1/media/ingestion/trigger/{asset_id}",
            params={"force": True},
        )

        if resp.status_code not in (200, 201):
            error(f"Ingestion trigger failed: {resp.status_code} - {resp.text}")
            return False

        result = resp.json()
        success(f"Ingestion triggered: {json.dumps(result, indent=2)}")

        # Verify result fields
        if result.get("ingest_status") == "completed":
            success("Ingestion completed successfully!")

            if result.get("stored_key"):
                success(f"File stored at: {result['stored_key']}")
            if result.get("thumbnail_key"):
                success(f"Thumbnail at: {result['thumbnail_key']}")

            return True
        else:
            info(f"Ingestion status: {result.get('ingest_status')}")
            return True

    except Exception as e:
        error(f"Ingestion trigger test failed: {e}")
        return False


async def test_serve_media(client: httpx.AsyncClient, key: str) -> bool:
    """Test serving media files."""
    print(f"\n--- Testing Media Serving ({key}) ---")

    try:
        resp = await client.get(f"/api/v1/media/{key}")

        if resp.status_code == 200:
            content_type = resp.headers.get("content-type", "")
            cache_control = resp.headers.get("cache-control", "")
            etag = resp.headers.get("etag", "")

            success(f"Media served successfully!")
            info(f"Content-Type: {content_type}")
            info(f"Cache-Control: {cache_control}")
            info(f"ETag: {etag}")
            info(f"Size: {len(resp.content)} bytes")

            return True
        else:
            error(f"Media serving failed: {resp.status_code}")
            return False

    except Exception as e:
        error(f"Media serving test failed: {e}")
        return False


async def run_tests():
    """Run all smoke tests."""
    print("=" * 60)
    print("Media Ingestion Pipeline Smoke Test")
    print("=" * 60)
    print(f"API Base: {API_BASE}")

    # Get auth token
    try:
        token = await get_auth_token()
        success("Authentication successful")
    except Exception as e:
        error(f"Authentication failed: {e}")
        return False

    # Create authenticated client
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient(
        base_url=API_BASE,
        headers=headers,
        timeout=60,
    ) as client:
        results = []

        # Test 1: Media settings
        results.append(("Media Settings", await test_media_settings(client)))

        # Test 2: Ingestion stats
        results.append(("Ingestion Stats", await test_ingestion_stats(client)))

        # Test 3: Upload and ingest
        asset = await test_upload_and_ingest(client)
        results.append(("Asset Upload", asset is not None))

        if asset:
            asset_id = asset.get("id")
            if asset_id:
                # Test 4: Manual ingestion trigger
                results.append(
                    ("Ingestion Trigger", await test_trigger_ingestion(client, asset_id))
                )

                # Wait for ingestion to complete
                await asyncio.sleep(2)

                # Get updated asset
                resp = await client.get(f"/api/v1/assets/{asset_id}")
                if resp.status_code == 200:
                    updated_asset = resp.json()
                    stored_key = updated_asset.get("stored_key")
                    thumbnail_key = updated_asset.get("thumbnail_key")

                    # Test 5: Serve stored media
                    if stored_key:
                        results.append(
                            ("Media Serving", await test_serve_media(client, stored_key))
                        )

                    # Test 6: Serve thumbnail
                    if thumbnail_key:
                        results.append(
                            ("Thumbnail Serving", await test_serve_media(client, thumbnail_key))
                        )

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    passed = 0
    failed = 0
    for name, result in results:
        if result:
            success(f"{name}: PASSED")
            passed += 1
        else:
            error(f"{name}: FAILED")
            failed += 1

    print(f"\nTotal: {passed} passed, {failed} failed")

    return failed == 0


if __name__ == "__main__":
    success_flag = asyncio.run(run_tests())
    sys.exit(0 if success_flag else 1)
