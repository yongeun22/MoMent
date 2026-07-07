from __future__ import annotations

from hashlib import sha256
from hmac import compare_digest
import os
import re


MAX_AFFILIATION_LENGTH = 80
MAX_NAME_LENGTH = 40
MAX_TEXT_LENGTH = 500
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
    entry_type = str(payload.get("type") or "general").strip()
    affiliation = str(payload.get("affiliation", "")).strip()
    name = str(payload.get("name", "")).strip()
    has_text = "text" in payload
    text = str(payload.get("text", "")).strip()
    raw_photo_id = payload.get("photoId", payload.get("photo_id"))

    if entry_type not in {"general", "photo"}:
        raise ValueError("\uBC29\uBA85\uB85D \uC885\uB958\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.")
    if not affiliation:
        raise ValueError("\uC18C\uC18D\uC740 \uD544\uC218\uC785\uB2C8\uB2E4.")
    if not name:
        raise ValueError("\uC774\uB984\uC740 \uD544\uC218\uC785\uB2C8\uB2E4.")
    if (has_text or entry_type == "photo") and not text:
        raise ValueError("\uB0B4\uC6A9\uC740 \uD544\uC218\uC785\uB2C8\uB2E4.")
    if len(affiliation) > MAX_AFFILIATION_LENGTH:
        raise ValueError(f"\uC18C\uC18D\uC740 {MAX_AFFILIATION_LENGTH}\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.")
    if len(name) > MAX_NAME_LENGTH:
        raise ValueError(f"\uC774\uB984\uC740 {MAX_NAME_LENGTH}\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.")
    if len(text) > MAX_TEXT_LENGTH:
        raise ValueError(f"\uB0B4\uC6A9\uC740 {MAX_TEXT_LENGTH}\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.")
    if has_blocked_guestbook_term(affiliation, name, text):
        raise ValueError(MODERATION_ERROR)
    if is_removed_guestbook_entry(affiliation, name):
        raise ValueError(MODERATION_ERROR)

    photo_id = None
    if entry_type == "photo":
        try:
            photo_id = int(raw_photo_id)
        except (TypeError, ValueError) as exc:
            raise ValueError("\uC0AC\uC9C4 \uBC29\uBA85\uB85D\uC5D0\uB294 \uC0AC\uC9C4 ID\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.") from exc
        if photo_id <= 0:
            raise ValueError("\uC0AC\uC9C4 ID\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.")

    return {
        "type": entry_type,
        "photo_id": photo_id,
        "affiliation": affiliation,
        "name": name,
        "text": text,
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
