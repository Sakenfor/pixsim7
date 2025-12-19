"""
Domain-specific asset metadata tables

These tables store specialized metadata for different content domains:
- Asset3DMetadata: 3D model properties (polygon count, textures, etc.)
- AssetAudioMetadata: Audio properties (sample rate, channels, etc.)
- AssetTemporalSegment: Video keyframes/scenes for temporal understanding
- AssetAdultMetadata: Adult content metadata for precise matching

Each table links to Asset via foreign key and provides domain-specific queryable fields.
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Column, Index
from sqlalchemy import JSON
from pgvector.sqlalchemy import Vector


class Asset3DMetadata(SQLModel, table=True):
    """3D model specific metadata"""
    __tablename__ = "asset_3d_metadata"

    asset_id: int = Field(foreign_key="assets.id", primary_key=True)

    # Geometry
    polygon_count: Optional[int] = Field(
        default=None,
        description="Number of polygons/faces"
    )
    vertex_count: Optional[int] = Field(
        default=None,
        description="Number of vertices"
    )

    # Format
    file_format: str = Field(
        max_length=16,
        description="glb, fbx, obj, usdz, stl, blend"
    )

    # Features
    has_textures: bool = Field(
        default=False,
        description="Has texture maps"
    )
    has_animations: bool = Field(
        default=False,
        description="Has animation data"
    )
    has_rigging: bool = Field(
        default=False,
        description="Has skeletal rigging"
    )
    has_materials: bool = Field(
        default=False,
        description="Has material definitions"
    )

    # Texture info
    material_count: Optional[int] = Field(
        default=None,
        description="Number of materials"
    )
    texture_resolution: Optional[str] = Field(
        default=None,
        max_length=16,
        description="4K, 2K, 1K, etc."
    )

    # Bounds (for preview/scaling) - stored as JSON
    bounding_box_size: Optional[Dict[str, float]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Bounding box dimensions: {x, y, z}"
    )

    # Additional metadata (overflow for provider-specific stuff)
    extra: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Additional provider-specific metadata"
    )

    __table_args__ = (
        Index("idx_3d_polygon_count", "polygon_count"),
        Index("idx_3d_format", "file_format"),
    )


class AssetAudioMetadata(SQLModel, table=True):
    """Audio specific metadata"""
    __tablename__ = "asset_audio_metadata"

    asset_id: int = Field(foreign_key="assets.id", primary_key=True)

    # Core audio properties
    sample_rate: int = Field(
        description="Sample rate in Hz (e.g., 44100, 48000)"
    )
    channels: int = Field(
        description="Number of channels: 1=mono, 2=stereo, 6=5.1"
    )
    bitrate: Optional[int] = Field(
        default=None,
        description="Bitrate in kbps"
    )

    # Format
    codec: str = Field(
        max_length=16,
        description="Audio codec: mp3, aac, flac, wav, ogg, opus"
    )

    # Music metadata
    bpm: Optional[float] = Field(
        default=None,
        description="Beats per minute (tempo)"
    )
    key: Optional[str] = Field(
        default=None,
        max_length=16,
        description="Musical key: C major, A minor, etc."
    )
    has_lyrics: bool = Field(
        default=False,
        description="Contains vocals/lyrics"
    )

    # Speech metadata (for AI voice generation)
    is_speech: bool = Field(
        default=False,
        description="Contains human speech"
    )
    language: Optional[str] = Field(
        default=None,
        max_length=8,
        description="Language code: en, es, ja, etc."
    )
    voice_id: Optional[str] = Field(
        default=None,
        max_length=128,
        description="Voice ID for AI TTS (e.g., ElevenLabs voice ID)"
    )

    # Additional metadata
    extra: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Additional provider-specific metadata"
    )

    __table_args__ = (
        Index("idx_audio_sample_rate", "sample_rate"),
        Index("idx_audio_codec", "codec"),
        Index("idx_audio_speech", "is_speech"),
    )


class AssetTemporalSegment(SQLModel, table=True):
    """
    Keyframes/scenes within a video for temporal understanding

    Use cases:
    - Find where specific action happens
    - Match end of video A with start of video B
    - Generate previews at key moments
    """
    __tablename__ = "asset_temporal_segments"

    id: Optional[int] = Field(default=None, primary_key=True)
    asset_id: int = Field(foreign_key="assets.id", index=True)

    # Temporal location
    segment_type: str = Field(
        max_length=32,
        description="start, middle, end, keyframe, scene_change"
    )
    timestamp_sec: float = Field(
        description="Position in video (seconds)"
    )
    frame_number: Optional[int] = Field(
        default=None,
        description="Frame number in video"
    )

    # Visual data
    thumbnail_url: Optional[str] = Field(
        default=None,
        description="Frame snapshot URL"
    )

    # Semantic understanding
    description: Optional[str] = Field(
        default=None,
        description="What's happening at this moment"
    )

    # Objects/entities present
    objects: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Objects detected: ['cat', 'ball', 'couch']"
    )

    # Actions happening
    actions: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Actions detected: ['jumping', 'spinning']"
    )

    # Visual embedding for this frame
    embedding: Optional[List[float]] = Field(
        default=None,
        sa_column=Column(Vector(768)),
        description="Frame embedding for similarity (CLIP)"
    )

    # Scene characteristics
    brightness: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Frame brightness (0.0-1.0)"
    )
    dominant_colors: Optional[List[str]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Dominant color hex codes: ['#FF5733', '#33FF57']"
    )

    # Camera motion (for video)
    camera_motion: Optional[str] = Field(
        default=None,
        max_length=32,
        description="static, pan, zoom, tracking"
    )

    __table_args__ = (
        Index("idx_segment_asset_time", "asset_id", "timestamp_sec"),
        Index("idx_segment_type", "asset_id", "segment_type"),
    )


class AssetAdultMetadata(SQLModel, table=True):
    """Adult content metadata for precise matching"""
    __tablename__ = "asset_adult_metadata"

    asset_id: int = Field(foreign_key="assets.id", primary_key=True)

    # Intensity/pacing (for similarity matching)
    intensity_level: Optional[str] = Field(
        default=None,
        max_length=16,
        description="warmup, moderate, heated, intense"
    )
    tempo: Optional[str] = Field(
        default=None,
        max_length=16,
        description="slow, medium, fast, varied"
    )

    # Scene characteristics
    scene_type: Optional[str] = Field(
        default=None,
        max_length=16,
        description="solo, couple, group"
    )
    intimacy_level: Optional[int] = Field(
        default=None,
        ge=1,
        le=10,
        description="Intimacy level (1-10)"
    )

    # Visual composition
    body_parts_visible: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Visible body parts: ['hands', 'face', 'torso', 'legs']"
    )

    # Clothing state
    clothing_state: Optional[str] = Field(
        default=None,
        max_length=16,
        description="clothed, partial, minimal, none"
    )

    # Positions/actions
    positions: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Positions/poses in scene"
    )

    # Mood/aesthetic
    mood: Optional[str] = Field(
        default=None,
        max_length=32,
        description="romantic, playful, passionate, etc."
    )
    lighting: Optional[str] = Field(
        default=None,
        max_length=32,
        description="soft, dramatic, natural, etc."
    )

    # Overflow for other attributes
    extra: Optional[Dict[str, Any]] = Field(
        default=None,
        sa_column=Column(JSON),
        description="Additional domain-specific metadata"
    )

    __table_args__ = (
        Index("idx_adult_intensity_tempo", "intensity_level", "tempo"),
        Index("idx_adult_intimacy", "intimacy_level"),
        Index("idx_adult_scene_type", "scene_type"),
    )
