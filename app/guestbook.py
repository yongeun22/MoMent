from __future__ import annotations

from hashlib import sha256
from hmac import compare_digest
import os


MAX_AFFILIATION_LENGTH = 80
MAX_NAME_LENGTH = 40
TRACE_DELETE_HASH_ENV_NAMES = (
    "MOMENT_TRACE_DELETE_PASSWORD_HASH",
    "TRACE_DELETE_PASSWORD_HASH",
)


def normalize_guestbook_fields(payload: dict) -> dict:
    affiliation = str(payload.get("affiliation", "")).strip()
    name = str(payload.get("name", "")).strip()

    if not affiliation:
        raise ValueError("\uD559\uAD50/\uD559\uACFC\uBA85\uC740 \uD544\uC218\uC785\uB2C8\uB2E4.")
    if not name:
        raise ValueError("\uC774\uB984\uC740 \uD544\uC218\uC785\uB2C8\uB2E4.")
    if len(affiliation) > MAX_AFFILIATION_LENGTH:
        raise ValueError(f"\uD559\uAD50/\uD559\uACFC\uBA85\uC740 {MAX_AFFILIATION_LENGTH}\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.")
    if len(name) > MAX_NAME_LENGTH:
        raise ValueError(f"\uC774\uB984\uC740 {MAX_NAME_LENGTH}\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.")

    return {
        "affiliation": affiliation,
        "name": name,
    }


def verify_guestbook_delete_password(password: str) -> bool:
    expected_hash = next(
        (
            os.getenv(env_name, "").strip().lower()
            for env_name in TRACE_DELETE_HASH_ENV_NAMES
            if os.getenv(env_name, "").strip()
        ),
        "",
    )
    if not expected_hash:
        return False

    candidate_hash = sha256(str(password).encode("utf-8")).hexdigest()
    return compare_digest(candidate_hash, expected_hash)
