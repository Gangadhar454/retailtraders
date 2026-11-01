import asyncio
import os
import sys
import uuid

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.core.database import Base
from app.core.security import decrypt_token, encrypt_token, is_encrypted_token
from app.models import BrokerName, LinkedBroker, User


async def test_unit_encryption():
    print("=== Running Token Encryption Unit Tests ===")

    # 1. Null / empty handling
    assert encrypt_token(None) is None
    assert encrypt_token("") == ""
    assert decrypt_token(None) is None
    assert decrypt_token("") == ""
    print("[PASS] None and empty string handling")

    # 2. Round-trip encryption and decryption
    token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sometokenpayload.signature12345"
    encrypted = encrypt_token(token)
    assert encrypted is not None
    assert encrypted != token
    assert encrypted.startswith("gAAAAA")
    assert is_encrypted_token(encrypted) is True
    assert is_encrypted_token(token) is False

    decrypted = decrypt_token(encrypted)
    assert decrypted == token
    print("[PASS] Round-trip encrypt & decrypt")

    # 3. Idempotency (double encrypt returns same ciphertext without nested wrapping)
    double_encrypted = encrypt_token(encrypted)
    assert double_encrypted == encrypted
    print("[PASS] Double-encryption prevention (idempotent)")

    # 4. Graceful legacy fallback on plaintext
    legacy_token = "raw_plaintext_broker_token_abcdef"
    decrypted_legacy = decrypt_token(legacy_token)
    assert decrypted_legacy == legacy_token
    print("[PASS] Legacy plaintext fallback without errors")

    # 5. Tampered ciphertext gracefully falls back without crashing
    tampered = "gAAAAAB" + "x" * 50
    decrypted_tampered = decrypt_token(tampered)
    assert decrypted_tampered == tampered
    print("[PASS] Tampered ciphertext graceful fallback")


async def test_orm_linked_broker_encryption():
    print("\n=== Running LinkedBroker ORM Integration Tests ===")
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)

    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(test_engine, expire_on_commit=False)

    user_id = uuid.uuid4()
    link_id = uuid.uuid4()
    sample_auth = "upstox_access_token_super_secret_999"
    sample_refresh = "upstox_refresh_token_super_secret_888"

    # Step A: Insert a LinkedBroker via ORM
    async with session_factory() as session:
        user = User(
            user_id=user_id,
            email="trader@retailtraders.in",
            password_hash="fakehash",
            display_name="Trader One",
            username="trader1",
        )
        broker = LinkedBroker(
            link_id=link_id,
            user_id=user_id,
            broker_name=BrokerName.UPSTOX,
            auth_token=sample_auth,
            refresh_token=sample_refresh,
            is_active=True,
        )
        session.add(user)
        session.add(broker)
        await session.commit()
    print("[PASS] LinkedBroker saved with tokens")

    # Step B: Verify the RAW SQL row in the DB is encrypted and not plaintext
    async with test_engine.connect() as conn:
        res = await conn.execute(
            text("SELECT link_id, auth_token, refresh_token FROM linked_brokers")
        )
        raw_row = res.fetchone()
        assert raw_row is not None
        stored_link_id = raw_row[0]
        raw_auth_in_db = raw_row[1]
        raw_refresh_in_db = raw_row[2]

        assert raw_auth_in_db != sample_auth
        assert raw_auth_in_db.startswith("gAAAAA")
        assert raw_refresh_in_db != sample_refresh
        assert raw_refresh_in_db.startswith("gAAAAA")
        print(f"[PASS] Raw DB column is encrypted Fernet ciphertext: {raw_auth_in_db[:25]}...")

    # Step C: Load via ORM and verify transparent decryption
    async with session_factory() as session:
        loaded = await session.scalar(
            select(LinkedBroker).where(LinkedBroker.link_id == link_id)
        )
        assert loaded is not None
        assert loaded.auth_token == sample_auth
        assert loaded.refresh_token == sample_refresh
        print("[PASS] ORM query transparently returns decrypted plaintext tokens")

        # Step D: Update token via ORM and verify it re-encrypts
        new_auth = "new_refreshed_access_token_111"
        loaded.auth_token = new_auth
        await session.commit()

    async with test_engine.connect() as conn:
        res = await conn.execute(
            text("SELECT auth_token FROM linked_brokers WHERE link_id = :lid"),
            {"lid": stored_link_id},
        )
        raw_updated = res.fetchone()[0]
        assert raw_updated != new_auth
        assert raw_updated.startswith("gAAAAA")
        print("[PASS] Updated token is automatically encrypted at rest in DB")

    # Step E: Unlink / clear tokens
    async with session_factory() as session:
        loaded = await session.scalar(
            select(LinkedBroker).where(LinkedBroker.link_id == link_id)
        )
        loaded.auth_token = None
        loaded.refresh_token = None
        await session.commit()

    async with test_engine.connect() as conn:
        res = await conn.execute(
            text(
                "SELECT auth_token, refresh_token FROM linked_brokers WHERE link_id = :lid"
            ),
            {"lid": stored_link_id},
        )
        cleared_row = res.fetchone()
        assert cleared_row[0] is None
        assert cleared_row[1] is None
        print("[PASS] Clearing tokens stores NULL in DB")

    # Step F: Backwards compatibility with legacy unencrypted DB rows
    legacy_lid = uuid.uuid4()
    # Insert via ORM User first, then raw legacy broker row
    async with test_engine.connect() as conn:
        await conn.execute(
            text(
                "INSERT INTO linked_brokers (link_id, user_id, broker_name, auth_token, refresh_token, is_active, is_simulated, created_at) "
                "VALUES (:lid, :uid, 'ANGEL_ONE', 'raw-legacy-token', 'raw-legacy-refresh', 1, 0, CURRENT_TIMESTAMP)"
            ),
            {"lid": legacy_lid.hex if isinstance(stored_link_id, str) and len(stored_link_id) == 32 else str(legacy_lid), "uid": raw_row[0]},
        )
        await conn.commit()

    async with session_factory() as session:
        legacy_broker = await session.scalar(
            select(LinkedBroker).where(LinkedBroker.link_id == legacy_lid)
        )
        assert legacy_broker is not None
        assert legacy_broker.auth_token == "raw-legacy-token"
        assert legacy_broker.refresh_token == "raw-legacy-refresh"
        print("[PASS] Legacy unencrypted rows load safely without errors")

        # Update legacy row and verify it encrypts
        legacy_broker.auth_token = "upgraded-token"
        await session.commit()

    async with test_engine.connect() as conn:
        res = await conn.execute(
            text("SELECT auth_token FROM linked_brokers WHERE link_id = :lid"),
            {"lid": legacy_lid.hex if isinstance(stored_link_id, str) and len(stored_link_id) == 32 else str(legacy_lid)},
        )
        upgraded_raw = res.fetchone()[0]
        assert upgraded_raw.startswith("gAAAAA")
        print("[PASS] Upgraded legacy row is now securely encrypted")

    print("\n>>> ALL TESTS PASSED! <<<")


async def main():
    await test_unit_encryption()
    await test_orm_linked_broker_encryption()


if __name__ == "__main__":
    asyncio.run(main())
