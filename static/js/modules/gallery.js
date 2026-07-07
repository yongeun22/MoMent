import {
  REGION_OPTIONS,
  displayLocation,
  escapeHtml,
  uniqueSorted,
} from "./utils.js";

const EMPTY_FILTERS = {
  year: "",
  region: "",
  photographer: "",
  place: "",
};
const PUBLIC_REGION_OPTIONS = REGION_OPTIONS.filter((region) => region !== "기타");
const FILTER_OPTION_LABELS = {
  "경상권": "경상권(경주 제외)",
};

export function createGallery({
  stream,
  emptyState,
  filterControls,
  filterCountText,
  filterReset,
  hoverQuery,
  onOpenLightbox,
}) {
  let allPhotos = [];
  let visiblePhotos = [];
  let filters = { ...EMPTY_FILTERS };
  let activePhotoId = null;

  function supportsHover() {
    return hoverQuery.matches;
  }

  function renderPhoto(photo, index) {
    const isPriorityImage = index < 4;
    const location = displayLocation(photo);
    return `
      <figure class="photo-item" data-photo-id="${photo.id}">
        <button class="photo-frame" type="button" aria-expanded="false" data-photo-id="${photo.id}">
          <img
            class="photo-image"
            src="${photo.imageUrl}"
            ${photo.lightboxUrl ? `data-lightbox-src="${photo.lightboxUrl}"` : ""}
            alt="${escapeHtml(location)}, ${escapeHtml(photo.date)}"
            loading="${isPriorityImage ? "eager" : "lazy"}"
            fetchpriority="${isPriorityImage ? "high" : "low"}"
            decoding="async"
            draggable="false"
          >
        </button>
        <figcaption class="photo-meta">
          <dl class="meta-list">
            <div class="meta-block">
              <dt class="meta-term">날짜</dt>
              <dd class="meta-value">${escapeHtml(photo.date)}</dd>
            </div>
            <div class="meta-block">
              <dt class="meta-term">장소</dt>
              <dd class="meta-value">${escapeHtml(location)}</dd>
            </div>
            <div class="meta-block">
              <dt class="meta-term">촬영</dt>
              <dd class="meta-value">${escapeHtml(photo.photographer)}</dd>
            </div>
          </dl>
        </figcaption>
      </figure>
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
        if (supportsHover()) {
          clearActivePhoto();
        }
      });
      button.addEventListener("click", () => {
        onOpenLightbox(photoId, button);
      });
      item.addEventListener("mouseenter", () => {
        if (supportsHover()) {
          activatePhoto(photoId, true);
        }
      });
      item.addEventListener("mouseleave", () => {
        if (supportsHover()) {
          clearActivePhoto();
        }
      });
    });
  }

  function matchesFilters(photo) {
    if (filters.year && String(photo.year || "") !== filters.year) {
      return false;
    }
    if (filters.region && String(photo.region || "") !== filters.region) {
      return false;
    }
    if (filters.photographer && String(photo.photographer || "") !== filters.photographer) {
      return false;
    }
    if (filters.place && displayLocation(photo) !== filters.place) {
      return false;
    }
    return true;
  }

  function renderFilterCount() {
    if (!filterCountText) {
      return;
    }
    const total = allPhotos.length;
    const visible = visiblePhotos.length;
    filterCountText.textContent = visible === total
      ? `전체 ${total}장의 사진을 보고 있습니다`
      : `${total}장 중 ${visible}장의 사진을 보고 있습니다`;
  }

  function render() {
    visiblePhotos = allPhotos.filter(matchesFilters);
    renderFilterCount();

    if (!visiblePhotos.length) {
      emptyState.hidden = false;
      emptyState.textContent = allPhotos.length
        ? "조건에 맞는 사진이 없습니다."
        : "전시 준비 중입니다.";
      stream.innerHTML = "";
      return;
    }

    emptyState.hidden = true;
    stream.innerHTML = visiblePhotos.map((photo, index) => renderPhoto(photo, index)).join("");
    bindInteractions();
  }

  function optionMarkup(options, selectedValue, labelForOption = (option) => option) {
    return [
      '<option value="">전체</option>',
      ...options.map((option) => `
        <option value="${escapeHtml(option)}" ${option === selectedValue ? "selected" : ""}>${escapeHtml(labelForOption(option))}</option>
      `),
    ].join("");
  }

  function regionLabelForFilter(region) {
    return FILTER_OPTION_LABELS[region] || region;
  }

  function regionOptionsForPhotos() {
    const extraRegions = uniqueSorted(
      allPhotos
        .map((photo) => photo.region)
        .filter((region) => region && !REGION_OPTIONS.includes(region)),
    );
    return [...PUBLIC_REGION_OPTIONS, ...extraRegions];
  }

  function renderFilterControls() {
    if (!filterControls) {
      return;
    }

    const yearOptions = uniqueSorted(allPhotos.map((photo) => photo.year));
    const photographerOptions = uniqueSorted(allPhotos.map((photo) => photo.photographer));
    const placeOptions = uniqueSorted(allPhotos.map(displayLocation));
    const regionOptions = regionOptionsForPhotos();

    filterControls.innerHTML = `
      <label class="filter-field">
        <span>연도</span>
        <select data-filter-key="year">${optionMarkup(yearOptions, filters.year)}</select>
      </label>
      <label class="filter-field">
        <span>권역</span>
        <select data-filter-key="region">${optionMarkup(regionOptions, filters.region, regionLabelForFilter)}</select>
      </label>
      <label class="filter-field">
        <span>촬영자</span>
        <select data-filter-key="photographer">${optionMarkup(photographerOptions, filters.photographer)}</select>
      </label>
      <label class="filter-field">
        <span>촬영장소</span>
        <select data-filter-key="place">${optionMarkup(placeOptions, filters.place)}</select>
      </label>
    `;

    filterControls.querySelectorAll("[data-filter-key]").forEach((select) => {
      select.addEventListener("change", () => {
        filters = {
          ...filters,
          [select.dataset.filterKey]: select.value,
        };
        render();
      });
    });
  }

  filterReset?.addEventListener("click", () => {
    filters = { ...EMPTY_FILTERS };
    renderFilterControls();
    render();
  });
  hoverQuery.addEventListener("change", clearActivePhoto);

  return {
    setPhotos(photos) {
      allPhotos = photos;
      renderFilterControls();
      render();
    },
    getPhotos() {
      return allPhotos;
    },
    getVisiblePhotos() {
      return visiblePhotos;
    },
    findPhoto(photoId) {
      return allPhotos.find((photo) => String(photo.id) === String(photoId)) || null;
    },
    clearActivePhoto,
    applyPlaceFilter(placeName) {
      filters = { ...EMPTY_FILTERS, place: placeName };
      renderFilterControls();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  };
}
