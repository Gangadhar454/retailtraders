from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlparse

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.core.security import new_state_token
from app.models import BrokerName, LinkedBroker, OAuthState, User
from app.schemas import (
    BrokerCallbackRequest,
    BrokerLinkResponse,
    BrokerOptionOut,
    LinkedBrokerOut,
)
from app.services.broker_base import BrokerError
from app.services.angel_one import AngelOneClient, AngelOneTokenSet
from app.services.upstox import UpstoxClient
from app.services.upstox import UpstoxTokenSet
from app.services.zerodha import ZerodhaClient
from app.services.zerodha import ZerodhaTokenSet

router = APIRouter(prefix="/brokers", tags=["brokers"])
logger = logging.getLogger(__name__)

STATE_TTL = timedelta(minutes=15)

# Hosts the app may be served from locally. The broker has to send the browser
# back to the exact origin the user started on, otherwise the session (which
# lives in localStorage) is lost on the way back.
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

# Brokers whose OAuth flow is wired up. The catalogue also lists brokers we
# plan to support so the choice is obvious, not hidden.
def _broker_catalogue() -> list[BrokerOptionOut]:
    return [
        BrokerOptionOut(
            key="upstox",
            name="Upstox",
            status="available",
            detail="Log in with Upstox and read today's realised P&L from your positions.",
        ),
        BrokerOptionOut(
            key="zerodha",
            name="Zerodha",
            status="coming_soon",
            detail="Broker-side P&L import is on the way.",
        ),
        BrokerOptionOut(
            key="groww",
            name="Groww",
            status="coming_soon",
            detail="Broker-side P&L import is on the way.",
        ),
        BrokerOptionOut(
            key="angel_one",
            name="Angel One",
            status="available",
            detail="Connect with Angel One Publisher Login and fetch today's realised P&L.",
        ),
    ]


@router.get("/supported", response_model=list[BrokerOptionOut])
async def supported_brokers() -> list[BrokerOptionOut]:
    """The broker picker for 'Fetch from broker'. Public: no account needed."""
    return _broker_catalogue()


@router.get("/{broker}/authorize", response_model=BrokerLinkResponse)
async def start_broker_link(
    broker: str,
    request: Request,
    user: CurrentUser,
    db: DbSession,
    origin: str | None = Query(default=None),
) -> BrokerLinkResponse:
    """Kick off a broker OAuth dance. The state nonce blocks CSRF.

    `origin` is where the browser is right now; the broker must return the
    user to that same origin or the signed-in session is lost.
    """
    broker_name, client = _resolve_broker(broker)
    state = new_state_token()
    db.add(
        OAuthState(
            state=state,
            user_id=user.user_id,
            redirect_to=f"{_safe_origin(origin)}/settings/brokers/callback",
        )
    )
    await db.flush()

    api_base = str(request.base_url).rstrip("/")
    try:
        authorization_url = client.build_authorization_url(state, api_base)
    except BrokerError as exc:
        state_row = await db.scalar(select(OAuthState).where(OAuthState.state == state))
        if state_row is not None:
            await db.delete(state_row)
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    return BrokerLinkResponse(
        authorization_url=authorization_url,
        state=state,
        broker_name=broker_name.value,
    )


@router.post("/{broker}/callback", response_model=LinkedBrokerOut)
async def broker_callback(
    broker: str, payload: BrokerCallbackRequest, db: DbSession, user: CurrentUser
) -> LinkedBrokerOut:
    broker_name, client = _resolve_broker(broker)
    state_row = await db.scalar(select(OAuthState).where(OAuthState.state == payload.state))
    if state_row is None:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")
    if state_row.user_id != user.user_id:
        raise HTTPException(status_code=403, detail="OAuth state does not match user")

    created_at = state_row.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created_at > STATE_TTL:
        raise HTTPException(status_code=400, detail="OAuth state has expired")

    credential = _callback_credential(broker_name, payload)
    await db.delete(state_row)

    try:
        link = await _link_broker_account(db, user, broker_name, client, credential)
    except BrokerError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    await db.flush()
    return _to_out(link)


@router.get("/angel_one/callback", include_in_schema=False)
async def angel_one_publisher_callback(
    request: Request,
    db: DbSession,
    state: str | None = Query(default=None),
) -> RedirectResponse:
    """Consume Angel One's JWT on the backend and return without it in the URL."""
    frontend_fallback = (
        f"{settings.public_site_url.rstrip('/')}/settings/brokers/callback"
    )
    if not state:
        return _callback_redirect(frontend_fallback, error="invalid_state")

    state_row = await db.scalar(select(OAuthState).where(OAuthState.state == state))
    if state_row is None:
        return _callback_redirect(frontend_fallback, error="invalid_state")

    redirect_to = state_row.redirect_to or frontend_fallback
    created_at = state_row.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created_at > STATE_TTL:
        await db.delete(state_row)
        return _callback_redirect(redirect_to, error="expired")

    user = await db.scalar(select(User).where(User.user_id == state_row.user_id))
    auth_token = request.scope.get("angel_one_auth_token")
    await db.delete(state_row)
    if user is None or not auth_token:
        logger.warning(
            "Angel One callback missing user or auth_token: user=%s, auth_token_present=%s",
            bool(user),
            bool(auth_token),
        )
        return _callback_redirect(redirect_to, error="connection_failed")

    try:
        link = await _link_broker_account(
            db,
            user,
            BrokerName.ANGEL_ONE,
            AngelOneClient(),
            str(auth_token),
        )
    except BrokerError as exc:
        logger.exception("Angel One broker account linking failed: %s", exc)
        return _callback_redirect(redirect_to, error="connection_failed")

    await db.flush()
    return _callback_redirect(redirect_to, connected="1")


@router.get("/", response_model=list[LinkedBrokerOut])
async def list_brokers(user: CurrentUser) -> list[LinkedBrokerOut]:
    return [_to_out(b) for b in user.linked_brokers if b.is_active]


@router.delete(
    "/{link_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def unlink_broker(link_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    link = await db.scalar(
        select(LinkedBroker).where(
            LinkedBroker.link_id == link_id, LinkedBroker.user_id == user.user_id
        )
    )
    if link is None:
        raise HTTPException(status_code=404, detail="Broker link not found")

    link.is_active = False
    link.auth_token = None
    link.refresh_token = None
    link.token_expires_at = None
    await db.flush()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _resolve_broker(
    broker: str,
) -> tuple[BrokerName, UpstoxClient | ZerodhaClient | AngelOneClient]:
    """Map a URL broker key to its enum and API client."""
    key = (broker or "").strip().lower()
    option = next((item for item in _broker_catalogue() if item.key == key), None)
    if option is None:
        raise HTTPException(status_code=404, detail="Unknown broker")
    if option.status != "available":
        raise HTTPException(
            status_code=501, detail=f"{option.name} is not available yet"
        )
    if key == "upstox":
        return BrokerName.UPSTOX, UpstoxClient()
    if key == "zerodha":
        return BrokerName.ZERODHA, ZerodhaClient()
    if key == "angel_one":
        return BrokerName.ANGEL_ONE, AngelOneClient()
    raise HTTPException(status_code=501, detail=f"{option.name} is not available yet")


def _callback_credential(
    broker_name: BrokerName, payload: BrokerCallbackRequest
) -> str:
    """Pick the one-time credential each broker sends back after login."""
    credential = (
        payload.request_token
        if broker_name == BrokerName.ZERODHA
        else payload.auth_token
        if broker_name == BrokerName.ANGEL_ONE
        else payload.code
    )
    if not credential:
        expected = (
            "request_token"
            if broker_name == BrokerName.ZERODHA
            else "auth_token"
            if broker_name == BrokerName.ANGEL_ONE
            else "code"
        )
        raise HTTPException(
            status_code=400,
            detail=f"The broker callback is missing its {expected}",
        )
    return credential


async def _link_broker_account(
    db: DbSession,
    user: User,
    broker_name: BrokerName,
    client: UpstoxClient | ZerodhaClient | AngelOneClient,
    credential: str,
) -> LinkedBroker:
    tokens: UpstoxTokenSet | ZerodhaTokenSet | AngelOneTokenSet = (
        await client.exchange_code(credential)
    )

    legal_name = tokens.user_name
    broker_user_id = tokens.user_id
    if not legal_name or not broker_user_id:
        profile = await client.fetch_profile(tokens.access_token)
        legal_name = legal_name or profile.name
        broker_user_id = broker_user_id or profile.user_id

    existing = await db.scalar(
        select(LinkedBroker).where(
            LinkedBroker.user_id == user.user_id,
            LinkedBroker.broker_name == broker_name,
        )
    )
    if existing:
        existing.auth_token = tokens.access_token
        existing.refresh_token = tokens.refresh_token
        existing.token_expires_at = tokens.expires_at
        existing.scopes = tokens.scopes
        existing.broker_legal_name = legal_name or existing.broker_legal_name
        existing.broker_user_id = broker_user_id or existing.broker_user_id
        existing.is_active = True
        return existing

    link = LinkedBroker(
        link_id=uuid.uuid4(),
        user_id=user.user_id,
        broker_name=broker_name,
        auth_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        token_expires_at=tokens.expires_at,
        scopes=tokens.scopes,
        broker_legal_name=legal_name,
        broker_user_id=broker_user_id,
        is_active=True,
    )
    db.add(link)
    return link


def _callback_redirect(url: str, **params: str) -> RedirectResponse:
    params = {"broker": "angel_one", **params}
    separator = "&" if "?" in url else "?"
    return RedirectResponse(f"{url}{separator}{urlencode(params)}", status_code=303)


def _safe_origin(raw: str | None) -> str:
    """The app origin the broker may send the browser back to.

    Only the configured site and local development hosts are allowed, so the
    OAuth round trip cannot be turned into an open redirect.
    """
    fallback = settings.public_site_url.rstrip("/")
    if not raw:
        return fallback
    try:
        parsed = urlparse(raw)
    except ValueError:
        return fallback
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return fallback
    host = parsed.hostname.lower()
    allowed = LOCAL_HOSTS | {(urlparse(fallback).hostname or "").lower()}
    if host not in allowed:
        return fallback
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _to_out(link: LinkedBroker) -> LinkedBrokerOut:
    return LinkedBrokerOut(
        link_id=link.link_id,
        broker_name=str(link.broker_name.value)
        if hasattr(link.broker_name, "value")
        else str(link.broker_name),
        broker_legal_name=link.broker_legal_name,
        is_active=link.is_active,
        last_synced_at=link.last_synced_at,
        created_at=link.created_at,
    )
