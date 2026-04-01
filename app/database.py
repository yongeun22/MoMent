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
    copyright_text TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_stats (
    key TEXT PRIMARY KEY,
    value INTEGER NOT NULL DEFAULT 0,
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
            connection.execute("DELETE FROM admins")
            connection.execute(
                """
                INSERT INTO admins (id, username, password_hash, password_salt, created_at, updated_at)
                VALUES (1, ?, ?, ?, ?, ?)
                """,
                (username, password_hash, password_salt, timestamp, timestamp),
            )

    def update_admin_password(self, username: str, password_hash: str, password_salt: str) -> sqlite3.Row | None:
        timestamp = utc_now_iso()
        with self.connection() as connection:
            connection.execute(
                """
                UPDATE admins
                SET password_hash = ?,
                    password_salt = ?,
                    updated_at = ?
                WHERE username = ?
                """,
                (password_hash, password_salt, timestamp, username),
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
        copyright_text: str,
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
                    copyright_text,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    filename,
                    original_name,
                    date_text,
                    location,
                    photographer,
                    copyright_text,
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
        copyright_text: str,
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
                    copyright_text = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    new_filename,
                    new_original_name,
                    date_text,
                    location,
                    photographer,
                    copyright_text,
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

    def get_visit_count(self) -> int:
        with self.connection() as connection:
            row = connection.execute(
                "SELECT value FROM site_stats WHERE key = ?",
                ("visit_count",),
            ).fetchone()
        return int(row["value"]) if row else 0

    def increment_visit_count(self) -> int:
        timestamp = utc_now_iso()
        with self.connection() as connection:
            connection.execute(
                """
                INSERT INTO site_stats (key, value, updated_at)
                VALUES (?, 1, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value = value + 1,
                    updated_at = excluded.updated_at
                """,
                ("visit_count", timestamp),
            )
            row = connection.execute(
                "SELECT value FROM site_stats WHERE key = ?",
                ("visit_count",),
            ).fetchone()
        return int(row["value"]) if row else 0
