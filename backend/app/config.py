from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://perf_user:perf_pass@localhost:5432/performance_db"
    secret_key: str = "dev-secret-key"
    cors_origins: str = "http://localhost:5173"
    access_token_expire_minutes: int = 60

    class Config:
        env_file = ".env"


settings = Settings()
