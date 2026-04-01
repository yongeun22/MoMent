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

const MAX_IMAGE_DIMENSION = 2400;
const OPTIMIZE_THRESHOLD_BYTES = 4 * 1024 * 1024;

let currentPhotos = [];

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

  ["date", "location", "photographer"].forEach((fieldName) => {
    formData.append(fieldName, form.elements[fieldName].value);
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

function renderAdminPhoto(photo) {
  return `
    <article class="photo-card" data-photo-id="${photo.id}">
      <img class="photo-preview" src="${photo.imageUrl}" alt="${escapeHtml(photo.location)}, ${escapeHtml(photo.date)}">
      <form class="photo-editor" data-update-form="${photo.id}">
        <div class="photo-editor-topbar">
          <div class="editor-filename">${escapeHtml(photo.originalName)}</div>
        </div>
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
            <span>\uCD2C\uC601\uC790</span>
            <input type="text" name="photographer" value="${escapeHtml(photo.photographer)}" required>
          </label>
          <label class="field">
            <span>\uC774\uBBF8\uC9C0 \uAD50\uCCB4</span>
            <input type="file" name="photo" accept="image/jpeg,image/png,image/webp,image/gif">
          </label>
        </div>
        <div class="photo-card-actions">
          <button class="primary-button" type="submit">\uBCC0\uACBD \uC800\uC7A5</button>
          <button class="danger-button" type="button" data-delete-id="${photo.id}">\uC0AD\uC81C</button>
        </div>
      </form>
    </article>
  `;
}

function bindPhotoEditorEvents() {
  document.querySelectorAll("[data-update-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const photoId = form.dataset.updateForm;

      try {
        const { formData, optimized } = await buildPhotoFormData(form, { requireImage: false });
        await requestJson(`/api/admin/photos/${photoId}/update`, {
          method: "POST",
          body: formData,
        });
        showToast(
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
        showToast("\uC0AC\uC9C4\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.");
        await loadAdminPhotos();
      } catch (error) {
        showToast(error.message, true);
      }
    });
  });
}

function renderPhotoList() {
  if (!currentPhotos.length) {
    photoList.innerHTML = '<p class="empty-admin-state">\uC544\uC9C1 \uCD9C\uD488\uB41C \uC0AC\uC9C4\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>';
    return;
  }

  photoList.innerHTML = currentPhotos.map(renderAdminPhoto).join("");
  bindPhotoEditorEvents();
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
    showToast(
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

initializeAdmin();
