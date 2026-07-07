import { displayLocation, escapeHtml, isCoordinatePair } from "./utils.js";

const LEAFLET_CSS = "/static/vendor/leaflet/leaflet.css";
const LEAFLET_JS = "/static/vendor/leaflet/leaflet.js";
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

let leafletPromise = null;

function loadStylesheet(href) {
  if (document.querySelector(`link[href="${href}"]`)) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

function loadScript(src) {
  if (window.L) {
    return Promise.resolve(window.L);
  }
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
      <button class="map-popup-button" type="button" data-map-open-photo="${place.photos[0].id}">대표 사진</button>
    </div>
  `;
}

export function createMapView({ mapElement, mapStatus, getPhotos, onOpenLightbox, onFilterPlace }) {
  let map = null;
  let markerLayer = null;
  let places = [];
  let markers = new Map();

  function setStatus(message, isError = false) {
    if (!mapStatus) {
      return;
    }
    mapStatus.textContent = message;
    mapStatus.classList.toggle("is-error", isError);
  }

  async function ensureMap() {
    const L = await loadLeaflet();
    if (!map) {
      map = L.map(mapElement, {
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer(TILE_URL, {
        maxZoom: 19,
        attribution: TILE_ATTRIBUTION,
      }).addTo(map);
      markerLayer = L.layerGroup().addTo(map);
      map.on("popupopen", () => {
        mapElement.querySelectorAll("[data-map-open-photo]").forEach((button) => {
          button.addEventListener("click", () => onOpenLightbox(button.dataset.mapOpenPhoto, button));
        });
        mapElement.querySelectorAll("[data-map-filter-place]").forEach((button) => {
          button.addEventListener("click", () => onFilterPlace(button.dataset.mapFilterPlace));
        });
      });
    }
    return L;
  }

  async function render() {
    if (!mapElement) {
      return;
    }
    setStatus("지도를 불러오는 중입니다.");
    try {
      const L = await ensureMap();
      places = groupPlaces(getPhotos());
      markers.clear();
      markerLayer.clearLayers();

      if (!places.length) {
        map.setView([36.5, 127.8], 7);
        setStatus("좌표가 등록된 사진이 없습니다.");
        return;
      }

      const bounds = [];
      places.forEach((place) => {
        const marker = L.marker([place.lat, place.lng], {
          icon: L.divIcon({
            className: "moment-place-marker",
            html: String(place.photos.length),
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          }),
        }).bindPopup(popupMarkup(place));
        marker.addTo(markerLayer);
        markers.set(place.id, marker);
        bounds.push([place.lat, place.lng]);
      });

      if (bounds.length === 1) {
        map.setView(bounds[0], 14);
      } else {
        map.fitBounds(bounds, { padding: [28, 28] });
      }
      window.setTimeout(() => map.invalidateSize(), 80);
      setStatus("");
    } catch (error) {
      setStatus(error.message || "지도를 불러오지 못했습니다.", true);
    }
  }

  async function focusPhoto(photo) {
    await render();
    if (!photo || !isCoordinatePair(photo)) {
      return;
    }
    const placeId = photo.placeId || displayLocation(photo);
    const marker = markers.get(placeId);
    if (!marker || !map) {
      return;
    }
    map.setView([Number(photo.lat), Number(photo.lng)], 15);
    marker.openPopup();
  }

  return {
    render,
    focusPhoto,
  };
}
