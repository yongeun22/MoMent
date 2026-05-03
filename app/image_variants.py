from __future__ import annotations

from pathlib import Path
import shutil

from PIL import Image, ImageOps, UnidentifiedImageError


DISPLAY_SUBDIR = "display"
LIGHTBOX_SUBDIR = "lightbox"
DISPLAY_MAX_DIMENSION = 1440
LIGHTBOX_MAX_DIMENSION = 2200
DISPLAY_WEBP_QUALITY = 78
LIGHTBOX_WEBP_QUALITY = 86


def display_variant_relative_path(filename: str) -> str:
    source = Path(filename)
    if source.suffix.lower() == ".gif":
        return str(Path(DISPLAY_SUBDIR) / source.name).replace("\\", "/")
    return str(Path(DISPLAY_SUBDIR) / f"{source.stem}.webp").replace("\\", "/")


def lightbox_variant_relative_path(filename: str) -> str:
    source = Path(filename)
    if source.suffix.lower() == ".gif":
        return str(Path(LIGHTBOX_SUBDIR) / source.name).replace("\\", "/")
    return str(Path(LIGHTBOX_SUBDIR) / f"{source.stem}.webp").replace("\\", "/")


def display_variant_path(uploads_dir: Path, filename: str) -> Path:
    return uploads_dir / display_variant_relative_path(filename)


def lightbox_variant_path(uploads_dir: Path, filename: str) -> Path:
    return uploads_dir / lightbox_variant_relative_path(filename)


def _ensure_variant(
    uploads_dir: Path,
    filename: str,
    *,
    variant_relative_path: str,
    max_dimension: int,
    quality: int,
) -> Path | None:
    source_path = uploads_dir / filename
    if not source_path.exists() or not source_path.is_file():
        return None

    variant_path = uploads_dir / variant_relative_path
    variant_path.parent.mkdir(parents=True, exist_ok=True)

    if (
        variant_path.exists()
        and variant_path.stat().st_size > 0
        and variant_path.stat().st_mtime >= source_path.stat().st_mtime
    ):
        return variant_path

    if source_path.suffix.lower() == ".gif":
        shutil.copy2(source_path, variant_path)
        return variant_path

    try:
        with Image.open(source_path) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

            if image.mode not in {"RGB", "RGBA"}:
                if image.mode == "P" and "transparency" in image.info:
                    image = image.convert("RGBA")
                else:
                    image = image.convert("RGB")

            image.save(
                variant_path,
                format="WEBP",
                quality=quality,
                method=6,
            )
    except (UnidentifiedImageError, OSError):
        shutil.copy2(source_path, variant_path)

    return variant_path


def ensure_display_variant(uploads_dir: Path, filename: str) -> Path | None:
    return _ensure_variant(
        uploads_dir,
        filename,
        variant_relative_path=display_variant_relative_path(filename),
        max_dimension=DISPLAY_MAX_DIMENSION,
        quality=DISPLAY_WEBP_QUALITY,
    )


def ensure_lightbox_variant(uploads_dir: Path, filename: str) -> Path | None:
    return _ensure_variant(
        uploads_dir,
        filename,
        variant_relative_path=lightbox_variant_relative_path(filename),
        max_dimension=LIGHTBOX_MAX_DIMENSION,
        quality=LIGHTBOX_WEBP_QUALITY,
    )


def ensure_display_variants(uploads_dir: Path, filenames: list[str]) -> None:
    for filename in filenames:
        ensure_display_variant(uploads_dir, filename)


def ensure_lightbox_variants(uploads_dir: Path, filenames: list[str]) -> None:
    for filename in filenames:
        ensure_lightbox_variant(uploads_dir, filename)
