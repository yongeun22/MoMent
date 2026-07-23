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

export function stableShufflePhotos(source, storageKey = "moment-photo-order-v1") {
  const photos = [...source];
  const byId = new Map(photos.map((photo) => [String(photo.id), photo]));
  let savedIds = [];
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(storageKey) || "[]");
    if (Array.isArray(parsed)) {
      savedIds = parsed.map(String).filter((id) => byId.has(id));
    }
  } catch (error) {
    savedIds = [];
  }

  const seen = new Set(savedIds);
  const newPhotos = shufflePhotos(photos.filter((photo) => !seen.has(String(photo.id))));
  const ordered = [
    ...savedIds.map((id) => byId.get(id)),
    ...newPhotos,
  ];
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(ordered.map((photo) => String(photo.id))));
  } catch (error) {
    // Session storage is optional; the current in-memory order remains stable.
  }
  return ordered;
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
