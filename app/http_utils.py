from __future__ import annotations

from email.parser import BytesParser
from email.policy import default
from pathlib import Path
from urllib.parse import unquote
import json


ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
CONTENT_TYPE_EXTENSION_MAP = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}


def read_json(body: bytes) -> dict:
    if not body:
        return {}
    return json.loads(body.decode("utf-8"))


def parse_multipart_form(content_type: str, body: bytes) -> tuple[dict, dict]:
    message = BytesParser(policy=default).parsebytes(
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + body
    )

    if not message.is_multipart():
        return {}, {}

    fields: dict[str, str] = {}
    files: dict[str, dict] = {}

    for part in message.iter_parts():
        if part.get_content_disposition() != "form-data":
            continue

        field_name = part.get_param("name", header="content-disposition")
        if not field_name:
            continue

        filename = part.get_filename()
        payload = part.get_payload(decode=True) or b""
        charset = part.get_content_charset() or "utf-8"

        if filename:
            files[field_name] = {
                "filename": filename,
                "content_type": part.get_content_type(),
                "content": payload,
            }
            continue

        fields[field_name] = payload.decode(charset).strip()

    return fields, files


def normalize_photo_fields(fields: dict) -> dict:
    normalized = {
        "date_text": fields.get("date", "").strip(),
        "location": fields.get("location", "").strip(),
        "photographer": fields.get("photographer", "").strip(),
    }
    labels = {
        "date_text": "\uB0A0\uC9DC",
        "location": "\uC7A5\uC18C",
        "photographer": "\uCD2C\uC601\uC790",
    }

    for key, value in normalized.items():
        if not value:
            raise ValueError(f"{labels[key]}\uB294 \uD544\uC218\uC785\uB2C8\uB2E4.")
        if len(value) > 200:
            raise ValueError(f"{labels[key]}\uB294 200\uC790 \uC774\uD558\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.")

    return normalized


def normalized_upload_extension(filename: str, content_type: str) -> str:
    extension = Path(filename).suffix.lower()
    if extension in ALLOWED_IMAGE_EXTENSIONS:
        return extension

    mapped_extension = CONTENT_TYPE_EXTENSION_MAP.get(content_type)
    if mapped_extension:
        return mapped_extension

    raise ValueError("Only JPG, PNG, WEBP, and GIF images are supported.")


def safe_relative_path(raw_path: str) -> str | None:
    relative_path = raw_path.lstrip("/")
    if not relative_path:
        return None

    candidate = Path(unquote(relative_path))
    if any(part in {"..", ""} for part in candidate.parts):
        return None

    return candidate.as_posix()
