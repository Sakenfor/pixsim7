"""Tests for link activation condition evaluation."""

from pixsim7.backend.main.services.links.activation import evaluate_activation


def test_evaluate_activation_supports_nested_context():
    conditions = {"location.zone": "downtown"}
    context = {"location": {"zone": "downtown"}}

    assert evaluate_activation(conditions, context) is True


def test_evaluate_activation_supports_flat_dot_context():
    conditions = {"location.zone": "downtown", "time.period": "night"}
    context = {"location.zone": "downtown", "time.period": "night"}

    assert evaluate_activation(conditions, context) is True


def test_evaluate_activation_fails_when_values_do_not_match():
    conditions = {"location.zone": "downtown"}
    context = {"location.zone": "suburbs"}

    assert evaluate_activation(conditions, context) is False

