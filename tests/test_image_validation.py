import unittest
from io import BytesIO

from PIL import Image

from app.image_validation import detect_image_extension


def make_png_bytes() -> bytes:
    buffer = BytesIO()
    Image.new("RGB", (4, 4), "white").save(buffer, format="PNG")
    return buffer.getvalue()


class ImageValidationTests(unittest.TestCase):
    def test_detect_image_extension_reads_actual_image_content(self):
        self.assertEqual(detect_image_extension(make_png_bytes()), ".png")

    def test_detect_image_extension_rejects_non_image_bytes(self):
        with self.assertRaises(ValueError):
            detect_image_extension(b"not an image")

    def test_detect_image_extension_rejects_empty_content(self):
        with self.assertRaises(ValueError):
            detect_image_extension(b"")

    def test_detect_image_extension_rejects_decompression_bomb_warning(self):
        original_limit = Image.MAX_IMAGE_PIXELS
        try:
            Image.MAX_IMAGE_PIXELS = 1
            with self.assertRaises(ValueError):
                detect_image_extension(make_png_bytes())
        finally:
            Image.MAX_IMAGE_PIXELS = original_limit


if __name__ == "__main__":
    unittest.main()
