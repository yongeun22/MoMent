import { displayLocation, escapeHtml, isCoordinatePair, uniqueSorted } from "./utils.js";

const LEAFLET_CSS = "/static/vendor/leaflet/leaflet.css";
const LEAFLET_JS = "/static/vendor/leaflet/leaflet.js";
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

let leafletPromise = null;

function loadStylesheet(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

function loadScript(src) {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error("지도를 불러오지 못했습니다."));
      document.head.append(script);
    });
  }
  return leafletPromise;
}

async function loadLeaflet() {
  loadStylesheet(LEAFLET_CSS);
  return loadScript(LEAFLET_JS);
}

function groupPlaces(photos) {
  const groups = new Map();
  photos.filter(isCoordinatePair).forEach((photo) => {
    const key = photo.placeId || displayLocation(photo);
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        name: displayLocation(photo),
        lat: Number(photo.lat),
        lng: Number(photo.lng),
        photos: [],
      });
    }
    groups.get(key).photos.push(photo);
  });
  return [...groups.values()];
}

function popupMarkup(place) {
  const thumbs = place.photos.slice(0, 3).map((photo) => `
    <img src="${photo.imageUrl}" alt="${escapeHtml(displayLocation(photo))}">
  `).join("");
  return `
    <div class="map-popup">
      <p class="map-popup-title">${escapeHtml(place.name)}</p>
      <p class="map-popup-note">${place.photos.length}장의 사진</p>
      <div class="map-popup-thumbs">${thumbs}</div>
      <button class="map-popup-button" type="button" data-map-filter-place="${escapeHtml(place.name)}">사진 보기</button>
    </div>
  `;
}

function clustersForZoom(places, zoom) {
  if (zoom >= 10) {
    return places.map((place) => ({
      id: place.id,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      places: [place],
      photos: place.photos,
    }));
  }
  const cellSize = zoom <= 6 ? 3 : zoom === 7 ? 1.5 : zoom === 8 ? 0.75 : 0.35;
  const clusters = new Map();
  places.forEach((place) => {
    const key = `${Math.floor(place.lat / cellSize)}:${Math.floor(place.lng / cellSize)}`;
    if (!clusters.has(key)) {
      clusters.set(key, { id: key, places: [], photos: [], latTotal: 0, lngTotal: 0 });
    }
    const cluster = clusters.get(key);
    cluster.places.push(place);
    cluster.photos.push(...place.photos);
    cluster.latTotal += place.lat;
    cluster.lngTotal += place.lng;
  });
  return [...clusters.values()].map((cluster) => ({
    ...cluster,
    name: cluster.places.length === 1 ? cluster.places[0].name : `${cluster.places.length}개 장소`,
    lat: cluster.latTotal / cluster.places.length,
    lng: cluster.lngTotal / cluster.places.length,
  }));
}

export function createMapView({
  mapElement,
  mapStatus,
  mapRegionControls,
  mapPlaceList,
  getPhotos,
  onFilterPlace,
}) {
  let map = null;
  let markerLayer = null;
  let places = [];
  let markers = new Map();
  let activeRegion = "";

  function setStatus(message, isError = false) {
    if (!mapStatus) return;
    mapStatus.textContent = message;
    mapStatus.classList.toggle("is-error", isError);
  }

  function filteredPhotos() {
    const photos = getPhotos();
    return activeRegion ? photos.filter((photo) => photo.region === activeRegion) : photos;
  }

  function renderPlaceList() {
    if (!mapPlaceList) return;
    if (!places.length) {
      mapPlaceList.innerHTML = '<p class="trace-empty">표시할 장소가 없습니다.</p>';
      return;
    }
    mapPlaceList.innerHTML = places.map((place) => `
      <button class="map-place-list-item" type="button" data-map-filter-place="${escapeHtml(place.name)}" aria-label="${escapeHtml(place.name)}, 사진 ${place.photos.length}장">
        <span>${escapeHtml(place.name)}</span>
        <span>${place.photos.length}장</span>
      </button>
    `).join("");
    mapPlaceList.querySelectorAll("[data-map-filter-place]").forEach((button) => {
      button.addEventListener("click", () => onFilterPlace(button.dataset.mapFilterPlace));
    });
  }

  function renderRegionControls() {
    if (!mapRegionControls) return;
    const regions = uniqueSorted(getPhotos().map((photo) => photo.region));
    mapRegionControls.innerHTML = ["", ...regions].map((region) => `
      <button class="map-region-chip ${region === activeRegion ? "is-active" : ""}" type="button" data-map-region="${escapeHtml(region)}" aria-pressed="${region === activeRegion}">${escapeHtml(region || "전체")}</button>
    `).join("");
    mapRegionControls.querySelectorAll("[data-map-region]").forEach((button) => {
      button.addEventListener("click", async () => {
        activeRegion = button.dataset.mapRegion;
        renderRegionControls();
        places = groupPlaces(filteredPhotos());
        renderPlaceList();
        if (map && window.L) renderMarkers(window.L, { fitView: true });
      });
    });
  }

  function renderMarkers(L, { fitView = false } = {}) {
    if (!map || !markerLayer) return;
    markers.clear();
    markerLayer.clearLayers();
    if (!places.length) {
      map.setView([36.5, 127.8], 7);
      setStatus("좌표가 등록된 사진이 없습니다.");
      return;
    }

    const clusters = clustersForZoom(places, map.getZoom());
    clusters.forEach((cluster) => {
      const isCluster = cluster.places.length > 1;
      const title = isCluster
        ? `${cluster.places.length}개 장소, 사진 ${cluster.photos.length}장`
        : `${cluster.name}, 사진 ${cluster.photos.length}장`;
      const marker = L.marker([cluster.lat, cluster.lng], {
        keyboard: true,
        title,
        icon: L.divIcon({
          className: `moment-place-marker${isCluster ? " is-cluster" : ""}`,
          html: `<span aria-hidden="true">${cluster.photos.length}</span>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        }),
      });
      if (isCluster) {
        marker.on("click", () => map.setView([cluster.lat, cluster.lng], Math.min(map.getZoom() + 2, 12)));
      } else {
        const place = cluster.places[0];
        marker.bindPopup(popupMarkup(place));
        markers.set(place.id, marker);
      }
      marker.addTo(markerLayer);
    });

    if (fitView) {
      const bounds = places.map((place) => [place.lat, place.lng]);
      if (bounds.length === 1) map.setView(bounds[0], 14);
      else map.fitBounds(bounds, { padding: [28, 28] });
    }
    setStatus(places.length ? `${places.length}개 장소를 표시하고 있습니다.` : "");
  }

  async function ensureMap() {
    const L = await loadLeaflet();
    if (!map) {
      map = L.map(mapElement, { zoomControl: true, attributionControl: true });
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
      markerLayer = L.layerGroup().addTo(map);
      map.on("zoomend", () => renderMarkers(L));
      map.on("popupopen", () => {
        mapElement.querySelectorAll("[data-map-filter-place]").forEach((button) => {
          button.addEventListener("click", () => onFilterPlace(button.dataset.mapFilterPlace));
        });
      });
    }
    return L;
  }

  async function render() {
    if (!mapElement) return;
    setStatus("지도를 불러오는 중입니다.");
    try {
      const L = await ensureMap();
      places = groupPlaces(filteredPhotos());
      renderRegionControls();
      renderPlaceList();
      renderMarkers(L, { fitView: true });
      window.setTimeout(() => map.invalidateSize(), 80);
    } catch (error) {
      setStatus(error.message || "지도를 불러오지 못했습니다.", true);
    }
  }

  async function focusPhoto(photo) {
    activeRegion = "";
    await render();
    if (!photo || !isCoordinatePair(photo) || !map || !window.L) return;
    const placeId = photo.placeId || displayLocation(photo);
    map.setView([Number(photo.lat), Number(photo.lng)], 15);
    renderMarkers(window.L);
    markers.get(placeId)?.openPopup();
  }

  return { render, focusPhoto };
}
