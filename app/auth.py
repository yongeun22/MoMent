from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time


PASSWORD_ITERATIONS = 260_000


def generate_salt() -> bytes:
    return secrets.token_bytes(16)


def hash_password(password: str, salt: bytes) -> str:
    derived_key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )
    return derived_key.hex()


def verify_password(password: str, salt_hex: str, expected_hash: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    password_hash = hash_password(password, salt)
    return hmac.compare_digest(password_hash, expected_hash)


def create_session_token(username: str, secret_key: bytes, max_age: int) -> str:
    expires_at = str(int(time.time()) + max_age)
    payload = f"{username}|{expires_at}".encode("utf-8")
    signature = hmac.new(secret_key, payload, hashlib.sha256).hexdigest().encode("utf-8")
    token_bytes = payload + b"|" + signature
    encoded = base64.urlsafe_b64encode(token_bytes).decode("ascii")
    return encoded.rstrip("=")


def verify_session_token(token: str, secret_key: bytes) -> str | None:
    if not token:
        return None

    padding = "=" * (-len(token) % 4)
    try:
        raw_token = base64.urlsafe_b64decode(token + padding)
        username, expires_at, signature = raw_token.decode("utf-8").rsplit("|", 2)
    except (ValueError, UnicodeDecodeError):
        return None

    payload = f"{username}|{expires_at}".encode("utf-8")
    expected_signature = hmac.new(secret_key, payload, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(signature, expected_signature):
        return None

    if int(expires_at) < int(time.time()):
        return None

    return username

