export function filterAdminPhotos(photos, query) {
  const normalized = String(query || "").trim().toLocaleLowerCase("ko-KR");
  if (!normalized) {
    return photos;
  }
  return photos.filter((photo) => [
    photo.originalName,
    photo.date,
    photo.location,
    photo.locationName,
    photo.photographer,
    photo.year,
    photo.region,
  ].some((value) => String(value || "").toLocaleLowerCase("ko-KR").includes(normalized)));
}

export function createDirtyTracker({ statusElement, onChange = null }) {
  const dirtyForms = new Set();

  function sync() {
    const count = dirtyForms.size;
    if (statusElement) {
      statusElement.textContent = count ? `저장되지 않은 사진 ${count}개` : "저장되지 않은 변경 없음";
      statusElement.classList.toggle("is-dirty", count > 0);
    }
    onChange?.(count);
  }

  function mark(form) {
    dirtyForms.add(form);
    const card = form.closest(".photo-card");
    card?.classList.add("is-dirty");
    card?.querySelector("[data-unsaved-indicator]")?.removeAttribute("hidden");
    sync();
  }

  function bind(form) {
    ["input", "change"].forEach((eventName) => {
      form.addEventListener(eventName, () => mark(form));
    });
  }

  function reset() {
    dirtyForms.clear();
    sync();
  }

  window.addEventListener("beforeunload", (event) => {
    if (!dirtyForms.size) {
      return;
    }
    event.preventDefault();
    event.returnValue = "";
  });

  sync();
  return { bind, reset, count: () => dirtyForms.size };
}

export function bindPublishChecklist(container, statusElement) {
  if (!container) {
    return;
  }
  const checkboxes = [...container.querySelectorAll("input[type='checkbox']")];
  const sync = () => {
    const completed = checkboxes.filter((checkbox) => checkbox.checked).length;
    if (statusElement) {
      statusElement.textContent = `${completed}/${checkboxes.length}단계 확인`;
    }
  };
  checkboxes.forEach((checkbox) => checkbox.addEventListener("change", sync));
  sync();
}
