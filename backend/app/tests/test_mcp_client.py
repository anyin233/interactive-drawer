"""Tests for the McpManager service in app.services.mcp_client."""

import pytest
from unittest.mock import AsyncMock

from mcp import types as mcp_types

from app.services.mcp_client import McpManager


class TestGetOpenaiTools:
    """Tests for McpManager.get_openai_tools()."""

    async def test_get_openai_tools_converts_mcp_format(self, mock_mcp_session):
        """MCP tool schema should be converted to OpenAI function calling format.

        MCP tool has: name, description, inputSchema
        OpenAI expects: {"type": "function", "function": {"name": ..., "description": ..., "parameters": ...}}
        """
        manager = McpManager()
        manager._session = mock_mcp_session

        tools = await manager.get_openai_tools()

        assert len(tools) == 1
        tool = tools[0]

        # Top-level structure
        assert tool["type"] == "function"
        assert "function" in tool

        # Function fields mapped from MCP tool
        func = tool["function"]
        assert func["name"] == "draw_rectangle"
        assert func["description"] == "Draw a rectangle on the canvas"
        assert func["parameters"] == {
            "type": "object",
            "properties": {
                "x": {"type": "number"},
                "y": {"type": "number"},
                "width": {"type": "number"},
                "height": {"type": "number"},
            },
            "required": ["x", "y", "width", "height"],
        }

    async def test_get_openai_tools_multiple_tools(self, mock_mcp_session):
        """Multiple MCP tools should all be converted."""
        tool_a = mcp_types.Tool(
            name="tool_a",
            description="Tool A",
            inputSchema={"type": "object", "properties": {}},
        )
        tool_b = mcp_types.Tool(
            name="tool_b",
            description="Tool B",
            inputSchema={"type": "object", "properties": {}},
        )
        mock_mcp_session.list_tools.return_value = mcp_types.ListToolsResult(
            tools=[tool_a, tool_b]
        )

        manager = McpManager()
        manager._session = mock_mcp_session

        tools = await manager.get_openai_tools()

        assert len(tools) == 2
        names = {t["function"]["name"] for t in tools}
        assert names == {"tool_a", "tool_b"}

    async def test_get_openai_tools_empty_list(self, mock_mcp_session):
        """An empty tool list from MCP should yield an empty OpenAI tool list."""
        mock_mcp_session.list_tools.return_value = mcp_types.ListToolsResult(tools=[])

        manager = McpManager()
        manager._session = mock_mcp_session

        tools = await manager.get_openai_tools()

        assert tools == []


class TestCallTool:
    """Tests for McpManager.call_tool()."""

    async def test_call_tool_returns_text(self, mock_mcp_session):
        """call_tool should return concatenated text content from the MCP result."""
        manager = McpManager()
        manager._session = mock_mcp_session

        result = await manager.call_tool("draw_rectangle", {"x": 0, "y": 0, "width": 100, "height": 50})

        assert result == "Rectangle drawn successfully"
        mock_mcp_session.call_tool.assert_called_once_with("draw_rectangle", {"x": 0, "y": 0, "width": 100, "height": 50})

    async def test_call_tool_concatenates_multiple_text_contents(self, mock_mcp_session):
        """When multiple TextContent items are returned, they should be concatenated."""
        mock_mcp_session.call_tool.return_value = mcp_types.CallToolResult(
            content=[
                mcp_types.TextContent(type="text", text="Part 1. "),
                mcp_types.TextContent(type="text", text="Part 2."),
            ],
            isError=False,
        )

        manager = McpManager()
        manager._session = mock_mcp_session

        result = await manager.call_tool("some_tool", {})

        assert result == "Part 1. Part 2."

    async def test_call_tool_handles_error(self, mock_mcp_session):
        """When the MCP call_tool raises an exception, it should propagate."""
        mock_mcp_session.call_tool.side_effect = Exception("MCP connection lost")

        manager = McpManager()
        manager._session = mock_mcp_session

        with pytest.raises(Exception, match="MCP connection lost"):
            await manager.call_tool("broken_tool", {})

    async def test_call_tool_handles_mcp_error_flag(self, mock_mcp_session):
        """When the MCP result has isError=True, call_tool should raise RuntimeError."""
        mock_mcp_session.call_tool.return_value = mcp_types.CallToolResult(
            content=[mcp_types.TextContent(type="text", text="Something went wrong")],
            isError=True,
        )

        manager = McpManager()
        manager._session = mock_mcp_session

        with pytest.raises(RuntimeError, match="Something went wrong"):
            await manager.call_tool("failing_tool", {})
