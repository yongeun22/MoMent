const moduleVersion = new URL(import.meta.url).searchParams.get("v") || "dev";
const { bindPublishChecklist, createDirtyTracker, filterAdminPhotos } = await import(
  `./modules/admin-workflow.js?v=${encodeURIComponent(moduleVersion)}`
);

const loginPanel = document.getElementById("loginPanel");
const managerPanel = document.getElementById("managerPanel");
const setupNote = document.getElementById("setupNote");
const loginForm = document.getElementById("loginForm");
const uploadForm = document.getElementById("uploadForm");
const passwordForm = document.getElementById("passwordForm");
const photoList = document.getElementById("adminPhotoList");
const sessionUsername = document.getElementById("sessionUsername");
const logoutButton = document.getElementById("logoutButton");
const statusToast = document.getElementById("statusToast");
const photoSearch = document.getElementById("adminPhotoSearch");
const photoCount = document.getElementById("adminPhotoCount");
const dirtyStatus = document.getElementById("adminDirtyStatus");
const toggleAllButton = document.getElementById("adminToggleAll");
const publishChecklist = document.getElementById("publishChecklist");
const publishChecklistStatus = document.getElementById("publishChecklistStatus");

const MAX_IMAGE_DIMENSION = 2400;
const OPTIMIZE_THRESHOLD_BYTES = 4 * 1024 * 1024;
const PUBLISH_REMINDER = "\uACF5\uAC1C \uC0AC\uC774\uD2B8 \uBC18\uC601\uC740 export-static \uD6C4 \uD478\uC2DC\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.";
const REGION_OPTIONS = [
  "\uC11C\uC6B8\u00B7\uACBD\uAE30\uAD8C",
  "\uAC15\uC6D0\uAD8C",
  "\uCDA9\uCCAD\uAD8C",
  "\uC804\uB77C\uAD8C",
  "\uACBD\uC0C1\uAD8C",
  "\uACBD\uC8FC\uAD8C",
  "\uC81C\uC8FC\uAD8C",
  "\uD574\uC678",
  "\uAE30\uD0C0",
];

let currentPhotos = [];
let allEditorsExpanded = false;
const dirtyTracker = createDirtyTracker({ statusElement: dirtyStatus });

bindPublishChecklist(publishChecklist, publishChecklistStatus);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showToast(message, isError = false) {
  statusToast.hidden = false;
  statusToast.textContent = message;
  statusToast.style.background = isError ? "rgba(92, 31, 25, 0.94)" : "rgba(0, 0, 0, 0.92)";
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    statusToast.hidden = true;
  }, 3200);
}

function showSavedToast(message) {
  showToast(`${message} ${PUBLISH_REMINDER}`);
}

async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: "same-origin",
      ...options,
    });
  } catch (error) {
    throw new Error("\uC11C\uBC84\uC5D0 \uC5F0\uACB0\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. `py run.py`\uB85C \uC11C\uBC84\uB97C \uC2E4\uD589\uD574 \uC8FC\uC138\uC694.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "\uC694\uCCAD\uC744 \uCC98\uB9AC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
  }

  return payload;
}

function extensionForType(type, fallbackName) {
  if (type === "image/jpeg") {
    return ".jpg";
  }
  if (type === "image/png") {
    return ".png";
  }
  if (type === "image/webp") {
    return ".webp";
  }
  if (type === "image/gif") {
    return ".gif";
  }

  const originalExtension = fallbackName.includes(".") ? fallbackName.slice(fallbackName.lastIndexOf(".")) : "";
  return originalExtension || ".jpg";
}

function buildOutputFilename(file, outputType) {
  const dotIndex = file.name.lastIndexOf(".");
  const basename = dotIndex > 0 ? file.name.slice(0, dotIndex) : file.name;
  return `${basename}${extensionForType(outputType, file.name)}`;
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("\uC774\uBBF8\uC9C0 \uD30C\uC77C\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."));
    };

    image.src = objectUrl;
  });
}

async function optimizeImageFile(file) {
  if (!file || !(file instanceof File)) {
    return { file, optimized: false };
  }

  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return { file, optimized: false };
  }

  const image = await loadImageFromFile(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const largestEdge = Math.max(width, height);
  const scale = largestEdge > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / largestEdge : 1;

  if (scale >= 1 && file.size <= OPTIMIZE_THRESHOLD_BYTES) {
    return { file, optimized: false };
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let outputType = file.type;
  if (outputType === "image/png") {
    outputType = "image/jpeg";
  }
  if (!["image/jpeg", "image/webp"].includes(outputType)) {
    outputType = "image/jpeg";
  }

  const optimizedBlob = await new Promise((resolve) => {
    canvas.toBlob(resolve, outputType, 0.88);
  });

  if (!optimizedBlob) {
    return { file, optimized: false };
  }

  if (optimizedBlob.size >= file.size && scale >= 1) {
    return { file, optimized: false };
  }

  const optimizedFile = new File(
    [optimizedBlob],
    buildOutputFilename(file, outputType),
    { type: outputType, lastModified: file.lastModified },
  );

  return { file: optimizedFile, optimized: true };
}

async function buildPhotoFormData(form, { requireImage }) {
  const formData = new FormData();

  [
    "date",
    "location",
    "locationName",
    "photographer",
    "year",
    "region",
    "placeId",
    "lat",
    "lng",
    "description",
  ].forEach((fieldName) => {
    formData.append(fieldName, form.elements[fieldName]?.value || "");
  });

  const fileInput = form.elements.photo;
  const file = fileInput?.files?.[0];

  if (!file) {
    if (requireImage) {
      throw new Error("\uC774\uBBF8\uC9C0 \uD30C\uC77C\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
    }
    return { formData, optimized: false };
  }

  const { file: optimizedFile, optimized } = await optimizeImageFile(file);
  formData.append("photo", optimizedFile);
  return { formData, optimized };
}

function renderRegionOptions(selectedRegion) {
  const selected = selectedRegion || "\uAE30\uD0C0";
  return REGION_OPTIONS.map((region) => `
    <option value="${escapeHtml(region)}" ${region === selected ? "selected" : ""}>${escapeHtml(region)}</option>
  `).join("");
}

function renderAdminPhoto(photo) {
  return `
    <article class="photo-card" data-photo-id="${photo.id}">
      <div class="photo-card-summary">
        <img class="photo-preview" src="${photo.imageUrl}" alt="${escapeHtml(photo.locationName || photo.location)}, ${escapeHtml(photo.date)}">
        <div class="photo-summary-copy">
          <strong>${escapeHtml(photo.locationName || photo.location)}</strong>
          <span>${escapeHtml(photo.date)} · ${escapeHtml(photo.photographer)}</span>
          <span class="editor-filename">${escapeHtml(photo.originalName)}</span>
        </div>
        <span class="unsaved-indicator" data-unsaved-indicator hidden>저장되지 않음</span>
        <button class="secondary-button editor-toggle" type="button" data-editor-toggle="${photo.id}" aria-expanded="${allEditorsExpanded}">
          ${allEditorsExpanded ? "접기" : "수정"}
        </button>
      </div>
      <div class="photo-card-body" data-editor-body="${photo.id}" ${allEditorsExpanded ? "" : "hidden"}>
      <form class="photo-editor" data-update-form="${photo.id}">
        <div class="editor-grid">
          <label class="field">
            <span>\uB0A0\uC9DC</span>
            <input type="text" name="date" value="${escapeHtml(photo.date)}" required>
          </label>
          <label class="field">
            <span>\uC7A5\uC18C</span>
            <input type="text" name="location" value="${escapeHtml(photo.location)}" required>
          </label>
          <label class="field">
            <span>\uD45C\uC2DC \uC7A5\uC18C\uBA85</span>
            <input type="text" name="locationName" value="${escapeHtml(photo.locationName || photo.location)}">
          </label>
          <label class="field">
            <span>\uCD2C\uC601</span>
            <input type="text" name="photographer" value="${escapeHtml(photo.photographer)}" required>
          </label>
          <label class="field">
            <span>\uC5F0\uB3C4</span>
            <input type="text" name="year" value="${escapeHtml(photo.year || "")}" pattern="(19|20)[0-9]{2}">
          </label>
          <label class="field">
            <span>\uAD8C\uC5ED</span>
            <select name="region">${renderRegionOptions(photo.region)}</select>
          </label>
          <label class="field field-wide">
            <span>\uC124\uBA85</span>
            <textarea name="description" rows="3" maxlength="1000">${escapeHtml(photo.description || "")}</textarea>
          </label>
          <label class="field">
            <span>\uC774\uBBF8\uC9C0 \uAD50\uCCB4</span>
            <input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/gif">
          </label>
          <details class="advanced-fields field-wide">
            <summary>고급 위치 정보</summary>
            <div class="advanced-fields-grid">
              <label class="field">
                <span>placeId</span>
                <input type="text" name="placeId" value="${escapeHtml(photo.placeId || "")}">
              </label>
              <label class="field">
                <span>위도</span>
                <input type="number" name="lat" value="${photo.lat ?? ""}" step="any" min="-90" max="90">
              </label>
              <label class="field">
                <span>경도</span>
                <input type="number" name="lng" value="${photo.lng ?? ""}" step="any" min="-180" max="180">
              </label>
            </div>
          </details>
        </div>
        <div class="photo-card-actions">
          <button class="primary-button" type="submit">\uBCC0\uACBD \uC800\uC7A5</button>
          <button class="danger-button" type="button" data-delete-id="${photo.id}">\uC0AD\uC81C</button>
        </div>
      </form>
      </div>
    </article>
  `;
}

function bindPhotoEditorEvents() {
  document.querySelectorAll("[data-update-form]").forEach((form) => {
    dirtyTracker.bind(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const photoId = form.dataset.updateForm;

      try {
        const { formData, optimized } = await buildPhotoFormData(form, { requireImage: false });
        await requestJson(`/api/admin/photos/${photoId}/update`, {
          method: "POST",
          body: formData,
        });
        showSavedToast(
          optimized
            ? "\uC774\uBBF8\uC9C0\uB97C \uCD5C\uC801\uD654\uD574 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4."
            : "\uC0AC\uC9C4 \uC815\uBCF4\uB97C \uC218\uC815\uD588\uC2B5\uB2C8\uB2E4.",
        );
        await loadAdminPhotos();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });

  document.querySelectorAll("[data-editor-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".photo-card");
      const body = card?.querySelector("[data-editor-body]");
      if (!card || !body) {
        return;
      }
      const shouldExpand = body.hidden;
      body.hidden = !shouldExpand;
      button.setAttribute("aria-expanded", String(shouldExpand));
      button.textContent = shouldExpand ? "접기" : "수정";
      if (shouldExpand) {
        body.querySelector("input, select, textarea")?.focus();
      }
    });
  });

  document.querySelectorAll("[data-delete-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = window.confirm("\uC774 \uC0AC\uC9C4\uC744 \uC804\uC2DC\uC5D0\uC11C \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?");
      if (!confirmed) {
        return;
      }

      try {
        await requestJson(`/api/admin/photos/${button.dataset.deleteId}`, {
          method: "DELETE",
        });
        showSavedToast("\uC0AC\uC9C4\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.");
        await loadAdminPhotos();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

function applyPhotoSearch() {
  const matchedIds = new Set(
    filterAdminPhotos(currentPhotos, photoSearch?.value).map((photo) => String(photo.id)),
  );
  photoList.querySelectorAll(".photo-card").forEach((card) => {
    card.hidden = !matchedIds.has(card.dataset.photoId);
  });

  if (photoCount) {
    const query = photoSearch?.value.trim();
    photoCount.textContent = query
      ? `${matchedIds.size}/${currentPhotos.length}개 표시`
      : `전체 ${currentPhotos.length}개`;
  }
}

function setAllEditorsExpanded(expanded) {
  allEditorsExpanded = expanded;
  photoList.querySelectorAll("[data-editor-body]").forEach((body) => {
    body.hidden = !expanded;
  });
  photoList.querySelectorAll("[data-editor-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = expanded ? "접기" : "수정";
  });
  if (toggleAllButton) {
    toggleAllButton.textContent = expanded ? "모두 접기" : "모두 펼치기";
    toggleAllButton.setAttribute("aria-expanded", String(expanded));
  }
}

function renderPhotoList() {
  dirtyTracker.reset();
  if (!currentPhotos.length) {
    photoList.innerHTML = '<p class="empty-admin-state">\uC544\uC9C1 \uCD9C\uD488\uB41C \uC0AC\uC9C4\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>';
    if (photoCount) {
      photoCount.textContent = "전체 0개";
    }
    return;
  }

  photoList.innerHTML = currentPhotos.map(renderAdminPhoto).join("");
  bindPhotoEditorEvents();
  setAllEditorsExpanded(allEditorsExpanded);
  applyPhotoSearch();
}

async function loadAdminPhotos() {
  const payload = await requestJson("/api/admin/photos");
  currentPhotos = [...payload.photos].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();
    return leftTime - rightTime || left.id - right.id;
  });
  sessionUsername.textContent = payload.username;
  renderPhotoList();
}

async function handleLogin(event) {
  event.preventDefault();

  const formData = new FormData(loginForm);
  try {
    await requestJson("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password"),
      }),
    });
    showToast("\uB85C\uADF8\uC778\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    await initializeAdmin();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleUpload(event) {
  event.preventDefault();

  try {
    const { formData, optimized } = await buildPhotoFormData(uploadForm, { requireImage: true });
    await requestJson("/api/admin/photos", {
      method: "POST",
      body: formData,
    });
    uploadForm.reset();
    showSavedToast(
      optimized
        ? "\uC774\uBBF8\uC9C0\uB97C \uCD5C\uC801\uD654\uD574 \uCD9C\uD488\uD588\uC2B5\uB2C8\uB2E4."
        : "\uC0AC\uC9C4\uC744 \uCD9C\uD488\uD588\uC2B5\uB2C8\uB2E4.",
    );
    await loadAdminPhotos();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handlePasswordChange(event) {
  event.preventDefault();

  const formData = new FormData(passwordForm);
  const currentPassword = String(formData.get("current_password") || "");
  const newPassword = String(formData.get("new_password") || "");
  const confirmPassword = String(formData.get("confirm_password") || "");

  if (newPassword !== confirmPassword) {
    showToast("\uC0C8 \uBE44\uBC00\uBC88\uD638\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.", true);
    return;
  }

  try {
    await requestJson("/api/admin/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
    });
    passwordForm.reset();
    showToast("\uBE44\uBC00\uBC88\uD638\uB97C \uBCC0\uACBD\uD588\uC2B5\uB2C8\uB2E4.");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function handleLogout() {
  try {
    await requestJson("/api/admin/logout", { method: "POST" });
    showToast("\uB85C\uADF8\uC544\uC6C3\uD588\uC2B5\uB2C8\uB2E4.");
    await initializeAdmin();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function initializeAdmin() {
  try {
    const payload = await requestJson("/api/admin/session");
    setupNote.hidden = payload.hasAdmin;

    if (!payload.hasAdmin) {
      loginPanel.hidden = true;
      managerPanel.hidden = true;
      return;
    }

    if (!payload.authenticated) {
      loginPanel.hidden = false;
      managerPanel.hidden = true;
      return;
    }

    loginPanel.hidden = true;
    managerPanel.hidden = false;
    await loadAdminPhotos();
  } catch (error) {
    showToast(error.message, true);
  }
}

loginForm.addEventListener("submit", handleLogin);
uploadForm.addEventListener("submit", handleUpload);
passwordForm.addEventListener("submit", handlePasswordChange);
logoutButton.addEventListener("click", handleLogout);
photoSearch?.addEventListener("input", applyPhotoSearch);
toggleAllButton?.addEventListener("click", () => setAllEditorsExpanded(!allEditorsExpanded));

initializeAdmin();
