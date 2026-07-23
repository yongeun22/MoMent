from __future__ import annotations

from hashlib import sha256
import secrets


def generate_operator_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    token_hash = sha256(token.encode("utf-8")).hexdigest()
    return token, token_hash
