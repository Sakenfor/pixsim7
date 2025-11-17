# Import the canonical HealthStatus from launcher_core
try:
    from pixsim7.launcher_core.types import HealthStatus
except ImportError:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from pixsim7.launcher_core.types import HealthStatus


STATUS_COLORS = {
    HealthStatus.UNKNOWN: '#888888',
    HealthStatus.HEALTHY: '#00CC00',
    HealthStatus.UNHEALTHY: '#CC0000',
    HealthStatus.STARTING: '#FFAA00',
    HealthStatus.STOPPED: '#666666',
}

STATUS_TEXT = {
    HealthStatus.UNKNOWN: 'Unknown',
    HealthStatus.HEALTHY: 'Healthy',
    HealthStatus.UNHEALTHY: 'Unhealthy',
    HealthStatus.STARTING: 'Starting...',
    HealthStatus.STOPPED: 'Stopped',
}
