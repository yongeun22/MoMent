from __future__ import annotations

from email.parser import BytesParser
from email.policy import default
from pathlib import PurePosixPath, PureWindowsPath
from urllib.parse import unquote
import json

from .photo_metadata import normalize_photo_payload


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
    return normalize_photo_payload(fields)


def safe_relative_path(raw_path: str) -> str | None:
    decoded_path = unquote(raw_path).replace("\\", "/")
    if decoded_path.startswith("//"):
        return None

    relative_path = decoded_path.lstrip("/")
    if not relative_path:
        return None

    if any(part in {"..", ".", ""} for part in relative_path.split("/")):
        return None

    windows_candidate = PureWindowsPath(relative_path)
    if windows_candidate.is_absolute() or windows_candidate.drive or windows_candidate.root:
        return None

    posix_candidate = PurePosixPath(relative_path)
    if posix_candidate.is_absolute():
        return None

    return posix_candidate.as_posix()
