from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from app.core.config import settings
from app.services.broker_base import BrokerError

logger = logging.getLogger(__name__)


class UpstoxError(BrokerError):
    """Raised when Upstox rejects a request or returns an unexpected payload."""


@dataclass
class UpstoxTokenSet:
    access_token: str
    refresh_token: str | None = None
    expires_at: datetime | None = None
    scopes: str | None = None
    user_id: str | None = None
    user_name: str | None = None
    email: str | None = None


@dataclass
class UpstoxProfile:
    user_id: str
    name: str
    email: str | None = None


@dataclass
class UpstoxTrade:
    symbol: str
    trade_date: datetime
    pnl: float = 0.0


@dataclass
class UpstoxSnapshot:
    realized_pnl: float
    unrealized_pnl: float
    trade_count: int
    win_rate: float | None = None
    holdings_value: float = 0.0
    trades: list[UpstoxTrade] = field(default_factory=list)


class UpstoxClient:
    """Thin async wrapper over the Upstox v2 REST API.

    All calls are made server-side so broker tokens never reach the browser.
    """

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
    ):
        self.client_id = client_id or settings.upstox_client_id
        self.client_secret = client_secret or settings.upstox_client_secret
        self.redirect_uri = settings.upstox_redirect_uri
        self.api_base = settings.upstox_api_base.rstrip("/")
        self.auth_base = settings.upstox_auth_base.rstrip("/")

    # -- configuration ----------------------------------------------------
    @property
    def is_configured(self) -> bool:
        """Live mode needs this app's Upstox key and secret (one-time setup)."""
        return bool(self.client_id and self.client_secret)

    # -- oauth ------------------------------------------------------------
    def build_authorization_url(self, state: str, api_base: str | None = None) -> str:
        """Where the browser goes to grant read access to the broker account.

        Sends the trader to Upstox's own login page; the app then reads their
        realised P&L from their positions.
        """
        from urllib.parse import urlencode

        if not self.is_configured:
            raise UpstoxError(
                "Upstox is not set up on this deployment yet. The broker API key "
                "and secret have to be added on the server before traders can "
                "connect.",
                status_code=503,
            )

        query = urlencode(
            {
                "client_id": self.client_id,
                "redirect_uri": self.redirect_uri,
                "response_type": "code",
                "state": state,
            }
        )
        return f"{self.auth_base}/dialog?{query}"

    async def exchange_code(self, code: str) -> UpstoxTokenSet:
        if not self.is_configured:
            raise UpstoxError(
                "Upstox is not set up on this deployment yet, so the authorisation "
                "cannot be completed.",
                status_code=503,
            )

        payload = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
            "grant_type": "authorization_code",
            "code": code,
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                # Upstox expects a form-encoded token request.
                response = await client.post(
                    f"{self.auth_base}/token", data=payload, headers=_FORM
                )
        except httpx.HTTPError as exc:
            raise UpstoxError(f"Could not reach Upstox: {exc}") from exc

        if response.status_code >= 400:
            raise UpstoxError(
                _friendly_error(
                    _safe_json(response),
                    "Upstox rejected the authorisation. Please try again.",
                ),
                status_code=400,
            )

        return _token_from_payload(response.json())

    async def refresh_access_token(self, refresh_token: str) -> UpstoxTokenSet:
        """Upstox v2 has no refresh grant — a stale session must be re-authorised."""
        raise UpstoxError(
            "Your Upstox session has expired. Reconnect the broker to fetch today's P&L.",
            status_code=401,
        )

    # -- data -------------------------------------------------------------
    async def fetch_profile(self, access_token: str) -> UpstoxProfile:
        data = await self._get(access_token, "/user/profile")
        body = data.get("data", data)
        return UpstoxProfile(
            user_id=str(body.get("user_id") or body.get("upstox_user_id") or ""),
            name=str(body.get("user_name") or body.get("name") or body.get("display_name") or ""),
            email=body.get("email"),
        )

    async def fetch_snapshot(self, access_token: str) -> UpstoxSnapshot:
        """Pull realised P&L from the trader's positions.

        Realised P&L is read strictly from positions — holdings are never used
        for the published figure.
        """

        position_rows = await self._get_rows(
            access_token, ("/portfolio/positions", "/portfolio/short-term-positions")
        )
        if not position_rows:
            raise UpstoxError(
                "Upstox returned no positions for today, so there is no realised "
                "P&L to publish yet.",
                status_code=404,
            )

        realized = 0.0
        unrealized = 0.0
        for row in position_rows:
            realized += _as_float(
                row.get("realised", row.get("realised_pnl", row.get("day_realised")))
            )
            unrealized += _as_float(
                row.get("unrealised", row.get("unrealized", row.get("unrealised_pnl")))
            )

        trades = await self._fetch_trades(access_token)

        win_rate: float | None = None
        if trades:
            wins = sum(1 for t in trades if t.pnl > 0)
            win_rate = round((wins / len(trades)) * 100, 2)

        return UpstoxSnapshot(
            realized_pnl=round(realized, 2),
            unrealized_pnl=round(unrealized, 2),
            trade_count=len(trades),
            win_rate=win_rate,
            trades=trades,
        )

    async def _fetch_trades(self, access_token: str) -> list[UpstoxTrade]:
        try:
            rows = await self._get_rows(
                access_token,
                ("/order/trades/get-trades-for-day", "/orders/trades", "/order/trades"),
            )
        except UpstoxError:
            logger.warning("Trade history fetch failed; trade count will be 0")
            return []

        trades: list[UpstoxTrade] = []
        for row in rows:
            traded_at = row.get("trade_timestamp") or row.get("exchange_timestamp")
            parsed = _parse_dt(traded_at)
            trades.append(
                UpstoxTrade(
                    symbol=str(row.get("tradingsymbol") or row.get("symbol") or ""),
                    trade_date=parsed,
                    pnl=_as_float(row.get("pnl")),
                )
            )
        return trades

    async def _get_rows(
        self, access_token: str, paths: tuple[str, ...]
    ) -> list[dict[str, Any]]:
        """Try each known path for a list endpoint, returning the first that works.

        Upstox v2 wraps rows in `data` and then in a named collection
        (`positions`, `trades`, `orders`, ...), so both shapes are unwrapped.
        """
        last_error: UpstoxError | None = None
        for path in paths:
            try:
                data = await self._get(access_token, path)
            except UpstoxError as exc:
                last_error = exc
                continue
            rows = _rows_from_payload(data)
            if rows:
                return rows
            last_error = UpstoxError(f"Upstox returned no rows for {path.lstrip('/')}")
        if last_error is not None and last_error.status_code < 400:
            return []
        raise last_error or UpstoxError("Upstox returned no data")

    async def _get(self, access_token: str, path: str) -> dict[str, Any]:
        headers = {**_JSON, "Authorization": f"Bearer {access_token}"}
        url = f"{self.api_base}{path}"
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                response = await client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            raise UpstoxError(f"Could not reach Upstox: {exc}") from exc

        if response.status_code == 401:
            raise UpstoxError(
                "Your Upstox session has expired. Reconnect the broker to fetch today's P&L.",
                status_code=401,
            )
        if response.status_code >= 400:
            raise UpstoxError(
                _friendly_error(
                    _safe_json(response), f"Upstox could not return {path.lstrip('/')}."
                ),
                detail=_safe_json(response),
            )
        try:
            return response.json()
        except ValueError as exc:
            raise UpstoxError("Upstox returned a malformed response") from exc


_JSON = {"Content-Type": "application/json", "Accept": "application/json"}
_FORM = {"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"}


def _safe_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return response.text[:500]


# Upstox error codes we can turn into something a trader can act on.
_ERROR_HINTS = {
    "UDAPI100016": "The broker rejected this app's credentials. Check the Upstox app key and redirect URL.",
    "UDAPI100060": "Upstox could not find that resource. Check the API key and redirect URL registered in the Upstox developer console.",
    "UDAPI100066": "Your Upstox account has no active segments. Reactivate them in the Upstox app, then try again.",
    "UDAPI100072": "The Upstox authorisation code has already been used. Please connect again.",
}


def _friendly_error(payload: Any, fallback: str) -> str:
    """Turn a raw broker payload into one sentence a trader can act on."""
    if isinstance(payload, dict):
        errors = payload.get("errors")
        if isinstance(errors, list) and errors:
            first = errors[0] if isinstance(errors[0], dict) else {}
            code = str(first.get("errorCode") or first.get("error_code") or "")
            message = str(first.get("message") or "")
            hint = _ERROR_HINTS.get(code)
            if hint:
                return hint
            if message:
                return f"{fallback} ({message})"
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


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _rows_from_payload(payload: Any) -> list[dict[str, Any]]:
    """Unwrap an Upstox v2 response into a list of row dicts.

    Shapes seen in the wild:
      {"data": [ {...} ]}
      {"data": {"positions": [ {...} ], "net": [...]}}
      {"data": {"trades": [...]}} / {"data": {"orders": [...]}}
    """
    body = payload.get("data", payload) if isinstance(payload, dict) else payload
    if isinstance(body, list):
        candidates = [body]
    elif isinstance(body, dict):
        candidates = [
            body[key]
            for key in ("positions", "trades", "orders", "holdings", "items")
            if isinstance(body.get(key), list)
        ]
    else:
        candidates = []

    for candidate in candidates:
        rows = [row for row in candidate if isinstance(row, dict)]
        if rows:
            return rows
    return []


def _token_from_payload(payload: dict[str, Any]) -> UpstoxTokenSet:
    """Upstox v2 wraps the token in `data`."""
    data = payload.get("data", payload) if isinstance(payload, dict) else {}
    if not isinstance(data, dict):
        data = {}
    expires_at: datetime | None = None
    expires_in = data.get("expires_in")
    if expires_in:
        try:
            expires_at = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
        except (TypeError, ValueError):
            expires_at = None
    else:
        # Upstox v2 tokens are valid until 3:30 AM next day; default to 12 hours
        expires_at = datetime.now(timezone.utc) + timedelta(hours=12)
    return UpstoxTokenSet(
        access_token=str(data.get("access_token", "")),
        refresh_token=data.get("refresh_token"),
        expires_at=expires_at,
        scopes=data.get("scope"),
        user_id=str(data["user_id"]) if data.get("user_id") else None,
        user_name=data.get("user_name"),
        email=data.get("email"),
    )
