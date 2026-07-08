import unittest
from pathlib import Path


FUNCTION_FILES = [
    Path("functions/api/status-update.js"),
    Path("functions/api/traces.js"),
    Path("functions/api/visits.js"),
]


class CloudflareFunctionTests(unittest.TestCase):
    def test_function_json_helper_includes_security_headers(self):
        helper = Path("functions/_shared/response.js").read_text(encoding="utf-8")

        self.assertIn('"X-Content-Type-Options": "nosniff"', helper)
        self.assertIn('"Referrer-Policy": "strict-origin-when-cross-origin"', helper)
        self.assertIn('"X-Frame-Options": "DENY"', helper)
        self.assertIn('"Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()"', helper)
        self.assertIn('"Content-Security-Policy"', helper)
        self.assertIn("frame-ancestors 'none'", helper)
        self.assertIn('"Content-Type": "application/json; charset=utf-8"', helper)
        self.assertIn('"Cache-Control": "no-store"', helper)

    def test_api_functions_use_shared_json_helper(self):
        for function_file in FUNCTION_FILES:
            with self.subTest(function_file=function_file):
                source = function_file.read_text(encoding="utf-8")
                self.assertIn('import { json } from "../_shared/response.js";', source)
                self.assertNotIn("function json(", source)

    def test_traces_function_supports_photo_guestbook_schema(self):
        source = Path("functions/api/traces.js").read_text(encoding="utf-8")

        self.assertIn("type TEXT NOT NULL DEFAULT 'general'", source)
        self.assertIn("photo_id INTEGER", source)
        self.assertIn("body_text TEXT NOT NULL DEFAULT ''", source)
        self.assertIn('url.searchParams.get("photoId")', source)
        self.assertIn("photo_id AS photoId", source)

    def test_traces_function_uses_hidden_guestbook_delete_policy(self):
        source = Path("functions/api/traces.js").read_text(encoding="utf-8")

        self.assertIn("export async function onRequestDelete", source)
        self.assertIn("TRACE_DELETE_PASSWORD_HASH", source)
        self.assertIn("MOMENT_TRACE_DELETE_PASSWORD_HASH", source)
        self.assertIn("DELETE_RATE_LIMIT_MAX_ATTEMPTS", source)
        self.assertIn("enforceDeleteRateLimit", source)
        self.assertIn("\\uD14C\\uC2A4\\uD2B8", source)
        self.assertIn('return json({ error: "Not found." }, 404)', source)

    def test_status_update_post_requires_token_hash(self):
        source = Path("functions/api/status-update.js").read_text(encoding="utf-8")

        self.assertIn("STATUS_UPDATE_TOKEN_HASH", source)
        self.assertIn("MOMENT_STATUS_UPDATE_TOKEN_HASH", source)
        self.assertIn("verifyStatusUpdateToken", source)
        self.assertIn('authorization.toLowerCase().startsWith("bearer ")', source)
        self.assertIn('return json({ error: "Not found." }, 404)', source)


if __name__ == "__main__":
    unittest.main()
