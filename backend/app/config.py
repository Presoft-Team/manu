from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment configuration. Compose injects these; .env covers local runs."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://mes:mes@localhost:5432/mes"
    cors_origins: str = "http://localhost:5173,http://localhost:4173"
    # Creates tables on boot. Swap to Alembic migrations before any real deployment.
    auto_create_tables: bool = True

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
