import tempfile
import unittest
from io import BytesIO
from pathlib import Path
import json

from PIL import Image

from app.database import Database
from app.html_templates import asset_version, render_html_template
from app.public_site import EXPORT_MARKER, export_static_site, serialize_admin_photo


def write_static_fixture(static_dir: Path) -> None:
    (static_dir / "css").mkdir(parents=True)
    (static_dir / "js").mkdir()
    (static_dir / "js" / "modules").mkdir()
    (static_dir / "audio").mkdir()
    (static_dir / "index.html").write_text(
        '<html><head>{{SITE_META_TAGS}}<link href="/static/css/site.css?v={{SITE_CSS_VERSION}}"></head>'
        '<body><script src="/static/js/exhibition.js?v={{EXHIBITION_JS_VERSION}}"></script></body></html>',
        encoding="utf-8",
    )
    (static_dir / "css" / "site.css").write_text("body { margin: 0; }", encoding="utf-8")
    (static_dir / "js" / "exhibition.js").write_text("console.log('ok');", encoding="utf-8")
    (static_dir / "js" / "modules" / "utils.js").write_text("export const ok = true;", encoding="utf-8")


def write_image(path: Path) -> None:
    buffer = BytesIO()
    Image.new("RGB", (8, 8), "white").save(buffer, format="PNG")
    path.write_bytes(buffer.getvalue())


class PublicSiteTests(unittest.TestCase):
    def test_public_guestbook_uses_integrated_list_without_type_filters(self):
        root = Path(__file__).resolve().parents[1]
        index_html = (root / "static" / "index.html").read_text(encoding="utf-8")
        guestbook_js = (root / "static" / "js" / "modules" / "guestbook.js").read_text(encoding="utf-8")

        self.assertIn('id="traceList"', index_html)
        self.assertNotIn("data-trace-filter", index_html)
        self.assertNotIn("traceFilter", guestbook_js)
        self.assertNotIn("일반 방명록", guestbook_js)
        self.assertNotIn("사진 방명록", guestbook_js)

    def test_lightbox_and_map_keep_student_photo_actions_neutral(self):
        root = Path(__file__).resolve().parents[1]
        index_html = (root / "static" / "index.html").read_text(encoding="utf-8")
        exhibition_js = (root / "static" / "js" / "exhibition.js").read_text(encoding="utf-8")
        lightbox_js = (root / "static" / "js" / "modules" / "lightbox.js").read_text(encoding="utf-8")
        map_js = (root / "static" / "js" / "modules" / "map-view.js").read_text(encoding="utf-8")

        self.assertIn('id="lightboxPhotoMeta"', index_html)
        self.assertIn("lightbox-photo-meta-list", lightbox_js)
        self.assertIn("dataset.activeTab", lightbox_js)
        self.assertIn("photo-guestbook-grid", lightbox_js)
        self.assertIn("photo-guestbook-actions", lightbox_js)
        self.assertIn('data-lightbox-tab="map"', lightbox_js)
        self.assertNotIn("지도에서 보기", lightbox_js)
        self.assertNotIn("대표 사진", map_js)
        self.assertNotIn("data-map-open-photo", map_js)
        self.assertIn(
            "onFilterPlace: (placeName) => {\n"
            "    gallery.applyPlaceFilter(placeName);\n"
            "    closeMapOverlay();\n"
            "  },",
            exhibition_js,
        )

    def test_exhibition_js_version_includes_module_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            static_dir = Path(temp_dir) / "static"
            write_static_fixture(static_dir)

            first_version = asset_version(static_dir / "js")
            rendered = render_html_template(static_dir / "index.html", static_dir)
            self.assertIn(f"/static/js/exhibition.js?v={first_version}", rendered)

            (static_dir / "js" / "modules" / "utils.js").write_text(
                "export const ok = false; export const changed = true;",
                encoding="utf-8",
            )
            self.assertNotEqual(first_version, asset_version(static_dir / "js"))

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
                year="2026",
                region="서울·경기권",
                category_json='["건축"]',
                place_id="seoul",
                location_name="Seoul Museum",
                lat=37.5,
                lng=127.0,
                description="Public description",
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
            self.assertTrue((output_dir / "static" / "js" / "modules" / "utils.js").exists())
            self.assertTrue((output_dir / EXPORT_MARKER).exists())
            payload = json.loads((output_dir / "data" / "photos.json").read_text(encoding="utf-8"))
            photo = payload["photos"][0]
            self.assertEqual(photo["year"], "2026")
            self.assertEqual(photo["region"], "서울·경기권")
            self.assertEqual(photo["category"], ["건축"])
            self.assertEqual(photo["placeId"], "seoul")
            self.assertEqual(photo["locationName"], "Seoul Museum")
            self.assertEqual(photo["lat"], 37.5)
            self.assertEqual(photo["lng"], 127.0)
            self.assertEqual(photo["description"], "Public description")
            self.assertNotIn("originalName", photo)
            self.assertNotIn("createdAt", photo)
            self.assertNotIn("updatedAt", photo)

            admin_photo = serialize_admin_photo(database.list_photos()[0], uploads_dir)
            self.assertEqual(admin_photo["originalName"], "photo.png")
            self.assertIn("createdAt", admin_photo)
            self.assertIn("updatedAt", admin_photo)
            headers_text = (output_dir / "_headers").read_text(encoding="utf-8")
            self.assertIn("Content-Security-Policy", headers_text)
            self.assertIn("img-src 'self' data: blob:", headers_text)
            self.assertIn("/static/js/*\n  Cache-Control: public, max-age=0, must-revalidate", headers_text)

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
