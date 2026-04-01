from __future__ import annotations

from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import json
import logging
import mimetypes
import socket
import traceback
import uuid

from .auth import create_session_token, generate_salt, hash_password, verify_password, verify_session_token
from .config import AppConfig
from .database import Database
from .http_utils import normalize_photo_fields, normalized_upload_extension, parse_multipart_form, read_json, safe_relative_path
from .public_site import build_public_payload, serialize_public_photo


LOGGER = logging.getLogger("moment.server")
STATIC_CACHE_MAX_AGE = 60 * 60 * 24 * 30
UPLOAD_CACHE_MAX_AGE = 60 * 60 * 24 * 30
STREAM_CHUNK_SIZE = 64 * 1024


def discover_access_urls(host: str, port: int) -> list[str]:
    if host not in {"0.0.0.0", "::"}:
        return [f"http://{host}:{port}"]

    urls = [f"http://127.0.0.1:{port}"]

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            local_ip = sock.getsockname()[0]
        if local_ip and not local_ip.startswith("127."):
            urls.append(f"http://{local_ip}:{port}")
    except OSError:
        pass

    return urls


def bootstrap_admin(config: AppConfig, database: Database) -> None:
    if database.has_admin():
        return

    if not (config.bootstrap_admin_username and config.bootstrap_admin_password):
        return

    salt = generate_salt()
    password_hash = hash_password(config.bootstrap_admin_password, salt)
    database.create_or_replace_admin(
        config.bootstrap_admin_username,
        password_hash,
        salt.hex(),
    )

def build_handler(config: AppConfig, database: Database, secret_key: bytes):
    class MomentRequestHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "MoMentHTTP/1.1"

        def do_GET(self) -> None:
            self._safe_dispatch(self._do_get_impl)

        def do_POST(self) -> None:
            self._safe_dispatch(self._do_post_impl)

        def do_DELETE(self) -> None:
            self._safe_dispatch(self._do_delete_impl)

        def _do_get_impl(self) -> None:
            parsed = urlparse(self.path)
            path = parsed.path

            if path == "/":
                self._serve_file(config.static_dir / "index.html", cache_seconds=0)
                return

            if path in {config.admin_path, f"{config.admin_path}/"}:
                self._serve_file(config.static_dir / "admin" / "index.html", cache_seconds=0)
                return

            if path == "/api/photos":
                self._send_json(build_public_payload(database))
                return

            if path == "/api/visits":
                self._send_json({"count": database.get_visit_count()})
                return

            if path == "/data/photos.json":
                self._send_json(build_public_payload(database))
                return

            if path == "/api/admin/session":
                admin = self._current_admin()
                self._send_json(
                    {
                        "authenticated": bool(admin),
                        "hasAdmin": database.has_admin(),
                        "username": admin["username"] if admin else None,
                    }
                )
                return

            if path == "/api/admin/photos":
                admin = self._require_admin()
                if not admin:
                    return

                photos = [serialize_public_photo(photo) for photo in database.list_photos()]
                self._send_json({"photos": photos, "username": admin["username"]})
                return

            if path.startswith("/static/"):
                relative_path = safe_relative_path(path.removeprefix("/static/"))
                if not relative_path:
                    self._send_json({"error": "Not found."}, status=HTTPStatus.NOT_FOUND)
                    return
                self._serve_file(config.static_dir / relative_path, cache_seconds=STATIC_CACHE_MAX_AGE)
                return

            if path.startswith("/uploads/"):
                relative_path = safe_relative_path(path.removeprefix("/uploads/"))
                if not relative_path:
                    self._send_json({"error": "Not found."}, status=HTTPStatus.NOT_FOUND)
                    return
                self._serve_file(config.uploads_dir / relative_path, cache_seconds=UPLOAD_CACHE_MAX_AGE)
                return

            if path == "/favicon.ico":
                self.send_response(HTTPStatus.NO_CONTENT)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return

            self._send_json({"error": "Not found."}, status=HTTPStatus.NOT_FOUND)

        def _do_post_impl(self) -> None:
            parsed = urlparse(self.path)
            path = parsed.path

            if path == "/api/admin/login":
                self._handle_login()
                return

            if path == "/api/visits":
                self._send_json({"count": database.increment_visit_count()})
                return

            if path == "/api/admin/logout":
                self._handle_logout()
                return

            if path == "/api/admin/password":
                admin = self._require_admin()
                if not admin:
                    return
                self._handle_password_change(admin)
                return

            if path == "/api/admin/photos":
                if not self._require_admin():
                    return
                self._handle_photo_create()
                return

            if path.startswith("/api/admin/photos/") and path.endswith("/update"):
                if not self._require_admin():
                    return
                raw_photo_id = path.removeprefix("/api/admin/photos/").removesuffix("/update").strip("/")
                self._handle_photo_update(raw_photo_id)
                return

            self._send_json({"error": "Not found."}, status=HTTPStatus.NOT_FOUND)

        def _do_delete_impl(self) -> None:
            parsed = urlparse(self.path)
            path = parsed.path

            if path.startswith("/api/admin/photos/"):
                if not self._require_admin():
                    return
                raw_photo_id = path.removeprefix("/api/admin/photos/").strip("/")
                self._handle_photo_delete(raw_photo_id)
                return

            self._send_json({"error": "Not found."}, status=HTTPStatus.NOT_FOUND)

        def _safe_dispatch(self, handler) -> None:
            try:
                handler()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                LOGGER.info("Client disconnected during %s %s", self.command, self.path)
            except Exception as exc:  # noqa: BLE001
                self._log_unexpected_error(exc)
                if self.path.startswith("/api/"):
                    self._send_json(
                        {
                            "error": "\uC11C\uBC84\uC5D0 \uB0B4\uBD80 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. `data/server-error.log`\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694."
                        },
                        status=HTTPStatus.INTERNAL_SERVER_ERROR,
                    )
                    return

                body = "\uC11C\uBC84\uC5D0 \uB0B4\uBD80 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.".encode("utf-8")
                self.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        def _log_unexpected_error(self, exc: Exception) -> None:
            error_log_path = config.data_dir / "server-error.log"
            stack = "".join(traceback.format_exception(exc))
            message = f"{self.command} {self.path}\n{stack}\n"
            error_log_path.parent.mkdir(parents=True, exist_ok=True)
            with error_log_path.open("a", encoding="utf-8") as handle:
                handle.write(message)
            LOGGER.exception("Unhandled server error during %s %s", self.command, self.path)

        def _read_body(self, *, max_bytes: int | None = None) -> bytes | None:
            length_header = self.headers.get("Content-Length")
            if not length_header:
                return b""

            try:
                length = int(length_header)
            except ValueError:
                self._send_json({"error": "Invalid request body."}, status=HTTPStatus.BAD_REQUEST)
                return None

            limit = max_bytes or config.max_upload_bytes
            if length > limit:
                remaining = length
                while remaining > 0:
                    chunk = self.rfile.read(min(STREAM_CHUNK_SIZE, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                self._send_json(
                    {
                        "error": (
                            f"\uD30C\uC77C \uC6A9\uB7C9\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4. "
                            f"{limit // (1024 * 1024)}MB \uC774\uD558 \uC774\uBBF8\uC9C0\uB97C \uC0AC\uC6A9\uD574 \uC8FC\uC138\uC694."
                        )
                    },
                    status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                )
                return None

            return self.rfile.read(length)

        def _handle_login(self) -> None:
            if not database.has_admin():
                self._send_json(
                    {
                        "error": "No admin account is configured yet. Run `py manage.py init-admin` first.",
                    },
                    status=HTTPStatus.SERVICE_UNAVAILABLE,
                )
                return

            body = self._read_body(max_bytes=20_000)
            if body is None:
                return

            try:
                payload = read_json(body)
            except json.JSONDecodeError:
                self._send_json({"error": "Invalid JSON payload."}, status=HTTPStatus.BAD_REQUEST)
                return

            username = str(payload.get("username", "")).strip()
            password = str(payload.get("password", ""))
            admin = database.get_admin(username)

            if not admin or not verify_password(password, admin["password_salt"], admin["password_hash"]):
                self._send_json({"error": "Incorrect username or password."}, status=HTTPStatus.UNAUTHORIZED)
                return

            token = create_session_token(username, secret_key, config.session_max_age)
            cookie = (
                f"{config.session_cookie_name}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={config.session_max_age}"
            )
            self._send_json(
                {"authenticated": True, "username": username},
                headers={"Set-Cookie": cookie},
            )

        def _handle_logout(self) -> None:
            expired_cookie = f"{config.session_cookie_name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"
            self._send_json({"authenticated": False}, headers={"Set-Cookie": expired_cookie})

        def _handle_password_change(self, admin: dict) -> None:
            body = self._read_body(max_bytes=20_000)
            if body is None:
                return

            try:
                payload = read_json(body)
            except json.JSONDecodeError:
                self._send_json({"error": "Invalid JSON payload."}, status=HTTPStatus.BAD_REQUEST)
                return

            current_password = str(payload.get("currentPassword", ""))
            new_password = str(payload.get("newPassword", ""))

            if not verify_password(current_password, admin["password_salt"], admin["password_hash"]):
                self._send_json({"error": "Current password is incorrect."}, status=HTTPStatus.UNAUTHORIZED)
                return

            if len(new_password) < 8:
                self._send_json(
                    {"error": "New password must be at least 8 characters long."},
                    status=HTTPStatus.BAD_REQUEST,
                )
                return

            salt = generate_salt()
            password_hash = hash_password(new_password, salt)
            database.update_admin_password(admin["username"], password_hash, salt.hex())
            self._send_json({"updated": True})

        def _handle_photo_create(self) -> None:
            body = self._read_body()
            if body is None:
                return

            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in content_type:
                self._send_json({"error": "Photo uploads must use multipart form data."}, status=HTTPStatus.BAD_REQUEST)
                return

            fields, files = parse_multipart_form(content_type, body)

            try:
                normalized = normalize_photo_fields(fields)
            except ValueError as exc:
                self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
                return

            image_file = files.get("photo")
            if not image_file or not image_file["content"]:
                self._send_json({"error": "An image file is required."}, status=HTTPStatus.BAD_REQUEST)
                return

            try:
                stored_filename = self._save_upload(image_file)
            except ValueError as exc:
                self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
                return

            try:
                photo = database.create_photo(
                    filename=stored_filename,
                    original_name=image_file["filename"],
                    date_text=normalized["date_text"],
                    location=normalized["location"],
                    photographer=normalized["photographer"],
                    copyright_text="",
                )
            except Exception:
                upload_path = config.uploads_dir / stored_filename
                if upload_path.exists():
                    upload_path.unlink()
                raise

            self._send_json({"photo": serialize_public_photo(photo)}, status=HTTPStatus.CREATED)

        def _handle_photo_update(self, raw_photo_id: str) -> None:
            try:
                photo_id = int(raw_photo_id)
            except ValueError:
                self._send_json({"error": "Invalid photo id."}, status=HTTPStatus.BAD_REQUEST)
                return

            current = database.get_photo(photo_id)
            if not current:
                self._send_json({"error": "Photo not found."}, status=HTTPStatus.NOT_FOUND)
                return

            body = self._read_body()
            if body is None:
                return

            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in content_type:
                self._send_json({"error": "Updates must use multipart form data."}, status=HTTPStatus.BAD_REQUEST)
                return

            fields, files = parse_multipart_form(content_type, body)

            try:
                normalized = normalize_photo_fields(fields)
            except ValueError as exc:
                self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
                return

            image_file = files.get("photo")
            stored_filename = None
            old_filename = None

            if image_file and image_file["content"]:
                try:
                    stored_filename = self._save_upload(image_file)
                except ValueError as exc:
                    self._send_json({"error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
                    return
                old_filename = current["filename"]

            try:
                photo = database.update_photo(
                    photo_id,
                    date_text=normalized["date_text"],
                    location=normalized["location"],
                    photographer=normalized["photographer"],
                    copyright_text="",
                    filename=stored_filename,
                    original_name=image_file["filename"] if image_file and stored_filename else None,
                )
            except Exception:
                if stored_filename:
                    upload_path = config.uploads_dir / stored_filename
                    if upload_path.exists():
                        upload_path.unlink()
                raise

            if stored_filename and old_filename:
                old_path = config.uploads_dir / old_filename
                if old_path.exists():
                    old_path.unlink()

            self._send_json({"photo": serialize_public_photo(photo)})

        def _handle_photo_delete(self, raw_photo_id: str) -> None:
            try:
                photo_id = int(raw_photo_id)
            except ValueError:
                self._send_json({"error": "Invalid photo id."}, status=HTTPStatus.BAD_REQUEST)
                return

            photo = database.delete_photo(photo_id)
            if not photo:
                self._send_json({"error": "Photo not found."}, status=HTTPStatus.NOT_FOUND)
                return

            image_path = config.uploads_dir / photo["filename"]
            if image_path.exists():
                image_path.unlink()

            self._send_json({"deleted": True})

        def _save_upload(self, image_file: dict) -> str:
            extension = normalized_upload_extension(image_file["filename"], image_file["content_type"])
            stored_filename = f"{uuid.uuid4().hex}{extension}"
            upload_path = config.uploads_dir / stored_filename
            upload_path.write_bytes(image_file["content"])
            return stored_filename

        def _current_admin(self) -> dict | None:
            cookie_header = self.headers.get("Cookie")
            if not cookie_header:
                return None

            cookie = SimpleCookie()
            cookie.load(cookie_header)
            morsel = cookie.get(config.session_cookie_name)
            if not morsel:
                return None

            username = verify_session_token(morsel.value, secret_key)
            if not username:
                return None

            admin = database.get_admin(username)
            return dict(admin) if admin else None

        def _require_admin(self) -> dict | None:
            admin = self._current_admin()
            if admin:
                return admin

            self._send_json({"error": "Authentication required."}, status=HTTPStatus.UNAUTHORIZED)
            return None

        def _serve_file(self, file_path: Path, *, cache_seconds: int) -> None:
            resolved = file_path.resolve()
            allowed_root = config.root_dir.resolve()
            if allowed_root not in resolved.parents and resolved != allowed_root:
                self._send_json({"error": "Not found."}, status=HTTPStatus.NOT_FOUND)
                return

            if not resolved.exists() or not resolved.is_file():
                self._send_json({"error": "Not found."}, status=HTTPStatus.NOT_FOUND)
                return

            file_size = resolved.stat().st_size
            content_type = mimetypes.guess_type(resolved.name)[0] or "application/octet-stream"
            start, end = self._resolve_byte_range(file_size)
            if start is None or end is None:
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Range", f"bytes */{file_size}")
                self.send_header("Content-Length", "0")
                self.end_headers()
                return

            is_partial = start != 0 or end != file_size - 1
            content_length = end - start + 1

            self.send_response(HTTPStatus.PARTIAL_CONTENT if is_partial else HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(content_length))
            self.send_header("Cache-Control", f"public, max-age={cache_seconds}")
            self.send_header("Accept-Ranges", "bytes")
            if is_partial:
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
            self.end_headers()

            with resolved.open("rb") as handle:
                handle.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk = handle.read(min(STREAM_CHUNK_SIZE, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)

        def _resolve_byte_range(self, file_size: int) -> tuple[int | None, int | None]:
            range_header = self.headers.get("Range")
            if not range_header:
                return 0, file_size - 1

            unit, _, byte_range = range_header.partition("=")
            if unit.strip().lower() != "bytes":
                return None, None

            start_text, _, end_text = byte_range.strip().partition("-")
            try:
                if start_text:
                    start = int(start_text)
                    end = int(end_text) if end_text else file_size - 1
                else:
                    suffix_length = int(end_text)
                    if suffix_length <= 0:
                        return None, None
                    start = max(file_size - suffix_length, 0)
                    end = file_size - 1
            except ValueError:
                return None, None

            if start < 0 or start >= file_size:
                return None, None

            if end < start:
                return None, None

            return start, min(end, file_size - 1)

        def _send_json(
            self,
            payload: dict,
            *,
            status: HTTPStatus = HTTPStatus.OK,
            headers: dict[str, str] | None = None,
        ) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            if headers:
                for key, value in headers.items():
                    self.send_header(key, value)
            self.end_headers()
            self.wfile.write(body)

    return MomentRequestHandler


def run_server(config: AppConfig) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    database = Database(config.db_path)
    database.initialize()
    bootstrap_admin(config, database)
    secret_key = config.secret_key_path.read_bytes()
    handler = build_handler(config, database, secret_key)

    with ThreadingHTTPServer((config.host, config.port), handler) as server:
        print("MoMent running at:")
        for url in discover_access_urls(config.host, config.port):
            print(f"  {url}")
        print(f"Admin path: {config.admin_path}")
        print("Press Ctrl+C to stop.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
