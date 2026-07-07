import unittest
from hashlib import sha256
from unittest.mock import patch

from app.guestbook import (
    GUESTBOOK_RATE_LIMIT_MAX_SUBMISSIONS,
    GUESTBOOK_RATE_LIMIT_WINDOW_SECONDS,
    guestbook_rate_limit_key,
    normalize_guestbook_fields,
    record_guestbook_submission,
    verify_guestbook_delete_password,
)


class GuestbookTests(unittest.TestCase):
    def test_normalize_guestbook_fields(self):
        normalized = normalize_guestbook_fields(
            {"type": "general", "affiliation": " MoMent ", "name": " Admin ", "text": " 잘 보고 갑니다. "}
        )

        self.assertEqual(
            normalized,
            {
                "type": "general",
                "photo_id": None,
                "affiliation": "MoMent",
                "name": "Admin",
                "text": "잘 보고 갑니다.",
            },
        )

    def test_normalize_guestbook_fields_accepts_photo_entry(self):
        normalized = normalize_guestbook_fields(
            {"type": "photo", "photoId": "12", "affiliation": "MoMent", "name": "Admin", "text": "좋아요"}
        )

        self.assertEqual(normalized["type"], "photo")
        self.assertEqual(normalized["photo_id"], 12)

    def test_normalize_guestbook_fields_rejects_invalid_input(self):
        with self.assertRaises(ValueError):
            normalize_guestbook_fields({"affiliation": "", "name": "Admin", "text": "body"})

        with self.assertRaises(ValueError):
            normalize_guestbook_fields({"affiliation": "A" * 81, "name": "Admin", "text": "body"})

        with self.assertRaises(ValueError):
            normalize_guestbook_fields({"type": "photo", "affiliation": "A", "name": "B", "text": "body"})

        with self.assertRaises(ValueError):
            normalize_guestbook_fields({"type": "photo", "photoId": 1, "affiliation": "A", "name": "B", "text": ""})

    def test_guestbook_delete_password_requires_hash_env(self):
        password_hash = sha256(b"delete-password").hexdigest()
        with patch.dict("os.environ", {"MOMENT_TRACE_DELETE_PASSWORD_HASH": password_hash}, clear=True):
            self.assertTrue(verify_guestbook_delete_password("delete-password"))
            self.assertFalse(verify_guestbook_delete_password("wrong"))

        with patch.dict("os.environ", {}, clear=True):
            self.assertFalse(verify_guestbook_delete_password("delete-password"))

    def test_guestbook_rate_limit_key_is_hashed(self):
        key = guestbook_rate_limit_key("127.0.0.1", "browser")

        self.assertNotIn("127.0.0.1", key)
        self.assertEqual(key, guestbook_rate_limit_key(" 127.0.0.1 ", "browser"))

    def test_guestbook_rate_limit_blocks_after_window_limit(self):
        timestamps = []
        now = 1000.0

        for _ in range(GUESTBOOK_RATE_LIMIT_MAX_SUBMISSIONS):
            self.assertTrue(record_guestbook_submission(timestamps, now))

        self.assertFalse(record_guestbook_submission(timestamps, now))
        self.assertTrue(record_guestbook_submission(timestamps, now + GUESTBOOK_RATE_LIMIT_WINDOW_SECONDS + 1))


if __name__ == "__main__":
    unittest.main()
