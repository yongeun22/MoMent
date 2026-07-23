import unittest
from hashlib import sha256
from unittest.mock import patch

from app.guestbook import (
    GUESTBOOK_DELETE_RATE_LIMIT_MAX_ATTEMPTS,
    GUESTBOOK_DELETE_RATE_LIMIT_WINDOW_SECONDS,
    GUESTBOOK_RATE_LIMIT_MAX_SUBMISSIONS,
    GUESTBOOK_RATE_LIMIT_WINDOW_SECONDS,
    guestbook_rate_limit_key,
    normalize_guestbook_fields,
    record_guestbook_delete_attempt,
    record_guestbook_submission,
    verify_guestbook_delete_token,
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

        with self.assertRaises(ValueError):
            normalize_guestbook_fields(
                {"type": "photo", "photoId": 88, "affiliation": "테스트", "name": "테스트", "text": "테스트"}
            )

    def test_guestbook_delete_token_requires_high_entropy_token_and_hash_env(self):
        token = "a" * 43
        token_hash = sha256(token.encode("utf-8")).hexdigest()
        with patch.dict("os.environ", {"MOMENT_TRACE_DELETE_TOKEN_HASH": token_hash}, clear=True):
            self.assertTrue(verify_guestbook_delete_token(token))
            self.assertFalse(verify_guestbook_delete_token("wrong"))

        with patch.dict("os.environ", {}, clear=True):
            self.assertFalse(verify_guestbook_delete_token(token))

    def test_guestbook_rate_limit_key_is_hashed(self):
        key = guestbook_rate_limit_key("127.0.0.1", "submit")

        self.assertNotIn("127.0.0.1", key)
        self.assertEqual(key, guestbook_rate_limit_key(" 127.0.0.1 ", "submit"))
        self.assertNotEqual(key, guestbook_rate_limit_key("127.0.0.1", "delete"))

    def test_guestbook_rate_limit_blocks_after_window_limit(self):
        timestamps = []
        now = 1000.0

        for _ in range(GUESTBOOK_RATE_LIMIT_MAX_SUBMISSIONS):
            self.assertTrue(record_guestbook_submission(timestamps, now))

        self.assertFalse(record_guestbook_submission(timestamps, now))
        self.assertTrue(record_guestbook_submission(timestamps, now + GUESTBOOK_RATE_LIMIT_WINDOW_SECONDS + 1))

    def test_guestbook_delete_rate_limit_blocks_after_attempt_limit(self):
        timestamps = []
        now = 1000.0

        for _ in range(GUESTBOOK_DELETE_RATE_LIMIT_MAX_ATTEMPTS):
            self.assertTrue(record_guestbook_delete_attempt(timestamps, now))

        self.assertFalse(record_guestbook_delete_attempt(timestamps, now))
        self.assertTrue(
            record_guestbook_delete_attempt(
                timestamps,
                now + GUESTBOOK_DELETE_RATE_LIMIT_WINDOW_SECONDS + 1,
            )
        )


if __name__ == "__main__":
    unittest.main()
