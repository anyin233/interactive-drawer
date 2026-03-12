"""Factory for creating OpenAI-compatible async LLM clients."""

from openai import AsyncOpenAI

from app.models.schemas import ApiConfig


def create_llm_client(config: ApiConfig) -> AsyncOpenAI:
    """Create an AsyncOpenAI client from the request's API config.

    Args:
        config: The API configuration containing base_url, api_key, and model.

    Returns:
        An AsyncOpenAI client instance configured with the given base_url and api_key.
    """
    return AsyncOpenAI(base_url=config.base_url, api_key=config.api_key)
