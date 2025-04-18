import os
from pathlib import Path
from dotenv import load_dotenv

# Get the project root directory (parent of chronosServer)
PROJECT_ROOT = Path(__file__).parent.parent

# Load environment variables from the root .env file
dotenv_path = os.path.join(PROJECT_ROOT, ".env")
load_dotenv(dotenv_path)

# Simple settings class without pydantic to avoid validation issues
class Settings:
    def __init__(self):
        # Read directly from environment variables
        self.SUPABASE_URL = os.getenv('VITE_SUPABASE_URL')
        self.SUPABASE_KEY = os.getenv('VITE_SUPABASE_ANON_KEY')
        self.JWT_SECRET = os.getenv('JWT_SECRET', 'your_secure_jwt_secret')  # Default value if not provided

settings = Settings()
