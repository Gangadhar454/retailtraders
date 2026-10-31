import asyncio
import os
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from sqlalchemy import text
from app.core.database import engine

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS password_reset_otps (
    otp_id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    otp_hash VARCHAR(128) NOT NULL,
    expires_at DATETIME NOT NULL,
    attempts INT DEFAULT 0,
    is_used BOOLEAN DEFAULT FALSE,
    created_at DATETIME NOT NULL,
    INDEX ix_password_reset_otps_user_id (user_id),
    INDEX ix_password_reset_otps_expires_at (expires_at),
    INDEX ix_password_reset_otps_created_at (created_at),
    CONSTRAINT fk_password_reset_otps_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""

async def main():
    print("Migrating password_reset_otps table on database...")
    async with engine.begin() as conn:
        await conn.execute(text(CREATE_TABLE_SQL))
    print("[OK] Table password_reset_otps created/verified successfully.")

if __name__ == "__main__":
    asyncio.run(main())

