from supabase import create_client, Client
from config import settings

def get_supabase_client() -> Client:
    """Create a fresh Supabase client per request to avoid HTTP/2 connection pooling issues."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
