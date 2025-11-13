from enum import Enum


class HealthStatus(Enum):
    UNKNOWN = 'unknown'
    HEALTHY = 'healthy'
    UNHEALTHY = 'unhealthy'
    STARTING = 'starting'
    STOPPED = 'stopped'


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
