"""
Custom exceptions for PixSim7

Clean error hierarchy for better error handling
"""


# ===== BASE ERRORS =====

class PixSimError(Exception):
    """Base exception for all PixSim errors"""
    def __init__(self, message: str, code: str | None = None):
        self.message = message
        self.code = code or self.__class__.__name__
        super().__init__(self.message)


# ===== RESOURCE ERRORS =====

class ResourceNotFoundError(PixSimError):
    """Resource not found in database"""
    def __init__(self, resource: str, resource_id: int | str):
        super().__init__(
            f"{resource} with id {resource_id} not found",
            code="RESOURCE_NOT_FOUND"
        )
        self.resource = resource
        self.resource_id = resource_id


class ResourceAlreadyExistsError(PixSimError):
    """Resource already exists (duplicate)"""
    def __init__(self, resource: str, identifier: str):
        super().__init__(
            f"{resource} already exists: {identifier}",
            code="RESOURCE_ALREADY_EXISTS"
        )
        self.resource = resource
        self.identifier = identifier


# ===== VALIDATION ERRORS =====

class ValidationError(PixSimError):
    """Input validation failed"""
    def __init__(self, field: str, message: str):
        super().__init__(
            f"Validation error on '{field}': {message}",
            code="VALIDATION_ERROR"
        )
        self.field = field


class InvalidOperationError(PixSimError):
    """Invalid operation for current state"""
    def __init__(self, message: str):
        super().__init__(message, code="INVALID_OPERATION")


# ===== AUTHENTICATION ERRORS =====

class AuthenticationError(PixSimError):
    """Authentication failed"""
    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, code="AUTHENTICATION_ERROR")


# ===== PROVIDER ERRORS =====

class ProviderError(PixSimError):
    """Base error for provider-related issues"""
    pass


class ProviderNotFoundError(ProviderError):
    """Provider not registered"""
    def __init__(self, provider_id: str):
        super().__init__(
            f"Provider '{provider_id}' not found in registry",
            code="PROVIDER_NOT_FOUND"
        )
        self.provider_id = provider_id


class ProviderAuthenticationError(ProviderError):
    """Provider authentication failed"""
    def __init__(self, provider_id: str, message: str | None = None):
        msg = f"Authentication failed for provider '{provider_id}'"
        if message:
            msg += f": {message}"
        super().__init__(msg, code="PROVIDER_AUTH_FAILED")
        self.provider_id = provider_id


class ProviderQuotaExceededError(ProviderError):
    """Provider quota exceeded (no credits)"""
    def __init__(self, provider_id: str, credits_needed: int = 0):
        super().__init__(
            f"Quota exceeded for provider '{provider_id}'. "
            f"Credits needed: {credits_needed}",
            code="PROVIDER_QUOTA_EXCEEDED"
        )
        self.provider_id = provider_id
        self.credits_needed = credits_needed


class ProviderRateLimitError(ProviderError):
    """Provider rate limit exceeded"""
    def __init__(self, provider_id: str, retry_after: int | None = None):
        msg = f"Rate limit exceeded for provider '{provider_id}'"
        if retry_after:
            msg += f". Retry after {retry_after} seconds"
        super().__init__(msg, code="PROVIDER_RATE_LIMIT")
        self.provider_id = provider_id
        self.retry_after = retry_after


class ProviderConcurrentLimitError(ProviderError):
    """Provider concurrent generation limit reached for this account.

    This indicates the provider has too many jobs running for this account.
    The job should be requeued to try a different account.
    """
    def __init__(self, provider_id: str, account_id: int | None = None):
        msg = f"Concurrent generation limit reached for provider '{provider_id}'"
        super().__init__(msg, code="PROVIDER_CONCURRENT_LIMIT")
        self.provider_id = provider_id
        self.account_id = account_id


class ProviderContentFilteredError(ProviderError):
    """Content filtered by provider policy

    Args:
        provider_id: The provider that filtered the content
        reason: Human-readable reason for filtering
        retryable: Whether retrying might succeed (False for prompt rejections,
                   True for output rejections where AI might generate different content)
    """
    def __init__(self, provider_id: str, reason: str | None = None, *, retryable: bool = True):
        msg = f"Content filtered by provider '{provider_id}'"
        if reason:
            msg += f": {reason}"
        super().__init__(msg, code="PROVIDER_CONTENT_FILTERED")
        self.provider_id = provider_id
        self.reason = reason
        self.retryable = retryable


class ProviderJobNotFoundError(ProviderError):
    """Provider job ID not found"""
    def __init__(self, provider_id: str, provider_job_id: str):
        super().__init__(
            f"Job '{provider_job_id}' not found on provider '{provider_id}'",
            code="PROVIDER_JOB_NOT_FOUND"
        )
        self.provider_id = provider_id
        self.provider_job_id = provider_job_id


class UnsupportedOperationError(ProviderError):
    """Provider doesn't support this operation"""
    def __init__(self, provider_id: str, operation: str):
        super().__init__(
            f"Provider '{provider_id}' does not support operation '{operation}'",
            code="UNSUPPORTED_OPERATION"
        )
        self.provider_id = provider_id
        self.operation = operation


# ===== ACCOUNT ERRORS =====

class AccountError(PixSimError):
    """Base error for account-related issues"""
    pass


class NoAccountAvailableError(AccountError):
    """No available account for provider"""
    def __init__(self, provider_id: str):
        super().__init__(
            f"No available account for provider '{provider_id}'",
            code="NO_ACCOUNT_AVAILABLE"
        )
        self.provider_id = provider_id


class AccountExhaustedError(AccountError):
    """Account has no credits remaining"""
    def __init__(self, account_id: int, provider_id: str):
        super().__init__(
            f"Account {account_id} ({provider_id}) has no credits remaining",
            code="ACCOUNT_EXHAUSTED"
        )
        self.account_id = account_id
        self.provider_id = provider_id


class AccountCooldownError(AccountError):
    """Account in cooldown period"""
    def __init__(self, account_id: int, cooldown_until: str):
        super().__init__(
            f"Account {account_id} in cooldown until {cooldown_until}",
            code="ACCOUNT_COOLDOWN"
        )
        self.account_id = account_id
        self.cooldown_until = cooldown_until


# ===== JOB ERRORS =====

class JobError(PixSimError):
    """Base error for job-related issues"""
    pass


class JobNotFoundError(ResourceNotFoundError):
    """Job not found"""
    def __init__(self, job_id: int):
        super().__init__("Job", job_id)


class JobAlreadyCompletedError(JobError):
    """Job already in terminal state"""
    def __init__(self, job_id: int, status: str):
        super().__init__(
            f"Job {job_id} already in terminal state: {status}",
            code="JOB_ALREADY_COMPLETED"
        )
        self.job_id = job_id
        self.status = status


class JobCancelledError(JobError):
    """Job was cancelled"""
    def __init__(self, job_id: int):
        super().__init__(
            f"Job {job_id} was cancelled",
            code="JOB_CANCELLED"
        )
        self.job_id = job_id


# ===== ASSET ERRORS =====

class AssetError(PixSimError):
    """Base error for asset-related issues"""
    pass


class AssetNotFoundError(ResourceNotFoundError):
    """Asset not found"""
    def __init__(self, asset_id: int):
        super().__init__("Asset", asset_id)


class AssetDownloadError(AssetError):
    """Failed to download asset"""
    def __init__(self, asset_id: int, url: str, reason: str):
        super().__init__(
            f"Failed to download asset {asset_id} from {url}: {reason}",
            code="ASSET_DOWNLOAD_FAILED"
        )
        self.asset_id = asset_id
        self.url = url
        self.reason = reason


class DuplicateAssetError(ResourceAlreadyExistsError):
    """Asset with this hash already exists"""
    def __init__(self, sha256: str, existing_asset_id: int):
        super().__init__("Asset", sha256)
        self.existing_asset_id = existing_asset_id


# ===== QUOTA ERRORS =====

class QuotaError(PixSimError):
    """Base error for quota/limit issues"""
    pass


class UserQuotaExceededError(QuotaError):
    """User exceeded their quota"""
    def __init__(self, user_id: int, resource: str, limit: int):
        super().__init__(
            f"User {user_id} exceeded quota for {resource}. Limit: {limit}",
            code="USER_QUOTA_EXCEEDED"
        )
        self.user_id = user_id
        self.resource = resource
        self.limit = limit


# ===== STORAGE ERRORS =====

class StorageError(PixSimError):
    """Base error for storage issues"""
    pass


class StorageFullError(StorageError):
    """Storage is full"""
    def __init__(self):
        super().__init__(
            "Storage is full. Cannot save file.",
            code="STORAGE_FULL"
        )


class FileNotFoundError(StorageError):
    """File not found in storage"""
    def __init__(self, path: str):
        super().__init__(
            f"File not found: {path}",
            code="FILE_NOT_FOUND"
        )
        self.path = path


# ===== ALIASES FOR CONVENIENCE =====

# Alias for UserQuotaExceededError (for backwards compatibility)
QuotaExceededError = UserQuotaExceededError
