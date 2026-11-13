from __future__ import annotations

import uuid
from typing import Sequence
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PostReaction

VALID_REACTIONS: set[str] = {"thumbsup", "heart", "wow", "sad", "care"}


async def get_reactions_for_records(
    db: AsyncSession,
    record_ids: Sequence[uuid.UUID],
    client_id: str | None = None,
) -> tuple[dict[uuid.UUID, dict[str, int]], dict[uuid.UUID, list[str]]]:
    """Batch fetch reaction counts and active reactions for a list of record IDs.

    Returns:
        (reactions_by_record_id, user_reactions_by_record_id)
    """
    clean_ids = [rid for rid in record_ids if rid is not None]
    if not clean_ids:
        return {}, {}

    # 1. Aggregated counts per reaction type
    counts_query = (
        select(
            PostReaction.record_id,
            PostReaction.reaction_type,
            func.count(PostReaction.id).label("count"),
        )
        .where(PostReaction.record_id.in_(clean_ids))
        .group_by(PostReaction.record_id, PostReaction.reaction_type)
    )
    count_rows = (await db.execute(counts_query)).all()

    reactions_map: dict[uuid.UUID, dict[str, int]] = {rid: {} for rid in clean_ids}
    for rid, rtype, cnt in count_rows:
        reactions_map[rid][rtype] = int(cnt)

    # 2. Reactions from this client if client_id is given
    user_reactions_map: dict[uuid.UUID, list[str]] = {rid: [] for rid in clean_ids}
    if client_id:
        user_query = select(PostReaction.record_id, PostReaction.reaction_type).where(
            PostReaction.record_id.in_(clean_ids),
            PostReaction.client_id == client_id,
        )
        user_rows = (await db.execute(user_query)).all()
        for rid, rtype in user_rows:
            user_reactions_map[rid].append(rtype)

    return reactions_map, user_reactions_map


async def get_reaction_summary(
    db: AsyncSession,
    record_id: uuid.UUID,
    client_id: str | None = None,
) -> tuple[dict[str, int], list[str]]:
    """Fetch reaction counts and client reactions for a single record."""
    reactions_map, user_map = await get_reactions_for_records(
        db, [record_id], client_id
    )
    return reactions_map.get(record_id, {}), user_map.get(record_id, [])


async def toggle_reaction(
    db: AsyncSession,
    record_id: uuid.UUID,
    reaction_type: str,
    client_id: str,
) -> tuple[dict[str, int], list[str]]:
    """Toggle a reaction for a given client_id.

    If present: removes it (un-reacts).
    If absent: creates it.
    Returns the updated reaction summary (counts, user_reactions).
    """
    if reaction_type not in VALID_REACTIONS:
        raise ValueError(f"Invalid reaction_type '{reaction_type}'. Allowed: {sorted(VALID_REACTIONS)}")

    existing = await db.scalar(
        select(PostReaction).where(
            PostReaction.record_id == record_id,
            PostReaction.client_id == client_id,
            PostReaction.reaction_type == reaction_type,
        )
    )

    if existing is not None:
        await db.delete(existing)
    else:
        new_reaction = PostReaction(
            record_id=record_id,
            client_id=client_id,
            reaction_type=reaction_type,
        )
        db.add(new_reaction)

    await db.commit()

    return await get_reaction_summary(db, record_id, client_id)
