const stream = document.getElementById("photoStream");
const emptyState = document.getElementById("emptyState");
const introOverlay = document.getElementById("introOverlay");
const introCopy = document.getElementById("introCopy");
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
const visitCounter = document.getElementById("visitCounter");
const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

let activePhotoId = null;
let introTimeoutId = null;
let historyCloseTimeoutId = null;
let lightboxCloseTimeoutId = null;
let photos = [];
let audioUnlockBound = false;
let audioShouldPlay = true;
let audioTrackIndex = 0;
let audioPlaylist = [];
let lightboxGhost = null;
let lightboxGhostAnimation = null;
let openLightboxPhotoId = null;
function pickIntroAnchor(options) {
  return options[Math.floor(Math.random() * options.length)];
}

const introAnchor = {
  x: pickIntroAnchor([0.16, 0.3, 0.7, 0.84]),
  y: pickIntroAnchor([0.18, 0.34, 0.66, 0.82])
};

document.body.classList.add("is-intro-active");

function positionIntroCopy() {
  if (!introOverlay || !introCopy) {
    return;
  }

  introCopy.style.setProperty("--intro-left", "50%");
  introCopy.style.setProperty("--intro-top", "50%");

  const overlayRect = introOverlay.getBoundingClientRect();
  const copyRect = introCopy.getBoundingClientRect();
  const marginX = window.innerWidth <= 768 ? 18 : 40;
  const marginY = window.innerWidth <= 768 ? 20 : 48;
  const minLeft = copyRect.width / 2 + marginX;
  const maxLeft = overlayRect.width - copyRect.width / 2 - marginX;
  const minTop = copyRect.height / 2 + marginY;
  const maxTop = overlayRect.height - copyRect.height / 2 - marginY;

  const leftPx = maxLeft > minLeft
    ? minLeft + (maxLeft - minLeft) * introAnchor.x
    : overlayRect.width / 2;
  const topPx = maxTop > minTop
    ? minTop + (maxTop - minTop) * introAnchor.y
    : overlayRect.height / 2;

  introCopy.style.setProperty("--intro-left", `${(leftPx / overlayRect.width) * 100}%`);
  introCopy.style.setProperty("--intro-top", `${(topPx / overlayRect.height) * 100}%`);
}

function fadeIntro() {
  window.clearTimeout(introTimeoutId);
  introTimeoutId = window.setTimeout(() => {
    introOverlay.classList.add("is-fading");
    window.setTimeout(() => {
      introOverlay.hidden = true;
      document.body.classList.remove("is-intro-active");
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

async function incrementVisitCounter() {
  if (!visitCounter) {
    return;
  }

  try {
    const response = await fetch("/api/visits", {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.count !== "number") {
      throw new Error("counter-unavailable");
    }
    visitCounter.textContent = `방문자 ${payload.count}`;
    visitCounter.title = "전체 방문 횟수";
    return;
  } catch (error) {
    try {
      const localCount = Number.parseInt(window.localStorage.getItem("moment-local-visit-count") || "0", 10) + 1;
      window.localStorage.setItem("moment-local-visit-count", String(localCount));
      visitCounter.textContent = `방문자 ${localCount}`;
      visitCounter.title = "현재 브라우저 기준 방문 횟수";
    } catch (storageError) {
      visitCounter.textContent = "방문자 -";
    }
  }
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
            <dt class="meta-term">\uCD2C\uC601</dt>
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
        <dt class="lightbox-meta-term">\uCD2C\uC601</dt>
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

function cleanupLightboxGhost() {
  lightboxGhostAnimation?.cancel();
  lightboxGhostAnimation = null;
  lightboxGhost?.remove();
  lightboxGhost = null;
}

function createGhostImage(sourceImage, rect, radius, shadow) {
  const ghost = sourceImage.cloneNode(true);
  ghost.classList.add("lightbox-ghost");
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.borderRadius = radius;
  ghost.style.boxShadow = shadow;
  ghost.style.transform = "translate(0px, 0px) scale(1, 1)";
  return ghost;
}

function animateGhostBetween(ghost, fromRect, toRect, fromRadius, toRadius, fromShadow, toShadow, duration = 360) {
  const translateX = toRect.left - fromRect.left;
  const translateY = toRect.top - fromRect.top;
  const scaleX = fromRect.width ? toRect.width / fromRect.width : 1;
  const scaleY = fromRect.height ? toRect.height / fromRect.height : 1;

  return ghost.animate(
    [
      {
        transform: "translate(0px, 0px) scale(1, 1)",
        borderRadius: fromRadius,
        boxShadow: fromShadow,
      },
      {
        transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
        borderRadius: toRadius,
        boxShadow: toShadow,
      },
    ],
    {
      duration,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      fill: "forwards",
    },
  );
}

function waitForImageReady(image) {
  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const handleLoad = () => {
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
      resolve();
    };
    const handleError = () => {
      image.removeEventListener("load", handleLoad);
      image.removeEventListener("error", handleError);
      reject(new Error("이미지를 불러오지 못했습니다."));
    };

    image.addEventListener("load", handleLoad, { once: true });
    image.addEventListener("error", handleError, { once: true });
  });
}

function nextAnimationFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

async function openLightbox(photoId, triggerElement) {
  const photo = photos.find((entry) => String(entry.id) === String(photoId));
  if (!photo) {
    return;
  }

  window.clearTimeout(lightboxCloseTimeoutId);
  cleanupLightboxGhost();
  openLightboxPhotoId = String(photoId);

  const sourceImage = triggerElement?.querySelector(".photo-image") || triggerElement?.querySelector("img");
  const sourceRect = sourceImage?.getBoundingClientRect();
  const sourceRadius = sourceImage ? window.getComputedStyle(sourceImage).borderTopLeftRadius : "0px";
  const sourceShadow = sourceImage ? window.getComputedStyle(sourceImage).boxShadow : "0 18px 42px rgba(0, 0, 0, 0.1)";

  lightboxImage.src = photo.imageUrl;
  lightboxImage.alt = `${photo.location}, ${photo.date}`;
  lightboxMeta.innerHTML = renderLightboxMeta(photo);
  lightbox.hidden = false;
  document.body.classList.add("is-lightbox-open");
  lightbox.classList.add("is-opening");
  lightbox.classList.add("is-visible");

  try {
    await waitForImageReady(lightboxImage);
    await nextAnimationFrame();
  } catch (error) {
    lightbox.classList.remove("is-opening");
    lightbox.classList.remove("is-visible");
    lightbox.hidden = true;
    document.body.classList.remove("is-lightbox-open");
    openLightboxPhotoId = null;
    return;
  }

  const targetRect = lightboxImage.getBoundingClientRect();
  if (
    !sourceRect ||
    sourceRect.width <= 0 ||
    sourceRect.height <= 0 ||
    targetRect.width <= 0 ||
    targetRect.height <= 0
  ) {
    lightbox.classList.remove("is-opening");
    return;
  }

  lightboxGhost = createGhostImage(sourceImage, sourceRect, sourceRadius, sourceShadow);
  document.body.append(lightboxGhost);

  lightboxGhostAnimation = animateGhostBetween(
    lightboxGhost,
    sourceRect,
    targetRect,
    sourceRadius,
    "0px",
    sourceShadow,
    "0 32px 64px rgba(0, 0, 0, 0.12)",
    320,
  );

  try {
    await lightboxGhostAnimation.finished;
  } catch (error) {
    // Ignore cancellations caused by early close/open cycles.
  } finally {
    cleanupLightboxGhost();
    lightbox.classList.remove("is-opening");
  }
}

function closeLightbox() {
  if (lightbox.hidden) {
    return;
  }

  window.clearTimeout(lightboxCloseTimeoutId);
  cleanupLightboxGhost();
  lightbox.classList.remove("is-opening");

  const sourceImage = openLightboxPhotoId
    ? stream.querySelector(`.photo-item[data-photo-id="${openLightboxPhotoId}"] .photo-image`)
    : null;
  const sourceRect = sourceImage?.getBoundingClientRect();
  const targetRect = lightboxImage.getBoundingClientRect();

  if (
    sourceImage &&
    sourceRect &&
    sourceRect.width > 0 &&
    sourceRect.height > 0 &&
    targetRect.width > 0 &&
    targetRect.height > 0
  ) {
    const sourceRadius = window.getComputedStyle(sourceImage).borderTopLeftRadius;
    const sourceShadow = window.getComputedStyle(sourceImage).boxShadow;
    const targetShadow = window.getComputedStyle(lightboxImage).boxShadow;

    lightbox.classList.add("is-closing");
    lightboxGhost = createGhostImage(lightboxImage, targetRect, "0px", targetShadow);
    document.body.append(lightboxGhost);

    lightboxGhostAnimation = animateGhostBetween(
      lightboxGhost,
      targetRect,
      sourceRect,
      "0px",
      sourceRadius,
      targetShadow,
      sourceShadow,
      280,
    );

    lightboxGhostAnimation.finished
      .catch(() => {})
      .finally(() => {
        cleanupLightboxGhost();
        lightbox.classList.remove("is-closing");
      });
  }

  lightbox.classList.remove("is-visible");
  document.body.classList.remove("is-lightbox-open");
  lightboxCloseTimeoutId = window.setTimeout(() => {
    cleanupLightboxGhost();
    lightbox.classList.remove("is-closing");
    lightbox.hidden = true;
    lightboxImage.removeAttribute("src");
    lightboxMeta.innerHTML = "";
    openLightboxPhotoId = null;
  }, 320);
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
      openLightbox(photoId, button);
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
window.addEventListener("resize", positionIntroCopy, { passive: true });
audioToggle?.addEventListener("click", toggleBackgroundAudio);
backgroundAudio?.addEventListener("play", updateAudioToggle);
backgroundAudio?.addEventListener("pause", updateAudioToggle);
backgroundAudio?.addEventListener("ended", playNextTrack);

positionIntroCopy();
document.fonts?.ready.then(positionIntroCopy).catch(() => {});
fadeIntro();
syncTopbarState();
incrementVisitCounter();
startBackgroundAudio();
loadPhotos();
