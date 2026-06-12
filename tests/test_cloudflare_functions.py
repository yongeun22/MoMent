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
        self.assertIn('"Content-Type": "application/json; charset=utf-8"', helper)
        self.assertIn('"Cache-Control": "no-store"', helper)

    def test_api_functions_use_shared_json_helper(self):
        for function_file in FUNCTION_FILES:
            with self.subTest(function_file=function_file):
                source = function_file.read_text(encoding="utf-8")
                self.assertIn('import { json } from "../_shared/response.js";', source)
                self.assertNotIn("function json(", source)


if __name__ == "__main__":
    unittest.main()
