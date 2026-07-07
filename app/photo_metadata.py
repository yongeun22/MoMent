from __future__ import annotations

from hashlib import sha1
import json
import re
import unicodedata


DEFAULT_REGION = "기타"
MAX_SHORT_FIELD_LENGTH = 200
MAX_DESCRIPTION_LENGTH = 1000
MAX_CATEGORY_ITEMS = 12
MAX_CATEGORY_LENGTH = 60
REGION_OPTIONS = (
    "서울·경기권",
    "강원권",
    "충청권",
    "전라권",
    "경상권",
    "경주권",
    "제주권",
    "해외",
    "기타",
)
REGION_ALIASES = {
    "서울경기권": "서울·경기권",
    "서울 경기권": "서울·경기권",
    "서울/경기권": "서울·경기권",
}


def extract_year(value: str) -> str:
    match = re.search(r"(19|20)\d{2}", str(value or ""))
    return match.group(0) if match else ""


def stable_place_id(location_name: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(location_name or "").strip()).casefold()
    normalized = re.sub(r"\s+", " ", normalized)
    if not normalized:
        normalized = "unknown"
    digest = sha1(normalized.encode("utf-8")).hexdigest()[:12]
    return f"place_{digest}"


def normalize_place_id(value: str, location_name: str) -> str:
    raw_value = str(value or "").strip()
    if not raw_value:
        return stable_place_id(location_name)

    normalized = re.sub(r"[^0-9A-Za-z_\-\u3131-\u318e\uac00-\ud7a3]+", "_", raw_value)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    if not normalized:
        return stable_place_id(location_name)
    if len(normalized) > MAX_SHORT_FIELD_LENGTH:
        raise ValueError("placeId는 200자 이하로 입력해 주세요.")
    return normalized


def parse_categories(value) -> list[str]:
    if isinstance(value, list):
        raw_items = value
    else:
        text = str(value or "").strip()
        if not text:
            return []
        if text.startswith("["):
            try:
                parsed = json.loads(text)
                raw_items = parsed if isinstance(parsed, list) else [text]
            except json.JSONDecodeError:
                raw_items = re.split(r"[,;\n]", text)
        else:
            raw_items = re.split(r"[,;\n]", text)

    categories: list[str] = []
    seen: set[str] = set()
    for raw_item in raw_items:
        category = str(raw_item or "").strip()
        if not category:
            continue
        if len(category) > MAX_CATEGORY_LENGTH:
            raise ValueError(f"주제는 항목당 {MAX_CATEGORY_LENGTH}자 이하로 입력해 주세요.")
        key = category.casefold()
        if key in seen:
            continue
        seen.add(key)
        categories.append(category)

    if len(categories) > MAX_CATEGORY_ITEMS:
        raise ValueError(f"주제는 최대 {MAX_CATEGORY_ITEMS}개까지 입력할 수 있습니다.")
    return categories


def normalize_region(value: str) -> str:
    region = str(value or DEFAULT_REGION).strip()
    return REGION_ALIASES.get(region, region)


def categories_to_json(categories: list[str]) -> str:
    return json.dumps(categories, ensure_ascii=False, separators=(",", ":"))


def categories_from_json(value: str) -> list[str]:
    try:
        parsed = json.loads(str(value or "[]"))
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item).strip() for item in parsed if str(item or "").strip()]


def parse_coordinate(value: str, *, label: str, minimum: float, maximum: float) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        coordinate = float(text)
    except ValueError as exc:
        raise ValueError(f"{label}는 숫자로 입력해 주세요.") from exc
    if coordinate < minimum or coordinate > maximum:
        raise ValueError(f"{label} 범위가 올바르지 않습니다.")
    return coordinate


def normalize_photo_payload(fields: dict) -> dict:
    date_text = str(fields.get("date", "")).strip()
    location = str(fields.get("location", "")).strip()
    photographer = str(fields.get("photographer", "")).strip()
    location_name = str(fields.get("locationName") or fields.get("location_name") or location).strip()
    year = str(fields.get("year") or extract_year(date_text)).strip()
    region = normalize_region(fields.get("region") or DEFAULT_REGION)
    description = str(fields.get("description", "")).strip()
    categories = parse_categories(fields.get("category") or fields.get("categories") or "")

    labels = {
        "date_text": "날짜",
        "location": "장소",
        "photographer": "촬영",
        "location_name": "표시 장소명",
        "year": "연도",
        "region": "권역",
    }
    required_values = {
        "date_text": date_text,
        "location": location,
        "photographer": photographer,
        "location_name": location_name,
        "year": year,
        "region": region,
    }
    for key, value in required_values.items():
        if not value:
            raise ValueError(f"{labels[key]}는 필수입니다.")
        if len(value) > MAX_SHORT_FIELD_LENGTH:
            raise ValueError(f"{labels[key]}는 {MAX_SHORT_FIELD_LENGTH}자 이하로 입력해 주세요.")

    if region not in REGION_OPTIONS:
        raise ValueError("권역 값이 올바르지 않습니다.")
    if not re.fullmatch(r"(19|20)\d{2}", year):
        raise ValueError("연도는 4자리 숫자로 입력해 주세요.")
    if len(description) > MAX_DESCRIPTION_LENGTH:
        raise ValueError(f"설명은 {MAX_DESCRIPTION_LENGTH}자 이하로 입력해 주세요.")

    lat = parse_coordinate(fields.get("lat", ""), label="위도", minimum=-90, maximum=90)
    lng = parse_coordinate(fields.get("lng", ""), label="경도", minimum=-180, maximum=180)
    if (lat is None) != (lng is None):
        raise ValueError("지도 좌표는 위도와 경도를 함께 입력해 주세요.")

    return {
        "date_text": date_text,
        "location": location,
        "photographer": photographer,
        "year": year,
        "region": region,
        "category_json": categories_to_json(categories),
        "place_id": normalize_place_id(fields.get("placeId") or fields.get("place_id") or "", location_name),
        "location_name": location_name,
        "lat": lat,
        "lng": lng,
        "description": description,
    }
