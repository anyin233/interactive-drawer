"""MCP client manager for communicating with the excalidraw-mcp subprocess."""

import logging
from contextlib import AsyncExitStack
from pathlib import Path

from mcp import types as mcp_types
from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client

logger = logging.getLogger(__name__)

# Resolve the project root (three levels up from this file: services -> app -> backend)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


class McpManager:
    """Manages a singleton MCP subprocess (excalidraw-mcp via stdio).

    Handles lifecycle (start/stop), tool discovery, and tool invocation
    against the MCP server running as a child process.
    """

    def __init__(self) -> None:
        self._session: ClientSession | None = None
        self._exit_stack: AsyncExitStack | None = None
        self._tools: list[mcp_types.Tool] = []

    async def start(self) -> None:
        """Start the MCP subprocess and initialise the client session.

        Spawns `node {project_root}/excalidraw-mcp/dist/index.js --stdio`
        and establishes a JSON-RPC session over stdin/stdout.
        """
        self._exit_stack = AsyncExitStack()

        mcp_script = str(_PROJECT_ROOT / "excalidraw-mcp" / "dist" / "index.js")
        server_params = StdioServerParameters(
            command="node",
            args=[mcp_script, "--stdio"],
        )

        # Enter the stdio_client context to get read/write streams
        read_stream, write_stream = await self._exit_stack.enter_async_context(
            stdio_client(server_params)
        )

        # Create and initialise the MCP client session
        self._session = await self._exit_stack.enter_async_context(
            ClientSession(read_stream, write_stream)
        )
        await self._session.initialize()

        # Cache the initial tool list
        result = await self._session.list_tools()
        self._tools = result.tools
        logger.info("MCP session started with %d tools available", len(self._tools))

    async def stop(self) -> None:
        """Stop the MCP subprocess and release all resources."""
        if self._exit_stack is not None:
            await self._exit_stack.aclose()
            self._exit_stack = None
        self._session = None
        self._tools = []
        logger.info("MCP session stopped")

    async def get_openai_tools(self) -> list[dict]:
        """Convert cached MCP tools to OpenAI function calling format.

        MCP tool schema:
            name, description, inputSchema

        OpenAI function calling format:
            {"type": "function", "function": {"name": ..., "description": ..., "parameters": ...}}

        Returns:
            A list of tool definitions in the OpenAI function calling format.
        """
        # Refresh tools from the session in case they changed
        if self._session is not None:
            result = await self._session.list_tools()
            self._tools = result.tools

        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description or "",
                    "parameters": tool.inputSchema,
                },
            }
            for tool in self._tools
        ]

    async def call_tool(self, name: str, arguments: dict) -> str:
        """Call an MCP tool and return the text result.

        Args:
            name: The name of the MCP tool to invoke.
            arguments: A dictionary of arguments to pass to the tool.

        Returns:
            Concatenated text from all TextContent items in the result.

        Raises:
            RuntimeError: If the MCP tool reports an error (isError=True).
            Exception: If the underlying MCP call raises an exception.
        """
        if self._session is None:
            raise RuntimeError("MCP session is not started")

        result = await self._session.call_tool(name, arguments)

        # Concatenate all text content from the result
        text_parts = [
            item.text
            for item in result.content
            if isinstance(item, mcp_types.TextContent)
        ]
        combined_text = "".join(text_parts)

        # Raise if the MCP server flagged an error
        if result.isError:
            raise RuntimeError(combined_text)

        return combined_text
