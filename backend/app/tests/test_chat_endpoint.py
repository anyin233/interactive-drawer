"""Integration tests for the POST /api/chat endpoint."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import httpx

from app.main import app


@pytest.fixture
def valid_chat_body():
    """Return a valid JSON body for the /api/chat endpoint.

    Returns:
        dict: A ChatRequest-compatible payload.
    """
    return {
        "messages": [{"role": "user", "content": "Draw a circle"}],
        "config": {
            "base_url": "https://api.example.com/v1",
            "api_key": "sk-test-123",
            "model": "gpt-4o",
        },
    }


@pytest.fixture
def _patch_mcp_and_llm():
    """Patch the mcp_manager and tool_loop so no real services are invoked.

    Yields an async generator that produces a text event then done.
    """

    async def fake_tool_loop(client, model, messages, mcp):
        """Fake tool_loop that yields a simple text + done sequence."""
        yield {"event": "text", "data": {"content": "Here is your circle."}}
        yield {"event": "done", "data": {}}

    with (
        patch("app.routers.chat.mcp_manager") as mock_mcp,
        patch("app.routers.chat.create_llm_client") as mock_create,
        patch("app.routers.chat.tool_loop", side_effect=fake_tool_loop) as mock_loop,
    ):
        mock_create.return_value = AsyncMock()
        yield mock_mcp, mock_create, mock_loop


class TestChatEndpoint:
    """Integration tests for POST /api/chat."""

    @pytest.mark.usefixtures("_patch_mcp_and_llm")
    async def test_chat_returns_sse_stream(self, valid_chat_body):
        """The response content-type should be text/event-stream."""
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            response = await client.post("/api/chat", json=valid_chat_body)

        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

    async def test_chat_missing_config_returns_422(self):
        """Sending a request without the config field should yield a 422 error."""
        body = {"messages": [{"role": "user", "content": "hello"}]}

        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            response = await client.post("/api/chat", json=body)

        assert response.status_code == 422

    @pytest.mark.usefixtures("_patch_mcp_and_llm")
    async def test_chat_streams_text_events(self, valid_chat_body):
        """SSE events should follow the event: ... / data: ... format."""
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            response = await client.post("/api/chat", json=valid_chat_body)

        body = response.text
        # SSE format: lines starting with "event:" and "data:"
        assert "event: text" in body
        assert "event: done" in body

        # The text event should contain the content as JSON
        # Find the data line following "event: text"
        lines = body.strip().split("\n")
        for i, line in enumerate(lines):
            if line.strip() == "event: text":
                # The next line(s) should have data
                data_line = lines[i + 1].strip()
                assert data_line.startswith("data:")
                payload = json.loads(data_line[len("data:"):].strip())
                assert payload["content"] == "Here is your circle."
                break
        else:
            pytest.fail("No 'event: text' line found in SSE body")
