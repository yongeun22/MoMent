from __future__ import annotations

from pathlib import Path
import json
import shutil

from .database import Database
from .image_variants import display_variant_relative_path, ensure_display_variants


def serialize_public_photo(photo: dict, uploads_dir: Path) -> dict:
    display_relative = display_variant_relative_path(photo["filename"])
    display_path = uploads_dir / display_relative
    image_url = f"/uploads/{display_relative}" if display_path.exists() else f"/uploads/{photo['filename']}"

    return {
        "id": photo["id"],
        "imageUrl": image_url,
        "lightboxUrl": f"/uploads/{photo['filename']}",
        "originalName": photo["original_name"],
        "date": photo["date_text"],
        "location": photo["location"],
        "photographer": photo["photographer"],
        "createdAt": photo["created_at"],
        "updatedAt": photo["updated_at"],
    }


def build_public_payload(database: Database, uploads_dir: Path) -> dict:
    photos_data = database.list_photos()
    ensure_display_variants(uploads_dir, [photo["filename"] for photo in photos_data])
    photos = [serialize_public_photo(photo, uploads_dir) for photo in photos_data]
    return {"photos": photos}


def export_static_site(*, root_dir: Path, static_dir: Path, uploads_dir: Path, database: Database, output_dir: Path) -> None:
    if output_dir.exists():
        shutil.rmtree(output_dir)

    (output_dir / "static" / "css").mkdir(parents=True, exist_ok=True)
    (output_dir / "static" / "js").mkdir(parents=True, exist_ok=True)
    (output_dir / "static" / "audio").mkdir(parents=True, exist_ok=True)
    (output_dir / "static" / "og").mkdir(parents=True, exist_ok=True)
    (output_dir / "uploads").mkdir(parents=True, exist_ok=True)
    (output_dir / "data").mkdir(parents=True, exist_ok=True)

    shutil.copy2(static_dir / "index.html", output_dir / "index.html")
    shutil.copy2(static_dir / "css" / "site.css", output_dir / "static" / "css" / "site.css")
    shutil.copy2(static_dir / "js" / "exhibition.js", output_dir / "static" / "js" / "exhibition.js")

    audio_dir = static_dir / "audio"
    if audio_dir.exists():
        for audio_file in audio_dir.iterdir():
            if audio_file.is_file():
                shutil.copy2(audio_file, output_dir / "static" / "audio" / audio_file.name)

    og_dir = static_dir / "og"
    if og_dir.exists():
        for og_file in og_dir.iterdir():
            if og_file.is_file():
                shutil.copy2(og_file, output_dir / "static" / "og" / og_file.name)

    photos_data = database.list_photos()
    ensure_display_variants(uploads_dir, [photo["filename"] for photo in photos_data])

    for item in uploads_dir.rglob("*"):
        if item.name == ".gitkeep" or not item.is_file():
            continue
        relative_path = item.relative_to(uploads_dir)
        destination = output_dir / "uploads" / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, destination)

    payload = build_public_payload(database, uploads_dir)
    (output_dir / "data" / "photos.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    (output_dir / "_headers").write_text(
        "\n".join(
            [
                "/static/css/*",
                "  Cache-Control: public, max-age=31536000, immutable",
                "",
                "/static/js/*",
                "  Cache-Control: public, max-age=31536000, immutable",
                "",
                "/static/audio/*",
                "  Cache-Control: public, max-age=31536000, immutable",
                "",
                "/static/og/*",
                "  Cache-Control: public, max-age=31536000, immutable",
                "",
                "/uploads/*",
                "  Cache-Control: public, max-age=31536000, immutable",
                "",
                "/data/photos.json",
                "  Cache-Control: public, max-age=0, must-revalidate",
                "",
            ]
        ),
        encoding="utf-8",
    )

    (output_dir / ".nojekyll").write_text("", encoding="utf-8")
