"""
Tests for CommandLlmProvider

Uses a simple Python script as the command to test the provider's
stdin/stdout JSON communication.
"""
import asyncio
import json
import sys
import pytest


# Import only if running tests with full dependencies
# Skip import errors during syntax checks
try:
    from pixsim7.backend.main.services.llm.adapters import (
        CommandLlmProvider,
        build_edit_prompt_system,
        build_edit_prompt_user,
    )
    from pixsim7.backend.main.shared.errors import ProviderError
    IMPORTS_AVAILABLE = True
except ImportError:
    IMPORTS_AVAILABLE = False


# Python inline script that echoes a valid JSON response
ECHO_SCRIPT = '''
import sys, json
data = json.loads(sys.stdin.read())
response = {"edited_prompt": "Edited: " + data.get("prompt", "")}
print(json.dumps(response))
'''

# Python script that returns invalid JSON
INVALID_JSON_SCRIPT = '''
print("not json at all")
'''

# Python script that exits with error
ERROR_SCRIPT = '''
import sys
print("Something went wrong", file=sys.stderr)
sys.exit(1)
'''

# Python script that times out
TIMEOUT_SCRIPT = '''
import time
time.sleep(10)
'''


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestCommandLlmProvider:
    """Tests for CommandLlmProvider"""

    def test_provider_id(self):
        """Test provider_id property"""
        provider = CommandLlmProvider(command="echo")
        assert provider.provider_id == "cmd-llm"

    @pytest.mark.asyncio
    async def test_edit_prompt_success(self):
        """Test successful prompt editing via command"""
        provider = CommandLlmProvider(
            command=sys.executable,
            args=["-c", ECHO_SCRIPT],
            timeout=10
        )

        result = await provider.edit_prompt(
            model_id="test-model",
            prompt_before="Original prompt",
            context={"style": "cinematic"}
        )

        assert result == "Edited: Original prompt"

    @pytest.mark.asyncio
    async def test_edit_prompt_invalid_json(self):
        """Test handling of invalid JSON output"""
        provider = CommandLlmProvider(
            command=sys.executable,
            args=["-c", INVALID_JSON_SCRIPT],
            timeout=10
        )

        with pytest.raises(ProviderError) as exc_info:
            await provider.edit_prompt(
                model_id="test-model",
                prompt_before="Original prompt"
            )

        assert "invalid JSON" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_edit_prompt_command_error(self):
        """Test handling of command exit with error"""
        provider = CommandLlmProvider(
            command=sys.executable,
            args=["-c", ERROR_SCRIPT],
            timeout=10
        )

        with pytest.raises(ProviderError) as exc_info:
            await provider.edit_prompt(
                model_id="test-model",
                prompt_before="Original prompt"
            )

        assert "exit" in str(exc_info.value).lower() or "status" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_edit_prompt_timeout(self):
        """Test handling of command timeout"""
        provider = CommandLlmProvider(
            command=sys.executable,
            args=["-c", TIMEOUT_SCRIPT],
            timeout=1  # 1 second timeout
        )

        with pytest.raises(ProviderError) as exc_info:
            await provider.edit_prompt(
                model_id="test-model",
                prompt_before="Original prompt"
            )

        assert "timeout" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_edit_prompt_command_not_found(self):
        """Test handling of command not found"""
        provider = CommandLlmProvider(
            command="/nonexistent/command/path",
            timeout=10
        )

        with pytest.raises(ProviderError) as exc_info:
            await provider.edit_prompt(
                model_id="test-model",
                prompt_before="Original prompt"
            )

        assert "not found" in str(exc_info.value).lower()

    def test_no_command_configured(self):
        """Test error when no command is configured"""
        provider = CommandLlmProvider()  # No command provided

        # Should fail when trying to get command parts
        with pytest.raises(ProviderError) as exc_info:
            provider._get_command_parts()

        assert "no command configured" in str(exc_info.value).lower()


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestCommandParsing:
    """Tests for command/argument parsing with shlex"""

    def test_parse_shell_args_simple(self):
        """Test parsing simple space-separated args"""
        provider = CommandLlmProvider(command="echo")
        result = provider._parse_shell_args("arg1 arg2 arg3")
        assert result == ["arg1", "arg2", "arg3"]

    def test_parse_shell_args_quoted(self):
        """Test parsing args with quoted strings"""
        provider = CommandLlmProvider(command="echo")
        result = provider._parse_shell_args('arg1 "arg with spaces" arg3')
        assert result == ["arg1", "arg with spaces", "arg3"]

    def test_parse_shell_args_single_quoted(self):
        """Test parsing args with single quotes"""
        provider = CommandLlmProvider(command="echo")
        result = provider._parse_shell_args("arg1 'arg with spaces' arg3")
        assert result == ["arg1", "arg with spaces", "arg3"]

    def test_parse_shell_args_empty(self):
        """Test parsing empty string"""
        provider = CommandLlmProvider(command="echo")
        result = provider._parse_shell_args("")
        assert result == []

    def test_parse_shell_args_whitespace_only(self):
        """Test parsing whitespace-only string"""
        provider = CommandLlmProvider(command="echo")
        result = provider._parse_shell_args("   ")
        assert result == []

    def test_get_command_parts_with_full_command_string(self):
        """Test parsing a full command string with embedded args"""
        provider = CommandLlmProvider(command='python -c "print(1)"')
        parts = provider._get_command_parts()
        assert parts == ["python", "-c", "print(1)"]

    def test_get_command_parts_with_separate_args(self):
        """Test command with separate args list"""
        provider = CommandLlmProvider(command="python", args=["-c", "print(1)"])
        parts = provider._get_command_parts()
        assert parts == ["python", "-c", "print(1)"]

    def test_get_command_parts_combines_command_and_args(self):
        """Test that command string args and additional args are combined"""
        provider = CommandLlmProvider(
            command='python -m pytest',
            args=["--verbose"]
        )
        parts = provider._get_command_parts()
        assert parts == ["python", "-m", "pytest", "--verbose"]

    @pytest.mark.asyncio
    async def test_edit_prompt_with_full_command_string(self):
        """Test edit_prompt with command string containing args"""
        # Use a full command string instead of separate command and args
        full_cmd = f'{sys.executable} -c "{ECHO_SCRIPT}"'
        provider = CommandLlmProvider(command=full_cmd, timeout=10)

        result = await provider.edit_prompt(
            model_id="test-model",
            prompt_before="Test prompt"
        )

        assert result == "Edited: Test prompt"


@pytest.mark.skipif(not IMPORTS_AVAILABLE, reason="Dependencies not available")
class TestPromptTemplateHelpers:
    """Tests for shared prompt template helper functions"""

    def test_build_edit_prompt_system(self):
        """Test system prompt builder"""
        system_prompt = build_edit_prompt_system()
        assert "video generation" in system_prompt.lower()
        assert "guidelines" in system_prompt.lower()

    def test_build_edit_prompt_user_basic(self):
        """Test user prompt builder with just prompt"""
        user_prompt = build_edit_prompt_user("Test prompt")
        assert "Test prompt" in user_prompt
        assert "refine" in user_prompt.lower()

    def test_build_edit_prompt_user_with_context(self):
        """Test user prompt builder with context"""
        user_prompt = build_edit_prompt_user(
            "Test prompt",
            context={"style": "anime", "duration": 5}
        )
        assert "Test prompt" in user_prompt
        assert "anime" in user_prompt
        assert "5" in user_prompt


if __name__ == "__main__":
    # Allow running tests directly
    pytest.main([__file__, "-v"])
