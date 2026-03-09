from pixsim7.backend.main.domain.generation.models import Generation


def test_compute_hash_seed_agnostic_when_requested() -> None:
    params_a = {
        "prompt": "cinematic waterfall",
        "seed": 123,
        "style": {
            "pixverse": {
                "seed": 456,
                "quality": "720p",
            }
        },
    }
    params_b = {
        "prompt": "cinematic waterfall",
        "seed": 789,
        "style": {
            "pixverse": {
                "seed": 321,
                "quality": "720p",
            }
        },
    }
    inputs = [
        {
            "asset": "asset:100",
            "role": "source_image",
            "provider_params": {"seed": 999},
        }
    ]

    hash_a = Generation.compute_hash(params_a, inputs, include_seed=False)
    hash_b = Generation.compute_hash(params_b, inputs, include_seed=False)

    assert hash_a == hash_b


def test_compute_hash_remains_seed_sensitive_by_default() -> None:
    params_a = {"prompt": "cinematic waterfall", "seed": 123}
    params_b = {"prompt": "cinematic waterfall", "seed": 789}
    inputs = [{"asset": "asset:100", "role": "source_image"}]

    hash_a = Generation.compute_hash(params_a, inputs)
    hash_b = Generation.compute_hash(params_b, inputs)

    assert hash_a != hash_b

