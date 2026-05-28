from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import sqlite3


SCHEMA = """
CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    session_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    date_text TEXT NOT NULL,
    location TEXT NOT NULL,
    photographer TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guestbook_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    affiliation TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_visit_counter (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
"""


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class Database:
    def __init__(self, db_path: Path):
        self.db_path = db_path

    @contextmanager
    def connection(self):
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connection() as connection:
            connection.executescript(SCHEMA)
            self._ensure_admin_columns(connection)
            self._ensure_photo_columns(connection)

    def _ensure_admin_columns(self, connection: sqlite3.Connection) -> None:
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(admins)").fetchall()
        }
        if "session_version" not in columns:
            connection.execute(
                "ALTER TABLE admins ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1"
            )

    def _ensure_photo_columns(self, connection: sqlite3.Connection) -> None:
        columns = [
            row["name"]
            for row in connection.execute("PRAGMA table_info(photos)").fetchall()
        ]
        expected_columns = [
            "id",
            "filename",
            "original_name",
            "date_text",
            "location",
            "photographer",
            "created_at",
            "updated_at",
        ]
        if columns == expected_columns:
            return

        if "copyright_text" not in columns and "display_order" not in columns:
            return

        connection.execute("ALTER TABLE photos RENAME TO photos_legacy")
        connection.execute(
            """
            CREATE TABLE photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL UNIQUE,
                original_name TEXT NOT NULL,
                date_text TEXT NOT NULL,
                location TEXT NOT NULL,
                photographer TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            INSERT INTO photos (
                id,
                filename,
                original_name,
                date_text,
                location,
                photographer,
                created_at,
                updated_at
            )
            SELECT
                id,
                filename,
                original_name,
                date_text,
                location,
                photographer,
                created_at,
                updated_at
            FROM photos_legacy
            """
        )
        connection.execute("DROP TABLE photos_legacy")

    def has_admin(self) -> bool:
        with self.connection() as connection:
            row = connection.execute("SELECT COUNT(*) AS total FROM admins").fetchone()
        return bool(row["total"])

    def get_admin(self, username: str) -> sqlite3.Row | None:
        with self.connection() as connection:
            return connection.execute(
                "SELECT * FROM admins WHERE username = ?",
                (username,),
            ).fetchone()

    def create_or_replace_admin(self, username: str, password_hash: str, password_salt: str) -> None:
        timestamp = utc_now_iso()
        with self.connection() as connection:
            existing = connection.execute(
                "SELECT session_version FROM admins ORDER BY id ASC LIMIT 1"
            ).fetchone()
            next_session_version = int(existing["session_version"]) + 1 if existing else 1
            connection.execute("DELETE FROM admins")
            connection.execute(
                """
                INSERT INTO admins (id, username, password_hash, password_salt, session_version, created_at, updated_at)
                VALUES (1, ?, ?, ?, ?, ?, ?)
                """,
                (username, password_hash, password_salt, next_session_version, timestamp, timestamp),
            )

    def update_admin_password(self, username: str, password_hash: str, password_salt: str) -> sqlite3.Row | None:
        timestamp = utc_now_iso()
        with self.connection() as connection:
            connection.execute(
                """
                UPDATE admins
                SET password_hash = ?,
                    password_salt = ?,
                    session_version = session_version + 1,
                    updated_at = ?
                WHERE username = ?
                """,
                (password_hash, password_salt, timestamp, username),
            )
            return connection.execute(
                "SELECT * FROM admins WHERE username = ?",
                (username,),
            ).fetchone()

    def rotate_admin_session_version(self, username: str) -> sqlite3.Row | None:
        timestamp = utc_now_iso()
        with self.connection() as connection:
            connection.execute(
                """
                UPDATE admins
                SET session_version = session_version + 1,
                    updated_at = ?
                WHERE username = ?
                """,
                (timestamp, username),
            )
            return connection.execute(
                "SELECT * FROM admins WHERE username = ?",
                (username,),
            ).fetchone()

    def list_photos(self) -> list[dict]:
        with self.connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM photos
                ORDER BY created_at ASC, id ASC
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def get_photo(self, photo_id: int) -> dict | None:
        with self.connection() as connection:
            row = connection.execute("SELECT * FROM photos WHERE id = ?", (photo_id,)).fetchone()
        return dict(row) if row else None

    def create_photo(
        self,
        *,
        filename: str,
        original_name: str,
        date_text: str,
        location: str,
        photographer: str,
    ) -> dict:
        timestamp = utc_now_iso()
        with self.connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO photos (
                    filename,
                    original_name,
                    date_text,
                    location,
                    photographer,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    filename,
                    original_name,
                    date_text,
                    location,
                    photographer,
                    timestamp,
                    timestamp,
                ),
            )
            photo_id = cursor.lastrowid
            row = connection.execute("SELECT * FROM photos WHERE id = ?", (photo_id,)).fetchone()
        return dict(row)

    def update_photo(
        self,
        photo_id: int,
        *,
        date_text: str,
        location: str,
        photographer: str,
        filename: str | None = None,
        original_name: str | None = None,
    ) -> dict | None:
        current = self.get_photo(photo_id)
        if not current:
            return None

        timestamp = utc_now_iso()
        new_filename = filename or current["filename"]
        new_original_name = original_name or current["original_name"]

        with self.connection() as connection:
            connection.execute(
                """
                UPDATE photos
                SET filename = ?,
                    original_name = ?,
                    date_text = ?,
                    location = ?,
                    photographer = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    new_filename,
                    new_original_name,
                    date_text,
                    location,
                    photographer,
                    timestamp,
                    photo_id,
                ),
            )
            row = connection.execute("SELECT * FROM photos WHERE id = ?", (photo_id,)).fetchone()
        return dict(row) if row else None

    def delete_photo(self, photo_id: int) -> dict | None:
        current = self.get_photo(photo_id)
        if not current:
            return None

        with self.connection() as connection:
            connection.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
        return current

    def list_guestbook_entries(self, *, limit: int = 200) -> list[dict]:
        safe_limit = max(1, min(int(limit), 200))
        with self.connection() as connection:
            rows = connection.execute(
                """
                SELECT id, affiliation, name, created_at
                FROM guestbook_entries
                ORDER BY id DESC
                LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_guestbook_count(self) -> int:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT COUNT(*) AS total FROM guestbook_entries",
            ).fetchone()
        return int(row["total"]) if row else 0

    def get_visit_count(self) -> int:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT count FROM site_visit_counter WHERE id = 1",
            ).fetchone()
        return int(row["count"]) if row else 0

    def record_visit(self) -> int:
        timestamp = utc_now_iso()
        with self.connection() as connection:
            connection.execute(
                """
                INSERT INTO site_visit_counter (id, count, updated_at)
                VALUES (1, 0, ?)
                ON CONFLICT(id) DO NOTHING
                """,
                (timestamp,),
            )
            row = connection.execute(
                """
                UPDATE site_visit_counter
                SET count = count + 1, updated_at = ?
                WHERE id = 1
                RETURNING count
                """,
                (timestamp,),
            ).fetchone()
        return int(row["count"]) if row else self.get_visit_count()

    def create_guestbook_entry(self, *, affiliation: str, name: str) -> dict:
        timestamp = utc_now_iso()
        with self.connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO guestbook_entries (affiliation, name, created_at)
                VALUES (?, ?, ?)
                """,
                (affiliation, name, timestamp),
            )
            row = connection.execute(
                """
                SELECT id, affiliation, name, created_at
                FROM guestbook_entries
                WHERE id = ?
                """,
                (cursor.lastrowid,),
            ).fetchone()
        return dict(row)

    def delete_guestbook_entry(self, entry_id: int) -> bool:
        with self.connection() as connection:
            cursor = connection.execute(
                "DELETE FROM guestbook_entries WHERE id = ?",
                (entry_id,),
            )
        return cursor.rowcount > 0
