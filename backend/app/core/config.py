from pydantic_settings import BaseSettings

# Version del motor. El `version=` de FastAPI estaba escrito a mano y se quedo en
# 1.14.2 mientras el producto iba en 1.19.0: /docs y la cabecera de la API mentian
# sobre que motor esta corriendo, que es justo lo que se mira cuando algo falla en
# una maquina ajena. `tests/test_version.py` la ata a frontend/package.json.
ENGINE_VERSION = "1.22.0"

class Settings(BaseSettings):
    APP_NAME: str = "PDF Master Engine"
    DEBUG: bool = False
    API_PORT: int = 8745
    MAX_FILE_SIZE_MB: int = 500
    RENDER_DPI: int = 150

settings = Settings()
