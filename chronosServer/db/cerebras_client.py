from config import settings
from cerebras.cloud.sdk import AsyncCerebras, Cerebras


def get_cerebras_client() -> Cerebras:
    return Cerebras(api_key=settings.CEREBRAS_API_KEY)


def get_async_cerebras_client() -> AsyncCerebras:
    return AsyncCerebras(api_key=settings.CEREBRAS_API_KEY)
