import os
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).parent.parent
load_dotenv(PROJECT_ROOT / ".env")


class Settings:
    SUPABASE_URL: str = os.getenv("VITE_SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SERVICE_ROLE_KEY", "")
    SUPABASE_CALLBACK_URL: str = os.getenv("SUPABASE_CALLBACK_URL", "http://localhost:8000/auth/callback")
    IS_PRODUCTION: bool = os.getenv("IS_PRODUCTION", "false").lower() == "true"
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5174")
    # Google OAuth client credentials for server-side Google Calendar API calls
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")

settings = Settings()
