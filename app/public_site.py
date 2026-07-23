from __future__ import annotations

from pathlib import Path
import json
import shutil

from .database import Database
from .html_templates import render_html_template
from .image_variants import (
    display_variant_relative_path,
    ensure_display_variants,
    ensure_lightbox_variants,
    lightbox_variant_relative_path,
)
from .photo_metadata import categories_from_json
from .security import iter_security_headers


EXPORT_MARKER = ".moment-static-export"
PROTECTED_OUTPUT_NAMES = {"app", "data", "static", "uploads", ".git"}


def _validate_output_dir(root_dir: Path, output_dir: Path) -> None:
    resolved_root = root_dir.resolve()
    resolved_output = output_dir.resolve()

    if resolved_output == resolved_root or resolved_root not in resolved_output.parents:
        raise ValueError("Static export output must be a subfolder inside the project directory.")

    if resolved_output.name in PROTECTED_OUTPUT_NAMES:
        raise ValueError(f"Refusing to export into protected project folder: {resolved_output.name}")

    if resolved_output.exists() and not resolved_output.is_dir():
        raise ValueError("Static export output path exists and is not a folder.")

    marker_path = resolved_output / EXPORT_MARKER
    if resolved_output.exists() and resolved_output.name != "dist" and not marker_path.exists():
        raise ValueError(
            "Refusing to delete an existing folder that was not created by MoMent static export."
        )


def serialize_public_photo(photo: dict, uploads_dir: Path, *, prefer_lightbox_variant: bool = False) -> dict:
    display_relative = display_variant_relative_path(photo["filename"])
    display_path = uploads_dir / display_relative
    image_url = f"/uploads/{display_relative}" if display_path.exists() else f"/uploads/{photo['filename']}"
    lightbox_relative = lightbox_variant_relative_path(photo["filename"])
    lightbox_path = uploads_dir / lightbox_relative
    if prefer_lightbox_variant and lightbox_path.exists():
        lightbox_url = f"/uploads/{lightbox_relative}"
    else:
        lightbox_url = f"/uploads/{photo['filename']}"

    return {
        "id": photo["id"],
        "imageUrl": image_url,
        "lightboxUrl": lightbox_url,
        "date": photo["date_text"],
        "location": photo["location"],
        "year": photo.get("year", ""),
        "region": photo.get("region", ""),
        "category": categories_from_json(photo.get("category_json", "[]")),
        "placeId": photo.get("place_id", ""),
        "locationName": photo.get("location_name") or photo["location"],
        "lat": photo.get("lat"),
        "lng": photo.get("lng"),
        "description": photo.get("description", ""),
        "photographer": photo["photographer"],
    }


def serialize_admin_photo(photo: dict, uploads_dir: Path) -> dict:
    payload = serialize_public_photo(photo, uploads_dir)
    payload.update(
        {
            "originalName": photo["original_name"],
            "createdAt": photo["created_at"],
            "updatedAt": photo["updated_at"],
        }
    )
    return payload


def _copy_tree(source_dir: Path, destination_dir: Path) -> None:
    if not source_dir.exists():
        return
    for source_file in source_dir.rglob("*"):
        if not source_file.is_file():
            continue
        relative_path = source_file.relative_to(source_dir)
        destination = destination_dir / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_file, destination)


def _copy_public_javascript(static_dir: Path, output_dir: Path) -> None:
    shutil.copy2(static_dir / "js" / "exhibition.js", output_dir / "static" / "js" / "exhibition.js")
    _copy_tree(static_dir / "js" / "modules", output_dir / "static" / "js" / "modules")


def build_public_payload(database: Database, uploads_dir: Path, *, prefer_lightbox_variant: bool = False) -> dict:
    photos_data = database.list_photos()
    photos = [
        serialize_public_photo(photo, uploads_dir, prefer_lightbox_variant=prefer_lightbox_variant)
        for photo in photos_data
    ]
    return {"photos": photos}


def export_static_site(
    *,
    root_dir: Path,
    static_dir: Path,
    uploads_dir: Path,
    database: Database,
    output_dir: Path,
    public_url: str | None = None,
) -> None:
    _validate_output_dir(root_dir, output_dir)

    if output_dir.exists():
        shutil.rmtree(output_dir)

    (output_dir / "static" / "css").mkdir(parents=True, exist_ok=True)
    (output_dir / "static" / "js").mkdir(parents=True, exist_ok=True)
    (output_dir / "static" / "audio").mkdir(parents=True, exist_ok=True)
    (output_dir / "static" / "og").mkdir(parents=True, exist_ok=True)
    (output_dir / "static" / "qr").mkdir(parents=True, exist_ok=True)
    (output_dir / "static" / "icons").mkdir(parents=True, exist_ok=True)
    (output_dir / "static" / "vendor").mkdir(parents=True, exist_ok=True)
    (output_dir / "uploads").mkdir(parents=True, exist_ok=True)
    (output_dir / "data").mkdir(parents=True, exist_ok=True)

    (output_dir / "index.html").write_text(
        render_html_template(static_dir / "index.html", static_dir, public_url=public_url),
        encoding="utf-8",
    )
    shutil.copy2(static_dir / "404.html", output_dir / "404.html")
    shutil.copy2(static_dir / "css" / "site.css", output_dir / "static" / "css" / "site.css")
    _copy_public_javascript(static_dir, output_dir)
    _copy_tree(static_dir / "audio", output_dir / "static" / "audio")
    _copy_tree(static_dir / "og", output_dir / "static" / "og")
    _copy_tree(static_dir / "qr", output_dir / "static" / "qr")
    _copy_tree(static_dir / "icons", output_dir / "static" / "icons")
    _copy_tree(static_dir / "vendor", output_dir / "static" / "vendor")

    photos_data = database.list_photos()
    filenames = [photo["filename"] for photo in photos_data]
    ensure_display_variants(uploads_dir, filenames)
    ensure_lightbox_variants(uploads_dir, filenames)
    payload = build_public_payload(database, uploads_dir, prefer_lightbox_variant=True)

    files_to_copy = {
        relative_path
        for photo in payload["photos"]
        for relative_path in (
            photo["imageUrl"].removeprefix("/uploads/"),
            photo["lightboxUrl"].removeprefix("/uploads/"),
        )
    }

    for relative_path in sorted(files_to_copy):
        source = uploads_dir / relative_path
        if not source.exists() or not source.is_file():
            continue
        destination = output_dir / "uploads" / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

    (output_dir / "data" / "photos.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    headers_lines = ["/*"]
    headers_lines.extend(f"  {key}: {value}" for key, value in iter_security_headers())
    headers_lines.extend(
        [
            "",
            "/static/css/*",
            "  Cache-Control: public, max-age=31536000, immutable",
            "",
            "/static/js/*",
            "  Cache-Control: public, max-age=0, must-revalidate",
            "",
            "/static/audio/*",
            "  Cache-Control: public, max-age=31536000, immutable",
            "",
            "/static/og/*",
            "  Cache-Control: public, max-age=31536000, immutable",
            "",
            "/static/qr/*",
            "  Cache-Control: public, max-age=31536000, immutable",
            "",
            "/static/icons/*",
            "  Cache-Control: public, max-age=31536000, immutable",
            "",
            "/static/vendor/*",
            "  Cache-Control: public, max-age=31536000, immutable",
            "",
            "/uploads/*",
            "  Cache-Control: public, max-age=31536000, immutable",
            "",
            "/data/photos.json",
            "  Cache-Control: public, max-age=0, must-revalidate",
            "",
        ]
    )

    (output_dir / "_headers").write_text(
        "\n".join(headers_lines),
        encoding="utf-8",
    )

    (output_dir / ".nojekyll").write_text("", encoding="utf-8")
    (output_dir / EXPORT_MARKER).write_text("", encoding="utf-8")
