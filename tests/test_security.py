import unittest
from pathlib import Path

from app.security import build_session_cookie, iter_security_headers


class SecurityTests(unittest.TestCase):
    def test_build_session_cookie_uses_secure_only_when_enabled(self):
        insecure = build_session_cookie("moment_session", "token", max_age=60, secure=False)
        secure = build_session_cookie("moment_session", "token", max_age=60, secure=True)

        self.assertIn("HttpOnly", insecure)
        self.assertIn("SameSite=Strict", insecure)
        self.assertNotIn("Secure", insecure)
        self.assertIn("Secure", secure)

    def test_security_headers_include_baseline_browser_protections(self):
        headers = dict(iter_security_headers())

        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(headers["X-Frame-Options"], "DENY")
        self.assertEqual(headers["Strict-Transport-Security"], "max-age=31536000")
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
        self.assertIn("object-src 'none'", headers["Content-Security-Policy"])
        self.assertIn("img-src 'self' data: blob:", headers["Content-Security-Policy"])
        self.assertIn("https://tile.openstreetmap.org", headers["Content-Security-Policy"])

    def test_admin_upload_preview_scheme_is_allowed_by_csp(self):
        admin_js = Path("static/js/admin.js").read_text(encoding="utf-8")
        csp = dict(iter_security_headers())["Content-Security-Policy"]

        self.assertIn("URL.createObjectURL", admin_js)
        self.assertIn("blob:", csp)


if __name__ == "__main__":
    unittest.main()
