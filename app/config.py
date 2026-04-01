from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os
import secrets


ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT_DIR / ".env"


@dataclass(frozen=True)
class AppConfig:
    root_dir: Path
    static_dir: Path
    data_dir: Path
    uploads_dir: Path
    db_path: Path
    secret_key_path: Path
    host: str
    port: int
    session_cookie_name: str
    session_max_age: int
    max_upload_bytes: int
    bootstrap_admin_username: str | None
    bootstrap_admin_password: str | None
    admin_path: str


def _load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def _ensure_secret_key(path: Path) -> None:
    if path.exists():
        return

    path.write_bytes(secrets.token_bytes(32))


def _normalize_admin_path(raw_path: str) -> str:
    cleaned = (raw_path or "/admin").strip()
    if not cleaned.startswith("/"):
        cleaned = "/" + cleaned
    if len(cleaned) > 1:
        cleaned = cleaned.rstrip("/")
    return cleaned


def load_config() -> AppConfig:
    _load_env_file(ENV_PATH)

    static_dir = ROOT_DIR / "static"
    data_dir = ROOT_DIR / "data"
    uploads_dir = ROOT_DIR / "uploads"
    db_path = data_dir / "moment.db"
    secret_key_path = data_dir / "secret.key"

    data_dir.mkdir(parents=True, exist_ok=True)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    _ensure_secret_key(secret_key_path)

    return AppConfig(
        root_dir=ROOT_DIR,
        static_dir=static_dir,
        data_dir=data_dir,
        uploads_dir=uploads_dir,
        db_path=db_path,
        secret_key_path=secret_key_path,
        host=os.getenv("MOMENT_HOST", "127.0.0.1"),
        port=int(os.getenv("MOMENT_PORT", "8000")),
        session_cookie_name=os.getenv("MOMENT_SESSION_COOKIE", "moment_session"),
        session_max_age=int(os.getenv("MOMENT_SESSION_MAX_AGE", str(60 * 60 * 12))),
        max_upload_bytes=int(os.getenv("MOMENT_MAX_UPLOAD_BYTES", str(100 * 1024 * 1024))),
        bootstrap_admin_username=os.getenv("MOMENT_ADMIN_USERNAME") or None,
        bootstrap_admin_password=os.getenv("MOMENT_ADMIN_PASSWORD") or None,
        admin_path=_normalize_admin_path(os.getenv("MOMENT_ADMIN_PATH", "/admin")),
    )
