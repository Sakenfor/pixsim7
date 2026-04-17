"""
Pixverse SDK Data Models
Pydantic models for type-safe data structures
"""

from dataclasses import dataclass, field, fields as dataclass_fields
from datetime import datetime
from typing import Optional, Dict, Any, Literal, List, Union, Tuple
from pydantic import BaseModel, Field, HttpUrl, field_validator


# =============================================================================
# Model Specifications
# =============================================================================

@dataclass(frozen=True)
class VideoModelSpec:
    """
    Specification for a video generation model.

    Example:
        >>> VideoModel.V5_FAST.camera_movement
        False
        >>> VideoModel.V5_5.audio
        True
    """
    id: str
    camera_movement: bool = True
    audio: bool = False
    multi_shot: bool = False
    video_extend: bool = False
    fusion: bool = False
    max_duration: int = 10  # max video length in seconds
    pricing_tier: str = "v5"  # "v5" (default) — extensible for future tiers
    badge: str = ""  # short display label for UI badges (e.g. "5", "5F", "C1")

    @property
    def capabilities(self) -> Dict[str, bool]:
        """Return all bool fields as a capabilities dict."""
        return {
            f.name: getattr(self, f.name)
            for f in dataclass_fields(self)
            if isinstance(getattr(self, f.name), bool)
        }

    def __str__(self) -> str:
        return self.id

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, str):
            return self.id == other
        if isinstance(other, VideoModelSpec):
            return self.id == other.id
        return False

    def __hash__(self) -> int:
        return hash(self.id)

    def validate_params(self, **options: Any) -> Dict[str, Any]:
        """Validate params against this model's capabilities.

        Strips keys that correspond to unsupported capabilities
        (e.g. camera_movement for v5-fast, audio for v5).
        Clamps duration to this model's max_duration.

        Returns a new dict with only supported keys.
        """
        caps = self.capabilities
        result = {
            k: v for k, v in options.items()
            if k not in caps or caps[k]
        }
        if "duration" in result and isinstance(result["duration"], (int, float)):
            result["duration"] = min(int(result["duration"]), self.max_duration)
        return result


class VideoModel:
    """
    Available video generation models.

    Usage:
        # Access model directly
        VideoModel.V5_FAST.camera_movement  # False

        # Iterate all models
        for model in VideoModel.ALL:
            print(f"{model.id}: audio={model.audio}")

        # Get by string ID
        spec = VideoModel.get("v5-fast")
    """
    # Standard models
    V5 = VideoModelSpec("v5", video_extend=True, fusion=True, badge="5")

    # Lite/fast models (reduced capabilities for speed)
    V5_FAST = VideoModelSpec("v5-fast", camera_movement=False, badge="5F")

    # Advanced models (multi_shot, audio)
    V5_5 = VideoModelSpec("v5.5", camera_movement=False, audio=True, multi_shot=True, video_extend=True, badge="5.5")
    V5_6 = VideoModelSpec("v5.6", camera_movement=False, audio=True, fusion=True, badge="5.6")
    V6 = VideoModelSpec("v6", camera_movement=False, audio=True, multi_shot=True, max_duration=15, badge="6")
    C1 = VideoModelSpec("pixverse-c1", camera_movement=False, audio=True, fusion=True, max_duration=15, badge="C1")

    # All models (order matters for UI)
    ALL: List[VideoModelSpec] = [V5, V5_FAST, V5_5, V5_6, V6, C1]
    DEFAULT: VideoModelSpec = V5

    @classmethod
    def get(cls, model_id: str) -> Optional[VideoModelSpec]:
        """Get model spec by ID string."""
        for spec in cls.ALL:
            if spec.id == model_id:
                return spec
        return None

    @classmethod
    def ids(cls) -> List[str]:
        """Get list of all model ID strings."""
        return [m.id for m in cls.ALL]

    @classmethod
    def supporting(cls, capability: str) -> List[VideoModelSpec]:
        """Get models that support a capability (e.g., 'audio', 'multi_shot')."""
        return [m for m in cls.ALL if getattr(m, capability, False)]


# Common aspect ratio presets
ASPECT_RATIOS_ALL = ("auto", "21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16")
ASPECT_RATIOS_LEGACY = ("21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16")


@dataclass(frozen=True)
class ImageModelSpec:
    """
    Specification for an image generation model.

    Example:
        >>> ImageModel.SEEDREAM_4_5.qualities
        ('1440p', '2160p')
        >>> ImageModel.NANO_BANANA_PRO.max_images
        9
    """
    id: str
    qualities: tuple[str, ...] = ("1080p",)
    max_images: int = 3
    aspect_ratios: tuple[str, ...] = ASPECT_RATIOS_ALL
    pricing: tuple[tuple[str, int], ...] = ()  # (normalized_quality, credits) pairs

    def cost(self, quality: str) -> int | None:
        """Look up credit cost for a quality level."""
        q = quality.lower()
        for pq, credits in self.pricing:
            if pq == q:
                return credits
        return None

    def __str__(self) -> str:
        return self.id

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, str):
            return self.id == other
        if isinstance(other, ImageModelSpec):
            return self.id == other.id
        return False

    def __hash__(self) -> int:
        return hash(self.id)

    def validate_params(
        self,
        aspect_ratio: str | None = None,
        quality: str | None = None,
        image_count: int | None = None,
    ) -> dict[str, Any]:
        """Validate and sanitize params against this model's constraints.

        Returns dict of corrected values (only keys that were corrected).
        Raises ValueError for hard errors (e.g. too many images).
        """
        corrected: dict[str, Any] = {}

        if aspect_ratio and aspect_ratio not in self.aspect_ratios:
            corrected["aspect_ratio"] = "16:9" if "16:9" in self.aspect_ratios else self.aspect_ratios[0]

        if quality and quality.lower() not in (q.lower() for q in self.qualities):
            corrected["quality"] = self.qualities[0]

        if image_count is not None and image_count > self.max_images:
            raise ValueError(f"Model '{self.id}' supports max {self.max_images} images, got {image_count}")

        return corrected


class ImageModel:
    """
    Available image generation models.

    Usage:
        # Access model directly
        ImageModel.NANO_BANANA_PRO.max_images  # 9

        # Iterate all models
        for model in ImageModel.ALL:
            print(f"{model.id}: {model.qualities}")

        # Get by string ID
        spec = ImageModel.get("seedream-4.5")
    """
    NANO_BANANA_PRO = ImageModelSpec("gemini-3.0", qualities=("1080p", "1440p", "2160p"), max_images=9,
                                      pricing=(("1080p", 50), ("2k", 50), ("4k", 90)))
    NANO_BANANA = ImageModelSpec("gemini-2.5-flash", qualities=("1080p",), max_images=3,
                                 pricing=(("1080p", 15),))
    GEMINI_3_1_FLASH = ImageModelSpec("gemini-3.1-flash", qualities=("512p", "1080p", "1440p", "2160p"), max_images=3,
                                       pricing=(("512p", 16), ("1080p", 25), ("2k", 40), ("4k", 60)))
    SEEDREAM_4 = ImageModelSpec("seedream-4.0", qualities=("1080p", "1440p", "2160p"), max_images=6,
                                 pricing=(("1080p", 10), ("2k", 10), ("4k", 10)))
    SEEDREAM_4_5 = ImageModelSpec("seedream-4.5", qualities=("1440p", "2160p"), max_images=6,
                                   pricing=(("2k", 10), ("4k", 10)))
    SEEDREAM_5_LITE = ImageModelSpec("seedream-5.0-lite", qualities=("1440p", "2160p"), max_images=6,
                                      pricing=(("2k", 15), ("4k", 15)))
    QWEN_IMAGE = ImageModelSpec("qwen-image", qualities=("720p", "1080p"), aspect_ratios=ASPECT_RATIOS_LEGACY,
                                 pricing=(("720p", 5), ("1080p", 10)))

    # All models (order matters for UI)
    ALL: List[ImageModelSpec] = [NANO_BANANA_PRO, NANO_BANANA, GEMINI_3_1_FLASH, SEEDREAM_4, SEEDREAM_4_5, SEEDREAM_5_LITE, QWEN_IMAGE]
    DEFAULT: ImageModelSpec = NANO_BANANA_PRO

    @classmethod
    def get(cls, model_id: str) -> Optional[ImageModelSpec]:
        """Get model spec by ID string."""
        for spec in cls.ALL:
            if spec.id == model_id:
                return spec
        return None

    @classmethod
    def ids(cls) -> List[str]:
        """Get list of all model ID strings."""
        return [m.id for m in cls.ALL]


def is_pixverse_model(model: str) -> bool:
    """Check if a model name is any Pixverse model (video or image)."""
    return VideoModel.get(model) is not None or ImageModel.get(model) is not None


class CameraMovement:
    """
    Available camera movements for image-to-video generation.

    Camera movements are only applicable when generating video from an image input.
    Names use snake_case format matching Pixverse API expectations.
    """
    HORIZONTAL_LEFT = "horizontal_left"
    HORIZONTAL_RIGHT = "horizontal_right"
    VERTICAL_UP = "vertical_up"
    VERTICAL_DOWN = "vertical_down"
    CRANE_UP = "crane_up"
    DOLLY_ZOOM = "dolly_zoom"
    ZOOM_IN = "zoom_in"
    ZOOM_OUT = "zoom_out"
    QUICKLY_PUSH_IN = "quickly_push_in"
    QUICKLY_PUSH_OUT = "quickly_push_out"
    SMOOTH_PUSH_IN = "smooth_push_in"
    SUPER_PULL_OUT = "super_pull_out"
    LEFT_TRACKING_SHOT = "left_tracking_shot"
    RIGHT_TRACKING_SHOT = "right_tracking_shot"
    LEFT_ARC_SHOT = "left_arc_shot"
    RIGHT_ARC_SHOT = "right_arc_shot"
    FIXED_SHOT = "fixed_shot"
    DUTCH_ANGLE = "dutch_angle"
    ROBO_ARM = "robo_arm"
    WHIP_PAN = "whip_pan"

    ALL = [
        HORIZONTAL_LEFT, HORIZONTAL_RIGHT,
        VERTICAL_UP, VERTICAL_DOWN,
        CRANE_UP, DOLLY_ZOOM,
        ZOOM_IN, ZOOM_OUT,
        QUICKLY_PUSH_IN, QUICKLY_PUSH_OUT,
        SMOOTH_PUSH_IN, SUPER_PULL_OUT,
        LEFT_TRACKING_SHOT, RIGHT_TRACKING_SHOT,
        LEFT_ARC_SHOT, RIGHT_ARC_SHOT,
        FIXED_SHOT, DUTCH_ANGLE,
        ROBO_ARM, WHIP_PAN,
    ]


# =============================================================================
# Operation / API mode scope (drives get_video_operation_fields())
# =============================================================================
#
# Each field on BaseVideoOptions / GenerationOptions / TransitionOptions
# declares its applicable ops + api_modes via ``json_schema_extra``.
# ``get_video_operation_fields(operation, api_mode)`` scans this metadata
# to return the applicable field list — no hand-maintained mapping dict.

_ALL_VIDEO_OPS = ("text_to_video", "image_to_video", "video_extend", "fusion", "transition")
_GEN_VIDEO_OPS = ("text_to_video", "image_to_video", "video_extend", "fusion")
_TEXT_IMAGE_OPS = ("text_to_video", "image_to_video")
_BOTH_MODES = ("webapi", "openapi")


class BaseVideoOptions(BaseModel):
    """Shared fields for all video generation option classes."""

    model: str = Field(
        default="v5",
        description="Model version (v5, v5-fast, v5.5, v5.6, v6, c1)",
        json_schema_extra={"ops": _ALL_VIDEO_OPS, "api_modes": _BOTH_MODES},
    )
    quality: str = Field(
        default="360p",
        description="Video quality (360p, 540p, 720p, 1080p)",
        json_schema_extra={"ops": _ALL_VIDEO_OPS, "api_modes": _BOTH_MODES},
    )
    seed: Optional[int] = Field(
        default=None,
        description="Random seed for reproducibility",
        json_schema_extra={"ops": _ALL_VIDEO_OPS, "api_modes": _BOTH_MODES},
    )
    audio: Optional[int] = Field(
        default=None,
        description="Native audio generation (v5.5+). Set to 1 to enable",
        json_schema_extra={"ops": _ALL_VIDEO_OPS, "api_modes": _BOTH_MODES},
    )

    class Config:
        extra = "allow"


class GenerationOptions(BaseVideoOptions):
    """Options for video generation.

    Per-field ``json_schema_extra`` declares which ops + api_modes each field
    applies to.  ``get_video_operation_fields()`` consumes this metadata —
    there's no hand-maintained applicability table.
    """

    duration: int = Field(
        default=5, ge=1, le=15,
        description="Video duration in seconds (1-10, up to 15 for v6)",
        json_schema_extra={"ops": _GEN_VIDEO_OPS, "api_modes": _BOTH_MODES},
    )
    aspect_ratio: Optional[str] = Field(
        default=None,
        description="Aspect ratio (16:9, 9:16, 1:1)",
        # i2v omits — follows source image.
        json_schema_extra={"ops": ("text_to_video",), "api_modes": _BOTH_MODES},
    )
    negative_prompt: Optional[str] = Field(
        default=None,
        description="Negative prompt for OpenAPI",
        json_schema_extra={"ops": _TEXT_IMAGE_OPS, "api_modes": _BOTH_MODES},
    )
    camera_movement: Optional[str] = Field(
        default=None,
        description="Camera movement - i2v only (zoom_in, zoom_out, pan_left, pan_right, etc)",
        json_schema_extra={"ops": ("image_to_video",), "api_modes": _BOTH_MODES},
    )
    style: Optional[str] = Field(
        default=None,
        description="Style preset",
        json_schema_extra={"ops": _TEXT_IMAGE_OPS, "api_modes": _BOTH_MODES},
    )
    template_id: Optional[int] = Field(
        default=None,
        description="Template ID to use",
        json_schema_extra={"ops": _TEXT_IMAGE_OPS, "api_modes": _BOTH_MODES},
    )
    multi_shot: Optional[int] = Field(
        default=None,
        description=(
            "Multi-shot video generation (v5.5+). "
            "Set to 1 to enable. Best with clips >5 seconds"
        ),
        json_schema_extra={"ops": _TEXT_IMAGE_OPS, "api_modes": _BOTH_MODES},
    )
    off_peak: Optional[bool] = Field(
        default=None,
        description=(
            "Queue for off-peak processing (subscription accounts). "
            "Reduces credit cost"
        ),
        json_schema_extra={"ops": ("text_to_video", "image_to_video", "fusion"), "api_modes": _BOTH_MODES},
    )
    credit_change: Optional[int] = Field(
        default=None,
        description="Expected credit cost for Web API requests",
        json_schema_extra={"ops": ("video_extend",), "api_modes": ("webapi",)},
    )
    motion_mode: Optional[str] = Field(
        default=None,
        description=(
            "Motion mode: 'normal' or 'fast'. "
            "'fast' only when duration=5 and quality!=1080p. "
            "Not supported on v5."
        ),
        json_schema_extra={"ops": _TEXT_IMAGE_OPS, "api_modes": ("openapi",)},
    )
    api_gen_img_ids: Optional[List[int]] = Field(
        default=None,
        description=(
            "Multiple image IDs for multi-image templates (i2v). "
            "Mutually exclusive with single img_id on the img/generate endpoint. "
            "Note: Pixverse docs list this as 'img_ids', but the server-side "
            "error messages reveal the real field name is 'api_gen_img_ids'."
        ),
        json_schema_extra={"ops": ("image_to_video",), "api_modes": ("openapi",)},
    )
    sound_effect_switch: Optional[bool] = Field(
        default=None,
        description="Enable auto sound effects (v3.5/v4/v4.5/v5).",
        json_schema_extra={"ops": _TEXT_IMAGE_OPS, "api_modes": ("openapi",)},
    )
    sound_effect_content: Optional[str] = Field(
        default=None,
        description=(
            "Explicit sound effect content; falls back to auto when omitted "
            "(v3.5/v4/v4.5/v5)."
        ),
        json_schema_extra={"ops": _TEXT_IMAGE_OPS, "api_modes": ("openapi",)},
    )
    lip_sync_switch: Optional[bool] = Field(
        default=None,
        description="Enable lip sync TTS (v3.5/v4/v4.5/v5).",
        json_schema_extra={"ops": _TEXT_IMAGE_OPS, "api_modes": ("openapi",)},
    )
    lip_sync_tts_content: Optional[str] = Field(
        default=None,
        description=(
            "TTS content, ~140 UTF-8 chars; truncated if audio exceeds video "
            "duration (v3.5/v4/v4.5/v5)."
        ),
        json_schema_extra={"ops": _TEXT_IMAGE_OPS, "api_modes": ("openapi",)},
    )
    lip_sync_tts_speaker_id: Optional[str] = Field(
        default=None,
        description="TTS speaker id from /tts/list (v3.5/v4/v4.5/v5).",
        json_schema_extra={"ops": _TEXT_IMAGE_OPS, "api_modes": ("openapi",)},
    )
    generate_audio_switch: Optional[bool] = Field(
        default=None,
        description="Audio switch for v5.5/v5.6/v6/c1.",
        json_schema_extra={"ops": _TEXT_IMAGE_OPS, "api_modes": ("openapi",)},
    )
    generate_multi_clip_switch: Optional[bool] = Field(
        default=None,
        description="Single- vs multi-clip switch for v5.5/v6.",
        json_schema_extra={"ops": _TEXT_IMAGE_OPS, "api_modes": ("openapi",)},
    )
    thinking_type: Optional[str] = Field(
        default=None,
        description=(
            "Prompt reasoning enhancement: 'enabled', 'disabled', or 'auto' "
            "(v5.5/v5.6/v6)."
        ),
        json_schema_extra={"ops": _TEXT_IMAGE_OPS, "api_modes": ("openapi",)},
    )


# =============================================================================
# UI Metadata Helpers
# =============================================================================

# Per-op → options class.  Transition uses TransitionOptions (``durations``
# instead of ``duration``).  All other video ops use GenerationOptions.
# Defined lazily after TransitionOptions is declared below via _op_to_class().


def _op_to_class(operation: str):
    """Return the options class that owns fields for a given operation."""
    if operation == "transition":
        return TransitionOptions
    return GenerationOptions


def _known_ops() -> frozenset[str]:
    """Union of all operation names declared in field metadata."""
    ops: set[str] = set()
    for cls in (GenerationOptions, TransitionOptions):
        for info in cls.model_fields.values():
            extra = info.json_schema_extra
            if isinstance(extra, dict):
                scope = extra.get("ops")
                if scope:
                    ops.update(scope)
    return frozenset(ops)


def get_video_operation_fields(
    operation: str,
    api_mode: Optional[str] = None,
) -> List[str]:
    """Return the field names applicable to a given video operation.

    Each field on ``GenerationOptions`` / ``TransitionOptions`` declares
    its scope inline via ``json_schema_extra = {"ops": (...), "api_modes": (...)}``.
    This function walks ``model_fields`` and returns the fields whose
    declared scope includes the requested operation (and ``api_mode``, if
    specified — "webapi" or "openapi").

    A field with no ``ops`` metadata is treated as applicable to every op;
    likewise missing ``api_modes`` means both modes.  Unknown operation
    names fall through to the full field set of the relevant options class
    (defensive for new ops not yet annotated).
    """
    cls = _op_to_class(operation)
    if operation not in _known_ops():
        # Unknown op — preserve legacy defensive behavior: return all fields.
        return list(cls.model_fields.keys())

    result: List[str] = []
    for name, info in cls.model_fields.items():
        extra = info.json_schema_extra
        scope_ops = extra.get("ops") if isinstance(extra, dict) else None
        if scope_ops is not None and operation not in scope_ops:
            continue
        if api_mode is not None:
            scope_modes = extra.get("api_modes") if isinstance(extra, dict) else None
            if scope_modes is not None and api_mode not in scope_modes:
                continue
        result.append(name)
    return result


def get_model_capabilities(model: str) -> Dict[str, bool]:
    """
    Return capability flags for a specific video model.

    Example:
        >>> get_model_capabilities("v5.5")["multi_shot"]
        True
        >>> get_model_capabilities("v5-fast")["camera_movement"]
        False
    """
    spec = VideoModel.get(model)
    return spec.capabilities if spec else VideoModelSpec("_unknown").capabilities


def filter_options_for_model(model: str, options: Dict[str, Any]) -> Dict[str, Any]:
    """
    Filter generation options to remove params unsupported by the model.

    Example:
        >>> filter_options_for_model("v5-fast", {"camera_movement": "zoom_in", "audio": 1})
        {}
    """
    spec = VideoModel.get(model)
    if spec:
        return spec.validate_params(**options)
    return dict(options)


def validate_operation_params(operation: str, params: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate that parameters are appropriate for the given operation.

    This helper is primarily intended for UI/adapters that want to perform
    a quick sanity check before sending requests (e.g., avoid sending
    aspect_ratio to image_to_video, or unknown keys entirely).

    Args:
        operation: Video operation name (e.g., "text_to_video").
        params: Parameter dictionary to validate.

    Returns:
        Tuple of (is_valid, error_message). If valid, error_message is None.

    Example:
        >>> valid, error = validate_operation_params("image_to_video", {"aspect_ratio": "16:9"})
        >>> valid
        False
        >>> "aspect_ratio" in (error or "")
        True
    """
    try:
        valid_fields = set(get_video_operation_fields(operation))
    except Exception as exc:  # pragma: no cover - defensive
        return False, str(exc)

    # Allow common non-GenerationOptions keys that callers may send.
    allowed_extra = {"prompt", "image_url", "video_url", "original_video_id"}

    invalid = [
        key for key in params.keys()
        if key not in valid_fields and key not in allowed_extra
    ]

    if invalid:
        return False, f"Invalid fields for {operation}: {', '.join(sorted(invalid))}"

    return True, None


class TransitionOptions(BaseVideoOptions):
    """
    Options for transition videos

    Transitions require N-1 durations for N images.
    Each duration should be 1-5 seconds.
    """

    durations: Union[int, List[int]] = Field(
        default=5,
        description="Duration(s) per transition segment (1-10 seconds each). Single int or list for each segment",
        json_schema_extra={"ops": ("transition",), "api_modes": _BOTH_MODES},
    )

    @field_validator('durations')
    @classmethod
    def validate_durations(cls, v):
        """Validate that durations are between 1 and 10 seconds"""
        if isinstance(v, int):
            if not 1 <= v <= 10:
                raise ValueError(f"Duration must be between 1 and 10 seconds, got {v}")
            return v
        elif isinstance(v, list):
            for d in v:
                if not isinstance(d, int) or not 1 <= d <= 10:
                    raise ValueError(f"Each duration must be between 1 and 10 seconds, got {d}")
            return v
        else:
            raise ValueError(f"Durations must be int or list[int], got {type(v)}")


class Video(BaseModel):
    """Represents a generated video"""

    id: str = Field(description="Video ID")
    url: Optional[str] = Field(default=None, description="Video URL")
    status: str = Field(default="pending", description="Video status (pending, processing, completed, failed)")
    prompt: Optional[str] = Field(default=None, description="Generation prompt")
    thumbnail: Optional[str] = Field(default=None, description="Thumbnail URL")
    duration: Optional[float] = Field(default=None, description="Video duration in seconds")
    model: Optional[str] = Field(default=None, description="Model used for generation")
    created_at: Optional[datetime] = Field(default=None, description="Creation timestamp")
    completed_at: Optional[datetime] = Field(default=None, description="Completion timestamp")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    def __repr__(self) -> str:
        return f"Video(id={self.id}, status={self.status}, url={self.url})"

    @property
    def is_ready(self) -> bool:
        """Check if video is ready (completed)"""
        return self.status == "completed"

    @property
    def is_failed(self) -> bool:
        """Check if video generation failed"""
        return self.status == "failed"

    @property
    def is_processing(self) -> bool:
        """Check if video is still processing"""
        return self.status in ["pending", "processing"]


class Image(BaseModel):
    """Represents a generated image"""

    id: str = Field(description="Image ID")
    url: Optional[str] = Field(default=None, description="Image URL")
    status: str = Field(default="pending", description="Image status (pending, processing, completed, failed, filtered)")
    prompt: Optional[str] = Field(default=None, description="Generation prompt")
    model: Optional[str] = Field(default=None, description="Model used for generation (e.g., qwen-image)")
    quality: Optional[str] = Field(default=None, description="Image quality (720p, 1080p)")
    aspect_ratio: Optional[str] = Field(default=None, description="Aspect ratio (9:16, 16:9, 1:1)")
    width: Optional[int] = Field(default=None, description="Image width in pixels")
    height: Optional[int] = Field(default=None, description="Image height in pixels")
    seed: Optional[int] = Field(default=None, description="Random seed used")
    created_at: Optional[datetime] = Field(default=None, description="Creation timestamp")
    completed_at: Optional[datetime] = Field(default=None, description="Completion timestamp")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    def __repr__(self) -> str:
        return f"Image(id={self.id}, status={self.status}, url={self.url})"

    @property
    def is_ready(self) -> bool:
        """Check if image is ready (completed)"""
        return self.status == "completed"

    @property
    def is_failed(self) -> bool:
        """Check if image generation failed"""
        return self.status in ["failed", "filtered"]

    @property
    def is_processing(self) -> bool:
        """Check if image is still processing"""
        return self.status in ["pending", "processing"]


class Account(BaseModel):
    """Represents a Pixverse account"""

    email: str = Field(description="Account email")
    password: Optional[str] = Field(default=None, description="Account password (not stored after auth)")
    session: Optional[Dict[str, Any]] = Field(default=None, description="Session data (cookies, tokens)")

    # Usage tracking
    usage_count: int = Field(default=0, description="Number of times this account was used")
    failed_count: int = Field(default=0, description="Number of failed requests")
    last_used: Optional[datetime] = Field(default=None, description="Last usage timestamp")
    last_failed: Optional[datetime] = Field(default=None, description="Last failure timestamp")

    # Status
    is_active: bool = Field(default=True, description="Whether account is active")
    is_rate_limited: bool = Field(default=False, description="Whether account is rate limited")

    class Config:
        extra = "allow"

    def __repr__(self) -> str:
        return f"Account(email={self.email}, usage={self.usage_count}, active={self.is_active})"
