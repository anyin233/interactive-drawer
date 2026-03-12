"""Pydantic models for the Interactive Drawer API request/response schemas."""

from typing import Literal

from pydantic import BaseModel


class Message(BaseModel):
    """A single message in a chat conversation.

    Args:
        role: The role of the message sender. Must be one of
              "user", "assistant", "system", or "tool".
        content: The text content of the message.
        tool_call_id: Optional identifier linking a tool response to its call.
        tool_calls: Optional list of tool call descriptors (for assistant messages).
    """

    role: Literal["user", "assistant", "system", "tool"]
    content: str
    tool_call_id: str | None = None
    tool_calls: list[dict] | None = None


class ApiConfig(BaseModel):
    """Configuration for connecting to an OpenAI-compatible API.

    Args:
        base_url: The base URL of the API endpoint.
        api_key: The authentication key for the API.
        model: The model identifier to use. Defaults to "gpt-4o".
    """

    base_url: str
    api_key: str
    model: str = "gpt-4o"


class ChatRequest(BaseModel):
    """A request payload for the chat endpoint.

    Args:
        messages: The conversation history as a list of Message objects.
        config: The API configuration specifying which provider/model to use.
    """

    messages: list[Message]
    config: ApiConfig
