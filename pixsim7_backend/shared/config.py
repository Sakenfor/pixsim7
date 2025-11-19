"""
Application configuration using Pydantic Settings

Clean configuration for PixSim7 - simplified from PixSim6
"""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator
import os


class Settings(BaseSettings):
    """
    Application settings with environment variable support

    Usage:
        from shared.config import settings
        print(settings.database_url)

    Environment variables:
        DATABASE_URL, REDIS_URL, SECRET_KEY, etc.
    """
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra='allow'  # Allow extra fields from .env
    )

    # ===== DATABASE =====
    database_url: str = Field(
        default="postgresql://pixsim:pixsim123@localhost:5435/pixsim7",
        description="PostgreSQL connection URL for application data"
    )

    log_database_url: str | None = Field(
        default=None,
        description="Separate database URL for logs (TimescaleDB). Falls back to database_url if not set."
    )

    # ===== REDIS =====
    redis_url: str = Field(
        default="redis://localhost:6380/0",
        description="Redis connection URL (cache + queue)"
    )

    # ===== SECURITY =====
    secret_key: str = Field(
        default="change-this-in-production",
        description="Secret key for JWT and signed URLs"
    )
    jwt_algorithm: str = "HS256"
    jwt_expiration_days: int = 30
    
    # Session policy: strict requires DB session record, stateless accepts any valid JWT
    jwt_require_session: bool = Field(
        default=True,
        description="If True, verify_token requires a session record in DB (strict mode). If False, any valid JWT is accepted (stateless mode)."
    )

    # ===== CORS =====
    cors_origins: str | List[str] = Field(
        default=[
            "http://localhost:5173",  # SvelteKit default
            "http://localhost:5174",
            "http://localhost:8001",  # Backend API docs
            "http://localhost:8002",  # Admin panel
        ],
        description="Allowed CORS origins"
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """
        Parse CORS_ORIGINS from environment variable

        Examples:
            CORS_ORIGINS="*"  # Allow all (dev only!)
            CORS_ORIGINS="http://localhost:3000,https://app.example.com"

        ZeroTier network (10.243.*.*) is automatically added
        """
        # Handle string input (from env var or direct)
        if isinstance(v, str):
            if v == "*":
                origins = ["*"]
            else:
                origins = [origin.strip() for origin in v.split(",") if origin.strip()]
        elif isinstance(v, list):
            origins = v
        else:
            origins = []

        # Add ZeroTier network origins
        zerotier_network = os.getenv("ZEROTIER_NETWORK", "10.243.0.0/16")
        if zerotier_network:
            # Parse CIDR to get network prefix
            network_prefix = zerotier_network.split("/")[0].rsplit(".", 1)[0]  # e.g., "10.243.0"

            # Add common ZeroTier origins
            # Users can override with specific IPs via CORS_ORIGINS
            zerotier_origins = [
                f"http://{network_prefix}.48.125:8001",  # Your server
                f"http://{network_prefix}.48.125:8002",  # Admin panel
            ]
            origins.extend(zerotier_origins)

        return origins

    # ===== APP =====
    debug: bool = Field(
        default=True,
        description="Debug mode (disable in production!)"
    )
    api_title: str = "PixSim7 API"
    api_version: str = "0.1.0"

    # ===== GENERATION =====
    auto_retry_enabled: bool = Field(
        default=True,
        description="Enable automatic retry for failed generations (content filters, temporary errors)"
    )
    auto_retry_max_attempts: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Maximum retry attempts per generation"
    )

    # ===== NETWORK =====
    host: str = Field(
        default="0.0.0.0",
        description="Host to bind to (0.0.0.0 for all interfaces)"
    )
    port: int = Field(
        default=8001,
        description="Port to bind to"
    )
    zerotier_network: str = Field(
        default="10.243.0.0/16",
        description="ZeroTier network CIDR (for CORS/access control)"
    )

    # ===== LIMITS =====
    max_jobs_per_user: int = Field(
        default=10,
        description="Max concurrent jobs per user"
    )
    max_accounts_per_user: int = Field(
        default=5,
        description="Max provider accounts per user"
    )

    # ===== WORKER (ARQ) =====
    arq_max_jobs: int = Field(
        default=10,
        description="Max concurrent jobs per worker"
    )
    arq_job_timeout: int = Field(
        default=3600,
        description="Job timeout in seconds (1 hour)"
    )
    arq_max_tries: int = Field(
        default=3,
        description="Max retry attempts"
    )

    # ===== STORAGE =====
    storage_base_path: str = Field(
        default="./storage",
        description="Base path for local file storage"
    )
    max_file_size_mb: int = Field(
        default=500,
        description="Max file size for uploads (MB)"
    )

    # ===== PROVIDERS =====
    pixverse_timeout: int = Field(
        default=300,
        description="Pixverse API timeout (seconds)"
    )
    provider_poll_interval: int = Field(
        default=10,
        description="Status polling interval (seconds)"
    )

    # ===== LLM / AI =====
    anthropic_api_key: str | None = Field(
        default=None,
        description="Anthropic API key for Claude (optional, can also use ANTHROPIC_API_KEY env var)"
    )
    openai_api_key: str | None = Field(
        default=None,
        description="OpenAI API key for GPT models (optional)"
    )
    llm_provider: str = Field(
        default="anthropic",
        description="Default LLM provider: anthropic, openai, local"
    )
    llm_default_model: str | None = Field(
        default=None,
        description="Default model to use (provider-specific, uses provider default if None)"
    )
    llm_cache_enabled: bool = Field(
        default=True,
        description="Enable LLM response caching"
    )
    llm_cache_ttl: int = Field(
        default=3600,
        description="Default cache TTL in seconds (1 hour)"
    )
    llm_cache_freshness: float = Field(
        default=0.0,
        description="Default cache freshness threshold (0.0=always use cache, 1.0=always regenerate)"
    )

    # ===== LOGGING =====
    log_level: str = Field(
        default="INFO",
        description="Logging level: DEBUG, INFO, WARNING, ERROR"
    )

    # ===== AUTOMATION / ANDROID =====
    adb_path: str = Field(
        default="adb",
        description="Path to ADB executable (or 'adb' if in PATH)"
    )
    automation_screenshots_dir: str = Field(
        default="automation_screenshots",
        description="Relative folder under storage_base_path for screenshots"
    )

    # ===== WEBHOOKS =====
    webhook_config_json: str | None = Field(
        default=None,
        description=(
            "Optional JSON array of webhook configs. "
            "Each item should include at least a 'url', and may include "
            "'event_types', 'retry_count', 'timeout', and 'secret'."
        ),
    )
    webhook_timeout_seconds: int = Field(
        default=5,
        description="Default timeout in seconds for outbound webhook HTTP requests",
    )
    webhook_max_retries: int = Field(
        default=3,
        description="Default max retry attempts for failed webhook deliveries",
    )
    webhook_block_private_networks: bool = Field(
        default=True,
        description=(
            "If True, block webhook delivery to private, loopback, link-local, "
            "and other non-public IP ranges as an SSRF safeguard."
        ),
    )
    webhook_hmac_secret: str | None = Field(
        default=None,
        description=(
            "Optional HMAC secret for signing webhook payloads. "
            "Per-webhook secrets in webhook_config_json take precedence."
        ),
    )

    # ===== PLUGINS =====
    plugin_allowlist: List[str] | None = Field(
        default=None,
        description=(
            "Optional allowlist of backend plugin IDs. "
            "If set, only plugins whose manifest.id is in this list will be enabled."
        ),
    )
    plugin_denylist: List[str] = Field(
        default_factory=list,
        description=(
            "List of backend plugin IDs that should be disabled even if their manifest enables them. "
            "Applied to route, feature, middleware, and event handler plugins that support 'enabled'."
        ),
    )

    @property
    def async_database_url(self) -> str:
        """Convert sync database URL to async (asyncpg)"""
        return self.database_url.replace(
            "postgresql://",
            "postgresql+asyncpg://"
        )

    @property
    def async_log_database_url(self) -> str:
        """
        Get async log database URL.
        Falls back to main database if log_database_url is not set.
        """
        if self.log_database_url:
            return self.log_database_url.replace(
                "postgresql://",
                "postgresql+asyncpg://"
            )
        return self.async_database_url

    @property
    def log_database_url_resolved(self) -> str:
        """Get sync log database URL (for migrations)."""
        return self.log_database_url or self.database_url


# Global settings instance
settings = Settings()
