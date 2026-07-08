import { loadTraces, submitTrace } from "./api.js";
import { displayLocation, escapeHtml, isCoordinatePair } from "./utils.js";

export function createLightbox({
  lightbox,
  lightboxContent,
  lightboxImage,
  lightboxImageBuffer,
  lightboxPhotoMeta,
  lightboxMeta,
  gallery,
  onTraceChange,
  onShowMap,
}) {
  let openPhoto = null;
  let activeTab = "info";
  let photoEntries = [];
  let photoCount = 0;
  let swapToken = 0;

  function resetBuffer() {
    lightboxImageBuffer?.classList.remove("is-visible");
    lightboxImageBuffer?.removeAttribute("src");
  }

  function renderPhotoMeta(photo) {
    const location = displayLocation(photo);
    const items = [
      ["날짜", photo.date],
      ["장소", location],
      ["촬영", photo.photographer],
      ["권역", photo.region],
    ].filter(([, value]) => String(value || "").trim());

    if (!items.length) {
      return "";
    }

    return `
      <dl class="lightbox-photo-meta-list">
        ${items.map(([term, value]) => `
          <div class="lightbox-photo-meta-item">
            <dt class="lightbox-photo-meta-term">${escapeHtml(term)}</dt>
            <dd class="lightbox-photo-meta-value">${escapeHtml(value)}</dd>
          </div>
        `).join("")}
      </dl>
    `;
  }

  function renderInfoPanel(photo) {
    if (!photo.description) {
      return "";
    }

    return `
      <div class="lightbox-tab-panel">
        <p class="lightbox-description">${escapeHtml(photo.description)}</p>
      </div>
    `;
  }

  function renderPhotoEntry(entry) {
    return `
      <article class="photo-guestbook-entry">
        <div class="trace-entry-copy">
          <span>${escapeHtml(entry.affiliation)}</span>
          <span class="trace-entry-separator">/</span>
          <span class="trace-entry-name">${escapeHtml(entry.name)}</span>
        </div>
        ${entry.text ? `<p class="trace-entry-body">${escapeHtml(entry.text)}</p>` : ""}
      </article>
    `;
  }

  function renderGuestbookPanel(photo) {
    const entriesMarkup = photoEntries.length
      ? photoEntries.map(renderPhotoEntry).join("")
      : `<p class="trace-empty">이 사진에 남겨진 방명록이 아직 없습니다.</p>`;
    return `
      <div class="lightbox-tab-panel">
        <p class="photo-guestbook-summary">이 사진에 ${photoCount}개의 방명록이 달렸습니다.</p>
        <form class="trace-form photo-guestbook-form" id="photoGuestbookForm">
          <input type="hidden" name="type" value="photo">
          <input type="hidden" name="photoId" value="${photo.id}">
          <label class="trace-field">
            <span>소속</span>
            <input class="trace-input" type="text" name="affiliation" maxlength="80" autocomplete="organization" required>
          </label>
          <label class="trace-field">
            <span>이름</span>
            <input class="trace-input" type="text" name="name" maxlength="40" autocomplete="name" required>
          </label>
          <label class="trace-field trace-field-wide">
            <span>내용</span>
            <textarea class="trace-input trace-textarea" name="text" maxlength="500" rows="3" required></textarea>
          </label>
          <button class="trace-submit" type="submit">남기기</button>
          <p class="trace-status" id="photoGuestbookStatus" role="status" aria-live="polite"></p>
        </form>
        <div class="photo-guestbook-list">${entriesMarkup}</div>
      </div>
    `;
  }

  function renderPanel() {
    if (!openPhoto) {
      return;
    }

    const hasMap = isCoordinatePair(openPhoto);
    const hasInfoPanel = Boolean(openPhoto.description);
    const panelMarkup = activeTab === "guestbook"
      ? renderGuestbookPanel(openPhoto)
      : renderInfoPanel(openPhoto);
    lightboxMeta.innerHTML = `
      <div class="lightbox-tabs ${activeTab === "info" && !hasInfoPanel ? "is-compact" : ""}" role="tablist" aria-label="사진 정보">
        <button class="lightbox-tab ${activeTab === "info" ? "is-active" : ""}" type="button" data-lightbox-tab="info">정보</button>
        <button class="lightbox-tab ${activeTab === "guestbook" ? "is-active" : ""}" type="button" data-lightbox-tab="guestbook">방명록 ${photoCount}</button>
        ${hasMap ? `<button class="lightbox-tab" type="button" data-lightbox-tab="map">지도</button>` : ""}
      </div>
      ${panelMarkup}
    `;

    lightboxMeta.querySelectorAll("[data-lightbox-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.lightboxTab === "map") {
          onShowMap(openPhoto);
          return;
        }
        activeTab = button.dataset.lightboxTab;
        renderPanel();
        if (activeTab === "guestbook") {
          loadPhotoGuestbook(openPhoto.id);
        }
      });
    });

    lightboxMeta.querySelector("#photoGuestbookForm")?.addEventListener("submit", submitPhotoGuestbook);
  }

  async function loadPhotoGuestbook(photoId) {
    try {
      const payload = await loadTraces({ photoId });
      if (!openPhoto || String(openPhoto.id) !== String(photoId)) {
        return;
      }
      photoEntries = payload.entries;
      photoCount = Number(payload.count || payload.entries.length || 0);
      renderPanel();
    } catch (error) {
      const status = lightboxMeta.querySelector("#photoGuestbookStatus");
      if (status) {
        status.textContent = error.message || "사진 방명록을 불러오지 못했습니다.";
        status.classList.add("is-error");
      }
    }
  }

  async function submitPhotoGuestbook(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector("#photoGuestbookStatus");
    const submitButton = form.querySelector(".trace-submit");
    const formData = new FormData(form);
    const payload = {
      type: "photo",
      photoId: Number(formData.get("photoId")),
      affiliation: String(formData.get("affiliation") || "").trim(),
      name: String(formData.get("name") || "").trim(),
      text: String(formData.get("text") || "").trim(),
    };

    if (!payload.affiliation || !payload.name || !payload.text) {
      status.textContent = "소속, 이름, 내용을 모두 입력해 주세요.";
      status.classList.add("is-error");
      return;
    }

    submitButton?.setAttribute("disabled", "disabled");
    status.textContent = "사진 방명록을 남기는 중입니다.";
    status.classList.remove("is-error");

    try {
      const result = await submitTrace(payload);
      form.reset();
      onTraceChange(result.entries, Number(result.count || 0));
      await loadPhotoGuestbook(payload.photoId);
      status.textContent = "";
    } catch (error) {
      status.textContent = error.message || "사진 방명록을 남기지 못했습니다.";
      status.classList.add("is-error");
    } finally {
      submitButton?.removeAttribute("disabled");
    }
  }

  async function swapHighRes(photo, currentToken) {
    if (!photo.lightboxUrl || photo.lightboxUrl === photo.imageUrl || !lightboxImageBuffer) {
      return;
    }
    const highResImage = new Image();
    highResImage.decoding = "async";
    highResImage.src = photo.lightboxUrl;
    highResImage.onload = async () => {
      try {
        await highResImage.decode();
      } catch (error) {
        // Loaded pixels are still usable.
      }
      if (lightbox.hidden || currentToken !== swapToken || String(openPhoto?.id) !== String(photo.id)) {
        return;
      }
      lightboxImageBuffer.src = photo.lightboxUrl;
      window.requestAnimationFrame(() => {
        lightboxImageBuffer.classList.add("is-visible");
      });
    };
  }

  function open(photoId) {
    const photo = gallery.findPhoto(photoId);
    if (!photo) {
      return;
    }

    openPhoto = photo;
    activeTab = "info";
    photoEntries = [];
    photoCount = 0;
    swapToken += 1;
    const currentToken = swapToken;
    const location = displayLocation(photo);

    resetBuffer();
    lightboxImage.src = photo.imageUrl;
    lightboxImage.alt = `${location}, ${photo.date}`;
    if (lightboxImageBuffer) {
      lightboxImageBuffer.alt = `${location}, ${photo.date}`;
    }
    if (lightboxPhotoMeta) {
      lightboxPhotoMeta.innerHTML = renderPhotoMeta(photo);
    }
    renderPanel();
    lightbox.hidden = false;
    document.body.classList.add("is-lightbox-open");
    window.requestAnimationFrame(() => {
      lightbox.classList.add("is-visible");
    });
    loadPhotoGuestbook(photo.id);
    swapHighRes(photo, currentToken);
  }

  function close() {
    if (lightbox.hidden) {
      return;
    }
    lightbox.classList.remove("is-visible");
    document.body.classList.remove("is-lightbox-open");
    swapToken += 1;
    window.setTimeout(() => {
      if (lightbox.classList.contains("is-visible")) {
        return;
      }
      lightbox.hidden = true;
      lightboxImage.removeAttribute("src");
      resetBuffer();
      if (lightboxPhotoMeta) {
        lightboxPhotoMeta.innerHTML = "";
      }
      lightboxMeta.innerHTML = "";
      openPhoto = null;
      photoEntries = [];
      photoCount = 0;
    }, 220);
  }

  lightbox.addEventListener("click", (event) => {
    if (!event.target.closest(".lightbox-content")) {
      close();
    }
  });
  lightboxContent.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  return {
    open,
    close,
  };
}
