import sqlite3
conn = sqlite3.connect('netpnl.db')
cur = conn.cursor()
try:
    cur.execute('SELECT version_num FROM alembic_version')
    print('Alembic version:', cur.fetchone())
except Exception as e:
    print('No alembic_version table:', e)
try:
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    print('Tables:', [r[0] for r in cur.fetchall()])
except Exception as e:
    print('Error:', e)
conn.close()
