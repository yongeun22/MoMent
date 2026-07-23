import { loadTraces, submitTrace } from "./api.js";
import { createDialogController } from "./dialog.js";
import { displayLocation, escapeHtml, isCoordinatePair } from "./utils.js";

export function createLightbox({
  lightbox,
  lightboxContent,
  lightboxImage,
  lightboxImageBuffer,
  lightboxPhotoMeta,
  lightboxMeta,
  lightboxClose,
  lightboxPrevious,
  lightboxNext,
  lightboxPosition,
  gallery,
  onTraceChange,
  onShowMap,
  onPhotoChange,
  onClose,
}) {
  let openPhoto = null;
  let activeTab = "info";
  let photoEntries = [];
  let photoCount = 0;
  let swapToken = 0;
  let shouldNotifyClose = true;
  let swipeStart = null;

  function resetBuffer() {
    lightboxImageBuffer?.classList.remove("is-visible");
    lightboxImageBuffer?.removeAttribute("src");
  }

  function cleanup() {
    lightboxImage.removeAttribute("src");
    resetBuffer();
    if (lightboxPhotoMeta) {
      lightboxPhotoMeta.innerHTML = "";
    }
    lightboxMeta.innerHTML = "";
    delete lightboxContent.dataset.activeTab;
    openPhoto = null;
    photoEntries = [];
    photoCount = 0;
  }

  const dialog = createDialogController({
    overlay: lightbox,
    panel: lightboxContent,
    bodyClass: "is-lightbox-open",
    transitionMs: 220,
    initialFocus: () => lightboxClose,
    onClosing: () => {
      swapToken += 1;
      if (shouldNotifyClose) {
        onClose?.();
      }
    },
    onClosed: cleanup,
  });

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
    return `
      <div class="lightbox-tab-panel" id="lightboxInfoPanel" role="tabpanel" aria-labelledby="lightboxInfoTab" tabindex="0">
        ${photo.description ? `<p class="lightbox-description">${escapeHtml(photo.description)}</p>` : ""}
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
      : '<p class="trace-empty">이 사진에 남겨진 방명록이 아직 없습니다.</p>';
    return `
      <div class="lightbox-tab-panel photo-guestbook-panel" id="lightboxGuestbookPanel" role="tabpanel" aria-labelledby="lightboxGuestbookTab" tabindex="0">
        <p class="photo-guestbook-summary">이 사진에 ${photoCount}개의 방명록이 달렸습니다.</p>
        <div class="photo-guestbook-grid">
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
            <div class="photo-guestbook-actions">
              <button class="trace-submit" type="submit">남기기</button>
              <p class="trace-status" id="photoGuestbookStatus" role="status" aria-live="polite"></p>
            </div>
          </form>
          <div class="photo-guestbook-list">${entriesMarkup}</div>
        </div>
      </div>
    `;
  }

  function selectTab(nextTab, { focus = false } = {}) {
    if (!new Set(["info", "guestbook"]).has(nextTab)) {
      return;
    }
    activeTab = nextTab;
    renderPanel({ focusSelectedTab: focus });
    if (activeTab === "guestbook" && openPhoto) {
      loadPhotoGuestbook(openPhoto.id);
    }
  }

  function handleTabKeydown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    const tabs = [...lightboxMeta.querySelectorAll('[role="tab"]')];
    const currentIndex = tabs.indexOf(event.currentTarget);
    if (currentIndex < 0 || !tabs.length) {
      return;
    }
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    selectTab(tabs[nextIndex].dataset.lightboxTab, { focus: true });
  }

  function renderPanel({ focusSelectedTab = false } = {}) {
    if (!openPhoto) {
      return;
    }

    lightboxContent.dataset.activeTab = activeTab;
    const hasMap = isCoordinatePair(openPhoto);
    const hasInfoPanel = Boolean(openPhoto.description);
    const panelMarkup = activeTab === "guestbook"
      ? renderGuestbookPanel(openPhoto)
      : renderInfoPanel(openPhoto);
    lightboxMeta.innerHTML = `
      <div class="lightbox-tabs ${activeTab === "info" && !hasInfoPanel ? "is-compact" : ""}" role="tablist" aria-label="사진 정보">
        <button class="lightbox-tab ${activeTab === "info" ? "is-active" : ""}" id="lightboxInfoTab" type="button" role="tab" aria-selected="${activeTab === "info"}" aria-controls="lightboxInfoPanel" tabindex="${activeTab === "info" ? "0" : "-1"}" data-lightbox-tab="info">정보</button>
        <button class="lightbox-tab ${activeTab === "guestbook" ? "is-active" : ""}" id="lightboxGuestbookTab" type="button" role="tab" aria-selected="${activeTab === "guestbook"}" aria-controls="lightboxGuestbookPanel" tabindex="${activeTab === "guestbook" ? "0" : "-1"}" data-lightbox-tab="guestbook">방명록 ${photoCount}</button>
      </div>
      ${hasMap ? '<button class="lightbox-map-button" type="button" data-lightbox-map>지도에서 장소 보기</button>' : ""}
      ${panelMarkup}
    `;

    lightboxMeta.querySelectorAll("[data-lightbox-tab]").forEach((button) => {
      button.addEventListener("click", () => selectTab(button.dataset.lightboxTab, { focus: true }));
      button.addEventListener("keydown", handleTabKeydown);
    });
    lightboxMeta.querySelector("[data-lightbox-map]")?.addEventListener("click", () => onShowMap(openPhoto));
    lightboxMeta.querySelector("#photoGuestbookForm")?.addEventListener("submit", submitPhotoGuestbook);
    if (focusSelectedTab) {
      lightboxMeta.querySelector(`[data-lightbox-tab="${activeTab}"]`)?.focus();
    }
  }

  async function loadPhotoGuestbook(photoId) {
    try {
      const payload = await loadTraces({ photoId });
      if (!openPhoto || String(openPhoto.id) !== String(photoId)) {
        return;
      }
      photoEntries = payload.entries;
      photoCount = Number(payload.count || payload.entries.length || 0);
      if (activeTab === "guestbook") {
        const shouldRestoreTabFocus = document.activeElement?.getAttribute("role") === "tab";
        renderPanel({ focusSelectedTab: shouldRestoreTabFocus });
      } else {
        const guestbookTab = lightboxMeta.querySelector('[data-lightbox-tab="guestbook"]');
        if (guestbookTab) {
          guestbookTab.textContent = `방명록 ${photoCount}`;
        }
      }
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
      [...form.elements].find((field) => field.required && !String(field.value || "").trim())?.focus();
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
      window.requestAnimationFrame(() => lightboxImageBuffer.classList.add("is-visible"));
    };
  }

  function navigationPhotos() {
    const visible = gallery.getVisiblePhotos();
    return visible.some((photo) => String(photo.id) === String(openPhoto?.id))
      ? visible
      : gallery.getPhotos();
  }

  function updateNavigation() {
    const photos = navigationPhotos();
    const index = photos.findIndex((photo) => String(photo.id) === String(openPhoto?.id));
    const hasMultiple = photos.length > 1 && index >= 0;
    if (lightboxPrevious) lightboxPrevious.disabled = !hasMultiple;
    if (lightboxNext) lightboxNext.disabled = !hasMultiple;
    if (lightboxPosition) {
      lightboxPosition.textContent = index >= 0 ? `${index + 1} / ${photos.length}` : "";
    }
  }

  function renderPhoto(photo) {
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
    if (lightboxImageBuffer) lightboxImageBuffer.alt = `${location}, ${photo.date}`;
    if (lightboxPhotoMeta) lightboxPhotoMeta.innerHTML = renderPhotoMeta(photo);
    renderPanel();
    updateNavigation();
    loadPhotoGuestbook(photo.id);
    swapHighRes(photo, currentToken);
  }

  function open(photoId, { historyMode = "push", notify = true, returnFocus = null } = {}) {
    const photo = gallery.findPhoto(photoId);
    if (!photo) {
      return false;
    }
    const wasOpen = dialog.isOpen();
    renderPhoto(photo);
    shouldNotifyClose = true;
    if (!wasOpen) {
      dialog.open({ returnFocus });
    }
    if (notify) {
      onPhotoChange?.(photo.id, historyMode);
    }
    return true;
  }

  function navigate(delta) {
    if (!openPhoto) {
      return;
    }
    const photos = navigationPhotos();
    if (photos.length < 2) {
      return;
    }
    const currentIndex = photos.findIndex((photo) => String(photo.id) === String(openPhoto.id));
    const nextIndex = (currentIndex + delta + photos.length) % photos.length;
    open(photos[nextIndex].id, { historyMode: "replace", notify: true });
  }

  function close({ notify = true } = {}) {
    shouldNotifyClose = notify;
    dialog.close();
  }

  lightboxClose?.addEventListener("click", () => close());
  lightboxPrevious?.addEventListener("click", () => navigate(-1));
  lightboxNext?.addEventListener("click", () => navigate(1));

  lightboxContent.addEventListener("keydown", (event) => {
    if (event.target.closest("input, textarea, select, [role='tab']")) {
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigate(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      navigate(1);
    }
  });

  lightboxContent.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, a, input, textarea, select")) {
      swipeStart = null;
      return;
    }
    swipeStart = { x: event.clientX, y: event.clientY };
  });
  lightboxContent.addEventListener("pointerup", (event) => {
    if (!swipeStart) {
      return;
    }
    const deltaX = event.clientX - swipeStart.x;
    const deltaY = event.clientY - swipeStart.y;
    swipeStart = null;
    if (Math.abs(deltaX) < 52 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      return;
    }
    navigate(deltaX < 0 ? 1 : -1);
  });

  return {
    open,
    close,
    isOpen: dialog.isOpen,
    getOpenPhotoId: () => openPhoto?.id ?? null,
  };
}
