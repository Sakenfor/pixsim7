"""
Embedding Provider Adapters - concrete implementations

Mirrors the LLM adapter pattern (services/llm/adapters.py).
"""
import asyncio
import json
import logging
import os
import shlex
import subprocess
import sys
import time
from typing import Optional

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

from pixsim7.backend.main.shared.errors import (
    ProviderError,
    ProviderAuthenticationError,
)
from pixsim7.backend.main.domain.providers import ProviderAccount

logger = logging.getLogger(__name__)


class OpenAiEmbeddingProvider:
    """OpenAI embedding provider using text-embedding-3-* models."""

    @property
    def provider_id(self) -> str:
        return "openai-embedding"

    @property
    def default_dimensions(self) -> int:
        return 768

    def __init__(self):
        if not OPENAI_AVAILABLE:
            raise ImportError("openai package not installed. Run: pip install openai")

    async def embed_texts(
        self,
        *,
        model_id: str,
        texts: list[str],
        account: Optional[ProviderAccount] = None,
        instance_config: dict | None = None,
    ) -> list[list[float]]:
        """
        Generate embeddings using OpenAI's embedding API.

        Args:
            model_id: OpenAI embedding model (e.g., "text-embedding-3-small")
            texts: List of texts to embed
            account: Optional account with API key
            instance_config: Optional config (api_key, base_url)

        Returns:
            List of embedding vectors
        """
        # Get API key: instance_config > account > environment
        api_key = None
        base_url = None

        if instance_config:
            api_key = instance_config.get("api_key")
            base_url = instance_config.get("base_url")

        if not api_key and account and account.api_key:
            api_key = account.api_key

        if not api_key:
            api_key = os.getenv("OPENAI_API_KEY")

        if not api_key:
            raise ProviderAuthenticationError(
                self.provider_id,
                "No API key found. Set OPENAI_API_KEY or configure account."
            )

        try:
            client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)

            response = await client.embeddings.create(
                model=model_id,
                input=texts,
                dimensions=self.default_dimensions,
            )

            embeddings = [item.embedding for item in response.data]
            logger.info(
                "OpenAI embedding: %d texts, model=%s, dims=%d",
                len(texts), model_id, len(embeddings[0]) if embeddings else 0,
            )
            return embeddings

        except openai.AuthenticationError as e:
            raise ProviderAuthenticationError(self.provider_id, str(e))
        except openai.RateLimitError as e:
            logger.warning("OpenAI rate limit hit: %s", e)
            raise ProviderError(self.provider_id, f"Rate limit exceeded: {e}")
        except openai.APIConnectionError as e:
            logger.error("OpenAI connection error: %s", e)
            raise ProviderError(self.provider_id, f"Connection error: {e}")
        except openai.APIStatusError as e:
            logger.error("OpenAI API status error: %s - %s", e.status_code, e)
            raise ProviderError(self.provider_id, f"API error ({e.status_code}): {e}")
        except Exception as e:
            logger.error("OpenAI embedding error: %s", e)
            raise ProviderError(self.provider_id, str(e))


class CommandEmbeddingProvider:
    """
    Command-based embedding provider that runs a local CLI command.

    Command contract:
    - Input JSON (via stdin):
        {"task": "embed_texts", "texts": [...], "model": "..."}
    - Output JSON (via stdout):
        {"embeddings": [[...], ...]}

    Configuration via environment variables:
    - CMD_EMBEDDING_COMMAND: Command to execute (required)
    - CMD_EMBEDDING_TIMEOUT: Timeout in seconds (default: 120)
    """

    def __init__(
        self,
        command: str | None = None,
        timeout: int | None = None,
    ):
        self._command = command
        self._timeout = timeout

    @property
    def provider_id(self) -> str:
        return "cmd-embedding"

    @property
    def default_dimensions(self) -> int:
        return 768

    def _parse_shell_args(self, args_str: str) -> list[str]:
        if not args_str.strip():
            return []
        posix = sys.platform != "win32"
        try:
            return shlex.split(args_str, posix=posix)
        except ValueError:
            return args_str.strip().split()

    def _get_command_parts(self, instance_config: dict | None = None) -> list[str]:
        if instance_config:
            cmd = instance_config.get("command")
            if cmd:
                return self._parse_shell_args(cmd)

        cmd_str = self._command or os.getenv("CMD_EMBEDDING_COMMAND", "")
        if not cmd_str.strip():
            raise ProviderError(
                self.provider_id,
                "No command configured. Set CMD_EMBEDDING_COMMAND environment variable."
            )
        return self._parse_shell_args(cmd_str)

    def _get_timeout(self, instance_config: dict | None = None) -> int:
        if instance_config:
            t = instance_config.get("timeout")
            if t is not None:
                try:
                    return int(t)
                except (ValueError, TypeError):
                    pass
        if self._timeout is not None:
            return self._timeout
        try:
            return int(os.getenv("CMD_EMBEDDING_TIMEOUT", "120"))
        except ValueError:
            return 120

    async def embed_texts(
        self,
        *,
        model_id: str,
        texts: list[str],
        account: Optional[ProviderAccount] = None,
        instance_config: dict | None = None,
    ) -> list[list[float]]:
        """Generate embeddings by running a local CLI command."""
        cmd_list = self._get_command_parts(instance_config)
        timeout = self._get_timeout(instance_config)
        cmd_executable = cmd_list[0] if cmd_list else "(empty)"

        input_payload = {
            "task": "embed_texts",
            "texts": texts,
            "model": model_id,
        }
        input_json = json.dumps(input_payload)

        logger.info(
            "CommandEmbeddingProvider: executing, model=%s, cmd=%s, texts=%d, timeout=%ds",
            model_id, cmd_executable, len(texts), timeout,
        )

        start_time = time.monotonic()

        try:
            def run_subprocess() -> subprocess.CompletedProcess:
                return subprocess.run(
                    cmd_list,
                    input=input_json,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    shell=False,
                )

            result = await asyncio.to_thread(run_subprocess)
            duration = time.monotonic() - start_time

            logger.info(
                "CommandEmbeddingProvider: completed, exit=%d, duration=%.2fs",
                result.returncode, duration,
            )

            if result.returncode != 0:
                stderr_preview = (result.stderr or "")[:500]
                raise ProviderError(
                    self.provider_id,
                    f"Command exited with status {result.returncode}: {stderr_preview}"
                )

            stdout_text = result.stdout.strip()
            if not stdout_text:
                raise ProviderError(
                    self.provider_id,
                    "Command returned empty output; expected JSON with 'embeddings'"
                )

            try:
                output_data = json.loads(stdout_text)
            except json.JSONDecodeError as e:
                raise ProviderError(
                    self.provider_id,
                    f"Command returned invalid JSON: {e}"
                )

            if "embeddings" not in output_data:
                raise ProviderError(
                    self.provider_id,
                    f"Command output missing 'embeddings' key. Keys found: {list(output_data.keys())}"
                )

            embeddings = output_data["embeddings"]
            if len(embeddings) != len(texts):
                raise ProviderError(
                    self.provider_id,
                    f"Expected {len(texts)} embeddings, got {len(embeddings)}"
                )

            return embeddings

        except subprocess.TimeoutExpired:
            raise ProviderError(
                self.provider_id,
                f"Command timed out after {timeout} seconds"
            )
        except FileNotFoundError:
            raise ProviderError(
                self.provider_id,
                f"Command not found: {cmd_executable}"
            )
        except PermissionError:
            raise ProviderError(
                self.provider_id,
                f"Permission denied executing: {cmd_executable}"
            )
