"""
Frame extraction utility for video assets

Extracts frames from videos at specific timestamps, with automatic deduplication
via SHA256 hashing and asset lineage tracking.
"""
import os
import subprocess
import tempfile
from typing import Optional, Tuple
from pathlib import Path

from pixsim7.backend.main.shared.errors import InvalidOperationError
from pixsim7.backend.main.shared.storage_utils import compute_sha256


def _check_ffmpeg_available() -> bool:
    """Check if ffmpeg is available in PATH"""
    import shutil
    return shutil.which("ffmpeg") is not None


def _check_ffprobe_available() -> bool:
    """Check if ffprobe is available in PATH"""
    import shutil
    return shutil.which("ffprobe") is not None


def extract_frame_ffmpeg(
    video_path: str,
    timestamp: float,
    output_path: Optional[str] = None,
    format: str = "jpg",
    quality: int = 2  # ffmpeg -q:v scale (2 = high quality)
) -> str:
    """
    Extract a single frame from video at specified timestamp using ffmpeg.

    Args:
        video_path: Path to video file
        timestamp: Time in seconds to extract frame
        output_path: Optional output path (temp file created if None)
        format: Image format (jpg, png)
        quality: JPEG quality (1-31, lower = better for ffmpeg -q:v)

    Returns:
        Path to extracted frame image

    Raises:
        InvalidOperationError: If ffmpeg fails or video doesn't exist

    Example:
        >>> frame_path = extract_frame_ffmpeg("video.mp4", 10.5)
        >>> # Frame at 10.5 seconds saved to temp file
    """
    if not os.path.exists(video_path):
        raise InvalidOperationError(f"Video file not found: {video_path}")

    # Check if ffmpeg is available
    if not _check_ffmpeg_available():
        raise InvalidOperationError(
            "ffmpeg is not installed or not available in PATH. "
            "Please install ffmpeg to enable frame extraction functionality."
        )

    # Create output path if not provided
    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=f".{format}", prefix="frame_")
        os.close(fd)

    try:
        # ffmpeg command to extract single frame
        # -ss: seek to timestamp (before input for faster seeking)
        # -i: input file
        # -vframes 1: extract only 1 frame
        # -q:v: quality (2 = high quality JPEG)
        # -y: overwrite output
        cmd = [
            "ffmpeg",
            "-ss", str(timestamp),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", str(quality),
            "-y",  # Overwrite
            output_path
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30  # 30 second timeout
        )

        if result.returncode != 0:
            raise InvalidOperationError(
                f"ffmpeg failed: {result.stderr}"
            )

        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            raise InvalidOperationError(
                f"Frame extraction produced empty file"
            )

        return output_path

    except subprocess.TimeoutExpired:
        if os.path.exists(output_path):
            os.remove(output_path)
        raise InvalidOperationError("Frame extraction timed out after 30s")

    except Exception as e:
        if os.path.exists(output_path):
            os.remove(output_path)
        raise InvalidOperationError(f"Frame extraction failed: {e}")


def extract_frame_with_metadata(
    video_path: str,
    timestamp: float,
    frame_number: Optional[int] = None
) -> Tuple[str, str, int, int]:
    """
    Extract frame and compute metadata (hash, dimensions).

    Args:
        video_path: Path to video file
        timestamp: Time in seconds
        frame_number: Optional frame number for metadata

    Returns:
        Tuple of (frame_path, sha256_hash, width, height)

    Example:
        >>> path, hash, w, h = extract_frame_with_metadata("video.mp4", 10.5, 315)
        >>> # Frame extracted with full metadata
    """
    # Extract frame
    frame_path = extract_frame_ffmpeg(video_path, timestamp)

    try:
        # Compute SHA256
        sha256 = compute_sha256(frame_path)

        # Get dimensions using ffprobe
        width, height = get_image_dimensions(frame_path)

        return frame_path, sha256, width, height

    except Exception as e:
        # Cleanup on error
        if os.path.exists(frame_path):
            os.remove(frame_path)
        raise InvalidOperationError(f"Failed to extract frame metadata: {e}")


def get_image_dimensions(image_path: str) -> Tuple[int, int]:
    """
    Get image dimensions using ffprobe.

    Args:
        image_path: Path to image file

    Returns:
        Tuple of (width, height)
    """
    # Check if ffprobe is available
    if not _check_ffprobe_available():
        raise InvalidOperationError(
            "ffprobe is not installed or not available in PATH. "
            "Please install ffmpeg (includes ffprobe) to enable dimension extraction."
        )

    try:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=p=0",
            image_path
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode != 0:
            raise InvalidOperationError(f"ffprobe failed: {result.stderr}")

        # Parse output: "width,height"
        parts = result.stdout.strip().split(",")
        if len(parts) != 2:
            raise InvalidOperationError(f"Unexpected ffprobe output: {result.stdout}")

        width = int(parts[0])
        height = int(parts[1])

        return width, height

    except subprocess.TimeoutExpired:
        raise InvalidOperationError("ffprobe timed out")
    except ValueError as e:
        raise InvalidOperationError(f"Failed to parse dimensions: {e}")


def timestamp_to_frame_number(timestamp: float, fps: float) -> int:
    """
    Convert timestamp to frame number.

    Args:
        timestamp: Time in seconds
        fps: Frames per second

    Returns:
        Frame number (0-indexed)

    Example:
        >>> timestamp_to_frame_number(10.5, 30)
        315
    """
    return int(timestamp * fps)


def frame_number_to_timestamp(frame_number: int, fps: float) -> float:
    """
    Convert frame number to timestamp.

    Args:
        frame_number: Frame number (0-indexed)
        fps: Frames per second

    Returns:
        Timestamp in seconds

    Example:
        >>> frame_number_to_timestamp(315, 30)
        10.5
    """
    return frame_number / fps
