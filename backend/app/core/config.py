from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "PDF Master Engine"
    DEBUG: bool = False
    API_PORT: int = 8745
    MAX_FILE_SIZE_MB: int = 500
    RENDER_DPI: int = 150
    THUMBNAIL_DPI: int = 72

settings = Settings()
