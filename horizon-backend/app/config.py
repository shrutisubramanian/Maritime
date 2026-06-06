import os
from dotenv import load_dotenv

# Load environment variables from a .env file into os.environ
load_dotenv()

class Settings:
    """
    Settings class to manage environment configuration for the backend.
    Loads variables explicitly using os.getenv, providing validation 
    for required configurations like database URLs and secrets.
    """
    def __init__(self):
        # Database connection string (e.g., PostgreSQL URL)
        # Required for application startup, so we raise an error if not found.
        self.DATABASE_URL: str = os.getenv("DATABASE_URL", "")
        if not self.DATABASE_URL:
            raise ValueError("DATABASE_URL environment variable is required (e.g., postgresql://user:pass@localhost:5432/db)")
            
        # Security settings for JWT token generation and validation
        self.JWT_SECRET: str = os.getenv("JWT_SECRET", "")
        if not self.JWT_SECRET:
            raise ValueError("JWT_SECRET environment variable is required")
            
        # Optional settings with sensible production-ready defaults
        self.JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "60"))
        self.JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
        
        # Environment mode (development, staging, production)
        self.ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

# Expose a singleton settings object to be imported across the application.
# By instantiating it here, we ensure configuration is loaded only once at startup.
settings = Settings()
