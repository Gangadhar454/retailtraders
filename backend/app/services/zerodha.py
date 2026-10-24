from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx

from app.core.config import settings
from app.services.broker_base import BrokerError

logger = logging.getLogger(__name__)

try:
    from zoneinfo import ZoneInfo

    IST = ZoneInfo("Asia/Kolkata")
except Exception:  # pragma: no cover - zoneinfo ships with CPython 3.9+
    IST = timezone(timedelta(hours=5, minutes=30))

_TOKEN_MESSAGE = (
    "Your Zerodha session has expired at 6 AM. Reconnect the broker to fetch "
    "today's P&L."
)


class ZerodhaError(BrokerError):
    """Raised when Kite Connect rejects a request or returns an unexpected payload."""


@dataclass
class ZerodhaTokenSet:
    access_token: str
    refresh_token: str | None = None
    expires_at: datetime | None = None
    scopes: str | None = None
    user_id: str | None = None
    user_name: str | None = None
    email: str | None = None


@dataclass
class ZerodhaProfile:
    user_id: str
    name: str
    email: str | None = None


@dataclass
class ZerodhaTrade:
    symbol: str
    trade_date: datetime
    pnl: float = 0.0


@dataclass
class ZerodhaSnapshot:
    realized_pnl: float
    unrealized_pnl: float
    trade_count: int
    win_rate: float | None = None
    holdings_value: float = 0.0
    trades: list[ZerodhaTrade] = field(default_factory=list)


class ZerodhaClient:
    """Thin async wrapper over the Kite Connect v3 REST API.

    All calls are made server-side so the broker access token never reaches the
    browser. Kite sessions expire at 6 AM IST the next day and there is no
    refresh grant for regular apps, so traders re-authorise each morning.
    """

    def __init__(
        self,
        api_key: str | None = None,
        api_secret: str | None = None,
    ):
        self.api_key = api_key or settings.zerodha_api_key
        self.api_secret = api_secret or settings.zerodha_api_secret
        self.redirect_uri = settings.zerodha_redirect_uri
        self.api_base = settings.zerodha_api_base.rstrip("/")
        self.login_base = settings.zerodha_login_base.rstrip("/")

    # -- configuration ----------------------------------------------------
    @property
    def is_configured(self) -> bool:
        """Live mode needs this app's Kite Connect key and secret."""
        return bool(self.api_key and self.api_secret)

    # -- oauth ------------------------------------------------------------
    def build_authorization_url(self, state: str, api_base: str | None = None) -> str:
        """Where the browser goes to grant read access to the broker account.

        Kite echoes ``redirect_params`` back to the registered redirect URL, so
        the CSRF state (and the broker key) survive the round trip even though
        Kite has no top-level ``state`` parameter.
        """
        if not self.is_configured:
            raise ZerodhaError(
                "Zerodha is not set up on this deployment yet. The Kite Connect "
                "API key and secret have to be added on the server before traders "
                "can connect.",
                status_code=503,
            )

        redirect_params = urlencode({"state": state, "broker": "zerodha"})
        query = urlencode(
            {
                "v": "3",
                "api_key": self.api_key,
                "redirect_params": redirect_params,
            }
        )
        return f"{self.login_base}/connect/login?{query}"

    async def exchange_code(self, request_token: str) -> ZerodhaTokenSet:
        if not self.is_configured:
            raise ZerodhaError(
                "Zerodha is not set up on this deployment yet, so the "
                "authorisation cannot be completed.",
                status_code=503,
            )

        checksum = hashlib.sha256(
            f"{self.api_key}{request_token}{self.api_secret}".encode()
        ).hexdigest()
        payload = {
            "api_key": self.api_key,
            "request_token": request_token,
            "checksum": checksum,
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(
                    f"{self.api_base}/session/token", data=payload, headers=_FORM
                )
        except httpx.HTTPError as exc:
            raise ZerodhaError(f"Could not reach Zerodha: {exc}") from exc

        body = _safe_json(response)
        if response.status_code >= 400:
            raise ZerodhaError(
                _friendly_error(
                    body,
                    "Zerodha rejected the authorisation. Please connect again.",
                ),
                status_code=400,
                detail=body,
            )
        if isinstance(body, dict) and body.get("status") == "error":
            raise ZerodhaError(
                _friendly_error(
                    body,
                    "Zerodha rejected the authorisation. Please connect again.",
                ),
                status_code=400,
                detail=body,
            )

        return _token_from_payload(body)

    async def refresh_access_token(self, refresh_token: str) -> ZerodhaTokenSet:
        """Regular Kite Connect apps have no refresh grant; re-auth is required."""
        raise ZerodhaError(_TOKEN_MESSAGE, status_code=401)

    # -- data -------------------------------------------------------------
    async def fetch_profile(self, access_token: str) -> ZerodhaProfile:
        data = await self._get(access_token, "/user/profile")
        body = data.get("data", data)
        return ZerodhaProfile(
            user_id=str(body.get("user_id") or ""),
            name=str(body.get("user_name") or body.get("user_shortname") or ""),
            email=body.get("email"),
        )

    async def fetch_snapshot(self, access_token: str) -> ZerodhaSnapshot:
        """Pull today's realised P&L from the trader's positions.

        Kite's position rows expose ``realised`` (intraday booked P&L) and
        ``unrealised`` separately. Only realised is published; holdings and
        mark-to-market values are never used for the figure.
        """
        data = await self._get(access_token, "/portfolio/positions")
        body = data.get("data", data)
        if not isinstance(body, dict):
            body = {}
        rows = body.get("net") or body.get("day") or []
        rows = [row for row in rows if isinstance(row, dict)]
        if not rows:
            raise ZerodhaError(
                "Zerodha returned no positions for today, so there is no "
                "realised P&L to publish yet.",
                status_code=404,
            )

        realized = sum(_as_float(row.get("realised")) for row in rows)
        unrealized = sum(_as_float(row.get("unrealised")) for row in rows)

        trades = await self._fetch_trades(access_token)

        return ZerodhaSnapshot(
            realized_pnl=round(realized, 2),
            unrealized_pnl=round(unrealized, 2),
            trade_count=len(trades),
            win_rate=None,
            trades=trades,
        )

    async def _fetch_trades(self, access_token: str) -> list[ZerodhaTrade]:
        try:
            data = await self._get(access_token, "/trades")
        except ZerodhaError:
            logger.warning("Zerodha trade book fetch failed; trade count will be 0")
            return []

        body = data.get("data", data)
        rows = body if isinstance(body, list) else []
        trades: list[ZerodhaTrade] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            trades.append(
                ZerodhaTrade(
                    symbol=str(row.get("tradingsymbol") or ""),
                    trade_date=_parse_kite_dt(
                        row.get("fill_timestamp")
                        or row.get("exchange_timestamp")
                        or row.get("order_timestamp")
                    ),
                )
            )
        return trades

    async def _get(self, access_token: str, path: str) -> dict[str, Any]:
        headers = {
            **_JSON,
            "X-Kite-Version": "3",
            "Authorization": f"token {self.api_key}:{access_token}",
        }
        url = f"{self.api_base}{path}"
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                response = await client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            raise ZerodhaError(f"Could not reach Zerodha: {exc}") from exc

        payload = _safe_json(response)
        if response.status_code == 401 or _is_token_error(payload):
            raise ZerodhaError(_TOKEN_MESSAGE, status_code=401, detail=payload)
        if response.status_code >= 400 or (
            isinstance(payload, dict) and payload.get("status") == "error"
        ):
            raise ZerodhaError(
                _friendly_error(
                    payload, f"Zerodha could not return {path.lstrip('/')}."
                ),
                detail=payload,
            )
        if not isinstance(payload, dict):
            raise ZerodhaError("Zerodha returned a malformed response")

        return payload


_JSON = {"Content-Type": "application/json", "Accept": "application/json"}
_FORM = {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return response.text[:500]


def _is_token_error(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    error_type = str(payload.get("error_type") or "").lower()
    message = str(payload.get("message") or "").lower()
    return (
        "token" in error_type
        or "permission" in error_type
        or "access_token" in message
        or "api_key" in message
    )


def _friendly_error(payload: Any, fallback: str) -> str:
    """Turn a raw Kite payload into one sentence a trader can act on."""
    if isinstance(payload, dict):
        message = str(payload.get("message") or "").strip()
        if _is_token_error(payload):
            return _TOKEN_MESSAGE
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


def _parse_kite_dt(value: Any) -> datetime:
    """Kite timestamps carry no offset; they are IST exchange timestamps."""
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            parsed = None
        if parsed is not None:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=IST)
            return parsed.astimezone(timezone.utc)
    return datetime.now(timezone.utc)


def _token_expiry(now: datetime | None = None) -> datetime:
    """Kite access tokens die at 6 AM IST the following day."""
    current = (now or datetime.now(timezone.utc)).astimezone(IST)
    expiry = current.replace(hour=6, minute=0, second=0, microsecond=0)
    if expiry <= current:
        expiry += timedelta(days=1)
    return expiry.astimezone(timezone.utc)


def _token_from_payload(payload: Any) -> ZerodhaTokenSet:
    data = payload.get("data", payload) if isinstance(payload, dict) else {}
    if not isinstance(data, dict):
        data = {}
    access_token = str(data.get("access_token") or "")
    if not access_token:
        raise ZerodhaError(
            "Zerodha did not return an access token. Please connect again.",
            status_code=400,
        )
    return ZerodhaTokenSet(
        access_token=access_token,
        refresh_token=data.get("refresh_token") or None,
        expires_at=_token_expiry(),
        user_id=str(data["user_id"]) if data.get("user_id") else None,
        user_name=data.get("user_name"),
        email=data.get("email"),
    )
