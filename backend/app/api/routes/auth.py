from __future__ import annotations

import re
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models import LinkedBroker, User
from app.schemas import (
    CurrentUser as CurrentUserSchema,
    LinkedBrokerOut,
    RefreshRequest,
    TokenPair,
    UserLoginRequest,
    UserRegisterRequest,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_USERNAME_RE = re.compile(r"^[a-z0-9_]{3,24}$")
_RESERVED = {"admin", "root", "support", "help", "api", "netpnl", "me", "u"}


def _normalise_username(display_name: str) -> str:
    """Derive a public handle from the display name.

    The handle is what appears on the public profile URL, so it is generated
    server-side and de-duplicated rather than chosen by the user.
    """
    base = re.sub(r"[^a-z0-9_]", "", display_name.lower().replace(" ", "_"))
    base = base[:20] or "trader"
    if len(base) < 3:
        base = f"{base}_trader"
    return base


async def _unique_username(db: DbSession, base: str) -> str:
    if base in _RESERVED:
        base = f"{base}_trader"
    candidate = base
    for _ in range(10):
        exists = await db.scalar(select(User.user_id).where(User.username == candidate))
        if not exists:
            return candidate
        candidate = f"{base[:18]}_{secrets.token_hex(2)}"
    return f"trader_{secrets.token_hex(4)}"


def _token_pair(user: User) -> TokenPair:
    subject = str(user.user_id)
    return TokenPair(
        access_token=create_access_token(subject, {"username": user.username}),
        refresh_token=create_refresh_token(subject),
        expires_in=settings.access_token_expire_minutes * 60,
    )


def _public_user(user: User) -> CurrentUserSchema:
    brokers = [
        LinkedBrokerOut(
            link_id=b.link_id,
            broker_name=b.broker_name,
            broker_legal_name=b.broker_legal_name,
            is_active=b.is_active,
            last_synced_at=b.last_synced_at,
            created_at=b.created_at,
        )
        for b in user.linked_brokers
    ]
    return CurrentUserSchema(
        user_id=user.user_id,
        email=user.email,
        display_name=user.display_name,
        username=user.username,
        bio=user.bio,
        avatar_seed=user.avatar_seed,
        created_at=user.created_at,
        verified_upi_id=user.verified_upi_id,
        upi_verification_status=user.upi_verification_status,
        upi_verified_name=user.upi_verified_name,
        linked_brokers=brokers,
        has_upi_id=bool(user.verified_upi_id),
        is_verified_publisher=any(b.is_active for b in user.linked_brokers),
    )


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegisterRequest, db: DbSession) -> TokenPair:
    email = payload.email.lower().strip()

    existing = await db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists",
        )

    user = User(
        user_id=uuid.uuid4(),
        email=email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip(),
        username="",
        avatar_seed=secrets.token_hex(2),
    )
    user.username = await _unique_username(db, _normalise_username(user.display_name))

    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email or username is already taken",
        ) from exc

    return _token_pair(user)


@router.post("/login", response_model=TokenPair)
async def login(payload: UserLoginRequest, db: DbSession) -> TokenPair:
    email = payload.email.lower().strip()
    user = await db.scalar(select(User).where(User.email == email))

    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been disabled")

    user.last_login_at = datetime.now(timezone.utc)
    return _token_pair(user)


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: RefreshRequest, db: DbSession) -> TokenPair:
    claims = decode_token(payload.refresh_token, "refresh")
    if not claims:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    try:
        user_id = uuid.UUID(str(claims.get("sub")))
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from exc

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    return _token_pair(user)


@router.get("/me", response_model=CurrentUserSchema)
async def me(user: CurrentUser) -> CurrentUserSchema:
    return _public_user(user)  # type: ignore[return-value]
