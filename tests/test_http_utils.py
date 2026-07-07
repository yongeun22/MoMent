import unittest

from app.http_utils import normalize_photo_fields, safe_relative_path
from app.photo_metadata import REGION_OPTIONS, categories_from_json


class HttpUtilsTests(unittest.TestCase):
    def test_region_options_follow_display_order(self):
        self.assertEqual(
            REGION_OPTIONS,
            (
                "서울·경기권",
                "강원권",
                "충청권",
                "전라권",
                "경상권",
                "경주권",
                "제주권",
                "해외",
                "기타",
            ),
        )

    def test_safe_relative_path_accepts_normal_paths(self):
        self.assertEqual(safe_relative_path("display/photo.webp"), "display/photo.webp")

    def test_safe_relative_path_rejects_traversal_and_absolute_paths(self):
        self.assertIsNone(safe_relative_path("../secret.key"))
        self.assertIsNone(safe_relative_path("%2e%2e/secret.key"))
        self.assertIsNone(safe_relative_path("C:\\secret.key"))
        self.assertIsNone(safe_relative_path("//example.com/file"))
        self.assertIsNone(safe_relative_path("nested/./file.jpg"))

    def test_normalize_photo_fields_accepts_required_fields(self):
        normalized = normalize_photo_fields(
            {
                "date": "2026-06-12",
                "location": "Seoul",
                "photographer": "MoMent",
            }
        )

        self.assertEqual(normalized["date_text"], "2026-06-12")
        self.assertEqual(normalized["location"], "Seoul")
        self.assertEqual(normalized["photographer"], "MoMent")
        self.assertEqual(normalized["year"], "2026")
        self.assertEqual(normalized["region"], "기타")
        self.assertEqual(normalized["location_name"], "Seoul")
        self.assertTrue(normalized["place_id"].startswith("place_"))
        self.assertEqual(categories_from_json(normalized["category_json"]), [])

    def test_normalize_photo_fields_rejects_missing_and_long_fields(self):
        with self.assertRaises(ValueError):
            normalize_photo_fields({"date": "", "location": "Seoul", "photographer": "MoMent"})

        with self.assertRaises(ValueError):
            normalize_photo_fields({"date": "x" * 201, "location": "Seoul", "photographer": "MoMent"})

    def test_normalize_photo_fields_accepts_expanded_metadata(self):
        normalized = normalize_photo_fields(
            {
                "date": "2026.01.15.",
                "location": "Gyeongju Bulguksa",
                "locationName": "경주 불국사",
                "photographer": "MoMent",
                "year": "2026",
                "region": "경주권",
                "category": "사찰, 건축",
                "placeId": "bulguksa",
                "lat": "35.7900",
                "lng": "129.3320",
                "description": "설명",
            }
        )

        self.assertEqual(normalized["location_name"], "경주 불국사")
        self.assertEqual(normalized["region"], "경주권")
        self.assertEqual(categories_from_json(normalized["category_json"]), ["사찰", "건축"])
        self.assertEqual(normalized["place_id"], "bulguksa")
        self.assertEqual(normalized["lat"], 35.79)
        self.assertEqual(normalized["lng"], 129.332)
        self.assertEqual(normalized["description"], "설명")

    def test_normalize_photo_fields_accepts_legacy_seoul_region_label(self):
        normalized = normalize_photo_fields(
            {
                "date": "2026",
                "location": "Seoul",
                "photographer": "MoMent",
                "region": "서울경기권",
            }
        )

        self.assertEqual(normalized["region"], "서울·경기권")

    def test_normalize_photo_fields_rejects_partial_coordinates(self):
        with self.assertRaises(ValueError):
            normalize_photo_fields(
                {
                    "date": "2026",
                    "location": "Seoul",
                    "photographer": "MoMent",
                    "lat": "37.5",
                    "lng": "",
                }
            )


if __name__ == "__main__":
    unittest.main()
