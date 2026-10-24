"""Remove leftover end-to-end test accounts from the local dev database.

Run:  .\.venv\Scripts\python.exe tests\cleanup_e2e.py
"""

import sqlite3
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "netpnl.db"

TABLES = ("pnl_records", "linked_brokers", "upi_verifications", "oauth_states")


def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    cur.execute(
        "SELECT user_id FROM users "
        "WHERE username LIKE 'e2e_%' OR email LIKE 'e2e.%@example.com'"
    )
    ids = [row[0] for row in cur.fetchall()]

    for user_id in ids:
        for table in TABLES:
            try:
                cur.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
            except sqlite3.Error:
                pass
        cur.execute("DELETE FROM users WHERE user_id = ?", (user_id,))

    conn.commit()

    cur.execute("SELECT username, email FROM users ORDER BY username")
    remaining = cur.fetchall()
    conn.close()

    print(f"removed {len(ids)} e2e accounts")
    print(f"remaining users: {len(remaining)}")
    for username, email in remaining:
        print(f"  @{username}  {email}")


if __name__ == "__main__":
    main()
