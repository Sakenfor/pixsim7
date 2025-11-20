"""
LLM Provider Abstraction

Unified interface for different LLM providers (Anthropic, OpenAI, local models)
"""
import os
import time
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import logging

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

from pixsim7.backend.main.services.llm.models import LLMRequest, LLMResponse, LLMProvider

logger = logging.getLogger(__name__)


class BaseLLMProvider(ABC):
    """Base class for LLM providers"""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    @abstractmethod
    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Generate text from prompt"""
        pass

    @abstractmethod
    def get_default_model(self) -> str:
        """Get default model for this provider"""
        pass

    @abstractmethod
    def estimate_cost(self, usage: Dict[str, int]) -> float:
        """Estimate cost in USD based on token usage"""
        pass


class AnthropicProvider(BaseLLMProvider):
    """Anthropic Claude provider"""

    def __init__(self, api_key: Optional[str] = None):
        super().__init__(api_key)

        if not ANTHROPIC_AVAILABLE:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")

        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")

        self.client = anthropic.Anthropic(api_key=self.api_key)

    def get_default_model(self) -> str:
        return "claude-sonnet-4-20250514"

    def estimate_cost(self, usage: Dict[str, int]) -> float:
        """
        Estimate cost for Anthropic Claude
        Pricing (as of 2025):
        - Claude Sonnet 4: $3.00/M input, $15.00/M output
        """
        input_tokens = usage.get("input_tokens", 0)
        output_tokens = usage.get("output_tokens", 0)

        # Pricing per million tokens
        input_cost = (input_tokens / 1_000_000) * 3.00
        output_cost = (output_tokens / 1_000_000) * 15.00

        return input_cost + output_cost

    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Generate text using Anthropic Claude"""
        start_time = time.time()

        # Use specified model or default
        model = request.model or self.get_default_model()

        # Build message request
        messages = [{"role": "user", "content": request.prompt}]

        # Call Claude API
        try:
            response = self.client.messages.create(
                model=model,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                system=request.system_prompt or "",
                top_p=request.top_p,
                stop_sequences=request.stop_sequences or [],
                messages=messages
            )

            # Extract text
            text = response.content[0].text

            # Get usage stats
            usage = {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens
            }

            # Calculate cost
            estimated_cost = self.estimate_cost(usage)

            generation_time_ms = (time.time() - start_time) * 1000

            return LLMResponse(
                text=text,
                provider=LLMProvider.ANTHROPIC,
                model=model,
                cached=False,  # Will be set by cache layer
                cache_key=None,
                usage=usage,
                estimated_cost=estimated_cost,
                generation_time_ms=generation_time_ms,
                metadata=request.metadata
            )

        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            raise


class OpenAIProvider(BaseLLMProvider):
    """OpenAI provider (GPT-4, GPT-3.5, etc.)"""

    def __init__(self, api_key: Optional[str] = None):
        super().__init__(api_key)

        if not OPENAI_AVAILABLE:
            raise ImportError("openai package not installed. Run: pip install openai")

        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY not set")

        self.client = openai.AsyncOpenAI(api_key=self.api_key)

    def get_default_model(self) -> str:
        return "gpt-4-turbo-preview"

    def estimate_cost(self, usage: Dict[str, int]) -> float:
        """
        Estimate cost for OpenAI
        Pricing (as of 2025):
        - GPT-4 Turbo: $10.00/M input, $30.00/M output
        - GPT-3.5 Turbo: $0.50/M input, $1.50/M output
        """
        input_tokens = usage.get("prompt_tokens", 0)
        output_tokens = usage.get("completion_tokens", 0)

        # Simplified pricing (GPT-4 Turbo)
        input_cost = (input_tokens / 1_000_000) * 10.00
        output_cost = (output_tokens / 1_000_000) * 30.00

        return input_cost + output_cost

    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Generate text using OpenAI"""
        start_time = time.time()

        model = request.model or self.get_default_model()

        # Build messages
        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.append({"role": "user", "content": request.prompt})

        try:
            response = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
                stop=request.stop_sequences
            )

            text = response.choices[0].message.content

            usage = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            }

            estimated_cost = self.estimate_cost(usage)
            generation_time_ms = (time.time() - start_time) * 1000

            return LLMResponse(
                text=text,
                provider=LLMProvider.OPENAI,
                model=model,
                cached=False,
                cache_key=None,
                usage=usage,
                estimated_cost=estimated_cost,
                generation_time_ms=generation_time_ms,
                metadata=request.metadata
            )

        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            raise


class LocalLLMProvider(BaseLLMProvider):
    """
    Local LLM provider (Ollama, llama.cpp, etc.)
    Placeholder for future implementation
    """

    def __init__(self, api_key: Optional[str] = None):
        super().__init__(api_key)
        # TODO: Initialize local LLM client
        pass

    def get_default_model(self) -> str:
        return "llama3"

    def estimate_cost(self, usage: Dict[str, int]) -> float:
        # Local models are free
        return 0.0

    async def generate(self, request: LLMRequest) -> LLMResponse:
        raise NotImplementedError("Local LLM provider not yet implemented")


def get_provider(provider_type: LLMProvider, api_key: Optional[str] = None) -> BaseLLMProvider:
    """
    Factory function to get LLM provider

    Args:
        provider_type: Type of provider
        api_key: Optional API key (uses env var if not provided)

    Returns:
        Provider instance
    """
    if provider_type == LLMProvider.ANTHROPIC:
        return AnthropicProvider(api_key)
    elif provider_type == LLMProvider.OPENAI:
        return OpenAIProvider(api_key)
    elif provider_type == LLMProvider.LOCAL:
        return LocalLLMProvider(api_key)
    else:
        raise ValueError(f"Unknown provider type: {provider_type}")
