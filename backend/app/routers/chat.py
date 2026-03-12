"""SSE chat endpoint that streams LLM + MCP tool loop events."""

import json

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.main import mcp_manager
from app.models.schemas import ChatRequest
from app.services.llm_service import create_llm_client
from app.services.tool_loop import tool_loop

router = APIRouter()


@router.post("/api/chat")
async def chat(request: ChatRequest):
    """SSE endpoint: streams LLM + MCP tool loop events.

    Accepts a ChatRequest with messages and API config, creates an LLM client,
    and returns a server-sent event stream of tool loop events.

    Args:
        request: The chat request containing conversation history and API config.

    Returns:
        An EventSourceResponse streaming SSE events from the tool loop.
    """
    client = create_llm_client(request.config)
    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    async def event_generator():
        """Wrap the tool_loop output into SSE-compatible dicts."""
        async for event in tool_loop(client, request.config.model, messages, mcp_manager):
            yield {"event": event["event"], "data": json.dumps(event["data"])}

    return EventSourceResponse(event_generator())
