import tempfile
import unittest
from io import BytesIO
from pathlib import Path

from PIL import Image

from app.database import Database
from app.public_site import EXPORT_MARKER, export_static_site


def write_static_fixture(static_dir: Path) -> None:
    (static_dir / "css").mkdir(parents=True)
    (static_dir / "js").mkdir()
    (static_dir / "audio").mkdir()
    (static_dir / "index.html").write_text(
        '<html><head>{{SITE_META_TAGS}}<link href="/static/css/site.css?v={{SITE_CSS_VERSION}}"></head>'
        '<body><script src="/static/js/exhibition.js?v={{EXHIBITION_JS_VERSION}}"></script></body></html>',
        encoding="utf-8",
    )
    (static_dir / "css" / "site.css").write_text("body { margin: 0; }", encoding="utf-8")
    (static_dir / "js" / "exhibition.js").write_text("console.log('ok');", encoding="utf-8")


def write_image(path: Path) -> None:
    buffer = BytesIO()
    Image.new("RGB", (8, 8), "white").save(buffer, format="PNG")
    path.write_bytes(buffer.getvalue())


class PublicSiteTests(unittest.TestCase):
    def test_export_static_site_creates_required_files_and_headers(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            static_dir = root / "static"
            uploads_dir = root / "uploads"
            data_dir = root / "data"
            output_dir = root / "dist-test"
            uploads_dir.mkdir()
            data_dir.mkdir()
            write_static_fixture(static_dir)
            write_image(uploads_dir / "photo.png")

            database = Database(data_dir / "moment.db")
            database.initialize()
            database.create_photo(
                filename="photo.png",
                original_name="photo.png",
                date_text="2026",
                location="Seoul",
                photographer="MoMent",
            )

            export_static_site(
                root_dir=root,
                static_dir=static_dir,
                uploads_dir=uploads_dir,
                database=database,
                output_dir=output_dir,
                public_url="https://example.com",
            )

            self.assertTrue((output_dir / "index.html").exists())
            self.assertTrue((output_dir / "data" / "photos.json").exists())
            self.assertTrue((output_dir / EXPORT_MARKER).exists())
            headers_text = (output_dir / "_headers").read_text(encoding="utf-8")
            self.assertIn("Content-Security-Policy", headers_text)
            self.assertIn("img-src 'self' data: blob:", headers_text)

    def test_export_static_site_rejects_unsafe_output_paths(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            static_dir = root / "static"
            uploads_dir = root / "uploads"
            data_dir = root / "data"
            static_dir.mkdir()
            uploads_dir.mkdir()
            data_dir.mkdir()
            database = Database(data_dir / "moment.db")
            database.initialize()

            with self.assertRaises(ValueError):
                export_static_site(
                    root_dir=root,
                    static_dir=static_dir,
                    uploads_dir=uploads_dir,
                    database=database,
                    output_dir=root,
                )

            with self.assertRaises(ValueError):
                export_static_site(
                    root_dir=root,
                    static_dir=static_dir,
                    uploads_dir=uploads_dir,
                    database=database,
                    output_dir=root / "uploads",
                )


if __name__ == "__main__":
    unittest.main()
