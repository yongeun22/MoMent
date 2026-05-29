from __future__ import annotations

from hashlib import sha256
from hmac import compare_digest
import os
import re


MAX_AFFILIATION_LENGTH = 80
MAX_NAME_LENGTH = 40
MAX_GUESTBOOK_BODY_BYTES = 2 * 1024
GUESTBOOK_RATE_LIMIT_WINDOW_SECONDS = 15 * 60
GUESTBOOK_RATE_LIMIT_MAX_SUBMISSIONS = 12
TRACE_DELETE_HASH_ENV_NAMES = (
    "MOMENT_TRACE_DELETE_PASSWORD_HASH",
    "TRACE_DELETE_PASSWORD_HASH",
)
BLOCKED_GUESTBOOK_TERMS = (
    "시발",
    "시빨",
    "시팔",
    "씨발",
    "씨빨",
    "씨팔",
    "ㅅㅂ",
    "ㅆㅂ",
    "존나",
    "ㅈㄴ",
    "좆",
    "병신",
    "븅신",
    "ㅂㅅ",
    "개새끼",
    "개색기",
    "니애미",
    "느금",
)
REMOVED_GUESTBOOK_ENTRIES = (
    {
        "affiliation": "\uB178\uBB34\uD604",
        "name": "\uC800\uB294....\uC0B4\uC544\uC788\uC2B5\uB2C8\uB2E4",
    },
    {
        "affiliation": "\uB3D9\uACE0\uBABD",
        "name": "\uAC04\uC9C0\uB7FD\uB2E4",
    },
)
MODERATION_ERROR = "\uB4F1\uB85D\uD560 \uC218 \uC5C6\uB294 \uD45C\uD604\uC774 \uD3EC\uD568\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4."


def normalize_for_moderation(value: str) -> str:
    return re.sub(r"[\s\W_]+", "", value.casefold())


def has_blocked_guestbook_term(*values: str) -> bool:
    normalized = normalize_for_moderation(" ".join(values))
    return any(term in normalized for term in BLOCKED_GUESTBOOK_TERMS)


def is_removed_guestbook_entry(affiliation: str, name: str) -> bool:
    return any(
        entry["affiliation"] == affiliation and entry["name"] == name
        for entry in REMOVED_GUESTBOOK_ENTRIES
    )


def normalize_guestbook_fields(payload: dict) -> dict:
    affiliation = str(payload.get("affiliation", "")).strip()
    name = str(payload.get("name", "")).strip()

    if not affiliation:
        raise ValueError("\uC18C\uC18D\uC740 \uD544\uC218\uC785\uB2C8\uB2E4.")
    if not name:
        raise ValueError("\uC774\uB984\uC740 \uD544\uC218\uC785\uB2C8\uB2E4.")
    if len(affiliation) > MAX_AFFILIATION_LENGTH:
        raise ValueError(f"\uC18C\uC18D\uC740 {MAX_AFFILIATION_LENGTH}\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.")
    if len(name) > MAX_NAME_LENGTH:
        raise ValueError(f"\uC774\uB984\uC740 {MAX_NAME_LENGTH}\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.")
    if has_blocked_guestbook_term(affiliation, name):
        raise ValueError(MODERATION_ERROR)
    if is_removed_guestbook_entry(affiliation, name):
        raise ValueError(MODERATION_ERROR)

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


def guestbook_rate_limit_key(client_ip: str, user_agent: str) -> str:
    identity = f"{client_ip.strip()}|{user_agent.strip()[:160]}"
    return sha256(identity.encode("utf-8")).hexdigest()


def record_guestbook_submission(timestamps: list[float], now: float) -> bool:
    cutoff = now - GUESTBOOK_RATE_LIMIT_WINDOW_SECONDS
    timestamps[:] = [timestamp for timestamp in timestamps if timestamp >= cutoff]
    if len(timestamps) >= GUESTBOOK_RATE_LIMIT_MAX_SUBMISSIONS:
        return False

    timestamps.append(now)
    return True
