"""Tests for the asset:embedding input-selection config schema (plan
``embedding-input-selection-media-aware`` c2).

Covers: the shared defaults + resolver, the registry wiring (config defaults +
instance_options descriptors), and confirmation that the config participates in
``effective_config_hash`` so a strategy change re-embeds cleanly.
"""
from pixsim7.backend.main.services.analysis.analysis_service import AnalysisService
from pixsim7.backend.main.services.media.embedding_input_config import (
    EMBEDDING_INPUT_CONFIG_DEFAULTS,
    IMAGE_SOURCES,
    VIDEO_FRAME_AGGREGATIONS,
    VIDEO_FRAME_STRATEGIES,
    resolve_embedding_input_config,
)
from pixsim7.backend.main.services.prompt.parser.registry import (
    AnalyzerRegistry,
    get_effective_instance_options,
)

EXPECTED_KEYS = {
    "image_source",
    "video_frame_strategy",
    "video_frame_timestamp",
    "video_frame_fraction",
    "video_frame_count",
    "video_embed_resolution",
    "video_frame_aggregation",
}


# ── defaults + resolver ──────────────────────────────────────────────────────

def test_defaults_have_expected_keys_and_video_multiframe_default():
    assert set(EMBEDDING_INPUT_CONFIG_DEFAULTS) == EXPECTED_KEYS
    # User decision 2026-06-19: default video path = multi-frame averaged.
    assert EMBEDDING_INPUT_CONFIG_DEFAULTS["image_source"] == "original"
    assert EMBEDDING_INPUT_CONFIG_DEFAULTS["video_frame_strategy"] == "multi"
    assert EMBEDDING_INPUT_CONFIG_DEFAULTS["video_frame_count"] == 3
    assert EMBEDDING_INPUT_CONFIG_DEFAULTS["video_embed_resolution"] == 384


def test_resolver_returns_copy_of_defaults_when_no_layers():
    resolved = resolve_embedding_input_config()
    assert resolved == EMBEDDING_INPUT_CONFIG_DEFAULTS
    assert resolved is not EMBEDDING_INPUT_CONFIG_DEFAULTS  # defensive copy


def test_resolver_later_layers_win():
    # analyzer_config <- instance_config <- analysis_params (params win)
    resolved = resolve_embedding_input_config(
        {"video_frame_count": 5},          # analyzer/instance layer
        {"video_frame_count": 8},          # params layer
    )
    assert resolved["video_frame_count"] == 8


def test_resolver_ignores_none_and_unknown_keys():
    resolved = resolve_embedding_input_config(
        {"image_source": None, "bogus": "x"},
    )
    assert resolved["image_source"] == "original"  # None did not clobber default
    assert "bogus" not in resolved


# ── registry wiring ──────────────────────────────────────────────────────────

def test_registry_seeds_embedding_config_defaults():
    emb = AnalyzerRegistry().get("asset:embedding")
    assert emb.config == EMBEDDING_INPUT_CONFIG_DEFAULTS


def test_registry_surfaces_tunable_instance_options():
    emb = AnalyzerRegistry().get("asset:embedding")
    opts = {o.id: o for o in get_effective_instance_options(emb)}
    # every config key is tunable, plus the shared on_ingest column option
    assert EXPECTED_KEYS <= set(opts)
    assert "on_ingest" in opts

    # select controls enumerate their allowed values
    assert opts["image_source"].type == "select"
    assert opts["image_source"].options == list(IMAGE_SOURCES)
    assert opts["video_frame_strategy"].options == list(VIDEO_FRAME_STRATEGIES)
    assert opts["video_frame_aggregation"].options == list(VIDEO_FRAME_AGGREGATIONS)

    # number controls carry bounds
    count = opts["video_frame_count"]
    assert count.type == "number"
    assert (count.min, count.max) == (1, 16)

    # embedding descriptors live in config storage (feed instance_config hash)
    assert opts["image_source"].storage == "config"


def test_descriptor_defaults_match_shared_defaults():
    emb = AnalyzerRegistry().get("asset:embedding")
    opts = {o.id: o for o in get_effective_instance_options(emb)}
    for key in EXPECTED_KEYS:
        assert opts[key].default == EMBEDDING_INPUT_CONFIG_DEFAULTS[key]


# ── effective_config_hash participation ─────────────────────────────────────

def _hash(svc, **overrides):
    base = dict(
        analyzer_id="asset:embedding",
        provider_id="cmd-embedding",
        model_id="google/siglip2-large-patch16-384",
        analyzer_definition_version="registry:test",
        analyzer_config={},
        instance_id=None,
        instance_config={},
    )
    base.update(overrides)
    return svc._compute_effective_config_hash(**base)


def test_config_change_changes_effective_hash():
    svc = AnalysisService(None)  # hash method needs no DB

    baseline = _hash(svc, analyzer_config=dict(EMBEDDING_INPUT_CONFIG_DEFAULTS))
    # changing a strategy in analyzer_config must change the hash → re-embed
    changed_analyzer = _hash(
        svc,
        analyzer_config={**EMBEDDING_INPUT_CONFIG_DEFAULTS, "video_frame_count": 5},
    )
    assert baseline != changed_analyzer

    # a per-instance override in instance_config must also change the hash
    changed_instance = _hash(
        svc,
        analyzer_config=dict(EMBEDDING_INPUT_CONFIG_DEFAULTS),
        instance_config={"image_source": "thumbnail"},
    )
    assert baseline != changed_instance


def test_identical_config_is_stable_hash():
    svc = AnalysisService(None)
    a = _hash(svc, analyzer_config=dict(EMBEDDING_INPUT_CONFIG_DEFAULTS))
    b = _hash(svc, analyzer_config=dict(EMBEDDING_INPUT_CONFIG_DEFAULTS))
    assert a == b
