export const REGION_OPTIONS = [
  "서울·경기권",
  "강원권",
  "충청권",
  "전라권",
  "경상권",
  "경주권",
  "제주권",
  "해외",
  "기타",
];

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function displayLocation(photo) {
  return String(photo?.locationName || photo?.location || "").trim();
}

export function uniqueSorted(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "ko-KR"));
}

export function shufflePhotos(source) {
  const items = [...source];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

export function formatKoreanUpdateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.month}/${parts.day} ${parts.hour}시:${parts.minute}분`;
}

export function photoById(photos, photoId) {
  return photos.find((photo) => String(photo.id) === String(photoId)) || null;
}

function hasCoordinateValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));
}

export function isCoordinatePair(photo) {
  return hasCoordinateValue(photo?.lat) && hasCoordinateValue(photo?.lng);
}
