const stream = document.getElementById("photoStream");
const emptyState = document.getElementById("emptyState");
const introOverlay = document.getElementById("introOverlay");
const introEnter = document.getElementById("introEnter");
const siteTopbar = document.getElementById("siteTopbar");
const exhibitionLogo = document.querySelector(".exhibition-logo");
const lightbox = document.getElementById("lightbox");
const lightboxContent = document.getElementById("lightboxContent");
const lightboxImageShell = document.getElementById("lightboxImageShell");
const lightboxImage = document.getElementById("lightboxImage");
const lightboxImageBuffer = document.getElementById("lightboxImageBuffer");
const lightboxMeta = document.getElementById("lightboxMeta");
const historyTrigger = document.getElementById("historyTrigger");
const historyOverlay = document.getElementById("historyOverlay");
const historyPanel = document.getElementById("historyPanel");
const contactTrigger = document.getElementById("contactTrigger");
const contactOverlay = document.getElementById("contactOverlay");
const contactPanel = document.getElementById("contactPanel");
const traceTrigger = document.getElementById("traceTrigger");
const traceOverlay = document.getElementById("traceOverlay");
const tracePanel = document.getElementById("tracePanel");
const traceForm = document.getElementById("traceForm");
const traceCountText = document.getElementById("traceCountText");
const traceList = document.getElementById("traceList");
const traceStatus = document.getElementById("traceStatus");
const visitorCount = document.getElementById("visitorCount");
const visitorSeparator = document.querySelector(".site-visitor-separator");
const backgroundAudio = document.getElementById("backgroundAudio");
const audioToggle = document.getElementById("audioToggle");
const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

let activePhotoId = null;
let introTimeoutId = null;
let historyCloseTimeoutId = null;
let contactCloseTimeoutId = null;
let traceCloseTimeoutId = null;
let lightboxCloseTimeoutId = null;
let photos = [];
let tracesLoaded = false;
let audioUnlockBound = false;
let audioShouldPlay = true;
let audioTrackIndex = 0;
let audioPlaylist = [];
let lightboxGhost = null;
let lightboxGhostAnimation = null;
let openLightboxPhotoId = null;
let highResSwapToken = 0;

function resetLightboxBuffer() {
  if (!lightboxImageBuffer) {
    return;
  }
  lightboxImageBuffer.classList.remove("is-visible");
  lightboxImageBuffer.removeAttribute("src");
}
document.body.classList.add("is-intro-active");

function fadeIntro() {
  if (!introOverlay || introOverlay.hidden) {
    return;
  }

  window.clearTimeout(introTimeoutId);
  introOverlay.classList.add("is-fading");
  introTimeoutId = window.setTimeout(() => {
    introOverlay.hidden = true;
    document.body.classList.remove("is-intro-active");
  }, 950);
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

function runNonCriticalTasks() {
  const execute = () => {
    recordVisit();
    startBackgroundAudio();
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(execute, { timeout: 1500 });
    return;
  }

  window.setTimeout(execute, 320);
}

async function startBackgroundAudio() {
  if (!backgroundAudio) {
    return;
  }

  backgroundAudio.volume = 0.025;
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

function renderPhoto(photo, index) {
  const isPriorityImage = index < 4;
  return `
    <figure class="photo-item" data-photo-id="${photo.id}">
      <button class="photo-frame" type="button" aria-expanded="false" data-photo-id="${photo.id}">
        <img
          class="photo-image"
          src="${photo.imageUrl}"
          ${photo.lightboxUrl ? `data-lightbox-src="${photo.lightboxUrl}"` : ""}
          alt="${escapeHtml(photo.location)}, ${escapeHtml(photo.date)}"
          loading="${isPriorityImage ? "eager" : "lazy"}"
          fetchpriority="${isPriorityImage ? "high" : "low"}"
          decoding="async"
          draggable="false"
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

function animateGhostBetween(ghost, fromRect, toRect, duration = 240) {
  const translateX = toRect.left - fromRect.left;
  const translateY = toRect.top - fromRect.top;
  const scaleX = fromRect.width ? toRect.width / fromRect.width : 1;
  const scaleY = fromRect.height ? toRect.height / fromRect.height : 1;

  return ghost.animate(
    [
      {
        transform: "translate(0px, 0px) scale(1, 1)",
      },
      {
        transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`,
      },
    ],
    {
      duration,
      easing: "cubic-bezier(0.22, 0.8, 0.22, 1)",
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
      reject(new Error("\uC774\uBBF8\uC9C0\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."));
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
  highResSwapToken += 1;
  const currentSwapToken = highResSwapToken;

  const sourceImage = triggerElement?.querySelector(".photo-image") || triggerElement?.querySelector("img");
  const sourceRect = sourceImage?.getBoundingClientRect();
  const sourceRadius = sourceImage ? window.getComputedStyle(sourceImage).borderTopLeftRadius : "0px";
  const sourceShadow = sourceImage ? window.getComputedStyle(sourceImage).boxShadow : "0 18px 42px rgba(0, 0, 0, 0.1)";

  resetLightboxBuffer();
  lightboxImage.src = photo.imageUrl;
  lightboxImage.alt = `${photo.location}, ${photo.date}`;
  if (lightboxImageBuffer) {
    lightboxImageBuffer.alt = `${photo.location}, ${photo.date}`;
  }
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

  const targetRect = lightboxImageShell.getBoundingClientRect();
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
    230,
  );

  try {
    await lightboxGhostAnimation.finished;
  } catch (error) {
    // Ignore cancellations caused by early close/open cycles.
  } finally {
    cleanupLightboxGhost();
    lightbox.classList.remove("is-opening");
  }

  if (photo.lightboxUrl && photo.lightboxUrl !== photo.imageUrl) {
    const highResImage = new Image();
    highResImage.decoding = "async";
    highResImage.src = photo.lightboxUrl;
    highResImage.onload = async () => {
      try {
        await highResImage.decode();
      } catch (error) {
        // Continue with loaded pixels if decode is unsupported or interrupted.
      }

      if (
        lightbox.hidden ||
        openLightboxPhotoId !== String(photo.id) ||
        currentSwapToken !== highResSwapToken ||
        !lightboxImageBuffer
      ) {
        return;
      }

      lightboxImageBuffer.src = photo.lightboxUrl;
      await nextAnimationFrame();
      lightboxImageBuffer.classList.add("is-visible");
    };
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
  const targetRect = lightboxImageShell.getBoundingClientRect();

  if (
    sourceImage &&
    sourceRect &&
    sourceRect.width > 0 &&
    sourceRect.height > 0 &&
    targetRect.width > 0 &&
    targetRect.height > 0
  ) {
    const visibleLightboxImage =
      lightboxImageBuffer &&
      lightboxImageBuffer.classList.contains("is-visible") &&
      lightboxImageBuffer.getAttribute("src")
        ? lightboxImageBuffer
        : lightboxImage;
    const targetRadius = window.getComputedStyle(lightboxImageShell).borderTopLeftRadius;
    const targetShadow = window.getComputedStyle(lightboxImageShell).boxShadow;

    lightbox.classList.add("is-closing");
    lightboxGhost = createGhostImage(visibleLightboxImage, targetRect, targetRadius, targetShadow);
    document.body.append(lightboxGhost);

    lightboxGhostAnimation = animateGhostBetween(
      lightboxGhost,
      targetRect,
      sourceRect,
      190,
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
  highResSwapToken += 1;
  lightboxCloseTimeoutId = window.setTimeout(() => {
    cleanupLightboxGhost();
    lightbox.classList.remove("is-closing");
    lightbox.hidden = true;
    resetLightboxBuffer();
    lightboxImage.removeAttribute("src");
    lightboxMeta.innerHTML = "";
    openLightboxPhotoId = null;
  }, 320);
}

function openInfoOverlay(overlay, trigger, bodyClass, closeTimeoutId) {
  if (!overlay || !trigger) {
    return;
  }

  window.clearTimeout(closeTimeoutId);
  overlay.hidden = false;
  document.body.classList.add(bodyClass);
  trigger.setAttribute("aria-expanded", "true");
  window.requestAnimationFrame(() => {
    overlay.classList.add("is-visible");
  });
}

async function recordVisit() {
  try {
    const response = await fetch("/api/visits", {
      method: "POST",
      headers: { Accept: "application/json" },
      keepalive: true,
    });
    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    const count = Number(payload.count || 0);
    if (!visitorCount || !Number.isFinite(count) || count <= 0) {
      return;
    }

    visitorCount.textContent = `\uBC29\uBB38\uC790 ${count.toLocaleString("ko-KR")}`;
    visitorCount.hidden = false;
    if (visitorSeparator) {
      visitorSeparator.hidden = false;
    }
  } catch (error) {
    // Visit counting should never block the exhibition UI.
  }
}

function closeInfoOverlay(overlay, trigger, bodyClass, closeTimeoutId, setCloseTimeoutId) {
  if (!overlay || overlay.hidden || !trigger) {
    return;
  }

  overlay.classList.remove("is-visible");
  document.body.classList.remove(bodyClass);
  trigger.setAttribute("aria-expanded", "false");
  window.clearTimeout(closeTimeoutId);
  setCloseTimeoutId(
    window.setTimeout(() => {
      overlay.hidden = true;
    }, 320),
  );
}

function openHistoryOverlay() {
  closeContactOverlay();
  closeTraceOverlay();
  openInfoOverlay(historyOverlay, historyTrigger, "is-history-open", historyCloseTimeoutId);
}

function closeHistoryOverlay() {
  closeInfoOverlay(
    historyOverlay,
    historyTrigger,
    "is-history-open",
    historyCloseTimeoutId,
    (timeoutId) => {
      historyCloseTimeoutId = timeoutId;
    },
  );
}

function openContactOverlay() {
  closeHistoryOverlay();
  closeTraceOverlay();
  openInfoOverlay(contactOverlay, contactTrigger, "is-contact-open", contactCloseTimeoutId);
}

function closeContactOverlay() {
  closeInfoOverlay(
    contactOverlay,
    contactTrigger,
    "is-contact-open",
    contactCloseTimeoutId,
    (timeoutId) => {
      contactCloseTimeoutId = timeoutId;
    },
  );
}

function setTraceStatus(message, isError = false) {
  if (!traceStatus) {
    return;
  }

  traceStatus.textContent = message;
  traceStatus.classList.toggle("is-error", isError);
}

function renderTraceCount(count) {
  if (!traceCountText) {
    return;
  }

  const safeCount = Number.isFinite(count) ? count : 0;
  traceCountText.textContent = `\uC9C0\uAE08\uAE4C\uC9C0 ${safeCount}\uAC1C\uC758 \uBC29\uBA85\uB85D\uC774 \uB0A8\uC558\uC2B5\uB2C8\uB2E4`;
}

function renderTraceList(entries) {
  if (!traceList) {
    return;
  }

  if (!entries.length) {
    traceList.innerHTML = `<p class="trace-empty">\uC544\uC9C1 \uB0A8\uACA8\uC9C4 \uBC29\uBA85\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>`;
    return;
  }

  traceList.innerHTML = entries
    .map((entry) => `
      <div class="trace-entry" data-trace-id="${entry.id}">
        <div class="trace-entry-copy">
          <span>${escapeHtml(entry.affiliation)}</span>
          <span class="trace-entry-separator">/</span>
          <span class="trace-entry-name">${escapeHtml(entry.name)}</span>
        </div>
      </div>
    `)
    .join("");
}

async function loadTraces({ force = false } = {}) {
  if (!traceList || (!force && tracesLoaded)) {
    return;
  }

  setTraceStatus("\uBC29\uBA85\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.");

  try {
    const response = await fetch("/api/traces", {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload.entries)) {
      throw new Error(payload.error || "\uBC29\uBA85\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    }

    renderTraceCount(Number(payload.count || 0));
    renderTraceList(payload.entries);
    tracesLoaded = true;
    setTraceStatus("");
  } catch (error) {
    setTraceStatus(error.message || "\uBC29\uBA85\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", true);
  }
}

async function submitTrace(event) {
  event.preventDefault();
  if (!traceForm) {
    return;
  }

  const submitButton = traceForm.querySelector(".trace-submit");
  const formData = new FormData(traceForm);
  const payload = {
    affiliation: String(formData.get("affiliation") || "").trim(),
    name: String(formData.get("name") || "").trim(),
  };

  if (!payload.affiliation || !payload.name) {
    setTraceStatus("\uC18C\uC18D\uACFC \uC774\uB984\uC744 \uBAA8\uB450 \uC785\uB825\uD574 \uC8FC\uC138\uC694.", true);
    return;
  }

  submitButton?.setAttribute("disabled", "disabled");
  setTraceStatus("\uBC29\uBA85\uB85D\uC744 \uB0A8\uAE30\uB294 \uC911\uC785\uB2C8\uB2E4.");

  try {
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
      throw new Error(result.error || "\uBC29\uBA85\uB85D\uC744 \uB0A8\uAE30\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    }

    traceForm.reset();
    renderTraceCount(Number(result.count || 0));
    renderTraceList(result.entries);
    tracesLoaded = true;
    setTraceStatus("");
  } catch (error) {
    setTraceStatus(error.message || "\uBC29\uBA85\uB85D\uC744 \uB0A8\uAE30\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.", true);
  } finally {
    submitButton?.removeAttribute("disabled");
  }
}

function openTraceOverlay() {
  closeHistoryOverlay();
  closeContactOverlay();
  openInfoOverlay(traceOverlay, traceTrigger, "is-trace-open", traceCloseTimeoutId);
  loadTraces();
}

function closeTraceOverlay() {
  closeInfoOverlay(
    traceOverlay,
    traceTrigger,
    "is-trace-open",
    traceCloseTimeoutId,
    (timeoutId) => {
      traceCloseTimeoutId = timeoutId;
    },
  );
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
      stream.innerHTML = photos.map((photo, index) => renderPhoto(photo, index)).join("");
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
contactTrigger?.addEventListener("click", () => {
  if (!contactOverlay) {
    return;
  }

  if (contactOverlay.hidden) {
    openContactOverlay();
    return;
  }

  closeContactOverlay();
});
traceTrigger?.addEventListener("click", () => {
  if (!traceOverlay) {
    return;
  }

  if (traceOverlay.hidden) {
    openTraceOverlay();
    return;
  }

  closeTraceOverlay();
});
historyOverlay?.addEventListener("click", (event) => {
  if (!event.target.closest(".info-panel")) {
    closeHistoryOverlay();
  }
});
historyPanel?.addEventListener("click", (event) => {
  event.stopPropagation();
});
contactOverlay?.addEventListener("click", (event) => {
  if (!event.target.closest(".info-panel")) {
    closeContactOverlay();
  }
});
contactPanel?.addEventListener("click", (event) => {
  event.stopPropagation();
});
traceOverlay?.addEventListener("click", (event) => {
  if (!event.target.closest(".info-panel")) {
    closeTraceOverlay();
  }
});
tracePanel?.addEventListener("click", (event) => {
  event.stopPropagation();
});
traceForm?.addEventListener("submit", submitTrace);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLightbox();
    closeHistoryOverlay();
    closeContactOverlay();
    closeTraceOverlay();
  }
});
window.addEventListener("scroll", syncTopbarState, { passive: true });
introEnter?.addEventListener("click", fadeIntro);
audioToggle?.addEventListener("click", toggleBackgroundAudio);
backgroundAudio?.addEventListener("play", updateAudioToggle);
backgroundAudio?.addEventListener("pause", updateAudioToggle);
backgroundAudio?.addEventListener("ended", playNextTrack);

syncTopbarState();
loadPhotos();
runNonCriticalTasks();
