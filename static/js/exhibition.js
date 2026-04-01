const stream = document.getElementById("photoStream");
const emptyState = document.getElementById("emptyState");
const introOverlay = document.getElementById("introOverlay");
const siteTopbar = document.getElementById("siteTopbar");
const lightbox = document.getElementById("lightbox");
const lightboxContent = document.getElementById("lightboxContent");
const lightboxImage = document.getElementById("lightboxImage");
const lightboxMeta = document.getElementById("lightboxMeta");
const historyTrigger = document.getElementById("historyTrigger");
const historyOverlay = document.getElementById("historyOverlay");
const historyPanel = document.getElementById("historyPanel");
const backgroundAudio = document.getElementById("backgroundAudio");
const audioToggle = document.getElementById("audioToggle");
const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

let activePhotoId = null;
let introTimeoutId = null;
let historyCloseTimeoutId = null;
let photos = [];
let audioUnlockBound = false;
let audioShouldPlay = true;
let audioTrackIndex = 0;
let audioPlaylist = [];

function fadeIntro() {
  window.clearTimeout(introTimeoutId);
  introTimeoutId = window.setTimeout(() => {
    introOverlay.classList.add("is-fading");
    window.setTimeout(() => {
      introOverlay.hidden = true;
    }, 950);
  }, 2000);
}

function getAudioPlaylist() {
  if (!backgroundAudio) {
    return [];
  }

  if (audioPlaylist.length) {
    return audioPlaylist;
  }

  const rawTracks = backgroundAudio.dataset.tracks;
  if (!rawTracks) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawTracks);
    if (Array.isArray(parsed)) {
      audioPlaylist = parsed.filter((track) => typeof track === "string" && track.length > 0);
      return audioPlaylist;
    }
  } catch (error) {
    // Fall through to comma-separated parsing for resilience.
  }

  audioPlaylist = rawTracks
    .split(",")
    .map((track) => track.trim())
    .filter(Boolean);

  return audioPlaylist;
}

function loadAudioTrack(index, resetTime = true) {
  if (!backgroundAudio) {
    return false;
  }

  const tracks = getAudioPlaylist();
  if (!tracks.length) {
    return false;
  }

  const normalizedIndex = ((index % tracks.length) + tracks.length) % tracks.length;
  const nextSource = tracks[normalizedIndex];
  audioTrackIndex = normalizedIndex;

  if (backgroundAudio.getAttribute("src") !== nextSource) {
    backgroundAudio.src = nextSource;
  }

  if (resetTime) {
    backgroundAudio.currentTime = 0;
  }

  return true;
}

function ensureAudioSource() {
  if (!backgroundAudio || backgroundAudio.currentSrc) {
    return;
  }

  loadAudioTrack(audioTrackIndex, false);
}

function updateAudioToggle() {
  if (!audioToggle || !backgroundAudio) {
    return;
  }

  const isPlaying = !backgroundAudio.paused && !backgroundAudio.ended;
  audioToggle.textContent = isPlaying ? "\uC74C\uC545 ON" : "\uC74C\uC545 OFF";
  audioToggle.setAttribute("aria-pressed", String(isPlaying));
}

function syncTopbarState() {
  if (!siteTopbar) {
    return;
  }

  siteTopbar.classList.toggle("is-compact", window.scrollY > 48);
}

function bindAudioUnlock() {
  if (!backgroundAudio || audioUnlockBound || !audioShouldPlay) {
    return;
  }

  audioUnlockBound = true;
  const unlockAudio = async () => {
    if (!audioShouldPlay) {
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
      audioUnlockBound = false;
      return;
    }

    try {
      ensureAudioSource();
      await backgroundAudio.play();
      updateAudioToggle();
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
      audioUnlockBound = false;
    } catch (error) {
      // Keep listeners alive until playback is permitted.
    }
  };

  document.addEventListener("pointerdown", unlockAudio);
  document.addEventListener("keydown", unlockAudio);
}

async function startBackgroundAudio() {
  if (!backgroundAudio) {
    return;
  }

  backgroundAudio.volume = 0.22;
  ensureAudioSource();

  try {
    await backgroundAudio.play();
  } catch (error) {
    bindAudioUnlock();
  } finally {
    updateAudioToggle();
  }
}

async function playNextTrack() {
  if (!backgroundAudio || !audioShouldPlay) {
    updateAudioToggle();
    return;
  }

  if (!loadAudioTrack(audioTrackIndex + 1)) {
    return;
  }

  try {
    await backgroundAudio.play();
  } catch (error) {
    bindAudioUnlock();
  } finally {
    updateAudioToggle();
  }
}

async function toggleBackgroundAudio() {
  if (!backgroundAudio) {
    return;
  }

  if (!backgroundAudio.paused) {
    audioShouldPlay = false;
    backgroundAudio.pause();
    updateAudioToggle();
    return;
  }

  audioShouldPlay = true;
  ensureAudioSource();
  try {
    await backgroundAudio.play();
  } catch (error) {
    bindAudioUnlock();
  } finally {
    updateAudioToggle();
  }
}

function supportsHover() {
  return hoverQuery.matches;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shufflePhotos(source) {
  const items = [...source];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

function renderPhoto(photo) {
  return `
    <figure class="photo-item" data-photo-id="${photo.id}">
      <button class="photo-frame" type="button" aria-expanded="false" data-photo-id="${photo.id}">
        <img
          class="photo-image"
          src="${photo.imageUrl}"
          alt="${escapeHtml(photo.location)}, ${escapeHtml(photo.date)}"
          loading="lazy"
        >
      </button>
      <figcaption class="photo-meta">
        <dl class="meta-list">
          <div class="meta-block">
            <dt class="meta-term">\uB0A0\uC9DC</dt>
            <dd class="meta-value">${escapeHtml(photo.date)}</dd>
          </div>
          <div class="meta-block">
            <dt class="meta-term">\uC7A5\uC18C</dt>
            <dd class="meta-value">${escapeHtml(photo.location)}</dd>
          </div>
          <div class="meta-block">
            <dt class="meta-term">\uCD2C\uC601\uC790</dt>
            <dd class="meta-value">${escapeHtml(photo.photographer)}</dd>
          </div>
        </dl>
      </figcaption>
    </figure>
  `;
}

function renderLightboxMeta(photo) {
  return `
    <dl class="lightbox-meta-list">
      <div class="lightbox-meta-item">
        <dt class="lightbox-meta-term">\uB0A0\uC9DC</dt>
        <dd class="lightbox-meta-value">${escapeHtml(photo.date)}</dd>
      </div>
      <div class="lightbox-meta-item">
        <dt class="lightbox-meta-term">\uC7A5\uC18C</dt>
        <dd class="lightbox-meta-value">${escapeHtml(photo.location)}</dd>
      </div>
      <div class="lightbox-meta-item">
        <dt class="lightbox-meta-term">\uCD2C\uC601\uC790</dt>
        <dd class="lightbox-meta-value">${escapeHtml(photo.photographer)}</dd>
      </div>
    </dl>
  `;
}

function syncActiveState() {
  const items = stream.querySelectorAll(".photo-item");
  items.forEach((item) => {
    const isActive = String(activePhotoId) === item.dataset.photoId;
    item.classList.toggle("is-active", isActive);
    item.querySelector(".photo-frame")?.setAttribute("aria-expanded", String(isActive));
  });
}

function activatePhoto(photoId, withHoverState = false) {
  activePhotoId = photoId;
  stream.classList.toggle("is-hovering", withHoverState && photoId !== null);
  syncActiveState();
}

function clearActivePhoto() {
  activePhotoId = null;
  stream.classList.remove("is-hovering");
  syncActiveState();
}

function openLightbox(photoId) {
  const photo = photos.find((entry) => String(entry.id) === String(photoId));
  if (!photo) {
    return;
  }

  lightboxImage.src = photo.imageUrl;
  lightboxImage.alt = `${photo.location}, ${photo.date}`;
  lightboxMeta.innerHTML = renderLightboxMeta(photo);
  lightbox.hidden = false;
  document.body.classList.add("is-lightbox-open");
}

function closeLightbox() {
  if (lightbox.hidden) {
    return;
  }

  lightbox.hidden = true;
  document.body.classList.remove("is-lightbox-open");
  lightboxImage.removeAttribute("src");
  lightboxMeta.innerHTML = "";
}

function openHistoryOverlay() {
  if (!historyOverlay || !historyTrigger) {
    return;
  }

  window.clearTimeout(historyCloseTimeoutId);
  historyOverlay.hidden = false;
  document.body.classList.add("is-history-open");
  historyTrigger.setAttribute("aria-expanded", "true");
  window.requestAnimationFrame(() => {
    historyOverlay.classList.add("is-visible");
  });
}

function closeHistoryOverlay() {
  if (!historyOverlay || historyOverlay.hidden || !historyTrigger) {
    return;
  }

  historyOverlay.classList.remove("is-visible");
  document.body.classList.remove("is-history-open");
  historyTrigger.setAttribute("aria-expanded", "false");
  window.clearTimeout(historyCloseTimeoutId);
  historyCloseTimeoutId = window.setTimeout(() => {
    historyOverlay.hidden = true;
  }, 320);
}

function bindInteractions() {
  const items = stream.querySelectorAll(".photo-item");

  items.forEach((item) => {
    const button = item.querySelector(".photo-frame");
    const photoId = item.dataset.photoId;

    button.addEventListener("focus", () => {
      item.classList.add("is-focused");
      activatePhoto(photoId, false);
    });

    button.addEventListener("blur", () => {
      item.classList.remove("is-focused");
      if (!supportsHover()) {
        return;
      }
      clearActivePhoto();
    });

    button.addEventListener("click", () => {
      openLightbox(photoId);
    });

    item.addEventListener("mouseenter", () => {
      if (!supportsHover()) {
        return;
      }
      activatePhoto(photoId, true);
    });

    item.addEventListener("mouseleave", () => {
      if (!supportsHover()) {
        return;
      }
      clearActivePhoto();
    });
  });
}

async function loadPhotos() {
  const sources = ["/data/photos.json", "/api/photos"];
  let lastError = null;

  for (const source of sources) {
    try {
      const response = await fetch(source, { headers: { Accept: "application/json" } });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "\uC804\uC2DC\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
      }

      if (!payload.photos.length) {
        emptyState.hidden = false;
        stream.innerHTML = "";
        return;
      }

      photos = shufflePhotos(payload.photos);
      emptyState.hidden = true;
      stream.innerHTML = photos.map(renderPhoto).join("");
      bindInteractions();
      return;
    } catch (error) {
      lastError = error;
    }
  }

  emptyState.hidden = false;
  emptyState.textContent =
    lastError?.message || "\uC11C\uBC84\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. `py run.py`\uB85C \uC11C\uBC84\uB97C \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.";
}

hoverQuery.addEventListener("change", clearActivePhoto);
lightbox.addEventListener("click", (event) => {
  if (!event.target.closest(".lightbox-content")) {
    closeLightbox();
  }
});
lightboxContent.addEventListener("click", (event) => {
  event.stopPropagation();
});
historyTrigger?.addEventListener("click", () => {
  if (!historyOverlay) {
    return;
  }

  if (historyOverlay.hidden) {
    openHistoryOverlay();
    return;
  }

  closeHistoryOverlay();
});
historyOverlay?.addEventListener("click", (event) => {
  if (!event.target.closest(".history-panel")) {
    closeHistoryOverlay();
  }
});
historyPanel?.addEventListener("click", (event) => {
  event.stopPropagation();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLightbox();
    closeHistoryOverlay();
  }
});
window.addEventListener("scroll", syncTopbarState, { passive: true });
audioToggle?.addEventListener("click", toggleBackgroundAudio);
backgroundAudio?.addEventListener("play", updateAudioToggle);
backgroundAudio?.addEventListener("pause", updateAudioToggle);
backgroundAudio?.addEventListener("ended", playNextTrack);

fadeIntro();
syncTopbarState();
startBackgroundAudio();
loadPhotos();
