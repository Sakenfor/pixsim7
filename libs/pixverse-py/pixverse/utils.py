"""
Utility functions for pixverse-py
"""

import time
import hashlib
from typing import Callable, Any
from pathlib import Path


def retry_with_backoff(
    func: Callable,
    max_retries: int = 3,
    initial_delay: float = 1.0,
    backoff_factor: float = 2.0,
    exceptions: tuple = (Exception,)
) -> Any:
    """
    Retry function with exponential backoff

    Args:
        func: Function to retry
        max_retries: Maximum number of retries
        initial_delay: Initial delay in seconds
        backoff_factor: Multiplier for delay after each retry
        exceptions: Tuple of exceptions to catch

    Returns:
        Function result

    Raises:
        Last exception if all retries fail
    """
    delay = initial_delay

    for attempt in range(max_retries):
        try:
            return func()
        except exceptions as e:
            if attempt == max_retries - 1:
                raise

            time.sleep(delay)
            delay *= backoff_factor


def compute_image_hash(image_path: Path) -> str:
    """
    Compute perceptual hash for image

    Args:
        image_path: Path to image file

    Returns:
        Hex string hash

    Note:
        Tries perceptual hash (requires pillow + imagehash),
        falls back to MD5 if not available
    """
    try:
        from PIL import Image
        import imagehash

        with Image.open(str(image_path)) as im:
            ph = imagehash.phash(im)
            return str(ph)
    except ImportError:
        # Fallback to MD5 if PIL/imagehash not available
        return compute_md5_hash(image_path)
    except (OSError, IOError) as e:
        # Image file cannot be opened, use MD5 as fallback
        import logging
        logger = logging.getLogger(__name__)
        logger.warning("Could not compute perceptual hash for %s: %s, using MD5 fallback", image_path, e)
        return compute_md5_hash(image_path)


def compute_md5_hash(file_path: Path) -> str:
    """
    Compute MD5 hash of file

    Args:
        file_path: Path to file

    Returns:
        Hex string hash (first 16 chars)
    """
    data = file_path.read_bytes()
    return hashlib.md5(data).hexdigest()[:16]


def parse_video_metadata(data: dict) -> dict:
    """
    Parse video metadata from API response

    Args:
        data: API response data

    Returns:
        Normalized metadata dict
    """
    # TODO: Update based on actual Pixverse API response format
    return {
        "id": data.get("id") or data.get("video_id"),
        "url": data.get("url") or data.get("video_url"),
        "status": data.get("status", "pending"),
        "prompt": data.get("prompt"),
        "thumbnail": data.get("thumbnail") or data.get("cover_url"),
        "duration": data.get("duration"),
        "model": data.get("model"),
        "created_at": data.get("created_at") or data.get("create_time"),
        "completed_at": data.get("completed_at") or data.get("complete_time"),
    }
