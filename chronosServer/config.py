import os
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).parent
load_dotenv(PROJECT_ROOT / ".env")


class Settings:
    SUPABASE_URL: str = os.getenv("VITE_SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv("VITE_SUPABASE_ANON_KEY", "")
    IS_PRODUCTION: bool = os.getenv("IS_PRODUCTION", "false").lower() == "true"
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5174")
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    CEREBRAS_API_KEY: str = os.getenv("CEREBRAS_KEY", "")
    CEREBRAS_MODEL: str = os.getenv("CEREBRAS_MODEL", "")
    

settings = Settings()
