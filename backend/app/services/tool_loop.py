"""Async generator that orchestrates the LLM <-> MCP tool-calling loop."""

import json
import logging
from typing import AsyncGenerator

from openai import AsyncOpenAI

from app.services.mcp_client import McpManager

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an Excalidraw diagram assistant.
1. Call read_me first to learn the element format.
2. Use create_view to render diagrams.
3. Describe what you're drawing in natural language."""

MAX_ITERATIONS = 10


async def tool_loop(
    client: AsyncOpenAI,
    model: str,
    messages: list[dict],
    mcp: McpManager,
) -> AsyncGenerator[dict, None]:
    """Run the LLM <-> MCP tool loop, yielding SSE events.

    Repeatedly calls the LLM with the conversation history and available tools.
    When the LLM issues tool_calls, each tool is executed via MCP, the results
    are appended to the conversation, and the loop continues.  When the LLM
    returns a plain text response (finish_reason == "stop"), the text is yielded
    and the loop terminates.

    Special handling: if the tool name is "create_view" and its arguments contain
    an "elements" key, an "elements" event is emitted before the MCP call so
    the frontend can render the diagram immediately.

    Args:
        client: An AsyncOpenAI client to call the LLM.
        model: The model identifier (e.g. "gpt-4o").
        messages: The user-provided conversation history (list of message dicts).
        mcp: The McpManager instance for tool discovery and execution.

    Yields:
        Dicts representing SSE events:
        - {"event": "text", "data": {"content": "..."}}
        - {"event": "elements", "data": {"elements": [...]}}
        - {"event": "tool_start", "data": {"tool": "tool_name"}}
        - {"event": "tool_end", "data": {"tool": "tool_name", "success": true/false}}
        - {"event": "error", "data": {"message": "..."}}
        - {"event": "done", "data": {}}
    """
    tools = await mcp.get_openai_tools()
    logger.debug("Tool loop starting with %d tools: %s", len(tools), [t["function"]["name"] for t in tools])

    # Prepend the system prompt to the conversation
    all_messages = [{"role": "system", "content": SYSTEM_PROMPT}] + messages

    for iteration in range(MAX_ITERATIONS):
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=all_messages,
                tools=tools if tools else None,
            )
        except Exception as e:
            logger.error("LLM API call failed on iteration %d: %s", iteration, e)
            yield {"event": "error", "data": {"message": str(e)}}
            return

        choice = response.choices[0]
        msg = choice.message
        logger.debug("Iteration %d: finish_reason=%s, tool_calls=%s, content_len=%d",
                       iteration, choice.finish_reason, bool(msg.tool_calls), len(msg.content or ""))

        # If the LLM wants to call tools, execute them and loop
        if msg.tool_calls:
            # Append the assistant message (with tool_calls) to the conversation
            all_messages.append(
                {
                    "role": "assistant",
                    "content": msg.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in msg.tool_calls
                    ],
                }
            )

            for tc in msg.tool_calls:
                tool_name = tc.function.name
                try:
                    arguments = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    arguments = {}

                yield {"event": "tool_start", "data": {"tool": tool_name}}

                # Special: extract elements from create_view before sending to MCP
                if tool_name == "create_view" and "elements" in arguments:
                    elements_val = arguments["elements"]
                    # The MCP tool may expect elements as a JSON string;
                    # parse it to an array if needed for the frontend
                    if isinstance(elements_val, str):
                        try:
                            elements_val = json.loads(elements_val)
                        except json.JSONDecodeError:
                            logger.debug("Could not parse elements string")
                            elements_val = []
                    logger.debug("Emitting %d elements to frontend: %s",
                                   len(elements_val) if isinstance(elements_val, list) else 0,
                                   json.dumps(elements_val)[:500])
                    yield {
                        "event": "elements",
                        "data": {"elements": elements_val},
                    }

                try:
                    result = await mcp.call_tool(tool_name, arguments)
                    yield {
                        "event": "tool_end",
                        "data": {"tool": tool_name, "success": True},
                    }
                except Exception as e:
                    logger.debug("Tool %s failed: %s", tool_name, e)
                    result = f"Error: {e}"
                    yield {
                        "event": "tool_end",
                        "data": {"tool": tool_name, "success": False},
                    }

                all_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": result,
                    }
                )

            continue  # Loop back to call LLM again with tool results

        # No tool calls — emit text content and signal completion
        if msg.content:
            yield {"event": "text", "data": {"content": msg.content}}
        yield {"event": "done", "data": {}}
        return

    # Safety: max iterations reached without a final text response
    logger.error("Max tool iterations (%d) reached", MAX_ITERATIONS)
    yield {"event": "error", "data": {"message": "Max tool iterations reached"}}
