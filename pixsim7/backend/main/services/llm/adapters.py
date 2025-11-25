"""
LLM Provider Adapters - concrete implementations for AI Hub

These adapters implement the LlmProvider protocol for prompt editing operations.
"""
import os
import logging
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
from pixsim7.backend.main.domain import ProviderAccount

logger = logging.getLogger(__name__)


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
        account: ProviderAccount | None = None
    ) -> str:
        """
        Edit prompt using OpenAI

        Args:
            model_id: OpenAI model (e.g., "gpt-4", "gpt-4-turbo")
            prompt_before: Original prompt
            context: Optional context
            account: Optional account (uses API key or env var)

        Returns:
            Edited prompt
        """
        # Get API key from account or environment
        api_key = None
        if account and account.api_key:
            api_key = account.api_key
        else:
            api_key = os.getenv("OPENAI_API_KEY")

        if not api_key:
            raise ProviderAuthenticationError(
                self.provider_id,
                "No API key found. Set OPENAI_API_KEY or configure account."
            )

        try:
            client = openai.AsyncOpenAI(api_key=api_key)

            # Build system prompt for prompt editing
            system_prompt = """You are a video generation prompt expert. Your task is to refine and improve prompts for AI video generation.

Guidelines:
- Keep the core intent and subject matter
- Add specific visual details (lighting, camera angles, motion)
- Use clear, descriptive language
- Keep prompts concise (under 200 words)
- Focus on what should be visible in the video
- Avoid abstract concepts that can't be visualized"""

            # Build user message
            user_message = f"Original prompt:\n{prompt_before}\n\nPlease refine this prompt for better video generation results."

            # Add context if provided
            if context:
                if "style" in context:
                    user_message += f"\n\nDesired style: {context['style']}"
                if "duration" in context:
                    user_message += f"\nVideo duration: {context['duration']}s"

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
        account: ProviderAccount | None = None
    ) -> str:
        """
        Edit prompt using Anthropic Claude

        Args:
            model_id: Claude model (e.g., "claude-sonnet-4")
            prompt_before: Original prompt
            context: Optional context
            account: Optional account (uses API key or env var)

        Returns:
            Edited prompt
        """
        # Get API key from account or environment
        api_key = None
        if account and account.api_key:
            api_key = account.api_key
        else:
            api_key = os.getenv("ANTHROPIC_API_KEY")

        if not api_key:
            raise ProviderAuthenticationError(
                self.provider_id,
                "No API key found. Set ANTHROPIC_API_KEY or configure account."
            )

        try:
            client = anthropic.Anthropic(api_key=api_key)

            # Build system prompt for prompt editing
            system_prompt = """You are a video generation prompt expert. Your task is to refine and improve prompts for AI video generation.

Guidelines:
- Keep the core intent and subject matter
- Add specific visual details (lighting, camera angles, motion)
- Use clear, descriptive language
- Keep prompts concise (under 200 words)
- Focus on what should be visible in the video
- Avoid abstract concepts that can't be visualized"""

            # Build user message
            user_message = f"Original prompt:\n{prompt_before}\n\nPlease refine this prompt for better video generation results."

            # Add context if provided
            if context:
                if "style" in context:
                    user_message += f"\n\nDesired style: {context['style']}"
                if "duration" in context:
                    user_message += f"\nVideo duration: {context['duration']}s"

            # Call Claude API
            response = client.messages.create(
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
        account: ProviderAccount | None = None
    ) -> str:
        """
        Edit prompt using local LLM (not yet implemented)

        Args:
            model_id: Local model name
            prompt_before: Original prompt
            context: Optional context
            account: Not used for local LLM

        Returns:
            Edited prompt
        """
        raise NotImplementedError(
            "Local LLM provider not yet implemented. "
            "Please use 'openai-llm' or 'anthropic-llm'."
        )
