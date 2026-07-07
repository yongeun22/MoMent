export async function loadPhotosPayload() {
  const sources = ["/data/photos.json", "/api/photos"];
  let lastError = null;

  for (const source of sources) {
    try {
      const response = await fetch(source, { headers: { Accept: "application/json" } });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "전시를 불러오지 못했습니다.");
      }
      if (!Array.isArray(payload.photos)) {
        throw new Error("전시 데이터 형식이 올바르지 않습니다.");
      }
      return payload;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("서버에 연결할 수 없습니다. `py run.py`로 서버를 실행해 주세요.");
}

export async function loadTraces({ photoId = null, type = null } = {}) {
  const url = new URL("/api/traces", window.location.origin);
  if (photoId) {
    url.searchParams.set("photoId", photoId);
  }
  if (type && type !== "all") {
    url.searchParams.set("type", type);
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(payload.entries)) {
    throw new Error(payload.error || "방명록을 불러오지 못했습니다.");
  }
  return payload;
}

export async function submitTrace(payload) {
  const response = await fetch("/api/traces", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(result.entries)) {
    throw new Error(result.error || "방명록을 남기지 못했습니다.");
  }
  return result;
}

export async function recordVisit() {
  const response = await fetch("/api/visits", {
    method: "POST",
    headers: { Accept: "application/json" },
    keepalive: true,
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

export async function loadStatusUpdatePayload() {
  const response = await fetch("/api/status-update", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}
