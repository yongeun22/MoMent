import { loadTraces, submitTrace } from "./api.js";
import { displayLocation, escapeHtml, isCoordinatePair } from "./utils.js";

export function createLightbox({
  lightbox,
  lightboxContent,
  lightboxImage,
  lightboxImageBuffer,
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

  function renderMetaList(photo) {
    const location = displayLocation(photo);
    return `
      <dl class="lightbox-meta-list">
        <div class="lightbox-meta-item">
          <dt class="lightbox-meta-term">날짜</dt>
          <dd class="lightbox-meta-value">${escapeHtml(photo.date)}</dd>
        </div>
        <div class="lightbox-meta-item">
          <dt class="lightbox-meta-term">장소</dt>
          <dd class="lightbox-meta-value">${escapeHtml(location)}</dd>
        </div>
        <div class="lightbox-meta-item">
          <dt class="lightbox-meta-term">촬영</dt>
          <dd class="lightbox-meta-value">${escapeHtml(photo.photographer)}</dd>
        </div>
        ${photo.region ? `
          <div class="lightbox-meta-item">
            <dt class="lightbox-meta-term">권역</dt>
            <dd class="lightbox-meta-value">${escapeHtml(photo.region)}</dd>
          </div>
        ` : ""}
      </dl>
      ${photo.description ? `<p class="lightbox-description">${escapeHtml(photo.description)}</p>` : ""}
      ${isCoordinatePair(photo) ? `<button class="trace-submit" type="button" data-map-photo="${photo.id}">지도에서 보기</button>` : ""}
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

    lightboxMeta.innerHTML = `
      <div class="lightbox-tabs" role="tablist" aria-label="사진 정보">
        <button class="lightbox-tab ${activeTab === "info" ? "is-active" : ""}" type="button" data-lightbox-tab="info">정보</button>
        <button class="lightbox-tab ${activeTab === "guestbook" ? "is-active" : ""}" type="button" data-lightbox-tab="guestbook">방명록 ${photoCount}</button>
      </div>
      ${activeTab === "info" ? renderMetaList(openPhoto) : renderGuestbookPanel(openPhoto)}
    `;

    lightboxMeta.querySelectorAll("[data-lightbox-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        activeTab = button.dataset.lightboxTab;
        renderPanel();
        if (activeTab === "guestbook") {
          loadPhotoGuestbook(openPhoto.id);
        }
      });
    });

    lightboxMeta.querySelector("[data-map-photo]")?.addEventListener("click", () => {
      onShowMap(openPhoto);
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
