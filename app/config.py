from __future__ import annotations

from dataclasses import dataclass
from ipaddress import ip_address
from pathlib import Path
import os
import re
import secrets


ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT_DIR / ".env"
COOKIE_NAME_PATTERN = re.compile(r"^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$")


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
    public_url: str | None
    admin_url: str | None
    secure_cookies: bool
    allow_network_admin: bool = False


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
    if (
        cleaned == "/"
        or "\\" in cleaned
        or "?" in cleaned
        or "#" in cleaned
        or "//" in cleaned
        or any(segment in {".", ".."} for segment in cleaned.split("/"))
        or any(ord(character) < 0x20 for character in cleaned)
    ):
        raise ValueError("MOMENT_ADMIN_PATH must be a non-root URL path without traversal or query syntax.")
    return cleaned


def _normalize_cookie_name(raw_name: str) -> str:
    cleaned = raw_name.strip()
    if not cleaned or not COOKIE_NAME_PATTERN.fullmatch(cleaned):
        raise ValueError("MOMENT_SESSION_COOKIE must be a valid HTTP cookie name.")
    return cleaned


def _normalize_public_url(raw_url: str | None) -> str | None:
    cleaned = (raw_url or "").strip()
    if not cleaned:
        return None
    return cleaned.rstrip("/")


def _parse_bool(value: str) -> bool:
    return value.strip().casefold() in {"1", "true", "yes", "on"}


def _parse_int(name: str, raw_value: str, *, minimum: int, maximum: int) -> int:
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer.") from exc
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}.")
    return value


def is_loopback_host(host: str) -> bool:
    cleaned = host.strip().strip("[]").casefold()
    if cleaned == "localhost":
        return True
    try:
        return ip_address(cleaned).is_loopback
    except ValueError:
        return False


def _resolve_secure_cookies(raw_value: str | None, admin_url: str | None) -> bool:
    cleaned = (raw_value or "auto").strip().casefold()
    if cleaned in {"", "auto"}:
        return bool(admin_url and admin_url.casefold().startswith("https://"))
    return _parse_bool(cleaned)


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

    public_url = _normalize_public_url(os.getenv("MOMENT_PUBLIC_URL"))
    admin_url = _normalize_public_url(os.getenv("MOMENT_ADMIN_URL"))

    return AppConfig(
        root_dir=ROOT_DIR,
        static_dir=static_dir,
        data_dir=data_dir,
        uploads_dir=uploads_dir,
        db_path=db_path,
        secret_key_path=secret_key_path,
        host=os.getenv("MOMENT_HOST", "127.0.0.1"),
        port=_parse_int("MOMENT_PORT", os.getenv("MOMENT_PORT", "8000"), minimum=1, maximum=65535),
        session_cookie_name=_normalize_cookie_name(os.getenv("MOMENT_SESSION_COOKIE", "moment_session")),
        session_max_age=_parse_int(
            "MOMENT_SESSION_MAX_AGE",
            os.getenv("MOMENT_SESSION_MAX_AGE", str(60 * 60 * 12)),
            minimum=300,
            maximum=60 * 60 * 24 * 7,
        ),
        max_upload_bytes=_parse_int(
            "MOMENT_MAX_UPLOAD_BYTES",
            os.getenv("MOMENT_MAX_UPLOAD_BYTES", str(100 * 1024 * 1024)),
            minimum=1024,
            maximum=1024 * 1024 * 1024,
        ),
        bootstrap_admin_username=os.getenv("MOMENT_ADMIN_USERNAME") or None,
        bootstrap_admin_password=os.getenv("MOMENT_ADMIN_PASSWORD") or None,
        admin_path=_normalize_admin_path(os.getenv("MOMENT_ADMIN_PATH", "/admin")),
        public_url=public_url,
        admin_url=admin_url,
        secure_cookies=_resolve_secure_cookies(os.getenv("MOMENT_SECURE_COOKIES"), admin_url),
        allow_network_admin=_parse_bool(os.getenv("MOMENT_ALLOW_NETWORK_ADMIN", "false")),
    )
