import asyncio
import os
import sys

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from sqlalchemy import text
from app.core.database import engine
from app.core.security import encrypt_token, is_encrypted_token


async def main():
    print("Checking linked_brokers table for unencrypted tokens...")
    migrated_count = 0
    already_encrypted_count = 0

    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                "SELECT link_id, auth_token, refresh_token FROM linked_brokers "
                "WHERE auth_token IS NOT NULL OR refresh_token IS NOT NULL"
            )
        )
        rows = result.fetchall()
        print(f"Found {len(rows)} linked broker records with non-null tokens.")

        for row in rows:
            link_id, raw_auth, raw_refresh = row[0], row[1], row[2]
            needs_update = False
            new_auth = raw_auth
            new_refresh = raw_refresh

            if raw_auth:
                if not is_encrypted_token(raw_auth):
                    new_auth = encrypt_token(raw_auth)
                    needs_update = True
                else:
                    already_encrypted_count += 1

            if raw_refresh:
                if not is_encrypted_token(raw_refresh):
                    new_refresh = encrypt_token(raw_refresh)
                    needs_update = True
                else:
                    already_encrypted_count += 1

            if needs_update:
                await conn.execute(
                    text(
                        "UPDATE linked_brokers SET auth_token = :auth, refresh_token = :refresh "
                        "WHERE link_id = :lid"
                    ),
                    {"auth": new_auth, "refresh": new_refresh, "lid": str(link_id)},
                )
                migrated_count += 1

    print(
        f"[DONE] Migration complete! Migrated: {migrated_count} records to Fernet encryption. "
        f"Already encrypted: {already_encrypted_count} tokens."
    )


if __name__ == "__main__":
    asyncio.run(main())

