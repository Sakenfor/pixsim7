"""
LLM Provider Adapters - concrete implementations for AI Hub

These adapters implement the LlmProvider protocol for prompt editing operations.
"""
import asyncio
import os
import json
import logging
import shlex
import subprocess
import sys
import time
from typing import Optional

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
from pixsim7.backend.main.domain.providers import ProviderAccount

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
            raise ProviderError(self.provider_id, f"Rate limit exceeded: {e}")
        except openai.APIConnectionError as e:
            logger.error(f"OpenAI connection error: {e}")
            raise ProviderError(self.provider_id, f"Connection error: {e}")
        except openai.APIStatusError as e:
            logger.error(f"OpenAI API status error: {e.status_code} - {e}")
            raise ProviderError(self.provider_id, f"API error ({e.status_code}): {e}")
        except Exception as e:
            logger.error(f"OpenAI prompt edit error: {e}")
            raise ProviderError(self.provider_id, str(e))


class AnthropicLlmProvider:
    """Anthropic Claude LLM provider for prompt editing"""

    @property
    def provider_id(self) -> str:
        return "anthropic-llm"

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
            raise ProviderError(self.provider_id, f"Rate limit exceeded: {e}")
        except anthropic.APIConnectionError as e:
            logger.error(f"Anthropic connection error: {e}")
            raise ProviderError(self.provider_id, f"Connection error: {e}")
        except anthropic.APIStatusError as e:
            logger.error(f"Anthropic API status error: {e.status_code} - {e}")
            raise ProviderError(self.provider_id, f"API error ({e.status_code}): {e}")
        except Exception as e:
            logger.error(f"Anthropic prompt edit error: {e}")
            raise ProviderError(self.provider_id, str(e))


class LocalLlmProvider:
    """Local LLM provider (stub for future implementation)"""

    @property
    def provider_id(self) -> str:
        return "local-llm"

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
        Edit prompt using local LLM (not yet implemented)

        Args:
            model_id: Local model name
            prompt_before: Original prompt
            context: Optional context
            account: Not used for local LLM
            instance_config: Not used for local LLM

        Returns:
            Edited prompt
        """
        raise NotImplementedError(
            "Local LLM provider not yet implemented. "
            "Please use 'openai-llm' or 'anthropic-llm'."
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
        if not args_str.strip():
            return []
        # On Windows, use posix=False to handle backslashes in paths correctly
        posix = sys.platform != "win32"
        try:
            return shlex.split(args_str, posix=posix)
        except ValueError as e:
            logger.warning(
                f"Failed to parse arguments with shlex: {e}. "
                f"Falling back to simple split."
            )
            return args_str.strip().split()

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
                self.provider_id,
                "No command configured. Set CMD_LLM_COMMAND environment variable "
                "or provide 'command' argument to CommandLlmProvider."
            )

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
                cmd_parts = self._parse_shell_args(cmd)
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

        start_time = time.monotonic()

        try:
            # Run the command with stdin/stdout JSON
            # Use asyncio.to_thread() to avoid blocking event loop
            def run_subprocess() -> subprocess.CompletedProcess:
                return subprocess.run(
                    cmd_list,
                    input=input_json,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    shell=False,  # Explicit: no shell injection
                )

            result = await asyncio.to_thread(run_subprocess)

            duration = time.monotonic() - start_time

            logger.info(
                f"CommandLlmProvider: command completed, "
                f"provider_id={self.provider_id}, exit_status={result.returncode}, "
                f"duration={duration:.2f}s"
            )

            # Check exit status
            if result.returncode != 0:
                stderr_preview = (result.stderr or "")[:500]
                logger.error(
                    f"CommandLlmProvider: command failed with exit code "
                    f"{result.returncode}. stderr: {stderr_preview}"
                )
                raise ProviderError(
                    self.provider_id,
                    f"Command exited with status {result.returncode}: {stderr_preview}"
                )

            # Parse JSON output
            stdout_text = result.stdout.strip()
            if not stdout_text:
                raise ProviderError(
                    self.provider_id,
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
                    self.provider_id,
                    f"Command returned invalid JSON: {e}"
                )

            # Extract edited_prompt from output
            if "edited_prompt" not in output_data:
                logger.error(
                    f"CommandLlmProvider: output missing 'edited_prompt' key. "
                    f"Keys found: {list(output_data.keys())}"
                )
                raise ProviderError(
                    self.provider_id,
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
            duration = time.monotonic() - start_time
            logger.error(
                f"CommandLlmProvider: command timed out after {duration:.2f}s "
                f"(timeout={timeout}s)"
            )
            raise ProviderError(
                self.provider_id,
                f"Command timed out after {timeout} seconds"
            )

        except FileNotFoundError:
            logger.error(
                f"CommandLlmProvider: command not found: {cmd_executable}"
            )
            raise ProviderError(
                self.provider_id,
                f"Command not found: {cmd_executable}. "
                "Ensure the command exists and is executable."
            )

        except PermissionError:
            logger.error(
                f"CommandLlmProvider: permission denied for command: {cmd_executable}"
            )
            raise ProviderError(
                self.provider_id,
                f"Permission denied executing: {cmd_executable}. "
                "Ensure the command has execute permissions."
            )
