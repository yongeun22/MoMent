from __future__ import annotations

from io import BytesIO

from PIL import Image, UnidentifiedImageError


FORMAT_EXTENSION_MAP = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
    "GIF": ".gif",
}


def detect_image_extension(content: bytes) -> str:
    if not content:
        raise ValueError("\uC774\uBBF8\uC9C0 \uD30C\uC77C\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.")

    try:
        with Image.open(BytesIO(content)) as image:
            image.verify()
            image_format = image.format
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError("\uC774\uBBF8\uC9C0 \uD30C\uC77C\uB9CC \uC5C5\uB85C\uB4DC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.") from exc

    extension = FORMAT_EXTENSION_MAP.get(str(image_format).upper())
    if not extension:
        raise ValueError("JPG, PNG, WEBP, GIF \uC774\uBBF8\uC9C0\uB9CC \uC9C0\uC6D0\uD569\uB2C8\uB2E4.")

    return extension
