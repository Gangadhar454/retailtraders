from __future__ import annotations

import uuid
from datetime import date, timezone
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import LinkedBroker, PnLRecord, User, UserFollow
from app.schemas import FollowUserOut, UserCardResponse


async def get_follow_counts(db: AsyncSession, user_id: uuid.UUID) -> tuple[int, int]:
    """Return (followers_count, following_count) for a given user."""
    followers_count = await db.scalar(
        select(func.count(UserFollow.id)).where(UserFollow.following_id == user_id)
    ) or 0
    following_count = await db.scalar(
        select(func.count(UserFollow.id)).where(UserFollow.follower_id == user_id)
    ) or 0
    return int(followers_count), int(following_count)


async def is_following(
    db: AsyncSession, follower_id: uuid.UUID | None, following_id: uuid.UUID
) -> bool:
    """Check if follower_id is following following_id."""
    if not follower_id or follower_id == following_id:
        return False
    row = await db.scalar(
        select(UserFollow.id).where(
            UserFollow.follower_id == follower_id,
            UserFollow.following_id == following_id,
        )
    )
    return row is not None


async def follow_user(
    db: AsyncSession, follower_id: uuid.UUID, following_id: uuid.UUID
) -> tuple[bool, int, int]:
    """Follow a user. Idempotent: if already followed, returns current counts."""
    if follower_id == following_id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")

    existing = await db.scalar(
        select(UserFollow).where(
            UserFollow.follower_id == follower_id,
            UserFollow.following_id == following_id,
        )
    )
    if not existing:
        new_follow = UserFollow(follower_id=follower_id, following_id=following_id)
        db.add(new_follow)
        await db.commit()

    followers_cnt, following_cnt = await get_follow_counts(db, following_id)
    return True, followers_cnt, following_cnt


async def unfollow_user(
    db: AsyncSession, follower_id: uuid.UUID, following_id: uuid.UUID
) -> tuple[bool, int, int]:
    """Unfollow a user. Idempotent."""
    existing = await db.scalar(
        select(UserFollow).where(
            UserFollow.follower_id == follower_id,
            UserFollow.following_id == following_id,
        )
    )
    if existing:
        await db.delete(existing)
        await db.commit()

    followers_cnt, following_cnt = await get_follow_counts(db, following_id)
    return False, followers_cnt, following_cnt


async def _enrich_follow_users(
    db: AsyncSession,
    users: list[User],
    viewer_id: uuid.UUID | None,
) -> list[FollowUserOut]:
    """Enrich a list of User models with total_pnl, is_verified_publisher, and is_following."""
    if not users:
        return []

    user_ids = [u.user_id for u in users]

    # Batch total PnL
    pnl_rows = (
        await db.execute(
            select(
                PnLRecord.user_id,
                func.coalesce(func.sum(PnLRecord.net_pnl), 0.0).label("total_pnl"),
            )
            .where(PnLRecord.user_id.in_(user_ids))
            .group_by(PnLRecord.user_id)
        )
    ).all()
    pnl_map = {row.user_id: round(float(row.total_pnl), 2) for row in pnl_rows}

    # Batch verified brokers
    broker_rows = (
        await db.scalars(
            select(LinkedBroker.user_id)
            .where(
                LinkedBroker.user_id.in_(user_ids),
                LinkedBroker.is_active.is_(True),
            )
        )
    ).all()
    verified_publishers = set(broker_rows)

    # Batch is_following if viewer logged in
    viewer_following = set()
    if viewer_id:
        followed_rows = (
            await db.scalars(
                select(UserFollow.following_id).where(
                    UserFollow.follower_id == viewer_id,
                    UserFollow.following_id.in_(user_ids),
                )
            )
        ).all()
        viewer_following = set(followed_rows)

    out: list[FollowUserOut] = []
    for u in users:
        out.append(
            FollowUserOut(
                user_id=u.user_id,
                username=u.username,
                display_name=u.display_name,
                avatar_seed=u.avatar_seed or u.username,
                bio=u.bio,
                created_at=u.created_at,
                is_verified_publisher=u.user_id in verified_publishers,
                total_pnl=pnl_map.get(u.user_id, 0.0),
                is_following=u.user_id in viewer_following,
                is_self=viewer_id == u.user_id if viewer_id else False,
            )
        )
    return out


async def get_followers(
    db: AsyncSession,
    target_user_id: uuid.UUID,
    viewer_id: uuid.UUID | None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[FollowUserOut], int]:
    """Get list of users following target_user_id."""
    total = (
        await db.scalar(
            select(func.count(UserFollow.id)).where(
                UserFollow.following_id == target_user_id
            )
        )
        or 0
    )

    rows = (
        await db.scalars(
            select(User)
            .join(UserFollow, UserFollow.follower_id == User.user_id)
            .where(
                UserFollow.following_id == target_user_id,
                User.is_active.is_(True),
            )
            .order_by(UserFollow.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()

    users_out = await _enrich_follow_users(db, list(rows), viewer_id)
    return users_out, int(total)


async def get_following(
    db: AsyncSession,
    target_user_id: uuid.UUID,
    viewer_id: uuid.UUID | None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[FollowUserOut], int]:
    """Get list of users whom target_user_id is following."""
    total = (
        await db.scalar(
            select(func.count(UserFollow.id)).where(
                UserFollow.follower_id == target_user_id
            )
        )
        or 0
    )

    rows = (
        await db.scalars(
            select(User)
            .join(UserFollow, UserFollow.following_id == User.user_id)
            .where(
                UserFollow.follower_id == target_user_id,
                User.is_active.is_(True),
            )
            .order_by(UserFollow.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()

    users_out = await _enrich_follow_users(db, list(rows), viewer_id)
    return users_out, int(total)


async def get_user_card(
    db: AsyncSession, username: str, viewer_id: uuid.UUID | None
) -> UserCardResponse:
    """Fetch short profile data for a user hovercard."""
    user = await db.scalar(
        select(User)
        .options(selectinload(User.linked_brokers))
        .where(User.username == username.lower())
    )
    if user is None or not user.is_active:
        raise HTTPException(status_code=404, detail="Trader not found")

    # Aggregate stats
    pnl_stats = (
        await db.execute(
            select(
                func.coalesce(func.sum(PnLRecord.net_pnl), 0.0).label("total_pnl"),
                func.coalesce(func.sum(PnLRecord.trade_count), 0).label("total_trades"),
            ).where(PnLRecord.user_id == user.user_id)
        )
    ).one()

    # Most recent day record
    latest_record = await db.scalar(
        select(PnLRecord)
        .where(PnLRecord.user_id == user.user_id)
        .order_by(PnLRecord.date.desc())
        .limit(1)
    )

    followers_count, following_count = await get_follow_counts(db, user.user_id)
    is_following_user = await is_following(db, viewer_id, user.user_id)
    is_self = viewer_id == user.user_id if viewer_id else False
    is_verified_pub = any(b.is_active for b in user.linked_brokers)

    return UserCardResponse(
        user_id=user.user_id,
        username=user.username,
        display_name=user.display_name,
        avatar_seed=user.avatar_seed or user.username,
        bio=user.bio,
        created_at=user.created_at,
        is_verified_publisher=is_verified_pub,
        total_pnl=round(float(pnl_stats.total_pnl), 2),
        today_pnl=round(float(latest_record.net_pnl), 2) if latest_record else None,
        trade_count=int(pnl_stats.total_trades),
        followers_count=followers_count,
        following_count=following_count,
        is_following=is_following_user,
        is_self=is_self,
    )
