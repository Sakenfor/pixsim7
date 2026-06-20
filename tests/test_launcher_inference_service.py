"""The embedding-daemon manifest must be discovered and converted as an
inference service: a uvicorn HTTP daemon WITHOUT --reload, probed via /health,
grouped under the 'models' category.
"""
from launcher.core.services import build_services_from_manifests


def _embedding_daemon():
    svcs = {s.key: s for s in build_services_from_manifests()}
    assert "embedding-daemon" in svcs, "embedding-daemon manifest not discovered"
    return svcs["embedding-daemon"]


def test_embedding_daemon_discovered_and_categorized():
    s = _embedding_daemon()
    assert s.category == "models"
    assert s.title == "Embedding Daemon (SigLIP-2)"


def test_embedding_daemon_runs_uvicorn_without_reload():
    s = _embedding_daemon()
    assert "uvicorn" in s.args
    assert "pixsim7.embedding.server:app" in s.args
    # reloading would re-load the model — must not be present.
    assert "--reload" not in s.args


def test_embedding_daemon_has_http_health_probe():
    s = _embedding_daemon()
    assert s.health_url is not None
    assert s.health_url.endswith("/health")
    # generous warm-up grace for the SigLIP-2 cold load.
    assert s.health_grace_attempts >= 20
