"""
Video utility functions for Pixverse
"""


def infer_video_dimensions(quality: str, aspect_ratio: str | None = None) -> tuple[int, int]:
    """
    Infer video dimensions from quality and aspect ratio presets.

    Args:
        quality: Video quality preset ('360p', '720p', '1080p')
        aspect_ratio: Aspect ratio ('16:9', '9:16', '1:1'). Defaults to '16:9'

    Returns:
        Tuple of (width, height) in pixels

    Examples:
        >>> infer_video_dimensions('720p', '16:9')
        (1280, 720)
        >>> infer_video_dimensions('1080p', '9:16')  # Portrait
        (1080, 1920)
        >>> infer_video_dimensions('720p', '1:1')  # Square
        (720, 720)
        >>> infer_video_dimensions('720p')  # Defaults to 16:9
        (1280, 720)
    """
    # Default to 16:9 landscape
    if not aspect_ratio or aspect_ratio == "16:9":
        if quality == "360p":
            return (640, 360)
        elif quality == "720p":
            return (1280, 720)
        elif quality == "1080p":
            return (1920, 1080)
        else:
            return (1280, 720)  # Default to 720p

    elif aspect_ratio == "9:16":  # Portrait
        if quality == "360p":
            return (360, 640)
        elif quality == "720p":
            return (720, 1280)
        elif quality == "1080p":
            return (1080, 1920)
        else:
            return (720, 1280)

    elif aspect_ratio == "1:1":  # Square
        if quality == "360p":
            return (360, 360)
        elif quality == "720p":
            return (720, 720)
        elif quality == "1080p":
            return (1080, 1080)
        else:
            return (720, 720)

    # Fallback to 16:9 720p
    return (1280, 720)


def get_quality_from_dimensions(width: int, height: int) -> str:
    """
    Infer quality preset from video dimensions.

    Args:
        width: Video width in pixels
        height: Video height in pixels

    Returns:
        Quality preset string ('360p', '720p', '1080p')

    Examples:
        >>> get_quality_from_dimensions(1920, 1080)
        '1080p'
        >>> get_quality_from_dimensions(1280, 720)
        '720p'
        >>> get_quality_from_dimensions(720, 1280)  # Portrait
        '720p'
    """
    # Use the smaller dimension for quality determination
    min_dim = min(width, height)

    if min_dim >= 1080:
        return "1080p"
    elif min_dim >= 720:
        return "720p"
    else:
        return "360p"


def get_aspect_ratio(width: int, height: int) -> str:
    """
    Determine aspect ratio from dimensions.

    Args:
        width: Video width in pixels
        height: Video height in pixels

    Returns:
        Aspect ratio string ('16:9', '9:16', '1:1', or 'custom')

    Examples:
        >>> get_aspect_ratio(1920, 1080)
        '16:9'
        >>> get_aspect_ratio(1080, 1920)
        '9:16'
        >>> get_aspect_ratio(720, 720)
        '1:1'
    """
    ratio = width / height

    # Check for square (with tolerance)
    if abs(ratio - 1.0) < 0.01:
        return "1:1"

    # Check for 16:9 landscape
    if abs(ratio - (16/9)) < 0.01:
        return "16:9"

    # Check for 9:16 portrait
    if abs(ratio - (9/16)) < 0.01:
        return "9:16"

    return "custom"
