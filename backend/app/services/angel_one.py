from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx

from app.core.config import settings
from app.services.broker_base import BrokerError

logger = logging.getLogger(__name__)

try:
    from zoneinfo import ZoneInfo

    IST = ZoneInfo("Asia/Kolkata")
except Exception:  # pragma: no cover - zoneinfo ships with CPython 3.9+
    IST = timezone(timedelta(hours=5, minutes=30))

_EXPIRED_MESSAGE = (
    "Your Angel One session has expired. Reconnect the broker to fetch today's P&L."
)


class AngelOneError(BrokerError):
    """Raised when SmartAPI rejects a request or returns an unexpected payload."""


@dataclass
class AngelOneTokenSet:
    access_token: str
    refresh_token: str | None = None
    expires_at: datetime | None = None
    scopes: str | None = None
    user_id: str | None = None
    user_name: str | None = None
    email: str | None = None


@dataclass
class AngelOneProfile:
    user_id: str
    name: str
    email: str | None = None


@dataclass
class AngelOneTrade:
    symbol: str
    trade_date: datetime
    pnl: float = 0.0


@dataclass
class AngelOneSnapshot:
    realized_pnl: float
    unrealized_pnl: float
    trade_count: int
    win_rate: float | None = None
    holdings_value: float = 0.0
    trades: list[AngelOneTrade] = field(default_factory=list)


class AngelOneClient:
    """Server-side client for Angel One's Publisher Login and SmartAPI."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or settings.angel_one_api_key
        self.redirect_uri = settings.angel_one_redirect_uri
        self.api_base = settings.angel_one_api_base.rstrip("/")
        self.login_base = settings.angel_one_login_base.rstrip("/")

    @property
    def is_configured(self) -> bool:
        redirect = urlparse(self.redirect_uri)
        public_https_redirect = (
            redirect.scheme == "https"
            and redirect.hostname is not None
            and redirect.hostname.lower() not in {"localhost", "127.0.0.1", "::1"}
        )
        return bool(
            self.api_key
            and public_https_redirect
            and settings.angel_one_client_local_ip
            and settings.angel_one_client_public_ip
            and settings.angel_one_mac_address
        )

    def build_authorization_url(self, state: str, api_base: str | None = None) -> str:
        if not self.is_configured:
            raise AngelOneError(
                "Angel One is not configured. Set its SmartAPI key, public HTTPS "
                "backend redirect URL, and server network identity settings. "
                "Localhost callbacks are not supported.",
                status_code=503,
            )
        query = urlencode(
            {
                "api_key": self.api_key,
                "redirect_url": self.redirect_uri,
                "state": state,
            }
        )
        return f"{self.login_base}?{query}"

    async def exchange_code(self, auth_token: str) -> AngelOneTokenSet:
        """Wrap Publisher Login's callback JWT without exposing it to the browser."""
        if not self.is_configured:
            raise AngelOneError("Angel One is not configured.", status_code=503)
        if not auth_token:
            raise AngelOneError(
                "Angel One did not return an authorization token. Please connect again.",
                status_code=400,
            )
        return AngelOneTokenSet(
            access_token=auth_token,
            expires_at=_token_expiry(),
        )

    async def refresh_access_token(self, refresh_token: str) -> AngelOneTokenSet:
        raise AngelOneError(_EXPIRED_MESSAGE, status_code=401)

    async def fetch_profile(self, access_token: str) -> AngelOneProfile:
        payload = await self._get(access_token, "/rest/secure/angelbroking/user/v1/getProfile")
        body = _data_from_payload(payload)
        return AngelOneProfile(
            user_id=str(body.get("clientcode") or body.get("clientCode") or ""),
            name=str(body.get("name") or ""),
            email=body.get("email") or None,
        )

    async def fetch_snapshot(self, access_token: str) -> AngelOneSnapshot:
        payload = await self._get(
            access_token, "/rest/secure/angelbroking/order/v1/getPosition"
        )
        rows = _position_rows(_data_from_payload(payload))
        if not rows:
            raise AngelOneError(
                "Angel One returned no positions for today, so there is no realised "
                "P&L to publish yet.",
                status_code=404,
            )

        realized = sum(_as_float(row.get("realised", row.get("realized"))) for row in rows)
        unrealized = sum(
            _as_float(row.get("unrealised", row.get("unrealized"))) for row in rows
        )
        trades = await self._fetch_trades(access_token)

        return AngelOneSnapshot(
            realized_pnl=round(realized, 2),
            unrealized_pnl=round(unrealized, 2),
            trade_count=len(trades),
            win_rate=None,
            trades=trades,
        )

    async def _fetch_trades(self, access_token: str) -> list[AngelOneTrade]:
        try:
            payload = await self._get(
                access_token, "/rest/secure/angelbroking/order/v1/getTradeBook"
            )
        except AngelOneError:
            logger.warning("Angel One trade book fetch failed; trade count will be 0")
            return []

        body = _data_from_payload(payload)
        rows = body if isinstance(body, list) else []
        return [
            AngelOneTrade(
                symbol=str(row.get("tradingsymbol") or ""),
                trade_date=_parse_trade_time(row.get("filltime")),
            )
            for row in rows
            if isinstance(row, dict)
        ]

    async def _get(self, access_token: str, path: str) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-UserType": "USER",
            "X-SourceID": "WEB",
            "X-ClientLocalIP": settings.angel_one_client_local_ip,
            "X-ClientPublicIP": settings.angel_one_client_public_ip,
            "X-MACAddress": settings.angel_one_mac_address,
            "X-PrivateKey": self.api_key,
        }
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                response = await client.get(f"{self.api_base}{path}", headers=headers)
        except httpx.HTTPError as exc:
            raise AngelOneError(f"Could not reach Angel One: {exc}") from exc

        payload = _safe_json(response)
        if response.status_code == 401 or _is_auth_error(payload):
            raise AngelOneError(_EXPIRED_MESSAGE, status_code=401, detail=payload)
        if response.status_code >= 400 or (
            isinstance(payload, dict) and payload.get("status") is False
        ):
            raise AngelOneError(
                _friendly_error(payload, f"Angel One could not return {path.rsplit('/', 1)[-1]}"),
                detail=payload,
            )
        if not isinstance(payload, dict):
            raise AngelOneError("Angel One returned a malformed response")
        return payload


def _data_from_payload(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return {}
    if payload.get("status") is False:
        raise AngelOneError(_friendly_error(payload, "Angel One rejected the request"))
    return payload.get("data", {})


def _position_rows(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("day", "positions", "net"):
        rows = data.get(key)
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
    return []


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return response.text[:500]


def _is_auth_error(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    code = str(payload.get("errorcode") or "").lower()
    message = str(payload.get("message") or "").lower()
    return any(word in code or word in message for word in ("token", "session", "unauthorized"))


def _friendly_error(payload: Any, fallback: str) -> str:
    if isinstance(payload, dict):
        message = str(payload.get("message") or "").strip()
        if message:
            return f"{fallback} ({message[:160]})"
    elif isinstance(payload, str) and payload.strip():
        return f"{fallback} ({payload.strip()[:160]})"
    return fallback


def _as_float(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _parse_trade_time(value: Any) -> datetime:
    if isinstance(value, str):
        for pattern in ("%H:%M:%S", "%d-%b-%Y %H:%M:%S"):
            try:
                parsed = datetime.strptime(value, pattern)
                if pattern == "%H:%M:%S":
                    parsed = datetime.combine(datetime.now(IST).date(), parsed.time(), IST)
                elif parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=IST)
                return parsed.astimezone(timezone.utc)
            except ValueError:
                continue
    return datetime.now(timezone.utc)


def _token_expiry(now: datetime | None = None) -> datetime:
    current = (now or datetime.now(timezone.utc)).astimezone(IST)
    expiry = datetime.combine(current.date(), time(23, 59, 59), IST)
    if expiry <= current:
        expiry += timedelta(days=1)
    return expiry.astimezone(timezone.utc)