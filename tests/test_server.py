import json
import socket
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import replace
from hashlib import sha256
from io import BytesIO
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from app.auth import generate_salt, hash_password
from app.config import AppConfig
from app.database import Database
from app.guestbook import GUESTBOOK_DELETE_RATE_LIMIT_MAX_ATTEMPTS
from app.rate_limit import LOGIN_IP_RATE_LIMIT_MAX_FAILURES
from app.server import build_handler, static_cache_max_age, validate_admin_bind


def make_config(root: Path, *, secure_cookies: bool = False) -> AppConfig:
    static_dir = root / "static"
    data_dir = root / "data"
    uploads_dir = root / "uploads"
    static_dir.mkdir()
    data_dir.mkdir()
    uploads_dir.mkdir()
    secret_key_path = data_dir / "secret.key"
    secret_key_path.write_bytes(b"server-test-secret-key-32-bytes!")
    return AppConfig(
        root_dir=root,
        static_dir=static_dir,
        data_dir=data_dir,
        uploads_dir=uploads_dir,
        db_path=data_dir / "moment.db",
        secret_key_path=secret_key_path,
        host="127.0.0.1",
        port=0,
        session_cookie_name="moment_session",
        session_max_age=3600,
        max_upload_bytes=1024 * 1024,
        bootstrap_admin_username=None,
        bootstrap_admin_password=None,
        admin_path="/admin",
        public_url=None,
        admin_url=None,
        secure_cookies=secure_cookies,
    )


class TestServer:
    def __init__(self, config: AppConfig, database: Database):
        base_handler = build_handler(config, database, config.secret_key_path.read_bytes())

        class QuietHandler(base_handler):
            def log_message(self, format, *args):
                return

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    @property
    def base_url(self) -> str:
        host, port = self.server.server_address
        return f"http://{host}:{port}"

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, exc_type, exc, traceback):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)


class ServerTests(unittest.TestCase):
    def test_admin_bind_requires_explicit_network_opt_in(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = make_config(Path(temp_dir))

            validate_admin_bind(config)
            with self.assertRaises(RuntimeError):
                validate_admin_bind(replace(config, host="0.0.0.0"))
            validate_admin_bind(replace(config, host="0.0.0.0", allow_network_admin=True))

    def test_static_js_assets_revalidate(self):
        self.assertEqual(static_cache_max_age("js/exhibition.js"), 0)
        self.assertEqual(static_cache_max_age("js/modules/utils.js"), 0)
        self.assertGreater(static_cache_max_age("css/site.css"), 0)

    def test_admin_mutation_rejects_cross_origin_request_and_hides_python_version(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = make_config(Path(temp_dir))
            database = self.create_database_with_admin(config)

            with TestServer(config, database) as server:
                session_status, session_headers, _ = self.request(f"{server.base_url}/api/admin/session")
                status, _, payload = self.request(
                    f"{server.base_url}/api/admin/login",
                    method="POST",
                    data=json.dumps({"username": "admin", "password": "correct-password"}).encode("utf-8"),
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "Origin": "https://attacker.example",
                    },
                )

            self.assertEqual(session_status, 200)
            self.assertNotIn("Python", session_headers.get("Server", ""))
            self.assertEqual(status, 403)
            self.assertEqual(payload["error"], "Invalid request origin.")

    def create_database_with_admin(self, config: AppConfig) -> Database:
        database = Database(config.db_path)
        database.initialize()
        salt = generate_salt()
        database.create_or_replace_admin("admin", hash_password("correct-password", salt), salt.hex())
        return database

    def post_json(self, url: str, payload: dict):
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if "/api/admin/" in url:
            parsed = urllib.parse.urlsplit(url)
            headers["Origin"] = f"{parsed.scheme}://{parsed.netloc}"
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, dict(response.headers), json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            try:
                return error.code, dict(error.headers), json.loads(error.read().decode("utf-8"))
            finally:
                error.close()

    def request(self, url: str, *, method: str = "GET", data: bytes | None = None, headers: dict | None = None):
        request_headers = dict(headers or {})
        if method != "GET" and "/api/admin/" in url and "Origin" not in request_headers:
            parsed = urllib.parse.urlsplit(url)
            request_headers["Origin"] = f"{parsed.scheme}://{parsed.netloc}"
        request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                body = response.read().decode("utf-8")
                return response.status, dict(response.headers), json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            try:
                body = error.read().decode("utf-8")
                return error.code, dict(error.headers), json.loads(body) if body else {}
            finally:
                error.close()

    def request_raw(self, url: str, *, method: str = "GET", data: bytes | None = None, headers: dict | None = None):
        request = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, dict(response.headers), response.read()
        except urllib.error.HTTPError as error:
            try:
                return error.code, dict(error.headers), error.read()
            finally:
                error.close()

    def post_multipart(self, url: str, *, fields: dict[str, str], file_bytes: bytes | None, cookie: str):
        boundary = "----moment-test-boundary"
        chunks: list[bytes] = []
        for name, value in fields.items():
            chunks.extend(
                [
                    f"--{boundary}\r\n".encode("utf-8"),
                    f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
                    value.encode("utf-8"),
                    b"\r\n",
                ]
            )
        if file_bytes is not None:
            chunks.extend(
                [
                    f"--{boundary}\r\n".encode("utf-8"),
                    b'Content-Disposition: form-data; name="photo"; filename="photo.png"\r\n',
                    b"Content-Type: image/png\r\n\r\n",
                    file_bytes,
                    b"\r\n",
                ]
            )
        chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
        body = b"".join(chunks)
        return self.request(
            url,
            method="POST",
            data=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Cookie": cookie,
                "Accept": "application/json",
            },
        )

    def make_png_bytes(self) -> bytes:
        buffer = BytesIO()
        Image.new("RGB", (8, 8), "white").save(buffer, format="PNG")
        return buffer.getvalue()

    def test_login_rate_limit_blocks_repeated_failures(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = make_config(Path(temp_dir))
            database = self.create_database_with_admin(config)

            with TestServer(config, database) as server:
                url = f"{server.base_url}/api/admin/login"
                for _ in range(5):
                    status, _, _ = self.post_json(url, {"username": "admin", "password": "wrong"})
                    self.assertEqual(status, 401)

                status, headers, payload = self.post_json(url, {"username": "admin", "password": "wrong"})

        self.assertEqual(status, 429)
        self.assertIn("Retry-After", headers)
        self.assertIn("Too many login attempts", payload["error"])

    def test_login_rate_limit_blocks_username_rotation_by_ip(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = make_config(Path(temp_dir))
            database = self.create_database_with_admin(config)

            with TestServer(config, database) as server:
                url = f"{server.base_url}/api/admin/login"
                for index in range(LOGIN_IP_RATE_LIMIT_MAX_FAILURES):
                    status, _, _ = self.post_json(
                        url,
                        {"username": f"rotated-{index}", "password": "wrong"},
                    )
                    self.assertEqual(status, 401)

                status, headers, payload = self.post_json(url, {"username": "another-user", "password": "wrong"})

        self.assertEqual(status, 429)
        self.assertIn("Retry-After", headers)
        self.assertIn("Too many login attempts", payload["error"])

    def test_login_sets_secure_cookie_when_configured(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = make_config(Path(temp_dir), secure_cookies=True)
            database = self.create_database_with_admin(config)

            with TestServer(config, database) as server:
                status, headers, payload = self.post_json(
                    f"{server.base_url}/api/admin/login",
                    {"username": "admin", "password": "correct-password"},
                )
                cookie = headers["Set-Cookie"].split(";", 1)[0]
                logout_status, logout_headers, _ = self.request(
                    f"{server.base_url}/api/admin/logout",
                    method="POST",
                    headers={"Cookie": cookie, "Accept": "application/json"},
                )

        self.assertEqual(status, 200)
        self.assertTrue(payload["authenticated"])
        self.assertIn("Secure", headers["Set-Cookie"])
        self.assertIn("X-Content-Type-Options", headers)
        self.assertEqual(logout_status, 200)
        self.assertIn("Secure", logout_headers["Set-Cookie"])
        self.assertIn("Max-Age=0", logout_headers["Set-Cookie"])

    def test_rendered_html_response_includes_blob_image_csp(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = make_config(Path(temp_dir))
            (config.static_dir / "index.html").write_text("<html><body>ok</body></html>", encoding="utf-8")
            database = Database(config.db_path)
            database.initialize()

            with TestServer(config, database) as server:
                status, headers, body = self.request_raw(f"{server.base_url}/")

        self.assertEqual(status, 200)
        self.assertIn(b"ok", body)
        self.assertIn("img-src 'self' data: blob:", headers["Content-Security-Policy"])

    def test_admin_photo_crud_flow(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = make_config(Path(temp_dir))
            database = self.create_database_with_admin(config)

            with TestServer(config, database) as server:
                login_status, login_headers, _ = self.post_json(
                    f"{server.base_url}/api/admin/login",
                    {"username": "admin", "password": "correct-password"},
                )
                cookie = login_headers["Set-Cookie"].split(";", 1)[0]
                self.assertEqual(login_status, 200)

                create_status, _, create_payload = self.post_multipart(
                    f"{server.base_url}/api/admin/photos",
                    fields={
                        "date": "2026",
                        "location": "Seoul",
                        "locationName": "Seoul Museum",
                        "photographer": "MoMent",
                        "year": "2026",
                        "region": "서울·경기권",
                        "category": "건축, 박물관",
                        "placeId": "seoul_museum",
                        "lat": "37.5",
                        "lng": "127.0",
                        "description": "Public description",
                    },
                    file_bytes=self.make_png_bytes(),
                    cookie=cookie,
                )
                self.assertEqual(create_status, 201)
                photo_id = create_payload["photo"]["id"]
                self.assertEqual(create_payload["photo"]["locationName"], "Seoul Museum")
                self.assertEqual(create_payload["photo"]["region"], "서울·경기권")
                self.assertEqual(create_payload["photo"]["category"], ["건축", "박물관"])
                self.assertEqual(create_payload["photo"]["placeId"], "seoul_museum")
                self.assertEqual(create_payload["photo"]["lat"], 37.5)
                self.assertEqual(create_payload["photo"]["originalName"], "photo.png")
                self.assertIn("createdAt", create_payload["photo"])

                list_status, _, list_payload = self.request(
                    f"{server.base_url}/api/admin/photos",
                    headers={"Cookie": cookie, "Accept": "application/json"},
                )
                self.assertEqual(list_status, 200)
                self.assertEqual(len(list_payload["photos"]), 1)
                self.assertIn("originalName", list_payload["photos"][0])

                public_status, _, public_payload = self.request(
                    f"{server.base_url}/api/photos",
                    headers={"Accept": "application/json"},
                )
                self.assertEqual(public_status, 200)
                self.assertNotIn("originalName", public_payload["photos"][0])
                self.assertNotIn("createdAt", public_payload["photos"][0])
                self.assertNotIn("updatedAt", public_payload["photos"][0])

                update_status, _, update_payload = self.post_multipart(
                    f"{server.base_url}/api/admin/photos/{photo_id}/update",
                    fields={
                        "date": "2026 updated",
                        "location": "Busan",
                        "locationName": "Busan Museum",
                        "photographer": "MoMent",
                        "year": "2026",
                        "region": "경상권",
                        "category": "박물관",
                        "placeId": "busan_museum",
                        "lat": "",
                        "lng": "",
                        "description": "",
                    },
                    file_bytes=None,
                    cookie=cookie,
                )
                self.assertEqual(update_status, 200)
                self.assertEqual(update_payload["photo"]["location"], "Busan")
                self.assertEqual(update_payload["photo"]["locationName"], "Busan Museum")
                self.assertEqual(update_payload["photo"]["region"], "경상권")

                delete_status, _, delete_payload = self.request(
                    f"{server.base_url}/api/admin/photos/{photo_id}",
                    method="DELETE",
                    headers={"Cookie": cookie, "Accept": "application/json"},
                )
                self.assertEqual(delete_status, 200)
                self.assertTrue(delete_payload["deleted"])

    def test_guestbook_general_and_photo_filter_flow(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = make_config(Path(temp_dir))
            database = Database(config.db_path)
            database.initialize()
            photo = database.create_photo(
                filename="photo.png",
                original_name="photo.png",
                date_text="2026",
                location="Seoul",
                photographer="MoMent",
            )

            with TestServer(config, database) as server:
                general_status, _, general_payload = self.post_json(
                    f"{server.base_url}/api/traces",
                    {
                        "type": "general",
                        "affiliation": "MoMent",
                        "name": "Admin",
                        "text": "잘 보고 갑니다.",
                    },
                )
                photo_status, _, photo_payload = self.post_json(
                    f"{server.base_url}/api/traces",
                    {
                        "type": "photo",
                        "photoId": photo["id"],
                        "affiliation": "MoMent",
                        "name": "Admin",
                        "text": "이 사진이 좋습니다.",
                    },
                )
                filter_status, _, filter_payload = self.request(
                    f"{server.base_url}/api/traces?photoId={photo['id']}",
                    headers={"Accept": "application/json"},
                )

        self.assertEqual(general_status, 201)
        self.assertEqual(general_payload["entry"]["type"], "general")
        self.assertEqual(photo_status, 201)
        self.assertEqual(photo_payload["entry"]["type"], "photo")
        self.assertEqual(photo_payload["entry"]["photoId"], photo["id"])
        self.assertEqual(filter_status, 200)
        self.assertEqual(filter_payload["count"], 1)
        self.assertEqual(filter_payload["entries"][0]["text"], "이 사진이 좋습니다.")

    def test_guestbook_hidden_delete_flow_removes_general_and_photo_entries(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = make_config(Path(temp_dir))
            database = Database(config.db_path)
            database.initialize()
            photo = database.create_photo(
                filename="photo.png",
                original_name="photo.png",
                date_text="2026",
                location="Seoul",
                photographer="MoMent",
            )
            token = "d" * 43
            token_hash = sha256(token.encode("utf-8")).hexdigest()

            with TestServer(config, database) as server, patch.dict(
                "os.environ",
                {"MOMENT_TRACE_DELETE_TOKEN_HASH": token_hash},
                clear=True,
            ):
                _, _, general_payload = self.post_json(
                    f"{server.base_url}/api/traces",
                    {
                        "type": "general",
                        "affiliation": "MoMent",
                        "name": "Admin",
                        "text": "운영 확인용 일반 방명록입니다.",
                    },
                )
                _, _, photo_payload = self.post_json(
                    f"{server.base_url}/api/traces",
                    {
                        "type": "photo",
                        "photoId": photo["id"],
                        "affiliation": "MoMent",
                        "name": "Admin",
                        "text": "운영 확인용 사진 방명록입니다.",
                    },
                )
                wrong_status, _, wrong_payload = self.request(
                    f"{server.base_url}/api/traces",
                    method="DELETE",
                    data=json.dumps(
                        {
                            "id": general_payload["entry"]["id"],
                            "token": "wrong-token",
                        }
                    ).encode("utf-8"),
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                )
                general_delete_status, _, general_delete_payload = self.request(
                    f"{server.base_url}/api/traces",
                    method="DELETE",
                    data=json.dumps(
                        {
                            "id": general_payload["entry"]["id"],
                            "token": token,
                        }
                    ).encode("utf-8"),
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                )
                photo_delete_status, _, photo_delete_payload = self.request(
                    f"{server.base_url}/api/traces",
                    method="DELETE",
                    data=json.dumps(
                        {
                            "id": photo_payload["entry"]["id"],
                            "token": token,
                        }
                    ).encode("utf-8"),
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                )

        self.assertEqual(wrong_status, 404)
        self.assertEqual(wrong_payload["error"], "Not found.")
        self.assertEqual(general_delete_status, 200)
        self.assertTrue(general_delete_payload["deleted"])
        self.assertEqual(general_delete_payload["count"], 1)
        self.assertEqual(general_delete_payload["entries"][0]["id"], photo_payload["entry"]["id"])
        self.assertEqual(photo_delete_status, 200)
        self.assertTrue(photo_delete_payload["deleted"])
        self.assertEqual(photo_delete_payload["count"], 0)

    def test_guestbook_hidden_delete_rate_limit_blocks_repeated_attempts(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = make_config(Path(temp_dir))
            database = Database(config.db_path)
            database.initialize()
            entry = database.create_guestbook_entry(
                entry_type="general",
                photo_id=None,
                affiliation="MoMent",
                name="Admin",
                text="삭제 제한 확인용 방명록입니다.",
            )
            token = "d" * 43
            token_hash = sha256(token.encode("utf-8")).hexdigest()

            with TestServer(config, database) as server, patch.dict(
                "os.environ",
                {"MOMENT_TRACE_DELETE_TOKEN_HASH": token_hash},
                clear=True,
            ):
                for _ in range(GUESTBOOK_DELETE_RATE_LIMIT_MAX_ATTEMPTS):
                    status, _, payload = self.request(
                        f"{server.base_url}/api/traces",
                        method="DELETE",
                        data=json.dumps({"id": entry["id"], "token": "wrong-token"}).encode("utf-8"),
                        headers={"Content-Type": "application/json", "Accept": "application/json"},
                    )
                    self.assertEqual(status, 404)
                    self.assertEqual(payload["error"], "Not found.")

                blocked_status, _, blocked_payload = self.request(
                    f"{server.base_url}/api/traces",
                    method="DELETE",
                    data=json.dumps({"id": entry["id"], "token": token}).encode("utf-8"),
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                )

            self.assertEqual(blocked_status, 404)
            self.assertEqual(blocked_payload["error"], "Not found.")
            self.assertEqual(database.get_guestbook_count(), 1)

    def test_invalid_negative_content_length_returns_bad_request(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = make_config(Path(temp_dir))
            database = Database(config.db_path)
            database.initialize()

            with TestServer(config, database) as server:
                host, port = server.server.server_address
                with socket.create_connection((host, port), timeout=5) as client:
                    client.sendall(
                        b"POST /api/traces HTTP/1.1\r\n"
                        b"Host: 127.0.0.1\r\n"
                        b"Content-Type: application/json\r\n"
                        b"Content-Length: -1\r\n"
                        b"Connection: close\r\n"
                        b"\r\n"
                    )
                    response = client.recv(1024)

        self.assertIn(b"400", response.split(b"\r\n", 1)[0])


if __name__ == "__main__":
    unittest.main()
