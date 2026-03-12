"""Tests for Pydantic model validation in app.models.schemas."""

import pytest
from pydantic import ValidationError

from app.models.schemas import ApiConfig, ChatRequest, Message


class TestMessage:
    """Tests for the Message Pydantic model."""

    def test_valid_message(self):
        """A Message with role='user' and content='hello' should be valid."""
        msg = Message(role="user", content="hello")

        assert msg.role == "user"
        assert msg.content == "hello"
        assert msg.tool_call_id is None
        assert msg.tool_calls is None

    def test_valid_message_all_roles(self):
        """Messages with any of the four allowed roles should be valid."""
        for role in ("user", "assistant", "system", "tool"):
            msg = Message(role=role, content="test")
            assert msg.role == role

    def test_valid_message_with_tool_call_id(self):
        """A tool Message can carry a tool_call_id."""
        msg = Message(role="tool", content="result", tool_call_id="call_abc123")

        assert msg.tool_call_id == "call_abc123"

    def test_valid_message_with_tool_calls(self):
        """An assistant Message can carry tool_calls."""
        tool_calls = [{"id": "call_1", "type": "function", "function": {"name": "draw", "arguments": "{}"}}]
        msg = Message(role="assistant", content="", tool_calls=tool_calls)

        assert msg.tool_calls == tool_calls

    def test_invalid_message_role(self):
        """A Message with an unrecognised role should be rejected."""
        with pytest.raises(ValidationError) as exc_info:
            Message(role="invalid_role", content="hello")

        # Ensure the error relates to the role field
        errors = exc_info.value.errors()
        assert any(err["loc"] == ("role",) for err in errors)


class TestApiConfig:
    """Tests for the ApiConfig Pydantic model."""

    def test_valid_api_config(self):
        """An ApiConfig with base_url, api_key, and model should be valid."""
        config = ApiConfig(
            base_url="https://api.openai.com/v1",
            api_key="sk-test-key-123",
            model="gpt-4o",
        )

        assert config.base_url == "https://api.openai.com/v1"
        assert config.api_key == "sk-test-key-123"
        assert config.model == "gpt-4o"

    def test_api_config_defaults(self):
        """ApiConfig.model should default to 'gpt-4o' when not specified."""
        config = ApiConfig(
            base_url="https://api.openai.com/v1",
            api_key="sk-test-key-123",
        )

        assert config.model == "gpt-4o"

    def test_api_config_custom_model(self):
        """ApiConfig.model should accept a custom value."""
        config = ApiConfig(
            base_url="https://custom.api/v1",
            api_key="sk-custom",
            model="claude-3-opus",
        )

        assert config.model == "claude-3-opus"

    def test_api_config_missing_required_fields(self):
        """ApiConfig without base_url or api_key should be rejected."""
        with pytest.raises(ValidationError):
            ApiConfig(api_key="sk-test")  # missing base_url

        with pytest.raises(ValidationError):
            ApiConfig(base_url="https://api.openai.com/v1")  # missing api_key


class TestChatRequest:
    """Tests for the ChatRequest Pydantic model."""

    def test_valid_chat_request(self):
        """A ChatRequest with messages and config should be valid."""
        request = ChatRequest(
            messages=[
                Message(role="user", content="Draw a circle"),
            ],
            config=ApiConfig(
                base_url="https://api.openai.com/v1",
                api_key="sk-test-key",
            ),
        )

        assert len(request.messages) == 1
        assert request.messages[0].role == "user"
        assert request.config.base_url == "https://api.openai.com/v1"
        assert request.config.model == "gpt-4o"  # default

    def test_chat_request_multiple_messages(self):
        """A ChatRequest can carry multiple messages forming a conversation."""
        request = ChatRequest(
            messages=[
                Message(role="system", content="You are a drawing assistant."),
                Message(role="user", content="Draw a square"),
                Message(role="assistant", content="Sure, I'll draw a square."),
            ],
            config=ApiConfig(
                base_url="https://api.openai.com/v1",
                api_key="sk-test-key",
            ),
        )

        assert len(request.messages) == 3

    def test_chat_request_missing_messages(self):
        """A ChatRequest without messages should be rejected."""
        with pytest.raises(ValidationError):
            ChatRequest(
                config=ApiConfig(
                    base_url="https://api.openai.com/v1",
                    api_key="sk-test-key",
                ),
            )

    def test_chat_request_missing_config(self):
        """A ChatRequest without config should be rejected."""
        with pytest.raises(ValidationError):
            ChatRequest(
                messages=[Message(role="user", content="hello")],
            )
