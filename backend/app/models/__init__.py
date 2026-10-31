from __future__ import annotations

import enum
import uuid
from datetime import datetime, date, timezone

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Double,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class BrokerName(str, enum.Enum):
    UPSTOX = "Upstox"
    ZERODHA = "Zerodha"
    ANGEL_ONE = "Angel One"


class PnLSource(str, enum.Enum):
    MANUAL = "MANUAL"
    UPSTOX = "UPSTOX"
    ZERODHA = "ZERODHA"
    ANGEL_ONE = "ANGEL_ONE"


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(64), index=True)
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True)

    verified_upi_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    upi_verified_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    upi_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    upi_verification_status: Mapped[str] = mapped_column(
        String(24), default="UNVERIFIED"
    )  # UNVERIFIED | PENDING | VERIFIED | REJECTED

    avatar_seed: Mapped[str] = mapped_column(String(16), default="")
    bio: Mapped[str | None] = mapped_column(String(280), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    linked_brokers: Mapped[list[LinkedBroker]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    pnl_records: Mapped[list[PnLRecord]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )
    broker_pnl_daily: Mapped[list[BrokerPnLDaily]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )


class LinkedBroker(Base):
    __tablename__ = "linked_brokers"

    link_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )
    broker_name: Mapped[str] = mapped_column(
        Enum(BrokerName, name="broker_name_enum"), default=BrokerName.UPSTOX
    )
    broker_legal_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    broker_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    auth_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    scopes: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    user: Mapped[User] = relationship(back_populates="linked_brokers")

    __table_args__ = (
        UniqueConstraint("user_id", "broker_name", name="uq_user_broker"),
    )


class PnLRecord(Base):
    __tablename__ = "pnl_records"

    record_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    net_pnl: Mapped[float] = mapped_column(Double)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    broker_source: Mapped[str | None] = mapped_column(String(64), nullable=True)
    source: Mapped[str] = mapped_column(
        Enum(PnLSource, name="pnl_source_enum"), default=PnLSource.MANUAL
    )
    trade_count: Mapped[int] = mapped_column(Integer, default=0)
    win_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(280), nullable=True)
    shareable_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Manually entered P&L for the day (overrides previous manual entry).
    manual_net_pnl: Mapped[float | None] = mapped_column(Double, nullable=True)
    # Trade count of the manual entry, kept separate from broker-fetched trades.
    manual_trade_count: Mapped[int] = mapped_column(Integer, default=0)
    # True when the user has made a manual entry for this day. Makes the
    # record unverified even if broker-fetched P&L also exists.
    has_manual_entry: Mapped[bool] = mapped_column(Boolean, default=False)
    is_simulated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    user: Mapped[User] = relationship(back_populates="pnl_records")

    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uq_user_pnl_date"),
        Index("ix_pnl_date_verified", "date", "is_verified"),
    )


class BrokerPnLDaily(Base):
    """One row per user per date per broker — each broker's fetched P&L stored
    separately so the daily post can be recomputed as the sum of all sources."""

    __tablename__ = "broker_pnl_daily"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    broker_name: Mapped[str] = mapped_column(
        Enum(BrokerName, name="broker_name_enum"), nullable=False
    )
    net_pnl: Mapped[float] = mapped_column(Double, default=0.0)
    trade_count: Mapped[int] = mapped_column(Integer, default=0)
    win_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    user: Mapped[User] = relationship(back_populates="broker_pnl_daily")

    __table_args__ = (
        UniqueConstraint("user_id", "date", "broker_name", name="uq_broker_pnl_daily"),
    )


class OAuthState(Base):
    """Short-lived CSRF nonces for the broker OAuth dance."""

    __tablename__ = "oauth_states"

    state: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )
    redirect_to: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )


class UpiVerification(Base):
    """Audit trail of penny-drop attempts against a UPI ID."""

    __tablename__ = "upi_verifications"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), index=True
    )
    upi_id: Mapped[str] = mapped_column(String(128))
    provider: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(24))
    resolved_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reference_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )
