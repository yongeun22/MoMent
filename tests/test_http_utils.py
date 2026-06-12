import unittest

from app.http_utils import normalize_photo_fields, safe_relative_path


class HttpUtilsTests(unittest.TestCase):
    def test_safe_relative_path_accepts_normal_paths(self):
        self.assertEqual(safe_relative_path("display/photo.webp"), "display/photo.webp")

    def test_safe_relative_path_rejects_traversal_and_absolute_paths(self):
        self.assertIsNone(safe_relative_path("../secret.key"))
        self.assertIsNone(safe_relative_path("%2e%2e/secret.key"))
        self.assertIsNone(safe_relative_path("C:\\secret.key"))
        self.assertIsNone(safe_relative_path("//example.com/file"))
        self.assertIsNone(safe_relative_path("nested/./file.jpg"))

    def test_normalize_photo_fields_accepts_required_fields(self):
        normalized = normalize_photo_fields(
            {
                "date": "2026-06-12",
                "location": "Seoul",
                "photographer": "MoMent",
            }
        )

        self.assertEqual(normalized["date_text"], "2026-06-12")
        self.assertEqual(normalized["location"], "Seoul")
        self.assertEqual(normalized["photographer"], "MoMent")

    def test_normalize_photo_fields_rejects_missing_and_long_fields(self):
        with self.assertRaises(ValueError):
            normalize_photo_fields({"date": "", "location": "Seoul", "photographer": "MoMent"})

        with self.assertRaises(ValueError):
            normalize_photo_fields({"date": "x" * 201, "location": "Seoul", "photographer": "MoMent"})


if __name__ == "__main__":
    unittest.main()
