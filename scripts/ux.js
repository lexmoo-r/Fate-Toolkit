const MODULE_ID = "fate-aspect-widget";

function notifications() {
  return ui?.notifications ?? null;
}

function notify(level, message, { permanent = false, consoleError = null } = {}) {
  const text = String(message ?? "").trim();
  if (!text) return null;
  const api = notifications();
  const fn = level === "error" ? "error" : level === "warn" ? "warn" : "info";
  if (consoleError) console.error(`${MODULE_ID} | ${text}`, consoleError);
  return api?.[fn]?.(text, { permanent });
}

async function confirm(options = {}) {
  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.confirm) return false;
  const title = options.title ?? options.window?.title ?? "";
  const classes = options.classes ?? (options.danger ? ["faw-confirm-danger"] : ["faw-confirm"]);
  const body = String(options.content ?? "");
  const confirmTone = options.danger ? " is-danger" : "";
  const normalized = {
    ...options,
    window: { ...(options.window ?? {}), title: String(title) },
    content: `<div class="faw-toolkit-confirm${confirmTone}">${body}</div>`,
    modal: options.modal ?? true,
    rejectClose: options.rejectClose ?? false,
    classes
  };
  delete normalized.title;
  delete normalized.danger;
  return DialogV2.confirm(normalized);
}

function report(error, fallback, { permanent = false } = {}) {
  const message = error?.message || fallback || "Неизвестная ошибка.";
  return notify("error", message, { permanent, consoleError: error });
}

function closeOpenMenus(root = document) {
  root?.querySelectorAll?.("details.faw-context-menu[open]")?.forEach(menu => { menu.open = false; });
}

function bindContextMenus(root) {
  if (!root || root.dataset?.fawContextBound === "true") return;
  if (root.dataset) root.dataset.fawContextBound = "true";
  root.addEventListener("click", event => {
    const menu = event.target?.closest?.("details.faw-context-menu");
    if (menu) {
      root.querySelectorAll("details.faw-context-menu[open]").forEach(other => {
        if (other !== menu) other.open = false;
      });
      return;
    }
    closeOpenMenus(root);
  });
}

globalThis.FateToolkitUX = Object.freeze({
  notify,
  info: (message, options) => notify("info", message, options),
  warn: (message, options) => notify("warn", message, options),
  error: (message, options) => notify("error", message, options),
  report,
  confirm,
  bindContextMenus,
  closeOpenMenus
});
