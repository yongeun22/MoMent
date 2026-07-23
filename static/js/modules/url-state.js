const FILTER_KEYS = ["year", "region", "photographer", "place"];

export function normalizeFilters(source = {}) {
  return Object.fromEntries(
    FILTER_KEYS.map((key) => [key, String(source[key] || "").trim()]),
  );
}

export function readExhibitionState() {
  const params = new URLSearchParams(window.location.search);
  return {
    filters: normalizeFilters(Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key)]))),
    photoId: String(params.get("photo") || "").trim() || null,
  };
}

export function writeExhibitionState({ filters, photoId }, { mode = "replace", photoEntry = false } = {}) {
  const url = new URL(window.location.href);
  const normalizedFilters = normalizeFilters(filters);
  FILTER_KEYS.forEach((key) => {
    if (normalizedFilters[key]) {
      url.searchParams.set(key, normalizedFilters[key]);
    } else {
      url.searchParams.delete(key);
    }
  });
  if (photoId !== null && photoId !== undefined && String(photoId).trim()) {
    url.searchParams.set("photo", String(photoId));
  } else {
    url.searchParams.delete("photo");
  }
  const method = mode === "push" ? "pushState" : "replaceState";
  window.history[method](
    { ...window.history.state, momentState: true, momentPhotoEntry: Boolean(photoEntry) },
    "",
    url,
  );
}
