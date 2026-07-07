import { loadTraces, submitTrace } from "./api.js";
import { displayLocation, escapeHtml, photoById } from "./utils.js";

export function createGuestbook({
  traceForm,
  traceCountText,
  traceList,
  traceStatus,
  getPhotos,
  openLightbox,
}) {
  let tracesLoaded = false;
  let entries = [];
  let count = 0;

  function setStatus(message, isError = false) {
    if (!traceStatus) {
      return;
    }
    traceStatus.textContent = message;
    traceStatus.classList.toggle("is-error", isError);
  }

  function renderCount() {
    if (!traceCountText) {
      return;
    }
    traceCountText.textContent = `지금까지 ${Number(count || 0)}개의 방명록이 남았습니다`;
  }

  function renderEntry(entry) {
    const photo = entry.type === "photo" ? photoById(getPhotos(), entry.photoId) : null;
    const location = photo ? displayLocation(photo) : "";
    const thumb = photo ? `
      <button class="trace-entry-thumb" type="button" data-open-photo="${photo.id}" aria-label="${escapeHtml(location)} 사진 열기">
        <img src="${photo.imageUrl}" alt="">
      </button>
    ` : "";
    const meta = location ? `
      <div class="trace-entry-meta">
        <span>${escapeHtml(location)}</span>
      </div>
    ` : "";
    return `
      <article class="trace-entry" data-trace-id="${entry.id}">
        ${thumb}
        <div class="trace-entry-shell">
          <div class="trace-entry-copy">
            <span>${escapeHtml(entry.affiliation)}</span>
            <span class="trace-entry-separator">/</span>
            <span class="trace-entry-name">${escapeHtml(entry.name)}</span>
          </div>
          ${entry.text ? `<p class="trace-entry-body">${escapeHtml(entry.text)}</p>` : ""}
          ${meta}
        </div>
      </article>
    `;
  }

  function renderList() {
    if (!traceList) {
      return;
    }

    if (!entries.length) {
      traceList.innerHTML = `<p class="trace-empty">아직 남겨진 방명록이 없습니다.</p>`;
      return;
    }

    traceList.innerHTML = entries.map(renderEntry).join("");
    traceList.querySelectorAll("[data-open-photo]").forEach((button) => {
      button.addEventListener("click", () => {
        openLightbox(button.dataset.openPhoto, button);
      });
    });
  }

  function setEntries(nextEntries, nextCount) {
    entries = Array.isArray(nextEntries) ? nextEntries : [];
    count = Number(nextCount || entries.length || 0);
    renderCount();
    renderList();
  }

  async function load({ force = false } = {}) {
    if (!traceList || (!force && tracesLoaded)) {
      return;
    }

    setStatus("방명록을 불러오는 중입니다.");
    try {
      const payload = await loadTraces();
      setEntries(payload.entries, payload.count);
      tracesLoaded = true;
      setStatus("");
    } catch (error) {
      setStatus(error.message || "방명록을 불러오지 못했습니다.", true);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!traceForm) {
      return;
    }

    const submitButton = traceForm.querySelector(".trace-submit");
    const formData = new FormData(traceForm);
    const payload = {
      type: "general",
      affiliation: String(formData.get("affiliation") || "").trim(),
      name: String(formData.get("name") || "").trim(),
      text: String(formData.get("text") || "").trim(),
    };

    if (!payload.affiliation || !payload.name || !payload.text) {
      setStatus("소속, 이름, 내용을 모두 입력해 주세요.", true);
      return;
    }

    submitButton?.setAttribute("disabled", "disabled");
    setStatus("방명록을 남기는 중입니다.");

    try {
      const result = await submitTrace(payload);
      traceForm.reset();
      setEntries(result.entries, result.count);
      tracesLoaded = true;
      setStatus("");
    } catch (error) {
      setStatus(error.message || "방명록을 남기지 못했습니다.", true);
    } finally {
      submitButton?.removeAttribute("disabled");
    }
  }

  traceForm?.addEventListener("submit", handleSubmit);

  return {
    load,
    setEntries,
  };
}
