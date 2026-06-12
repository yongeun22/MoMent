import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app.config as config_module


class ConfigTests(unittest.TestCase):
    def test_load_config_uses_safe_defaults(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            with patch.object(config_module, "ROOT_DIR", root), patch.object(
                config_module, "ENV_PATH", root / ".env"
            ), patch.dict("os.environ", {}, clear=True):
                config = config_module.load_config()

        self.assertEqual(config.host, "127.0.0.1")
        self.assertEqual(config.port, 8000)
        self.assertEqual(config.admin_path, "/admin")
        self.assertIsNone(config.admin_url)
        self.assertFalse(config.secure_cookies)

    def test_load_config_reads_env_file_without_enabling_secure_cookies_from_public_url(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            env_path = root / ".env"
            env_path.write_text(
                "\n".join(
                    [
                        "MOMENT_HOST=0.0.0.0",
                        "MOMENT_PORT=9000",
                        "MOMENT_ADMIN_PATH=private-admin/",
                        "MOMENT_PUBLIC_URL=https://example.com/exhibit",
                        "MOMENT_SECURE_COOKIES=auto",
                    ]
                ),
                encoding="utf-8",
            )

            with patch.object(config_module, "ROOT_DIR", root), patch.object(
                config_module, "ENV_PATH", env_path
            ), patch.dict("os.environ", {}, clear=True):
                config = config_module.load_config()

        self.assertEqual(config.host, "0.0.0.0")
        self.assertEqual(config.port, 9000)
        self.assertEqual(config.admin_path, "/private-admin")
        self.assertEqual(config.public_url, "https://example.com/exhibit")
        self.assertFalse(config.secure_cookies)

    def test_load_config_uses_admin_url_for_secure_cookie_auto_mode(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            env_path = root / ".env"
            env_path.write_text(
                "\n".join(
                    [
                        "MOMENT_ADMIN_URL=https://admin.example.com",
                        "MOMENT_SECURE_COOKIES=auto",
                    ]
                ),
                encoding="utf-8",
            )

            with patch.object(config_module, "ROOT_DIR", root), patch.object(
                config_module, "ENV_PATH", env_path
            ), patch.dict("os.environ", {}, clear=True):
                config = config_module.load_config()

        self.assertEqual(config.admin_url, "https://admin.example.com")
        self.assertTrue(config.secure_cookies)

    def test_load_config_keeps_secure_cookies_disabled_for_http_admin_url(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            env_path = root / ".env"
            env_path.write_text(
                "\n".join(
                    [
                        "MOMENT_ADMIN_URL=http://localhost:8000",
                        "MOMENT_SECURE_COOKIES=auto",
                    ]
                ),
                encoding="utf-8",
            )

            with patch.object(config_module, "ROOT_DIR", root), patch.object(
                config_module, "ENV_PATH", env_path
            ), patch.dict("os.environ", {}, clear=True):
                config = config_module.load_config()

        self.assertFalse(config.secure_cookies)

    def test_load_config_explicit_secure_cookie_modes_override_auto(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            env_path = root / ".env"
            env_path.write_text(
                "\n".join(
                    [
                        "MOMENT_ADMIN_URL=https://admin.example.com",
                        "MOMENT_SECURE_COOKIES=false",
                    ]
                ),
                encoding="utf-8",
            )

            with patch.object(config_module, "ROOT_DIR", root), patch.object(
                config_module, "ENV_PATH", env_path
            ), patch.dict("os.environ", {}, clear=True):
                config = config_module.load_config()
            self.assertFalse(config.secure_cookies)

            env_path.write_text(
                "\n".join(
                    [
                        "MOMENT_ADMIN_URL=http://localhost:8000",
                        "MOMENT_SECURE_COOKIES=true",
                    ]
                ),
                encoding="utf-8",
            )

            with patch.object(config_module, "ROOT_DIR", root), patch.object(
                config_module, "ENV_PATH", env_path
            ), patch.dict("os.environ", {}, clear=True):
                config = config_module.load_config()
            self.assertTrue(config.secure_cookies)


if __name__ == "__main__":
    unittest.main()
