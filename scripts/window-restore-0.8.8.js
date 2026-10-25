const MODULE_ID = "fate-aspect-widget";
const INSTALL_KEY = "__fawWindowRestore088";

// This compatibility layer is deliberately isolated from Fate Toolkit's own windows.
// It only handles a restore gesture which STARTED while a foreign Foundry/Fate window
// was already minimized. Normal minimization is left entirely to Foundry.

const OWN_WINDOW_SELECTOR = [
  ".fate-aspect-widget",
  ".fate-action-widget",
  ".frr-request-app",
  ".frr-player-requests-app",
  ".frr-sound-settings-app"
].join(",");

const gestureState = new WeakMap();
const normalPositions = new WeakMap();

function appElement(app) {
  try {
    const el = app?.element;
    if (el instanceof HTMLElement) return el;
    if (el?.[0] instanceof HTMLElement) return el[0];
  } catch (_) {}
  return null;
}

function isOwnApp(app) {
  const el = appElement(app);
  return Boolean(el?.matches?.(OWN_WINDOW_SELECTOR));
}

function findApplicationForHeader(header) {
  const instances = foundry?.applications?.instances;
  if (instances?.values instanceof Function) {
    for (const app of instances.values()) {
      try {
        if (app?.window?.header === header) return app;
      } catch (_) {}
    }
  }

  // Some system/legacy windows may still use ApplicationV1.
  for (const app of Object.values(globalThis.ui?.windows ?? {})) {
    const el = appElement(app);
    if (el?.querySelector?.(".window-header") === header) return app;
  }
  return null;
}

function contentElement(app, header) {
  try {
    if (app?.window?.content instanceof HTMLElement) return app.window.content;
  } catch (_) {}
  return appElement(app)?.querySelector?.(".window-content")
    ?? header?.parentElement?.querySelector?.(".window-content")
    ?? null;
}

function visuallyCollapsed(app, header) {
  const frame = appElement(app) ?? header?.parentElement;
  const content = contentElement(app, header);
  if (!frame || !content) return false;

  const contentStyle = getComputedStyle(content);
  const headerHeight = Math.max(1, header?.getBoundingClientRect?.().height ?? 30);
  const frameHeight = frame.getBoundingClientRect?.().height ?? Number.POSITIVE_INFINITY;

  return contentStyle.display === "none"
    || contentStyle.visibility === "hidden"
    || frameHeight <= headerHeight + 8;
}

function appReportsMinimized(app) {
  try {
    if (typeof app?.minimized === "boolean") return app.minimized;
  } catch (_) {}
  if (typeof app?._minimized === "boolean") return app._minimized;
  return false;
}

function isCollapsed(app, header) {
  return appReportsMinimized(app) || visuallyCollapsed(app, header);
}

function rememberNormalPosition(app) {
  const p = app?.position;
  if (!p) return;
  const saved = {};
  for (const key of ["left", "top", "width", "height"]) {
    const value = Number(p[key]);
    if (Number.isFinite(value)) saved[key] = value;
  }
  if (Object.keys(saved).length) normalPositions.set(app, saved);
}

async function forceVisualRestore(app, header) {
  const frame = appElement(app) ?? header?.parentElement;
  const content = contentElement(app, header);

  frame?.classList?.remove("minimized");
  if (content) {
    for (const prop of ["display", "visibility", "height", "max-height", "opacity"]) {
      content.style.removeProperty(prop);
    }
  }
  if (frame) {
    for (const prop of ["height", "max-height", "min-height"]) frame.style.removeProperty(prop);
  }

  const saved = normalPositions.get(app);
  if (saved && typeof app?.setPosition === "function") {
    try { app.setPosition(saved); } catch (_) {}
  }

  // ApplicationV1 exposes its minimization bit. Only touch it as a final legacy fallback.
  if (typeof app?._minimized === "boolean") app._minimized = false;

  try { app?.bringToFront?.(); } catch (_) {}
}

async function restoreApplication(app, header) {
  // If an old 0.8.6 listener already expanded the window on the first click of this
  // double-click, do not run Foundry's second (minimize) half again. Just keep it open.
  if (!isCollapsed(app, header)) {
    try { app?.bringToFront?.(); } catch (_) {}
    return;
  }

  if (typeof app?.maximize === "function") {
    try { await app.maximize(); } catch (err) {
      console.warn(`${MODULE_ID} | Native maximize failed; applying visual fallback`, err);
    }
  }

  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  if (isCollapsed(app, header)) await forceVisualRestore(app, header);
}

function installRestoreCompatibility() {
  if (globalThis[INSTALL_KEY]) return;
  globalThis[INSTALL_KEY] = true;

  document.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("button,a,input,select,textarea,[data-action]")) return;

    const header = target.closest(".window-header");
    if (!header) return;
    const app = findApplicationForHeader(header);
    if (!app || isOwnApp(app)) return;

    const now = performance.now();
    const prior = gestureState.get(header);
    // Do not overwrite the state on the second pointerdown of the same double-click.
    if (!prior || now - prior.startedAt > 650) {
      const startedCollapsed = isCollapsed(app, header);
      gestureState.set(header, { startedAt: now, startedCollapsed, app });
      if (!startedCollapsed) rememberNormalPosition(app);
    }
  }, true);

  document.addEventListener("dblclick", event => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("button,a,input,select,textarea,[data-action]")) return;

    const header = target.closest(".window-header");
    if (!header) return;
    const app = findApplicationForHeader(header);
    if (!app || isOwnApp(app)) return;

    const gesture = gestureState.get(header);
    const startedCollapsed = Boolean(
      gesture
      && gesture.app === app
      && performance.now() - gesture.startedAt <= 900
      && gesture.startedCollapsed
    );

    // Only replace the broken RESTORE half of the native toggle.
    // If the gesture began expanded, Foundry still performs its normal minimization.
    if (!startedCollapsed && !isCollapsed(app, header)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void restoreApplication(app, header);
  }, true);

  console.info(`${MODULE_ID} | Installed isolated foreign-window restore compatibility (0.8.8)`);
}

Hooks.once("ready", installRestoreCompatibility);
