from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]
TokenDep = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    db: DbSession,
    credentials: TokenDep,
) -> User:
    if credentials is None or not credentials.credentials:
        raise CREDENTIALS_ERROR

    payload = decode_token(credentials.credentials, "access")
    if not payload:
        raise CREDENTIALS_ERROR

    subject = payload.get("sub")
    if not subject:
        raise CREDENTIALS_ERROR

    try:
        user_id = uuid.UUID(subject)
    except ValueError as exc:
        raise CREDENTIALS_ERROR from exc

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise CREDENTIALS_ERROR
    return user


async def get_optional_user(
    db: DbSession,
    credentials: TokenDep,
) -> User | None:
    if credentials is None or not credentials.credentials:
        return None
    try:
        return await get_current_user(db, credentials)
    except HTTPException:
        return None


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


async def user_by_username(db: AsyncSession, username: str) -> User:
    result = await db.execute(select(User).where(User.username == username.lower()))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Trader not found")
    return user
