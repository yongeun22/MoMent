from __future__ import annotations

from hashlib import sha256
from hmac import compare_digest


MAX_AFFILIATION_LENGTH = 80
MAX_NAME_LENGTH = 40
TRACE_DELETE_PASSWORD_HASH = "8a7177fcda2d2eefc04849818b92cdd4444b23cfa993f103c1a9577dcc9f7028"


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
    candidate_hash = sha256(str(password).encode("utf-8")).hexdigest()
    return compare_digest(candidate_hash, TRACE_DELETE_PASSWORD_HASH)
