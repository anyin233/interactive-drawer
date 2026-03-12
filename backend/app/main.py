"""FastAPI application entry point for the Interactive Drawer backend."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.services.mcp_client import McpManager

mcp_manager = McpManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle: start/stop the MCP subprocess.

    Args:
        app: The FastAPI application instance.
    """
    await mcp_manager.start()
    yield
    await mcp_manager.stop()


app = FastAPI(title="Interactive Drawer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
from app.routers.chat import router

app.include_router(router)
