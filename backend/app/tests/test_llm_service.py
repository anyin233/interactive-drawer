"""Tests for the LLM client factory in app.services.llm_service."""

from unittest.mock import patch, MagicMock

from app.models.schemas import ApiConfig


class TestCreateLlmClient:
    """Tests for create_llm_client()."""

    @patch("app.services.llm_service.AsyncOpenAI")
    def test_creates_client_with_config(self, mock_async_openai_cls):
        """Verify AsyncOpenAI is instantiated with the correct base_url and api_key
        from the provided ApiConfig.
        """
        mock_instance = MagicMock()
        mock_async_openai_cls.return_value = mock_instance

        config = ApiConfig(
            base_url="https://api.example.com/v1",
            api_key="sk-test-key-123",
            model="gpt-4o",
        )

        from app.services.llm_service import create_llm_client

        client = create_llm_client(config)

        mock_async_openai_cls.assert_called_once_with(
            base_url="https://api.example.com/v1",
            api_key="sk-test-key-123",
        )
        assert client is mock_instance
