from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import sqlite3

from .photo_metadata import (
    DEFAULT_REGION,
    categories_to_json,
    extract_year,
    normalize_region,
    stable_place_id,
)


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
    year TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '기타',
    category_json TEXT NOT NULL DEFAULT '[]',
    place_id TEXT NOT NULL DEFAULT '',
    location_name TEXT NOT NULL DEFAULT '',
    lat REAL,
    lng REAL,
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS guestbook_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'general',
    photo_id INTEGER,
    affiliation TEXT NOT NULL,
    name TEXT NOT NULL,
    body_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE SET NULL
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
            self._ensure_guestbook_columns(connection)

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
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(photos)").fetchall()
        }
        column_definitions = {
            "year": "TEXT NOT NULL DEFAULT ''",
            "region": f"TEXT NOT NULL DEFAULT '{DEFAULT_REGION}'",
            "category_json": "TEXT NOT NULL DEFAULT '[]'",
            "place_id": "TEXT NOT NULL DEFAULT ''",
            "location_name": "TEXT NOT NULL DEFAULT ''",
            "lat": "REAL",
            "lng": "REAL",
            "description": "TEXT NOT NULL DEFAULT ''",
        }
        for column_name, definition in column_definitions.items():
            if column_name not in columns:
                connection.execute(f"ALTER TABLE photos ADD COLUMN {column_name} {definition}")

        rows = connection.execute(
            """
            SELECT id, date_text, location, year, region, category_json, place_id, location_name
            FROM photos
            """
        ).fetchall()
        for row in rows:
            location_name = str(row["location_name"] or row["location"] or "").strip()
            year = str(row["year"] or extract_year(row["date_text"]) or "").strip()
            region = normalize_region(row["region"] or DEFAULT_REGION)
            category_json = str(row["category_json"] or categories_to_json([])).strip()
            place_id = str(row["place_id"] or stable_place_id(location_name)).strip()
            connection.execute(
                """
                UPDATE photos
                SET year = ?,
                    region = ?,
                    category_json = ?,
                    place_id = ?,
                    location_name = ?
                WHERE id = ?
                """,
                (
                    year,
                    region,
                    category_json,
                    place_id,
                    location_name,
                    row["id"],
                ),
            )

    def _ensure_guestbook_columns(self, connection: sqlite3.Connection) -> None:
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(guestbook_entries)").fetchall()
        }
        column_definitions = {
            "type": "TEXT NOT NULL DEFAULT 'general'",
            "photo_id": "INTEGER",
            "body_text": "TEXT NOT NULL DEFAULT ''",
        }
        for column_name, definition in column_definitions.items():
            if column_name not in columns:
                connection.execute(f"ALTER TABLE guestbook_entries ADD COLUMN {column_name} {definition}")
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_guestbook_entries_photo_id
            ON guestbook_entries (photo_id, id)
            """
        )

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
        year: str = "",
        region: str = DEFAULT_REGION,
        category_json: str = "[]",
        place_id: str = "",
        location_name: str = "",
        lat: float | None = None,
        lng: float | None = None,
        description: str = "",
    ) -> dict:
        timestamp = utc_now_iso()
        location_name = location_name or location
        year = year or extract_year(date_text)
        region = normalize_region(region)
        place_id = place_id or stable_place_id(location_name)
        category_json = category_json or categories_to_json([])
        with self.connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO photos (
                    filename,
                    original_name,
                    date_text,
                    location,
                    photographer,
                    year,
                    region,
                    category_json,
                    place_id,
                    location_name,
                    lat,
                    lng,
                    description,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    filename,
                    original_name,
                    date_text,
                    location,
                    photographer,
                    year,
                    region,
                    category_json,
                    place_id,
                    location_name,
                    lat,
                    lng,
                    description,
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
        year: str = "",
        region: str = DEFAULT_REGION,
        category_json: str = "[]",
        place_id: str = "",
        location_name: str = "",
        lat: float | None = None,
        lng: float | None = None,
        description: str = "",
        filename: str | None = None,
        original_name: str | None = None,
    ) -> dict | None:
        current = self.get_photo(photo_id)
        if not current:
            return None

        timestamp = utc_now_iso()
        new_filename = filename or current["filename"]
        new_original_name = original_name or current["original_name"]
        location_name = location_name or location
        year = year or extract_year(date_text)
        region = normalize_region(region)
        place_id = place_id or stable_place_id(location_name)
        category_json = category_json or categories_to_json([])

        with self.connection() as connection:
            connection.execute(
                """
                UPDATE photos
                SET filename = ?,
                    original_name = ?,
                    date_text = ?,
                    location = ?,
                    photographer = ?,
                    year = ?,
                    region = ?,
                    category_json = ?,
                    place_id = ?,
                    location_name = ?,
                    lat = ?,
                    lng = ?,
                    description = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    new_filename,
                    new_original_name,
                    date_text,
                    location,
                    photographer,
                    year,
                    region,
                    category_json,
                    place_id,
                    location_name,
                    lat,
                    lng,
                    description,
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

    def list_guestbook_entries(
        self,
        *,
        limit: int = 200,
        photo_id: int | None = None,
        entry_type: str | None = None,
    ) -> list[dict]:
        safe_limit = max(1, min(int(limit), 200))
        clauses: list[str] = []
        params: list[object] = []
        if photo_id is not None:
            clauses.append("photo_id = ?")
            params.append(photo_id)
        if entry_type:
            clauses.append("type = ?")
            params.append(entry_type)
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self.connection() as connection:
            rows = connection.execute(
                f"""
                SELECT id,
                       type,
                       photo_id AS photoId,
                       affiliation,
                       name,
                       body_text AS text,
                       created_at AS createdAt
                FROM guestbook_entries
                {where_sql}
                ORDER BY id DESC
                LIMIT ?
                """,
                (*params, safe_limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_guestbook_count(
        self,
        *,
        photo_id: int | None = None,
        entry_type: str | None = None,
    ) -> int:
        clauses: list[str] = []
        params: list[object] = []
        if photo_id is not None:
            clauses.append("photo_id = ?")
            params.append(photo_id)
        if entry_type:
            clauses.append("type = ?")
            params.append(entry_type)
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self.connection() as connection:
            row = connection.execute(
                f"SELECT COUNT(*) AS total FROM guestbook_entries {where_sql}",
                params,
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

    def create_guestbook_entry(
        self,
        *,
        entry_type: str,
        photo_id: int | None,
        affiliation: str,
        name: str,
        text: str,
    ) -> dict:
        timestamp = utc_now_iso()
        with self.connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO guestbook_entries (type, photo_id, affiliation, name, body_text, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (entry_type, photo_id, affiliation, name, text, timestamp),
            )
            row = connection.execute(
                """
                SELECT id,
                       type,
                       photo_id AS photoId,
                       affiliation,
                       name,
                       body_text AS text,
                       created_at AS createdAt
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
