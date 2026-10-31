from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.exists() else ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Core -------------------------------------------------------------
    app_name: str = "NetPnL"
    environment: Literal["local", "staging", "production"] = "local"
    debug: bool = True
    api_prefix: str = "/api/v1"

    # --- Database ---------------------------------------------------------
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/netpnl"
    )
    auto_create_tables: bool = True
    sql_echo: bool = False

    # --- Security ---------------------------------------------------------
    secret_key: str = Field(default="dev-secret-change-me-in-production")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    refresh_token_expire_days: int = 30

    # --- CORS -------------------------------------------------------------
    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # --- Upstox -----------------------------------------------------------
    upstox_client_id: str = ""
    upstox_client_secret: str = ""
    upstox_redirect_uri: str = "http://localhost:3000/settings/brokers/callback"
    upstox_api_base: str = "https://api.upstox.com/v2"
    # Upstox v2 OAuth lives under /v2/login/authorization (dialog + token).
    upstox_auth_base: str = "https://api.upstox.com/v2/login/authorization"

    # --- Zerodha (Kite Connect v3) ----------------------------------------
    zerodha_api_key: str = ""
    zerodha_api_secret: str = ""
    zerodha_redirect_uri: str = "http://localhost:3000/settings/brokers/callback"
    zerodha_api_base: str = "https://api.kite.trade"
    zerodha_login_base: str = "https://kite.zerodha.com"

    # --- Angel One SmartAPI -----------------------------------------------
    angel_one_api_key: str = ""
    angel_one_redirect_uri: str = ""
    angel_one_api_base: str = "https://apiconnect.angelone.in"
    angel_one_login_base: str = "https://smartapi.angelone.in/publisher-login"
    angel_one_client_local_ip: str = ""
    angel_one_client_public_ip: str = ""
    angel_one_mac_address: str = ""

    # --- UPI penny drop (Cashfree / Razorpay) -----------------------------
    upi_provider: Literal["cashfree", "razorpay", "mock"] = "mock"
    cashfree_client_id: str = ""
    cashfree_client_secret: str = ""
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    penny_drop_amount: int = 1
    penny_drop_max_attempts: int = 3

    # --- Public site metadata --------------------------------------------
    public_site_url: str = "http://localhost:3000"
    # Where this API is reachable from a browser (used for mock broker consent).
    api_public_url: str = "http://127.0.0.1:8010"
    site_name: str = "NetPnL"

    # --- Background sync --------------------------------------------------
    sync_enabled: bool = True
    sync_interval_minutes: int = 30

    # --- Admin Console & Market Simulation --------------------------------
    admin_username: str = "admin"
    admin_password: str = "admin123"
    simulation_enabled: bool = True
    simulation_all_hours: bool = False
    simulation_interval_minutes: int = 1
    simulation_interval_min_seconds: int = 30
    simulation_interval_max_seconds: int = 60

    @field_validator("database_url", mode="after")
    @classmethod
    def _normalize_sqlite_path(cls, value: str) -> str:
        if value.startswith("sqlite+aiosqlite:///./"):
            rel_file = value.replace("sqlite+aiosqlite:///./", "")
            abs_path = (_BACKEND_DIR / rel_file).as_posix()
            return f"sqlite+aiosqlite:///{abs_path}"
        return value

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            return [item.strip() for item in raw.split(",") if item.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
