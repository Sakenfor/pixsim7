"""
LLM Provider Adapters - concrete implementations for AI Hub

These adapters implement the LlmProvider protocol for prompt editing operations.
"""
import os
import json
import logging
import subprocess
from typing import Optional, Any

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False

from pixsim7.backend.main.shared.errors import (
    ProviderError,
    ProviderAuthenticationError,
)
from pixsim7.backend.main.shared.config import settings
from pixsim7.backend.main.domain.providers import ProviderAccount
from pixsim7.backend.main.services.llm.local_llm_engine import get_local_llm_engine
from pixsim7.backend.main.services.command_runtime import (
    parse_shell_args,
    run_subprocess_text,
)

logger = logging.getLogger(__name__)


# ===== SHARED PROMPT TEMPLATE HELPERS =====

def build_edit_prompt_system() -> str:
    """
    Build the standard system prompt for prompt editing.
    Shared by HTTP and command providers for consistency.
    """
    return """You are a video generation prompt expert. Your task is to refine and improve prompts for AI video generation.

Guidelines:
- Keep the core intent and subject matter
- Add specific visual details (lighting, camera angles, motion)
- Use clear, descriptive language
- Keep prompts concise (under 200 words)
- Focus on what should be visible in the video
- Avoid abstract concepts that can't be visualized"""


def build_edit_prompt_user(prompt_before: str, context: dict | None = None) -> str:
    """
    Build the user message for prompt editing.
    Shared by HTTP and command providers for consistency.
    """
    user_message = (
        f"Original prompt:\n{prompt_before}\n\n"
        "Please refine this prompt for better video generation results."
    )

    if context:
        if "style" in context:
            user_message += f"\n\nDesired style: {context['style']}"
        if "duration" in context:
            user_message += f"\nVideo duration: {context['duration']}s"

    return user_message


class OpenAiLlmProvider:
    """OpenAI LLM provider for prompt editing"""

    @property
    def provider_id(self) -> str:
        return "openai-llm"

    @property
    def method(self) -> str:
        return "api"

    @property
    def provider(self) -> str:
        return "openai"

    def __init__(self):
        if not OPENAI_AVAILABLE:
            raise ImportError("openai package not installed. Run: pip install openai")

    async def edit_prompt(
        self,
        *,
        model_id: str,
        prompt_before: str,
        context: dict | None = None,
        account: ProviderAccount | None = None,
        instance_config: dict | None = None,
    ) -> str:
        """
        Edit prompt using OpenAI

        Args:
            model_id: OpenAI model (e.g., "gpt-4", "gpt-4-turbo")
            prompt_before: Original prompt
            context: Optional context
            account: Optional account (uses API key or env var)
            instance_config: Optional instance config (api_key, base_url)

        Returns:
            Edited prompt
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

            # Use shared prompt template helpers for consistency
            system_prompt = build_edit_prompt_system()
            user_message = build_edit_prompt_user(prompt_before, context)

            # Call OpenAI API
            response = await client.chat.completions.create(
                model=model_id,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.7,
                max_tokens=500
            )

            edited_prompt = response.choices[0].message.content.strip()
            logger.info(f"OpenAI prompt edit: {len(prompt_before)} -> {len(edited_prompt)} chars")

            return edited_prompt

        except openai.AuthenticationError as e:
            raise ProviderAuthenticationError(self.provider_id, str(e))
        except openai.RateLimitError as e:
            logger.warning(f"OpenAI rate limit hit: {e}")
            raise ProviderError(f"Rate limit exceeded: {e}")
        except openai.APIConnectionError as e:
            logger.error(f"OpenAI connection error: {e}")
            raise ProviderError(f"Connection error: {e}")
        except openai.APIStatusError as e:
            logger.error(f"OpenAI API status error: {e.status_code} - {e}")
            raise ProviderError(f"API error ({e.status_code}): {e}")
        except Exception as e:
            logger.error(f"OpenAI prompt edit error: {e}")
            raise ProviderError(str(e))


class AnthropicLlmProvider:
    """Anthropic Claude LLM provider for prompt editing"""

    @property
    def provider_id(self) -> str:
        return "anthropic-llm"

    @property
    def method(self) -> str:
        return "api"

    @property
    def provider(self) -> str:
        return "anthropic"

    def __init__(self):
        if not ANTHROPIC_AVAILABLE:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")

    async def edit_prompt(
        self,
        *,
        model_id: str,
        prompt_before: str,
        context: dict | None = None,
        account: ProviderAccount | None = None,
        instance_config: dict | None = None,
    ) -> str:
        """
        Edit prompt using Anthropic Claude

        Args:
            model_id: Claude model (e.g., "claude-sonnet-4")
            prompt_before: Original prompt
            context: Optional context
            account: Optional account (uses API key or env var)
            instance_config: Optional instance config (api_key)

        Returns:
            Edited prompt
        """
        # Get API key: instance_config > account > environment
        api_key = None

        if instance_config:
            api_key = instance_config.get("api_key")

        if not api_key and account and account.api_key:
            api_key = account.api_key

        if not api_key:
            api_key = os.getenv("ANTHROPIC_API_KEY")

        if not api_key:
            raise ProviderAuthenticationError(
                self.provider_id,
                "No API key found. Set ANTHROPIC_API_KEY or configure account."
            )

        try:
            # Use async client to avoid blocking event loop
            client = anthropic.AsyncAnthropic(api_key=api_key)

            # Use shared prompt template helpers for consistency
            system_prompt = build_edit_prompt_system()
            user_message = build_edit_prompt_user(prompt_before, context)

            # Call Claude API (async)
            response = await client.messages.create(
                model=model_id,
                max_tokens=500,
                temperature=0.7,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": user_message}
                ]
            )

            edited_prompt = response.content[0].text.strip()
            logger.info(f"Anthropic prompt edit: {len(prompt_before)} -> {len(edited_prompt)} chars")

            return edited_prompt

        except anthropic.AuthenticationError as e:
            raise ProviderAuthenticationError(self.provider_id, str(e))
        except anthropic.RateLimitError as e:
            logger.warning(f"Anthropic rate limit hit: {e}")
            raise ProviderError(f"Rate limit exceeded: {e}")
        except anthropic.APIConnectionError as e:
            logger.error(f"Anthropic connection error: {e}")
            raise ProviderError(f"Connection error: {e}")
        except anthropic.APIStatusError as e:
            logger.error(f"Anthropic API status error: {e.status_code} - {e}")
            raise ProviderError(f"API error ({e.status_code}): {e}")
        except Exception as e:
            logger.error(f"Anthropic prompt edit error: {e}")
            raise ProviderError(str(e))


class LocalLlmProvider:
    """Local llama-cpp provider for prompt editing/analyzer calls."""

    @property
    def provider_id(self) -> str:
        return "local-llm"

    @property
    def method(self) -> str:
        return "local"

    @property
    def provider(self) -> str | None:
        return None

    async def edit_prompt(
        self,
        *,
        model_id: str,
        prompt_before: str,
        context: dict | None = None,
        account: ProviderAccount | None = None,
        instance_config: dict | None = None,
    ) -> str:
        # Local provider does not use account/context credentials.
        _ = account
        _ = context

        config = instance_config or {}
        max_tokens = _coerce_int(config.get("max_tokens"), default=500, minimum=1)
        temperature = _coerce_float(config.get("temperature"), default=0.3, minimum=0.0)
        engine = _resolve_local_engine(config)

        try:
            return await engine.generate(
                prompt_before,
                model_id=model_id,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        except ImportError as e:
            raise ProviderError(
                f"Local LLM dependencies missing: {e}",
                code="LOCAL_LLM_DEPENDENCY_MISSING",
                retryable=False,
            )
        except FileNotFoundError as e:
            raise ProviderError(
                f"Local LLM model file not found: {e}",
                code="LOCAL_LLM_MODEL_MISSING",
                retryable=False,
            )
        except ProviderError:
            raise
        except Exception as e:
            logger.error("Local LLM prompt edit error: %s", e)
            raise ProviderError(
                f"Local LLM prompt edit failed: {e}",
                code="LOCAL_LLM_ERROR",
            )


def _coerce_int(value: object, *, default: int, minimum: int) -> int:
    try:
        parsed = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, parsed)


def _coerce_float(value: object, *, default: float, minimum: float) -> float:
    try:
        parsed = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, parsed)


def _coerce_bool(value: object, *, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return default


def _resolve_local_engine(config: dict) -> Any:
    model_path = config.get("model_path") or config.get("local_llm_model_path")
    n_ctx_raw = (
        config.get("n_ctx")
        or config.get("context_size")
        or config.get("local_llm_context_size")
    )
    n_threads_raw = (
        config.get("n_threads")
        or config.get("threads")
        or config.get("local_llm_threads")
    )
    auto_download_raw = config.get("auto_download")
    if auto_download_raw is None:
        auto_download_raw = config.get("local_llm_auto_download")

    has_engine_overrides = any(
        value is not None
        for value in (model_path, n_ctx_raw, n_threads_raw, auto_download_raw)
    )
    if not has_engine_overrides:
        return get_local_llm_engine()

    n_ctx = _coerce_int(
        n_ctx_raw,
        default=int(settings.local_llm_context_size),
        minimum=256,
    )
    n_threads = _coerce_int(
        n_threads_raw,
        default=int(settings.local_llm_threads),
        minimum=1,
    )
    auto_download = _coerce_bool(
        auto_download_raw,
        default=bool(settings.local_llm_auto_download),
    )
    return get_local_llm_engine(
        model_path=str(model_path) if model_path is not None else None,
        n_ctx=n_ctx,
        n_threads=n_threads,
        auto_download=auto_download,
    )


class CommandLlmProvider:
    """
    Command-based LLM provider that runs a local CLI command.

    This provider executes a configured command via subprocess, passing
    prompts via stdin JSON and receiving edited prompts via stdout JSON.

    Command contract:
    - Input JSON (via stdin):
        { "task": "edit_prompt", "prompt": "...", "instruction": "...",
          "model": "...", "context": {...} }
    - Output JSON (via stdout):
        { "edited_prompt": "..." }

    Configuration via environment variables:
    - CMD_LLM_COMMAND: Command to execute. Can be a bare executable or a full
      command string with arguments (shell-style quoting supported).
      Required unless 'command' argument is provided to the constructor.
    - CMD_LLM_ARGS: Additional arguments to append (shell-style quoting supported).
      Optional.
    - CMD_LLM_TIMEOUT: Timeout in seconds (default: 60)

    Example usage:
        # Simple executable with separate args
        export CMD_LLM_COMMAND="python"
        export CMD_LLM_ARGS='"/path/to/my script.py" --verbose'

        # Full command string with embedded args
        export CMD_LLM_COMMAND='python "/path/to/my script.py" --verbose'

        # Paths with spaces work correctly
        export CMD_LLM_COMMAND="/usr/local/bin/my-llm"
        export CMD_LLM_ARGS='"C:/Program Files/model/config.json"'
    """

    def __init__(
        self,
        command: str | None = None,
        args: list[str] | None = None,
        timeout: int | None = None
    ):
        """
        Initialize the Command LLM provider.

        Args:
            command: Command to execute. Can be a bare executable or a full
                command string with args (uses shlex parsing). Defaults to
                CMD_LLM_COMMAND env var.
            args: Additional arguments as a list. Defaults to CMD_LLM_ARGS
                env var (parsed with shlex for proper quoting support).
            timeout: Timeout in seconds. Defaults to CMD_LLM_TIMEOUT env var or 60.
        """
        self._command = command
        self._args = args
        self._timeout = timeout

    @property
    def provider_id(self) -> str:
        return "cmd-llm"

    @property
    def method(self) -> str:
        return "cmd"

    @property
    def provider(self) -> str | None:
        return None

    def _parse_shell_args(self, args_str: str) -> list[str]:
        """
        Parse a shell-style argument string into a list.

        Uses shlex.split() with posix=False on Windows to handle
        Windows-style paths and quoting correctly.

        Args:
            args_str: Shell-style argument string (e.g., 'arg1 "arg 2" arg3')

        Returns:
            List of parsed arguments
        """
        return parse_shell_args(args_str, logger=logger)

    def _parse_inline_python_command(self, cmd_str: str) -> list[str] | None:
        """
        Parse `<python-exe> -c <script>` commands while preserving script content.

        This keeps compatibility with command strings where the `-c` script contains
        nested quotes/newlines that generic shell parsers may not handle reliably.
        """
        marker = " -c "
        if marker not in cmd_str:
            return None

        executable_part, script_part = cmd_str.split(marker, 1)
        executable_tokens = self._parse_shell_args(executable_part.strip())
        if not executable_tokens:
            return None

        script = script_part.strip()
        if len(script) >= 2 and script[0] == script[-1] and script[0] in {'"', "'"}:
            script = script[1:-1]

        return [*executable_tokens, "-c", script]

    def _get_command_parts(self) -> list[str]:
        """
        Get the full command as a list of parts (executable + args).

        Parses CMD_LLM_COMMAND as a potentially full command string,
        then appends any additional args from CMD_LLM_ARGS.

        Returns:
            List of command parts ready for subprocess
        """
        # Get the base command (may include args)
        if self._command:
            cmd_str = self._command
        else:
            cmd_str = os.getenv("CMD_LLM_COMMAND", "")

        if not cmd_str.strip():
            raise ProviderError(
                "No command configured. Set CMD_LLM_COMMAND environment variable "
                "or provide 'command' argument to CommandLlmProvider."
            )

        # Parse full inline `python -c "<script>"` safely when present.
        cmd_parts = self._parse_inline_python_command(cmd_str)
        if cmd_parts is None:
            # Parse the command string (handles quoted paths/args)
            cmd_parts = self._parse_shell_args(cmd_str)

        # Add additional args
        if self._args is not None:
            cmd_parts.extend(self._args)
        else:
            args_str = os.getenv("CMD_LLM_ARGS", "")
            cmd_parts.extend(self._parse_shell_args(args_str))

        return cmd_parts

    def _get_timeout(self) -> int:
        """Get timeout in seconds, from init or environment."""
        if self._timeout is not None:
            return self._timeout
        timeout_str = os.getenv("CMD_LLM_TIMEOUT", "60")
        try:
            return int(timeout_str)
        except ValueError:
            logger.warning(
                f"Invalid CMD_LLM_TIMEOUT value '{timeout_str}', using default 60"
            )
            return 60

    def _get_command_parts_from_config(
        self,
        instance_config: dict | None,
    ) -> list[str]:
        """
        Get command parts from instance config, with fallback to defaults.

        Args:
            instance_config: Config from ProviderInstanceConfig (optional)

        Returns:
            List of command parts ready for subprocess
        """
        # Try instance config first
        if instance_config:
            cmd = instance_config.get("command")
            if cmd:
                cmd_parts = self._parse_inline_python_command(str(cmd))
                if cmd_parts is None:
                    cmd_parts = self._parse_shell_args(str(cmd))
                args = instance_config.get("args", [])
                if isinstance(args, list):
                    cmd_parts.extend(args)
                elif isinstance(args, str):
                    cmd_parts.extend(self._parse_shell_args(args))
                return cmd_parts

        # Fall back to constructor/env defaults
        return self._get_command_parts()

    def _get_timeout_from_config(self, instance_config: dict | None) -> int:
        """
        Get timeout from instance config, with fallback to defaults.

        Args:
            instance_config: Config from ProviderInstanceConfig (optional)

        Returns:
            Timeout in seconds
        """
        if instance_config:
            timeout = instance_config.get("timeout")
            if timeout is not None:
                try:
                    return int(timeout)
                except (ValueError, TypeError):
                    pass

        # Fall back to constructor/env defaults
        return self._get_timeout()

    async def edit_prompt(
        self,
        *,
        model_id: str,
        prompt_before: str,
        context: dict | None = None,
        account: ProviderAccount | None = None,
        instance_config: dict | None = None,
    ) -> str:
        """
        Edit prompt by running a local CLI command.

        The command receives JSON input via stdin and returns JSON output via stdout.

        Args:
            model_id: Model identifier to pass to the command
            prompt_before: Original prompt to edit
            context: Optional context dict
            account: Optional account (not used by command provider)
            instance_config: Optional config from ProviderInstanceConfig

        Returns:
            Edited prompt text from command output

        Raises:
            ProviderError: Command failed, timed out, or returned invalid output
        """
        # Build the command line (safe arg list, no shell=True)
        # Use instance config if provided, otherwise fall back to defaults
        cmd_list = self._get_command_parts_from_config(instance_config)
        timeout = self._get_timeout_from_config(instance_config)

        # For logging, show the executable name
        cmd_executable = cmd_list[0] if cmd_list else "(empty)"

        # Build the input JSON payload
        system_prompt = build_edit_prompt_system()
        instruction = build_edit_prompt_user(prompt_before, context)

        input_payload = {
            "task": "edit_prompt",
            "prompt": prompt_before,
            "instruction": instruction,
            "system_prompt": system_prompt,
            "model": model_id,
            "context": context or {},
        }
        input_json = json.dumps(input_payload)

        logger.info(
            f"CommandLlmProvider: executing command, provider_id={self.provider_id}, "
            f"model={model_id}, cmd={cmd_executable}, timeout={timeout}s"
        )

        try:
            # Run the command with stdin/stdout JSON.
            result = await run_subprocess_text(
                cmd_list,
                input_text=input_json,
                timeout=timeout,
            )

            logger.info(
                f"CommandLlmProvider: command completed, "
                f"provider_id={self.provider_id}, exit_status={result.returncode}, "
                f"duration={result.duration_s:.2f}s"
            )

            # Check exit status
            if result.returncode != 0:
                stderr_preview = (result.stderr or "")[:500]
                logger.error(
                    f"CommandLlmProvider: command failed with exit code "
                    f"{result.returncode}. stderr: {stderr_preview}"
                )
                raise ProviderError(
                    f"Command exited with status {result.returncode}: {stderr_preview}"
                )

            # Parse JSON output
            stdout_text = result.stdout.strip()
            if not stdout_text:
                raise ProviderError(
                    "Command returned empty output; expected JSON with 'edited_prompt'"
                )

            try:
                output_data = json.loads(stdout_text)
            except json.JSONDecodeError as e:
                preview = stdout_text[:500]
                logger.error(
                    f"CommandLlmProvider: invalid JSON output: {e}. "
                    f"Output preview: {preview}"
                )
                raise ProviderError(
                    f"Command returned invalid JSON: {e}"
                )

            # Extract edited_prompt from output
            if "edited_prompt" not in output_data:
                logger.error(
                    f"CommandLlmProvider: output missing 'edited_prompt' key. "
                    f"Keys found: {list(output_data.keys())}"
                )
                raise ProviderError(
                    "Command output missing 'edited_prompt' key. "
                    f"Keys found: {list(output_data.keys())}"
                )

            edited_prompt = str(output_data["edited_prompt"]).strip()

            logger.info(
                f"CommandLlmProvider: prompt edited successfully, "
                f"{len(prompt_before)} -> {len(edited_prompt)} chars"
            )

            return edited_prompt

        except subprocess.TimeoutExpired:
            logger.error(
                f"CommandLlmProvider: command timed out (timeout={timeout}s)"
            )
            raise ProviderError(
                f"Command timeout after {timeout} seconds"
            )

        except FileNotFoundError:
            logger.error(
                f"CommandLlmProvider: command not found: {cmd_executable}"
            )
            raise ProviderError(
                f"Command not found: {cmd_executable}. "
                "Ensure the command exists and is executable."
            )

        except PermissionError:
            logger.error(
                f"CommandLlmProvider: permission denied for command: {cmd_executable}"
            )
            raise ProviderError(
                f"Permission denied executing: {cmd_executable}. "
                "Ensure the command has execute permissions."
            )


class RemoteCommandLlmProvider:
    """
    Remote command LLM provider — same contract as CommandLlmProvider
    but executes on the user's machine via WebSocket.

    The user connects a terminal with a bridge script. When a task arrives,
    it's sent over WebSocket to the user's terminal, which runs the command
    locally and returns the result.
    """

    @property
    def provider_id(self) -> str:
        return "remote-cmd-llm"

    @property
    def method(self) -> str:
        return "remote"

    @property
    def provider(self) -> str | None:
        return None

    async def edit_prompt(
        self,
        *,
        model_id: str,
        prompt_before: str,
        context: dict | None = None,
        account: ProviderAccount | None = None,
        instance_config: dict | None = None,
    ) -> str:
        from pixsim7.backend.main.services.llm.remote_cmd_bridge import remote_cmd_bridge

        if not remote_cmd_bridge.has_available:
            raise ProviderError(
                "No remote agents connected. Run the agent bridge script to connect."
            )

        timeout = 120
        if instance_config:
            timeout = int(instance_config.get("timeout", 120))

        system_prompt = build_edit_prompt_system()
        instruction = build_edit_prompt_user(prompt_before, context)

        task_payload = {
            "task": "edit_prompt",
            "prompt": prompt_before,
            "instruction": instruction,
            "system_prompt": system_prompt,
            "model": model_id,
            "context": context or {},
        }

        logger.info(
            "RemoteCommandLlmProvider: dispatching to remote agent, "
            f"model={model_id}, timeout={timeout}s"
        )

        try:
            result = await remote_cmd_bridge.dispatch_task(task_payload, timeout=timeout)
        except RuntimeError as e:
            raise ProviderError(str(e))
        except TimeoutError as e:
            raise ProviderError(str(e))
        except ConnectionError as e:
            raise ProviderError(f"Remote agent disconnected: {e}")

        if "error" in result:
            raise ProviderError(f"Remote agent error: {result['error']}")

        edited_prompt = result.get("edited_prompt")
        if not edited_prompt:
            raise ProviderError(
                f"Remote agent returned no 'edited_prompt'. Keys: {list(result.keys())}"
            )

        logger.info(
            "RemoteCommandLlmProvider: prompt edited, "
            f"{len(prompt_before)} -> {len(edited_prompt)} chars"
        )

        return str(edited_prompt).strip()
