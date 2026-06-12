import base64
import time
import unittest

from app.auth import create_session_token, generate_salt, hash_password, verify_password, verify_session_token


class AuthTests(unittest.TestCase):
    def test_password_hash_verification_accepts_correct_password(self):
        salt = generate_salt()
        password_hash = hash_password("correct horse battery staple", salt)

        self.assertTrue(verify_password("correct horse battery staple", salt.hex(), password_hash))
        self.assertFalse(verify_password("wrong password", salt.hex(), password_hash))

    def test_session_token_round_trip(self):
        secret_key = b"secret-key-for-test-secret-key-32"
        token = create_session_token("admin", 3, secret_key, 60)

        self.assertEqual(verify_session_token(token, secret_key), ("admin", 3))

    def test_session_token_rejects_tampering(self):
        secret_key = b"secret-key-for-test-secret-key-32"
        token = create_session_token("admin", 3, secret_key, 60)
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
        tampered = raw.replace(b"admin", b"owner", 1)
        tampered_token = base64.urlsafe_b64encode(tampered).decode("ascii").rstrip("=")

        self.assertIsNone(verify_session_token(tampered_token, secret_key))

    def test_session_token_rejects_expired_token(self):
        secret_key = b"secret-key-for-test-secret-key-32"
        token = create_session_token("admin", 1, secret_key, -10)
        time.sleep(0.01)

        self.assertIsNone(verify_session_token(token, secret_key))


if __name__ == "__main__":
    unittest.main()
