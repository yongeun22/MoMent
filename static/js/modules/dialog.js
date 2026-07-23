const activeOverlays = new Set();

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isVisible(element) {
  return Boolean(element && !element.hidden && element.getClientRects().length);
}

function focusableElements(panel) {
  return [...panel.querySelectorAll(FOCUSABLE_SELECTOR)].filter(isVisible);
}

function syncBackgroundInert() {
  const hasDialog = activeOverlays.size > 0;
  [...document.body.children].forEach((element) => {
    if (["SCRIPT", "STYLE"].includes(element.tagName)) {
      return;
    }
    const isActiveOverlay = activeOverlays.has(element);
    element.inert = hasDialog && !isActiveOverlay;
  });
}

function resolveInitialFocus(panel, initialFocus) {
  if (typeof initialFocus === "function") {
    return initialFocus();
  }
  if (typeof initialFocus === "string") {
    return panel.querySelector(initialFocus);
  }
  return initialFocus || focusableElements(panel)[0] || panel;
}

export function createDialogController({
  overlay,
  panel,
  trigger = null,
  bodyClass = "",
  transitionMs = 240,
  visibleClass = "is-visible",
  closingClass = "",
  initialFocus = null,
  closeOnBackdrop = true,
  onOpen = null,
  onClosing = null,
  onClosed = null,
}) {
  if (!overlay || !panel) {
    throw new Error("Dialog controller requires an overlay and panel.");
  }

  let closeTimeoutId = null;
  let returnFocus = null;

  function focusDialog() {
    window.requestAnimationFrame(() => {
      const target = resolveInitialFocus(panel, initialFocus);
      if (target === panel && !panel.hasAttribute("tabindex")) {
        panel.setAttribute("tabindex", "-1");
      }
      target?.focus({ preventScroll: true });
    });
  }

  function markActive(focusTarget = null) {
    window.clearTimeout(closeTimeoutId);
    returnFocus = focusTarget || document.activeElement || trigger;
    activeOverlays.add(overlay);
    syncBackgroundInert();
    if (bodyClass) {
      document.body.classList.add(bodyClass);
    }
    trigger?.setAttribute("aria-expanded", "true");
    focusDialog();
    onOpen?.();
  }

  function open({ returnFocus: focusTarget = null } = {}) {
    if (!overlay.hidden && activeOverlays.has(overlay)) {
      return;
    }
    overlay.hidden = false;
    if (closingClass) {
      overlay.classList.remove(closingClass);
    }
    markActive(focusTarget);
    if (visibleClass) {
      window.requestAnimationFrame(() => overlay.classList.add(visibleClass));
    }
  }

  function activateInitial() {
    if (overlay.hidden) {
      return;
    }
    markActive(null);
  }

  function close({ restoreFocus = true } = {}) {
    if (overlay.hidden || !activeOverlays.has(overlay)) {
      return;
    }
    if (visibleClass) {
      overlay.classList.remove(visibleClass);
    }
    if (closingClass) {
      overlay.classList.add(closingClass);
    }
    if (bodyClass) {
      document.body.classList.remove(bodyClass);
    }
    trigger?.setAttribute("aria-expanded", "false");
    activeOverlays.delete(overlay);
    syncBackgroundInert();
    overlay.inert = true;
    onClosing?.();
    window.clearTimeout(closeTimeoutId);
    closeTimeoutId = window.setTimeout(() => {
      overlay.hidden = true;
      if (closingClass) {
        overlay.classList.remove(closingClass);
      }
      syncBackgroundInert();
      onClosed?.();
      if (restoreFocus && activeOverlays.size === 0 && isVisible(returnFocus)) {
        returnFocus.focus({ preventScroll: true });
      }
      returnFocus = null;
    }, transitionMs);
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = focusableElements(panel);
    if (!focusable.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  overlay.addEventListener("keydown", handleKeydown);
  if (closeOnBackdrop) {
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close();
      }
    });
  }

  return {
    open,
    close,
    activateInitial,
    isOpen: () => activeOverlays.has(overlay) && !overlay.hidden,
  };
}
