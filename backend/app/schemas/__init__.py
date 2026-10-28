from __future__ import annotations

import uuid
from datetime import date as date_type
from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field, field_validator

from app.models import PnLSource


def _to_utc(value: datetime | None) -> datetime | None:
    """Timestamps are stored in UTC; SQLite drops the marker, so restore it.

    Without the offset a browser reads them as local time and shows a
    "last synced" that is hours off.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


UtcDateTime = Annotated[datetime, BeforeValidator(_to_utc)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=2, max_length=64)

    @field_validator("password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        if not any(c.isalpha() for c in value):
            raise ValueError("Password must contain at least one letter")
        if not any(c.isdigit() for c in value):
            raise ValueError("Password must contain at least one number")
        return value


class UpdateProfileRequest(BaseModel):
    display_name: str = Field(min_length=2, max_length=64)

    @field_validator("display_name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        clean = value.strip()
        if len(clean) < 2:
            raise ValueError("Display name must be at least 2 characters")
        return clean


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _password_strength(cls, value: str) -> str:
        if not any(c.isalpha() for c in value):
            raise ValueError("Password must contain at least one letter")
        if not any(c.isdigit() for c in value):
            raise ValueError("Password must contain at least one number")
        return value


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    """The refresh token travels in the body, never the query string."""

    refresh_token: str = Field(min_length=10, max_length=512)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class PublicUser(ORMModel):
    user_id: uuid.UUID
    display_name: str
    username: str
    bio: str | None = None
    avatar_seed: str = ""
    created_at: UtcDateTime
    is_verified_publisher: bool = False


class LinkedBrokerOut(ORMModel):
    link_id: uuid.UUID
    broker_name: str
    broker_legal_name: str | None = None
    is_active: bool
    last_synced_at: UtcDateTime | None = None
    created_at: UtcDateTime


class CurrentUser(PublicUser):
    email: EmailStr
    verified_upi_id: str | None = None
    upi_verification_status: str = "UNVERIFIED"
    upi_verified_name: str | None = None
    linked_brokers: list[LinkedBrokerOut] = Field(default_factory=list)
    has_upi_id: bool = False


# --------------------------------------------------------------------------
# Brokers
# --------------------------------------------------------------------------
class BrokerLinkResponse(BaseModel):
    authorization_url: str
    state: str
    broker_name: str | None = None


class BrokerOptionOut(BaseModel):
    """A broker the user can pick when publishing P&L."""

    key: str
    name: str
    status: Literal["available", "coming_soon"]
    detail: str


class BrokerCallbackRequest(BaseModel):
    # Each broker sends a different one-time credential; the route validates
    # the one that belongs to the broker.
    code: str | None = None
    request_token: str | None = None
    auth_token: str | None = None
    state: str


# --------------------------------------------------------------------------
# P&L
# --------------------------------------------------------------------------
class PnLCreateRequest(BaseModel):
    # Support high-volume traders and multi-year cumulative aggregations up to +/- 10 Crore Crore (1 Quadrillion INR)
    net_pnl: float = Field(ge=-1_000_000_000_000_000, le=1_000_000_000_000_000)
    date: date_type | None = None
    notes: str | None = Field(default=None, max_length=280)
    trade_count: int = Field(default=0, ge=0, le=10_000)
    win_rate: float | None = Field(default=None, ge=0, le=100)

    @field_validator("net_pnl")
    @classmethod
    def _not_zero(cls, value: float) -> float:
        if value == 0:
            raise ValueError("P&L cannot be exactly zero")
        return value


class PnLRecordOut(ORMModel):
    record_id: uuid.UUID
    user_id: uuid.UUID
    date: date_type
    net_pnl: float
    is_verified: bool
    broker_source: str | None = None
    source: PnLSource
    trade_count: int = 0
    win_rate: float | None = None
    notes: str | None = None
    manual_net_pnl: float | None = None
    manual_trade_count: int = 0
    has_manual_entry: bool = False
    created_at: UtcDateTime


class PublishItemOut(BaseModel):
    """One individual publish contributing to a day's total.

    Manual entries can be edited and deleted; broker fetches can only be
    deleted (the broker owns the figure). ``legacy`` covers an aggregate
    created before per-source rows existed; it is deletable.
    """

    kind: Literal["manual", "broker", "legacy"]
    id: uuid.UUID
    net_pnl: float
    notes: str | None = None
    trade_count: int = 0
    win_rate: float | None = None
    source: PnLSource
    broker_name: str | None = None
    created_at: UtcDateTime
    can_edit: bool
    can_delete: bool


class PublishDayOut(BaseModel):
    date: date_type
    net_pnl: float
    is_verified: bool
    broker_source: str | None = None
    trade_count: int = 0
    notes: str | None = None
    items: list[PublishItemOut] = Field(default_factory=list)


class PublishHistoryResponse(BaseModel):
    days: list[PublishDayOut]
    total: int
    has_more: bool


class PnLFeedEntry(BaseModel):
    record: PnLRecordOut
    user: PublicUser
    rank: int | None = None


class PnLFeedResponse(BaseModel):
    entries: list[PnLFeedEntry]
    total: int
    has_more: bool


class VerifyPnlResponse(BaseModel):
    status: str
    message: str
    record: PnLRecordOut | None = None
    broker_fetched_pnl: float | None = None
    broker_name: str | None = None


# --------------------------------------------------------------------------
# UPI
# --------------------------------------------------------------------------
class UpiVerifyRequest(BaseModel):
    upi_id: str = Field(min_length=3, max_length=128)
    broker_link_id: uuid.UUID | None = None

    @field_validator("upi_id")
    @classmethod
    def _normalize(cls, value: str) -> str:
        cleaned = value.strip().lower().replace(" ", "")
        if "@" not in cleaned:
            raise ValueError("UPI ID must look like name@bank")
        local, _, handle = cleaned.partition("@")
        if not local or not handle:
            raise ValueError("UPI ID must look like name@bank")
        return cleaned


class UpiVerifyResponse(BaseModel):
    status: str
    upi_id: str
    resolved_name: str | None = None
    can_tip: bool = False
    message: str


class UpiStatus(BaseModel):
    status: str
    upi_id: str | None = None
    resolved_name: str | None = None
    can_tip: bool = False


# --------------------------------------------------------------------------
# Leaderboard / sentiment
# --------------------------------------------------------------------------
class SentimentResponse(BaseModel):
    date: date_type
    net_pnl_total: float
    since_launch_net_pnl: float
    since_launch_verified_pnl: float = 0.0
    since_launch_date: date_type
    trader_count: int
    verified_net_pnl: float
    unverified_net_pnl: float
    verified_count: int
    unverified_count: int
    profitable_count: int
    losing_count: int
    average_pnl: float
    biggest_loss: float
    biggest_gain: float
    updated_at: UtcDateTime


class LeaderboardEntry(BaseModel):
    rank: int
    user: PublicUser
    net_pnl: float
    total_pnl: float = 0.0
    is_verified: bool
    broker_source: str | None = None
    trade_count: int = 0
    record_date: date_type
    note: str | None = None


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntry]
    total: int
    scope: str


# --------------------------------------------------------------------------
# Profiles
# --------------------------------------------------------------------------
class PerformancePoint(BaseModel):
    date: date_type
    net_pnl: float
    is_verified: bool
    cumulative: float


class ProfileStats(BaseModel):
    total_records: int
    total_pnl: float
    verified_pnl: float = 0.0
    verified_records: int = 0
    best_day: float
    worst_day: float
    win_rate: float
    avg_trade_size: float
    max_drawdown: float
    volatility: float
    best_streak: int
    worst_streak: int
    consistency_score: float
    sharpe_like: float


class UserProfileResponse(BaseModel):
    user: PublicUser
    stats: ProfileStats
    timeline: list[PerformancePoint]
    today: PnLRecordOut | None = None
    upi: UpiStatus
    linked_broker: LinkedBrokerOut | None = None
    can_tip: bool = False


class UpiIntentResponse(BaseModel):
    """A pure peer-to-peer UPI intent. We never touch the funds."""
    upi_id: str
    payee_name: str
    amount: float
    note: str
    intent_url: str


class DonateEligibility(BaseModel):
    """Whether a trader can receive a donation and where to send it."""

    eligible: bool
    upi_id: str | None = None
    resolved_name: str | None = None
    reason: str | None = None
