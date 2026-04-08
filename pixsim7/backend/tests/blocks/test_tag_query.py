from pixsim7.backend.main.services.prompt.block.tag_query import normalize_tag_query


def test_normalize_tag_query_accepts_legacy_flat_constraints() -> None:
    normalized = normalize_tag_query(
        tag_constraints={
            "camera_angle": ["low", "dutch"],
            "perspective": "upward",
        }
    )

    assert normalized == {
        "all": {
            "camera_angle": ["low", "dutch"],
            "perspective": "upward",
        },
        "any": {},
        "not": {},
    }


def test_normalize_tag_query_accepts_namespaced_groups() -> None:
    normalized = normalize_tag_query(
        tag_query={
            "all": {"role_hint": "primary"},
            "any": {"camera_angle": ["low", "dutch"]},
            "not": {"atmosphere": ["surveillance", "clinical"]},
        }
    )

    assert normalized == {
        "all": {"role_hint": "primary"},
        "any": {"camera_angle": ["low", "dutch"]},
        "not": {"atmosphere": ["surveillance", "clinical"]},
    }


def test_normalize_tag_query_accepts_authoring_alias_groups() -> None:
    normalized = normalize_tag_query(
        tag_query={
            "all_of": {"role_hint": "primary"},
            "any_of": {"camera_angle": ["low", "dutch"]},
            "none_of": {"atmosphere": ["surveillance", "clinical"]},
        }
    )

    assert normalized == {
        "all": {"role_hint": "primary"},
        "any": {"camera_angle": ["low", "dutch"]},
        "not": {"atmosphere": ["surveillance", "clinical"]},
    }
