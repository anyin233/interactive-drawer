"""Tests for the tool_loop async generator in app.services.tool_loop."""

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.tool_loop import tool_loop


def _make_text_response(content: str):
    """Build a mock OpenAI completion with a plain text response (no tool calls).

    Args:
        content: The text content of the assistant's reply.

    Returns:
        MagicMock mimicking an OpenAI ChatCompletion object.
    """
    msg = MagicMock()
    msg.content = content
    msg.tool_calls = None

    choice = MagicMock()
    choice.message = msg
    choice.finish_reason = "stop"

    completion = MagicMock()
    completion.choices = [choice]
    return completion


def _make_tool_call_response(tool_name: str, arguments: dict, tool_call_id: str = "tc_1"):
    """Build a mock OpenAI completion with a single tool call.

    Args:
        tool_name: The name of the tool being called.
        arguments: The arguments dict for the tool call.
        tool_call_id: An identifier for the tool call.

    Returns:
        MagicMock mimicking an OpenAI ChatCompletion with tool_calls.
    """
    tc = MagicMock()
    tc.id = tool_call_id
    tc.function.name = tool_name
    tc.function.arguments = json.dumps(arguments)

    msg = MagicMock()
    msg.content = None
    msg.tool_calls = [tc]

    choice = MagicMock()
    choice.message = msg
    choice.finish_reason = "tool_calls"

    completion = MagicMock()
    completion.choices = [choice]
    return completion


async def _collect_events(gen) -> list[dict]:
    """Exhaust an async generator and collect all yielded items.

    Args:
        gen: An async generator yielding dicts.

    Returns:
        List of all yielded dicts.
    """
    events = []
    async for event in gen:
        events.append(event)
    return events


class TestToolLoop:
    """Tests for the tool_loop async generator."""

    async def test_simple_text_response(self, mock_openai_client):
        """When the LLM returns text only, yield text and done events."""
        mcp = AsyncMock()
        mcp.get_openai_tools.return_value = []

        events = await _collect_events(
            tool_loop(mock_openai_client, "gpt-4o", [{"role": "user", "content": "hi"}], mcp)
        )

        assert len(events) == 2
        assert events[0]["event"] == "text"
        assert events[0]["data"]["content"] == "I will draw a rectangle for you."
        assert events[1]["event"] == "done"
        assert events[1]["data"] == {}

    async def test_tool_call_then_text(self):
        """When LLM calls a tool then returns text, yield tool_start, tool_end, text, done."""
        client = AsyncMock()
        # First call: tool call; second call: text response
        client.chat.completions.create.side_effect = [
            _make_tool_call_response("draw_rectangle", {"x": 0, "y": 0}),
            _make_text_response("Here is your rectangle."),
        ]

        mcp = AsyncMock()
        mcp.get_openai_tools.return_value = [{"type": "function", "function": {"name": "draw_rectangle"}}]
        mcp.call_tool.return_value = "Rectangle drawn"

        events = await _collect_events(
            tool_loop(client, "gpt-4o", [{"role": "user", "content": "draw rect"}], mcp)
        )

        event_types = [e["event"] for e in events]
        assert event_types == ["tool_start", "tool_end", "text", "done"]

        # Verify tool_start / tool_end details
        assert events[0]["data"]["tool"] == "draw_rectangle"
        assert events[1]["data"]["tool"] == "draw_rectangle"
        assert events[1]["data"]["success"] is True

        # Verify MCP was called
        mcp.call_tool.assert_called_once_with("draw_rectangle", {"x": 0, "y": 0})

    async def test_create_view_emits_elements(self):
        """When create_view is called with elements arg, yield an elements event."""
        elements_payload = [{"type": "rectangle", "x": 10, "y": 20}]

        client = AsyncMock()
        client.chat.completions.create.side_effect = [
            _make_tool_call_response("create_view", {"elements": elements_payload}),
            _make_text_response("Done!"),
        ]

        mcp = AsyncMock()
        mcp.get_openai_tools.return_value = [{"type": "function", "function": {"name": "create_view"}}]
        mcp.call_tool.return_value = "View created"

        events = await _collect_events(
            tool_loop(client, "gpt-4o", [{"role": "user", "content": "create view"}], mcp)
        )

        event_types = [e["event"] for e in events]
        assert "elements" in event_types

        elements_event = next(e for e in events if e["event"] == "elements")
        assert elements_event["data"]["elements"] == elements_payload

    async def test_max_iterations_safety(self):
        """After MAX_ITERATIONS of continuous tool calls, emit an error event and stop."""
        # Every call returns a tool call, never a text response
        client = AsyncMock()
        client.chat.completions.create.return_value = _make_tool_call_response(
            "some_tool", {"arg": "val"}
        )

        mcp = AsyncMock()
        mcp.get_openai_tools.return_value = [{"type": "function", "function": {"name": "some_tool"}}]
        mcp.call_tool.return_value = "ok"

        events = await _collect_events(
            tool_loop(client, "gpt-4o", [{"role": "user", "content": "loop forever"}], mcp)
        )

        # The last event should be the safety error
        assert events[-1]["event"] == "error"
        assert "Max tool iterations" in events[-1]["data"]["message"]

        # Should have exactly 10 iterations worth of tool_start + tool_end + final error
        tool_start_count = sum(1 for e in events if e["event"] == "tool_start")
        assert tool_start_count == 10

    async def test_llm_error_yields_error_event(self):
        """When the OpenAI API raises an exception, yield an error event."""
        client = AsyncMock()
        client.chat.completions.create.side_effect = Exception("API rate limit exceeded")

        mcp = AsyncMock()
        mcp.get_openai_tools.return_value = []

        events = await _collect_events(
            tool_loop(client, "gpt-4o", [{"role": "user", "content": "fail"}], mcp)
        )

        assert len(events) == 1
        assert events[0]["event"] == "error"
        assert "API rate limit exceeded" in events[0]["data"]["message"]
