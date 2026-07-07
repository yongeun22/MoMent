const moduleVersion = new URL(import.meta.url).searchParams.get("v") || "dev";
const versionedModule = (path) => `${path}?v=${encodeURIComponent(moduleVersion)}`;
const [
  apiModule,
  galleryModule,
  guestbookModule,
  lightboxModule,
  mapViewModule,
  utilsModule,
] = await Promise.all([
  import(versionedModule("./modules/api.js")),
  import(versionedModule("./modules/gallery.js")),
  import(versionedModule("./modules/guestbook.js")),
  import(versionedModule("./modules/lightbox.js")),
  import(versionedModule("./modules/map-view.js")),
  import(versionedModule("./modules/utils.js")),
]);

const { loadPhotosPayload, loadStatusUpdatePayload, recordVisit } = apiModule;
const { createGallery } = galleryModule;
const { createGuestbook } = guestbookModule;
const { createLightbox } = lightboxModule;
const { createMapView } = mapViewModule;
const { formatKoreanUpdateTime, shufflePhotos } = utilsModule;

const stream = document.getElementById("photoStream");
const emptyState = document.getElementById("emptyState");
const introOverlay = document.getElementById("introOverlay");
const introEnter = document.getElementById("introEnter");
const statusUpdated = document.getElementById("statusUpdated");
const siteTopbar = document.getElementById("siteTopbar");
const lightbox = document.getElementById("lightbox");
const lightboxContent = document.getElementById("lightboxContent");
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
const traceClose = document.getElementById("traceClose");
const traceForm = document.getElementById("traceForm");
const traceCountText = document.getElementById("traceCountText");
const traceList = document.getElementById("traceList");
const traceStatus = document.getElementById("traceStatus");
const filterTrigger = document.getElementById("filterTrigger");
const filterOverlay = document.getElementById("filterOverlay");
const filterPanel = document.getElementById("filterPanel");
const filterClose = document.getElementById("filterClose");
const filterControls = document.getElementById("filterControls");
const filterCountText = document.getElementById("filterCountText");
const filterReset = document.getElementById("filterReset");
const mapTrigger = document.getElementById("mapTrigger");
const mapOverlay = document.getElementById("mapOverlay");
const mapPanel = document.getElementById("mapPanel");
const mapClose = document.getElementById("mapClose");
const momentMap = document.getElementById("momentMap");
const mapStatus = document.getElementById("mapStatus");
const visitorCount = document.getElementById("visitorCount");
const visitorSeparator = document.querySelector(".site-visitor-separator");
const backgroundAudio = document.getElementById("backgroundAudio");
const audioToggle = document.getElementById("audioToggle");
const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

let introTimeoutId = null;
let historyCloseTimeoutId = null;
let contactCloseTimeoutId = null;
let traceCloseTimeoutId = null;
let filterCloseTimeoutId = null;
let mapCloseTimeoutId = null;
let audioUnlockBound = false;
let audioShouldPlay = true;
let audioTrackIndex = 0;
let audioPlaylist = [];
let guestbook = null;
let mapView = null;
let gallery = null;
let lightboxView = null;

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

function syncTopbarState() {
  if (!siteTopbar) {
    return;
  }
  siteTopbar.classList.toggle("is-compact", window.scrollY > 48);
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
    // Fall through to comma-separated parsing.
  }

  audioPlaylist = rawTracks.split(",").map((track) => track.trim()).filter(Boolean);
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
  audioToggle.textContent = isPlaying ? "음악 ON" : "음악 OFF";
  audioToggle.setAttribute("aria-pressed", String(isPlaying));
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

async function loadStatusUpdate() {
  if (!statusUpdated) {
    return;
  }
  try {
    const payload = await loadStatusUpdatePayload();
    const formatted = formatKoreanUpdateTime(payload?.updatedAt);
    if (!formatted) {
      return;
    }
    statusUpdated.textContent = `최근 업데이트 ${formatted}`;
    statusUpdated.hidden = false;
  } catch (error) {
    // Optional metadata should not block the exhibition.
  }
}

async function recordPublicVisit() {
  try {
    const payload = await recordVisit();
    const count = Number(payload?.count || 0);
    if (!visitorCount || !Number.isFinite(count) || count <= 0) {
      return;
    }
    visitorCount.textContent = `방문자 ${count.toLocaleString("ko-KR")}`;
    visitorCount.hidden = false;
    if (visitorSeparator) {
      visitorSeparator.hidden = false;
    }
  } catch (error) {
    // Visit counting should never block the exhibition UI.
  }
}

function runNonCriticalTasks() {
  const execute = () => {
    loadStatusUpdate();
    recordPublicVisit();
    startBackgroundAudio();
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(execute, { timeout: 1500 });
    return;
  }
  window.setTimeout(execute, 320);
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
  closeFilterOverlay();
  closeMapOverlay();
  openInfoOverlay(historyOverlay, historyTrigger, "is-history-open", historyCloseTimeoutId);
}

function closeHistoryOverlay() {
  closeInfoOverlay(historyOverlay, historyTrigger, "is-history-open", historyCloseTimeoutId, (timeoutId) => {
    historyCloseTimeoutId = timeoutId;
  });
}

function openContactOverlay() {
  closeHistoryOverlay();
  closeTraceOverlay();
  closeFilterOverlay();
  closeMapOverlay();
  openInfoOverlay(contactOverlay, contactTrigger, "is-contact-open", contactCloseTimeoutId);
}

function closeContactOverlay() {
  closeInfoOverlay(contactOverlay, contactTrigger, "is-contact-open", contactCloseTimeoutId, (timeoutId) => {
    contactCloseTimeoutId = timeoutId;
  });
}

function openTraceOverlay() {
  closeHistoryOverlay();
  closeContactOverlay();
  closeFilterOverlay();
  closeMapOverlay();
  openInfoOverlay(traceOverlay, traceTrigger, "is-trace-open", traceCloseTimeoutId);
  guestbook?.load();
}

function closeTraceOverlay() {
  closeInfoOverlay(traceOverlay, traceTrigger, "is-trace-open", traceCloseTimeoutId, (timeoutId) => {
    traceCloseTimeoutId = timeoutId;
  });
}

function openFilterOverlay() {
  closeHistoryOverlay();
  closeContactOverlay();
  closeTraceOverlay();
  closeMapOverlay();
  openInfoOverlay(filterOverlay, filterTrigger, "is-filter-open", filterCloseTimeoutId);
}

function closeFilterOverlay() {
  closeInfoOverlay(filterOverlay, filterTrigger, "is-filter-open", filterCloseTimeoutId, (timeoutId) => {
    filterCloseTimeoutId = timeoutId;
  });
}

function openMapOverlay(focusPhoto = null) {
  closeHistoryOverlay();
  closeContactOverlay();
  closeTraceOverlay();
  closeFilterOverlay();
  openInfoOverlay(mapOverlay, mapTrigger, "is-map-open", mapCloseTimeoutId);
  if (focusPhoto) {
    mapView?.focusPhoto(focusPhoto);
    return;
  }
  mapView?.render();
}

function closeMapOverlay() {
  closeInfoOverlay(mapOverlay, mapTrigger, "is-map-open", mapCloseTimeoutId, (timeoutId) => {
    mapCloseTimeoutId = timeoutId;
  });
}

function bindOverlayToggle(trigger, overlay, openFn, closeFn) {
  trigger?.addEventListener("click", () => {
    if (!overlay || overlay.hidden) {
      openFn();
      return;
    }
    closeFn();
  });
}

function bindOverlayDismiss(overlay, panel, closeFn) {
  overlay?.addEventListener("click", (event) => {
    if (!event.target.closest(".info-panel")) {
      closeFn();
    }
  });
  panel?.addEventListener("click", (event) => {
    event.stopPropagation();
  });
}

async function loadPhotos() {
  try {
    const payload = await loadPhotosPayload();
    const photos = shufflePhotos(payload.photos);
    gallery.setPhotos(photos);
  } catch (error) {
    emptyState.hidden = false;
    emptyState.textContent = error.message || "전시를 불러오지 못했습니다.";
  }
}

gallery = createGallery({
  stream,
  emptyState,
  filterControls,
  filterCountText,
  filterReset,
  hoverQuery,
  onOpenLightbox: (photoId) => lightboxView.open(photoId),
});

guestbook = createGuestbook({
  traceForm,
  traceCountText,
  traceList,
  traceStatus,
  getPhotos: () => gallery.getPhotos(),
  openLightbox: (photoId) => lightboxView.open(photoId),
});

mapView = createMapView({
  mapElement: momentMap,
  mapStatus,
  getPhotos: () => gallery.getPhotos(),
  onOpenLightbox: (photoId) => lightboxView.open(photoId),
  onFilterPlace: (placeName) => {
    gallery.applyPlaceFilter(placeName);
    closeMapOverlay();
    openFilterOverlay();
  },
});

lightboxView = createLightbox({
  lightbox,
  lightboxContent,
  lightboxImage,
  lightboxImageBuffer,
  lightboxMeta,
  gallery,
  onTraceChange: (entries, count) => {
    guestbook.setEntries(entries, count);
  },
  onShowMap: (photo) => {
    lightboxView.close();
    openMapOverlay(photo);
  },
});

bindOverlayToggle(historyTrigger, historyOverlay, openHistoryOverlay, closeHistoryOverlay);
bindOverlayToggle(contactTrigger, contactOverlay, openContactOverlay, closeContactOverlay);
bindOverlayToggle(traceTrigger, traceOverlay, openTraceOverlay, closeTraceOverlay);
bindOverlayToggle(filterTrigger, filterOverlay, openFilterOverlay, closeFilterOverlay);
bindOverlayToggle(mapTrigger, mapOverlay, () => openMapOverlay(), closeMapOverlay);

bindOverlayDismiss(historyOverlay, historyPanel, closeHistoryOverlay);
bindOverlayDismiss(contactOverlay, contactPanel, closeContactOverlay);
bindOverlayDismiss(traceOverlay, tracePanel, closeTraceOverlay);
bindOverlayDismiss(filterOverlay, filterPanel, closeFilterOverlay);
bindOverlayDismiss(mapOverlay, mapPanel, closeMapOverlay);

traceClose?.addEventListener("click", closeTraceOverlay);
filterClose?.addEventListener("click", closeFilterOverlay);
mapClose?.addEventListener("click", closeMapOverlay);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    lightboxView.close();
    closeHistoryOverlay();
    closeContactOverlay();
    closeTraceOverlay();
    closeFilterOverlay();
    closeMapOverlay();
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
