const moduleVersion = new URL(import.meta.url).searchParams.get("v") || "dev";
const versionedModule = (path) => `${path}?v=${encodeURIComponent(moduleVersion)}`;
const [
  apiModule,
  galleryModule,
  guestbookModule,
  lightboxModule,
  mapViewModule,
  utilsModule,
  dialogModule,
  urlStateModule,
] = await Promise.all([
  import(versionedModule("./modules/api.js")),
  import(versionedModule("./modules/gallery.js")),
  import(versionedModule("./modules/guestbook.js")),
  import(versionedModule("./modules/lightbox.js")),
  import(versionedModule("./modules/map-view.js")),
  import(versionedModule("./modules/utils.js")),
  import(versionedModule("./modules/dialog.js")),
  import(versionedModule("./modules/url-state.js")),
]);

const { loadPhotosPayload, loadStatusUpdatePayload, recordVisit } = apiModule;
const { createGallery } = galleryModule;
const { createGuestbook } = guestbookModule;
const { createLightbox } = lightboxModule;
const { createMapView } = mapViewModule;
const { formatKoreanUpdateTime, stableShufflePhotos } = utilsModule;
const { createDialogController } = dialogModule;
const { readExhibitionState, writeExhibitionState } = urlStateModule;

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
const lightboxPhotoMeta = document.getElementById("lightboxPhotoMeta");
const lightboxMeta = document.getElementById("lightboxMeta");
const lightboxClose = document.getElementById("lightboxClose");
const lightboxPrevious = document.getElementById("lightboxPrevious");
const lightboxNext = document.getElementById("lightboxNext");
const lightboxPosition = document.getElementById("lightboxPosition");
const historyTrigger = document.getElementById("historyTrigger");
const historyOverlay = document.getElementById("historyOverlay");
const historyPanel = document.getElementById("historyPanel");
const historyClose = document.getElementById("historyClose");
const contactTrigger = document.getElementById("contactTrigger");
const contactOverlay = document.getElementById("contactOverlay");
const contactPanel = document.getElementById("contactPanel");
const contactClose = document.getElementById("contactClose");
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
const mapRegionControls = document.getElementById("mapRegionControls");
const mapPlaceList = document.getElementById("mapPlaceList");
const galleryStatus = document.getElementById("galleryStatus");
const visitorCount = document.getElementById("visitorCount");
const visitorSeparator = document.querySelector(".site-visitor-separator");
const backgroundAudio = document.getElementById("backgroundAudio");
const audioToggle = document.getElementById("audioToggle");
const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

let audioShouldPlay = false;
let audioTrackIndex = 0;
let audioPlaylist = [];
let guestbook = null;
let mapView = null;
let gallery = null;
let lightboxView = null;
let photosLoaded = false;
let applyingHistoryState = false;

const introDialog = createDialogController({
  overlay: introOverlay,
  panel: introOverlay.querySelector(".intro-shell"),
  bodyClass: "is-intro-active",
  transitionMs: 950,
  visibleClass: "",
  closingClass: "is-fading",
  initialFocus: introEnter,
  closeOnBackdrop: false,
  onClosed: () => {
    if (photosLoaded) {
      syncFromLocation();
    } else {
      stream?.focus({ preventScroll: true });
    }
  },
});
const historyDialog = createDialogController({
  overlay: historyOverlay,
  panel: historyPanel,
  trigger: historyTrigger,
  bodyClass: "is-history-open",
  initialFocus: historyClose,
  transitionMs: 320,
});
const contactDialog = createDialogController({
  overlay: contactOverlay,
  panel: contactPanel,
  trigger: contactTrigger,
  bodyClass: "is-contact-open",
  initialFocus: contactClose,
  transitionMs: 320,
});
const traceDialog = createDialogController({
  overlay: traceOverlay,
  panel: tracePanel,
  trigger: traceTrigger,
  bodyClass: "is-trace-open",
  initialFocus: traceClose,
  transitionMs: 320,
});
const filterDialog = createDialogController({
  overlay: filterOverlay,
  panel: filterPanel,
  trigger: filterTrigger,
  bodyClass: "is-filter-open",
  initialFocus: filterClose,
  transitionMs: 320,
});
const mapDialog = createDialogController({
  overlay: mapOverlay,
  panel: mapPanel,
  trigger: mapTrigger,
  bodyClass: "is-map-open",
  initialFocus: mapClose,
  transitionMs: 320,
});

introDialog.activateInitial();

function fadeIntro() {
  introDialog.close({ restoreFocus: false });
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
    audioShouldPlay = false;
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
  backgroundAudio.volume = 0.025;
  ensureAudioSource();
  try {
    await backgroundAudio.play();
  } catch (error) {
    audioShouldPlay = false;
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
    visitorCount.textContent = `전시 방문 ${count.toLocaleString("ko-KR")}`;
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
  };
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(execute, { timeout: 1500 });
    return;
  }
  window.setTimeout(execute, 320);
}

const infoDialogs = [historyDialog, contactDialog, traceDialog, filterDialog, mapDialog];

function closeOtherInfoDialogs(activeDialog) {
  infoDialogs.forEach((dialog) => {
    if (dialog !== activeDialog) dialog.close({ restoreFocus: false });
  });
}

function openHistoryOverlay() {
  closeOtherInfoDialogs(historyDialog);
  historyDialog.open();
}

function closeHistoryOverlay() {
  historyDialog.close();
}

function openContactOverlay() {
  closeOtherInfoDialogs(contactDialog);
  contactDialog.open();
}

function closeContactOverlay() {
  contactDialog.close();
}

function openTraceOverlay() {
  closeOtherInfoDialogs(traceDialog);
  traceDialog.open();
  guestbook?.load();
}

function closeTraceOverlay() {
  traceDialog.close();
}

function openFilterOverlay() {
  closeOtherInfoDialogs(filterDialog);
  filterDialog.open();
}

function closeFilterOverlay() {
  filterDialog.close();
}

function openMapOverlay(focusPhoto = null) {
  closeOtherInfoDialogs(mapDialog);
  mapDialog.open();
  if (focusPhoto) {
    mapView?.focusPhoto(focusPhoto);
    return;
  }
  mapView?.render();
}

function closeMapOverlay() {
  mapDialog.close();
}

function bindOverlayToggle(trigger, dialog, openFn, closeFn) {
  trigger?.addEventListener("click", () => {
    if (!dialog.isOpen()) {
      openFn();
      return;
    }
    closeFn();
  });
}

async function loadPhotos() {
  try {
    const payload = await loadPhotosPayload();
    const photos = stableShufflePhotos(payload.photos);
    gallery.setPhotos(photos);
    photosLoaded = true;
    syncFromLocation();
  } catch (error) {
    emptyState.hidden = false;
    emptyState.textContent = error.message || "전시를 불러오지 못했습니다.";
  }
}

const initialExhibitionState = readExhibitionState();

function writeCurrentState({ photoId = lightboxView?.getOpenPhotoId() ?? null, mode = "replace", photoEntry = false } = {}) {
  writeExhibitionState(
    { filters: gallery.getFilters(), photoId },
    { mode, photoEntry },
  );
}

function syncFromLocation() {
  if (!photosLoaded) {
    return;
  }
  const state = readExhibitionState();
  applyingHistoryState = true;
  gallery.setFilters(state.filters, { notify: false });
  if (state.photoId && introOverlay.hidden) {
    const opened = lightboxView.open(state.photoId, { notify: false, historyMode: "replace" });
    if (!opened) {
      writeCurrentState({ photoId: null, mode: "replace" });
    }
  } else if (!state.photoId && lightboxView.isOpen()) {
    lightboxView.close({ notify: false });
  }
  applyingHistoryState = false;
}

function handleLightboxClose() {
  if (applyingHistoryState) {
    return;
  }
  const state = readExhibitionState();
  if (!state.photoId) {
    return;
  }
  if (window.history.state?.momentPhotoEntry) {
    window.history.back();
    return;
  }
  writeCurrentState({ photoId: null, mode: "replace" });
}

gallery = createGallery({
  stream,
  emptyState,
  filterControls,
  filterCountText,
  filterReset,
  filterTrigger,
  galleryStatus,
  hoverQuery,
  initialFilters: initialExhibitionState.filters,
  onFiltersChange: () => {
    if (!applyingHistoryState) writeCurrentState({ mode: "push" });
  },
  onOpenLightbox: (photoId, trigger) => lightboxView.open(photoId, { returnFocus: trigger }),
});

guestbook = createGuestbook({
  traceForm,
  traceCountText,
  traceList,
  traceStatus,
  getPhotos: () => gallery.getPhotos(),
  openLightbox: (photoId) => {
    traceDialog.close({ restoreFocus: false });
    lightboxView.open(photoId, { returnFocus: traceTrigger });
  },
});

mapView = createMapView({
  mapElement: momentMap,
  mapStatus,
  mapRegionControls,
  mapPlaceList,
  getPhotos: () => gallery.getPhotos(),
  onFilterPlace: (placeName) => {
    gallery.applyPlaceFilter(placeName);
    closeMapOverlay();
  },
});

lightboxView = createLightbox({
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
  onTraceChange: (entries, count) => {
    guestbook.setEntries(entries, count);
  },
  onShowMap: (photo) => {
    lightboxView.close({ notify: false });
    writeCurrentState({ photoId: null, mode: "replace" });
    openMapOverlay(photo);
  },
  onPhotoChange: (photoId, historyMode) => {
    writeCurrentState({
      photoId,
      mode: historyMode,
      photoEntry: historyMode === "push",
    });
  },
  onClose: handleLightboxClose,
});

writeExhibitionState(initialExhibitionState, { mode: "replace", photoEntry: false });

bindOverlayToggle(historyTrigger, historyDialog, openHistoryOverlay, closeHistoryOverlay);
bindOverlayToggle(contactTrigger, contactDialog, openContactOverlay, closeContactOverlay);
bindOverlayToggle(traceTrigger, traceDialog, openTraceOverlay, closeTraceOverlay);
bindOverlayToggle(filterTrigger, filterDialog, openFilterOverlay, closeFilterOverlay);
bindOverlayToggle(mapTrigger, mapDialog, () => openMapOverlay(), closeMapOverlay);

historyClose?.addEventListener("click", closeHistoryOverlay);
contactClose?.addEventListener("click", closeContactOverlay);
traceClose?.addEventListener("click", closeTraceOverlay);
filterClose?.addEventListener("click", closeFilterOverlay);
mapClose?.addEventListener("click", closeMapOverlay);
window.addEventListener("popstate", syncFromLocation);
window.addEventListener("scroll", syncTopbarState, { passive: true });
introEnter?.addEventListener("click", fadeIntro);
audioToggle?.addEventListener("click", toggleBackgroundAudio);
backgroundAudio?.addEventListener("play", updateAudioToggle);
backgroundAudio?.addEventListener("pause", updateAudioToggle);
backgroundAudio?.addEventListener("ended", playNextTrack);

syncTopbarState();
loadPhotos();
runNonCriticalTasks();
