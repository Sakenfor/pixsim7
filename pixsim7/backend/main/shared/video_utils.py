"""
Video utility functions for validation and metadata extraction

Uses ffprobe (part of FFmpeg) to inspect video files.
"""
import subprocess
import json
from typing import Dict, Any, Tuple, Optional
from pathlib import Path

from pixsim7.backend.main.shared.errors import InvalidOperationError


def get_video_metadata(video_path: str) -> Dict[str, Any]:
    """
    Extract comprehensive video metadata using ffprobe.

    Args:
        video_path: Path to video file

    Returns:
        Dictionary with video metadata:
        - width: Video width in pixels
        - height: Video height in pixels
        - duration: Duration in seconds (float)
        - fps: Frames per second (float)
        - codec: Video codec name (e.g., 'h264', 'hevc')
        - bitrate: Bitrate in bits/second
        - format: Container format (e.g., 'mp4', 'mov')
        - size_bytes: File size in bytes

    Raises:
        InvalidOperationError: If ffprobe fails or video is invalid

    Example:
        >>> metadata = get_video_metadata("video.mp4")
        >>> print(f"{metadata['width']}x{metadata['height']} @ {metadata['fps']}fps")
        1920x1080 @ 30.0fps
    """
    if not Path(video_path).exists():
        raise InvalidOperationError(f"Video file not found: {video_path}")

    try:
        # Use ffprobe to get JSON metadata
        cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",  # First video stream
            "-show_entries", "stream=width,height,duration,r_frame_rate,codec_name,bit_rate",
            "-show_entries", "format=format_name,size",
            "-of", "json",
            video_path
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            raise InvalidOperationError(f"ffprobe failed: {result.stderr}")

        data = json.loads(result.stdout)

        # Extract stream info (video track)
        if "streams" not in data or len(data["streams"]) == 0:
            raise InvalidOperationError("No video stream found in file")

        stream = data["streams"][0]
        format_info = data.get("format", {})

        # Parse frame rate (format: "30/1" or "30000/1001")
        fps_str = stream.get("r_frame_rate", "0/1")
        num, denom = map(int, fps_str.split("/"))
        fps = num / denom if denom != 0 else 0.0

        # Get duration (prefer stream duration, fallback to format duration)
        duration = float(stream.get("duration") or format_info.get("duration") or 0)

        return {
            "width": int(stream.get("width", 0)),
            "height": int(stream.get("height", 0)),
            "duration": duration,
            "fps": fps,
            "codec": stream.get("codec_name", "unknown"),
            "bitrate": int(stream.get("bit_rate") or format_info.get("bit_rate") or 0),
            "format": format_info.get("format_name", "unknown"),
            "size_bytes": int(format_info.get("size", 0)),
        }

    except subprocess.TimeoutExpired:
        raise InvalidOperationError("Video metadata extraction timed out (30s)")
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        raise InvalidOperationError(f"Failed to parse video metadata: {e}")
    except Exception as e:
        raise InvalidOperationError(f"Video metadata extraction failed: {e}")


def validate_video_for_provider(
    video_path: str,
    provider_id: str,
    max_duration: Optional[float] = None,
    max_width: Optional[int] = None,
    max_height: Optional[int] = None,
    max_size_mb: Optional[float] = None,
    allowed_codecs: Optional[list[str]] = None,
) -> Tuple[Dict[str, Any], Optional[str]]:
    """
    Validate video meets provider requirements.

    Args:
        video_path: Path to video file
        provider_id: Provider identifier (e.g., 'pixverse')
        max_duration: Maximum duration in seconds
        max_width: Maximum width in pixels
        max_height: Maximum height in pixels
        max_size_mb: Maximum file size in MB
        allowed_codecs: List of allowed codec names

    Returns:
        Tuple of (metadata, error_message)
        - metadata: Video metadata dict
        - error_message: None if valid, error string if invalid

    Example:
        >>> metadata, error = validate_video_for_provider(
        ...     "video.mp4",
        ...     "pixverse",
        ...     max_duration=10.0,
        ...     max_size_mb=100
        ... )
        >>> if error:
        ...     print(f"Invalid: {error}")
    """
    try:
        metadata = get_video_metadata(video_path)
    except InvalidOperationError as e:
        return {}, f"Failed to read video: {str(e)}"

    # Validate duration
    if max_duration and metadata["duration"] > max_duration:
        return metadata, (
            f"Video duration ({metadata['duration']:.1f}s) exceeds "
            f"maximum {max_duration:.1f}s for {provider_id}"
        )

    # Validate dimensions
    if max_width and metadata["width"] > max_width:
        return metadata, (
            f"Video width ({metadata['width']}px) exceeds "
            f"maximum {max_width}px for {provider_id}"
        )

    if max_height and metadata["height"] > max_height:
        return metadata, (
            f"Video height ({metadata['height']}px) exceeds "
            f"maximum {max_height}px for {provider_id}"
        )

    # Validate file size
    if max_size_mb:
        size_mb = metadata["size_bytes"] / (1024 * 1024)
        if size_mb > max_size_mb:
            return metadata, (
                f"Video file size ({size_mb:.1f}MB) exceeds "
                f"maximum {max_size_mb}MB for {provider_id}"
            )

    # Validate codec
    if allowed_codecs and metadata["codec"] not in allowed_codecs:
        return metadata, (
            f"Video codec '{metadata['codec']}' not supported by {provider_id}. "
            f"Allowed: {', '.join(allowed_codecs)}"
        )

    # Check for zero duration (corrupted video)
    if metadata["duration"] <= 0:
        return metadata, "Video appears to be corrupted (duration is 0)"

    # Check for zero dimensions (corrupted video)
    if metadata["width"] <= 0 or metadata["height"] <= 0:
        return metadata, "Video appears to be corrupted (invalid dimensions)"

    # All validations passed
    return metadata, None


# Provider-specific constraints (update these based on actual provider limits)
PROVIDER_VIDEO_CONSTRAINTS = {
    "pixverse": {
        "max_duration": 10.0,  # 10 seconds
        "max_width": 4096,
        "max_height": 4096,
        "max_size_mb": 100,  # 100MB
        "allowed_codecs": ["h264", "hevc", "vp9", "av1"],
    },
    "sora": {
        "max_duration": 60.0,  # 60 seconds (example)
        "max_width": 1920,
        "max_height": 1080,
        "max_size_mb": 200,
        "allowed_codecs": ["h264", "hevc"],
    },
}


def get_provider_video_constraints(provider_id: str) -> Dict[str, Any]:
    """
    Get video upload constraints for a provider.

    Args:
        provider_id: Provider identifier

    Returns:
        Dict with constraint parameters, or empty dict if no constraints defined
    """
    return PROVIDER_VIDEO_CONSTRAINTS.get(provider_id, {})


def extract_duration_safe(file_path: str) -> Optional[float]:
    """
    Safely extract duration from video file.

    Unlike get_video_metadata(), this function returns None instead of raising
    an exception if ffprobe is not available or extraction fails.

    Args:
        file_path: Path to video file

    Returns:
        Duration in seconds, or None if extraction fails
    """
    try:
        metadata = get_video_metadata(file_path)
        return metadata.get("duration")
    except (InvalidOperationError, FileNotFoundError, subprocess.SubprocessError):
        # ffprobe not available or extraction failed
        return None
