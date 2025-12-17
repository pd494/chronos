from config import settings
from cerebras.cloud.sdk import Cerebras
from cerebras.cloud.sdk import Cerebras


def get_cerebras_client() -> Cerebras:
    client = Cerebras(
        api_key = settings.CEREBRAS_API_KEY
    )
    return client
