from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Every value can be overridden with an ASSURANCE_* environment variable."""

    model_config = SettingsConfigDict(env_prefix="ASSURANCE_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./assurance.db"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:4173"]
    seed_on_startup: bool = True

    # Scan and evaluation engines are chosen per run from the model registry (/api/models).
    simulated_scan_seconds: float = 6.0
    simulated_eval_seconds: float = 4.0
    azure_attack_objectives: int = 10  # objectives per risk category for the hosted AI Red Teaming Agent
    llm_max_workers: int = 4  # parallel judge calls per evaluation run
    llm_timeout_seconds: float = 120.0
    library_dir: str = "./library"  # test library files (JSONL), at the paths the library items record

    # Header-based role selection is for local development only. Production sits behind Entra ID.
    allow_role_header: bool = True


settings = Settings()
