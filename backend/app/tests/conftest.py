"""Shared test fixtures for the Interactive Drawer backend test suite."""

from unittest.mock import AsyncMock, MagicMock

import pytest
import httpx
from mcp import types as mcp_types


@pytest.fixture
def mock_mcp_session():
    """Create a mock MCP ClientSession with list_tools() and call_tool() methods.

    Returns:
        AsyncMock: A mock session that mimics mcp.client.session.ClientSession.
    """
    session = AsyncMock()

    # Configure list_tools to return a ListToolsResult with sample tools
    sample_tool = mcp_types.Tool(
        name="draw_rectangle",
        description="Draw a rectangle on the canvas",
        inputSchema={
            "type": "object",
            "properties": {
                "x": {"type": "number"},
                "y": {"type": "number"},
                "width": {"type": "number"},
                "height": {"type": "number"},
            },
            "required": ["x", "y", "width", "height"],
        },
    )
    session.list_tools.return_value = mcp_types.ListToolsResult(tools=[sample_tool])

    # Configure call_tool to return a CallToolResult with text content
    text_content = mcp_types.TextContent(type="text", text="Rectangle drawn successfully")
    session.call_tool.return_value = mcp_types.CallToolResult(
        content=[text_content],
        isError=False,
    )

    return session


@pytest.fixture
def mock_openai_client():
    """Create a mock AsyncOpenAI client with chat.completions.create().

    Returns:
        AsyncMock: A mock client that mimics openai.AsyncOpenAI.
    """
    client = AsyncMock()

    # Build a mock chat completion response
    mock_message = MagicMock()
    mock_message.role = "assistant"
    mock_message.content = "I will draw a rectangle for you."
    mock_message.tool_calls = None

    mock_choice = MagicMock()
    mock_choice.message = mock_message
    mock_choice.finish_reason = "stop"

    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]

    client.chat.completions.create.return_value = mock_completion

    return client


@pytest.fixture
async def test_client():
    """Create an httpx AsyncClient for testing the FastAPI application.

    Yields:
        httpx.AsyncClient: An async HTTP client wired to the FastAPI app.
    """
    from app.main import app

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        yield client
